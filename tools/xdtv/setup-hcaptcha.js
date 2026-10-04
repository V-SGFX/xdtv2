'use strict';
/*
 * XDTV.FANS — captcha: hCaptcha zamiast tekstowej captchy jschan.
 * Klucze: HCAPTCHA_SITEKEY / HCAPTCHA_SECRETKEY w deploy/.env (docker/jschan/secrets.js).
 * Powrót do tekstowej: XDTV_CAPTCHA=text node tools/xdtv/setup-hcaptcha.js
 */
const Mongo = require(__dirname+'/../../db/db.js');

const TYPE = process.env.XDTV_CAPTCHA || 'hcaptcha';

(async () => {
	if (TYPE === 'hcaptcha' && !(process.env.HCAPTCHA_SITEKEY && process.env.HCAPTCHA_SECRETKEY)) {
		throw new Error('Brak HCAPTCHA_SITEKEY / HCAPTCHA_SECRETKEY w deploy/.env');
	}
	await Mongo.connect();
	const redis = require(__dirname+'/../../lib/redis/redis.js');
	const buildQueue = require(__dirname+'/../../lib/build/queue.js');
	const s = await Mongo.getConfig();
	s.captchaOptions.type = TYPE;
	await Mongo.setConfig(s);
	redis.redisPublisher.publish('config', JSON.stringify(s));
	console.log(`captcha: ${TYPE}`);
	// typ captchy jest wkompilowany w CSS/JS i strony
	buildQueue.push({ task: 'gulp', options: { tasks: ['deletehtml', 'css', 'scripts', 'custompages'] } });
	buildQueue.push({ task: 'buildGlobalSettings' });
	buildQueue.push({ task: 'buildHomepage' });
	setTimeout(() => process.exit(0), 1500);
})().catch(e => { console.error(e.message); process.exit(1); });
