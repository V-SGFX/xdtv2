'use strict';

/*
 * XDTV — trasy dodane do jschan.
 *  POST /forms/board/:board/react   (podpięte w controllers/forms.js)
 *  GET  /xdtv/reakcje.json?p=board:id,board:id
 *  GET  /xdtv/gif.json?q=tekst         (wyszukiwarka GIF dla composera, GIPHY)
 *  GET  /popularne.html, /dzis.html, /live.html, /clips.html — budowane na żądanie,
 *       gdy pliku nie ma (po restarcie jschan kasuje wygenerowane strony)
 */

const express = require('express')
	, router = express.Router()
	, geoIp = require(__dirname+'/../lib/middleware/ip/geoip.js')
	, processIp = require(__dirname+'/../lib/middleware/ip/processip.js')
	, reactions = require(__dirname+'/../lib/xdtv/reactions.js')
	, xdtvHome = require(__dirname+'/../lib/xdtv/home.js')
	, gifs = require(__dirname+'/../lib/xdtv/gifs.js')
	, path = require('path')
	, uploadDirectory = require(__dirname+'/../lib/file/uploaddirectory.js');

const BOARD_RE = /^[a-z0-9]{1,50}$/;

const reactController = async (req, res) => {
	const board = req.params.board;
	const postId = parseInt(req.body.postId, 10);
	const kind = String(req.body.kind || '');
	if (!BOARD_RE.test(board) || !Number.isSafeInteger(postId) || postId < 1) {
		return res.status(400).json({ error: 'Złe żądanie' });
	}
	try {
		const result = await reactions.toggle(board, postId, kind, res.locals.ip.cloak);
		if (result.error) {
			return res.status(result.error.startsWith('Za szybko') ? 429 : 400).json(result);
		}
		// liczniki na ścianie odświeżą się przy najbliższej przebudowie (≤ 1 min)
		xdtvHome.scheduleRebuild();
		return res.json(result);
	} catch (e) {
		console.error('[XDTV] reakcja:', e);
		return res.status(500).json({ error: 'Błąd serwera' });
	}
};

router.get('/xdtv/reakcje.json', geoIp, processIp, async (req, res) => {
	const refs = String(req.query.p || '')
		.split(',')
		.map(s => s.split(':'))
		.filter(([b, id]) => BOARD_RE.test(b || '') && /^\d{1,12}$/.test(id || ''))
		.map(([board, id]) => ({ board, postId: parseInt(id, 10) }));
	try {
		const data = await reactions.lookup(refs, res.locals.ip.cloak);
		res.set('Cache-Control', 'private, no-store');
		return res.json({ kinds: reactions.KINDS, posts: data });
	} catch (e) {
		console.error('[XDTV] reakcje.json:', e);
		return res.status(500).json({ error: 'Błąd serwera' });
	}
});

router.get('/xdtv/gif.json', geoIp, processIp, async (req, res) => {
	const q = String(req.query.q || '').trim().slice(0, 60);
	try {
		const result = await gifs.search(q, res.locals.ip.cloak);
		res.set('Cache-Control', 'private, max-age=60');
		return res.status(result.error ? (result.status || 400) : 200).json(result);
	} catch (e) {
		console.error('[XDTV] gif.json:', e.message);
		return res.status(502).json({ error: 'Wyszukiwarka GIF chwilowo nie działa' });
	}
});

// Jedna przebudowa naraz, nawet gdy po restarcie wejdzie wielu ludzi jednocześnie
let building = null;
router.get('/:page(popularne|dzis|live|clips).html', async (req, res, next) => {
	try {
		building = building || require(__dirname+'/../lib/build/tasks.js').buildHomepage()
			.finally(() => { building = null; });
		await building;
		res.set('Cache-Control', 'max-age=0');
		return res.sendFile(path.join(uploadDirectory, 'html', `${req.params.page}.html`));
	} catch (e) {
		return next(e);
	}
});

module.exports = { router, reactController };
