/**
 * Agent OS config — stored under ~/.agent-os/config.json (or AGENT_OS_HOME).
 * Holds API keys and provider so the LLM can use them; env vars override for flexibility.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { randomBytes } from "node:crypto";

const DEFAULT_HOME = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".agent-os"
);

export function getAgentOsHome(): string {
  return process.env.AGENT_OS_HOME || DEFAULT_HOME;
}

export function getConfigPath(): string {
  return join(getAgentOsHome(), "config.json");
}

/**
 * Path to the SQLite database. When AGENT_OS_AGENTS_DIR is set (e.g. ./data/agents),
 * the DB is placed next to it (e.g. ./data/database.db) so it stays on local disk and
 * avoids SQLITE_IOERR_VNODE on macOS when ~/.agent-os is on iCloud or a sync volume.
 */
export function getMemoryDbPath(): string {
  if (process.env.AGENT_MEMORY_DB_PATH) return process.env.AGENT_MEMORY_DB_PATH;
  const agentsDir = process.env.AGENT_OS_AGENTS_DIR;
  if (agentsDir) return join(dirname(agentsDir), "database.db");
  return join(getAgentOsHome(), "database.db");
}

export interface AgentOsConfig {
  /** @deprecated Use openai_api_key / openrouter_api_key etc. Kept for backward compat. */
  provider?: "openrouter" | "openai";
  /** @deprecated Use per-provider keys below. */
  api_key?: string;
  openai_api_key?: string;
  anthropic_api_key?: string;
  google_api_key?: string;
  openrouter_api_key?: string;
  /** Telegram bot token (from BotFather). When set, webhook at /api/channels/telegram/webhook can receive updates. */
  telegram_bot_token?: string;
  /** Agent id to use for Telegram chats when no other agent is specified. */
  telegram_default_agent_id?: string;
  /** Chat ID to send schedule reports to when user selects "Use channel from Settings". Set by sending /set_report_chat to the bot. */
  telegram_report_chat_id?: string;
  /** Slack bot token (xoxb-...). When set, webhook at /api/channels/slack/webhook can receive events. */
  slack_bot_token?: string;
  /** Slack signing secret (from app Basic Info). Used to verify request signatures. */
  slack_signing_secret?: string;
  /** Agent id to use for Slack messages. */
  slack_default_agent_id?: string;
  /** Discord bot token. When set, webhook at /api/channels/discord/webhook can receive interactions. */
  discord_bot_token?: string;
  /** Discord application public key (hex, for verifying interaction signatures). */
  discord_public_key?: string;
  /** Agent id to use for Discord slash commands. */
  discord_default_agent_id?: string;
  /** Signal bridge base URL (e.g. http://localhost:8080). Bridge receives Signal messages and POSTs to our webhook; we reply via POST to bridge /send. */
  signal_bridge_url?: string;
  /** Agent id to use for Signal messages. */
  signal_default_agent_id?: string;
  /** Viber bot auth token (X-Viber-Auth-Token). When set, webhook at /api/channels/viber/webhook can receive callbacks. */
  viber_auth_token?: string;
  /** Agent id to use for Viber messages. */
  viber_default_agent_id?: string;
  /** When true, dashboard onboarding/setup wizard has been completed (stored in ~/.agent-os/config.json). */
  onboarding_completed?: boolean;
  /** Skills store registry URL (e.g. https://hub.sulala.ai/api/sulalahub/registry). Set at onboard; override with SKILLS_REGISTRY_URL. */
  skills_registry_url?: string;
  /** Dashboard gateway token. When set, dashboard and API require Authorization: Bearer <token>. Generated on first run if not set; override with DASHBOARD_SECRET env. */
  dashboard_secret?: string;
  /** When true, local Ollama counts as a configured AI provider (no cloud key required). */
  ollama_enabled?: boolean;
  /** OpenAI-compatible API base for Ollama (e.g. http://127.0.0.1:11434/v1). */
  ollama_base_url?: string;
  /** Ollama model tag without the ollama/ prefix (e.g. qwen3, qwen3:8b). */
  ollama_default_model?: string;
  /** Optional Bearer token for Ollama; local default is often unnecessary. */
  ollama_api_key?: string;
}

export interface McpServerConfig {
  /** Stable id/slug for this server (used in tool ids). */
  id: string;
  /** Display name in UI. */
  name?: string;
  /** When false, server is ignored by runtime. */
  enabled?: boolean;
  /** Transport type. Start with stdio. */
  transport?: "stdio";
  /** Command to spawn (e.g. npx). */
  command: string;
  /** Args to pass (e.g. ["-y","@enescinar/twitter-mcp"]). */
  args?: string[];
  /** Environment variables for the spawned process (API keys, etc.). */
  env?: Record<string, string>;
}

export interface McpConfigFile {
  mcpServers: Record<string, Omit<McpServerConfig, "id"> & { id?: string }>;
}

export function getMcpConfigPath(): string {
  return join(getAgentOsHome(), "mcp.json");
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return Boolean(x) && typeof x === "object" && !Array.isArray(x);
}

export async function readMcpConfig(): Promise<McpServerConfig[]> {
  const path = getMcpConfigPath();
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return [];
    const mcpServers = (parsed as Record<string, unknown>).mcpServers;
    if (!isPlainObject(mcpServers)) return [];
    const out: McpServerConfig[] = [];
    for (const [key, value] of Object.entries(mcpServers)) {
      if (!isPlainObject(value)) continue;
      const id = (typeof value.id === "string" ? value.id : key).trim();
      const command = typeof value.command === "string" ? value.command.trim() : "";
      if (!id || !command) continue;
      const cfg: McpServerConfig = {
        id,
        name: typeof value.name === "string" ? value.name : undefined,
        enabled: value.enabled === false ? false : true,
        transport: value.transport === "stdio" || value.transport == null ? "stdio" : "stdio",
        command,
        args: Array.isArray(value.args) ? (value.args as unknown[]).filter((a): a is string => typeof a === "string") : undefined,
        env: isPlainObject(value.env)
          ? Object.fromEntries(Object.entries(value.env).filter(([, v]) => typeof v === "string")) as Record<string, string>
          : undefined,
      };
      out.push(cfg);
    }
    return out;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[config] readMcpConfig error:", err);
    }
    return [];
  }
}

export async function writeMcpConfig(servers: McpServerConfig[]): Promise<void> {
  const home = getAgentOsHome();
  const path = getMcpConfigPath();
  await mkdir(home, { recursive: true });
  const mcpServers: McpConfigFile["mcpServers"] = {};
  for (const s of servers) {
    const id = s.id?.trim();
    if (!id) continue;
    mcpServers[id] = {
      id,
      name: s.name,
      enabled: s.enabled !== false,
      transport: "stdio",
      command: s.command,
      args: s.args,
      env: s.env,
    };
  }
  const payload: McpConfigFile = { mcpServers };
  await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
}

export async function readConfig(): Promise<AgentOsConfig> {
  const path = getConfigPath();
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      const provider = o.provider;
      const api_key = o.api_key;
      const openai_api_key = o.openai_api_key;
      const anthropic_api_key = o.anthropic_api_key;
      const google_api_key = o.google_api_key;
      const openrouter_api_key = o.openrouter_api_key;
      const telegram_bot_token = o.telegram_bot_token;
      const telegram_default_agent_id = o.telegram_default_agent_id;
      const telegram_report_chat_id = o.telegram_report_chat_id;
      const slack_bot_token = o.slack_bot_token;
      const slack_signing_secret = o.slack_signing_secret;
      const slack_default_agent_id = o.slack_default_agent_id;
      const discord_bot_token = o.discord_bot_token;
      const discord_public_key = o.discord_public_key;
      const discord_default_agent_id = o.discord_default_agent_id;
      const signal_bridge_url = o.signal_bridge_url;
      const signal_default_agent_id = o.signal_default_agent_id;
      const viber_auth_token = o.viber_auth_token;
      const viber_default_agent_id = o.viber_default_agent_id;
      const onboarding_completed = o.onboarding_completed;
      const skills_registry_url = o.skills_registry_url;
      const dashboard_secret = o.dashboard_secret;
      const ollama_enabled = o.ollama_enabled;
      const ollama_base_url = o.ollama_base_url;
      const ollama_default_model = o.ollama_default_model;
      const ollama_api_key = o.ollama_api_key;
      return {
        provider:
          provider === "openrouter" || provider === "openai"
            ? provider
            : undefined,
        api_key: typeof api_key === "string" ? api_key : undefined,
        openai_api_key: typeof openai_api_key === "string" ? openai_api_key : undefined,
        anthropic_api_key: typeof anthropic_api_key === "string" ? anthropic_api_key : undefined,
        google_api_key: typeof google_api_key === "string" ? google_api_key : undefined,
        openrouter_api_key: typeof openrouter_api_key === "string" ? openrouter_api_key : undefined,
        telegram_bot_token: typeof telegram_bot_token === "string" ? telegram_bot_token : undefined,
        telegram_default_agent_id: typeof telegram_default_agent_id === "string" ? telegram_default_agent_id : undefined,
        telegram_report_chat_id: typeof telegram_report_chat_id === "string" ? telegram_report_chat_id.trim() || undefined : undefined,
        slack_bot_token: typeof slack_bot_token === "string" ? slack_bot_token : undefined,
        slack_signing_secret: typeof slack_signing_secret === "string" ? slack_signing_secret : undefined,
        slack_default_agent_id: typeof slack_default_agent_id === "string" ? slack_default_agent_id : undefined,
        discord_bot_token: typeof discord_bot_token === "string" ? discord_bot_token : undefined,
        discord_public_key: typeof discord_public_key === "string" ? discord_public_key : undefined,
        discord_default_agent_id: typeof discord_default_agent_id === "string" ? discord_default_agent_id : undefined,
        signal_bridge_url: typeof signal_bridge_url === "string" ? signal_bridge_url.trim() || undefined : undefined,
        signal_default_agent_id: typeof signal_default_agent_id === "string" ? signal_default_agent_id : undefined,
        viber_auth_token: typeof viber_auth_token === "string" ? viber_auth_token : undefined,
        viber_default_agent_id: typeof viber_default_agent_id === "string" ? viber_default_agent_id : undefined,
        onboarding_completed: onboarding_completed === true ? true : undefined,
        skills_registry_url: typeof skills_registry_url === "string" ? skills_registry_url.trim() || undefined : undefined,
        dashboard_secret: typeof dashboard_secret === "string" ? dashboard_secret.trim() || undefined : undefined,
        ollama_enabled: ollama_enabled === true ? true : undefined,
        ollama_base_url: typeof ollama_base_url === "string" ? ollama_base_url.trim() || undefined : undefined,
        ollama_default_model:
          typeof ollama_default_model === "string" ? ollama_default_model.trim() || undefined : undefined,
        ollama_api_key: typeof ollama_api_key === "string" ? ollama_api_key.trim() || undefined : undefined,
      };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[config] read error:", err);
    }
  }
  return {};
}

/** Default model ids per provider, used when installing default agents so they use a configured key. Prefer current/latest model ids. */
const DEFAULT_MODEL_BY_PROVIDER = {
  google: "gemini-2.0-flash",
  anthropic: "claude-sonnet-4-6",
  openrouter: "openai/gpt-4o-mini",
  openai: "gpt-4o-mini",
} as const;

/**
 * Returns a model id for the first provider that has an API key set (env or config).
 * Used when installing default agents so they don't error with "No LLM API key".
 */
export async function getDefaultModelForAvailableProvider(): Promise<string | null> {
  const config = await readConfig();
  const googleKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || config.google_api_key?.trim();
  if (googleKey) return DEFAULT_MODEL_BY_PROVIDER.google;
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY?.trim() || config.anthropic_api_key?.trim();
  if (anthropicKey) return DEFAULT_MODEL_BY_PROVIDER.anthropic;
  const openrouterKey =
    process.env.OPENROUTER_API_KEY?.trim() ||
    config.openrouter_api_key?.trim() ||
    (config.provider === "openrouter" ? config.api_key?.trim() : undefined);
  if (openrouterKey) return DEFAULT_MODEL_BY_PROVIDER.openrouter;
  const openaiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    config.openai_api_key?.trim() ||
    (config.provider === "openai" ? config.api_key?.trim() : undefined);
  if (openaiKey) return DEFAULT_MODEL_BY_PROVIDER.openai;
  if (config.ollama_enabled === true) {
    const tag = config.ollama_default_model?.trim() || "qwen3";
    return `ollama/${tag}`;
  }
  return null;
}

/**
 * Model id for one-shot LLM calls (e.g. agent suggest): env override, else first available provider default.
 */
export async function getSuggestModelId(): Promise<string> {
  const env = process.env.AGENT_OS_SUGGEST_MODEL?.trim();
  if (env) return env;
  const fallback = await getDefaultModelForAvailableProvider();
  return fallback ?? "gpt-4o-mini";
}

export async function writeConfig(updates: Partial<AgentOsConfig>): Promise<void> {
  const current = await readConfig();
  const merged: AgentOsConfig = {
    provider: updates.provider !== undefined ? updates.provider : current.provider,
    api_key: updates.api_key !== undefined ? updates.api_key : current.api_key,
    openai_api_key: updates.openai_api_key !== undefined ? updates.openai_api_key : current.openai_api_key,
    anthropic_api_key: updates.anthropic_api_key !== undefined ? updates.anthropic_api_key : current.anthropic_api_key,
    google_api_key: updates.google_api_key !== undefined ? updates.google_api_key : current.google_api_key,
    openrouter_api_key: updates.openrouter_api_key !== undefined ? updates.openrouter_api_key : current.openrouter_api_key,
    telegram_bot_token: updates.telegram_bot_token !== undefined ? updates.telegram_bot_token : current.telegram_bot_token,
    telegram_default_agent_id: updates.telegram_default_agent_id !== undefined ? updates.telegram_default_agent_id : current.telegram_default_agent_id,
    telegram_report_chat_id: updates.telegram_report_chat_id !== undefined ? updates.telegram_report_chat_id : current.telegram_report_chat_id,
    slack_bot_token: updates.slack_bot_token !== undefined ? updates.slack_bot_token : current.slack_bot_token,
    slack_signing_secret: updates.slack_signing_secret !== undefined ? updates.slack_signing_secret : current.slack_signing_secret,
    slack_default_agent_id: updates.slack_default_agent_id !== undefined ? updates.slack_default_agent_id : current.slack_default_agent_id,
    discord_bot_token: updates.discord_bot_token !== undefined ? updates.discord_bot_token : current.discord_bot_token,
    discord_public_key: updates.discord_public_key !== undefined ? updates.discord_public_key : current.discord_public_key,
    discord_default_agent_id: updates.discord_default_agent_id !== undefined ? updates.discord_default_agent_id : current.discord_default_agent_id,
    signal_bridge_url: updates.signal_bridge_url !== undefined ? updates.signal_bridge_url : current.signal_bridge_url,
    signal_default_agent_id: updates.signal_default_agent_id !== undefined ? updates.signal_default_agent_id : current.signal_default_agent_id,
    viber_auth_token: updates.viber_auth_token !== undefined ? updates.viber_auth_token : current.viber_auth_token,
    viber_default_agent_id: updates.viber_default_agent_id !== undefined ? updates.viber_default_agent_id : current.viber_default_agent_id,
    onboarding_completed: updates.onboarding_completed !== undefined ? updates.onboarding_completed : current.onboarding_completed,
    skills_registry_url: updates.skills_registry_url !== undefined ? updates.skills_registry_url : current.skills_registry_url,
    dashboard_secret: updates.dashboard_secret !== undefined ? updates.dashboard_secret : current.dashboard_secret,
    ollama_enabled: updates.ollama_enabled !== undefined ? updates.ollama_enabled : current.ollama_enabled,
    ollama_base_url: updates.ollama_base_url !== undefined ? updates.ollama_base_url : current.ollama_base_url,
    ollama_default_model:
      updates.ollama_default_model !== undefined ? updates.ollama_default_model : current.ollama_default_model,
    ollama_api_key: updates.ollama_api_key !== undefined ? updates.ollama_api_key : current.ollama_api_key,
  };
  const home = getAgentOsHome();
  const path = getConfigPath();
  await mkdir(home, { recursive: true });
  await writeFile(
    path,
    JSON.stringify(
      {
        provider: merged.provider ?? null,
        api_key: merged.api_key ?? null,
        openai_api_key: merged.openai_api_key ?? null,
        anthropic_api_key: merged.anthropic_api_key ?? null,
        google_api_key: merged.google_api_key ?? null,
        openrouter_api_key: merged.openrouter_api_key ?? null,
        telegram_bot_token: merged.telegram_bot_token ?? null,
        telegram_default_agent_id: merged.telegram_default_agent_id ?? null,
        telegram_report_chat_id: merged.telegram_report_chat_id ?? null,
        slack_bot_token: merged.slack_bot_token ?? null,
        slack_signing_secret: merged.slack_signing_secret ?? null,
        slack_default_agent_id: merged.slack_default_agent_id ?? null,
        discord_bot_token: merged.discord_bot_token ?? null,
        discord_public_key: merged.discord_public_key ?? null,
        discord_default_agent_id: merged.discord_default_agent_id ?? null,
        signal_bridge_url: merged.signal_bridge_url ?? null,
        signal_default_agent_id: merged.signal_default_agent_id ?? null,
        viber_auth_token: merged.viber_auth_token ?? null,
        viber_default_agent_id: merged.viber_default_agent_id ?? null,
        onboarding_completed: merged.onboarding_completed ?? null,
        skills_registry_url: merged.skills_registry_url ?? null,
        dashboard_secret: merged.dashboard_secret ?? null,
        ollama_enabled: merged.ollama_enabled ?? null,
        ollama_base_url: merged.ollama_base_url ?? null,
        ollama_default_model: merged.ollama_default_model ?? null,
        ollama_api_key: merged.ollama_api_key ?? null,
      },
      null,
      2
    ),
    "utf-8"
  );
}

const DEFAULT_SKILLS_REGISTRY_URL = "https://hub.sulala.ai/api/sulalahub/registry";

/** Resolve skills store registry URL: env SKILLS_REGISTRY_URL overrides config; config is set at onboard. */
export async function getSkillsRegistryUrl(): Promise<string | null> {
  const env = process.env.SKILLS_REGISTRY_URL?.trim();
  if (env) return env;
  const config = await readConfig();
  const fromConfig = config.skills_registry_url?.trim();
  if (fromConfig) return fromConfig;
  return DEFAULT_SKILLS_REGISTRY_URL;
}

/** Generate a new dashboard gateway token (base64url, 32 bytes). */
export function generateDashboardSecret(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Resolve dashboard secret for gateway auth: DASHBOARD_SECRET env overrides config;
 * if neither set, generate and store in config so dashboard is protected by default when deployed.
 */
export async function getDashboardSecret(): Promise<string> {
  const env = process.env.DASHBOARD_SECRET?.trim();
  if (env) return env;
  let config = await readConfig();
  let secret = config.dashboard_secret?.trim();
  if (secret) return secret;
  secret = generateDashboardSecret();
  await writeConfig({ dashboard_secret: secret });
  return secret;
}

/** Read dashboard secret from config only (no env, no auto-generate). For CLI show/regenerate. */
export async function getDashboardSecretFromConfig(): Promise<string | undefined> {
  const config = await readConfig();
  return config.dashboard_secret?.trim() || undefined;
}

/** Directory for per-skill config files (~/.agent-os/configs). */
export function getConfigsDir(): string {
  return join(getAgentOsHome(), "configs");
}

/** Path to a skill's stored env/config file. */
export function getSkillConfigPath(skillId: string): string {
  const safe = skillId.replace(/[^a-z0-9_-]/gi, "_");
  return join(getConfigsDir(), `${safe}.json`);
}

/** Read stored env vars for a skill (keys and values). Returns {} if missing. */
export async function readSkillConfig(skillId: string): Promise<Record<string, string>> {
  const path = getSkillConfigPath(skillId);
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof k === "string" && typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.error("[config] readSkillConfig error:", err);
    }
  }
  return {};
}

/** Write stored env vars for a skill. */
export async function writeSkillConfig(skillId: string, env: Record<string, string>): Promise<void> {
  const dir = getConfigsDir();
  const path = getSkillConfigPath(skillId);
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(env, null, 2), "utf-8");
}

/** Skills directory: ~/.agent-os/skills (or AGENT_OS_SKILLS_DIR). Used by exec tool for skill scripts. */
export function getSkillsDir(): string {
  return process.env.AGENT_OS_SKILLS_DIR || join(getAgentOsHome(), "skills");
}

/** Seed directory for system default skills (e.g. data/skills). Used by "Install default skills". */
export function getSeedSkillsDir(): string {
  if (process.env.AGENT_OS_SEED_SKILLS_DIR) return process.env.AGENT_OS_SEED_SKILLS_DIR;
  // Resolve relative to package root (works when running from dist/cli.js or from src/core/)
  const fromDist = join(import.meta.dir, "..", "data", "skills");
  const fromSrc = join(import.meta.dir, "..", "..", "data", "skills");
  if (existsSync(fromDist)) return fromDist;
  if (existsSync(fromSrc)) return fromSrc;
  return join(process.cwd(), "data", "skills");
}

/** Per-agent workspace root: ~/.agent-os/workspaces/{agent_id}/. File-access tools should restrict to this. */
export function getWorkspaceDir(agentId: string): string {
  const safe = agentId.replace(/[^a-z0-9_.-]/gi, "_");
  return join(getAgentOsHome(), "workspaces", safe);
}

/** Ensure workspace directory exists. Call at start of agent run. */
export async function ensureWorkspace(agentId: string): Promise<string> {
  const dir = getWorkspaceDir(agentId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Templates directory for agent workspace init: data/templates (or AGENT_OS_TEMPLATES_DIR). */
export function getTemplatesDir(): string {
  return process.env.AGENT_OS_TEMPLATES_DIR ?? join(process.cwd(), "data", "templates");
}

/**
 * Resolve a path relative to the agent workspace. Rejects if the result is outside the workspace (path escape).
 * Use this in file-access tools to restrict access to the sandbox.
 */
export function resolveInWorkspace(workspaceDir: string, relativePath: string): string {
  const base = resolve(workspaceDir);
  const resolved = resolve(base, relativePath);
  const rel = relative(base, resolved);
  if (rel.startsWith("..") || rel === "..") {
    throw new Error("Path must stay inside the agent workspace");
  }
  return resolved;
}
