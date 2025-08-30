#!/usr/bin/env bash
set -euo pipefail
API="http://localhost:3000"
PID=${1:-demo1}
echo "[repo] tree"; curl -sS "$API/api/repo/$PID/tree?dir=." | jq .
echo "[repo] file .env"; curl -sS "$API/api/repo/$PID/file?path=.env" | jq .
