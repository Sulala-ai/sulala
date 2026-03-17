---
name: translate
description: Translate text to another language (e.g. via LibreTranslate). Use when the user says "translate this to [language]", "translate the above to Spanish", "translate to French", "how do you say X in Y".
metadata:
  sulala:
    emoji: "🌐"
    requires:
      bins:
        - curl
---

# Translate

Use **curl** to call a translation API. **LibreTranslate** is free and open; public instances exist. No API key for many instances.

## LibreTranslate (POST)

Most instances use the same API. Replace `https://libretranslate.com` with another instance if needed.

**Translate text:**

```bash
curl -s -X POST "https://libretranslate.com/translate" \
  -H "Content-Type: application/json" \
  -d '{"q":"Hello world","source":"en","target":"es"}'
```

Response: `{"translatedText":"Hola mundo"}`. Use **jq** to extract: `... | jq -r '.translatedText'`.

**Parameters:**

- `q` — text to translate
- `source` — source language code (e.g. `en`, `fr`, `auto` for auto-detect)
- `target` — target language code (e.g. `es`, `de`, `ja`)

**Example with jq:**

```bash
curl -s -X POST "https://libretranslate.com/translate" \
  -H "Content-Type: application/json" \
  -d '{"q":"Hello world","source":"en","target":"es"}' | jq -r '.translatedText'
```

## Language codes (common)

`en` English · `es` Spanish · `fr` French · `de` German · `it` Italian · `pt` Portuguese · `ja` Japanese · `zh` Chinese · `ko` Korean · `ar` Arabic · `ru` Russian.

## Tips

- Escape quotes in the JSON body for the shell (e.g. `\"` or use single quotes around the string and escape only inner quotes).
- If the default instance is rate-limited, try another public LibreTranslate instance or document an optional config for API URL/key.
- For "translate this to Spanish", set `target` to `es` and put the user's text in `q`; use `source: "auto"` if the source language is unknown.
