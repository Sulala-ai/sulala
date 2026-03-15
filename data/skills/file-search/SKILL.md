---
name: file-search
description: Search for files and text in the workspace or the user's computer (grep, find). Use when the user asks "find files containing X", "list all .md files", "search my computer", "find file named Y on my machine", "search in my Downloads".
metadata:
  clawdbot:
    emoji: "🔍"
    requires:
      bins:
        - grep
        - find
---

# File search (workspace)

Use **grep** and **find** via the **exec** tool to search inside the **workspace**. Commands run in the agent workspace; restrict paths to the workspace (no `../` escape).

## Find files by name or pattern

```bash
find . -name "*.md"
find . -name "*.json" -type f
find . -iname "*config*"
```

Limit depth (e.g. current dir + one level):

```bash
find . -maxdepth 2 -name "*.ts"
```

## Search file contents (grep)

```bash
grep -r "search term" .
grep -rn "function foo" .
# -n = line numbers
```

Case-insensitive:

```bash
grep -ri "TODO" .
```

Only list matching files (no line content):

```bash
grep -rl "import React" .
```

## Combine find + grep

```bash
find . -name "*.py" -exec grep -l "def main" {} \;
```

## Search the user's computer (home directory)

When the user says "on my computer", "in my computer", "on my machine", "in my home", "find file named X" (and not in workspace), or "in my Downloads", search their **home directory** using `~` or `$HOME` so it works on **macOS** (/Users/username) and **Linux** (/home/username):

**Find a file by exact name:**

```bash
find ~ -name "saiko_cv" -type f 2>/dev/null
find ~ -name "gggg.png" -type f 2>/dev/null
```

**Find in a specific folder (e.g. Downloads, Desktop):**

```bash
find ~/Downloads -name "*.png" -type f
find ~/Desktop -name "saiko_cv*" -type f 2>/dev/null
```

**Find by name pattern (partial match):**

```bash
find ~ -iname "*saiko_cv*" -type f 2>/dev/null
find ~ -iname "*gggg*" -type f 2>/dev/null
```

Use `-iname` for case-insensitive match. Use `2>/dev/null` to hide permission errors.

## Search entire system or a specific path

When the user asks for "whole system", "entire disk", or an explicit path:

**Portable (home):** use `~` or `$HOME` (works on macOS and Linux).

**Linux:** `/home` or `/home/$(whoami)`.

**macOS:** `/Users` or `~` (e.g. `/Users/saiko`).

```bash
find ~ -name "*.md" -type f 2>/dev/null
find /home -name "*.conf" -type f 2>/dev/null
find / -name "*.conf" -type f 2>/dev/null
```

**Grep in a path:**

```bash
grep -r "pattern" ~ 2>/dev/null
grep -rln "TODO" ~/projects 2>/dev/null
```

**Limit depth for large trees:**

```bash
find ~ -maxdepth 5 -name "*.json" -type f
```

**Tips:**

- **"My computer" or "find file X"** → use `find ~ -name "X"` (or `find ~/Downloads -name "X"` if they say "in Downloads"). Do not search only the workspace.
- Prefer `~` or `$HOME` so the same command works on macOS and Linux.
- Add `2>/dev/null` to hide "Permission denied" when searching outside the workspace.

## Tips (workspace-only)

- Use `.` so search is limited to current directory (workspace root when exec runs there).
- For large trees, consider `-maxdepth` or file-type filters to keep output small.
