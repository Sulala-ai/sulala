/**
 * Agent Registry — loads agents from SQLite (when store is set) or ~/.agent-os/agents/ (fallback).
 * When using SQLite, agents persist in the workspace DB and survive repo updates.
 */

import { readdir, readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MemoryStore } from "../db/memory-store.js";
import type { AgentConfig } from "../types/agent.js";
import { parseAgentConfig } from "../types/agent.js";
import { ensureWorkspace, getWorkspaceDir, getTemplatesDir, getDefaultModelForAvailableProvider } from "./config.js";

const DEFAULT_AGENTS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".agent-os",
  "agents"
);

/** When set, all agent CRUD uses SQLite instead of JSON files. Set by server at startup. */
let agentStore: MemoryStore | null = null;

export function setAgentStore(store: MemoryStore | null): void {
  agentStore = store;
}

/** Avatar filenames in dashboard public/media. One is chosen randomly when creating an agent without avatar. */
export const DEFAULT_AVATARS = ["agent1.jpg", "agent2.jpg", "agent3.jpg", "agent4.jpg"];

export function getAgentsDir(): string {
  return process.env.AGENT_OS_AGENTS_DIR || DEFAULT_AGENTS_DIR;
}

function getSeedAgentsDir(): string {
  if (process.env.AGENT_OS_SEED_AGENTS_DIR) return process.env.AGENT_OS_SEED_AGENTS_DIR;
  // Resolve relative to package root (works when running from dist/cli.js or from src/core/)
  const fromDist = join(import.meta.dir, "..", "data", "agents");
  const fromSrc = join(import.meta.dir, "..", "..", "data", "agents");
  if (existsSync(fromDist)) return fromDist;
  if (existsSync(fromSrc)) return fromSrc;
  return join(process.cwd(), "data", "agents");
}

async function insertSeedAgentFromFile(
  seedDir: string,
  name: string,
  skipIfExists: boolean,
  modelOverride?: string | null
): Promise<boolean> {
  if (!agentStore) return false;
  const path = join(seedDir, name);
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const id = parsed?.id;
  if (typeof id !== "string" || !id.trim()) return false;
  if (skipIfExists && agentStore.getAgentById(id)) return false;
  const seedModel = String(parsed.model ?? "").trim();
  const model = (modelOverride?.trim() || seedModel) || "gpt-4o-mini";
  const payload: Record<string, unknown> = {
    id: String(parsed.id).trim(),
    name: String(parsed.name ?? "").trim(),
    model,
    description: parsed.description != null ? String(parsed.description) : undefined,
    personality: parsed.personality != null ? String(parsed.personality) : undefined,
    skills: ensureMemoryInSkills(Array.isArray(parsed.skills) ? (parsed.skills as string[]) : undefined),
    tools: Array.isArray(parsed.tools) ? parsed.tools : undefined,
    schedule: parsed.schedule != null ? String(parsed.schedule) : undefined,
    schedule_input: parsed.schedule_input != null ? String(parsed.schedule_input) : undefined,
    avatar: parsed.avatar != null ? String(parsed.avatar) : undefined,
    user_created: false,
    limits: parsed.limits && typeof parsed.limits === "object" ? parsed.limits : undefined,
  };
  if (!payload.name || !payload.model) return false;
  try {
    agentStore.insertAgent(payload);
    await copyTemplatesToWorkspace(String(parsed.id).trim());
    return true;
  } catch (e) {
    if (String(e).includes("UNIQUE")) return false;
    throw e;
  }
}

/** Seed agents from a directory of JSON files (e.g. data/agents) when the DB table is empty. Call after setAgentStore. Uses a model for the first provider that has an API key when set. */
export async function seedAgentsIfEmpty(): Promise<void> {
  if (!agentStore || !agentStore.isAgentsTableEmpty()) return;
  const seedDir = getSeedAgentsDir();
  let entries: string[] = [];
  try {
    entries = await readdir(seedDir);
  } catch {
    return;
  }
  const modelOverride = await getDefaultModelForAvailableProvider();
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      await insertSeedAgentFromFile(seedDir, name, false, modelOverride);
    } catch (err) {
      console.error(`[agent-registry] Failed to seed ${name}:`, err);
    }
  }
}

/** Install system agents from seed dir (data/agents). Skips agents that already exist. Uses a model for the first provider that has an API key in settings so default agents work without error. If an agent already exists and a provider is configured, updates its model to that provider's default. Returns number installed. Only works when using SQLite. */
export async function installSystemAgents(): Promise<{ installed: number }> {
  if (!agentStore) throw new Error("Install from system is only available when using SQLite storage.");
  const seedDir = getSeedAgentsDir();
  let entries: string[] = [];
  try {
    entries = await readdir(seedDir);
  } catch (err) {
    throw new Error(`Seed directory not found: ${seedDir}`);
  }
  const modelOverride = await getDefaultModelForAvailableProvider();
  let installed = 0;
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const path = join(seedDir, name);
      const raw = await readFile(path, "utf-8");
      const parsed = JSON.parse(raw) as { id?: string };
      const id = typeof parsed?.id === "string" ? parsed.id.trim() : null;
      if (id && modelOverride) {
        const existing = agentStore.getAgentById(id);
        if (existing) {
          await updateAgent(id, { model: modelOverride });
        }
      }
      const added = await insertSeedAgentFromFile(seedDir, name, true, modelOverride);
      if (added) installed += 1;
    } catch (err) {
      console.error(`[agent-registry] Install failed for ${name}:`, err);
    }
  }
  return { installed };
}

export async function loadAgents(): Promise<AgentConfig[]> {
  if (agentStore) {
    const rows = agentStore.getAllAgents();
    return rows.map((r) => parseAgentConfig(r));
  }
  const dir = getAgentsDir();
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const agents: AgentConfig[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    try {
      const raw = await readFile(path, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      agents.push(parseAgentConfig(parsed));
    } catch (err) {
      console.error(`[agent-registry] Failed to load ${name}:`, err);
    }
  }
  return agents;
}

export async function getAgent(id: string): Promise<AgentConfig | null> {
  if (agentStore) {
    const row = agentStore.getAgentById(id);
    return row ? parseAgentConfig(row) : null;
  }
  const agents = await loadAgents();
  return agents.find((a) => a.id === id) ?? null;
}

/** Path to the JSON file that defines this agent id, or null if not found. Only used when not using SQLite. */
export async function getAgentConfigPath(id: string): Promise<string | null> {
  if (agentStore) return null;
  const dir = getAgentsDir();
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw err;
  }
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    try {
      const raw = await readFile(path, "utf-8");
      const parsed = JSON.parse(raw) as { id?: string };
      if (parsed?.id === id) return path;
    } catch {
      continue;
    }
  }
  return null;
}

export interface AgentUpdate {
  name?: string | null;
  description?: string | null;
  model?: string | null;
  personality?: string | null;
  skills?: string[] | null;
  tools?: string[] | null;
  limits?: AgentConfig["limits"] | null;
  schedule?: string | null;
  schedule_input?: string | null;
  avatar?: string | null;
  schedule_enabled?: boolean | null;
  schedule_report_targets?: AgentConfig["schedule_report_targets"] | null;
}

export async function updateAgent(id: string, updates: AgentUpdate): Promise<AgentConfig> {
  if (agentStore) {
    agentStore.updateAgent(id, updates);
    const row = agentStore.getAgentById(id);
    if (!row) throw new Error(`Agent not found: ${id}`);
    return parseAgentConfig(row);
  }
  const path = await getAgentConfigPath(id);
  if (!path) throw new Error(`Agent not found: ${id}`);
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (updates.name !== undefined) {
    parsed.name = updates.name === null || updates.name === "" ? undefined : String(updates.name).trim();
  }
  if (updates.description !== undefined) {
    parsed.description =
      updates.description === null || updates.description === "" ? undefined : String(updates.description).trim();
  }
  if (updates.model !== undefined) {
    parsed.model = updates.model === null || updates.model === "" ? undefined : String(updates.model).trim();
  }
  if (updates.personality !== undefined) {
    parsed.personality =
      updates.personality === null || updates.personality === "" ? undefined : String(updates.personality).trim();
  }
  if (updates.skills !== undefined) parsed.skills = ensureMemoryInSkills(updates.skills ?? undefined);
  if (updates.tools !== undefined) parsed.tools = updates.tools?.length ? updates.tools : undefined;
  if (updates.limits !== undefined) parsed.limits = updates.limits ?? undefined;
  if (updates.schedule !== undefined) {
    parsed.schedule =
      updates.schedule === null || updates.schedule === "" ? undefined : String(updates.schedule).trim();
  }
  if (updates.schedule_input !== undefined) {
    parsed.schedule_input =
      updates.schedule_input === null || updates.schedule_input === ""
        ? undefined
        : String(updates.schedule_input).trim();
  }
  if (updates.avatar !== undefined) {
    parsed.avatar =
      updates.avatar === null || updates.avatar === "" ? undefined : String(updates.avatar).trim();
  }
  if (updates.schedule_enabled !== undefined && updates.schedule_enabled !== null) {
    parsed.schedule_enabled = updates.schedule_enabled;
  }
  if (updates.schedule_report_targets !== undefined) {
    parsed.schedule_report_targets = updates.schedule_report_targets ?? undefined;
  }
  const agent = parseAgentConfig(parsed);
  await writeFile(path, JSON.stringify(parsed, null, 2), "utf-8");
  return agent;
}

/** Memory is a default skill for all agents; ensure it is always included. */
const DEFAULT_SKILL_MEMORY = "memory";

function ensureMemoryInSkills(skills: string[] | undefined): string[] {
  const list = skills?.length ? [...skills] : [];
  if (!list.includes(DEFAULT_SKILL_MEMORY)) list.push(DEFAULT_SKILL_MEMORY);
  return list;
}

function safeAgentId(id: string): string {
  return id.replace(/[^a-z0-9_.-]/gi, "_").trim() || "agent";
}

/** Template files to copy into new agent workspace (from data/templates). */
const WORKSPACE_TEMPLATE_FILES = [
  "IDENTITY.md",
  "USER.md",
  "TOOLS.md",
  "SYSTEM.md",
  "HEARTBEAT.md",
  "BOOTSTRAP.md",
  "BOOT.md",
];

/** Copy default templates from data/templates into the agent's workspace. Idempotent; skips missing templates. */
export async function copyTemplatesToWorkspace(agentId: string): Promise<void> {
  const workspaceDir = await ensureWorkspace(agentId);
  const templatesDir = getTemplatesDir();
  for (const name of WORKSPACE_TEMPLATE_FILES) {
    try {
      const content = await readFile(join(templatesDir, name), "utf-8");
      await writeFile(join(workspaceDir, name), content, "utf-8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") continue; // template file missing, skip
      throw err;
    }
  }
}

export async function createAgent(agent: AgentConfig): Promise<AgentConfig> {
  const safeId = safeAgentId(agent.id);
  if (safeId !== agent.id) throw new Error(`Agent id contains invalid characters; use e.g. ${safeId}`);
  const avatar =
    agent.avatar?.trim() ||
    DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)];
  const payload: Record<string, unknown> = {
    id: agent.id,
    name: agent.name,
    model: agent.model,
    description: agent.description ?? undefined,
    personality: agent.personality ?? undefined,
    skills: ensureMemoryInSkills(agent.skills),
    tools: agent.tools?.length ? agent.tools : undefined,
    schedule: agent.schedule ?? undefined,
    schedule_input: agent.schedule_input ?? undefined,
    avatar,
    user_created: true,
    limits: agent.limits ?? undefined,
  };
  if (agentStore) {
    const existing = agentStore.getAgentById(agent.id);
    if (existing) throw new Error(`Agent already exists: ${agent.id}`);
    agentStore.insertAgent(payload);
    await copyTemplatesToWorkspace(agent.id);
    return parseAgentConfig(payload);
  }
  const dir = getAgentsDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${agent.id}.json`);
  try {
    await readFile(path, "utf-8");
    throw new Error(`Agent already exists: ${agent.id}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
  await writeFile(path, JSON.stringify(payload, null, 2), "utf-8");
  await copyTemplatesToWorkspace(agent.id);
  return parseAgentConfig(payload);
}

export async function deleteAgent(id: string): Promise<void> {
  if (agentStore) {
    agentStore.deleteAgent(id);
    return;
  }
  const path = await getAgentConfigPath(id);
  if (!path) throw new Error(`Agent not found: ${id}`);
  await unlink(path);
}
