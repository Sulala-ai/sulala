/**
 * Agent OS API client — talks to tinyagent backend (default 127.0.0.1:3010).
 * When the server uses DASHBOARD_SECRET, use setDashboardToken() and the client
 * will send the token on all requests and clear it on 401.
 */

const BASE = import.meta.env.VITE_AGENT_OS_API ?? "http://0.0.0.0:3010";

const DASHBOARD_TOKEN_KEY = "agent_os_dashboard_token";

export function getDashboardToken(): string | null {
  return sessionStorage.getItem(DASHBOARD_TOKEN_KEY);
}

export function setDashboardToken(token: string | null): void {
  if (token === null) sessionStorage.removeItem(DASHBOARD_TOKEN_KEY);
  else sessionStorage.setItem(DASHBOARD_TOKEN_KEY, token);
}

export const UNAUTHORIZED_EVENT = "dashboard:unauthorized";

function authHeaders(): Record<string, string> {
  const token = getDashboardToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function checkUnauthorized(res: Response): void {
  if (res.status === 401) {
    setDashboardToken(null);
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  }
}

/** URL to load a file from an agent's workspace (e.g. generated QR PNG). Use for img src. */
export function getWorkspaceFileUrl(agentId: string, filename: string): string {
  const path = `${BASE}/api/agents/${encodeURIComponent(agentId)}/workspace/${encodeURIComponent(filename)}`;
  const token = getDashboardToken();
  return token ? `${path}?token=${encodeURIComponent(token)}` : path;
}

/** Fetch workspace template file content as text (e.g. IDENTITY.md, USER.md). Returns "" if file not found. */
export async function getWorkspaceFileContent(agentId: string, filename: string): Promise<string> {
  const url = getWorkspaceFileUrl(agentId, filename);
  const res = await fetch(url, { headers: authHeaders() });
  checkUnauthorized(res);
  if (res.status === 404) return "";
  if (!res.ok) throw new Error(`Failed to load ${filename}: ${res.status}`);
  return res.text();
}

/** Update a workspace template file (IDENTITY.md, USER.md, TOOLS.md, SYSTEM.md, etc.). */
export async function putWorkspaceFile(agentId: string, filename: string, content: string): Promise<void> {
  const url = getWorkspaceFileUrl(agentId, filename);
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ content }),
  });
  checkUnauthorized(res);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Failed to save ${filename}: ${res.status}`);
  }
}

/** WebSocket URL for live event stream (tasks/logs updates). */
export function getEventStreamUrl(): string {
  const wsBase = BASE.replace(/^http/, "ws") + "/api/events";
  const token = getDashboardToken();
  return token ? `${wsBase}?token=${encodeURIComponent(token)}` : wsBase;
}

/**
 * Probe the server without auth. Returns true if the server requires a token (401).
 * Use when there is no stored token to decide whether to show the login page.
 */
export async function isAuthRequired(): Promise<boolean> {
  const res = await fetch(`${BASE}/api/agents`, { headers: { "Content-Type": "application/json" } });
  return res.status === 401;
}

/**
 * First-time only: get dashboard token without auth. Returns token when onboarding is not yet completed; 403 otherwise.
 */
export async function getBootstrapToken(): Promise<string | null> {
  const res = await fetch(`${BASE}/api/bootstrap/dashboard-token`, { headers: { "Content-Type": "application/json" } });
  if (res.status === 403) return null;
  if (!res.ok) return null;
  const data = (await res.json()) as { token?: string };
  return typeof data.token === "string" ? data.token : null;
}

/**
 * Check if workspace (folders + database) is ready. No auth. Used before onboarding to show "Setting up workspace…".
 */
export async function getWorkspaceStatus(): Promise<{ ready: boolean; error?: string }> {
  const res = await fetch(`${BASE}/api/bootstrap/workspace-status`, { headers: { "Content-Type": "application/json" } });
  const data = (await res.json()) as { ready?: boolean; error?: string };
  return { ready: Boolean(data.ready), error: data.error };
}

/**
 * Create workspace dirs and install default agents. No auth. Idempotent.
 */
export async function setupWorkspace(): Promise<{ ok: boolean; installed?: number; error?: string }> {
  const res = await fetch(`${BASE}/api/bootstrap/setup-workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text };
  }
  const data = (await res.json()) as { ok?: boolean; installed?: number };
  return { ok: true, installed: data.installed };
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options?.headers },
  });
  checkUnauthorized(res);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export interface AgentSummary {
  id: string;
  name: string;
  description?: string;
  model: string;
  personality?: string | null;
  schedule?: string | null;
  schedule_input?: string | null;
  /** When false, cron for this agent is paused. */
  schedule_enabled?: boolean;
  skills?: string[];
  tools?: string[];
  /** Avatar filename (e.g. agent1.jpg) from public/media. */
  avatar?: string | null;
  /** True when created via the dashboard; only these can be deleted. */
  user_created?: boolean;
}

export interface CreateAgentPayload {
  id: string;
  name: string;
  model: string;
  description?: string;
  personality?: string;
  skills?: string[];
  schedule?: string;
  schedule_input?: string;
  /** Avatar filename (e.g. agent1.jpg). If omitted, server assigns one randomly. */
  avatar?: string;
  limits?: { max_turns?: number; max_runtime?: number; max_tokens?: number };
}

export interface AgentSuggestion {
  name: string;
  id: string;
  description: string;
  skills: string[];
  schedule: string;
  schedule_input: string;
}

export interface TaskItem {
  id: string;
  agent_id?: string;
  graph_id?: string;
  input: string;
  status: string;
  created_at: string;
  updated_at: string;
  result?: { success: boolean; output: string; error?: string; turns: number; tool_calls?: number; node_results?: Array<{ node_id: string; agent_id: string; success: boolean; output: string; error?: string }> };
}

export interface LogEvent {
  type: string;
  timestamp: string;
  data: unknown;
}

export type ConversationRole = "system" | "user" | "assistant" | "tool";

export interface ConversationMessage {
  id: number;
  conversation_id: string;
  agent_id: string;
  user_id: string | null;
  role: ConversationRole;
  content: unknown;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  agent_id: string;
  user_id: string | null;
  title: string | null;
  created_at: string;
}

export const api = {
  async getAgents(): Promise<{ agents: AgentSummary[] }> {
    return fetchJson("/api/agents");
  },

  getWorkspaceFileContent,
  putWorkspaceFile,

  async updateAgent(
    id: string,
    payload: {
      name?: string | null;
      description?: string | null;
      model?: string | null;
      personality?: string | null;
      skills?: string[] | null;
      tools?: string[] | null;
      limits?: { max_turns?: number; max_runtime?: number; max_tokens?: number } | null;
      schedule?: string | null;
      schedule_input?: string | null;
      avatar?: string | null;
      schedule_enabled?: boolean | null;
    }
  ): Promise<{
    ok: boolean;
    agent: AgentSummary & { personality?: string | null; limits?: Record<string, unknown> | null };
  }> {
    return fetchJson(`/api/agents/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async installSystemAgents(): Promise<{ ok: boolean; installed: number }> {
    return fetchJson("/api/agents/install-system", { method: "POST" });
  },

  async installSystemSkills(): Promise<{ ok: boolean; installed: number }> {
    return fetchJson("/api/skills/install-system", { method: "POST" });
  },

  async deleteAgent(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    });
    checkUnauthorized(res);
    if (!res.ok) {
      const text = await res.text();
      let msg = `API ${res.status}: ${text}`;
      try {
        const body = JSON.parse(text) as { error?: string };
        if (typeof body.error === "string") msg = body.error;
      } catch {
        /* use full text */
      }
      throw new Error(msg);
    }
    return res.json() as Promise<{ ok: boolean }>;
  },

  async createAgent(payload: CreateAgentPayload): Promise<{ ok: boolean; agent: { id: string; name: string; model: string; skills?: string[] } }> {
    return fetchJson("/api/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async suggestAgent(prompt: string): Promise<{ suggestion: AgentSuggestion }> {
    return fetchJson("/api/agents/suggest", {
      method: "POST",
      body: JSON.stringify({ prompt: prompt.trim() }),
    });
  },

  async runAgent(
    agent_id: string,
    task: string,
    options?: { conversation_id?: string }
  ): Promise<{
    success: boolean;
    output: string;
    error?: string;
    turns: number;
    steps?: Array<{ tool: string; args?: unknown; result?: unknown; error?: string }>;
    usage?: { input_tokens: number; output_tokens: number };
    model?: string;
  }> {
    return fetchJson("/api/agents/run", {
      method: "POST",
      body: JSON.stringify({ agent_id, task, conversation_id: options?.conversation_id }),
    });
  },

  /**
   * Upload a file into the agent's workspace. Returns the absolute path to use in exec/tools (e.g. YouTube upload).
   */
  async uploadAgentFile(agent_id: string, file: File): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${BASE}/api/agents/${encodeURIComponent(agent_id)}/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    checkUnauthorized(res);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Upload failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<{ path: string }>;
  },

  /**
   * Run agent with SSE stream: onDelta(delta), onToolCall(name, result?, error?), onDone(payload), onError(message).
   * Resolves when stream ends; rejects on fetch/parse errors.
   * If attachment_paths is provided (e.g. from uploadAgentFile), the agent sees them in the task context.
   */
  async runAgentStream(
    agent_id: string,
    task: string,
    options: {
      conversation_id?: string;
      attachment_paths?: string[];
      onDelta?: (delta: string) => void;
      onToolCall?: (name: string, result?: unknown, error?: string) => void;
      onDone?: (data: {
        finalContent: string;
        turnCount: number;
        usage?: { input_tokens: number; output_tokens: number };
        model?: string;
        steps?: Array<{ tool: string; args?: unknown; result?: unknown; error?: string }>;
      }) => void;
      onError?: (message: string) => void;
    }
  ): Promise<void> {
    const res = await fetch(`${BASE}/api/agents/run/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        agent_id,
        task,
        conversation_id: options.conversation_id ?? undefined,
        attachment_paths: options.attachment_paths ?? undefined,
      }),
    });
    checkUnauthorized(res);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ") && currentEvent) {
            const dataStr = line.slice(6);
            try {
              const data = JSON.parse(dataStr) as Record<string, unknown>;
              if (currentEvent === "assistant" && typeof data.delta === "string") {
                options.onDelta?.(data.delta);
              } else if (currentEvent === "tool_call") {
                options.onToolCall?.(
                  String(data.name ?? ""),
                  data.result,
                  typeof data.error === "string" ? data.error : undefined
                );
              } else if (currentEvent === "done") {
                options.onDone?.({
                  finalContent: String(data.finalContent ?? ""),
                  turnCount: Number(data.turnCount ?? 0),
                  usage: data.usage as { input_tokens: number; output_tokens: number } | undefined,
                  model: typeof data.model === "string" ? data.model : undefined,
                  steps: Array.isArray(data.steps) ? (data.steps as Array<{ tool: string; args?: unknown; result?: unknown; error?: string }>) : undefined,
                });
              } else if (currentEvent === "error" && typeof data.message === "string") {
                options.onError?.(data.message);
              }
            } catch {
              // ignore parse errors for this line
            }
            currentEvent = "";
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  async updateConversationTitle(conversation_id: string, title: string): Promise<{ ok: boolean }> {
    return fetchJson(`/api/conversations/${encodeURIComponent(conversation_id)}`, {
      method: "PUT",
      body: JSON.stringify({ title }),
    });
  },

  async getTasks(params?: { agent_id?: string; graph_id?: string; status?: string; limit?: number }): Promise<{ tasks: TaskItem[] }> {
    const sp = new URLSearchParams();
    if (params?.agent_id) sp.set("agent_id", params.agent_id);
    if (params?.graph_id) sp.set("graph_id", params.graph_id);
    if (params?.status) sp.set("status", params.status);
    if (params?.limit) sp.set("limit", String(params.limit));
    const q = sp.toString();
    return fetchJson(`/api/tasks${q ? `?${q}` : ""}`);
  },

  async enqueueTask(agent_id: string, task: string): Promise<{ task: TaskItem }> {
    return fetchJson("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ agent_id, task }),
    });
  },

  async enqueueGraphTask(graph_id: string, task: string): Promise<{ task: TaskItem }> {
    return fetchJson("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ graph_id, task }),
    });
  },

  async getLogs(): Promise<{ events: LogEvent[] }> {
    return fetchJson("/api/logs");
  },

  async saveConversationMessage(body: {
    conversation_id?: string;
    agent_id?: string;
    graph_id?: string;
    user_id?: string;
    role: ConversationRole;
    content: unknown;
  }): Promise<{ ok: boolean; conversation_id: string; message_id: number | null }> {
    if (!body.graph_id && !body.agent_id) {
      throw new Error("agent_id or graph_id is required");
    }
    return fetchJson("/api/conversations", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async getConversationMessages(params: {
    conversation_id: string;
    limit?: number;
  }): Promise<{ messages: ConversationMessage[] }> {
    const sp = new URLSearchParams();
    sp.set("conversation_id", params.conversation_id);
    if (params.limit) sp.set("limit", String(params.limit));
    const q = sp.toString();
    return fetchJson(`/api/conversations?${q}`);
  },

  async getConversations(params: {
    agent_id?: string;
    graph_id?: string;
    limit?: number;
  }): Promise<{ conversations: ConversationSummary[] }> {
    const sp = new URLSearchParams();
    if (params.agent_id) sp.set("agent_id", params.agent_id);
    if (params.graph_id) sp.set("graph_id", params.graph_id);
    if (params.limit) sp.set("limit", String(params.limit));
    const q = sp.toString();
    if (!params.agent_id && !params.graph_id) throw new Error("agent_id or graph_id is required");
    return fetchJson(`/api/conversations?${q}`);
  },

  async getTelegramStatus(): Promise<{
    configured: boolean;
    webhook_set: boolean;
    webhook_url: string | null;
    error?: string;
  }> {
    return fetchJson("/api/channels/telegram/status");
  },

  async setTelegramWebhook(baseUrl: string): Promise<{ ok: boolean; webhook_url?: string; error?: string }> {
    return fetchJson("/api/channels/telegram/set-webhook", {
      method: "POST",
      body: JSON.stringify({ base_url: baseUrl }),
    });
  },

  async getSlackStatus(): Promise<{ configured: boolean }> {
    return fetchJson("/api/channels/slack/status");
  },

  async getDiscordStatus(): Promise<{ configured: boolean }> {
    return fetchJson("/api/channels/discord/status");
  },

  async getSignalStatus(): Promise<{ configured: boolean }> {
    return fetchJson("/api/channels/signal/status");
  },

  async getViberStatus(): Promise<{ configured: boolean; webhook_set?: boolean; webhook_url?: string | null; error?: string }> {
    return fetchJson("/api/channels/viber/status");
  },

  async setViberWebhook(baseUrl: string): Promise<{ ok: boolean; webhook_url?: string; error?: string }> {
    return fetchJson("/api/channels/viber/set-webhook", {
      method: "POST",
      body: JSON.stringify({ base_url: baseUrl }),
    });
  },

  /** Fetch setup doc markdown for display in Settings (e.g. telegram-setup, slack-setup, discord-setup, signal-setup, viber-setup). */
  async getDoc(name: "telegram-setup" | "slack-setup" | "discord-setup" | "signal-setup" | "viber-setup"): Promise<{ content: string }> {
    return fetchJson(`/api/docs/${name}`);
  },

  async searchMemory(params: {
    q?: string;
    agent_id?: string;
    user_id?: string;
    limit?: number;
    semantic?: boolean;
  }): Promise<{ results: Array<{ id: number; user_id: string | null; agent_id: string; scope?: string; text: string; tags?: unknown; created_at: string }> }> {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.agent_id) sp.set("agent_id", params.agent_id);
    if (params.user_id) sp.set("user_id", params.user_id);
    if (params.limit != null) sp.set("limit", String(params.limit));
    if (params.semantic) sp.set("semantic", "1");
    return fetchJson(`/api/memory/search?${sp.toString()}`);
  },

  async writeMemory(body: { agent_id: string; text: string; user_id?: string; tags?: unknown; embed?: boolean }): Promise<{ ok: boolean; id: number }> {
    return fetchJson("/api/memory/write", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async deleteMemory(id: number): Promise<{ ok: boolean }> {
    return fetchJson(`/api/memory/${id}`, { method: "DELETE" });
  },

  async getSettings(): Promise<{
    has_api_key: boolean;
    provider: "openrouter" | "openai" | null;
    has_openai_key?: boolean;
    has_anthropic_key?: boolean;
    has_google_key?: boolean;
    has_openrouter_key?: boolean;
    telegram_configured?: boolean;
    telegram_default_agent_id?: string | null;
    slack_configured?: boolean;
    slack_default_agent_id?: string | null;
    discord_configured?: boolean;
    discord_default_agent_id?: string | null;
    signal_configured?: boolean;
    signal_default_agent_id?: string | null;
    signal_bridge_url?: string | null;
    viber_configured?: boolean;
    viber_default_agent_id?: string | null;
    /** When true, setup/onboarding has been completed (stored in ~/.agent-os/config.json). */
    onboarding_completed?: boolean;
  }> {
    return fetchJson("/api/settings");
  },

  async saveSettings(settings: {
    provider?: "openrouter" | "openai";
    api_key?: string;
    openai_api_key?: string | null;
    anthropic_api_key?: string | null;
    google_api_key?: string | null;
    openrouter_api_key?: string | null;
    telegram_bot_token?: string | null;
    telegram_default_agent_id?: string | null;
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
  }): Promise<{ ok: boolean }> {
    return fetchJson("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  },

  async regenerateDashboardToken(): Promise<{ token: string; message: string }> {
    return fetchJson("/api/settings/dashboard-token/regenerate", {
      method: "POST",
    });
  },

  async getGraphs(): Promise<{ graphs: { id: string }[] }> {
    return fetchJson("/api/graphs");
  },

  async getGraph(id: string): Promise<Graph> {
    return fetchJson(`/api/graphs/${encodeURIComponent(id)}`);
  },

  async saveGraph(graph: Graph): Promise<{ ok: boolean; graph: Graph }> {
    return fetchJson(`/api/graphs/${encodeURIComponent(graph.id)}`, {
      method: "PUT",
      body: JSON.stringify(graph),
    });
  },

  async runGraph(graph_id: string, input: string): Promise<GraphRunResult> {
    return fetchJson("/api/graphs/run", {
      method: "POST",
      body: JSON.stringify({ graph_id, input }),
    });
  },

  /**
   * Run graph with SSE stream: onNodeDone for each node, onDone with final output and node_results, onError.
   */
  async runGraphStream(
    graph_id: string,
    input: string,
    options: {
      onNodeDone?: (data: { node_id: string; agent_id: string; success: boolean; output: string; error?: string }) => void;
      onDone?: (data: { success: boolean; output: string; node_results: GraphRunResult["node_results"] }) => void;
      onError?: (message: string) => void;
    }
  ): Promise<void> {
    const res = await fetch(`${BASE}/api/graphs/run/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ graph_id, input }),
    });
    checkUnauthorized(res);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
              if (currentEvent === "node_done") {
                options.onNodeDone?.({
                  node_id: String(data.node_id ?? ""),
                  agent_id: String(data.agent_id ?? ""),
                  success: Boolean(data.success),
                  output: String(data.output ?? ""),
                  error: typeof data.error === "string" ? data.error : undefined,
                });
              } else if (currentEvent === "done") {
                options.onDone?.({
                  success: Boolean(data.success),
                  output: String(data.output ?? ""),
                  node_results: Array.isArray(data.node_results) ? (data.node_results as GraphRunResult["node_results"]) : [],
                });
              } else if (currentEvent === "error" && typeof data.message === "string") {
                options.onError?.(data.message);
              }
            } catch {
              // ignore
            }
            currentEvent = "";
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  async getSkills(): Promise<{ skills: SkillSummary[] }> {
    return fetchJson("/api/skills");
  },

  async getSkillMarketplace(): Promise<{ marketplace: MarketplaceEntry[] }> {
    return fetchJson("/api/skills/marketplace");
  },

  /** Fetch skill store registry (SulalaHub). Requires SKILLS_REGISTRY_URL to be set on the agent. Install uses the store's /download endpoint (ZIP). */
  async getStoreRegistry(): Promise<{ skills: StoreRegistrySkill[]; storeBase: string | null; registryUrl: string | null }> {
    return fetchJson("/api/skills/store-registry");
  },

  /**
   * Install a skill from a local path or from a URL.
   * For the store: use the skill's downloadUrl (ZIP). The agent fetches the URL, unzips, and installs to ~/.agent-os/skills.
   * Also supports tar.gz URLs (e.g. GitHub archive).
   */
  async installSkill(payload: InstallSkillPayload): Promise<{ skill: { id: string } }> {
    return fetchJson("/api/skills/install", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async uploadSkill(file: File): Promise<{ skill: { id: string } }> {
    const formData = new FormData();
    formData.set("file", file);
    const base = import.meta.env.VITE_AGENT_OS_API ?? "http://0.0.0.0:3010";
    const res = await fetch(`${base}/api/skills/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    checkUnauthorized(res);
    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
    return res.json() as Promise<{ skill: { id: string } }>;
  },

  async uploadSkillMd(file: File, id?: string): Promise<{ skill: { id: string } }> {
    const formData = new FormData();
    formData.set("file", file);
    if (id?.trim()) formData.set("id", id.trim());
    const base = import.meta.env.VITE_AGENT_OS_API ?? "http://0.0.0.0:3010";
    const res = await fetch(`${base}/api/skills/upload-skill-md`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    checkUnauthorized(res);
    if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
    return res.json() as Promise<{ skill: { id: string } }>;
  },

  async getSkillConfig(skillId: string): Promise<{ configured: string[] }> {
    return fetchJson(`/api/skills/${encodeURIComponent(skillId)}/config`);
  },

  async getSkillConfigSchema(skillId: string): Promise<Record<string, unknown> | null> {
    const base = import.meta.env.VITE_AGENT_OS_API ?? "http://0.0.0.0:3010";
    const res = await fetch(`${base}/api/skills/${encodeURIComponent(skillId)}/config/schema`, {
      headers: authHeaders(),
    });
    checkUnauthorized(res);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  },

  async getSkillSetup(skillId: string): Promise<{ setup_markdown: string | null }> {
    return fetchJson(`/api/skills/${encodeURIComponent(skillId)}/setup`);
  },

  async saveSkillConfig(skillId: string, config: Record<string, string>): Promise<{ ok: boolean }> {
    return fetchJson(`/api/skills/${encodeURIComponent(skillId)}/config`, {
      method: "PUT",
      body: JSON.stringify(config),
    });
  },

  async uninstallSkill(skillId: string): Promise<{ ok: boolean }> {
    return fetchJson(`/api/skills/${encodeURIComponent(skillId)}`, {
      method: "DELETE",
    });
  },

  async summarizeConversation(conversation_id: string): Promise<{ ok: boolean; summary: string }> {
    return fetchJson("/api/conversations/summarize", {
      method: "POST",
      body: JSON.stringify({ conversation_id }),
    });
  },
};

export interface SkillSummary {
  id: string;
  name: string;
  description?: string;
  tools: Array<{ id: string; description?: string }>;
  required_env?: string[];
  /** True when system-provided; user cannot uninstall. */
  system?: boolean;
}

export interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  install_url?: string;
  install_path?: string;
}

/** Skill entry from the store registry (SulalaHub). */
export interface StoreRegistrySkill {
  slug: string;
  name: string;
  description?: string;
  version?: string;
  /** Markdown content URL (for viewing). */
  url?: string;
  /** ZIP download URL for install. Prefer this when installing so the agent gets a zip. */
  downloadUrl?: string;
  priceCents?: number;
  category?: string;
  tags?: string[];
  featured?: boolean;
}

/** Payload for installSkill. Use url with the store's downloadUrl (ZIP) for store skills; agent fetches, unzips, installs to ~/.agent-os/skills. */
export interface InstallSkillPayload {
  path?: string;
  /** ZIP download URL (e.g. store downloadUrl) or tar.gz URL. Agent fetches and unzips. */
  url?: string;
  /** When installing from store Discover, pass the skill slug so the agent installs to skills/<slug>. */
  slug?: string;
}

export interface GraphRunResult {
  success: boolean;
  output: string;
  /** Set when success is false (e.g. server error). */
  error?: string;
  node_results: Array<{
    node_id: string;
    agent_id: string;
    success: boolean;
    output: string;
    error?: string;
  }>;
}

export interface GraphNode {
  id: string;
  agent: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface Graph {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  schedule?: string | null;
  schedule_input?: string | null;
  schedule_enabled?: boolean;
}
