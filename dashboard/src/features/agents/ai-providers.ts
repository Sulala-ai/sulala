/**
 * AI provider and model options for agent create/edit.
 * Model id is sent to the backend as-is (OpenRouter uses provider/model id).
 */

export type AIProviderId = "openai" | "anthropic" | "google" | "openrouter" | "ollama" | "custom";

export interface AIModelOption {
  id: string;
  label: string;
  /** Ollama: from /api/show capabilities; null if unknown. */
  supports_tools?: boolean | null;
}

/**
 * When an agent has skills, only Ollama models that report tool support can be used.
 * If no model reports capability (older Ollama), returns the full list unchanged.
 */
export function filterOllamaModelsForAgentSkills(models: AIModelOption[], requireTools: boolean): AIModelOption[] {
  if (!requireTools) return models;
  const hasKnownCapability = models.some((m) => m.supports_tools === true || m.supports_tools === false);
  if (!hasKnownCapability) return models;
  return models.filter((m) => m.supports_tools === true);
}

export const AI_PROVIDERS: { id: AIProviderId; label: string; hint?: string }[] = [
  { id: "openai", label: "OpenAI", hint: "GPT-4, GPT-4o, coding, multimodal. Set OPENAI_API_KEY." },
  { id: "anthropic", label: "Anthropic", hint: "Claude, long context, tool use. Set ANTHROPIC_API_KEY." },
  { id: "google", label: "Google (Gemini)", hint: "Gemini 2.5, multimodal. Set GOOGLE_GENERATIVE_AI_API_KEY or Vertex." },
  { id: "openrouter", label: "OpenRouter", hint: "One API for 400+ models. Set OPENROUTER_API_KEY." },
  { id: "ollama", label: "Ollama (local)", hint: "Free local models. With skills, only models that support tools are listed." },
  { id: "custom", label: "Custom", hint: "Enter any model id (e.g. for another backend)." },
];

const MODELS_OPENAI: AIModelOption[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini (fast, affordable)" },
  { id: "gpt-4o", label: "GPT-4o" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { id: "gpt-4.1", label: "GPT-4.1" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
];

// Only current models that work with both direct Anthropic API and OpenRouter (deprecated 3.x removed).
const MODELS_ANTHROPIC: AIModelOption[] = [
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5" },
];

// Use OpenRouter-style ids (google/...) so the app uses OpenRouter for Gemini; bare gemini-* is not a valid OpenRouter model.
const MODELS_GOOGLE: AIModelOption[] = [
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { id: "google/gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { id: "google/gemini-1.5-flash", label: "Gemini 1.5 Flash" },
];

const MODELS_OPENROUTER: AIModelOption[] = [
  { id: "openai/gpt-4o-mini", label: "OpenAI · GPT-4o mini" },
  { id: "openai/gpt-4o", label: "OpenAI · GPT-4o" },
  { id: "anthropic/claude-sonnet-4.6", label: "Anthropic · Claude Sonnet 4.6" },
  { id: "anthropic/claude-opus-4.6", label: "Anthropic · Claude Opus 4.6" },
  { id: "anthropic/claude-3.5-sonnet", label: "Anthropic · Claude 3.5 Sonnet" },
  { id: "google/gemini-2.5-flash", label: "Google · Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-pro", label: "Google · Gemini 2.5 Pro" },
];

/** Ollama models come from the local daemon via GET /api/ollama/models (see `useOllamaModels`). */
export function getModelsForProvider(provider: AIProviderId): AIModelOption[] {
  switch (provider) {
    case "openai":
      return MODELS_OPENAI;
    case "anthropic":
      return MODELS_ANTHROPIC;
    case "google":
      return MODELS_GOOGLE;
    case "openrouter":
      return MODELS_OPENROUTER;
    case "ollama":
      return [];
    default:
      return [];
  }
}

/** Normalize model id for form display: bare gemini-* or claude-* match provider lists; deprecated Claude → current model. */
export function normalizeModelIdForDisplay(model: string): string {
  const m = model.trim();
  if (m.includes("/")) {
    if (m.startsWith("anthropic/")) return toCurrentAnthropicModelId(m);
    return m;
  }
  if (/^gemini-[a-z0-9.-]+$/i.test(m)) return `google/${m}`;
  if (/^claude-[a-z0-9.-]+$/i.test(m)) return toCurrentAnthropicModelId(`anthropic/${m.replace(/\./g, "-")}`);
  return m;
}

/** Map deprecated or short Claude id to a current Anthropic dropdown id (so edit form shows a valid selection). */
function toCurrentAnthropicModelId(id: string): string {
  const legacyToCurrent: Record<string, string> = {
    "anthropic/claude-3-5-sonnet-20241022": "anthropic/claude-sonnet-4.6",
    "anthropic/claude-3-5-sonnet-20240620": "anthropic/claude-sonnet-4.6",
    "anthropic/claude-3-5-haiku-20241022": "anthropic/claude-haiku-4.5",
    "anthropic/claude-3-opus-20240229": "anthropic/claude-opus-4.6",
    "anthropic/claude-3-sonnet-20240229": "anthropic/claude-sonnet-4.6",
    "anthropic/claude-3-haiku-20240307": "anthropic/claude-haiku-4.5",
    "anthropic/claude-3.5-sonnet": "anthropic/claude-sonnet-4.6",
    "anthropic/claude-3-5-sonnet": "anthropic/claude-sonnet-4.6",
    "anthropic/claude-3-opus": "anthropic/claude-opus-4.6",
    "anthropic/claude-3-sonnet": "anthropic/claude-sonnet-4.6",
    "anthropic/claude-3-haiku": "anthropic/claude-haiku-4.5",
    "anthropic/claude-3.5-haiku": "anthropic/claude-haiku-4.5",
  };
  return legacyToCurrent[id] ?? id;
}

/** Infer provider from stored model id (for edit form). Bare gemini-* or claude-* (legacy) are treated as google/anthropic. */
export function inferProviderFromModel(model: string): AIProviderId {
  const m = model.trim();
  if (!m) return "openai";
  if (m.startsWith("ollama/")) return "ollama";
  if (m.includes("/")) return "openrouter";
  if (MODELS_OPENAI.some((x) => x.id === m)) return "openai";
  if (MODELS_ANTHROPIC.some((x) => x.id === m)) return "anthropic";
  if (MODELS_GOOGLE.some((x) => x.id === m)) return "google";
  if (/^gemini-[a-z0-9.-]+$/i.test(m)) return "google";
  if (/^claude-[a-z0-9.-]+$/i.test(m)) return "anthropic";
  if (MODELS_OPENROUTER.some((x) => x.id === m)) return "openrouter";
  return "custom";
}
