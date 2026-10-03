'use strict';
/*
 * XDTV.FANS — jednorazowa konfiguracja: ustawienia globalne i boardy.
 * Idempotentne: istniejące boardy aktualizuje (nazwa/opis), nie dubluje.
 * Uruchomienie: docker compose exec app node tools/xdtv/setup-boards.js
 */
process.env.NO_CAPTCHA = process.env.NO_CAPTCHA || '';
const Mongo = require(__dirname+'/../../db/db.js');

const BOARDS = [
	['smietnik', 'Śmietnik', 'Wszystko, co wygrzebał internet.'],
	['memy', 'Memy', 'Memy, śmieszne obrazki, screeny.'],
	['gify', 'GIF-y', 'GIF-y i krótkie wideo.'],
	['stream', 'Stream', "Streamerzy, klipy, akcje z live'ów."],
	['leaked', 'Leaked', 'Przecieki ze sceny i gier. Zakaz danych osobowych, doxxingu i intymnych zdjęć.'],
];

(async () => {
	await Mongo.connect();
	const redis = require(__dirname+'/../../lib/redis/redis.js');
	const config = require(__dirname+'/../../lib/misc/config.js');
	await config.load();
	const { Binary } = Mongo;
	const roleManager = require(__dirname+'/../../lib/permission/rolemanager.js');
	await roleManager.load();
	const buildQueue = require(__dirname+'/../../lib/build/queue.js');

	// ── Ustawienia globalne ──
	const s = await Mongo.getConfig();
	s.language = 'pl-PL';
	Object.assign(s.boardDefaults, {
		language: 'pl-PL',
		defaultName: 'Śmieciarz',
		captchaMode: 1, // captcha przy nowym wątku
	});
	s.boardDefaults.allowedFileTypes = { animatedImage: true, image: true, video: true, audio: false, other: false };
	await Mongo.setConfig(s);
	redis.redisPublisher.publish('config', JSON.stringify(s));
	console.log('ustawienia globalne: zapisane');

	// ── Boardy ──
	const boards = Mongo.db.collection('boards');
	for (const [uri, name, description] of BOARDS) {
		const exists = await boards.findOne({ _id: uri });
		if (exists) {
			await boards.updateOne({ _id: uri }, { $set: { 'settings.name': name, 'settings.description': description } });
			console.log(`/${uri}/: zaktualizowany`);
			continue;
		}
		await boards.insertOne({
			_id: uri, owner: 'admin', tags: [], banners: [], sequence_value: 1,
			pph: 0, ppd: 0, ips: 0, lastPostTimestamp: null, webring: false,
			staff: { admin: { permissions: Binary(roleManager.roles.BOARD_OWNER_DEFAULTS.array), addedDate: new Date() } },
			flags: {}, assets: [],
			settings: { name, description, ...s.boardDefaults },
		});
		await Mongo.db.collection('accounts').updateOne({ _id: 'admin' }, { $addToSet: { ownedBoards: uri } });
		console.log(`/${uri}/: założony`);
	}

	// Przebudowa: CSS/skrypty/strony + settings.json + strona główna
	buildQueue.push({ task: 'gulp', options: { tasks: ['deletehtml', 'css', 'scripts', 'custompages'] } });
	buildQueue.push({ task: 'buildGlobalSettings' });
	buildQueue.push({ task: 'buildHomepage' });
	setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error(e); process.exit(1); });
