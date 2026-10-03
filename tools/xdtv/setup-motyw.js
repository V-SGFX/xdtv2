'use strict';
/*
 * XDTV.FANS — motyw „image wall / portal”: motywy, miniatury, ochrona formularzy.
 * Idempotentne. Uruchomienie: docker compose exec app node tools/xdtv/setup-motyw.js
 */
const Mongo = require(__dirname+'/../../db/db.js');

const THEMES = ['xdtv', 'xdtv-ciemny'];

(async () => {
	await Mongo.connect();
	const redis = require(__dirname+'/../../lib/redis/redis.js');
	const buildQueue = require(__dirname+'/../../lib/build/queue.js');

	const s = await Mongo.getConfig();
	s.themes = THEMES;
	s.boardDefaults.theme = 'xdtv';
	// Kafelki ściany mają ~200-340 px — miniatury 250 px byłyby rozmyte.
	s.thumbSize = 480;
	// Formularze (posty, reakcje, akcje) tylko z naszych domen — ochrona przed
	// wysyłaniem ich z obcych stron w imieniu zalogowanego moderatora.
	s.refererCheck = true;
	s.allowedHosts = ['nowe.xdtv.fans', 'xdtv.fans'];
	await Mongo.setConfig(s);
	redis.redisPublisher.publish('config', JSON.stringify(s));
	console.log(`ustawienia: motywy=${THEMES.join(',')} thumbSize=480 refererCheck=on hosts=${s.allowedHosts.join(',')}`);

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
