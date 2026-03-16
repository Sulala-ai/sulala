/**
 * Tool Registry — central registry for built-in and skill tools.
 * Phase 2: tool interface + registry.
 */

import type { AgentConfig } from "../types/agent.js";

export interface ToolInputSchema {
  type: "object";
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
}

/** Optional context passed to tool.execute by the runtime (e.g. current agent for workspace). */
export interface RunContext {
  agentId?: string;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  input_schema: ToolInputSchema;
  execute: (input: Record<string, unknown>, context?: RunContext) => Promise<unknown>;
}

const registry = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  registry.set(tool.id, tool);
}

/** Remove one tool by id. Used when clearing skill tools before loading the current agent's skills. */
export function unregisterTool(id: string): boolean {
  return registry.delete(id);
}

export function getTool(id: string): Tool | undefined {
  return registry.get(id);
}

export function getAllTools(): Tool[] {
  return [...registry.values()];
}

/**
 * Infer skill id from tool id so we can filter tools by agent.skills.
 * - "sulala-portal_request" -> "sulala-portal"
 * - "memory:memory_search" -> "memory"
 * - "time", "echo" -> null (built-in, no skill)
 */
export function getSkillIdFromToolId(toolId: string): string | null {
  if (toolId.endsWith("_request")) return toolId.replace(/_request$/, "");
  const idx = toolId.indexOf(":");
  if (idx > 0) return toolId.slice(0, idx);
  return null;
}

/** Unregister all tools that belong to a skill (so only built-ins remain). Call before loading the current agent's skills so the registry only has this agent's tools + built-ins. */
export function unregisterSkillTools(): void {
  const all = getAllTools();
  for (const t of all) {
    if (getSkillIdFromToolId(t.id) !== null) unregisterTool(t.id);
  }
}

/**
 * Get tools allowed for this agent.
 * - If agent.tools is set: use as allowlist (explicit tool ids).
 * - Else if agent.skills is set and not ["*"]: only tools from those skills + built-ins (no skill id).
 *   This lets each agent see only relevant tools so the model doesn't pick the wrong skill's tool.
 * - Else: all tools (e.g. when skills is ["*"]).
 */
export function getToolsForAgent(agent: AgentConfig): Tool[] {
  const all = getAllTools();
  const allowlist = agent.tools;
  if (allowlist?.length) {
    const set = new Set(allowlist);
    return all.filter((t) => set.has(t.id));
  }
  const skills = agent.skills;
  if (skills?.length && !skills.includes("*")) {
    const skillSet = new Set(skills);
    return all.filter((t) => {
      const skillId = getSkillIdFromToolId(t.id);
      return skillId === null || skillSet.has(skillId);
    });
  }
  return all;
}

/**
 * Normalize internal ToolInputSchema to an OpenAI-compatible JSON Schema.
 *
 * Some upstream tool definitions (e.g. MCP servers) may declare array-typed
 * properties without an `items` schema. OpenAI's tools API rejects such
 * schemas with errors like:
 *   "array schema missing items"
 *
 * To keep things robust, we conservatively add a default `items` schema for
 * any array-typed properties that don't specify one, assuming an array of
 * strings. This is generic but valid, and prevents hard 400 errors from the
 * LLM API.
 */
function normalizeSchemaForOpenAI(schema: ToolInputSchema): ToolInputSchema & {
  properties?: Record<string, { type: string; description?: string; items?: { type: string } }>;
} {
  const base: ToolInputSchema & {
    properties?: Record<string, { type: string; description?: string; items?: { type: string } }>;
  } = {
    type: "object",
    ...(schema.required ? { required: [...schema.required] } : {}),
  };

  if (schema.properties) {
    const props: Record<string, { type: string; description?: string; items?: { type: string } }> = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      if (!value) continue;
      const { type, description } = value;
      // If a property is declared as an array but lacks items, default to array of strings
      if (type === "array") {
        props[key] = {
          type: "array",
          ...(description ? { description } : {}),
          items: { type: "string" },
        };
      } else {
        props[key] = { type, ...(description ? { description } : {}) };
      }
    }
    base.properties = props;
  }

  return base;
}

/** Convert tool to OpenAI function-calling format. */
export function toolToOpenAIFormat(tool: Tool): {
  type: "function";
  function: { name: string; description: string; parameters: ToolInputSchema };
} {
  return {
    type: "function",
    function: {
      name: tool.id,
      description: tool.description,
      // OpenAI is strict about JSON Schema; normalize to avoid invalid
      // schemas (e.g. arrays without items) coming from external tools.
      parameters: normalizeSchemaForOpenAI(tool.input_schema),
    },
  };
}
