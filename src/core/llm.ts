/**
 * LLM client — OpenAI-compatible API (OpenAI, OpenRouter, local).
 * Supports function/tool calling.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; name: string; arguments: string }>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMOptions {
  model: string;
  messages: LLMMessage[];
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: object } }>;
  /** Max tokens for completion (optional; default 2048). */
  max_tokens?: number;
}

export interface LLMResponse {
  content: string | null;
  tool_calls?: ToolCall[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

import { readConfig } from "./config.js";

/** Legacy Claude model ids (bare) → OpenRouter anthropic/... id. */
const CLAUDE_LEGACY_TO_OPENROUTER: Record<string, string> = {
  "claude-3-5-sonnet-20241022": "anthropic/claude-3.5-sonnet",
  "claude-3-opus-20240229": "anthropic/claude-3-opus",
  "claude-3-sonnet-20240229": "anthropic/claude-3-sonnet",
  "claude-3-haiku-20240307": "anthropic/claude-3-haiku",
  "claude-3-5-haiku-20241022": "anthropic/claude-3.5-haiku",
};

/** Normalize model id for OpenRouter: bare gemini-* or claude-* are invalid; use google/... or anthropic/... so existing agents keep working. */
function normalizeModelForOpenRouter(model: string): string {
  const m = model.trim();
  if (m.includes("/")) return m;
  if (/^gemini-[a-z0-9.-]+$/i.test(m)) return `google/${m}`;
  if (CLAUDE_LEGACY_TO_OPENROUTER[m]) return CLAUDE_LEGACY_TO_OPENROUTER[m];
  if (/^claude-[a-z0-9.-]+$/i.test(m)) return `anthropic/${m}`;
  return m;
}

/** True if model is a Gemini model (google/gemini-* or bare gemini-*). */
function isGeminiModel(model: string): boolean {
  const m = model.trim();
  return m.startsWith("google/gemini-") || /^gemini-[a-z0-9.-]+$/i.test(m);
}

/** Bare Gemini model name for Google API (e.g. google/gemini-2.5-flash → gemini-2.5-flash). */
function toGoogleBareModel(model: string): string {
  const m = model.trim();
  if (m.startsWith("google/")) return m.slice(7);
  return m;
}

const GOOGLE_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

/** True if model is Claude (anthropic/* or bare claude-*). */
function isClaudeModel(model: string): boolean {
  const m = model.trim();
  return m.startsWith("anthropic/claude-") || /^claude-[a-z0-9.-]+$/i.test(m);
}

/** Deprecated/legacy/short Claude model ids → current Anthropic API model id (Claude API ID from docs). */
const ANTHROPIC_LEGACY_TO_CURRENT: Record<string, string> = {
  "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
  "claude-3-5-sonnet-20240620": "claude-sonnet-4-6",
  "claude-3-5-haiku-20241022": "claude-haiku-4-5",
  "claude-3-opus-20240229": "claude-opus-4-6",
  "claude-3-sonnet-20240229": "claude-sonnet-4-6",
  "claude-3-haiku-20240307": "claude-haiku-4-5",
  // Short names (no date) from dropdown / OpenRouter style – map to current API ids
  "claude-3-haiku": "claude-haiku-4-5",
  "claude-3-opus": "claude-opus-4-6",
  "claude-3-sonnet": "claude-sonnet-4-6",
  "claude-3-5-sonnet": "claude-sonnet-4-6",
  "claude-3.5-sonnet": "claude-sonnet-4-6",
  "claude-3.5-haiku": "claude-haiku-4-5",
};

/** Bare Claude model name for Anthropic API; strip anthropic/, map deprecated/short ids to current, use API-style version (e.g. 4.6 → 4-6). */
function toAnthropicBareModel(model: string): string {
  const m = model.trim();
  let bare = m.startsWith("anthropic/") ? m.slice(10) : m;
  bare = bare.replace(/\./g, "-");
  return ANTHROPIC_LEGACY_TO_CURRENT[bare] ?? bare;
}

const ANTHROPIC_OPENAI_BASE = "https://api.anthropic.com/v1";

/** Infer which key to use from model id: Gemini + Google key → Google API; Claude + Anthropic key → Anthropic API; else OpenRouter/OpenAI. */
async function getApiConfig(model: string): Promise<{ base: string; key: string; model: string }> {
  const config = await readConfig();
  let effectiveModel = model.trim();
  const useOpenRouter = effectiveModel.includes("/");

  const googleKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    config.google_api_key?.trim();
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY?.trim() ||
    config.anthropic_api_key?.trim();
  const openrouterKey =
    process.env.OPENROUTER_API_KEY?.trim() ||
    config.openrouter_api_key?.trim() ||
    (config.provider === "openrouter" ? config.api_key?.trim() : undefined);
  const openaiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    config.openai_api_key?.trim() ||
    (config.provider === "openai" ? config.api_key?.trim() : undefined);

  // Prefer direct Google (Gemini) API when user has a Google key and model is Gemini
  if (isGeminiModel(effectiveModel) && googleKey) {
    return {
      base: process.env.GOOGLE_GENERATIVE_AI_API_BASE || GOOGLE_OPENAI_BASE,
      key: googleKey,
      model: toGoogleBareModel(effectiveModel),
    };
  }

  // Prefer direct Anthropic (Claude) API when user has an Anthropic key and model is Claude
  if (isClaudeModel(effectiveModel) && anthropicKey) {
    return {
      base: process.env.ANTHROPIC_API_BASE || ANTHROPIC_OPENAI_BASE,
      key: anthropicKey,
      model: toAnthropicBareModel(effectiveModel),
    };
  }

  const willUseOpenRouter =
    isClaudeModel(effectiveModel) && openrouterKey ||
    (useOpenRouter && openrouterKey) ||
    (!useOpenRouter && !openaiKey && openrouterKey);
  if (willUseOpenRouter) {
    effectiveModel = normalizeModelForOpenRouter(effectiveModel);
  }
  const useOpenRouterEffective = effectiveModel.includes("/");

  if (useOpenRouterEffective && openrouterKey) {
    return {
      base: process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1",
      key: openrouterKey,
      model: effectiveModel,
    };
  }
  if (!useOpenRouterEffective && openaiKey) {
    return {
      base: process.env.OPENAI_API_BASE || "https://api.openai.com/v1",
      key: openaiKey,
      model: effectiveModel,
    };
  }
  if (openrouterKey) {
    return {
      base: process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1",
      key: openrouterKey,
      model: effectiveModel,
    };
  }
  if (openaiKey) {
    return {
      base: process.env.OPENAI_API_BASE || "https://api.openai.com/v1",
      key: openaiKey,
      model: effectiveModel,
    };
  }
  throw new Error(
    "No LLM API key. Add keys in Settings → AI Provider. For Claude, set Anthropic key or OpenRouter key. For Gemini, set Google (Gemini) key or OpenRouter key."
  );
}

function buildRequestMessage(m: LLMMessage): object {
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_call_id: m.tool_call_id };
  }
  if (m.role === "assistant" && m.tool_calls?.length) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

export async function callLLM(options: LLMOptions): Promise<LLMResponse> {
  const { model, messages, tools, max_tokens } = options;
  const { base, key, model: effectiveModel } = await getApiConfig(model);

  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: effectiveModel,
    messages: messages.map(buildRequestMessage),
    max_tokens: typeof max_tokens === "number" && max_tokens > 0 ? max_tokens : 2048,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{
          id: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = data.choices?.[0];
  const msg = choice?.message;
  const content = msg?.content ?? null;
  const tool_calls = msg?.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));

  return {
    content: content ?? null,
    tool_calls: tool_calls && tool_calls.length > 0 ? tool_calls : undefined,
    usage: data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens ?? 0,
          completion_tokens: data.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}

/** Stream chunk: either a content delta or the final done payload. */
export type LLMStreamChunk =
  | { delta: string }
  | {
      done: true;
      content: string;
      tool_calls?: ToolCall[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

/**
 * Call LLM with stream: true; yields content deltas and finally a done payload.
 * OpenAI/OpenRouter compatible.
 */
export async function* callLLMStream(options: LLMOptions): AsyncGenerator<LLMStreamChunk> {
  const { model, messages, tools, max_tokens } = options;
  const { base, key, model: effectiveModel } = await getApiConfig(model);

  const url = `${base.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: effectiveModel,
    messages: messages.map(buildRequestMessage),
    max_tokens: typeof max_tokens === "number" && max_tokens > 0 ? max_tokens : 2048,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const toolCallsAccum: Array<{ id: string; name: string; arguments: string }> = [];
  let usage: { prompt_tokens: number; completion_tokens: number } | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const dataLine = line.startsWith("data: ") ? line.slice(6) : null;
        if (dataLine == null) continue;
        if (dataLine.trim() === "[DONE]") {
          yield { done: true, content, tool_calls: toolCallsAccum.length ? toolCallsAccum : undefined, usage };
          return;
        }
        let data: {
          choices?: Array<{
            delta?: { content?: string; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
            finish_reason?: string;
          }>;
        };
        try {
          data = JSON.parse(dataLine) as typeof data;
        } catch {
          continue;
        }
        const usageAny = (data as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
        if (usageAny) {
          usage = {
            prompt_tokens: usageAny.prompt_tokens ?? 0,
            completion_tokens: usageAny.completion_tokens ?? 0,
          };
        }
        const choice = data.choices?.[0];
        const delta = choice?.delta;
        if (!delta) continue;

        if (typeof delta.content === "string" && delta.content.length > 0) {
          content += delta.content;
          yield { delta: delta.content };
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            while (toolCallsAccum.length <= idx) {
              toolCallsAccum.push({ id: "", name: "", arguments: "" });
            }
            const acc = toolCallsAccum[idx]!;
            if (tc.id != null) acc.id = tc.id;
            if (tc.function?.name != null) acc.name = tc.function.name;
            if (tc.function?.arguments != null) acc.arguments += tc.function.arguments;
          }
        }

        const finishReason = choice?.finish_reason;
        if (finishReason != null && finishReason !== "") {
          yield { done: true, content, tool_calls: toolCallsAccum.length ? toolCallsAccum : undefined, usage };
          return;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { done: true, content, tool_calls: toolCallsAccum.length ? toolCallsAccum : undefined, usage };
}
