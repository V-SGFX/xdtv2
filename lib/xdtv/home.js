'use strict';

/*
 * XDTV — dane strony głównej i jej odświeżanie.
 *
 * Strona główna jschan to statyczny plik przebudowywany co godzinę. Dla
 * siatki najnowszych obrazków to za rzadko, a dla moderacji groźne:
 * usunięty obrazek wisiałby na głównej do pełnej godziny. Stąd:
 *  - po nowym poście przebudowa najwyżej raz na minutę (jobId w Bull
 *    sprawia, że kolejne posty w tym oknie nie dokładają zadań),
 *  - po usunięciu postów przebudowa od razu.
 */

const { Posts, Boards } = require(__dirname+'/../../db/')
	, buildQueue = require(__dirname+'/../build/queue.js');

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
};

const threadLink = (post) => `/${post.board}/thread/${post.thread || post.postId}.html#${post.postId}`;

// Pierwszy plik, który da się pokazać jako miniaturę (bez spoilerów).
const previewFile = (post) => {
	if (post.spoiler || !post.files) {
		return null;
	}
	return post.files.find(f => !f.spoiler && !f.attachment && (f.hasThumb || f.mimetype.startsWith('image/'))) || null;
};

module.exports = {

	threadLink,

	previewFile,

	// Najnowsze posty z obrazkiem ze wszystkich publicznych boardów.
	latestImages: async (limit = 24) => {
		const listed = await Boards.getLocalListed();
		const posts = await Posts.db.find({
			'board': { '$in': listed },
			'files.0': { '$exists': true },
			'spoiler': { '$ne': true },
		}, { 'projection': POST_PROJECTION }).sort({ '_id': -1 }).limit(limit * 2).toArray();
		return posts
			.map(post => ({ post, file: previewFile(post), link: threadLink(post) }))
			.filter(x => x.file)
			.slice(0, limit);
	},

	// Najnowsze wrzuty: wątki i odpowiedzi, z tekstem albo plikiem.
	latestPosts: async (limit = 15) => {
		const listed = await Boards.getLocalListed();
		const posts = await Posts.db.find({
			'board': { '$in': listed },
		}, { 'projection': POST_PROJECTION }).sort({ '_id': -1 }).limit(limit).toArray();
		return posts.map(post => ({ post, file: previewFile(post), link: threadLink(post) }));
	},

	scheduleRebuild: () => {
		buildQueue.push({ 'task': 'buildHomepage' }, { 'jobId': 'xdtv-homepage', 'delay': 60 * 1000 });
	},

	rebuildNow: () => {
		buildQueue.push({ 'task': 'buildHomepage' });
	},

};
