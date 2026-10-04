/* globals setLocalStorage */
/*
 * XDTV — okienko „+ WRZUĆ”, reakcje, komunikaty.
 * Dołączane do głównego pakietu jschan (gulp scripts: *.js).
 */
'use strict';

(() => {

	// ── Komunikat (toast) ──────────────────────────────────────────
	const toast = (text, kind) => {
		let box = document.getElementById('xdtv-toast');
		if (!box) {
			box = document.createElement('div');
			box.id = 'xdtv-toast';
			box.setAttribute('role', 'status');
			document.body.appendChild(box);
		}
		box.textContent = text;
		box.className = `xdtv-toast-show ${kind === 'error' ? 'xdtv-toast-error' : ''}`;
		clearTimeout(box._t);
		box._t = setTimeout(() => { box.className = ''; }, 2600);
	};

	// ── Okienko „+ WRZUĆ” ─────────────────────────────────────────
	// Pakiet JS ładuje się w <head> — elementy szukamy dopiero przy użyciu.
	const getModal = () => document.getElementById('xdtv-upload');

	const openUpload = (e) => {
		const modal = getModal();
		if (!modal) {
			return; // strona boardu — link prowadzi do formularza jschan (#postform)
		}
		e && e.preventDefault();
		modal.hidden = false;
		document.body.classList.add('xdtv-modal-open');
		const drop = modal.querySelector('.xdtv-drop');
		drop && drop.focus();
	};
	const closeUpload = () => {
		const modal = getModal();
		if (!modal) {
			return;
		}
		modal.hidden = true;
		document.body.classList.remove('xdtv-modal-open');
		if (location.hash === '#wrzuc') {
			history.replaceState(null, '', location.pathname + location.search);
		}
	};

	document.addEventListener('click', (e) => {
		const opener = e.target.closest('[data-xdtv-upload]');
		if (opener) {
			return openUpload(e);
		}
		if (e.target.closest('[data-xdtv-close]') || (getModal() && e.target === getModal())) {
			closeUpload();
		}
	});
	document.addEventListener('keydown', (e) => {
		const modal = getModal();
		if (e.key === 'Escape' && modal && !modal.hidden) {
			closeUpload();
		}
	});
	if (location.hash === '#wrzuc') {
		window.addEventListener('DOMContentLoaded', () => openUpload());
	}

	window.addEventListener('DOMContentLoaded', () => {
		const form = document.getElementById('xdtv-upload-form');
		if (!form) {
			return;
		}
		// Wybór kategorii = adres formularza
		form.querySelectorAll('.xdtv-chip').forEach(chip => {
			chip.addEventListener('click', () => {
				form.querySelectorAll('.xdtv-chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
				chip.setAttribute('aria-pressed', 'true');
				form.action = `/forms/board/${chip.dataset.board}/post`;
			});
		});
		// Po przekierowaniu na nowy post pokażemy „Opublikowane”
		form.addEventListener('submit', () => {
			try { sessionStorage.setItem('xdtvPosted', String(Date.now())); } catch (err) { /* prywatny tryb */ }
		});
	});

	// ── Reakcje ───────────────────────────────────────────────────
	let KINDS = { serce: '♡', smiech: '😂', czaszka: '💀' };

	const renderTileMeta = (el, data) => {
		const reacts = el.querySelector('.xdtv-tile-reacts');
		const comments = el.querySelector('.xdtv-tile-comments');
		if (reacts) {
			reacts.textContent = '';
			Object.entries(data.counts)
				.filter(([, n]) => n > 0)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 2)
				.forEach(([kind, n]) => {
					const s = document.createElement('span');
					s.className = 'xdtv-react-mini';
					s.textContent = `${KINDS[kind]} ${n}`;
					reacts.appendChild(s);
				});
		}
		if (comments) {
			comments.textContent = `💬 ${data.replies}`;
		}
	};

	const renderBar = (bar, counts, mine) => {
		bar.querySelectorAll('.xdtv-react').forEach(btn => {
			const n = counts[btn.dataset.kind] || 0;
			btn.querySelector('.xdtv-react-count').textContent = n > 0 ? n : '';
			btn.classList.toggle('xdtv-mine', btn.dataset.kind === mine);
			btn.setAttribute('aria-pressed', btn.dataset.kind === mine ? 'true' : 'false');
		});
	};

	const refreshReactions = async (scope = document) => {
		const els = [...scope.querySelectorAll('[data-ref]')];
		if (els.length === 0) {
			return;
		}
		const refs = [...new Set(els.map(el => el.dataset.ref))].slice(0, 200);
		try {
			const res = await fetch(`/xdtv/reakcje.json?p=${encodeURIComponent(refs.join(','))}`, { credentials: 'same-origin' });
			if (!res.ok) {
				return;
			}
			const json = await res.json();
			KINDS = json.kinds || KINDS;
			els.forEach(el => {
				const data = json.posts[el.dataset.ref];
				if (!data) {
					return;
				}
				if (el.classList.contains('xdtv-reactbar')) {
					renderBar(el, data.counts, data.mine);
				} else {
					renderTileMeta(el, data);
				}
			});
		} catch (err) {
			// liczniki zostają z HTML-a
		}
	};

	document.addEventListener('click', async (e) => {
		const btn = e.target.closest('.xdtv-react');
		if (!btn) {
			return;
		}
		const bar = btn.closest('.xdtv-reactbar');
		if (!bar || bar.dataset.busy) {
			return;
		}
		bar.dataset.busy = '1';
		btn.classList.add('xdtv-pop');
		setTimeout(() => btn.classList.remove('xdtv-pop'), 250);
		try {
			const res = await fetch(`/forms/board/${bar.dataset.board}/react`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Using-XHR': 'true' },
				body: new URLSearchParams({ postId: bar.dataset.post, kind: btn.dataset.kind }),
			});
			const json = await res.json().catch(() => ({}));
			if (res.ok && json.counts) {
				renderBar(bar, json.counts, json.mine);
			} else {
				toast(json.error || json.message || 'Nie udało się dodać reakcji', 'error');
			}
		} catch (err) {
			toast('Brak połączenia', 'error');
		} finally {
			delete bar.dataset.busy;
		}
	});

	// dla doładowanych porcji ściany (xdtv-wall.js)
	window.xdtvRefreshReactions = refreshReactions;

	window.addEventListener('DOMContentLoaded', () => {
		refreshReactions();

		// „Opublikowane” po przekierowaniu z okienka na nowy wątek
		try {
			const posted = parseInt(sessionStorage.getItem('xdtvPosted') || '0', 10);
			const bar = document.querySelector('.xdtv-reactbar');
			if (posted && Date.now() - posted < 60 * 1000 && bar) {
				const yous = JSON.parse(localStorage.getItem('yous') || '[]');
				if (yous.includes(`${bar.dataset.board}-${bar.dataset.post}`)) {
					toast('Opublikowane! 🎉');
				}
				sessionStorage.removeItem('xdtvPosted');
			}
		} catch (err) { /* bez komunikatu */ }
	});

})();
