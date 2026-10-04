/* globals socket forceUpdate appendLocalStorageArray captchaOptions hcaptcha */
/*
 * XDTV — composer komentarzy i zgłaszanie postów.
 *
 * Warstwa UI nad odpowiedziami jschan: POST /forms/board/:board/post z polem
 * `thread`, więc obowiązują istniejące limity, antyspam, walidacja i upload.
 * „Odpowiedz” = cytat >>numer (lista komentarzy zostaje płaska).
 */
'use strict';

window.addEventListener('DOMContentLoaded', () => {

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
		box._t = setTimeout(() => { box.className = ''; }, 2800);
	};

	// ── Captcha (hCaptcha albo tekstowa jschan — zależnie od ustawień) ──
	const captchaType = () => (typeof captchaOptions !== 'undefined' && captchaOptions.type) || 'text';
	const isCaptchaError = (res, json) => res.status === 403 && /captcha/i.test(`${json.message || ''} ${json.error || ''}`);
	const renderCaptcha = async (container) => {
		container.innerHTML = '';
		if (captchaType() === 'hcaptcha') {
			const meta = document.querySelector('meta[name="xdtv-hcaptcha-sitekey"]');
			for (let i = 0; i < 50 && typeof hcaptcha === 'undefined'; i++) {
				await new Promise(r => setTimeout(r, 200)); // api.js ładuje się asynchronicznie
			}
			if (typeof hcaptcha === 'undefined' || !meta) {
				container.textContent = 'Nie udało się załadować captchy. Odśwież stronę.';
				return { get: () => null, reset: () => {} };
			}
			const id = hcaptcha.render(container, { sitekey: meta.content, theme: 'light', hl: 'pl' });
			return {
				get: () => { const v = hcaptcha.getResponse(id); return v ? ['h-captcha-response', v] : null; },
				reset: () => hcaptcha.reset(id),
			};
		}
		container.innerHTML = '<img alt="Captcha" width="210" height="80"><input class="xdtv-upload-text" type="text" maxlength="6" autocomplete="off" placeholder="Przepisz kod z obrazka" aria-label="Kod z obrazka">';
		const img = container.querySelector('img');
		const input = container.querySelector('input');
		const fresh = () => { img.src = `/captcha?${Date.now()}`; input.value = ''; };
		img.addEventListener('click', fresh);
		img.title = 'Kliknij, by zmienić';
		fresh();
		return { get: () => (input.value.trim() ? ['captcha', input.value.trim()] : null), reset: fresh };
	};

	const errorText = (json, fallback) => json.error || json.message
		|| (json.messages && json.messages.join(' ')) || (json.errors && json.errors.join(' ')) || fallback;

	// ── Zgłaszanie (menu ⋯ przy poście) ────────────────────────────
	// Działa także na stronach boardów. Zgłoszenie w jschan wymaga captchy.
	let reportModal = null;
	let reportWidget = null;
	const openReport = (board, postId) => {
		if (!reportModal) {
			reportModal = document.createElement('div');
			reportModal.className = 'xdtv-modal-bg';
			reportModal.innerHTML = `
				<div class="xdtv-modal xdtv-report-modal" role="dialog" aria-modal="true" aria-labelledby="xdtv-report-title">
					<div class="xdtv-modal-head"><span id="xdtv-report-title">Zgłoś post</span>
						<button class="xdtv-modal-close" type="button" aria-label="Zamknij">×</button></div>
					<div class="xdtv-report-body">
						<label class="xdtv-report-label" for="xdtv-report-reason">Co jest nie tak?</label>
						<input id="xdtv-report-reason" class="xdtv-upload-text" type="text" maxlength="100" placeholder="np. spam, dane osobowe, nielegalne treści">
						<div class="xdtv-report-captcha"></div>
						<div class="xdtv-upload-foot"><span class="xdtv-upload-hint">Zgłoszenie trafia do moderacji.</span>
							<button type="button" class="xdtv-btn xdtv-btn-small xdtv-report-send">Zgłoś</button></div>
					</div>
				</div>`;
			document.body.appendChild(reportModal);
			const close = () => { reportModal.hidden = true; };
			reportModal.addEventListener('click', e => { if (e.target === reportModal || e.target.closest('.xdtv-modal-close')) { close(); } });
			reportModal.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); } });
			reportModal.querySelector('.xdtv-report-send').addEventListener('click', async () => {
				const reason = reportModal.querySelector('#xdtv-report-reason').value.trim();
				const token = reportWidget && reportWidget.get();
				if (!reason || !token) {
					return toast(reason ? 'Potwierdź captchę' : 'Napisz, co jest nie tak', 'error');
				}
				const { board: b, post: p } = reportModal.dataset;
				try {
					const res = await fetch(`/forms/board/${b}/actions`, {
						method: 'POST',
						credentials: 'same-origin',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Using-XHR': 'true' },
						body: new URLSearchParams({ checkedposts: p, report: '1', report_reason: reason, [token[0]]: token[1] }),
					});
					const json = await res.json().catch(() => ({}));
					if (res.ok) {
						close();
						toast('Dzięki, zgłoszenie wysłane');
					} else {
						toast(errorText(json, 'Nie udało się zgłosić'), 'error');
						reportWidget && reportWidget.reset();
					}
				} catch (err) {
					toast('Brak połączenia', 'error');
				}
			});
		}
		reportModal.dataset.board = board;
		reportModal.dataset.post = postId;
		reportModal.querySelector('#xdtv-report-reason').value = '';
		reportModal.hidden = false;
		if (reportWidget) {
			reportWidget.reset();
		} else {
			renderCaptcha(reportModal.querySelector('.xdtv-report-captcha')).then(w => { reportWidget = w; });
		}
		reportModal.querySelector('#xdtv-report-reason').focus();
	};
	// capture: nasza opcja nie trafia do obsługi menu w jschan
	document.addEventListener('change', (e) => {
		const select = e.target.closest && e.target.closest('select.postmenu');
		if (!select || select.value !== 'xdtv-report') {
			return;
		}
		e.stopImmediatePropagation();
		const container = select.closest('.post-container');
		select.value = '';
		select.selectedIndex = -1;
		if (container) {
			openReport(container.dataset.board, container.dataset.postId);
		}
	}, true);

	// ── Composer ───────────────────────────────────────────────────
	const root = document.getElementById('odpowiedz');
	if (!root) {
		return;
	}
	const $ = (sel) => root.querySelector(sel);
	const collapsedBtn = $('.xdtv-composer-collapsed');
	const box = $('.xdtv-composer-box');
	const text = $('.xdtv-composer-text');
	const replyBar = $('.xdtv-composer-reply');
	const replyText = $('.xdtv-composer-reply-text');
	const preview = $('.xdtv-composer-preview');
	const previewImg = $('.xdtv-composer-preview-img');
	const previewName = $('.xdtv-composer-preview-name');
	const fileInput = $('.xdtv-composer-file');
	const sendBtn = $('.xdtv-composer-send');
	const emojiPop = $('.xdtv-emoji-pop');
	const gifPop = $('.xdtv-gif-pop');
	const gifGrid = $('.xdtv-gif-grid');
	const gifSearch = $('.xdtv-gif-search');
	const { board, thread } = root.dataset;

	const state = { replyTo: null, file: null, sending: false, captcha: null };
	const captchaBox = $('.xdtv-composer-captcha');

	const autosize = () => {
		text.style.height = 'auto';
		text.style.height = `${Math.min(text.scrollHeight, 220)}px`;
		text.style.overflowY = text.scrollHeight > 220 ? 'auto' : 'hidden';
	};

	const expand = () => {
		root.classList.add('xdtv-composer-open');
		collapsedBtn.hidden = true;
		box.hidden = false;
		autosize();
		text.focus();
	};

	const isEmpty = () => !text.value.trim() && !state.file;

	const closePops = () => {
		emojiPop.hidden = true;
		gifPop.hidden = true;
		$('.xdtv-tool-emoji').setAttribute('aria-expanded', 'false');
		$('.xdtv-tool-gif').setAttribute('aria-expanded', 'false');
	};

	const setReply = (postId) => {
		state.replyTo = postId;
		replyBar.hidden = !postId;
		replyText.textContent = postId ? `↳ Odpowiedź na komentarz >>${postId}` : '';
		text.placeholder = postId ? 'Napisz odpowiedź…' : 'Napisz coś…';
		sendBtn.textContent = postId ? 'Odpowiedz' : 'Wyślij';
	};

	const collapse = () => {
		closePops();
		setReply(null);
		root.classList.remove('xdtv-composer-open');
		box.hidden = true;
		collapsedBtn.hidden = false;
	};

	const clearFile = () => {
		if (previewImg.src.startsWith('blob:')) {
			URL.revokeObjectURL(previewImg.src);
		}
		state.file = null;
		preview.hidden = true;
		previewImg.removeAttribute('src');
		fileInput.value = '';
	};

	const setFile = (file) => {
		if (!file) {
			return;
		}
		clearFile();
		state.file = file;
		previewName.textContent = file.name;
		if (file.type.startsWith('image/')) {
			previewImg.src = URL.createObjectURL(file);
			previewImg.hidden = false;
		} else {
			previewImg.hidden = true;
		}
		preview.hidden = false;
		expand();
	};

	collapsedBtn.addEventListener('click', expand);
	$('.xdtv-composer-cancel').addEventListener('click', () => {
		text.value = '';
		clearFile();
		collapse();
	});
	$('.xdtv-composer-reply-cancel').addEventListener('click', () => {
		setReply(null);
		text.focus();
	});
	$('.xdtv-composer-preview-remove').addEventListener('click', () => {
		clearFile();
		text.focus();
	});
	text.addEventListener('input', autosize);

	// Plik: przycisk, wklejanie, przeciąganie
	$('.xdtv-tool-image').addEventListener('click', () => fileInput.click());
	fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
	text.addEventListener('paste', (e) => {
		const item = [...(e.clipboardData ? e.clipboardData.files : [])][0];
		if (item) {
			e.preventDefault();
			setFile(item);
		}
	});
	root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('xdtv-composer-drag'); });
	root.addEventListener('dragleave', () => root.classList.remove('xdtv-composer-drag'));
	root.addEventListener('drop', (e) => {
		e.preventDefault();
		root.classList.remove('xdtv-composer-drag');
		setFile(e.dataTransfer.files[0]);
	});

	// ── Emoji ──
	const EMOJI = '😂 🤣 😭 💀 🔥 ❤️ 🤡 😎 🙂 😉 😍 🤔 🙄 😬 😱 😡 🥲 🥹 😴 🤯 🫡 🤝 👍 👎 👏 🙏 💩 👀 🎉 💯 ✅ ❌ ⚡ 🍺 🍕 🎮 📺 🐸'.split(' ');
	emojiPop.innerHTML = EMOJI.map(e => `<button type="button" class="xdtv-emoji" aria-label="${e}">${e}</button>`).join('');
	const insertAtCursor = (str) => {
		const start = text.selectionStart ?? text.value.length;
		const end = text.selectionEnd ?? text.value.length;
		text.value = text.value.slice(0, start) + str + text.value.slice(end);
		text.setSelectionRange(start + str.length, start + str.length);
		autosize();
	};
	$('.xdtv-tool-emoji').addEventListener('click', (e) => {
		const open = emojiPop.hidden;
		closePops();
		emojiPop.hidden = !open;
		e.currentTarget.setAttribute('aria-expanded', String(open));
	});
	emojiPop.addEventListener('click', (e) => {
		const btn = e.target.closest('.xdtv-emoji');
		if (btn) {
			insertAtCursor(btn.textContent);
			text.focus();
		}
	});

	// ── GIF (dostawca po stronie serwera: /xdtv/gif.json) ──
	let gifTimer = null;
	let gifSeq = 0;
	const loadGifs = async (q) => {
		const seq = ++gifSeq;
		gifGrid.innerHTML = '<span class="xdtv-gif-msg">Szukam…</span>';
		try {
			const res = await fetch(`/xdtv/gif.json?q=${encodeURIComponent(q)}`, { credentials: 'same-origin' });
			const json = await res.json();
			if (seq !== gifSeq) {
				return;
			}
			if (!res.ok || !json.items) {
				gifGrid.innerHTML = `<span class="xdtv-gif-msg">${errorText(json, 'Wyszukiwarka GIF nie działa')}</span>`;
				return;
			}
			if (json.items.length === 0) {
				gifGrid.innerHTML = '<span class="xdtv-gif-msg">Nic nie znaleziono</span>';
				return;
			}
			gifGrid.innerHTML = '';
			json.items.forEach(g => {
				const b = document.createElement('button');
				b.type = 'button';
				b.className = 'xdtv-gif-item';
				b.setAttribute('role', 'option');
				b.setAttribute('aria-label', g.title || 'GIF');
				b.dataset.full = g.full;
				b.dataset.id = g.id;
				const img = document.createElement('img');
				img.src = g.preview;
				img.alt = '';
				img.loading = 'lazy';
				b.appendChild(img);
				gifGrid.appendChild(b);
			});
		} catch (err) {
			gifGrid.innerHTML = '<span class="xdtv-gif-msg">Brak połączenia</span>';
		}
	};
	$('.xdtv-tool-gif').addEventListener('click', (e) => {
		const open = gifPop.hidden;
		closePops();
		gifPop.hidden = !open;
		e.currentTarget.setAttribute('aria-expanded', String(open));
		if (open) {
			if (!gifGrid.children.length) {
				loadGifs('');
			}
			gifSearch.focus();
		}
	});
	gifSearch.addEventListener('input', () => {
		clearTimeout(gifTimer);
		gifTimer = setTimeout(() => loadGifs(gifSearch.value.trim()), 350);
	});
	gifSearch.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
		}
	});
	gifGrid.addEventListener('click', async (e) => {
		const item = e.target.closest('.xdtv-gif-item');
		if (!item) {
			return;
		}
		item.classList.add('xdtv-gif-loading');
		try {
			// Pobieramy GIF i dołączamy jak zwykły plik — ta sama walidacja, miniatury i R2
			const res = await fetch(item.dataset.full);
			const blob = await res.blob();
			setFile(new File([blob], `giphy-${item.dataset.id}.gif`, { type: 'image/gif' }));
			closePops();
			text.focus();
		} catch (err) {
			toast('Nie udało się pobrać GIF-a', 'error');
		} finally {
			item.classList.remove('xdtv-gif-loading');
		}
	});

	// ── Odpowiedź na komentarz: „Odpowiedz” i kliknięcie numeru posta ──
	const startReply = (postId) => {
		expand();
		setReply(postId);
		root.scrollIntoView({ block: 'center', behavior: 'smooth' });
		text.focus();
	};
	document.addEventListener('click', (e) => {
		const replyLink = e.target.closest('.xdtv-reply-btn');
		const quoteLink = e.target.closest('.post-quoters a');
		const link = replyLink || quoteLink;
		if (!link) {
			return;
		}
		const container = link.closest('.post-container');
		if (!container || container.dataset.board !== board) {
			return;
		}
		e.preventDefault();
		e.stopImmediatePropagation(); // nie otwieramy starego formularza jschan (quote.js)
		// Komentarz do posta otwierającego = zwykły komentarz
		const postId = container.classList.contains('op') ? null : container.dataset.postId;
		postId ? startReply(postId) : expand();
	}, true);
	const hashReply = location.hash.match(/^#odpowiedz(?:-(\d+))?$/);
	if (hashReply) {
		hashReply[1] ? startReply(hashReply[1]) : expand();
	}

	// ── Klawiatura ──
	text.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			send();
		} else if (e.key === 'Escape') {
			if (!emojiPop.hidden || !gifPop.hidden) {
				closePops();
			} else if (state.replyTo) {
				setReply(null);
			} else if (isEmpty()) {
				collapse();
				collapsedBtn.focus();
			}
		}
	});
	root.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && e.target !== text && (!emojiPop.hidden || !gifPop.hidden)) {
			closePops();
			text.focus();
		}
	});

	// ── Licznik komentarzy ──
	const threadEl = document.querySelector('.thread');
	const countEl = document.querySelector('.xdtv-comments-count');
	const updateCount = () => {
		if (threadEl && countEl) {
			countEl.textContent = threadEl.querySelectorAll('.post-container:not(.op)').length;
		}
	};

	// ── Wysyłanie ──
	const send = async () => {
		if (state.sending || isEmpty()) {
			return;
		}
		state.sending = true;
		sendBtn.disabled = true;
		sendBtn.textContent = state.file ? 'Wysyłam plik…' : 'Wysyłam…';
		root.classList.add('xdtv-composer-busy');

		let token = null;
		if (state.captcha) {
			token = state.captcha.get();
			if (!token) {
				state.sending = false;
				sendBtn.disabled = false;
				sendBtn.textContent = state.replyTo ? 'Odpowiedz' : 'Wyślij';
				root.classList.remove('xdtv-composer-busy');
				return toast('Potwierdź captchę', 'error');
			}
		}
		const message = (state.replyTo ? `>>${state.replyTo}\n` : '') + text.value.trim();
		const data = new FormData();
		data.append('thread', thread);
		data.append('message', message);
		if (state.file) {
			data.append('file', state.file, state.file.name);
		}
		if (token) {
			data.append(token[0], token[1]);
		}
		try {
			const res = await fetch(`/forms/board/${board}/post`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'X-Using-XHR': 'true' },
				body: data,
			});
			const json = await res.json().catch(() => ({}));
			if (res.ok && json.postId) {
				try { appendLocalStorageArray('yous', `${board}-${json.postId}`); } catch (err) { /* (You) bez znaczenia */ }
				text.value = '';
				clearFile();
				if (state.captcha) {
					state.captcha.reset();
				}
				collapse();
				autosize();
				// Nowy komentarz: socket.io dostarczy go sam; bez połączenia — pobieramy ręcznie
				if (!(typeof socket !== 'undefined' && socket && socket.connected) && typeof forceUpdate === 'function') {
					forceUpdate();
				}
				const showNew = () => {
					const el = document.getElementById(String(json.postId));
					if (el) {
						const post = el.nextElementSibling || el;
						post.scrollIntoView({ block: 'center', behavior: 'smooth' });
						post.classList.add('xdtv-new');
						setTimeout(() => post.classList.remove('xdtv-new'), 1800);
						updateCount();
						return true;
					}
					return false;
				};
				let tries = 0;
				const wait = setInterval(() => { if (showNew() || ++tries > 20) { clearInterval(wait); } }, 250);
			} else if (isCaptchaError(res, json)) {
				// Antyspam jschan włączył captchę (np. duży ruch) — pokazujemy ją w composerze
				captchaBox.hidden = false;
				if (state.captcha) {
					state.captcha.reset();
				} else {
					state.captcha = await renderCaptcha($('.xdtv-composer-captcha-widget'));
				}
				toast('Potwierdź captchę i wyślij jeszcze raz');
			} else {
				toast(errorText(json, 'Nie udało się wysłać komentarza'), 'error');
				state.captcha && state.captcha.reset();
			}
		} catch (err) {
			toast('Brak połączenia', 'error');
		} finally {
			state.sending = false;
			sendBtn.disabled = false;
			sendBtn.textContent = state.replyTo ? 'Odpowiedz' : 'Wyślij';
			root.classList.remove('xdtv-composer-busy');
		}
	};
	sendBtn.addEventListener('click', send);

	if (threadEl) {
		new MutationObserver(updateCount).observe(threadEl, { childList: true });
	}
});
