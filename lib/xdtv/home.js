'use strict';

/*
 * XDTV — ściana obrazków, LIVE, KLIPY: dane i budowanie stron statycznych.
 *
 * Strony (static/html): index.html (Najnowsze), popularne.html, dzis.html,
 * live.html, clips.html. Budowane razem w zadaniu buildHomepage, więc każdy
 * dotychczasowy wyzwalacz przebudowy strony głównej odświeża wszystkie.
 *
 * Odświeżanie:
 *  - po nowym poście / reakcji najwyżej raz na minutę (jobId w Bull),
 *  - po usunięciu / spoilerze od razu (moderacja).
 *
 * Ściana pokazuje WĄTKI (posty otwierające); odpowiedzi to komentarze.
 */

const Mongo = require(__dirname+'/../../db/db.js')
	, { Posts, Boards } = require(__dirname+'/../../db/')
	, buildQueue = require(__dirname+'/../build/queue.js');

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
};

const threadLink = (post) => `/${post.board}/thread/${post.thread || post.postId}.html#${post.postId}`;

// Pierwszy plik, który da się pokazać jako miniaturę (bez spoilerów).
const previewFile = (post) => {
	if (post.spoiler || !post.files) {
		return null;
	}
	return post.files.find(f => !f.spoiler && !f.attachment && (f.hasThumb || f.mimetype.startsWith('image/'))) || null;
};

// Proporcje kafelka: z wymiarów miniatury, przycięte do rozsądnego zakresu,
// żeby bardzo wysokie screeny nie robiły z rzędu wąskiego paska.
const tileRatio = (file) => {
	const g = file.geometry || {};
	const w = g.thumbwidth || g.width;
	const h = g.thumbheight || g.height;
	if (!w || !h) {
		return 1;
	}
	return Math.min(2, Math.max(0.65, w / h));
};

const reactionTotal = (post) => Object.values(post.xdtvReactions || {}).reduce((a, b) => a + (b > 0 ? b : 0), 0);

// Dwie najczęstsze reakcje do pokazania pod kafelkiem.
const topReactions = (post) => Object.entries(post.xdtvReactions || {})
	.filter(([, n]) => n > 0)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 2);

const toItem = (post) => {
	const file = previewFile(post);
	return file ? {
		post,
		file,
		link: threadLink(post),
		ratio: tileRatio(file),
		reactions: topReactions(post),
		reactionTotal: reactionTotal(post),
		replies: post.replyposts || 0,
	} : null;
};

// Popularność: reakcje + komentarze (komentarz waży więcej), wygaszane z wiekiem.
const popularity = (post, now) => {
	const ageHours = Math.max(0, (now - new Date(post.date).getTime()) / HOUR);
	return (reactionTotal(post) + 3 * (post.replyposts || 0) + 1) / Math.pow(ageHours + 2, 1.4);
};

const listedThreadsWithImages = async (extra = {}, sort = { 'date': -1 }, limit = 60) => {
	const listed = await Boards.getLocalListed();
	return Posts.db.find({
		'board': { '$in': listed },
		'thread': null,
		'files.0': { '$exists': true },
		'spoiler': { '$ne': true },
		...extra,
	}, { 'projection': POST_PROJECTION }).sort(sort).limit(limit).toArray();
};

const wallLatest = async (limit = 60) => {
	const posts = await listedThreadsWithImages({}, { 'date': -1 }, limit + 20);
	return posts.map(toItem).filter(Boolean).slice(0, limit);
};

const wallPopular = async (sinceMs, limit = 60) => {
	const now = Date.now();
	const posts = await listedThreadsWithImages({ 'date': { '$gte': new Date(now - sinceMs) } }, { 'date': -1 }, 500);
	return posts
		.map(p => ({ p, score: popularity(p, now) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit + 20)
		.map(({ p }) => toItem(p))
		.filter(Boolean)
		.slice(0, limit);
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

module.exports = {

	threadLink,

	previewFile,

	/*
	 * Buduje wszystkie strony ściany. `render` = lib/build/render.js.
	 * Zwraca HTML strony głównej (tego oczekuje buildHomepage).
	 */
	buildPages: async (render) => {
		const [ latest, popular, today, live, clips ] = await Promise.all([
			wallLatest(60),
			wallPopular(7 * 24 * HOUR, 60),
			wallPopular(24 * HOUR, 60),
			liveNow(24),
			latestClips(24),
		]);
		const sidebar = {
			sideLive: live.slice(0, 5),
			sidePopular: popular.slice(0, 6),
			sideClips: clips.slice(0, 4),
		};
		const pages = [
			['popularne.html', 'xdtv-wall.pug', { wallTab: 'popularne', wallTitle: 'Popularne', wallItems: popular, featured: popular.slice(0, 5) }],
			['dzis.html', 'xdtv-wall.pug', { wallTab: 'dzis', wallTitle: 'Dziś', wallItems: today, featured: today.slice(0, 5) }],
			['live.html', 'xdtv-live.pug', { wallTab: 'live', liveItems: live }],
			['clips.html', 'xdtv-clips.pug', { wallTab: 'clips', clipItems: clips }],
		];
		for (const [name, tpl, data] of pages) {
			await render(name, tpl, { ...sidebar, ...data });
		}
		// Najnowsze: wyróżnione = 5 najpopularniejszych z ostatniej doby (gdy brak — z tygodnia)
		const featured = (today.length >= 5 ? today : popular).slice(0, 5);
		const { html } = await render('index.html', 'xdtv-wall.pug', {
			...sidebar, wallTab: 'najnowsze', wallTitle: 'Najnowsze', wallItems: latest, featured,
			liveStrip: live.slice(0, 8), clipStrip: clips.slice(0, 8),
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
