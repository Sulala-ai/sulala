---
name: jq
description: Parse, filter, and transform JSON (via jq). Use when the user wants to "parse this JSON", "extract field from this response", "filter JSON", or "get X from this API output".
metadata:
  clawdbot:
    emoji: "📋"
    requires:
      bins:
        - jq
---

# JSON with jq

Use **jq** via the **exec** tool to parse, extract, and filter JSON. Pipe JSON from a file or from stdin (e.g. curl output).

## Parse and pretty-print

```bash
echo '{"a":1,"b":2}' | jq .
cat response.json | jq .
```

## Extract a field

```bash
echo '{"name":"Alice","age":30}' | jq -r '.name'
# Output: Alice
```

```bash
curl -s "https://api.example.com/data" | jq -r '.items[0].title'
```

## Extract multiple fields

```bash
echo '{"a":1,"b":2,"c":3}' | jq '{a, b}'
# Output: {"a":1,"b":2}
```

## Array slice and filter

```bash
echo '[1,2,3,4,5]' | jq '.[:3]'
echo '[{"x":1},{"x":2},{"x":3}]' | jq '.[] | select(.x > 1)'
```

## Keys or length

```bash
echo '{"a":1,"b":2}' | jq 'keys'
echo '[1,2,3]' | jq 'length'
```

## From a file in the workspace

```bash
jq -r '.config.version' ./package.json
jq '.data[] | {id, name}' ./data.json
```

## Tips

- Use `-r` for raw string output (no quotes).
- Use `jq -c` for compact one-line output.
- If jq is not installed, the skill cannot be used; document that `jq` is required (e.g. `apt install jq` / `brew install jq`).
