---
name: date
description: Get current date and time (optionally in a timezone). Use when the user asks "what time is it", "current date", "time in Tokyo", "what's the date today".
metadata:
  sulala:
    emoji: "🕐"
    requires:
      bins:
        - date
---

# Date and time

Use the **exec** tool to run `date` or fetch time from an API. No script required.

## Local date and time

```bash
date
# e.g. Sat Mar 15 10:30:00 GMT 2025
```

Custom format (ISO-like):

```bash
date +"%Y-%m-%d %H:%M:%S %Z"
```

## Time in another timezone

```bash
TZ=Europe/Paris date
TZ=America/New_York date
TZ=Asia/Tokyo date +"%H:%M %Z"
```

Common TZ values: `Europe/London`, `Europe/Paris`, `America/Los_Angeles`, `America/New_York`, `Asia/Tokyo`, `UTC`.

## Unix timestamp

```bash
date +%s
```

## World time (fallback via curl)

If the user asks for "time in City" and you need a source:

```bash
curl -s "https://worldtimeapi.org/api/timezone/Europe/Paris" | head -c 500
```

Returns JSON with `datetime`, `timezone`, etc. Other zones: `America/New_York`, `Asia/Tokyo`. Docs: https://worldtimeapi.org/
