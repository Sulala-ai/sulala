#!/bin/sh
# Post to Bluesky via AT Protocol. BLUESKY_HANDLE and BLUESKY_APP_PASSWORD from skill config.
# Usage: post.sh "your post text here"
set -e
if [ -z "$BLUESKY_HANDLE" ] || [ -z "$BLUESKY_APP_PASSWORD" ]; then
  echo "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be set. Configure in Skills → bluesky → Setup." >&2
  exit 1
fi
# Trim and normalize: handle without leading @, no leading/trailing whitespace
BLUESKY_HANDLE=$(echo "$BLUESKY_HANDLE" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^@//')
BLUESKY_APP_PASSWORD=$(echo "$BLUESKY_APP_PASSWORD" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
if [ -z "$BLUESKY_HANDLE" ] || [ -z "$BLUESKY_APP_PASSWORD" ]; then
  echo "BLUESKY_HANDLE and BLUESKY_APP_PASSWORD must be non-empty after trimming." >&2
  exit 1
fi
if [ -z "$1" ]; then
  echo "Usage: post.sh \"post text\"" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for the Bluesky skill." >&2
  exit 1
fi
PDS="${BLUESKY_PDS:-https://bsky.social}"
# Create session (use jq to build JSON so special chars in password are safe)
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
DID=$(echo "$SESSION" | jq -r '.did')
# createdAt in ISO 8601
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
# Escape post text for JSON
TEXT=$(printf '%s' "$1" | jq -Rs .)
RECORD=$(jq -n --arg text "$1" --arg createdAt "$CREATED_AT" \
  '{ ("$type"): "app.bsky.feed.post", text: $text, createdAt: $createdAt }')
BODY=$(jq -n --arg repo "$DID" --argjson record "$RECORD" \
  '{ repo: $repo, collection: "app.bsky.feed.post", record: $record }')
curl -sS -X POST "$PDS/xrpc/com.atproto.repo.createRecord" \
  -H "Authorization: Bearer $ACCESS_JWT" \
  -H "Content-Type: application/json" \
  -d "$BODY"
