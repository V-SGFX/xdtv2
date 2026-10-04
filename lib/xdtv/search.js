'use strict';

/*
 * XDTV — wyszukiwarka: tekst postów i komentarzy + streamerzy i klipy.
 *
 * Indeks pełnotekstowy MongoDB na posts (temat + treść). Język „none” —
 * MongoDB nie ma polskiej odmiany, więc dopasowujemy słowa dosłownie
 * (bez stemmingu dla innego języka, który psułby polskie wyrazy).
 * Trafienie w komentarzu prowadzi do posta, pod którym jest komentarz.
 */

const Mongo = require(__dirname+'/../../db/db.js')
	, { Posts, Boards } = require(__dirname+'/../../db/')
	, view = require(__dirname+'/view.js');

let indexReady = null;
const ensureIndex = () => {
	indexReady = indexReady || Posts.db.createIndex(
		{ subject: 'text', nomarkup: 'text' },
		{ name: 'xdtv_text', default_language: 'none', weights: { subject: 3, nomarkup: 1 } },
	).catch(e => { indexReady = null; throw e; });
	return indexReady;
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {

	ensureIndex,

	search: async (q) => {
		q = String(q || '').trim().slice(0, 60);
		if (q.length < 2) {
			return { q, items: [], creators: [], clips: [] };
		}
		await ensureIndex();
		const listed = await Boards.getLocalListed();
		const hits = await Posts.db.find(
			{ '$text': { '$search': q }, board: { '$in': listed } },
			{ projection: { board: 1, postId: 1, thread: 1, score: { '$meta': 'textScore' } } },
		).sort({ score: { '$meta': 'textScore' } }).limit(200).toArray();

		// Komentarz → jego post; kolejność według najlepszego trafienia
		const seen = new Set();
		const refs = [];
		for (const h of hits) {
			const key = `${h.board}:${h.thread || h.postId}`;
			if (!seen.has(key)) {
				seen.add(key);
				refs.push({ board: h.board, postId: h.thread || h.postId });
			}
		}
		const threads = refs.length ? await Posts.db.find(
			{ '$or': refs.slice(0, 60).map(r => ({ board: r.board, postId: r.postId, thread: null })) },
		).toArray() : [];
		const order = new Map(refs.map((r, i) => [`${r.board}:${r.postId}`, i]));
		threads.sort((a, b) => order.get(`${a.board}:${a.postId}`) - order.get(`${b.board}:${b.postId}`));

		const re = new RegExp(escapeRegex(q), 'i');
		const [ creators, clips ] = await Promise.all([
			Mongo.db.collection('creators').find({ '$or': [{ displayName: re }, { category: re }, { currentTitle: re }] })
				.sort({ isLive: -1, viewerCount: -1 }).limit(12).toArray(),
			Mongo.db.collection('clips').find({ '$or': [{ title: re }, { creatorName: re }] })
				.sort({ date: -1 }).limit(12).toArray(),
		]);
		return { q, items: view.toItems(threads), creators, clips };
	},

};
