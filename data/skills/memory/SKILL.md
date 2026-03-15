---
name: memory
description: Store and retrieve long-term memories about the user and conversations (preferences, profile, important facts).
tools:
  - id: memory_write
    description: Store a fact in long-term memory. Pass body with agent_id (your current agent id), text (the fact in natural language), optional user_id and tags (e.g. ["profile"]).
    method: POST
    path: /api/memory/write
  - id: memory_search
    description: Search long-term memory. Pass query params q (search string), optional agent_id, user_id, limit (default 10). Use semantic=1 for meaning-based search.
    method: GET
    path: /api/memory/search
---

# Memory Skill

Use this skill to **remember** important facts and **recall** them later.

## When to use this skill

**You MUST call this skill when:**

- The user says anything like:
  - "Remember that I …" / "Can you remember that …" / "Please save this about me …"
  - "My [X] is …" (e.g. "My DOB is 25 May 1997", "My name is …", "I live in …")
- The user asks:
  - "What do I love?" / "Where do I live?" / "What do you remember about me?" / "What did I tell you about X?"

**Flow:**

- For **new information to store**: call **memory_write** (POST) with a clear `text` fact.
- For **recall**: call **memory_search** (GET) with `q` set to relevant keywords, then answer from the results.

## Write memory (store a fact)

- **Method**: `POST`
- **Path**: `/api/memory/write`
- **Body (JSON)**:
  - `agent_id` (string, required) — your current agent id (e.g. from the run context)
  - `text` (string, required) — the fact in natural language (e.g. "User's date of birth is 25 May 1997")
  - `user_id` (string, optional)
  - `tags` (array of strings, optional) — e.g. `["profile"]`, `["preference"]`

**Example — user says "save my dob is 25 may 1997":**

```json
{
  "body": {
    "agent_id": "personal_agent",
    "text": "User's date of birth is 25 May 1997.",
    "tags": ["profile"]
  }
}
```

Use the correct `agent_id` for the current agent. Write a clear, standalone sentence in `text`.

## Search memory

- **Method**: `GET`
- **Path**: `/api/memory/search`
- **Query**: `q` (search string), optional `agent_id`, `user_id`, `limit` (default 10). Add `semantic=1` for similarity search when embeddings are available.

The server base URL is configured at runtime (e.g. set `AGENT_OS_SKILL_BASE_URL` to `http://127.0.0.1:3010` when running locally).
