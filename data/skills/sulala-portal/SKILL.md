---
name: sulala-portal
description: Use your Sulala Portal connections (Gmail, Google Docs, etc.) via the Portal Gateway API. List and use OAuth-connected accounts.
base_url_env: PORTAL_GATEWAY_URL
credentials:
  - PORTAL_API_KEY
auth_scheme: Bearer
auth_location: header
auth_param: Authorization
---

# Sulala Portal Connection Skill

**For listing connections, Gmail, or any Portal Gateway request: use the tool `sulala-portal_request` only.** Do not use other tools whose names end in `_request` (e.g. weather-geocode_request) for connections or Portal — they call different APIs and will return 404.

When the user says "list connection(s)" or "list connections": call **sulala-portal_request** with `{ "method": "GET", "path": "connections" }` immediately. Do not use echo, memory_search, or memory_write for this — only sulala-portal_request returns the actual Portal connections.

## How to call

Use the generic request tool for this skill:

- **Tool id**: `sulala-portal_request`
- **Method**: `GET` (list) or `POST` (connect, get token, provider actions)
- **Path**: relative to the gateway base (e.g. `connections`, `connections/{id}/use`). No leading slash.
- **Query** (optional): object, e.g. `{ "provider": "gmail" }` if the API supports filtering.
- **Body** (optional): for POST, e.g. `{ "provider": "gmail" }` for connect, or provider-specific payload.

Example — list all connections:

```json
{
  "method": "GET",
  "path": "connections"
}
```

Example — list connections (filter by provider if supported):

```json
{
  "method": "GET",
  "path": "connections",
  "query": { "provider": "gmail" }
}
```

Example — get access token: use the connection’s `id` (UUID) from the list in the path. If you get 404, try the connection’s `connection_id` (e.g. `conn_gmail_...`) in the path instead.

```json
{
  "method": "POST",
  "path": "connections/{id}/use"
}
```

## Configuration (runtime)

Set these in your environment or in the agent/skill config (e.g. `~/.agent-os/configs/sulala-portal.json` or env vars):

- **PORTAL_GATEWAY_URL** — Base URL of the Portal Gateway (e.g. `https://portal.sulala.ai/api/gateway`). No trailing slash.
- **PORTAL_API_KEY** — Your Portal API key used to authenticate requests.

Get **PORTAL_API_KEY** from [portal.sulala.ai](https://portal.sulala.ai) → Account / Developer / Settings → create or copy an API key. Connections (Gmail, Docs, etc.) are managed in the same portal; connect accounts there, then use this skill to list and use them via the API.

---

## Portal Gateway API reference

All paths below are relative to the gateway base (PORTAL_GATEWAY_URL). Use them in the `path` field of sulala-portal_request.

### Connections

| Method | Path | Description |
|--------|------|-------------|
| GET | `connections` | List the tenant's connections. Response: `{ connections: Array<{ id, connection_id, provider, created_at }> }`. |
| POST | `connect` | Start OAuth for a provider. Body: `{ "provider": string, "redirect_success"?: string }` (e.g. provider `"gmail"`, `"github"`). Response: `{ authUrl, connectionId }`. Redirect user to authUrl. 402 = free plan limit. |
| POST | `connections/:id/use` | Get an access token for a connection (for agent or backend). Response: `{ connectionId, provider, accessToken, scopes }`. 404 = not found or not owned. **If 404, try `connection_id` from the list in the path instead of `id`.** |
| DELETE | `connections/:id` | Disconnect and remove the connection. Response: `{ ok: true }`. 404 = not found or access denied. |

### Provider-specific actions (same auth)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `connections/:id/bsky-create-post` | `{ text, imageBase64?, imageMimeType?, alt? }` | Create a Bluesky post. |
| POST | `connections/:id/bsky-request` | As required by integrations API | Bluesky XRPC proxy (DPoP-bound). |
| POST | `connections/:id/youtube-upload` | `{ title, description?, privacyStatus?, video_url }` | Upload a video to YouTube. |

All return integration-specific success/error payloads; 404 if connection not found or not owned. After listing, filter the `connections` array by `provider === "gmail"` (or use query if the API supports it).

## Base URL

The base URL is **not** set in the skill. Configure **PORTAL_GATEWAY_URL** where the agent runs (e.g. `https://portal.sulala.ai/api/gateway`). The loader uses that value at runtime so the skill never contains a hardcoded integration URL.
