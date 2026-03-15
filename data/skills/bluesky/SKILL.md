---
name: bluesky
description: Post to Bluesky and read your home timeline (AT Protocol). Use when the user says "post this to Bluesky", "what's on my Bluesky feed", "reply to this post", "post to Bluesky", "my Bluesky timeline".
credentials:
  - BLUESKY_HANDLE
  - BLUESKY_APP_PASSWORD
metadata:
  clawdbot:
    emoji: "🦋"
    requires:
      bins:
        - curl
        - jq
---

# Bluesky

Post and read your Bluesky feed via the AT Protocol. Use the **exec** tool with **skill_id: "bluesky"** so `BLUESKY_HANDLE` and `BLUESKY_APP_PASSWORD` are injected from skill config.

## Prerequisites

1. Add the **bluesky** skill to the agent.
2. Set **Bluesky handle** and **Bluesky app password** in Skills → bluesky → Setup (see **Setup** below).
3. **jq** must be installed (`brew install jq` or `apt install jq`).

## Setup

1. In Bluesky: **Settings** (gear) → **App passwords** → **Add App Password**. Name it (e.g. "Agent OS"), copy the password once (it won’t be shown again).
2. Your handle is your Bluesky username (e.g. `yourname.bsky.social`).
3. In the dashboard: **Skills** → **bluesky** → ⋮ → **Setup** → set **Bluesky handle** and **Bluesky app password** → Save.

Never use your main account password; use only an app password.

### If you get "Invalid identifier or password"

- **Handle:** Use your full handle exactly as shown in Bluesky (e.g. `yourname.bsky.social`). Do not include `@`. The script strips a leading `@` and trims spaces automatically.
- **App password:** You must create one in Bluesky **Settings → App passwords → Add App Password**. Copy it when shown (it’s not shown again). If you lost it, create a new app password and update the skill config.
- **No account password:** The app password is a separate, long token (e.g. `xxxx-xxxx-xxxx-xxxx`); do not use your normal Bluesky login password.

## Post a new post

- **skill_id:** `bluesky`
- **command:** `./scripts/post.sh "Your post text here"`

Post text is the first argument. Max 300 graphemes (Bluesky limit). The script creates a session, then creates the record; the response is the created post URI.

## Get your home timeline

- **skill_id:** `bluesky`
- **command:** `./scripts/timeline.sh`
- Optional limit: `./scripts/timeline.sh 30` (default 20)

Returns JSON: `feed[]` with `post` (author, record.text, etc.). Summarize or list the most recent posts for the user.

## Reply to a post (future)

Replies require a `reply` object (parent + root) in the record. The current script only supports top-level posts. For replies, extend the record or add a `reply.sh` script that accepts parent URI and text.

## Tips

- Quote the post text in the command so spaces and punctuation are preserved: `./scripts/post.sh "Hello from the agent!"`
- Timeline entries have `post.author.displayName`, `post.record.text`, `post.uri`. Use these to summarize the feed.
- Optional env **BLUESKY_PDS** overrides the PDS URL (default `https://bsky.social`); only set if you use a custom PDS.
