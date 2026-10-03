# XDTV.FANS 2.0 — wdrożenie

Fork mchan (jschan) w Dockerze: `xdtv-mongo`, `xdtv-redis`, `xdtv-app`
(127.0.0.1:7010). Nginx systemowy, ruch przez Cloudflare Tunnel.

## Zmiana kodu → produkcja

```bash
cd /var/www/xdtv
git commit -am "…"                      # NAJPIERW commit
cd deploy && docker compose build app && docker compose up -d app
```

**Commit przed budowaniem jest obowiązkowy.** CSS i JS mają w adresie
`?v=<skrót commita>`, a Cloudflare trzyma je w cache tydzień. Bez nowego
commita adres się nie zmienia i użytkownicy dostają stare style mimo
nowego obrazu.

Podgląd bez cache Cloudflare (np. Playwright):
`--host-resolver-rules=MAP nowe.xdtv.fans 127.0.0.1` i adres `http://`.

## Pliki

- `deploy/.env` — sekrety (Mongo, Redis, cookie, R2). Tylko na serwerze.
- `/var/www/xdtv/.admin-haslo` — startowe hasło admina (zmienić w panelu).
- `data/` — dane Mongo i Redisa. `static/` — strony generowane przez jschan.
- Pliki postów: Cloudflare R2, bucket `cden`, publicznie `cdn.xdtv.fans`
  (`lib/file/r2.js`).

## Skrypty konfiguracyjne (idempotentne)

```bash
docker compose exec app node tools/xdtv/setup-boards.js   # boardy, język, captcha
docker compose exec app node tools/xdtv/setup-etap2.js    # nazwa, adres, motywy
```

## Przed podmianą na xdtv.fans

1. **AGPLv3 §13:** kod działającej wersji musi być w
   https://github.com/V-SGFX/xdtv2 (link w stopce, `views/includes/footer.pug`).
   Każde wdrożenie = commit wypchnięty do tego repo.
2. `XDTV_SITE_URL=https://xdtv.fans node tools/xdtv/setup-etap2.js`.
3. nginx: `server_name xdtv.fans`, a w `robots.txt` zdjąć `Disallow: /`.
