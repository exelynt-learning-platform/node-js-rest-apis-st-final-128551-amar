#!/usr/bin/env bash
# One curl command for every route of the clinic token queue API.
# 1. Start the server first: node server.js
# 2. Then run:               bash requests.sh
# Use another address with:  BASE_URL=http://localhost:4000 bash requests.sh
# Note: this really changes data/tokens.json. Reset it with: git checkout -- data/tokens.json

BASE_URL="${BASE_URL:-http://localhost:3000}"
SHOW_STATUS="\nStatus: %{http_code}\n\n"

echo "1. GET /tokens - list all tokens"
curl -s -w "$SHOW_STATUS" "$BASE_URL/tokens"

echo "2. GET /tokens?doctor=dental - filter by doctor"
curl -s -w "$SHOW_STATUS" "$BASE_URL/tokens?doctor=dental"

echo "3. GET /tokens?status=waiting - filter by status"
curl -s -w "$SHOW_STATUS" "$BASE_URL/tokens?status=waiting"

echo "4. GET /tokens/stats - waiting, seen and next waiting token"
curl -s -w "$SHOW_STATUS" "$BASE_URL/tokens/stats"

echo "5. GET /tokens/3 - one token"
curl -s -w "$SHOW_STATUS" "$BASE_URL/tokens/3"

echo "6. POST /tokens - new walk-in patient (201)"
curl -s -w "$SHOW_STATUS" -X POST "$BASE_URL/tokens" \
  -H "Content-Type: application/json" \
  -d '{"patientName":"Kavya","doctor":"dental"}'

echo "7. POST /tokens without a doctor (400)"
curl -s -w "$SHOW_STATUS" -X POST "$BASE_URL/tokens" \
  -H "Content-Type: application/json" \
  -d '{"patientName":"Kavya"}'

echo "8. PATCH /tokens/3/seen - mark token 3 as seen"
curl -s -w "$SHOW_STATUS" -X PATCH "$BASE_URL/tokens/3/seen"

echo "9. PATCH /tokens/999/seen - missing id (404)"
curl -s -w "$SHOW_STATUS" -X PATCH "$BASE_URL/tokens/999/seen"
