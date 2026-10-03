'use strict';
/*
 * XDTV.FANS — TESTOWE reakcje, streamerzy LIVE i klipy (część test-content.sh).
 * Wszystko oznaczone `test: true` / głosujący „test-*”, usuwa test-cleanup.sh.
 */
const fs = require('fs')
	, path = require('path')
	, { execFileSync } = require('child_process')
	, Mongo = require(__dirname+'/../../db/db.js');

const refs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const IMG_DIR = '/opt/static/file/xdtv-test';      // serwowane przez nginx jako /file/xdtv-test/
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

const thumb = (name, label, color) => {
	fs.mkdirSync(IMG_DIR, { recursive: true });
	execFileSync('convert', ['-size', '640x360', `plasma:${color}`, '-font', FONT, '-pointsize', '40',
		'-fill', 'white', '-stroke', 'black', '-strokewidth', '2', '-gravity', 'center', '-annotate', '0', label,
		'-quality', '80', path.join(IMG_DIR, name)]);
	return `/file/xdtv-test/${name}`;
};

(async () => {
	await Mongo.connect();
	const reactions = require(__dirname+'/../../lib/xdtv/reactions.js');
	const kinds = Object.keys(reactions.KINDS);

	// Reakcje: wcześniejsze wątki dostają więcej, z przewagą jednej reakcji
	let total = 0;
	for (let i = 0; i < refs.length; i++) {
		const n = Math.max(0, Math.round((refs.length - i) * 1.4) - 8 + (i % 5));
		for (let v = 0; v < n; v++) {
			const kind = kinds[(v % 7 === 0) ? (i + v) % kinds.length : i % kinds.length];
			const r = await reactions.toggle(refs[i].board, refs[i].postId, kind, `test-${i}-${v}`);
			if (!r.error) {
				total++;
			}
		}
	}
	console.log(`reakcje testowe: ${total}`);

	// LIVE i KLIPY
	const creators = [
		['testowy-strojny', 'TestStrojny', 'kick', 'Tibia', 1842, 'TEST — wieczorne łowy'],
		['test-gamer', 'TestGamer', 'twitch', 'Just Chatting', 921, 'TEST — gadamy o niczym'],
		['test-kanal', 'TestKanał', 'youtube', 'GTA V', 610, 'TEST — RP od rana'],
		['testowa-ania', 'TestowaAnia', 'twitch', 'Minecraft', 433, 'TEST — budujemy zamek'],
		['test-xd', 'TestXD', 'kick', 'Counter-Strike 2', 287, 'TEST — rankedy'],
		['test-nocny', 'TestNocny', 'youtube', 'Muzyka', 95, 'TEST — lofi do nauki'],
	];
	const colors = ['#b91c1c-#252525', '#1d4ed8-#0f172a', '#047857-#064e3b', '#c2410c-#431407', '#6d28d9-#1e1b4b', '#334155-#0f172a'];
	const C = Mongo.db.collection('creators');
	for (let i = 0; i < creators.length; i++) {
		const [slug, name, platform, category, viewers, title] = creators[i];
		const url = platform === 'kick' ? `https://kick.com/${slug}` : platform === 'twitch' ? `https://twitch.tv/${slug}` : `https://youtube.com/@${slug}`;
		await C.updateOne({ _id: slug }, { '$set': {
			displayName: name, platform, platformUrl: url, isLive: i < 5, viewerCount: viewers,
			currentTitle: title, category, thumbnailUrl: thumb(`live-${i}.jpg`, `LIVE TEST ${i + 1}`, colors[i]),
			updatedAt: new Date(), test: true,
		} }, { upsert: true });
	}
	const K = Mongo.db.collection('clips');
	const clipTitles = ['TEST — niemożliwy headshot', 'TEST — czat oszalał', 'TEST — rage quit', 'TEST — najlepszy fail',
		'TEST — kot wszedł na klawiaturę', 'TEST — donejt życia', 'TEST — clutch 1v4', 'TEST — wpadka na żywo'];
	for (let i = 0; i < clipTitles.length; i++) {
		const [slug, name, platform] = creators[i % creators.length];
		await K.updateOne({ _id: `test-clip-${i}` }, { '$set': {
			title: clipTitles[i], creator: slug, creatorName: name, platform,
			url: `https://example.com/test-clip-${i}`, thumbnailUrl: thumb(`clip-${i}.jpg`, `KLIP TEST ${i + 1}`, colors[i % colors.length]),
			duration: 18 + i * 7, views: 1200 + i * 830, date: new Date(Date.now() - i * 3600 * 1000), test: true,
		} }, { upsert: true });
	}
	console.log(`streamerzy testowi: ${creators.length}, klipy testowe: ${clipTitles.length}`);

	require(__dirname+'/../../lib/build/queue.js').push({ task: 'buildHomepage' });
	setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error(e); process.exit(1); });
