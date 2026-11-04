#!/usr/bin/env bash
# 用法：在專案根目錄執行  bash tests/run.sh [測試名稱…]
# 需要 Node.js 與 Playwright（cd tests && npm install && npx playwright install chromium）
cd "$(dirname "$0")/.." || exit 1
PORT=8793
python3 -m http.server $PORT >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
cd tests
LIST=("$@"); [ ${#LIST[@]} -eq 0 ] && LIST=($(ls *.js | sed 's/\.js$//'))
for t in "${LIST[@]}"; do
  echo "=================== $t ==================="
  timeout 300 node "$t.js" 2>&1 | tail -25
done
