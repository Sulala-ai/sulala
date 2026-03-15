#!/bin/sh
# Search the web via Serper (Google) API. SERPER_API_KEY from skill config (injected as env by exec).
# Usage: search.sh "your search query"
if [ -z "$SERPER_API_KEY" ]; then
  echo "SERPER_API_KEY is not set. Configure it in the web-search skill settings (Skills → web-search → Setup)." >&2
  exit 1
fi
if [ -z "$1" ]; then
  echo "Usage: search.sh \"search query\"" >&2
  exit 1
fi
# Build JSON body safely (jq preferred; fallback to simple printf)
if command -v jq >/dev/null 2>&1; then
  body=$(jq -n --arg q "$1" '{q: $q}')
else
  body="{\"q\": \"$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')\"}"
fi
curl -sS -X POST "https://google.serper.dev/search" \
  -H "X-API-KEY: $SERPER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$body"
