/**
 * Ollama helpers — OpenAI-compatible base URL and local daemon probes.
 */

import { spawnSync } from "node:child_process";

const DEFAULT_OPENAI_BASE = "http://127.0.0.1:11434/v1";

/** Ensure base ends with /v1 for OpenAI-compatible chat/completions. */
export function normalizeOllamaOpenAiBase(url: string): string {
  const u = url.trim().replace(/\/$/, "");
  if (!u) return DEFAULT_OPENAI_BASE;
  if (u.endsWith("/v1")) return u;
  return `${u}/v1`;
}

/** Map e.g. http://host:11434/v1 → http://host:11434 for /api/tags. */
export function openAiBaseToOllamaOrigin(openAiBase: string): string {
  const b = openAiBase.trim().replace(/\/$/, "");
  if (b.endsWith("/v1")) return b.slice(0, -3);
  return b;
}

export type OllamaProbeResult = {
  reachable: boolean;
  /** Ollama version string when reachable. */
  version?: string;
};

/** GET /api/tags on the Ollama daemon (not the OpenAI shim). */
export async function probeOllamaDaemon(openAiBase: string): Promise<OllamaProbeResult> {
  const origin = openAiBaseToOllamaOrigin(normalizeOllamaOpenAiBase(openAiBase));
  const url = `${origin}/api/tags`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { reachable: false };
    const data = (await res.json()) as { version?: string };
    return { reachable: true, version: typeof data.version === "string" ? data.version : undefined };
  } catch {
    return { reachable: false };
  }
}

/** True if `ollama` is on PATH (CLI available). */
export function isOllamaCliOnPath(): boolean {
  const r = spawnSync("which", ["ollama"], { encoding: "utf-8" });
  return r.status === 0 && Boolean(r.stdout?.trim());
}

export function defaultOllamaOpenAiBaseFromEnv(): string {
  const e = process.env.OLLAMA_BASE_URL?.trim();
  return e ? normalizeOllamaOpenAiBase(e) : DEFAULT_OPENAI_BASE;
}
