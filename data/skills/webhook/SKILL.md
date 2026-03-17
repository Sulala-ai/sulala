---
name: webhook
description: Send a notification or message to a configurable webhook URL (e.g. Slack, Discord). Use when the user says "notify me when …", "send this to Slack", "post a reminder", "send to webhook", "notify …".
credentials:
  - WEBHOOK_URL
metadata:
  sulala:
    emoji: "🔔"
    requires:
      bins:
        - curl
---

# Webhook / Notify

POST a JSON body to a URL configured in the skill. The **webhook URL** is stored in skill config (Skills → webhook → Configure) so the agent never sees it. Use the **exec** tool with **skill_id: "webhook"** so `WEBHOOK_URL` is injected from config.

## Prerequisites

1. Add the **webhook** skill to the agent.
2. Configure **WEBHOOK_URL** in the skill (Skills → webhook → ⋮ → Setup). See **Setup** below for where to get the URL.

## Setup

Set **WEBHOOK_URL** in Skills → webhook → Setup. Where to get it:

### Slack — Incoming Webhook URL

1. Open [Slack API apps](https://api.slack.com/apps) and sign in.
2. **Create an app** → **From scratch** (or use an existing app).
3. Open the app → **Incoming Webhooks** in the left sidebar → turn **Activate Incoming Webhooks** **On**.
4. At the bottom, click **Add New Webhook to Workspace**.
5. Pick the **channel** where messages should go (e.g. `#general` or `#notifications`) → **Allow**.
6. Copy the **Webhook URL** (looks like `https://hooks.slack.com/services/T00000000/B00000000/xxxxxxxxxxxxxxxxxxxxxxxx`).

That URL is your **WEBHOOK_URL** for Slack. Each “Add New Webhook to Workspace” creates one URL; you can add more for other channels.

Docs: [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks).

### Discord — Webhook URL

1. Open your Discord server.
2. Go to **Server settings** (gear by the server name) → **Integrations** → **Webhooks** (or right‑click the channel → **Edit channel** → **Integrations** → **Webhooks**).
3. Click **New Webhook** (or **Create Webhook**).
4. Name it (e.g. “Agent notifications”), choose the **channel**, then **Copy Webhook URL**.

The URL looks like: `https://discord.com/api/webhooks/1234567890123456789/AbCdEfGhIjKlMnOpQrStUvWxYz...`

That’s your **WEBHOOK_URL** for Discord.

Docs: [Discord Webhooks](https://discord.com/developers/docs/resources/webhook).

## Send a message (script)

Use the **exec** tool with **skill_id: "webhook"** and a **command** that runs the script. The script receives the JSON body as its first argument; `WEBHOOK_URL` comes from skill config (injected as env).

**Example (Slack-style):**

- `skill_id`: `webhook`
- `command`: `./scripts/post.sh '{"text":"Hello from the agent"}'`

**Example (Discord-style):**

- `skill_id`: `webhook`
- `command`: `./scripts/post.sh '{"content":"Reminder: standup in 5 min"}'`

Slack incoming webhooks expect:

```json
{"text": "Your message here"}
```

Discord webhooks often expect:

```json
{"content": "Your message here"}
```

Or with username:

```json
{"content": "Reminder: standup in 5 min", "username": "Agent"}
```

Use the format required by your endpoint. The script sends the body as-is with `Content-Type: application/json`.

## Direct curl (if URL is not sensitive)

If the user provides the webhook URL in the message (e.g. "post this to https://hooks.slack.com/..."), you can use exec **without** skill_id and run curl directly:

```bash
curl -sS -X POST -H "Content-Type: application/json" -d '{"text":"Message"}' "https://user-provided-url"
```

Prefer the script + skill config when the URL should stay private.

## Tips

- Escape the JSON properly in the shell: use single quotes around the JSON and escape any single quotes inside (e.g. `'"'"'` to embed a quote).
- For Slack, keep the payload to `{"text": "..."}` for simple messages.
- For "notify me when X" or "remind me", send a short, clear message to the webhook; the agent does not schedule future notifications (that would require a scheduler or external service).
