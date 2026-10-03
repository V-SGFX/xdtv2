'use strict';

/*
 * XDTV — reakcje na posty: 😂 🔥 💀 🤡 ❤️.
 *
 * Jedna reakcja na osobę na post. Osobą jest zamaskowany adres IP
 * (res.locals.ip.cloak) — ten sam identyfikator, którym jschan banuje,
 * więc reakcji nie da się nabić bez zmiany IP. Kliknięcie tej samej
 * reakcji ją zdejmuje, innej — zamienia.
 *
 * Kolekcja `reactions`: _id = "board:postId:cloak" (unikalność bez
 * osobnego indeksu). Liczniki trzymamy na poście (`xdtvReactions`),
 * żeby ściana i wątek nie musiały ich zliczać przy każdym wyświetleniu.
 */

const Mongo = require(__dirname+'/../../db/db.js')
	, { Posts } = require(__dirname+'/../../db/')
	, redis = require(__dirname+'/../redis/redis.js');

const KINDS = {
	smiech: '😂',
	ogien: '🔥',
	czaszka: '💀',
	klaun: '🤡',
	serce: '❤️',
};

const RATE_LIMIT = 60; // reakcji na minutę z jednego IP

const collection = () => Mongo.db.collection('reactions');

const emptyCounts = () => Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]));

const voterKey = (board, postId, voter) => `${board}:${postId}:${voter}`;

module.exports = {

	KINDS,

	emptyCounts,

	/*
	 * Przełącza reakcję. Zwraca { counts, mine } albo { error }.
	 */
	toggle: async (board, postId, kind, voter) => {
		if (!KINDS[kind]) {
			return { error: 'Nieznana reakcja' };
		}
		const rateKey = `xdtv:react:${voter}`;
		const used = await redis.incr(rateKey);
		if (used === 1) {
			await redis.expire(rateKey, 60);
		}
		if (used > RATE_LIMIT) {
			return { error: 'Za szybko. Odczekaj chwilę.' };
		}
		const post = await Posts.db.findOne({ board, postId }, { projection: { _id: 1 } });
		if (!post) {
			return { error: 'Nie ma takiego posta' };
		}

		const _id = voterKey(board, postId, voter);
		const result = await collection().findOneAndUpdate(
			{ _id },
			{ '$set': { board, postId, kind, date: new Date() } },
			{ upsert: true, returnDocument: 'before' },
		);
		const before = result && Object.prototype.hasOwnProperty.call(result, 'value') ? result.value : result;

		const inc = {};
		let mine = kind;
		if (!before) {
			inc[`xdtvReactions.${kind}`] = 1;
		} else if (before.kind === kind) {
			// ta sama reakcja drugi raz = zdjęcie
			await collection().deleteOne({ _id });
			inc[`xdtvReactions.${kind}`] = -1;
			mine = null;
		} else {
			inc[`xdtvReactions.${before.kind}`] = -1;
			inc[`xdtvReactions.${kind}`] = 1;
		}
		const updated = await Posts.db.findOneAndUpdate(
			{ board, postId },
			{ '$inc': inc },
			{ returnDocument: 'after', projection: { xdtvReactions: 1 } },
		);
		const doc = updated && Object.prototype.hasOwnProperty.call(updated, 'value') ? updated.value : updated;
		return { counts: { ...emptyCounts(), ...(doc && doc.xdtvReactions) }, mine };
	},

	/*
	 * Liczniki i własna reakcja dla listy postów (ściana, wątek).
	 * `refs`: [{ board, postId }] — maksymalnie 200.
	 */
	lookup: async (refs, voter) => {
		refs = refs.slice(0, 200);
		if (refs.length === 0) {
			return {};
		}
		const posts = await Posts.db.find(
			{ '$or': refs.map(r => ({ board: r.board, postId: r.postId })) },
			{ projection: { _id: 0, board: 1, postId: 1, xdtvReactions: 1, replyposts: 1 } },
		).toArray();
		const mine = voter ? await collection().find(
			{ _id: { '$in': refs.map(r => voterKey(r.board, r.postId, voter)) } },
			{ projection: { board: 1, postId: 1, kind: 1 } },
		).toArray() : [];
		const out = {};
		for (const p of posts) {
			out[`${p.board}:${p.postId}`] = { counts: { ...emptyCounts(), ...p.xdtvReactions }, replies: p.replyposts || 0, mine: null };
		}
		for (const m of mine) {
			const key = `${m.board}:${m.postId}`;
			if (out[key]) {
				out[key].mine = m.kind;
			}
		}
		return out;
	},

};
