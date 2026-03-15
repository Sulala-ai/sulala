---
name: file-stats
description: Get line count, word count, or first/last lines of a file (wc, head, tail). Use when the user asks "how many lines in this file", "first 20 lines of …", "word count", "last 10 lines", "show the top of the file".
metadata:
  clawdbot:
    emoji: "📊"
    requires:
      bins:
        - wc
        - head
        - tail
---

# File stats (wc, head, tail)

Use **wc**, **head**, and **tail** via the **exec** tool. Path can be relative (workspace) or absolute (e.g. `~/file.txt`).

## Line count

```bash
wc -l path/to/file
wc -l < path/to/file
# Second form outputs only the number (no filename).
```

## Word count

```bash
wc -w path/to/file
wc -w < path/to/file
```

## Line, word, and byte count

```bash
wc path/to/file
# Output: lines words bytes filename
```

## First N lines (head)

```bash
head -n 20 path/to/file
head -20 path/to/file
head path/to/file
# Default is 10 lines.
```

## Last N lines (tail)

```bash
tail -n 10 path/to/file
tail -10 path/to/file
tail path/to/file
# Default is 10 lines.
```

## Skip first N lines (tail)

```bash
tail -n +21 path/to/file
# Lines 21 to end (skip first 20).
```

## Tips

- Use `head -c 5000` or `tail -c 5000` for first/last N **bytes** if needed.
- For "preview" or "first part of file", use `head -n 50`.
