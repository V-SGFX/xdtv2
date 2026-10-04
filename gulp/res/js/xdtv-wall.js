/*
 * XDTV — ściana: doładowywanie przy przewijaniu, leniwe fragmenty
 * (panel boczny, related), klawisze ← → na stronie posta.
 */
'use strict';

window.addEventListener('DOMContentLoaded', () => {

	const fetchFragment = async (url) => {
		const res = await fetch(url, { credentials: 'same-origin' });
		if (!res.ok) {
			throw new Error(`HTTP ${res.status}`);
		}
		const tpl = document.createElement('template');
		tpl.innerHTML = await res.text();
		return tpl.content;
	};

	// ── Kolejne porcje ściany ───────────────────────────────────────
	let loading = false;
	const loadMore = async (sentinel) => {
		if (loading) {
			return;
		}
		loading = true;
		const wall = sentinel.previousElementSibling && sentinel.previousElementSibling.classList.contains('xdtv-wall')
			? sentinel.previousElementSibling : document.querySelector('.xdtv-main .xdtv-wall');
		try {
			const frag = await fetchFragment(sentinel.dataset.xdtvMore);
			const tiles = [...frag.querySelectorAll('.xdtv-tile')];
			const nextSentinel = frag.querySelector('.xdtv-more');
			const end = frag.querySelector('.xdtv-wall-end');
			tiles.forEach(t => wall.appendChild(t));
			if (window.xdtvRefreshReactions && tiles.length) {
				window.xdtvRefreshReactions(wall);
			}
			if (nextSentinel) {
				sentinel.replaceWith(nextSentinel);
				observer.observe(nextSentinel);
			} else {
				sentinel.replaceWith(end || document.createTextNode(''));
			}
		} catch (e) {
			sentinel.innerHTML = '<button type="button" class="xdtv-btn xdtv-btn-ghost">Nie udało się — spróbuj ponownie</button>';
			sentinel.querySelector('button').addEventListener('click', () => { sentinel.textContent = 'Ładuję…'; loadMore(sentinel); });
		} finally {
			loading = false;
		}
	};
	const observer = new IntersectionObserver((entries) => {
		entries.forEach(e => {
			if (e.isIntersecting) {
				observer.unobserve(e.target);
				loadMore(e.target);
			}
		});
	}, { rootMargin: '800px 0px' });
	document.querySelectorAll('.xdtv-more[data-xdtv-more]').forEach(el => observer.observe(el));

	// ── Leniwe fragmenty (panel, related) ───────────────────────────
	const lazy = new IntersectionObserver((entries) => {
		entries.forEach(async (e) => {
			if (!e.isIntersecting) {
				return;
			}
			lazy.unobserve(e.target);
			try {
				const frag = await fetchFragment(e.target.dataset.xdtvFragment);
				e.target.replaceChildren(frag);
				if (window.xdtvRefreshReactions) {
					window.xdtvRefreshReactions(e.target);
				}
			} catch (err) {
				e.target.remove();
			}
		});
	}, { rootMargin: '600px 0px' });
	document.querySelectorAll('[data-xdtv-fragment]').forEach(el => lazy.observe(el));

	// ── ← → na stronie posta (poza polami tekstowymi) ──────────────
	document.addEventListener('keydown', (e) => {
		if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
			return;
		}
		const t = e.target;
		if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) {
			return;
		}
		const link = document.querySelector(`[data-xdtv-key="${e.key}"]`);
		if (link) {
			location.href = link.href;
		}
	});
});

// Strona posta: zamiast miniatury pełny obrazek (materiał jest bohaterem).
// Wideo zostaje z miniaturą — jschan odtwarza je po kliknięciu.
window.addEventListener('DOMContentLoaded', () => {
	const op = document.querySelector('.xdtv-thread-public > .post-container.op');
	if (!op) {
		return;
	}
	op.querySelectorAll('.post-file-src[data-type="image"]').forEach(src => {
		const a = src.querySelector('a');
		const img = src.querySelector('img.file-thumb');
		if (a && img) {
			img.removeAttribute('width');
			img.removeAttribute('height');
			img.loading = 'eager';
			img.src = a.href;
		}
	});
});
