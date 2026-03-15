/**
 * Skill archive extraction — choose skill root from zip/tar, derive skill id from content.
 */
import { readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import { extractFrontmatterFromMarkdown, extractYamlBlockFromMarkdown } from "./skill-doc.js";

const JUNK_DIR_NAMES = new Set(["__macosx"]);

export function isJunkDir(name: string): boolean {
  return JUNK_DIR_NAMES.has(name.toLowerCase()) || name.startsWith(".");
}

/** Derive skill id from a flat-extracted root (no top-level dir). */
export async function deriveSkillIdFromFlatRoot(extractDir: string, archiveFilename: string): Promise<string> {
  const entries = await readdir(extractDir);
  if (entries.includes("_meta.json")) {
    try {
      const raw = await readFile(join(extractDir, "_meta.json"), "utf-8");
      const meta = JSON.parse(raw) as { slug?: string };
      if (typeof meta.slug === "string" && meta.slug.length > 0) {
        return meta.slug.replace(/[^a-z0-9_-]/gi, "_").toLowerCase() || "skill";
      }
    } catch {
      // ignore
    }
  }
  if (entries.includes("SKILL.md")) {
    try {
      const raw = await readFile(join(extractDir, "SKILL.md"), "utf-8");
      const yamlBlock = extractFrontmatterFromMarkdown(raw) || extractYamlBlockFromMarkdown(raw);
      if (yamlBlock) {
        const parsed = YAML.parse(yamlBlock) as { name?: string };
        if (typeof parsed.name === "string" && parsed.name.length > 0) {
          return parsed.name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase() || "skill";
        }
      }
    } catch {
      // ignore
    }
  }
  const stem = archiveFilename
    .replace(/\.tar\.gz$/i, "")
    .replace(/\.tgz$/i, "")
    .replace(/\.zip$/i, "")
    .replace(/\.tar$/i, "");
  return stem.replace(/[^a-z0-9_-]/gi, "_").toLowerCase() || "skill";
}

/** Choose skill root from extracted zip/tar. */
export async function chooseSkillRootFromExtract(
  tmpDir: string,
  archiveFilename: string
): Promise<{ id: string; sourcePath: string }> {
  const entries = (await readdir(tmpDir, { withFileTypes: true })) as Dirent[];
  const rootNames = new Set(entries.map((e) => e.name));
  const hasSkillDocAtRoot = rootNames.has("SKILL.md") || rootNames.has("README.md");
  const dirs = entries.filter((e) => e.isDirectory() && !isJunkDir(e.name));
  const dirsWithSkillDoc: { name: string; hasSkillMd: boolean }[] = [];
  for (const d of dirs) {
    const sub = await readdir(join(tmpDir, d.name)).catch(() => [] as string[]);
    const hasSkillMd = sub.includes("SKILL.md");
    if (hasSkillMd || sub.includes("README.md")) dirsWithSkillDoc.push({ name: d.name, hasSkillMd });
  }

  if (hasSkillDocAtRoot && dirsWithSkillDoc.length === 0) {
    const id = await deriveSkillIdFromFlatRoot(tmpDir, archiveFilename);
    return { id, sourcePath: tmpDir };
  }
  if (dirsWithSkillDoc.length >= 1) {
    const preferred = dirsWithSkillDoc.find((d) => d.hasSkillMd) ?? dirsWithSkillDoc[0]!;
    return { id: preferred.name, sourcePath: join(tmpDir, preferred.name) };
  }
  if (dirs.length === 1) {
    const dirName = dirs[0]!.name;
    return { id: dirName, sourcePath: join(tmpDir, dirName) };
  }
  if (hasSkillDocAtRoot) {
    const id = await deriveSkillIdFromFlatRoot(tmpDir, archiveFilename);
    return { id, sourcePath: tmpDir };
  }
  const firstDir = dirs[0];
  if (firstDir) {
    return { id: firstDir.name, sourcePath: join(tmpDir, firstDir.name) };
  }
  const id = await deriveSkillIdFromFlatRoot(tmpDir, archiveFilename);
  return { id, sourcePath: tmpDir };
}

/** Filesystem-safe skill id from registry slug. */
export function slugToSkillId(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "skill";
}

/** Derive skill id from SKILL.md content (frontmatter name) or filename. */
export function deriveSkillIdFromSkillMdContent(md: string, filename: string): string {
  const yamlBlock = extractFrontmatterFromMarkdown(md) || extractYamlBlockFromMarkdown(md);
  if (yamlBlock) {
    try {
      const parsed = YAML.parse(yamlBlock) as { name?: string };
      if (typeof parsed.name === "string" && parsed.name.trim()) {
        return parsed.name
          .trim()
          .replace(/[^a-z0-9_-]/gi, "_")
          .toLowerCase()
          .replace(/^_+|_+$/g, "") || "skill";
      }
    } catch {
      // ignore
    }
  }
  const stem = filename.replace(/\.(md|markdown)$/i, "").trim();
  if (stem && stem !== "SKILL") {
    return stem.replace(/[^a-z0-9_-]/gi, "_").toLowerCase() || "uploaded_skill";
  }
  return "uploaded_skill";
}
