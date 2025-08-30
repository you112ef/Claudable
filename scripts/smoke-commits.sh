#!/usr/bin/env bash
set -euo pipefail
API="http://localhost:3000"
PID=${1:-demo1}
echo "[commits] list"; resp=$(curl -sS "$API/api/commits/$PID"); echo "$resp" | jq .; sha=$(echo "$resp" | jq -r '.[0].commit_sha')
echo "[commits] diff"; curl -sS "$API/api/commits/$PID/$sha/diff" | jq -r .diff | head -n 20
echo "[commits] revert"; curl -sS -X POST "$API/api/commits/$PID/$sha/revert" | jq .
