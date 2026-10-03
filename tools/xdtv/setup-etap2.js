'use strict';
/*
 * XDTV.FANS — etap 2: nazwa i adres serwisu, motywy XDTV, „HOT” dla małego serwisu.
 * Idempotentne. Uruchomienie: docker compose exec app node tools/xdtv/setup-etap2.js
 * Adres serwisu z XDTV_SITE_URL (domyślnie https://nowe.xdtv.fans) — po podmianie
 * domeny wystarczy uruchomić ponownie z XDTV_SITE_URL=https://xdtv.fans.
 */
const Mongo = require(__dirname+'/../../db/db.js');

const SITE_URL = process.env.XDTV_SITE_URL || 'https://nowe.xdtv.fans';
const THEMES = ['xdtv', 'xdtv-jasny'];

(async () => {
	await Mongo.connect();
	const redis = require(__dirname+'/../../lib/redis/redis.js');
	const buildQueue = require(__dirname+'/../../lib/build/queue.js');

	const s = await Mongo.getConfig();
	s.meta = { ...s.meta, siteName: 'XDTV.FANS', url: SITE_URL };
	s.themes = THEMES; // tylko motywy XDTV w ustawieniach użytkownika
	s.boardDefaults.theme = 'xdtv';
	// Mały serwis: wątek jest „gorący” już od 3 odpowiedzi, na głównej do 8.
	s.hotThreadsThreshold = 3;
	s.hotThreadsLimit = 8;
	await Mongo.setConfig(s);
	redis.redisPublisher.publish('config', JSON.stringify(s));
	console.log(`ustawienia: siteName=XDTV.FANS url=${SITE_URL} motywy=${THEMES.join(',')}`);

	// Istniejące boardy na motyw XDTV (nowe dostaną go z boardDefaults)
	const r = await Mongo.db.collection('boards').updateMany(
		{ 'settings.theme': { '$nin': THEMES } },
		{ '$set': { 'settings.theme': 'xdtv' } },
	);
	console.log(`boardy przestawione na motyw xdtv: ${r.modifiedCount}`);
	await redis.deletePattern('board:*');

	buildQueue.push({ task: 'gulp', options: { tasks: ['deletehtml', 'css', 'scripts', 'custompages'] } });
	buildQueue.push({ task: 'buildGlobalSettings' });
	buildQueue.push({ task: 'buildHomepage' });
	setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error(e); process.exit(1); });
