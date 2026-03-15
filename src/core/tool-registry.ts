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
      parameters: tool.input_schema,
    },
  };
}
