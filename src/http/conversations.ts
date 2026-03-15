import type { URL } from "bun";
import { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, errorMessage, parseJsonBody } from "./utils.js";
import { loadAgents } from "../core/agent-registry.js";
import { runAgent } from "../core/runtime.js";

interface ConversationMessageBody {
  conversation_id?: string;
  agent_id?: string;
  graph_id?: string;
  user_id?: string;
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
}

export async function handleConversations(
  req: Request,
  url: URL,
  store: MemoryStore
): Promise<Response> {
  if (req.method === "POST") {
    const parsed = await parseJsonBody<ConversationMessageBody>(req);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const graph_id = typeof body.graph_id === "string" ? body.graph_id.trim() : null;
    const agent_id = typeof body.agent_id === "string" ? body.agent_id.trim() : (graph_id ?? "");
    const role = body.role;
    const user_id = typeof body.user_id === "string" ? body.user_id.trim() : null;
    if (!role || typeof body.content === "undefined") {
      return jsonResponse(
        { error: "Missing required fields: role, content" },
        400
      );
    }
    if (!graph_id && !agent_id) {
      return jsonResponse(
        { error: "Missing required field: agent_id or graph_id" },
        400
      );
    }

    const baseId =
      typeof body.conversation_id === "string" && body.conversation_id.trim()
        ? body.conversation_id.trim()
        : crypto.randomUUID();

    try {
      store.ensureConversation(baseId, agent_id, user_id, graph_id ?? undefined);

      const contentJson = JSON.stringify(body.content);
      const messageId = store.insertConversationMessage({
        conversation_id: baseId,
        agent_id: graph_id ?? agent_id,
        user_id,
        role,
        contentJson,
      });

      if (role === "user") {
        const c = body.content as unknown;
        const firstText =
          typeof c === "object" && c !== null && "text" in c && typeof (c as { text: unknown }).text === "string"
            ? (c as { text: string }).text
            : typeof c === "string"
              ? c
              : "";
        const title = firstText.trim().slice(0, 80) || "New conversation";
        store.updateConversationTitleOnce(baseId, title);
      }

      return jsonResponse(
        {
          ok: true,
          conversation_id: baseId,
          message_id: messageId,
        },
        201
      );
    } catch (err) {
      const msg = errorMessage(err);
      return jsonResponse({ error: msg }, 500);
    }
  }

  if (req.method === "GET") {
    const conversation_id = url.searchParams.get("conversation_id");
    const listForAgent = url.searchParams.get("agent_id");
    const listForGraph = url.searchParams.get("graph_id");

    if (conversation_id) {
      const limitRaw = url.searchParams.get("limit");
      const limit =
        limitRaw && !Number.isNaN(Number(limitRaw)) && Number(limitRaw) > 0
          ? Math.min(Number(limitRaw), 200)
          : 50;
      try {
        const rows = store.getConversationMessages({
          conversation_id,
          limit,
        }).map((row) => ({
          ...row,
          content:
            typeof row.content === "string"
              ? (() => {
                  try {
                    return JSON.parse(row.content);
                  } catch {
                    return row.content;
                  }
                })()
              : row.content,
        }));
        return jsonResponse({ messages: rows });
      } catch (err) {
        const msg = errorMessage(err);
        return jsonResponse({ error: msg }, 500);
      }
    }

    if (listForAgent) {
      const limitRaw = url.searchParams.get("limit");
      const limit =
        limitRaw && !Number.isNaN(Number(limitRaw)) && Number(limitRaw) > 0
          ? Math.min(Number(limitRaw), 100)
          : 20;
      try {
        const rows = store.listConversations({ agent_id: listForAgent, limit });
        return jsonResponse({ conversations: rows });
      } catch (err) {
        const msg = errorMessage(err);
        return jsonResponse({ error: msg }, 500);
      }
    }

    if (listForGraph) {
      const limitRaw = url.searchParams.get("limit");
      const limit =
        limitRaw && !Number.isNaN(Number(limitRaw)) && Number(limitRaw) > 0
          ? Math.min(Number(limitRaw), 100)
          : 20;
      try {
        const rows = store.listConversations({ graph_id: listForGraph, limit });
        return jsonResponse({ conversations: rows });
      } catch (err) {
        const msg = errorMessage(err);
        return jsonResponse({ error: msg }, 500);
      }
    }

    return jsonResponse({ error: "conversation_id, agent_id, or graph_id is required" }, 400);
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

export async function handleConversationUpdate(
  req: Request,
  conversationId: string,
  store: MemoryStore
): Promise<Response> {
  if (req.method !== "PUT") return jsonResponse({ error: "Method not allowed" }, 405);
  const parsed = await parseJsonBody<{ title?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const title = typeof parsed.body.title === "string" ? parsed.body.title.trim().slice(0, 200) : "";
  try {
    store.updateConversationTitle(conversationId, title || null);
    return jsonResponse({ ok: true });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
}

export async function handleConversationSummarize(
  req: Request,
  store: MemoryStore
): Promise<Response> {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const parsed = await parseJsonBody<{ conversation_id: string; agent_id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const conversation_id = parsed.body.conversation_id?.trim();
  if (!conversation_id) {
    return jsonResponse({ error: "conversation_id is required" }, 400);
  }

  let rows: Array<{ role: string; content: string }> = [];
  try {
    rows = store.getConversationTranscript(conversation_id);
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
  if (rows.length === 0) {
    return jsonResponse({ error: "No messages to summarize" }, 400);
  }

  const transcript = rows
    .map((row) => {
      let text = row.content;
      if (typeof text === "string" && text.startsWith("{")) {
        try {
          const parsed = JSON.parse(text) as { text?: string };
          if (typeof parsed.text === "string") text = parsed.text;
        } catch {
          // keep raw
        }
      }
      const prefix = row.role === "user" ? "User" : "Assistant";
      return `${prefix}: ${text}`;
    })
    .join("\n");

  const agents = await loadAgents();
  const summarizer = agents.find((a) => a.id === "summarizer_agent");
  if (!summarizer) {
    return jsonResponse({ error: "Summarizer agent not found (id: summarizer_agent)" }, 500);
  }

  const prompt = `Summarize the following conversation in a short paragraph capturing the key points and any important facts. Be concise.\n\n${transcript}`;

  try {
    const result = await runAgent({ agent: summarizer, task: prompt });
    if (!result.success || !result.output.trim()) {
      return jsonResponse({ error: "Summarizer agent failed", detail: result }, 500);
    }
    const summary = result.output.trim();
    const contentJson = JSON.stringify({ text: summary, type: "summary" });
    store.insertConversationMessage({
      conversation_id,
      agent_id: summarizer.id,
      user_id: null,
      role: "assistant",
      contentJson,
    });
    return jsonResponse({ ok: true, summary });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
}

