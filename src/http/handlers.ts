import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { MemoryStore } from "../db/memory-store.js";
import { jsonResponse, CORS_HEADERS, getConversationHistoryForRun, errorMessage, parseJsonBody } from "./utils.js";
import { loadAgents } from "../core/agent-registry.js";
import { runAgent, runAgentStream, type AgentStreamEvent } from "../core/runtime.js";
import {
  enqueueTask,
  enqueueGraphTask,
  listTasks,
  getTaskById,
} from "../core/tasks.js";
import { getRecentEvents } from "../core/events.js";
import { loadGraph, runGraph, runGraphStream, type GraphStreamEvent } from "../core/graphs.js";
import {
  readConfig,
  writeConfig,
  readSkillConfig,
  writeSkillConfig,
  ensureWorkspace,
  getWorkspaceDir,
  resolveInWorkspace,
  readMcpConfig,
  writeMcpConfig,
  getSuggestModelId,
  type McpServerConfig,
} from "../core/config.js";
import {
  installSkillFromPath,
  installSkillFromUrl,
  installSkillFromUpload,
  installSkillFromSkillMd,
  listSkills,
} from "../skills/loader.js";
import { callLLM } from "../core/llm.js";
import { testMcpServer } from "../mcp/registry.js";

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

function safeMcpId(id: string): string {
  return id.replace(/[^a-z0-9_-]/gi, "_").trim();
}

function maskEnvKeys(env?: Record<string, string>): Record<string, boolean> | undefined {
  if (!env) return undefined;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(env)) out[k] = Boolean(String(v ?? "").trim());
  return out;
}

export async function handleRun(req: Request, memoryStore: MemoryStore): Promise<Response> {
  const parsed = await parseJsonBody<{ agent_id: string; task: string; conversation_id?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { agent_id, task, conversation_id } = parsed.body;
  if (!agent_id || typeof task !== "string") {
    return jsonResponse(
      { error: "Missing required fields: agent_id, task" },
      400
    );
  }

  const agents = await loadAgents();
  const agent = agents.find((a) => a.id === agent_id);
  if (!agent) {
    return jsonResponse({ error: `Agent not found: ${agent_id}` }, 404);
  }

  let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (conversation_id?.trim()) {
    try {
      conversationHistory = getConversationHistoryForRun(memoryStore, conversation_id.trim());
    } catch {
      // ignore; run without history
    }
  }

  try {
    const result = await runAgent({ agent, task, conversationHistory });
    return jsonResponse(result);
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
}

const SSE_HEADERS: HeadersInit = {
  ...CORS_HEADERS,
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as HeadersInit;

export async function handleRunStream(req: Request, memoryStore: MemoryStore): Promise<Response> {
  const parsed = await parseJsonBody<{ agent_id: string; task: string; conversation_id?: string; attachment_paths?: string[] }>(req);
  if (!parsed.ok) return parsed.response;
  const { agent_id, task, conversation_id, attachment_paths } = parsed.body;
  if (!agent_id || typeof task !== "string") {
    return jsonResponse({ error: "Missing required fields: agent_id, task" }, 400);
  }
  const effectiveTask =
    Array.isArray(attachment_paths) && attachment_paths.length > 0
      ? `${task}\n\n[Attached file(s) available at: ${attachment_paths.join(", ")}]. Use these paths when the user asks to upload or process a file.`
      : task;

  const agents = await loadAgents();
  const agent = agents.find((a) => a.id === agent_id);
  if (!agent) {
    return jsonResponse({ error: `Agent not found: ${agent_id}` }, 404);
  }

  let conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  if (conversation_id?.trim()) {
    try {
      conversationHistory = getConversationHistoryForRun(memoryStore, conversation_id.trim());
    } catch {
      // ignore
    }
  }

  const encoder = new TextEncoder();
  function send(type: string, data: object): string {
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runAgentStream({ agent, task: effectiveTask, conversationHistory }, (ev: AgentStreamEvent) => {
          if (ev.type === "assistant") {
            controller.enqueue(encoder.encode(send("assistant", { delta: ev.delta })));
          } else if (ev.type === "tool_call") {
            controller.enqueue(encoder.encode(send("tool_call", { name: ev.name, result: ev.result, error: ev.error })));
          } else if (ev.type === "done") {
            controller.enqueue(
              encoder.encode(
                send("done", {
                  finalContent: ev.finalContent,
                  turnCount: ev.turnCount,
                  usage: ev.usage,
                  model: ev.model,
                  steps: ev.steps,
                  artifact: ev.artifact,
                })
              )
            );
          } else if (ev.type === "error") {
            controller.enqueue(encoder.encode(send("error", { message: ev.message })));
          }
        });
      } catch (err) {
        const msg = errorMessage(err);
        controller.enqueue(encoder.encode(send("error", { message: msg })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export async function handleTasks(req: Request, url: URL): Promise<Response> {
  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    if (id) {
      const task = await getTaskById(id);
      if (!task) return jsonResponse({ error: "Task not found" }, 404);
      return jsonResponse({ task });
    }
    let tasks = await listTasks();
    const agentId = url.searchParams.get("agent_id");
    const graphId = url.searchParams.get("graph_id");
    const status = url.searchParams.get("status");
    const limit = url.searchParams.get("limit");
    if (agentId) {
      tasks = tasks.filter((t) => t.agent_id === agentId);
    }
    if (graphId) {
      tasks = tasks.filter((t) => t.graph_id === graphId);
    }
    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }
    if (limit) {
      const n = Number(limit);
      if (!Number.isNaN(n) && n > 0) {
        tasks = tasks.slice(-n);
      }
    }
    return jsonResponse({ tasks });
  }

  if (req.method === "POST") {
    const parsed = await parseJsonBody<{ agent_id?: string; graph_id?: string; task: string }>(req);
    if (!parsed.ok) return parsed.response;
    const { agent_id, graph_id, task } = parsed.body;
    if (typeof task !== "string") {
      return jsonResponse({ error: "Missing required field: task" }, 400);
    }
    if (graph_id && !agent_id) {
      const t = await enqueueGraphTask(graph_id, task);
      return jsonResponse({ task: t }, 202);
    }
    if (agent_id && !graph_id) {
      const t = await enqueueTask(agent_id, task);
      return jsonResponse({ task: t }, 202);
    }
    return jsonResponse(
      { error: "Provide exactly one of agent_id or graph_id" },
      400
    );
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

export async function handleLogs(req: Request): Promise<Response> {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const events = getRecentEvents();
  return jsonResponse({ events });
}

export async function handleSkillInstall(req: Request): Promise<Response> {
  const parsed = await parseJsonBody<{
    path?: string;
    url?: string;
    slug?: string;
    version?: string;
    logo?: string;
    category?: string;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;
  const hasPath = typeof body.path === "string" && body.path.trim().length > 0;
  const hasUrl = typeof body.url === "string" && body.url.trim().length > 0;
  if (hasPath && hasUrl) {
    return jsonResponse({ error: "Provide path or url, not both" }, 400);
  }
  if (!hasPath && !hasUrl) {
    return jsonResponse({ error: "Provide path or url" }, 400);
  }
  const slug = typeof body.slug === "string" && body.slug.trim() !== "" ? body.slug.trim() : undefined;
  const version = typeof body.version === "string" && body.version.trim() !== "" ? body.version.trim() : undefined;
  const logo = typeof body.logo === "string" && body.logo.trim() !== "" ? body.logo.trim() : undefined;
  const category = typeof body.category === "string" && body.category.trim() !== "" ? body.category.trim() : undefined;
  const meta =
    version || slug || logo || category
      ? { version, source: slug ? "hub" : undefined, logo, category }
      : undefined;
  try {
    const result = hasPath
      ? await installSkillFromPath(body.path!.trim())
      : await installSkillFromUrl(body.url!.trim(), slug, meta);
    return jsonResponse({ skill: result }, 201);
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 400);
  }
}

export async function handleSkillUpload(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart body" }, 400);
  }
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return jsonResponse({ error: "Missing file; use form field 'file'" }, 400);
  }
  const name = file.name || "archive.tar.gz";
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength === 0) {
    return jsonResponse({ error: "File is empty" }, 400);
  }
  try {
    const result = await installSkillFromUpload(buffer, name);
    return jsonResponse({ skill: result }, 201);
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 400);
  }
}

export async function handleSkillMdUpload(req: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart body" }, 400);
  }
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return jsonResponse({ error: "Missing file; use form field 'file'" }, 400);
  }
  const name = (file as File).name || "SKILL.md";
  const lower = name.toLowerCase();
  if (!lower.endsWith(".md") && !lower.endsWith(".markdown")) {
    return jsonResponse({ error: "File must be a .md or .markdown file" }, 400);
  }
  const buffer = await (file as File).arrayBuffer();
  if (buffer.byteLength === 0) {
    return jsonResponse({ error: "File is empty" }, 400);
  }
  const explicitId = formData.get("id");
  const idParam = typeof explicitId === "string" ? explicitId.trim() || undefined : undefined;
  try {
    const result = await installSkillFromSkillMd(buffer, name, idParam);
    return jsonResponse({ skill: result }, 201);
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 400);
  }
}

export async function handleSettings(req: Request): Promise<Response> {
  if (req.method === "GET") {
    const config = await readConfig();
    return jsonResponse({
      has_api_key: Boolean(config.api_key?.trim()),
      provider: config.provider ?? null,
      has_openai_key: Boolean(config.openai_api_key?.trim()),
      has_anthropic_key: Boolean(config.anthropic_api_key?.trim()),
      has_google_key: Boolean(config.google_api_key?.trim()),
      has_openrouter_key: Boolean(config.openrouter_api_key?.trim()),
      telegram_configured: Boolean(config.telegram_bot_token?.trim()),
      telegram_default_agent_id: config.telegram_default_agent_id ?? null,
      telegram_report_chat_id: config.telegram_report_chat_id ?? null,
      slack_configured: Boolean(config.slack_bot_token?.trim()),
      slack_default_agent_id: config.slack_default_agent_id ?? null,
      discord_configured: Boolean(config.discord_bot_token?.trim()),
      discord_default_agent_id: config.discord_default_agent_id ?? null,
      signal_configured: Boolean(config.signal_bridge_url?.trim()),
      signal_default_agent_id: config.signal_default_agent_id ?? null,
      signal_bridge_url: config.signal_bridge_url ?? null,
      viber_configured: Boolean(config.viber_auth_token?.trim()),
      viber_default_agent_id: config.viber_default_agent_id ?? null,
      onboarding_completed: config.onboarding_completed === true,
      ollama_enabled: config.ollama_enabled === true,
      ollama_base_url: config.ollama_base_url ?? null,
      ollama_default_model: config.ollama_default_model ?? null,
      has_ollama_api_key: Boolean(config.ollama_api_key?.trim()),
      custom_openai_base_url: config.custom_openai_base_url ?? null,
      has_custom_openai_key: Boolean(config.custom_openai_api_key?.trim()),
      custom_openai_default_model: config.custom_openai_default_model ?? null,
    });
  }
  if (req.method === "PUT") {
    let body: {
      provider?: "openrouter" | "openai";
      api_key?: string;
      openai_api_key?: string | null;
      anthropic_api_key?: string | null;
      google_api_key?: string | null;
      openrouter_api_key?: string | null;
      ollama_enabled?: boolean | null;
      ollama_base_url?: string | null;
      ollama_default_model?: string | null;
      ollama_api_key?: string | null;
      telegram_bot_token?: string | null;
      telegram_default_agent_id?: string | null;
      telegram_report_chat_id?: string | null;
      slack_bot_token?: string | null;
      slack_signing_secret?: string | null;
      slack_default_agent_id?: string | null;
      discord_bot_token?: string | null;
      discord_public_key?: string | null;
      discord_default_agent_id?: string | null;
      signal_bridge_url?: string | null;
      signal_default_agent_id?: string | null;
      viber_auth_token?: string | null;
      viber_default_agent_id?: string | null;
      onboarding_completed?: boolean | null;
      custom_openai_base_url?: string | null;
      custom_openai_api_key?: string | null;
      custom_openai_default_model?: string | null;
    };
    const parsed = await parseJsonBody<typeof body>(req);
    if (!parsed.ok) return parsed.response;
    body = parsed.body;
    const current = await readConfig();
    const provider =
      body.provider === "openrouter" || body.provider === "openai"
        ? body.provider
        : undefined;
    const rawKey =
      typeof body.api_key === "string" ? body.api_key.trim() : undefined;
    const api_key =
      rawKey !== undefined && rawKey !== ""
        ? rawKey
        : current.api_key ?? undefined;
    const openai_api_key =
      body.openai_api_key !== undefined
        ? (typeof body.openai_api_key === "string" ? body.openai_api_key.trim() || undefined : undefined)
        : current.openai_api_key;
    const anthropic_api_key =
      body.anthropic_api_key !== undefined
        ? (typeof body.anthropic_api_key === "string" ? body.anthropic_api_key.trim() || undefined : undefined)
        : current.anthropic_api_key;
    const google_api_key =
      body.google_api_key !== undefined
        ? (typeof body.google_api_key === "string" ? body.google_api_key.trim() || undefined : undefined)
        : current.google_api_key;
    const openrouter_api_key =
      body.openrouter_api_key !== undefined
        ? (typeof body.openrouter_api_key === "string" ? body.openrouter_api_key.trim() || undefined : undefined)
        : current.openrouter_api_key;
    const telegram_bot_token =
      body.telegram_bot_token !== undefined
        ? (typeof body.telegram_bot_token === "string" ? body.telegram_bot_token.trim() : undefined)
        : current.telegram_bot_token;
    const telegram_default_agent_id =
      body.telegram_default_agent_id !== undefined
        ? (typeof body.telegram_default_agent_id === "string" ? body.telegram_default_agent_id.trim() || undefined : undefined)
        : current.telegram_default_agent_id;
    const telegram_report_chat_id =
      body.telegram_report_chat_id !== undefined
        ? (typeof body.telegram_report_chat_id === "string" ? body.telegram_report_chat_id.trim() || undefined : undefined)
        : current.telegram_report_chat_id;
    const slack_bot_token =
      body.slack_bot_token !== undefined
        ? (typeof body.slack_bot_token === "string" ? body.slack_bot_token.trim() : undefined)
        : current.slack_bot_token;
    const slack_signing_secret =
      body.slack_signing_secret !== undefined
        ? (typeof body.slack_signing_secret === "string" ? body.slack_signing_secret.trim() : undefined)
        : current.slack_signing_secret;
    const slack_default_agent_id =
      body.slack_default_agent_id !== undefined
        ? (typeof body.slack_default_agent_id === "string" ? body.slack_default_agent_id.trim() || undefined : undefined)
        : current.slack_default_agent_id;
    const discord_bot_token =
      body.discord_bot_token !== undefined
        ? (typeof body.discord_bot_token === "string" ? body.discord_bot_token.trim() : undefined)
        : current.discord_bot_token;
    const discord_public_key =
      body.discord_public_key !== undefined
        ? (typeof body.discord_public_key === "string" ? body.discord_public_key.trim() : undefined)
        : current.discord_public_key;
    const discord_default_agent_id =
      body.discord_default_agent_id !== undefined
        ? (typeof body.discord_default_agent_id === "string" ? body.discord_default_agent_id.trim() || undefined : undefined)
        : current.discord_default_agent_id;
    const signal_bridge_url =
      body.signal_bridge_url !== undefined
        ? (typeof body.signal_bridge_url === "string" ? body.signal_bridge_url.trim() || undefined : undefined)
        : current.signal_bridge_url;
    const signal_default_agent_id =
      body.signal_default_agent_id !== undefined
        ? (typeof body.signal_default_agent_id === "string" ? body.signal_default_agent_id.trim() || undefined : undefined)
        : current.signal_default_agent_id;
    const viber_auth_token =
      body.viber_auth_token !== undefined
        ? (typeof body.viber_auth_token === "string" ? body.viber_auth_token.trim() || undefined : undefined)
        : current.viber_auth_token;
    const viber_default_agent_id =
      body.viber_default_agent_id !== undefined
        ? (typeof body.viber_default_agent_id === "string" ? body.viber_default_agent_id.trim() || undefined : undefined)
        : current.viber_default_agent_id;
    const onboarding_completed =
      body.onboarding_completed !== undefined
        ? (body.onboarding_completed === true ? true : undefined)
        : current.onboarding_completed;
    const ollama_enabled =
      body.ollama_enabled !== undefined ? Boolean(body.ollama_enabled) : undefined;
    const ollama_base_url =
      body.ollama_base_url !== undefined
        ? (typeof body.ollama_base_url === "string" ? body.ollama_base_url.trim() || undefined : undefined)
        : undefined;
    const ollama_default_model =
      body.ollama_default_model !== undefined
        ? (typeof body.ollama_default_model === "string" ? body.ollama_default_model.trim() || undefined : undefined)
        : undefined;
    const ollama_api_key =
      body.ollama_api_key !== undefined
        ? (typeof body.ollama_api_key === "string" ? body.ollama_api_key.trim() || undefined : undefined)
        : undefined;
    const custom_openai_base_url =
      body.custom_openai_base_url !== undefined
        ? (typeof body.custom_openai_base_url === "string" ? body.custom_openai_base_url.trim() || undefined : undefined)
        : undefined;
    const custom_openai_api_key =
      body.custom_openai_api_key !== undefined
        ? (typeof body.custom_openai_api_key === "string" ? body.custom_openai_api_key.trim() || undefined : undefined)
        : undefined;
    const custom_openai_default_model =
      body.custom_openai_default_model !== undefined
        ? (typeof body.custom_openai_default_model === "string"
            ? body.custom_openai_default_model.trim() || undefined
            : undefined)
        : undefined;
    await writeConfig({
      provider: provider ?? current.provider,
      api_key: api_key || undefined,
      openai_api_key: openai_api_key ?? undefined,
      anthropic_api_key: anthropic_api_key ?? undefined,
      google_api_key: google_api_key ?? undefined,
      openrouter_api_key: openrouter_api_key ?? undefined,
      telegram_bot_token: telegram_bot_token || undefined,
      telegram_default_agent_id: telegram_default_agent_id || undefined,
      telegram_report_chat_id: telegram_report_chat_id ?? undefined,
      slack_bot_token: slack_bot_token || undefined,
      slack_signing_secret: slack_signing_secret ?? undefined,
      slack_default_agent_id: slack_default_agent_id || undefined,
      discord_bot_token: discord_bot_token || undefined,
      discord_public_key: discord_public_key ?? undefined,
      discord_default_agent_id: discord_default_agent_id || undefined,
      signal_bridge_url: signal_bridge_url || undefined,
      signal_default_agent_id: signal_default_agent_id || undefined,
      viber_auth_token: viber_auth_token || undefined,
      viber_default_agent_id: viber_default_agent_id || undefined,
      onboarding_completed: onboarding_completed ?? undefined,
      ollama_enabled:
        ollama_enabled !== undefined ? ollama_enabled : current.ollama_enabled,
      ollama_base_url: ollama_base_url !== undefined ? ollama_base_url : current.ollama_base_url,
      ollama_default_model: ollama_default_model !== undefined ? ollama_default_model : current.ollama_default_model,
      ollama_api_key: ollama_api_key !== undefined ? ollama_api_key : current.ollama_api_key,
      custom_openai_base_url:
        custom_openai_base_url !== undefined ? custom_openai_base_url : current.custom_openai_base_url,
      custom_openai_api_key:
        custom_openai_api_key !== undefined ? custom_openai_api_key : current.custom_openai_api_key,
      custom_openai_default_model:
        custom_openai_default_model !== undefined
          ? custom_openai_default_model
          : current.custom_openai_default_model,
    });
    return jsonResponse({ ok: true });
  }
  return jsonResponse({ error: "Method not allowed" }, 405);
}

export async function handleMcpServers(req: Request): Promise<Response> {
  if (req.method === "GET") {
    const servers = await readMcpConfig();
    // Never return raw env values; only whether each key is configured.
    return jsonResponse({
      servers: servers.map((s) => ({
        id: s.id,
        name: s.name ?? null,
        enabled: s.enabled !== false,
        transport: "stdio",
        command: s.command,
        args: s.args ?? [],
        env_configured: maskEnvKeys(s.env) ?? {},
      })),
    });
  }

  if (req.method === "PUT") {
    const parsed = await parseJsonBody<{
      servers: Array<{
        id: string;
        name?: string | null;
        enabled?: boolean;
        transport?: "stdio";
        command: string;
        args?: string[];
        env?: Record<string, string>;
      }>;
    }>(req);
    if (!parsed.ok) return parsed.response;
    const list = Array.isArray(parsed.body.servers) ? parsed.body.servers : [];
    const out: McpServerConfig[] = [];
    for (const s of list) {
      const id = safeMcpId(String(s.id ?? ""));
      const command = typeof s.command === "string" ? s.command.trim() : "";
      if (!id || !command) continue;
      out.push({
        id,
        name: typeof s.name === "string" ? s.name.trim() || undefined : undefined,
        enabled: s.enabled === false ? false : true,
        transport: "stdio",
        command,
        args: Array.isArray(s.args) ? s.args.filter((a): a is string => typeof a === "string") : undefined,
        env: isPlainObject(s.env)
          ? (Object.fromEntries(Object.entries(s.env).filter(([, v]) => typeof v === "string")) as Record<string, string>)
          : undefined,
      });
    }
    await writeMcpConfig(out);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
}

export async function handleMcpServerDelete(id: string): Promise<Response> {
  const safeId = safeMcpId(id);
  if (!safeId) return jsonResponse({ error: "Invalid id" }, 400);
  const servers = await readMcpConfig();
  const next = servers.filter((s) => s.id !== safeId);
  await writeMcpConfig(next);
  return jsonResponse({ ok: true });
}

export async function handleMcpServerTest(req: Request): Promise<Response> {
  const parsed = await parseJsonBody<{
    id: string;
    name?: string | null;
    enabled?: boolean;
    transport?: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;
  const id = safeMcpId(String(b.id ?? ""));
  const command = typeof b.command === "string" ? b.command.trim() : "";
  if (!id || !command) return jsonResponse({ error: "Missing required fields: id, command" }, 400);
  const result = await testMcpServer({
    id,
    name: typeof b.name === "string" ? b.name.trim() || undefined : undefined,
    enabled: b.enabled === false ? false : true,
    transport: "stdio",
    command,
    args: Array.isArray(b.args) ? b.args.filter((a): a is string => typeof a === "string") : undefined,
    env: isPlainObject(b.env)
      ? (Object.fromEntries(Object.entries(b.env).filter(([, v]) => typeof v === "string")) as Record<string, string>)
      : undefined,
  });
  if (result.error) return jsonResponse({ ok: false, error: result.error, tools: result.tools }, 200);
  return jsonResponse({ ok: true, tools: result.tools }, 200);
}

export async function handleGraphRun(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const parsed = await parseJsonBody<{ graph_id: string; input: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { graph_id, input } = parsed.body;
  if (!graph_id || typeof input !== "string") {
    return jsonResponse(
      { error: "Missing required fields: graph_id, input" },
      400
    );
  }

  const graph = await loadGraph(graph_id);
  if (!graph) {
    return jsonResponse({ error: `Graph not found: ${graph_id}` }, 404);
  }

  try {
    const result = await runGraph({ graph, input });
    return jsonResponse(result);
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ success: false, error: msg }, 500);
  }
}

export async function handleGraphRunStream(req: Request): Promise<Response> {
  const parsed = await parseJsonBody<{ graph_id: string; input: string }>(req);
  if (!parsed.ok) return parsed.response;
  const { graph_id, input } = parsed.body;
  if (!graph_id || typeof input !== "string") {
    return jsonResponse({ error: "Missing required fields: graph_id, input" }, 400);
  }

  const graph = await loadGraph(graph_id);
  if (!graph) {
    return jsonResponse({ error: `Graph not found: ${graph_id}` }, 404);
  }

  if ((process.env.AGENT_OS_DEBUG ?? "").trim() === "1" || (process.env.AGENT_OS_DEBUG_GRAPHS ?? "").trim() === "1") {
    console.log(`[graph] Graph chat stream requested: graph_id=${graph_id}, input length=${input?.length ?? 0}`);
  }

  const encoder = new TextEncoder();
  function send(type: string, data: object): string {
    return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  const KEEPALIVE_INTERVAL_MS = 30_000; // send SSE comment every 30s so connection is not closed by idleTimeout during long node runs
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      function safeEnqueue(data: Uint8Array): void {
        if (closed) return;
        try {
          controller.enqueue(data);
        } catch {
          closed = true;
        }
      }
      function safeClose(): void {
        if (closed) return;
        try {
          controller.close();
        } catch {
          // ignore
        }
        closed = true;
      }
      const keepalive = setInterval(() => {
        if (closed) {
          clearInterval(keepalive);
          return;
        }
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
          closed = true;
        }
      }, KEEPALIVE_INTERVAL_MS);
      try {
        await runGraphStream({ graph, input }, (ev: GraphStreamEvent) => {
          if (ev.type === "node_done") {
            safeEnqueue(
              encoder.encode(
                send("node_done", {
                  node_id: ev.node_id,
                  agent_id: ev.agent_id,
                  success: ev.success,
                  output: ev.output,
                  error: ev.error,
                })
              )
            );
          } else if (ev.type === "done") {
            safeEnqueue(
              encoder.encode(
                send("done", {
                  success: ev.success,
                  output: ev.output,
                  node_results: ev.node_results,
                })
              )
            );
          } else if (ev.type === "error") {
            safeEnqueue(encoder.encode(send("error", { message: ev.message })));
          }
        });
      } catch (err) {
        const msg = errorMessage(err);
        safeEnqueue(encoder.encode(send("error", { message: msg })));
      } finally {
        clearInterval(keepalive);
        safeClose();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export interface AgentSuggestion {
  name: string;
  id: string;
  description: string;
  skills: string[];
  schedule: string;
  schedule_input: string;
}

function extractJsonFromContent(content: string): string {
  const trimmed = content.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock?.[1]) return codeBlock[1].trim();
  return trimmed;
}

export async function handleAgentSuggest(req: Request): Promise<Response> {
  const parsed = await parseJsonBody<{ prompt?: string }>(req);
  if (!parsed.ok) return parsed.response;
  const prompt = typeof parsed.body.prompt === "string" ? parsed.body.prompt.trim() : "";
  if (!prompt) return jsonResponse({ error: "Missing prompt" }, 400);

  const skills = await listSkills();
  const skillList = skills.map((s) => `${s.id}: ${s.name}${s.description ? ` - ${s.description}` : ""}`).join("\n");
  const skillIds = skills.map((s) => s.id);

  const systemPrompt = `You suggest agent configurations from a user's natural language description.
Available skills (use only these ids): ${skillIds.join(", ")}

${skillList ? `Skill details:\n${skillList}` : "No skills installed yet."}

Respond with a single JSON object only, no other text. Use this exact shape:
{
  "name": "Human-readable agent name",
  "id": "lowercase_slug_id",
  "description": "One sentence of what the agent does",
  "skills": ["skill_id1", "skill_id2"],
  "schedule": "0 9 * * *",
  "schedule_input": "Task to run on schedule"
}

Rules:
- id: only lowercase letters, numbers, underscores (e.g. news_reporter). Must be a valid slug.
- skills: array of skill ids from the available list above. Use only ids that fit the user's request. Can be empty [].
- schedule: cron expression if they want a recurring time (e.g. daily 9am = "0 9 * * *", every 10 min = "*/10 * * * *"). Otherwise "".
- schedule_input: the task/prompt to run when the schedule fires (e.g. "Summarize today's trending news"). Otherwise "".`;

  try {
    const suggestModel = await getSuggestModelId();
    const res = await callLLM({
      model: suggestModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_tokens: 512,
    });
    const content = res.content?.trim();
    if (!content) return jsonResponse({ error: "No suggestion from model" }, 502);

    const raw = extractJsonFromContent(content);
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "Agent";
    const id = typeof parsed.id === "string"
      ? parsed.id.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "_").replace(/\s+/g, "_") || "agent"
      : "agent";
    const description = typeof parsed.description === "string" ? parsed.description.trim() : "";
    const skillsOut = Array.isArray(parsed.skills)
      ? (parsed.skills as unknown[]).filter((s): s is string => typeof s === "string" && skillIds.includes(s))
      : [];
    const schedule = typeof parsed.schedule === "string" ? parsed.schedule.trim() : "";
    const schedule_input = typeof parsed.schedule_input === "string" ? parsed.schedule_input.trim() : "";

    const suggestion: AgentSuggestion = {
      name,
      id,
      description,
      skills: skillsOut,
      schedule,
      schedule_input,
    };
    return jsonResponse({ suggestion });
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 502);
  }
}

/** Upload a file into the agent's workspace (e.g. for chat attachments). POST multipart with "file" field. Returns { path } (absolute path for exec/tools). */
export async function handleAgentUpload(req: Request, agentId: string): Promise<Response> {
  const agents = await loadAgents();
  if (!agents.some((a) => a.id === agentId)) {
    return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
  }
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return jsonResponse({ error: "Invalid multipart body" }, 400);
  }
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return jsonResponse({ error: "Missing or invalid 'file' field" }, 400);
  }
  const rawName = file.name || "upload";
  const basename = rawName.replace(/^.*[/\\]/, "").replace(/[^a-zA-Z0-9._-]/g, "_") || "upload";
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const filename = `${unique}_${basename}`;
  await ensureWorkspace(agentId);
  const uploadsDir = join(getWorkspaceDir(agentId), "uploads");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(uploadsDir, { recursive: true });
  const absolutePath = join(uploadsDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, buffer);
  return jsonResponse({ path: absolutePath });
}

/** Allowed workspace template filenames for GET/PUT (prompt editing). */
export const WORKSPACE_TEMPLATE_FILENAMES = [
  "IDENTITY.md",
  "USER.md",
  "TOOLS.md",
  "SYSTEM.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
  "BOOT.md",
] as const;

/** GET /api/agents/:id/workspace/:filename — serve a file from the agent's workspace (e.g. generated QR PNG, or template .md). */
export async function handleGetAgentWorkspaceFile(agentId: string, filename: string): Promise<Response> {
  const agents = await loadAgents();
  if (!agents.some((a) => a.id === agentId)) {
    return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
  }
  const basename = filename.replace(/^.*[/\\]/, "").trim() || "file";
  if (basename !== filename || /[\\/]/.test(basename)) {
    return jsonResponse({ error: "Invalid filename" }, 400);
  }
  const workspaceDir = getWorkspaceDir(agentId);
  let absolutePath: string;
  try {
    absolutePath = resolveInWorkspace(workspaceDir, basename);
  } catch {
    return jsonResponse({ error: "Invalid path" }, 400);
  }
  try {
    const st = await stat(absolutePath);
    if (!st.isFile()) return jsonResponse({ error: "Not a file" }, 404);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return jsonResponse({ error: "File not found" }, 404);
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
  const buf = await readFile(absolutePath);
  const ext = basename.replace(/^.*\./, "").toLowerCase();
  const mime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    md: "text/markdown; charset=utf-8",
  };
  const contentType = mime[ext] ?? "application/octet-stream";
  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      ...(CORS_HEADERS as Record<string, string>),
    },
  });
}

/** PUT /api/agents/:id/workspace/:filename — update a workspace template file (body: raw text or JSON { content }). */
export async function handlePutAgentWorkspaceFile(agentId: string, filename: string, req: Request): Promise<Response> {
  const agents = await loadAgents();
  if (!agents.some((a) => a.id === agentId)) {
    return jsonResponse({ error: `Agent not found: ${agentId}` }, 404);
  }
  const basename = filename.replace(/^.*[/\\]/, "").trim() || "file";
  if (basename !== filename || /[\\/]/.test(basename)) {
    return jsonResponse({ error: "Invalid filename" }, 400);
  }
  if (!WORKSPACE_TEMPLATE_FILENAMES.includes(basename as (typeof WORKSPACE_TEMPLATE_FILENAMES)[number])) {
    return jsonResponse({ error: "Only template files (IDENTITY.md, USER.md, TOOLS.md, SYSTEM.md, HEARTBEAT.md, BOOTSTRAP.md, BOOT.md) can be updated" }, 400);
  }
  let content: string;
  try {
    const body = await req.text();
    if (body.startsWith("{")) {
      try {
        const parsed = JSON.parse(body) as { content?: string };
        content = typeof parsed.content === "string" ? parsed.content : body;
      } catch {
        content = body;
      }
    } else {
      content = body;
    }
  } catch {
    return jsonResponse({ error: "Invalid body" }, 400);
  }
  const workspaceDir = await ensureWorkspace(agentId);
  let absolutePath: string;
  try {
    absolutePath = resolveInWorkspace(workspaceDir, basename);
  } catch {
    return jsonResponse({ error: "Invalid path" }, 400);
  }
  try {
    await writeFile(absolutePath, content, "utf-8");
  } catch (err) {
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
  return jsonResponse({ ok: true }, 200);
}

const DOC_NAMES: Record<string, string> = {
  "telegram-setup": "TELEGRAM_SETUP.md",
  "slack-setup": "SLACK_SETUP.md",
  "discord-setup": "DISCORD_SETUP.md",
  "signal-setup": "SIGNAL_SETUP.md",
  "viber-setup": "VIBER_SETUP.md",
};

/** GET /api/docs/:name — return setup doc markdown for end users (e.g. telegram-setup, slack-setup, discord-setup). */
export async function handleGetDoc(name: string): Promise<Response> {
  const filename = DOC_NAMES[name];
  if (!filename) {
    return jsonResponse({ error: "Unknown doc" }, 404);
  }
  try {
    const path = join(process.cwd(), "doc", filename);
    const content = await readFile(path, "utf-8");
    return jsonResponse({ content });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return jsonResponse({ error: "Doc not found" }, 404);
    const msg = errorMessage(err);
    return jsonResponse({ error: msg }, 500);
  }
}
