---
name: git
description: Run read-only git commands in the workspace (status, log, branch, diff). Use when the user asks "what's the git status", "recent commits", "current branch", "show me the diff".
metadata:
  sulala:
    emoji: "📂"
    requires:
      bins:
        - git
---

# Git (read-only)

Run **read-only** git commands in the workspace via the **exec** tool. Do **not** run `git commit`, `git push`, `git reset`, or any command that modifies history or remote. Restrict to status, log, branch, and diff.

## Status

```bash
git status
```

Working tree state (clean, modified, untracked).

## Recent commits

```bash
git log -n 10 --oneline
git log -n 5 --pretty=format:"%h %s (%an, %ar)"
```

## Current branch and list branches

```bash
git branch --show-current
git branch -a
```

## Diff (unstaged changes)

```bash
git diff
git diff --stat
```

For a specific file:

```bash
git diff -- path/to/file
```

## Last commit message

```bash
git log -1 --pretty=%B
```

## Tips

- Commands run in the **workspace** (agent workspace or repo root). Do not pass `skill_id` for git unless the skill dir is the repo; use exec with cwd in the workspace.
- If the user asks "what branch am I on" or "any uncommitted changes?", use the commands above and summarize the output.
