/**
 * Skill document parsing — load skill definition from SKILL.md only (YAML frontmatter or ```yaml block).
 * We do not load standalone skill.yaml or tools.yaml; scripts are used via the exec tool with skill_id.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";

export interface SkillMetadataClawdbot {
  requires?: { env?: string[] };
}

export interface SkillFile {
  name?: string;
  description?: string;
  /** Version from frontmatter (e.g. 1.0.0). Used to compare with store for update. */
  version?: string;
  api_base?: string;
  base_url_env?: string;
  credentials?: string[] | string;
  auth_scheme?: "Bearer" | "Apikey";
  auth_location?: "header" | "query";
  auth_param?: string;
  metadata?: { clawdbot?: SkillMetadataClawdbot; [k: string]: unknown };
  tools?: Array<{
    id: string;
    description?: string;
    method?: string;
    path?: string;
  }>;
  request_tool?: { id: string; base_url: string };
}

/** Derive required env var names from skill doc. */
export function getRequiredEnvFromDoc(doc: SkillFile): string[] {
  const creds = Array.isArray(doc.credentials)
    ? doc.credentials
    : typeof doc.credentials === "string"
      ? [doc.credentials]
      : [];
  const baseEnv = doc.base_url_env?.trim() ? [doc.base_url_env.trim()] : [];
  const fromMeta = doc.metadata?.clawdbot?.requires?.env;
  const extra = Array.isArray(fromMeta) ? fromMeta : [];
  return [...new Set([...creds, ...baseEnv, ...extra])];
}

/** Collect required_env from doc and optionally skill.json in the skill dir. */
export async function getRequiredEnvForSkill(
  skillDir: string,
  subEntries: string[],
  doc: SkillFile
): Promise<string[]> {
  let env = getRequiredEnvFromDoc(doc);
  if (subEntries.includes("skill.json")) {
    try {
      const raw = await readFile(join(skillDir, "skill.json"), "utf-8");
      const meta = JSON.parse(raw) as { credentials?: string[] };
      if (Array.isArray(meta.credentials)) {
        env = [...new Set([...env, ...meta.credentials])];
      }
    } catch {
      // ignore
    }
  }
  return env;
}

export function extractYamlBlockFromMarkdown(md: string): string | null {
  const lines = md.split("\n");
  let inBlock = false;
  const buf: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inBlock) {
      if (
        trimmed === "```yaml" ||
        trimmed === "```yml" ||
        trimmed.startsWith("```yaml ") ||
        trimmed.startsWith("```yml ")
      ) {
        inBlock = true;
      }
      continue;
    }
    if (trimmed.startsWith("```")) break;
    buf.push(line);
  }
  return buf.length > 0 ? buf.join("\n") : null;
}

export function extractFrontmatterFromMarkdown(md: string): string | null {
  const lines = md.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const buf: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") break;
    buf.push(lines[i]!);
  }
  return buf.length > 0 ? buf.join("\n") : null;
}

/** Extract markdown body from SKILL.md (content after the closing --- of frontmatter). */
export function extractMarkdownBody(md: string): string {
  const trimmed = md.replace(/\r\n/g, "\n").trim();
  if (!trimmed.startsWith("---")) return trimmed;
  const afterFirst = trimmed.slice(3);
  const closeIdx = afterFirst.indexOf("\n---");
  if (closeIdx === -1) return trimmed;
  return afterFirst.slice(closeIdx + 4).trim();
}

/** Load skill definition from SKILL.md only (frontmatter or ```yaml block). No standalone skill.yaml/tools.yaml. */
export async function loadSkillDocument(dir: string, entries: string[]): Promise<SkillFile | null> {
  if (!entries.includes("SKILL.md")) return null;
  try {
    const raw = await readFile(join(dir, "SKILL.md"), "utf-8");
    const yamlBlock = extractFrontmatterFromMarkdown(raw) || extractYamlBlockFromMarkdown(raw);
    if (!yamlBlock) {
      console.warn(`[skills] No YAML frontmatter or block in SKILL.md for ${dir}, skipping.`);
      return null;
    }
    return YAML.parse(yamlBlock) as SkillFile;
  } catch (err) {
    console.error(`[skills] Failed to read SKILL.md in ${dir}:`, err);
    return null;
  }
}
