/**
 * Agent OS HTTP Server — agents + tasks.
 * Uses Bun.serve({ routes }) (Bun v1.2.3+).
 * Endpoints:
 *   - /health
 *   - /api/agents, /api/agents/run
 *   - /api/tasks, /api/logs
 *   - /api/graphs, /api/graphs/run
 *   - /api/memory/write, /api/memory/search
 *   - /api/conversations, /api/conversations/summarize, /api/conversations/:id (PUT)
 *   - /api/settings, /api/skills, /api/skills/:id/config, /api/skills/install, etc.
 *   - /api/channels/telegram/webhook, set-webhook, status
 *   - /api/channels/slack/webhook, status
 *   - /api/channels/discord/webhook, status
 *   - /api/channels/signal/webhook, status
 *   - /api/channels/viber/webhook, set-webhook, status
 */

import type { BunRequest } from "bun";
import { MemoryStore } from "./db/memory-store.js";
import { jsonResponse, CORS_HEADERS, errorMessage } from "./http/utils.js";
import { handleMemoryWrite, handleMemorySearch, handleMemoryDelete, handleMemoryGraph } from "./http/memory.js";
import {
  handleConversations,
  handleConversationSummarize,
  handleConversationUpdate,
} from "./http/conversations.js";
import {
  handleRun,
  handleRunStream,
  handleTasks,
  handleLogs,
  handleSkillInstall,
  handleSkillUpload,
  handleSkillMdUpload,
  handleSettings,
  handleMcpServers,
  handleMcpServerDelete,
  handleMcpServerTest,
  handleGraphRun,
  handleGraphRunStream,
  handleAgentSuggest,
  handleAgentUpload,
  handleGetAgentWorkspaceFile,
  handlePutAgentWorkspaceFile,
  handleGetDoc,
} from "./http/handlers.js";
import { handleTelegramWebhook, handleTelegramStatus, handleTelegramSetWebhook, startTelegramPolling } from "./http/telegram.js";
import { handleSlackWebhook, handleSlackStatus } from "./http/slack.js";
import { handleDiscordWebhook, handleDiscordStatus } from "./http/discord.js";
import { handleSignalWebhook, handleSignalStatus } from "./http/signal.js";
import { handleViberWebhook, handleViberStatus, handleViberSetWebhook } from "./http/viber.js";
import { loadAgents, updateAgent, createAgent, deleteAgent, setAgentStore, seedAgentsIfEmpty, installSystemAgents } from "./core/agent-registry.js";
import { parseAgentConfig, type AgentConfig } from "./types/agent.js";
import { readSkillConfig, writeSkillConfig } from "./core/config.js";
import { startWorkers, startScheduler } from "./core/tasks.js";
import { subscribe, type Event, type EventType } from "./core/events.js";
import { initScheduleReports } from "./core/schedule-reports.js";
import { listGraphs, loadGraph, saveGraph, deleteGraph } from "./core/graphs.js";
import { loadPlugins } from "./core/plugins.js";
import { listSkills, getSkillConfigSchema, getSkillSetupMarkdown, getSkillMarketplace, getStoreRegistry, uninstallSkill, installSystemSkills } from "./skills/loader.js";
import { getAgentOsHome, getDashboardSecret, getMemoryDbPath, readConfig, writeConfig, generateDashboardSecret } from "./core/config.js";
import { join, dirname, resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const PORT = parseInt(process.env.PORT ?? "3010", 10);
// Prefer dashboard-dist (used in published package); fallback to dashboard/dist (local dev)
const DASHBOARD_DIST = (() => {
  const root = join(import.meta.dir, "..");
  const a = resolve(join(root, "dashboard-dist"));
  const b = resolve(join(root, "dashboard", "dist"));
  if (existsSync(a) && existsSync(join(a, "index.html"))) return a;
  return b;
})();
const HOST = process.env.HOST ?? "127.0.0.1";

function isAuthExempt(pathname: string, method: string): boolean {
  if (method === "OPTIONS") return true;
  if (method === "GET" && pathname === "/health") return true;
  if (method === "GET" && pathname === "/api/bootstrap/dashboard-token") return true;
  if (method === "GET" && pathname === "/api/bootstrap/workspace-status") return true;
  if (method === "POST" && pathname === "/api/bootstrap/setup-workspace") return true;
  if (method === "POST" && pathname === "/api/channels/telegram/webhook") return true;
  if (method === "POST" && pathname === "/api/channels/slack/webhook") return true;
  if (method === "POST" && pathname === "/api/channels/discord/webhook") return true;
  if (method === "POST" && pathname === "/api/channels/signal/webhook") return true;
  if (method === "POST" && pathname === "/api/channels/viber/webhook") return true;
  return false;
}

function getTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  const url = new URL(req.url);
  return url.searchParams.get("token")?.trim() ?? null;
}

function authUnauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS as HeadersInit });
}

function wrapWithAuth<T extends (req: Request) => Response | Promise<Response>>(
  fn: T,
  secret: string
): T {
  if (!secret) return fn;
  return ((req: Request) => {
    const url = new URL(req.url);
    if (isAuthExempt(url.pathname, req.method)) return fn(req);
    const token = getTokenFromRequest(req);
    if (token !== secret) return authUnauthorizedResponse();
    return fn(req);
  }) as T;
}

function wrapRouteHandlers(
  routes: Record<string, unknown>,
  secret: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(routes)) {
    if (typeof value === "function") {
      out[path] = wrapWithAuth(value as (req: Request) => Response | Promise<Response>, secret);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const methods: Record<string, unknown> = {};
      for (const [method, handler] of Object.entries(value as Record<string, unknown>)) {
        methods[method] =
          typeof handler === "function"
            ? wrapWithAuth(handler as (req: Request) => Response | Promise<Response>, secret)
            : handler;
      }
      out[path] = methods;
    } else {
      out[path] = value;
    }
  }
  return out;
}

const EVENT_TYPES: EventType[] = [
  "task.created",
  "task.started",
  "task.completed",
  "task.failed",
  "agent.started",
  "agent.completed",
  "tool.called",
  "tool.completed",
];

const wsClients = new Set<{ send: (data: string) => void }>();
const MEMORY_DB_PATH = getMemoryDbPath();
mkdirSync(dirname(MEMORY_DB_PATH), { recursive: true });
const memoryStore = new MemoryStore(MEMORY_DB_PATH);
setAgentStore(memoryStore);

function broadcastEvent(event: Event): void {
  const msg = JSON.stringify(event);
  for (const ws of wsClients) {
    try {
      ws.send(msg);
    } catch {
      // ignore
    }
  }
}

/** Serve dashboard static files and SPA fallback when dashboard is built. */
function serveDashboard(pathname: string): Response | null {
  if (!existsSync(DASHBOARD_DIST) || !existsSync(join(DASHBOARD_DIST, "index.html"))) {
    return null;
  }
  // Path traversal guard: no ".." in path
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("..")) {
    return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS as HeadersInit });
  }
  const subpath = decoded === "/" ? "index.html" : decoded.slice(1);
  const filePath = join(DASHBOARD_DIST, subpath);
  if (existsSync(filePath)) {
    const file = Bun.file(filePath);
    const ext = subpath.split(".").pop() ?? "";
    const mime: Record<string, string> = {
      html: "text/html",
      js: "application/javascript",
      css: "text/css",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      ico: "image/x-icon",
      svg: "image/svg+xml",
      woff: "font/woff",
      woff2: "font/woff2",
    };
    return new Response(file, {
      headers: { "Content-Type": mime[ext] ?? "application/octet-stream" },
    });
  }
  // SPA fallback: serve index.html for client-side routes
  const indexPath = join(DASHBOARD_DIST, "index.html");
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: { "Content-Type": "text/html" },
    });
  }
  return null;
}

for (const type of EVENT_TYPES) {
  subscribe(type, broadcastEvent);
}
initScheduleReports();

function createRoutes(): Record<string, unknown> {
  return {
    "/*": {
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: CORS_HEADERS as Record<string, string>,
        }),
    },
    "/health": () =>
      Response.json({ ok: true, service: "agent-os" }, { headers: CORS_HEADERS as HeadersInit }),
    "/api/agents": {
      GET: async () => {
        let agents: AgentConfig[];
        try {
          agents = await loadAgents();
        } catch (err) {
          console.error("[sulala] GET /api/agents failed:", err);
          return jsonResponse({
            agents: [],
            error: "Agent store unavailable. Try running 'sulala onboard' again.",
          }, 200);
        }
        return jsonResponse({
          agents: agents.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            model: a.model,
            personality: a.personality ?? null,
            schedule: a.schedule ?? null,
            schedule_input: a.schedule_input ?? null,
            schedule_enabled: a.schedule_enabled ?? true,
            schedule_report_targets: a.schedule_report_targets ?? null,
            skills: a.skills ?? [],
            tools: a.tools ?? [],
            avatar: a.avatar ?? null,
            user_created: a.user_created ?? false,
          })),
        });
      },
      POST: async (req: Request) => {
        let body: unknown;
        try {
          body = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        try {
          const agent = parseAgentConfig(body);
          const created = await createAgent(agent);
          return jsonResponse(
            { ok: true, agent: { id: created.id, name: created.name, model: created.model, skills: created.skills, tools: created.tools } },
            201
          );
        } catch (err) {
          const msg = errorMessage(err);
          if (msg.includes("already exists")) return jsonResponse({ error: msg }, 409);
          return jsonResponse({ error: msg }, 400);
        }
      },
    },
    "/api/agents/suggest": {
      POST: (req: Request) => handleAgentSuggest(req),
    },
    "/api/agents/install-system": {
      POST: async () => {
        try {
          const { installed } = await installSystemAgents();
          return jsonResponse({ ok: true, installed });
        } catch (err) {
          const msg = errorMessage(err);
          return jsonResponse({ error: msg }, 400);
        }
      },
    },
    "/api/agents/:id": {
      PUT: async (req: BunRequest<"/api/agents/:id">) => {
        const id = decodeURIComponent(req.params.id);
        let body: Record<string, unknown>;
        try {
          body = (await req.json()) as Record<string, unknown>;
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        try {
          const agent = await updateAgent(id, {
            name: body.name as string | null | undefined,
            description: body.description as string | null | undefined,
            model: body.model as string | null | undefined,
            personality: body.personality as string | null | undefined,
            skills: Array.isArray(body.skills) ? (body.skills as string[]) : undefined,
            tools: Array.isArray(body.tools) ? (body.tools as string[]) : undefined,
            limits: body.limits != null && typeof body.limits === "object" ? (body.limits as AgentConfig["limits"]) : undefined,
            schedule: body.schedule as string | null | undefined,
            schedule_input: body.schedule_input as string | null | undefined,
            avatar: body.avatar as string | null | undefined,
            schedule_enabled: body.schedule_enabled as boolean | null | undefined,
            schedule_report_targets: Array.isArray(body.schedule_report_targets) ? (body.schedule_report_targets as AgentConfig["schedule_report_targets"]) : undefined,
          });
          return jsonResponse({
            ok: true,
            agent: {
              id: agent.id,
              name: agent.name,
              description: agent.description ?? null,
              model: agent.model,
              personality: agent.personality ?? null,
              skills: agent.skills ?? [],
              tools: agent.tools ?? [],
              schedule: agent.schedule ?? null,
              schedule_input: agent.schedule_input ?? null,
              schedule_enabled: agent.schedule_enabled ?? true,
              schedule_report_targets: agent.schedule_report_targets ?? null,
              avatar: agent.avatar ?? null,
              limits: agent.limits ?? null,
            },
          });
        } catch (err) {
          const msg = errorMessage(err);
          if (msg.includes("not found")) return jsonResponse({ error: msg }, 404);
          return jsonResponse({ error: msg }, 400);
        }
      },
      DELETE: async (req: BunRequest<"/api/agents/:id">) => {
        const id = decodeURIComponent(req.params.id);
        try {
          await deleteAgent(id);
          return jsonResponse({ ok: true }, 200);
        } catch (err) {
          const msg = errorMessage(err);
          if (msg.includes("not found")) return jsonResponse({ error: msg }, 404);
          return jsonResponse({ error: msg }, 400);
        }
      },
    },
    "/api/agents/run/stream": {
      POST: (req: Request) => handleRunStream(req, memoryStore),
    },
    "/api/agents/:id/upload": {
      POST: async (req: BunRequest<"/api/agents/:id/upload">) => {
        const id = decodeURIComponent(req.params.id);
        return handleAgentUpload(req, id);
      },
    },
    "/api/agents/:id/workspace/:filename": {
      GET: async (req: BunRequest<"/api/agents/:id/workspace/:filename">) => {
        const id = decodeURIComponent(req.params.id);
        const filename = decodeURIComponent(req.params.filename);
        return handleGetAgentWorkspaceFile(id, filename);
      },
      PUT: async (req: BunRequest<"/api/agents/:id/workspace/:filename">) => {
        const id = decodeURIComponent(req.params.id);
        const filename = decodeURIComponent(req.params.filename);
        return handlePutAgentWorkspaceFile(id, filename, req);
      },
    },
    "/api/agents/run": {
      POST: (req: Request) => handleRun(req, memoryStore),
    },
    "/api/tasks": {
      GET: (req: Request) => handleTasks(req, new URL(req.url)),
      POST: (req: Request) => handleTasks(req, new URL(req.url)),
    },
    "/api/logs": {
      GET: (req: Request) => handleLogs(req),
    },
    "/api/graphs": {
      GET: async () => {
        const graphs = await listGraphs();
        return jsonResponse({ graphs });
      },
    },
    "/api/graphs/run/stream": {
      POST: (req: Request) => handleGraphRunStream(req),
    },
    "/api/graphs/run": {
      POST: (req: Request) => handleGraphRun(req),
    },
    "/api/graphs/:id": {
      GET: async (req: BunRequest<"/api/graphs/:id">) => {
        const id = decodeURIComponent(req.params.id);
        const graph = await loadGraph(id);
        if (!graph) {
          return Response.json({ error: "Graph not found" }, { status: 404, headers: CORS_HEADERS as HeadersInit });
        }
        return Response.json(graph, { headers: CORS_HEADERS as HeadersInit });
      },
      PUT: async (req: BunRequest<"/api/graphs/:id">) => {
        const id = decodeURIComponent(req.params.id);
        const existing = await loadGraph(id);
        let body: {
          id?: string;
          nodes?: { id: string; agent: string }[];
          edges?: { from: string; to: string }[];
          schedule?: string | null;
          schedule_input?: string | null;
          schedule_enabled?: boolean;
          schedule_report_targets?: Array<{ channel: string; address: string }> | null;
        };
        try {
          body = (await req.json()) as typeof body;
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        const graph = {
          id: body.id ?? id,
          nodes: Array.isArray(body.nodes) ? body.nodes : existing?.nodes ?? [],
          edges: Array.isArray(body.edges) ? body.edges : existing?.edges ?? [],
          schedule: body.schedule !== undefined ? (body.schedule && String(body.schedule).trim() ? String(body.schedule).trim() : undefined) : existing?.schedule,
          schedule_input: body.schedule_input !== undefined ? (body.schedule_input && String(body.schedule_input).trim() ? String(body.schedule_input).trim() : undefined) : existing?.schedule_input,
          schedule_enabled: body.schedule_enabled !== undefined ? body.schedule_enabled : (existing?.schedule_enabled !== false),
          schedule_report_targets: body.schedule_report_targets !== undefined
            ? (Array.isArray(body.schedule_report_targets)
                ? body.schedule_report_targets
                    .filter((t): t is { channel: "telegram"; address: string } => t?.channel === "telegram" && typeof t?.address === "string")
                    .map((t) => ({ channel: "telegram" as const, address: String(t.address).trim() }))
                    .filter((t) => t.address.length > 0)
                : undefined)
            : existing?.schedule_report_targets,
        };
        if (!graph.nodes.length) {
          return jsonResponse({ error: "Graph must have at least one node" }, 400);
        }
        try {
          await saveGraph(graph);
          return Response.json({ ok: true, graph }, { headers: CORS_HEADERS as HeadersInit });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return jsonResponse({ error: msg }, 400);
        }
      },
      DELETE: async (req: BunRequest<"/api/graphs/:id">) => {
        const id = decodeURIComponent(req.params.id);
        try {
          await deleteGraph(id);
          return Response.json({ ok: true }, { headers: CORS_HEADERS as HeadersInit });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return jsonResponse({ error: msg }, 400);
        }
      },
    },
    "/api/memory/write": {
      POST: (req: Request) => handleMemoryWrite(req, memoryStore),
    },
    "/api/memory/search": {
      GET: (req: Request) =>
        handleMemorySearch(req, new URL(req.url), memoryStore),
    },
    "/api/memory/graph": {
      GET: (req: Request) =>
        handleMemoryGraph(req, new URL(req.url), memoryStore),
    },
    "/api/memory/:id": {
      DELETE: (req: BunRequest<"/api/memory/:id">) =>
        handleMemoryDelete(decodeURIComponent(req.params.id), memoryStore),
    },
    "/api/conversations/:id": {
      PUT: (req: BunRequest<"/api/conversations/:id">) =>
        handleConversationUpdate(req, decodeURIComponent(req.params.id), memoryStore),
    },
    "/api/conversations": {
      GET: (req: Request) =>
        handleConversations(req, new URL(req.url), memoryStore),
      POST: (req: Request) =>
        handleConversations(req, new URL(req.url), memoryStore),
    },
    "/api/conversations/summarize": {
      POST: (req: Request) => handleConversationSummarize(req, memoryStore),
    },
    "/api/bootstrap/dashboard-token": {
      GET: async () => {
        const config = await readConfig();
        if (config.onboarding_completed === true) {
          return Response.json(
            { error: "Onboarding already completed. Use the login page." },
            { status: 403, headers: CORS_HEADERS as HeadersInit }
          );
        }
        const token = await getDashboardSecret();
        return jsonResponse({ token });
      },
    },
    "/api/bootstrap/workspace-status": {
      GET: async () => {
        try {
          await mkdir(getAgentOsHome(), { recursive: true });
          await mkdir(dirname(getMemoryDbPath()), { recursive: true });
          await loadAgents();
          return jsonResponse({ ready: true });
        } catch (err) {
          const msg = errorMessage(err);
          return jsonResponse({ ready: false, error: msg }, 200);
        }
      },
    },
    "/api/bootstrap/setup-workspace": {
      POST: async () => {
        try {
          await mkdir(getAgentOsHome(), { recursive: true });
          await mkdir(dirname(getMemoryDbPath()), { recursive: true });
          await seedAgentsIfEmpty();
          const { installed } = await installSystemAgents();
          return jsonResponse({ ok: true, installed });
        } catch (err) {
          const msg = errorMessage(err);
          return jsonResponse({ error: msg }, 400);
        }
      },
    },
    "/api/settings": {
      GET: (req: Request) => handleSettings(req),
      PUT: (req: Request) => handleSettings(req),
    },
    "/api/settings/dashboard-token/regenerate": {
      POST: async () => {
        const token = generateDashboardSecret();
        await writeConfig({ dashboard_secret: token });
        return jsonResponse({
          token,
          message: "Restart the server for the new token to take effect.",
        });
      },
    },
    "/api/mcp/servers": {
      GET: (req: Request) => handleMcpServers(req),
      PUT: (req: Request) => handleMcpServers(req),
    },
    "/api/mcp/servers/test": {
      POST: (req: Request) => handleMcpServerTest(req),
    },
    "/api/mcp/servers/:id": {
      DELETE: async (req: BunRequest<"/api/mcp/servers/:id">) => {
        const id = decodeURIComponent(req.params.id);
        return handleMcpServerDelete(id);
      },
    },
    "/api/channels/telegram/webhook": {
      POST: (req: Request) => handleTelegramWebhook(req, memoryStore),
    },
    "/api/channels/telegram/status": {
      GET: () => handleTelegramStatus(),
    },
    "/api/channels/telegram/set-webhook": {
      POST: (req: Request) => handleTelegramSetWebhook(req),
    },
    "/api/channels/slack/webhook": {
      POST: (req: Request) => handleSlackWebhook(req, memoryStore),
    },
    "/api/channels/slack/status": {
      GET: () => handleSlackStatus(),
    },
    "/api/channels/discord/webhook": {
      POST: (req: Request) => handleDiscordWebhook(req, memoryStore),
    },
    "/api/channels/discord/status": {
      GET: () => handleDiscordStatus(),
    },
    "/api/channels/signal/webhook": {
      POST: (req: Request) => handleSignalWebhook(req, memoryStore),
    },
    "/api/channels/signal/status": {
      GET: () => handleSignalStatus(),
    },
    "/api/channels/viber/webhook": {
      POST: (req: Request) => handleViberWebhook(req, memoryStore),
    },
    "/api/channels/viber/status": {
      GET: () => handleViberStatus(),
    },
    "/api/channels/viber/set-webhook": {
      POST: (req: Request) => handleViberSetWebhook(req),
    },
    "/api/docs/:name": {
      GET: (req: BunRequest<"/api/docs/:name">) =>
        handleGetDoc(decodeURIComponent(req.params.name)),
    },
    "/api/skills": {
      GET: async () => {
        const skills = await listSkills();
        return jsonResponse({ skills });
      },
    },
    "/api/skills/marketplace": {
      GET: async () => {
        const entries = await getSkillMarketplace();
        return jsonResponse({ marketplace: entries });
      },
    },
    "/api/skills/store-registry": {
      GET: async () => {
        const { skills, storeBase, registryUrl } = await getStoreRegistry();
        return jsonResponse({ skills, storeBase, registryUrl });
      },
    },
    "/api/skills/:id": {
      DELETE: async (req: BunRequest<"/api/skills/:id">) => {
        const skillId = decodeURIComponent(req.params.id);
        try {
          await uninstallSkill(skillId);
          return jsonResponse({ ok: true });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          return jsonResponse({ error: message }, 400);
        }
      },
    },
    "/api/skills/:id/config/schema": {
      GET: async (req: BunRequest<"/api/skills/:id/config/schema">) => {
        const skillId = decodeURIComponent(req.params.id);
        const schema = await getSkillConfigSchema(skillId);
        if (schema === null) {
          return Response.json({ error: "Schema not found" }, { status: 404, headers: CORS_HEADERS as HeadersInit });
        }
        return Response.json(schema, { headers: CORS_HEADERS as HeadersInit });
      },
    },
    "/api/skills/:id/setup": {
      GET: async (req: BunRequest<"/api/skills/:id/setup">) => {
        const skillId = decodeURIComponent(req.params.id);
        const setup_markdown = await getSkillSetupMarkdown(skillId);
        return jsonResponse({ setup_markdown });
      },
    },
    "/api/skills/:id/config": {
      GET: async (req: BunRequest<"/api/skills/:id/config">) => {
        const skillId = decodeURIComponent(req.params.id);
        const config = await readSkillConfig(skillId);
        return jsonResponse({
          configured: Object.keys(config).filter(
            (k) => (config[k] ?? "").trim() !== ""
          ),
        });
      },
      PUT: async (req: BunRequest<"/api/skills/:id/config">) => {
        const skillId = decodeURIComponent(req.params.id);
        let body: Record<string, string>;
        try {
          body = (await req.json()) as Record<string, string>;
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }
        const existing = await readSkillConfig(skillId);
        const env: Record<string, string> = { ...existing };
        for (const [k, v] of Object.entries(body)) {
          if (typeof k === "string" && typeof v === "string") env[k] = v;
        }
        await writeSkillConfig(skillId, env);
        return jsonResponse({ ok: true });
      },
    },
    "/api/skills/install": {
      POST: (req: Request) => handleSkillInstall(req),
    },
    "/api/skills/install-system": {
      POST: async () => {
        const { installed } = await installSystemSkills();
        return jsonResponse({ ok: true, installed });
      },
    },
    "/api/skills/upload": {
      POST: (req: Request) => handleSkillUpload(req),
    },
    "/api/skills/upload-skill-md": {
      POST: (req: Request) => handleSkillMdUpload(req),
    },
  };
}

export async function startServer(): Promise<void> {
  startWorkers();
  startScheduler();
  await loadPlugins();
  await seedAgentsIfEmpty();

  const dashboardSecret = await getDashboardSecret();

  const dashboardMissing = !existsSync(DASHBOARD_DIST) || !existsSync(join(DASHBOARD_DIST, "index.html"));
  if (dashboardMissing) {
    console.warn(
      `[sulala] Dashboard not found at ${DASHBOARD_DIST}. From package root run: cd dashboard && npm run build. If using a global install, reinstall: bun install -g @sulala/agent-os@latest`
    );
  }

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
    port: PORT,
    hostname: HOST,
    idleTimeout: 255, // seconds; Bun max. Graph runs use SSE keepalive so long streams stay open.
    routes: wrapRouteHandlers(createRoutes(), dashboardSecret) as NonNullable<Parameters<typeof Bun.serve>[0]>["routes"],
    fetch(req, server) {
      const url = new URL(req.url);
      // WebSocket upgrade must run in fetch (needs server reference)
      if (req.method === "GET" && url.pathname === "/api/events") {
        if (dashboardSecret) {
          const token = url.searchParams.get("token")?.trim() ?? getTokenFromRequest(req);
          if (token !== dashboardSecret) {
            return authUnauthorizedResponse();
          }
        }
        if (server.upgrade(req, { data: undefined })) return undefined as unknown as Response;
        return Response.json({ error: "Upgrade failed" }, { status: 500, headers: CORS_HEADERS as HeadersInit });
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
        const dashboardResponse = serveDashboard(url.pathname);
        if (dashboardResponse) return dashboardResponse;
        if (url.pathname === "/" || url.pathname === "") {
          return Response.json(
            {
              error: "Dashboard not built",
              path: DASHBOARD_DIST,
              hint: "From the sulala package root run: cd dashboard && npm run build",
              hint_global: "If you installed globally, reinstall to get the dashboard: bun install -g @sulala/agent-os@latest",
            },
            { status: 404, headers: CORS_HEADERS as HeadersInit }
          );
        }
      }
      return Response.json({ error: "Not found" }, { status: 404, headers: CORS_HEADERS as HeadersInit });
    },
    error(error) {
      console.error(error);
      return Response.json({ error: "Internal Server Error" }, { status: 500, headers: CORS_HEADERS as HeadersInit });
    },
    websocket: {
      open(ws) {
        wsClients.add(ws);
      },
      close(ws) {
        wsClients.delete(ws);
      },
      message() { },
    },
  });
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === "EADDRINUSE" || e?.errno === 48) {
      throw new Error(
        `Port ${PORT} is already in use. Stop the other process (e.g. sulala stop) or use a different port: PORT=3011 sulala start`
      );
    }
    throw err;
  }

  console.info(`Agent OS server running at ${server!.url}`);
  startTelegramPolling(memoryStore);
}
