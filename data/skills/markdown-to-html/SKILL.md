---
name: markdown-to-html
description: Convert Markdown to HTML (via pandoc or a simple converter). Use when the user says "convert this markdown to HTML", "render this .md as HTML", "markdown to HTML".
metadata:
  sulala:
    emoji: "📝"
    requires:
      bins:
        - pandoc
---

# Markdown to HTML

Use **pandoc** via the **exec** tool to convert Markdown to HTML. Input can be a file path or stdin.

## Convert a file

```bash
pandoc input.md -o output.html
pandoc input.md -f markdown -t html -o output.html
```

## Stdout (no output file)

```bash
pandoc input.md -f markdown -t html
cat input.md | pandoc -f markdown -t html
```

## Standalone HTML (with basic document shell)

```bash
pandoc input.md -s -o output.html
# -s = standalone (adds <!DOCTYPE html>, <head>, <body>)
```

## From stdin (e.g. paste or pipe)

```bash
echo "# Hello" | pandoc -f markdown -t html
```

## Tips

- Input path can be relative (workspace) or absolute. Output path is relative to exec cwd (workspace) unless absolute.
- If pandoc is not installed: `brew install pandoc` (macOS), `apt install pandoc` (Linux).
- For "convert this markdown to HTML", run pandoc on the file or pipe the content to pandoc and return the HTML (or write to a file in the workspace and tell the user the path).
