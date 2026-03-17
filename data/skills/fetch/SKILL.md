---
name: fetch
description: Fetch content from a URL (GET). Use when the user says "fetch this URL", "read that page", "get content from …", or "what's at this link".
metadata:
  sulala:
    emoji: "🔗"
    requires:
      bins:
        - curl
---

# Fetch URL

Fetch the body of a URL via **curl**. Use the **exec** tool with the commands below. Only use **http** or **https** URLs.

## GET body (plain)

```bash
curl -sL "https://example.com/page"
```

- `-s` silent (no progress)
- `-L` follow redirects

## With a user-agent (some sites need it)

```bash
curl -sL -A "Mozilla/5.0 (compatible; Agent/1.0)" "https://example.com/page"
```

## Limit size (avoid huge responses)

```bash
curl -sL --max-size 1048576 "https://example.com/page"
# 1 MiB max
```

## Tips

- URL-encode the URL or quote it in the shell.
- For JSON APIs, pipe to `head -c 50000` or process with `jq` if needed.
- Do not POST or send secrets in the URL; use this for read-only GET.
