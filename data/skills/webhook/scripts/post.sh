#!/bin/sh
# POST a JSON body to WEBHOOK_URL (from skill config, injected as env by exec).
# Usage: post.sh '<json>'
# Example: post.sh '{"text":"Hello from the agent"}'
if [ -z "$WEBHOOK_URL" ]; then
  echo "WEBHOOK_URL is not set. Configure it in the webhook skill settings." >&2
  exit 1
fi
if [ -z "$1" ]; then
  echo "Usage: post.sh '<json body>'" >&2
  exit 1
fi
curl -sS -X POST -H "Content-Type: application/json" -d "$1" "$WEBHOOK_URL"
