---
name: web-search
description: Search the web and get titles, snippets, and URLs. Use when the user says "search the web for …", "find recent info on …", "look up …", "what's the latest on …".
credentials:
  - SERPER_API_KEY
metadata:
  sulala:
    emoji: "🔍"
    requires:
      bins:
        - curl
---

# Web search

Search the web via the **Serper** API (Google search). Results are returned as JSON (organic results with title, link, snippet). Use the **exec** tool with **skill_id: "web-search"** so `SERPER_API_KEY` is injected from skill config.

## Prerequisites

1. Add the **web-search** skill to the agent.
2. Set **SERPER_API_KEY** in Skills → web-search → Setup (see **Setup** below).

## Setup

Get an API key from [serper.dev](https://serper.dev). Free tier: 2,500 searches/month.

1. Sign up at https://serper.dev
2. Copy your API key from the dashboard.
3. In the dashboard: **Skills** → **web-search** → ⋮ → **Setup** → paste the key as **Serper API key** → Save.

## Usage

Run the script with a single argument (the search query). From the skill directory:

- **skill_id:** `web-search`
- **command:** `./scripts/search.sh "what is the capital of France"`

The script POSTs to Serper and returns JSON. Example response shape (abbreviated):

```json
{
  "organic": [
    { "title": "...", "link": "https://...", "snippet": "..." },
    ...
  ]
}
```

Summarize the `organic` array (title, link, snippet) for the user. For "latest" or news-style queries, use the same command; results are ordered by relevance/recency.

## Tips

- Quote the query in the command so multi-word searches work: `./scripts/search.sh "best practices for TypeScript 2024"`.
- If the response is large, the agent can summarize the first few results or filter by relevance.
- Serper also supports images, news, places; the default script uses `/search`. For news-only, the API endpoint is `https://google.serper.dev/news` with the same body and key.
