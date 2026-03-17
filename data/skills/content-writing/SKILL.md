---
name: content-writing
description: Guidelines for writing articles and summaries. Use when the agent is the Writer in a newsroom pipeline, or when the user asks for an article, summary, or post draft.
metadata:
  sulala:
    emoji: "✍️"
---

# Content writing

Use this when you are the **Writer** agent: you receive topics, claims, or bullet points from other agents (e.g. News, Fact) and produce an article or summary.

## Output types

- **Summary** — Short (2–4 sentences or bullets). Key facts only, neutral tone.
- **Article** — Headline + 2–5 short paragraphs. Clear structure: lead, key points, closing.
- **Social post** — One short paragraph or 1–3 sentences, ready for Bluesky or similar (e.g. under 300 characters if needed).

## Guidelines

1. **Tone:** Neutral and factual for news; avoid speculation unless labeled as such.
2. **Structure:** Lead with the main point; then supporting details; end with implication or next step if relevant.
3. **Attribution:** When facts come from a specific source, mention it (e.g. "According to …", "Source: …").
4. **Length:** Match the requested format (summary vs article vs post). If not specified, default to a short article (3–5 paragraphs).
5. **No fabrication:** Only state facts that were provided or that you can infer from the given context; do not invent quotes or statistics.

## Workflow

1. Take the input (topic, verified facts, headlines, or bullet points).
2. Choose the right output type (summary / article / post).
3. Draft the content following the guidelines above.
4. Optionally output in Markdown; if the pipeline needs HTML, the next step can use markdown-to-html.