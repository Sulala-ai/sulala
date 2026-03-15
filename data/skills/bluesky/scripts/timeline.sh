#!/bin/sh
# Get Bluesky home timeline. BLUESKY_HANDLE and BLUESKY_APP_PASSWORD from skill config (injected as env by exec).
# Usage: timeline.sh [limit]
# Optional: limit (default 20) - number of posts to return.
set -e
if [ -z "$BLUESKY_HANDLE" ] || [ -z "$BLUESKY_APP_PASSWORD" ]; then
  echo "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set. Configure in Skills → bluesky → Setup." >&2
  exit 1
fi
# Trim and normalize: handle without leading @
BLUESKY_HANDLE=$(echo "$BLUESKY_HANDLE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^@//')
BLUESKY_APP_PASSWORD=$(echo "$BLUESKY_APP_PASSWORD" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
if [ -z "$BLUESKY_HANDLE" ] || [ -z "$BLUESKY_APP_PASSWORD" ]; then
  echo "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be non-empty after trimming." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required. Install with: brew install jq (macOS) or apt install jq (Linux)." >&2
  exit 1
fi

LIMIT="${1:-20}"
PDS="${BLUESKY_PDS:-https://bsky.social}"
SESSION_BODY=$(jq -n --arg id "$BLUESKY_HANDLE" --arg pw "$BLUESKY_APP_PASSWORD" '{identifier:$id,password:$pw}')
SESSION=$(curl -sS -X POST "$PDS/xrpc/com.atproto.server.createSession" \
  -H "Content-Type: application/json" \
  -d "$SESSION_BODY")
if ! echo "$SESSION" | jq -e '.accessJwt' >/dev/null 2>&1; then
  echo "Session failed: $SESSION" >&2
  echo "Check: (1) Handle is your full handle, e.g. yourname.bsky.social (no @). (2) Use an App password from Bluesky Settings → App passwords, not your account password." >&2
  exit 1
fi
ACCESS_JWT=$(echo "$SESSION" | jq -r '.accessJwt')

curl -sS -G "$PDS/xrpc/app.bsky.feed.getTimeline" \
  --data-urlencode "limit=$LIMIT" \
  -H "Authorization: Bearer $ACCESS_JWT"
