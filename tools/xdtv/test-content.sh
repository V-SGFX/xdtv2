#!/usr/bin/env bash
# XDTV.FANS — treści TESTOWE do oceny wyglądu (obrazki, GIF-y, wideo, komentarze,
# reakcje, LIVE, klipy). Usuwa je: tools/xdtv/test-cleanup.sh
#
# Uruchomienie na serwerze (z hosta, nie z kontenera):  tools/xdtv/test-content.sh
# Wymaga: ImageMagick (convert), curl, działającego xdtv-app i pliku .admin-haslo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
U=http://127.0.0.1:7010
REF=https://nowe.xdtv.fans            # refererCheck: nagłówek Referer musi wskazywać naszą domenę
WORK="$ROOT/tmp/xdtv-test"            # tmp/ jest montowane w kontenerze jako /opt/tmp
LOG="$ROOT/deploy/test-content.json"  # lista utworzonych postów (dla sprzątania)
JAR="$WORK/jar.txt"
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf

[ -f "$LOG" ] && { echo "Treści testowe już są ($LOG). Najpierw tools/xdtv/test-cleanup.sh"; exit 1; }
mkdir -p "$WORK"; rm -f "$WORK"/*.jpg "$WORK"/*.gif "$WORK"/*.mp4 "$JAR"

# ── Obrazki ──────────────────────────────────────────────────────────
# Każdy plik unikalny (numer + czas): te same bajty = ten sam klucz w R2, a Cloudflare
# pamięta 404 skasowanego wcześniej pliku — powtórka testu pokazałaby puste miniatury.
SIZES=(800x800 1200x900 900x1200 1280x720 720x1280 1400x700 960x1200 1000x1000 1200x800 800x1000)
FILLS=(plasma:fractal "plasma:#e8d5b7-#3a6ea5" "gradient:#f6d365-#fda085" "plasma:#2c3e50-#bdc3c7" "radial-gradient:#ffecd2-#fcb69f" "plasma:#134e5e-#71b280" "gradient:#ee9ca7-#ffdde1" "plasma:#614385-#516395" "gradient:#43cea2-#185a9d" "plasma:#ff9966-#ff5e62")
TOPS=("KIEDY WIDZISZ" "JA O 3 W NOCY" "PONIEDZIAŁEK" "NIKT:" "MÓJ KOT" "SZEF W PRACY" "KIEDY WIFI" "ZNAJOMY" "STREAMER" "MAMA")
BOTS=("TEST XD" "TEST TEST" "TO JEST TEST" "TESTOWY MEM" "TEST 2137" "TEST ŚMIETNIK" "MEM TESTOWY" "TEST PORTALU" "TEST NA ŚCIANIE" "TEST NR ")
n=0
for i in $(seq 0 39); do
	n=$((n+1)); s=${SIZES[$((i % 10))]}; f=${FILLS[$(((i * 3) % 10))]}
	w=${s%x*}; ps=$((w / 11))
	convert -size "$s" "$f" \
		-font "$FONT" -pointsize $ps -fill white -stroke black -strokewidth $((ps / 16 + 1)) \
		-gravity north -annotate +0+$((ps / 2)) "${TOPS[$((i % 10))]}" \
		-gravity south -annotate +0+$((ps / 2)) "${BOTS[$((i % 10))]}" \
		-pointsize $((ps / 2)) -stroke none -fill 'rgba(255,255,255,0.85)' -gravity southeast -annotate +12+8 "#$n $(date +%s)" \
		-quality 85 "$WORK/img$n.jpg"
done
for g in 1 2 3 4; do
	convert -size 480x$((300 + g * 40)) -delay 25 -loop 0 \
		xc:"#b91c1c" xc:"#252525" xc:"#f3f1ed" \
		-font "$FONT" -pointsize 54 -fill white -stroke black -strokewidth 3 -gravity center -annotate 0 "GIF TEST $g\n$(date +%s)" \
		"$WORK/anim$g.gif"
done
# Krótkie wideo — ffmpeg jest w kontenerze aplikacji
for v in 1 2; do
	docker exec xdtv-app ffmpeg -loglevel error -y -f lavfi -i "testsrc=duration=4:size=640x$((360 * v)):rate=25" \
		-vf "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='WIDEO TEST $v $(date +%s)':fontsize=44:fontcolor=white:box=1:boxcolor=black@0.6:x=(w-tw)/2:y=(h-th)/2" \
		-c:v libx264 -pix_fmt yuv420p "/opt/tmp/xdtv-test/vid$v.mp4"
done

# ── Logowanie admina (modpost: bez captchy) ──────────────────────────
P=$(sed 's/^admin: //' "$ROOT/.admin-haslo")
curl -s -c "$JAR" -b "$JAR" -o /dev/null -H "Referer: $REF/login.html" \
	--data-urlencode "username=admin" --data-urlencode "password=$P" -d "goto=/" "$U/forms/login"
unset P

csrf() { curl -s -c "$JAR" -b "$JAR" "$1" | grep -oE "name=['\"]_csrf['\"][^>]*value=['\"][^'\"]+|value=['\"][^'\"]+['\"][^>]*name=['\"]_csrf" | grep -oE "value=['\"][^'\"]+" | head -1 | cut -c8-; }

# post BOARD THREAD(puste=nowy) PLIK(puste=bez) TEKST
post() {
	local b=$1 th=$2 f=$3 msg=$4 page="$U/$b/manage/index.html"
	[ -n "$th" ] && page="$U/$b/manage/thread/$th.html"
	local T; T=$(csrf "$page")
	local args=(-F "_csrf=$T" -F "message=$msg")
	[ -n "$th" ] && args+=(-F "thread=$th")
	if [ -n "$f" ]; then
		# typ jak z przeglądarki — jschan odrzuca application/octet-stream
		local t=image/jpeg; case "$f" in *.gif) t=image/gif;; *.mp4) t=video/mp4;; *.png) t=image/png;; esac
		args+=(-F "file=@$f;type=$t")
	fi
	curl -s -c "$JAR" -b "$JAR" -H "Referer: $REF/$b/manage/index.html" -H "X-Using-XHR: true" "${args[@]}" \
		"$U/forms/board/$b/modpost" | grep -oE '"postId":[0-9]+' | cut -d: -f2 || true
}

BOARDS=(smietnik memy smietnik gify stream memy smietnik leaked memy smietnik)
TEXTS=("xD" "ktoś wie skąd to?" "" "dobre to" "znowu poniedziałek" "" "wrzucam bo mogę" "to jest test portalu" "" "najlepszy mem tygodnia")
COMMENTS=("xD" "nie wierzę" "💀💀💀" "skąd to masz" "dobre" "repost" "hahahaha" "to ja" "+1" "kto to robi o tej porze" "klasyk" "ok boomer")

echo "[" > "$LOG"; first=1
logpost() { [ $first = 1 ] && first=0 || echo "," >> "$LOG"; printf '{"board":"%s","postId":%s}' "$1" "$2" >> "$LOG"; }

threads=()
for n in $(seq 1 40); do
	b=${BOARDS[$((n % 10))]}
	id=$(post "$b" "" "$WORK/img$n.jpg" "${TEXTS[$((n % 10))]}")
	[ -n "$id" ] && { logpost "$b" "$id"; threads+=("$b:$id"); }
done
for g in 1 2 3 4; do id=$(post gify "" "$WORK/anim$g.gif" "gif testowy $g"); [ -n "$id" ] && { logpost gify "$id"; threads+=("gify:$id"); }; done
for v in 1 2; do id=$(post gify "" "$WORK/vid$v.mp4" "krótki film testowy"); [ -n "$id" ] && { logpost gify "$id"; threads+=("gify:$id"); }; done

# Komentarze: pierwsze wątki dostają ich więcej (żeby było co pokazać w „Popularne”)
c=0
for idx in "${!threads[@]}"; do
	[ $idx -ge 24 ] && break
	b=${threads[$idx]%%:*}; id=${threads[$idx]##*:}
	k=$(( (24 - idx) / 4 ))
	for j in $(seq 1 $k); do post "$b" "$id" "" "${COMMENTS[$(( (idx + j) % 12 ))]}" >/dev/null; c=$((c+1)); done
done
echo "]" >> "$LOG"
echo "wątki: ${#threads[@]}, komentarze: $c"

# ── Reakcje, LIVE i KLIPY (w kontenerze) ─────────────────────────────
docker cp "$LOG" xdtv-app:/opt/tmp/xdtv-test/test-content.json
docker exec xdtv-app node tools/xdtv/test-extras.js /opt/tmp/xdtv-test/test-content.json
rm -f "$JAR"
echo "Gotowe. Usunięcie: tools/xdtv/test-cleanup.sh"
