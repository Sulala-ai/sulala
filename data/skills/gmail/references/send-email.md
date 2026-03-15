# Send email script

The Gmail skill includes a script that sends email using the Gmail API with an OAuth2 access token. Use it when you have a token (e.g. from Sulala Portal) and want to send from the command line or from automation.

## Prerequisites

- **Access token**: Obtain from Sulala Portal (`POST connections/{connection_id}/use` with your Gmail connection), or from your own OAuth flow. Token must have `https://www.googleapis.com/auth/gmail.send` scope.
- **Python 3.6+**: No extra pip packages; script uses only the standard library.

## Usage

From the skill directory (or with paths adjusted):

```bash
python3 scripts/send_email.py \
  --token "YOUR_ACCESS_TOKEN" \
  --to "recipient@example.com" \
  --subject "Subject line" \
  --body "Email body text."
```

With body from a file:

```bash
python3 scripts/send_email.py \
  --token "YOUR_ACCESS_TOKEN" \
  --to "recipient@example.com" \
  --subject "Subject" \
  --body-file path/to/body.txt
```

## Options

| Option       | Required | Description                          |
|-------------|----------|--------------------------------------|
| `--token`   | Yes      | OAuth2 access token (Bearer).        |
| `--to`      | Yes      | Recipient email address.             |
| `--subject` | Yes      | Email subject line.                  |
| `--body`    | One of   | Email body as a string.              |
| `--body-file` | One of | Path to file containing body text.  |

## Getting the token (Sulala Portal)

1. Call the Portal API to list connections: `GET connections` (filter for `provider === "gmail"`).
2. Call `POST connections/{connection_id}/use` with the Gmail connection’s `connection_id` (e.g. `conn_gmail_...`; use `connection_id` if `id` returns 404).
3. Use the `accessToken` from the response as `--token`.

## Troubleshooting

| Problem              | Cause                    | Action                          |
|----------------------|--------------------------|---------------------------------|
| 401 Unauthorized      | Token expired or invalid | Refresh or re-issue token.      |
| Recipient required   | Missing/invalid To       | Ensure `--to` is a valid email. |
| Invalid To header    | Bad To format            | Use plain email, no extra text. |
