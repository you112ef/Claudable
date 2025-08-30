#!/usr/bin/env bash
set -euo pipefail
API="http://localhost:3000"
PID="demo-$(date +%s)"
echo "[projects] create $PID"
curl -sS -X POST "$API/api/projects" -H 'Content-Type: application/json' -d '{"project_id":"'"$PID"'","name":"Demo"}' | jq .
echo "[projects] list"
curl -sS "$API/api/projects" | jq '.[0]'
echo "[projects] get"
curl -sS "$API/api/projects/$PID" | jq .
echo "[projects] rename"
curl -sS -X PUT "$API/api/projects/$PID" -H 'Content-Type: application/json' -d '{"name":"Renamed"}' | jq .
echo "[projects] install-dependencies"
curl -sS -X POST "$API/api/projects/$PID/install-dependencies" | jq .
