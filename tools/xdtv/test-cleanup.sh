#!/usr/bin/env bash
# XDTV.FANS — usuwa WSZYSTKIE treści testowe z tools/xdtv/test-content.sh:
# posty (akcją moderatora — pliki znikają też z R2), reakcje, LIVE, klipy, miniatury.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
U=http://127.0.0.1:7010
REF=https://nowe.xdtv.fans
LOG="$ROOT/deploy/test-content.json"
JAR="$ROOT/tmp/xdtv-test/jar.txt"
mkdir -p "$(dirname "$JAR")"

if [ -f "$LOG" ]; then
	# przerwany test-content.sh zostawia listę bez zamykającego „]”
	python3 - "$LOG" <<'PY'
import json, sys
p = sys.argv[1]; s = open(p).read().strip()
try:
    json.loads(s)
except ValueError:
    open(p, 'w').write(s.rstrip(',\n') + ('' if s.endswith(']') else ']'))
PY
	P=$(sed 's/^admin: //' "$ROOT/.admin-haslo")
	curl -s -c "$JAR" -b "$JAR" -o /dev/null -H "Referer: $REF/login.html" \
		--data-urlencode "username=admin" --data-urlencode "password=$P" -d "goto=/" "$U/forms/login"
	unset P
	for b in $(python3 -c "import json,sys;print(' '.join(sorted({p['board'] for p in json.load(open('$LOG'))})))"); do
		ids=$(python3 -c "import json;print(' '.join(str(p['postId']) for p in json.load(open('$LOG')) if p['board']=='$b'))")
		T=$(curl -s -c "$JAR" -b "$JAR" "$U/$b/manage/index.html" | grep -oE "name=['\"]_csrf['\"][^>]*value=['\"][^'\"]+|value=['\"][^'\"]+['\"][^>]*name=['\"]_csrf" | grep -oE "value=['\"][^'\"]+" | head -1 | cut -c8-)
		args=(--data-urlencode "_csrf=$T" -d "delete=1"); for id in $ids; do args+=(-d "checkedposts=$id"); done
		printf '/%s/: ' "$b"
		curl -s -c "$JAR" -b "$JAR" -H "Referer: $REF/$b/manage/index.html" -H "X-Using-XHR: true" "${args[@]}" \
			"$U/forms/board/$b/modactions" | grep -oE '"messages":\[[^]]*\]|"error":"[^"]*"' || echo "?"
	done
	rm -f "$LOG" "$JAR"
fi

docker exec xdtv-app node -e "
const Mongo=require('./db/db.js');
(async()=>{await Mongo.connect();
const r=await Mongo.db.collection('reactions').deleteMany({_id:{\$regex:':test-'}});
const c=await Mongo.db.collection('creators').deleteMany({test:true});
const k=await Mongo.db.collection('clips').deleteMany({test:true});
console.log('reakcje:',r.deletedCount,'streamerzy:',c.deletedCount,'klipy:',k.deletedCount);
require('./lib/build/queue.js').push({task:'buildHomepage'});
setTimeout(()=>process.exit(0),1000);})();"
docker exec xdtv-app rm -rf /opt/static/file/xdtv-test /opt/tmp/xdtv-test
rm -rf "$ROOT/tmp/xdtv-test"
echo "Treści testowe usunięte."
