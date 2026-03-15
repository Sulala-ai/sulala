#!/usr/bin/env python3
"""Send email via Gmail API using an OAuth access token.

Use when you have a token from Sulala Portal (connections/:id/use) or another source.
No local OAuth files required; pass the token on the command line.

Usage:
  python3 send_email.py --token TOKEN --to recipient@example.com --subject "Subject" --body "Body text"
  python3 send_email.py --token TOKEN --to recipient@example.com --subject "Subject" --body-file body.txt

Requires: Python 3.6+. No extra pip packages (uses urllib and base64 from stdlib).
"""

import argparse
import base64
import json
import sys
import urllib.request
import urllib.error

GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"


def base64url_encode(data: bytes) -> str:
    """Encode bytes to base64url (RFC 4648): no +/ padding, use -_."""
    b64 = base64.b64encode(data).decode("ascii")
    return b64.replace("+", "-").replace("/", "_").rstrip("=")


def build_rfc2822(to: str, subject: str, body: str) -> str:
    """Build a minimal RFC 2822 message (CRLF line endings)."""
    lines = [
        f"To: {to}",
        f"Subject: {subject}",
        "Content-Type: text/plain; charset=UTF-8",
        "",
        body,
    ]
    return "\r\n".join(lines)


def send(token: str, to: str, subject: str, body: str) -> None:
    rfc2822 = build_rfc2822(to, subject, body)
    raw = base64url_encode(rfc2822.encode("utf-8"))
    body_json = json.dumps({"raw": raw}).encode("utf-8")

    req = urllib.request.Request(
        GMAIL_SEND_URL,
        data=body_json,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status != 200:
                sys.stderr.write(f"Unexpected status: {resp.status}\n")
                sys.exit(1)
            print("Email sent successfully.")
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"Gmail API error: {e.code} {e.reason}\n")
        if e.fp:
            body = e.fp.read().decode("utf-8", errors="replace")
            sys.stderr.write(body)
            sys.stderr.write("\n")
        sys.exit(1)
    except OSError as e:
        sys.stderr.write(f"Request failed: {e}\n")
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser(description="Send email via Gmail API with an access token.")
    ap.add_argument("--token", required=True, help="OAuth2 access token (e.g. from Sulala Portal)")
    ap.add_argument("--to", required=True, help="Recipient email address")
    ap.add_argument("--subject", required=True, help="Email subject")
    group = ap.add_mutually_exclusive_group(required=True)
    group.add_argument("--body", help="Email body (plain text)")
    group.add_argument("--body-file", help="Path to file containing email body")
    args = ap.parse_args()

    if args.body is not None:
        body = args.body
    else:
        with open(args.body_file, "r", encoding="utf-8") as f:
            body = f.read()

    send(args.token, args.to, args.subject, body)


if __name__ == "__main__":
    main()
