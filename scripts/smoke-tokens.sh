#!/usr/bin/env bash
set -euo pipefail
API="http://localhost:3000"
echo "[tokens] create"
resp=$(curl -sS -X POST "$API/api/tokens" -H 'Content-Type: application/json' -d '{"provider":"github","token":"ghp_test_token","name":"GitHub Token"}')
echo "$resp"
id=$(echo "$resp" | node -pe 'JSON.parse(fs.readFileSync(0)).id')
echo "[tokens] get metadata"
curl -sS "$API/api/tokens/github" | jq .
echo "[tokens] internal token"
curl -sS "$API/api/tokens/internal/github/token" | jq .
echo "[tokens] delete"
curl -sS -X DELETE "$API/api/tokens/$id" | jq .

