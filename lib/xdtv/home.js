'use strict';

/*
 * XDTV — ściana obrazków, LIVE, KLIPY: dane i strony statyczne.
 *
 * Strony (static/html): index.html (Najnowsze), popularne.html, dzis.html,
 * live.html, clips.html — budowane razem w zadaniu buildHomepage.
 * Kolejne porcje ściany, panel boczny i „related” idą jako fragmenty
 * (controllers/xdtv.js) — strony nie trzeba przebudowywać przy każdym poście.
 *
 * Odświeżanie stron: po nowym poście / reakcji najwyżej raz na minutę
 * (jobId w Bull), po usunięciu / spoilerze od razu (moderacja).
 *
 * Ściana pokazuje WĄTKI (posty otwierające); odpowiedzi to komentarze.
 */

const Mongo = require(__dirname+'/../../db/db.js')
	, { Posts, Boards } = require(__dirname+'/../../db/')
	, buildQueue = require(__dirname+'/../build/queue.js')
	, view = require(__dirname+'/view.js');

const HOUR = 60 * 60 * 1000;

const POST_PROJECTION = {
	'_id': 0,
	'board': 1,
	'postId': 1,
	'thread': 1,
	'date': 1,
	'subject': 1,
	'nomarkup': 1,
	'spoiler': 1,
	'files': 1,
	'replyposts': 1,
	'xdtvReactions': 1,
	'name': 1,
};

// Popularność: reakcje + komentarze (komentarz waży więcej), wygaszane z wiekiem.
const popularity = (post, now) => {
	const ageHours = Math.max(0, (now - new Date(post.date).getTime()) / HOUR);
	return (view.reactionTotal(post) + 3 * (post.replyposts || 0) + 1) / Math.pow(ageHours + 2, 1.4);
};

const threadsWithImages = async (extra = {}, sort = { 'date': -1 }, limit = 60) => {
	const listed = await Boards.getLocalListed();
	return Posts.db.find({
		'board': { '$in': listed },
		'thread': null,
		'files.0': { '$exists': true },
		'spoiler': { '$ne': true },
		...extra,
	}, { 'projection': POST_PROJECTION }).sort(sort).limit(limit).toArray();
};

/*
 * Porcja ściany (najnowsze): opcjonalnie jeden kanał, kursor = data
 * ostatniego pokazanego wątku. Zwraca { items, next } (next = kursor albo null).
 */
const wallPage = async ({ board = null, before = null, limit = 30 } = {}) => {
	const extra = {};
	if (board) {
		extra.board = board;
	}
	if (before) {
		extra.date = { '$lt': new Date(before) };
	}
	const posts = await threadsWithImages(extra, { 'date': -1 }, limit + 1);
	const more = posts.length > limit;
	const page = posts.slice(0, limit);
	return {
		items: view.toItems(page),
		next: more && page.length ? new Date(page[page.length - 1].date).getTime() : null,
	};
};

const wallPopular = async (sinceMs, limit = 60, board = null) => {
	const now = Date.now();
	const extra = { 'date': { '$gte': new Date(now - sinceMs) } };
	if (board) {
		extra.board = board;
	}
	const posts = await threadsWithImages(extra, { 'date': -1 }, 500);
	return view.toItems(posts
		.map(p => ({ p, score: popularity(p, now) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit + 20)
		.map(({ p }) => p)).slice(0, limit);
};

// ── LIVE i KLIPY (kolekcje creators / clips; dane z Etapu 3, na razie testowe) ──

const liveNow = (limit = 24) => Mongo.db.collection('creators')
	.find({ 'isLive': true })
	.sort({ 'viewerCount': -1 })
	.limit(limit)
	.toArray();

const latestClips = (limit = 24) => Mongo.db.collection('clips')
	.find({})
	.sort({ 'date': -1 })
	.limit(limit)
	.toArray();

// Panel boczny (LIVE, popularne z doby — gdy mało, z tygodnia, KLIPY)
const sidebar = async () => {
	const [ live, popularDay, popularWeek, clips ] = await Promise.all([
		liveNow(5), wallPopular(24 * HOUR, 6), wallPopular(7 * 24 * HOUR, 6), latestClips(4),
	]);
	return {
		sideLive: live,
		sidePopular: popularDay.length >= 3 ? popularDay : popularWeek,
		sideClips: clips,
	};
};

/*
 * „Related” dla posta: sąsiad nowszy i starszy w kanale + więcej z kanału.
 */
const related = async (board, postId) => {
	const current = await Posts.db.findOne({ board, postId, thread: null }, { projection: { date: 1 } });
	if (!current) {
		return null;
	}
	const base = { board, thread: null, 'files.0': { '$exists': true }, spoiler: { '$ne': true } };
	const [ newer, older, more ] = await Promise.all([
		Posts.db.find({ ...base, date: { '$gt': current.date } }, { projection: POST_PROJECTION }).sort({ date: 1 }).limit(1).toArray(),
		Posts.db.find({ ...base, date: { '$lt': current.date } }, { projection: POST_PROJECTION }).sort({ date: -1 }).limit(1).toArray(),
		Posts.db.find({ ...base, postId: { '$ne': postId } }, { projection: POST_PROJECTION }).sort({ date: -1 }).limit(12).toArray(),
	]);
	return {
		newer: newer[0] ? view.toItem(newer[0]) : null,
		older: older[0] ? view.toItem(older[0]) : null,
		more: view.toItems(more),
		channel: view.channelName(board),
	};
};

module.exports = {

	wallPage,

	related,

	sidebar,

	// zgodność ze starszym kodem
	threadLink: view.postLink,
	previewFile: view.previewFile,

	/*
	 * Buduje strony ściany. `render` = lib/build/render.js.
	 * Zwraca HTML strony głównej (tego oczekuje buildHomepage).
	 */
	buildPages: async (render) => {
		const [ latest, popular, today, live, clips, side ] = await Promise.all([
			wallPage({ limit: 60 }),
			wallPopular(7 * 24 * HOUR, 60),
			wallPopular(24 * HOUR, 60),
			liveNow(24),
			latestClips(24),
			sidebar(),
		]);
		const pages = [
			['popularne.html', 'xdtv-wall.pug', { wallTab: 'popularne', wallTitle: 'Popularne', wallItems: popular, featured: popular.slice(0, 5) }],
			['dzis.html', 'xdtv-wall.pug', { wallTab: 'dzis', wallTitle: 'Dziś', wallItems: today, featured: today.slice(0, 5) }],
			['live.html', 'xdtv-live.pug', { wallTab: 'live', liveItems: live }],
			['clips.html', 'xdtv-clips.pug', { wallTab: 'clips', clipItems: clips }],
		];
		for (const [name, tpl, data] of pages) {
			await render(name, tpl, { ...side, ...data });
		}
		// Najnowsze: wyróżnione = najpopularniejsze z doby (gdy mało — z tygodnia)
		const featured = (today.length >= 5 ? today : popular).slice(0, 5);
		const { html } = await render('index.html', 'xdtv-wall.pug', {
			...side, wallTab: 'najnowsze', wallTitle: 'Najnowsze', wallItems: latest.items, wallNext: latest.next, featured,
		});
		return html;
	},

	scheduleRebuild: () => {
		buildQueue.push({ 'task': 'buildHomepage' }, { 'jobId': 'xdtv-homepage', 'delay': 60 * 1000 });
	},

	rebuildNow: () => {
		buildQueue.push({ 'task': 'buildHomepage' });
	},

};
