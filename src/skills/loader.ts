/**
 * Skill loader — loads skills from ~/.agent-os/skills (or AGENT_OS_SKILLS_DIR).
 * Skills are defined by SKILL.md only (YAML frontmatter or ```yaml block). We do not load
 * standalone skill.yaml or tools.yaml. Scripts in scripts/ are used via the exec tool with skill_id.
 * Public API: listSkills, loadSkillsForAgent, getSkillDocContext, getSkillConfigSchema,
 * getSkillSetupMarkdown, getStoreRegistry, getSkillMarketplace, uninstallSkill,
 * installSkillFromPath, installSkillFromUrl, installSkillFromUpload, installSkillFromSkillMd, installSystemSkills.
 */
import { readFile, readdir, cp, mkdir, writeFile, rm } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { getAgentOsHome, getSkillsDir, getSeedSkillsDir, getSkillsRegistryUrl } from "../core/config.js";
import type { AgentConfig } from "../types/agent.js";
import { registerTool, unregisterSkillTools } from "../core/tool-registry.js";

import {
  loadSkillDocument,
  getRequiredEnvForSkill,
  extractMarkdownBody,
} from "./skill-doc.js";
import { chooseSkillRootFromExtract, deriveSkillIdFromSkillMdContent, slugToSkillId } from "./skill-extract.js";
import {
  httpToolFromDescriptor,
  createDocOnlyRequestTool,
  createTokenRequestTool,
} from "./skill-tools.js";

export { getSkillsDir } from "../core/config.js";

const SYSTEM_SKILL_IDS = new Set(["memory"]);
const DEFAULT_SYSTEM_SKILL_IDS = ["memory", "date", "fetch", "jq", "file-search"];

/** Meta file written when installing from hub so we know version without relying on SKILL.md frontmatter. */
const SULALA_META_FILE = ".sulala-meta.json";

export interface SulalaSkillMeta {
  version?: string;
  source?: string;
  /** Logo URL from store; persisted so Installed tab can show it without re-fetching registry. */
  logo?: string;
  /** Category from store. */
  category?: string;
}

async function readSkillMeta(skillDir: string, subEntries: string[]): Promise<SulalaSkillMeta | null> {
  if (!subEntries.includes(SULALA_META_FILE)) return null;
  try {
    const raw = await readFile(join(skillDir, SULALA_META_FILE), "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object") return null;
    const version = typeof data.version === "string" && data.version.trim() !== "" ? data.version.trim() : undefined;
    const source = typeof data.source === "string" && data.source.trim() !== "" ? data.source.trim() : undefined;
    const logo = typeof data.logo === "string" && data.logo.trim() !== "" ? data.logo.trim() : undefined;
    const category = typeof data.category === "string" && data.category.trim() !== "" ? data.category.trim() : undefined;
    if (version === undefined && source === undefined && logo === undefined && category === undefined) return null;
    return { version, source, logo, category };
  } catch {
    return null;
  }
}

async function writeSkillMeta(
  skillId: string,
  meta: { version?: string; source?: string; logo?: string; category?: string }
): Promise<void> {
  const skillDir = join(getSkillsDir(), skillId);
  const payload: Record<string, string> = {};
  if (meta.version?.trim()) payload.version = meta.version.trim();
  if (meta.source?.trim()) payload.source = meta.source.trim();
  if (meta.logo?.trim()) payload.logo = meta.logo.trim();
  if (meta.category?.trim()) payload.category = meta.category.trim();
  if (Object.keys(payload).length === 0) return;
  await writeFile(join(skillDir, SULALA_META_FILE), JSON.stringify(payload, null, 0), "utf-8");
}

async function loadSkill(name: string): Promise<void> {
  const dir = join(getSkillsDir(), name);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    console.error(`[skills] Failed to read skill dir ${dir}:`, err);
    return;
  }

  const skill = await loadSkillDocument(dir, entries);
  if (!skill) return;

  if (skill.tools?.length) {
    for (const t of skill.tools) {
      if (!t.id) continue;
      registerTool(httpToolFromDescriptor(name, dir, t));
    }
    return;
  }

  let apiBase = skill.api_base?.trim();
  let credentials = Array.isArray(skill.credentials)
    ? skill.credentials
    : typeof skill.credentials === "string"
      ? [skill.credentials]
      : undefined;
  const baseUrlEnv = skill.base_url_env?.trim();
  if (baseUrlEnv && process.env[baseUrlEnv]?.trim()) {
    apiBase = process.env[baseUrlEnv]!.trim().replace(/\/$/, "");
  }
  if (!apiBase && baseUrlEnv) {
    const { readSkillConfig } = await import("../core/config.js");
    const stored = await readSkillConfig(name);
    const url = stored[baseUrlEnv]?.trim();
    if (url) apiBase = url.replace(/\/$/, "");
  }
  if (!apiBase && entries.includes("skill.json")) {
    try {
      const raw = await readFile(join(dir, "skill.json"), "utf-8");
      const meta = JSON.parse(raw) as { api_base?: string; base_url_env?: string; credentials?: string[] };
      if (meta.base_url_env && process.env[meta.base_url_env as string]?.trim()) {
        apiBase = process.env[meta.base_url_env as string]!.trim().replace(/\/$/, "");
      }
      if (!apiBase && meta.api_base) apiBase = String(meta.api_base).trim();
      if (meta.credentials) credentials = meta.credentials.filter((c): c is string => typeof c === "string");
    } catch {
      // ignore
    }
  }
  if (!apiBase && entries.includes("SKILL.md")) {
    try {
      const raw = await readFile(join(dir, "SKILL.md"), "utf-8");
      const match = raw.match(/Base\s+URL:\s*[`"]?(\s*https?:\/\/[^\s`"]+)/i) || raw.match(/api_base:\s*["']?([^"'\s]+)/i);
      if (match?.[1]) apiBase = match[1].trim().replace(/[`"]/g, "");
    } catch {
      // ignore
    }
  }
  if (apiBase) {
    const authScheme = skill.auth_scheme === "Apikey" ? "Apikey" : "Bearer";
    registerTool(
      createDocOnlyRequestTool(
        name,
        apiBase,
        credentials,
        authScheme,
        skill.auth_location,
        skill.auth_param,
        skill.description
      )
    );
  } else if (baseUrlEnv) {
    console.warn(`[skills] ${name} skill loaded but request tool not registered: set ${baseUrlEnv} so the agent can call the API.`);
  }
  const reqTool = skill.request_tool;
  if (reqTool?.id?.trim() && reqTool?.base_url?.trim()) {
    registerTool(createTokenRequestTool(name, reqTool.id.trim(), reqTool.base_url.trim(), skill.description));
  }
}

export async function loadSkillsForAgent(agent: AgentConfig): Promise<void> {
  unregisterSkillTools();
  let skills = agent.skills ?? [];
  if (skills.includes("*")) {
    const all = await listSkills();
    skills = all.map((s) => s.id);
    (agent as AgentConfig).skills = skills;
  }
  await Promise.all(skills.map((name) => loadSkill(name)));
}

export async function getSkillDocContext(skillNames: string[]): Promise<string> {
  const dir = getSkillsDir();
  const parts: string[] = [];
  for (const name of skillNames) {
    if (!name?.trim()) continue;
    const skillDir = join(dir, name);
    const mdPath = join(skillDir, "SKILL.md");
    try {
      const raw = await readFile(mdPath, "utf-8");
      const body = extractMarkdownBody(raw);
      if (body) parts.push(`## Skill: ${name}\n\n${body}`);
    } catch {
      // no SKILL.md or unreadable
    }
  }
  return parts.join("\n\n---\n\n");
}

export interface SkillSummary {
  id: string;
  name: string;
  description?: string;
  /** Version from SKILL.md frontmatter. Used by dashboard to show update when store has newer. */
  version?: string;
  tools: Array<{ id: string; description?: string }>;
  required_env?: string[];
  system?: boolean;
  /** From .sulala-meta.json when installed from store. */
  logo?: string;
  /** From .sulala-meta.json when installed from store. */
  category?: string;
}

export async function getSkillConfigSchema(skillId: string): Promise<Record<string, unknown> | null> {
  const path = join(getSkillsDir(), skillId, "config.schema.json");
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[skills] Failed to read config.schema.json for ${skillId}:`, err);
    }
  }
  return null;
}

export async function getSkillSetupMarkdown(skillId: string): Promise<string | null> {
  const mdPath = join(getSkillsDir(), skillId, "SKILL.md");
  try {
    const raw = await readFile(mdPath, "utf-8");
    const lines = raw.split("\n");
    let inSetup = false;
    const buf: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("## ") && !trimmed.startsWith("## Setup")) {
        if (inSetup) break;
        continue;
      }
      if (/^##\s+Setup(\s|\(|$)/.test(trimmed)) {
        inSetup = true;
        continue;
      }
      if (inSetup) buf.push(line);
    }
    const out = buf.join("\n").trim();
    return out.length > 0 ? out : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[skills] Failed to read SKILL.md for ${skillId}:`, err);
    }
    return null;
  }
}

export interface MarketplaceEntry {
  id: string;
  name: string;
  description: string;
  install_url?: string;
  install_path?: string;
}

export interface StoreRegistrySkill {
  slug: string;
  name: string;
  description?: string;
  version?: string;
  url?: string;
  downloadUrl?: string;
  priceCents?: number;
  category?: string;
  tags?: string[];
  featured?: boolean;
  /** Logo/icon URL from registry (iconUrl or logo). */
  logo?: string;
}

export async function getStoreRegistry(): Promise<{
  skills: StoreRegistrySkill[];
  storeBase: string | null;
  registryUrl: string | null;
}> {
  const registryUrl = await getSkillsRegistryUrl();
  if (!registryUrl) return { skills: [], storeBase: null, registryUrl: null };
  let storeBase: string | null = null;
  try {
    storeBase = new URL(registryUrl).origin;
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch(registryUrl, { redirect: "follow" });
    if (!res.ok) return { skills: [], storeBase, registryUrl };
    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json")) return { skills: [], storeBase, registryUrl };
    const data = (await res.json()) as { skills?: unknown[] } | unknown[];
    const raw = Array.isArray(data)
      ? data
      : Array.isArray((data as { skills?: unknown[] })?.skills)
        ? (data as { skills: unknown[] }).skills
        : [];
    const skills: StoreRegistrySkill[] = raw
      .filter((e): e is Record<string, unknown> => e != null && typeof e === "object")
      .filter((e) => typeof e.slug === "string")
      .map((e) => {
        const slug = String(e.slug);
        const downloadUrlFromStore = typeof e.downloadUrl === "string" ? e.downloadUrl : undefined;
        const downloadUrl = downloadUrlFromStore ?? (storeBase ? `${storeBase}/api/sulalahub/skills/${encodeURIComponent(slug)}/download` : undefined);
        const logo = typeof e.iconUrl === "string" ? e.iconUrl : typeof e.logo === "string" ? e.logo : undefined;
        return {
          slug,
          name: typeof e.name === "string" ? e.name : slug,
          description: typeof e.description === "string" ? e.description : undefined,
          version: typeof e.version === "string" ? e.version : undefined,
          url: typeof e.url === "string" ? e.url : undefined,
          downloadUrl,
          priceCents: typeof e.priceCents === "number" ? e.priceCents : undefined,
          category: typeof e.category === "string" ? e.category : undefined,
          tags: Array.isArray(e.tags) ? (e.tags as string[]) : undefined,
          featured: e.featured === true,
          logo: logo?.trim() || undefined,
        };
      });
    return { skills, storeBase, registryUrl };
  } catch {
    return { skills: [], storeBase, registryUrl };
  }
}

export async function getSkillMarketplace(): Promise<MarketplaceEntry[]> {
  const home = getAgentOsHome();
  const paths = [join(home, "skill-marketplace.json"), join(process.cwd(), "data", "skill-marketplace.json")];
  for (const path of paths) {
    try {
      const raw = await readFile(path, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (e): e is MarketplaceEntry =>
            e && typeof e === "object" && typeof (e as MarketplaceEntry).id === "string" && typeof (e as MarketplaceEntry).name === "string"
        );
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[skills] Failed to read marketplace:", path, err);
      }
    }
  }
  return [];
}

export async function uninstallSkill(skillId: string): Promise<void> {
  if (!skillId || skillId.startsWith(".") || skillId.includes("/") || skillId.includes("..")) {
    throw new Error("Invalid skill id");
  }
  if (SYSTEM_SKILL_IDS.has(skillId)) {
    throw new Error("Cannot uninstall system skill");
  }
  await rm(join(getSkillsDir(), skillId), { recursive: true, force: true });
}

export async function listSkills(): Promise<SkillSummary[]> {
  const dir = getSkillsDir();
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const results: SkillSummary[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const name = e.name;
    if (!name || name.startsWith(".")) continue;
    const skillDir = join(dir, name);
    let subEntries: string[];
    try {
      subEntries = await readdir(skillDir);
    } catch {
      continue;
    }
    const doc = await loadSkillDocument(skillDir, subEntries);
    if (!doc) continue;
    const skillName = doc.name ?? name;
    const requiredEnv = await getRequiredEnvForSkill(skillDir, subEntries, doc);
    const docVersion = doc.version?.trim() || undefined;
    const meta = await readSkillMeta(skillDir, subEntries);
    const version = docVersion ?? meta?.version;
    results.push({
      id: name,
      name: skillName,
      description: doc.description,
      version,
      tools: (doc.tools ?? []).map((t) => ({ id: t.id, description: t.description })),
      required_env: requiredEnv.length ? requiredEnv : undefined,
      system: SYSTEM_SKILL_IDS.has(name),
      logo: meta?.logo,
      category: meta?.category,
    });
  }
  return results;
}

function getAllowedPathBase(): string {
  const env = process.env.AGENT_OS_SKILLS_SOURCE_DIR;
  if (env) return resolve(env);
  return resolve(process.cwd());
}

export async function installSkillFromPath(sourcePath: string): Promise<{ id: string }> {
  const base = getAllowedPathBase();
  const resolved = resolve(sourcePath);
  if (!resolved.startsWith(base)) throw new Error(`Path must be under ${base}`);
  const id = basename(resolved);
  if (!id || id.startsWith(".")) throw new Error("Invalid skill folder name");
  await mkdir(getSkillsDir(), { recursive: true });
  await cp(resolved, join(getSkillsDir(), id), { recursive: true });
  return { id };
}

export async function installSystemSkills(): Promise<{ installed: number }> {
  const seedDir = getSeedSkillsDir();
  const skillsDir = getSkillsDir();
  const { access, stat } = await import("node:fs/promises");
  let seedExists: boolean;
  try {
    await access(seedDir);
    seedExists = true;
  } catch {
    seedExists = false;
  }
  if (!seedExists) throw new Error(`Seed skills directory not found: ${seedDir}`);
  let installed = 0;
  for (const id of DEFAULT_SYSTEM_SKILL_IDS) {
    const sourcePath = join(seedDir, id);
    const destPath = join(skillsDir, id);
    let hasSkillMd: boolean;
    try {
      await access(join(sourcePath, "SKILL.md"));
      hasSkillMd = true;
    } catch {
      hasSkillMd = false;
    }
    if (!hasSkillMd) continue;
    let alreadyInstalled: boolean;
    try {
      alreadyInstalled = (await stat(destPath)).isDirectory();
    } catch {
      alreadyInstalled = false;
    }
    if (alreadyInstalled) continue;
    try {
      await mkdir(skillsDir, { recursive: true });
      await cp(sourcePath, destPath, { recursive: true });
      installed += 1;
    } catch (err) {
      console.error(`[skills] Install system skill ${id} failed:`, err);
    }
  }
  return { installed };
}

export async function installSkillFromUrl(
  url: string,
  explicitId?: string,
  meta?: { version?: string; source?: string; logo?: string; category?: string }
): Promise<{ id: string }> {
  const urlLower = url.toLowerCase();
  const isStoreSkillContentUrl =
    urlLower.includes("/api/sulalahub/skills/") && !urlLower.includes("/download") && !urlLower.endsWith(".zip");
  const headers: HeadersInit = isStoreSkillContentUrl ? { Accept: "application/zip" } : {};
  const res = await fetch(url, { redirect: "follow", headers });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const isZip = contentType.includes("application/zip") || urlLower.endsWith(".zip") || urlLower.includes("/download");

  const skillsDir = getSkillsDir();
  await mkdir(skillsDir, { recursive: true });
  const tmpDir = join(tmpdir(), `agent-os-skill-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    let destId: string;
    if (isZip) {
      const zipPath = join(tmpDir, "archive.zip");
      await writeFile(zipPath, new Uint8Array(buf));
      const proc = Bun.spawn({ cmd: ["unzip", "-q", "-o", zipPath, "-d", tmpDir], stdout: "ignore", stderr: "pipe" });
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        throw new Error(`unzip failed: ${err}`);
      }
      const { id, sourcePath } = await chooseSkillRootFromExtract(tmpDir, "archive.zip");
      destId = explicitId != null && explicitId.trim() !== "" ? slugToSkillId(explicitId) : id;
      await cp(sourcePath, join(skillsDir, destId), { recursive: true });
    } else {
      const tarPath = join(tmpDir, "archive.tar.gz");
      await writeFile(tarPath, new Uint8Array(buf));
      const proc = Bun.spawn({ cmd: ["tar", "-xzf", tarPath, "-C", tmpDir], stdout: "ignore", stderr: "pipe" });
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        throw new Error(`tar extract failed: ${err}`);
      }
      const { id, sourcePath } = await chooseSkillRootFromExtract(tmpDir, "archive.tar.gz");
      destId = explicitId != null && explicitId.trim() !== "" ? slugToSkillId(explicitId) : id;
      await cp(sourcePath, join(skillsDir, destId), { recursive: true });
    }
    if (
      meta?.version?.trim() ||
      meta?.source?.trim() ||
      meta?.logo?.trim() ||
      meta?.category?.trim()
    ) {
      await writeSkillMeta(destId, {
        version: meta.version,
        source: meta.source ?? (explicitId ? "hub" : undefined),
        logo: meta.logo,
        category: meta.category,
      });
    }
    return { id: destId };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function installSkillFromUpload(buffer: ArrayBuffer, filename: string): Promise<{ id: string }> {
  const skillsDir = getSkillsDir();
  await mkdir(skillsDir, { recursive: true });
  const tmpDir = join(tmpdir(), `agent-os-skill-upload-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });
  const lower = filename.toLowerCase();
  const isZip = lower.endsWith(".zip");
  const isTarGz = lower.endsWith(".tar.gz") || lower.endsWith(".tgz");
  const isTar = lower.endsWith(".tar");
  if (!isZip && !isTarGz && !isTar) throw new Error("Upload must be a .tar.gz, .tar, or .zip archive");

  try {
    const ext = isZip ? "archive.zip" : isTar && !isTarGz ? "archive.tar" : "archive.tar.gz";
    const archivePath = join(tmpDir, ext);
    await writeFile(archivePath, new Uint8Array(buffer));

    if (isZip) {
      const proc = Bun.spawn({ cmd: ["unzip", "-q", "-o", archivePath, "-d", tmpDir], stdout: "ignore", stderr: "pipe" });
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        throw new Error(`unzip failed: ${err}`);
      }
    } else {
      const proc = Bun.spawn({
        cmd: isTarGz ? ["tar", "-xzf", archivePath, "-C", tmpDir] : ["tar", "-xf", archivePath, "-C", tmpDir],
        stdout: "ignore",
        stderr: "pipe",
      });
      const exit = await proc.exited;
      if (exit !== 0) {
        const err = await new Response(proc.stderr).text();
        throw new Error(`tar extract failed: ${err}`);
      }
    }
    const { id, sourcePath } = await chooseSkillRootFromExtract(tmpDir, filename);
    await cp(sourcePath, join(skillsDir, id), { recursive: true });
    return { id };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export async function installSkillFromSkillMd(
  buffer: ArrayBuffer,
  filename: string,
  explicitId?: string
): Promise<{ id: string }> {
  const skillsDir = getSkillsDir();
  await mkdir(skillsDir, { recursive: true });
  const text = new TextDecoder().decode(buffer);
  const id = explicitId?.trim()
    ? explicitId.replace(/[^a-z0-9_-]/gi, "_").toLowerCase().replace(/^_+|_+$/g, "") || "uploaded_skill"
    : deriveSkillIdFromSkillMdContent(text, filename);
  if (!id) throw new Error("Invalid skill id");
  const destDir = join(skillsDir, id);
  await mkdir(destDir, { recursive: true });
  await writeFile(join(destDir, "SKILL.md"), text, "utf-8");
  return { id };
}
