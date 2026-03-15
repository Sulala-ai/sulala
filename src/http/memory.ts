import type { URL } from "bun";
import { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, errorMessage, parseJsonBody } from "./utils.js";
import { getEmbedding, cosineSimilarity } from "../core/embeddings.js";

export async function handleMemoryWrite(
  req: Request,
  store: MemoryStore
): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const parsed = await parseJsonBody<{
    user_id?: string;
    agent_id?: string;
    text?: string;
    tags?: unknown;
    embed?: boolean;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const agent_id = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const user_id = typeof body.user_id === "string" ? body.user_id.trim() : null;
  if (!agent_id || !text) {
    return jsonResponse({ error: "Missing required fields: agent_id, text" }, 400);
  }
  let embedding: number[] | null = null;
  if (body.embed) {
    embedding = await getEmbedding(text);
  }
  try {
    const id = store.insertMemory({
      user_id,
      agent_id,
      text,
      tags: body.tags,
      embedding: embedding ?? undefined,
    });
    return jsonResponse({ ok: true, id }, 201);
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
}

const SEMANTIC_CANDIDATES_LIMIT = 100;

export async function handleMemorySearch(
  req: Request,
  url: URL,
  store: MemoryStore
): Promise<Response> {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const user_id = url.searchParams.get("user_id");
  const agent_id = url.searchParams.get("agent_id");
  const q = url.searchParams.get("q") ?? "";
  const semantic = url.searchParams.get("semantic") === "1" || url.searchParams.get("semantic") === "true";
  const limitRaw = url.searchParams.get("limit");
  const limit =
    limitRaw && !Number.isNaN(Number(limitRaw)) && Number(limitRaw) > 0
      ? Math.min(Number(limitRaw), 50)
      : 10;

  try {
    if (semantic && q.trim()) {
      const queryEmbedding = await getEmbedding(q);
      if (!queryEmbedding) {
        const rows = store.searchMemories({ user_id, agent_id, q, limit });
        return jsonResponse({ results: rows });
      }
      const candidates = store.getMemoriesWithEmbeddings({
        user_id: user_id ?? undefined,
        agent_id: agent_id ?? undefined,
        limit: SEMANTIC_CANDIDATES_LIMIT,
      });
      const withScore = candidates.map((row) => {
        const emb = row.embedding ? (JSON.parse(row.embedding) as number[]) : null;
        const score = emb ? cosineSimilarity(queryEmbedding, emb) : -1;
        return { row, score };
      });
      withScore.sort((a, b) => b.score - a.score);
      const results = withScore.slice(0, limit).map(({ row }) => ({
        id: row.id,
        user_id: row.user_id,
        agent_id: row.agent_id,
        scope: row.scope,
        text: row.text,
        tags: row.tags,
        created_at: row.created_at,
      }));
      return jsonResponse({ results });
    }
    const rows = store.searchMemories({
      user_id,
      agent_id,
      q,
      limit,
    });
    return jsonResponse({ results: rows });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
}

export async function handleMemoryDelete(
  idRaw: string,
  store: MemoryStore
): Promise<Response> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id < 1) {
    return jsonResponse({ error: "Invalid memory id" }, 400);
  }
  try {
    const deleted = store.deleteMemory(id);
    if (!deleted) {
      return jsonResponse({ error: "Memory not found" }, 404);
    }
    return jsonResponse({ ok: true });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
}

