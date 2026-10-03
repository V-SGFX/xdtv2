'use strict';

/*
 * XDTV — trasy dodane do jschan.
 *  POST /forms/board/:board/react   (podpięte w controllers/forms.js)
 *  GET  /xdtv/reakcje.json?p=board:id,board:id
 */

const express = require('express')
	, router = express.Router()
	, geoIp = require(__dirname+'/../lib/middleware/ip/geoip.js')
	, processIp = require(__dirname+'/../lib/middleware/ip/processip.js')
	, reactions = require(__dirname+'/../lib/xdtv/reactions.js')
	, xdtvHome = require(__dirname+'/../lib/xdtv/home.js');

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

module.exports = { router, reactController };
