'use strict';

/*
 * XDTV — wyszukiwarka GIF dla composera komentarzy.
 *
 * Warstwa „dostawcy”: composer zna tylko { id, title, preview, full, width,
 * height }. Dziś dostawcą jest GIPHY (klucz GIPHY_API_KEY w deploy/.env,
 * zostaje na serwerze). Inny dostawca = nowa funkcja w PROVIDERS.
 *
 * Wybrany GIF przeglądarka pobiera z CDN dostawcy (CORS: *) i dołącza do
 * komentarza jak zwykły plik — przechodzi tę samą walidację, miniatury i R2
 * co każdy upload. Nie trzymamy linków do cudzych serwerów w postach.
 */

const redis = require(__dirname+'/../redis/redis.js');

const CACHE_TTL = 600;   // s — te same zapytania nie męczą API
const RATE_LIMIT = 40;   // zapytań na minutę z jednego IP

const PROVIDERS = {
	giphy: async (q) => {
		const key = process.env.GIPHY_API_KEY;
		if (!key) {
			return { error: 'Wyszukiwarka GIF nie jest skonfigurowana', status: 503 };
		}
		const params = new URLSearchParams({ api_key: key, limit: '24', rating: 'pg-13', bundle: 'messaging_non_clips' });
		let url = 'https://api.giphy.com/v1/gifs/trending';
		if (q) {
			params.set('q', q);
			params.set('lang', 'pl');
			url = 'https://api.giphy.com/v1/gifs/search';
		}
		const res = await fetch(`${url}?${params}`, { signal: AbortSignal.timeout(6000) });
		if (!res.ok) {
			return { error: 'Wyszukiwarka GIF chwilowo nie działa', status: 502 };
		}
		const json = await res.json();
		const items = (json.data || []).map(g => {
			const im = g.images || {};
			const preview = im.fixed_width_small || im.fixed_width || im.preview_gif;
			const full = im.downsized || im.fixed_width || im.original;
			if (!preview || !full) {
				return null;
			}
			return {
				id: String(g.id),
				title: String(g.title || '').slice(0, 100),
				preview: preview.url,
				full: full.url,
				width: parseInt(full.width, 10) || null,
				height: parseInt(full.height, 10) || null,
			};
		}).filter(Boolean);
		return { provider: 'giphy', attribution: 'Powered by GIPHY', items };
	},
};

const provider = 'giphy';

module.exports = {

	search: async (q, voter) => {
		const rateKey = `xdtv:gif:rate:${voter}`;
		const used = await redis.incr(rateKey);
		if (used === 1) {
			await redis.expire(rateKey, 60);
		}
		if (used > RATE_LIMIT) {
			return { error: 'Za dużo wyszukiwań. Odczekaj chwilę.', status: 429 };
		}
		const cacheKey = `xdtv:gif:${provider}:${q.toLowerCase()}`;
		const cached = await redis.get(cacheKey);
		if (cached) {
			return cached;
		}
		const result = await PROVIDERS[provider](q);
		if (!result.error) {
			await redis.set(cacheKey, result, CACHE_TTL);
		}
		return result;
	},

};
