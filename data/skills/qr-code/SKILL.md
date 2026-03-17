---
name: qr-code
description: Generate a QR code from URL or text (via qrencode or API). Use when the user says "generate a QR code for this URL", "QR code for …", "make a QR code".
metadata:
  sulala:
    emoji: "📱"
    requires:
      bins:
        - qrencode
---

# QR code

Generate a QR code from a URL or text. Use **qrencode** via the **exec** tool, or a public API as fallback.

## qrencode (terminal / PNG)

**Output as PNG file:**

```bash
qrencode -o qr.png "https://example.com"
qrencode -o ~/Downloads/qr.png "https://example.com"
```

**Output to stdout (ASCII art in terminal):**

```bash
qrencode -t ANSIUTF8 "https://example.com"
qrencode -t UTF8 "Hello world"
```

**Options:**

- `-o file` — write PNG to file (path can be in workspace or e.g. `~/Downloads/qr.png`)
- `-t ANSIUTF8` or `-t UTF8` — print QR as blocks in the terminal (no file)
- `-s 10` — module size (pixels per module) for PNG

## If qrencode is not installed

**macOS:** `brew install qrencode`  
**Linux:** `apt install qrencode` or `yum install qrencode`

**Fallback (curl to API, no local binary):**

```bash
# Example: API that returns PNG (many exist). Use -o with a path the user can find.
curl -s "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=URL_ENCODED_TEXT" -o ~/Downloads/qr.png
```

URL-encode the `data` parameter (e.g. `https%3A%2F%2Fsulala.ai` for `https://sulala.ai`).

## Where the file is saved

Exec runs with **cwd = agent workspace**: `~/.agent-os/workspaces/<agent_id>/`. So:

- **Relative path** (e.g. `-o sulala_ai.png`) → file is at `~/.agent-os/workspaces/<agent_id>/sulala_ai.png`. The user may not know this path.
- **Absolute path** (e.g. `-o ~/Downloads/sulala_ai.png`) → file is in Downloads and easy to find.

**Prefer saving to a user-visible location** when the user will want to open the file: use `-o ~/Downloads/filename.png` (or tell the user the full workspace path: `~/.agent-os/workspaces/<agent_id>/filename.png`).

## Tips

- For "QR code for this URL", use the URL as the only argument (in quotes). For the API, URL-encode it in the `data=` parameter.
- Prefer `-o ~/Downloads/qr.png` (or similar) so the user can find the file; if you use a relative path, tell them the full path: `~/.agent-os/workspaces/<agent_id>/filename.png`.
- For "show me a QR code" without saving, use qrencode `-t ANSIUTF8` (terminal art), or generate PNG to `~/Downloads` and give the path.
