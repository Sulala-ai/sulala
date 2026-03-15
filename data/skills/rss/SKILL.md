---
name: rss
description: Fetch RSS or Atom feed content from a URL. Use when the user asks "latest from this blog", "what's new on …", "recent posts from [URL]", "RSS feed", "feed from …".
metadata:
  clawdbot:
    emoji: "📰"
    requires:
      bins:
        - curl
---

# RSS / Atom feed

Fetch a feed URL via **curl**; the response is XML (RSS or Atom). Use the **exec** tool. Optionally trim output with `head -c` so the agent gets a manageable chunk to summarize.

## Fetch feed (raw XML)

```bash
curl -sL "https://example.com/feed.xml"
curl -sL "https://blog.example.com/rss"
```

## Limit size (feeds can be large)

```bash
curl -sL "https://example.com/feed.xml" | head -c 50000
# First 50 KB is often enough for recent items.
```

## With a user-agent (some feeds require it)

```bash
curl -sL -A "Mozilla/5.0 (compatible; Agent/1.0)" "https://example.com/feed.xml" | head -c 50000
```

## Tips

- Feed URLs often end in `/feed`, `/rss`, `/feed.xml`, or `/atom.xml`. If the user gives a site URL, try appending `/feed` or `/rss`.
- Output is XML; the agent can summarize titles and links from `<title>`, `<link>`, `<item>` (RSS) or `<entry>` (Atom).
- For "latest posts" or "recent from …", fetch the feed and report the first few items (title + link).
