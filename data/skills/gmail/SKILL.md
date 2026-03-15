---
name: gmail
description: Send email via Gmail using your connected account. Uses Sulala Portal for the access token; includes a script to send email from the command line or automation. Requires the Sulala Portal skill for token. Use when the user wants to send email, compose mail, or automate Gmail sending.
metadata:
  sulala:
    requires:
      skills:
        - sulala-portal
---

# Gmail (Sulala Portal)

Send email using your **Gmail account connected in the Sulala Portal**. This skill provides a **script**; use the **exec** tool to run it. No static send-email code in the loader; the skill is script + docs like YouTube Shorts automation.

## Overview

1. **Get an access token** from the Portal (list connections, then `POST connections/{connection_id}/use` for Gmail).
2. **Send email** by running the script via **exec** (see below).

## Getting the token (Portal)

- **Tool**: `sulala-portal_request`
- **List connections**: `GET` path `connections` (filter by `provider === "gmail"` in the response).
- **Get token**: `POST` path `connections/{id}/use`. Use the connection’s `connection_id` from the list (e.g. `conn_gmail_...`). If you get 404, use `connection_id` in the path instead of `id`. Response: `{ connectionId, provider, accessToken, scopes }`.

## Sending email (use exec tool + script — preferred)

Use the **exec** tool to run the skill script. No need to build RFC 2822 or base64url by hand.

1. Get **accessToken** from the Portal (`sulala-portal_request`: list connections, then `POST connections/{connection_id}/use` with the Gmail connection’s `connection_id`).
2. Call **exec** with:
   - **skill_id**: `"gmail"` (so the command runs in this skill’s directory).
   - **command**: `python3 scripts/send_email.py --token "<accessToken>" --to "recipient@example.com" --subject "Subject line" --body "Email body text."`

Example exec call:

```json
{
  "skill_id": "gmail",
  "command": "python3 scripts/send_email.py --token \"<paste accessToken from Portal>\" --to \"sai.ko@mothernode.com\" --subject \"test title\" --body \"test body\""
}
```

- **Token**: from `POST connections/{connection_id}/use` (see above).
- **To**, **Subject**, **Body**: recipient email, subject line, and body text. Escape quotes inside the command string as needed.

Full script options: [references/send-email.md](references/send-email.md).

## Skill layout (like YouTube Shorts automation)

- **scripts/send_email.py** — runnable script: `--token`, `--to`, `--subject`, `--body` or `--body-file`.
- **references/send-email.md** — how to run the script and get the token.
- **SKILL.md** — this file: overview, get token, send via exec + script.

No separate config: the Sulala Portal skill provides the gateway and token; this skill adds the script and docs.
