import type { HeadersInit } from "bun";
import type { MemoryStore } from "../db/memory-store.js";

export const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** JSON response with CORS headers (Bun-native Response.json + our CORS). */
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: CORS_HEADERS,
  });
}

export { errorMessage } from "../core/error.js";

/** Parse JSON body; returns error response on failure. */
export async function parseJsonBody<T>(req: Request): Promise<{ ok: true; body: T } | { ok: false; response: Response }> {
  try {
    const body = (await req.json()) as T;
    return { ok: true, body };
  } catch {
    return { ok: false, response: jsonResponse({ error: "Invalid JSON body" }, 400) };
  }
}

export type ConversationTurn = { role: "user" | "assistant"; content: string };

/** Load conversation history from store and normalize content (e.g. JSON { text } → string) for agent run. */
export function getConversationHistoryForRun(
  memoryStore: MemoryStore,
  conversationId: string,
  limit = 40
): ConversationTurn[] {
  const rows = memoryStore.getHistoryForConversation(conversationId, limit);
  return rows.map((row) => {
    let text = row.content;
    if (typeof text === "string" && text.startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as { text?: string };
        if (typeof parsed.text === "string") text = parsed.text;
      } catch {
        // keep raw
      }
    }
    return { role: row.role as "user" | "assistant", content: String(text) };
  });
}

