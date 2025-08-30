#!/usr/bin/env bash
set -euo pipefail
API="http://localhost:3000"
PID=${1:-demo1}
echo "[env] create"
curl -sS -X POST "$API/api/env/$PID" -H 'Content-Type: application/json' -d '{"key":"API_URL","value":"https://example.com"}' | jq .
echo "[env] list"
curl -sS "$API/api/env/$PID" | jq .
echo "[env] conflicts"
curl -sS "$API/api/env/$PID/conflicts" | jq .
echo "[env] sync db->file"
curl -sS -X POST "$API/api/env/$PID/sync/db-to-file" | jq .
echo "[env] upsert"
curl -sS -X POST "$API/api/env/$PID/upsert" -H 'Content-Type: application/json' -d '{"key":"NEW_KEY","value":"123"}' | jq .
echo "[env] update"
curl -sS -X PUT "$API/api/env/$PID/API_URL" -H 'Content-Type: application/json' -d '{"value":"https://api.example.com"}' | jq .
echo "[env] delete"
curl -sS -X DELETE "$API/api/env/$PID/NEW_KEY" | jq .
