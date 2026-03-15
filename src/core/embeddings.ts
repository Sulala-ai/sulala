/**
 * Embeddings API — OpenAI-compatible embeddings for vector memory.
 * Uses the same API key as the LLM (OpenAI or OpenRouter).
 */

import { readConfig } from "./config.js";

const DEFAULT_EMBED_MODEL = "text-embedding-3-small";

async function getApiConfig(): Promise<{ base: string; key: string }> {
  const config = await readConfig();
  const openRouterKey =
    process.env.OPENROUTER_API_KEY?.trim() ||
    (config.provider === "openrouter" ? config.api_key?.trim() : undefined);
  const openaiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    (config.provider === "openai" ? config.api_key?.trim() : undefined);

  if (openRouterKey) {
    return {
      base: process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1",
      key: openRouterKey,
    };
  }
  if (openaiKey) {
    return {
      base: process.env.OPENAI_API_BASE || "https://api.openai.com/v1",
      key: openaiKey,
    };
  }
  throw new Error(
    "No embeddings API key. Set OPENAI_API_KEY or OPENROUTER_API_KEY (same as LLM)."
  );
}

/**
 * Get embedding vector for a single text. Returns array of numbers or null if API is unavailable.
 */
export async function getEmbedding(
  text: string,
  model: string = DEFAULT_EMBED_MODEL
): Promise<number[] | null> {
  if (!text.trim()) return null;
  try {
    const { base, key } = await getApiConfig();
    const url = `${base.replace(/\/$/, "")}/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, input: text.trim() }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.warn("[embeddings] API error:", res.status, err);
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = data.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch (err) {
    console.warn("[embeddings] Failed:", err);
    return null;
  }
}

/** Cosine similarity between two vectors (assumes same length, normalized optional). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
