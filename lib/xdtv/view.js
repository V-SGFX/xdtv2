'use strict';

/*
 * XDTV — wspólne pomocniki widoku: kafelek ściany, adres posta, czas, reakcje.
 * Używane przez budowanie stron (lib/xdtv/home.js), fragmenty (controllers/xdtv.js)
 * i szablony (dostępne jako `xdtv` w lokalnych zmiennych pug).
 */

// Reakcje widoczne w UI (kolejność = kolejność przycisków). Głosy na dawne
// 🔥 i 🤡 zostają w bazie, ale nie są pokazywane ani przyjmowane.
const KINDS = { serce: '♡', smiech: '😂', czaszka: '💀' };

// Kanały: nazwa w UI zamiast technicznego /board/
const CHANNELS = {
	smietnik: 'Śmietnik',
	memy: 'Memy',
	gify: 'GIF-y',
	screeny: 'Screeny',
	stream: 'Stream',
	leaked: 'Leaked',
};
const channelName = (board) => CHANNELS[board] || board;

// Adres posta: /memy/post/123 (komentarz: /memy/post/123#456)
const postLink = (post) => {
	const thread = post.thread || post.postId;
	return `/${post.board}/post/${thread}${post.thread ? `#${post.postId}` : ''}`;
};

const previewFile = (post) => {
	if (post.spoiler || !post.files) {
		return null;
	}
	return post.files.find(f => !f.spoiler && !f.attachment && (f.hasThumb || f.mimetype.startsWith('image/'))) || null;
};

// Proporcje kafelka z miniatury, przycięte (bardzo wysokie screeny nie robią z rzędu paska).
const tileRatio = (file) => {
	const g = file.geometry || {};
	const w = g.thumbwidth || g.width;
	const h = g.thumbheight || g.height;
	if (!w || !h) {
		return 1;
	}
	return Math.min(2, Math.max(0.65, w / h));
};

const reactionCounts = (post) => Object.fromEntries(Object.keys(KINDS).map(k => [k, Math.max(0, (post.xdtvReactions || {})[k] || 0)]));
const reactionTotal = (post) => Object.values(reactionCounts(post)).reduce((a, b) => a + b, 0);
const topReactions = (post) => Object.entries(reactionCounts(post))
	.filter(([, n]) => n > 0)
	.sort((a, b) => b[1] - a[1])
	.slice(0, 2);

// „5 min”, „2 h”, „3 dni” — krótko, jak metadane portalu
const timeAgo = (date) => {
	const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
	if (s < 60) { return 'teraz'; }
	if (s < 3600) { return `${Math.floor(s / 60)} min`; }
	if (s < 86400) { return `${Math.floor(s / 3600)} h`; }
	const d = Math.floor(s / 86400);
	if (d < 30) { return `${d} ${d === 1 ? 'dzień' : 'dni'}`; }
	return new Date(date).toLocaleDateString('pl-PL');
};

const toItem = (post) => {
	const file = previewFile(post);
	return file ? {
		post,
		file,
		link: postLink(post),
		ratio: tileRatio(file),
		reactions: topReactions(post),
		reactionTotal: reactionTotal(post),
		replies: post.replyposts || 0,
		ago: timeAgo(post.date),
		channel: channelName(post.board),
	} : null;
};

const toItems = (posts) => posts.map(toItem).filter(Boolean);

module.exports = {
	KINDS,
	CHANNELS,
	channelName,
	postLink,
	previewFile,
	tileRatio,
	reactionCounts,
	reactionTotal,
	topReactions,
	timeAgo,
	toItem,
	toItems,
};
