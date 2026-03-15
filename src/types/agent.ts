/**
 * Agent configuration schema (AGENT_SPEC).
 */

export interface AgentLimits {
  max_turns?: number;
  max_runtime?: number; // seconds
  max_tokens?: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  /** Optional personality / emotional tone (e.g. "Friendly, supportive. Respond with empathy."). Injected into system prompt. */
  personality?: string;
  model: string;
  skills?: string[];
  tools?: string[];
  schedule?: string; // cron expression
  /** When the scheduler runs this agent, use this as the task input (e.g. "Summarize my calendar and top tasks"). If unset, uses "Scheduled run". */
  schedule_input?: string;
  /** If false, cron for this agent is paused. Default true when schedule is set. */
  schedule_enabled?: boolean;
  /** Avatar filename (e.g. agent1.jpg) from dashboard public/media. Shown in UI; assign randomly on create if omitted. */
  avatar?: string;
  /** True when created via the dashboard; such agents can be deleted. Default/bundled agents omit this. */
  user_created?: boolean;
  limits?: AgentLimits;
}

export function validateAgentConfig(raw: unknown): AgentConfig {
  const obj = raw as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') {
    throw new Error('Agent config must be an object');
  }
  const id = obj.id;
  const name = obj.name;
  const model = obj.model;
  if (typeof id !== 'string' || !id.trim()) {
    throw new Error('Agent config requires non-empty id');
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new Error('Agent config requires non-empty name');
  }
  if (typeof model !== 'string' || !model.trim()) {
    throw new Error('Agent config requires non-empty model');
  }

  const config: AgentConfig = {
    id: (id as string).trim(),
    name: (name as string).trim(),
    model: (model as string).trim(),
  };

  if (obj.description != null && typeof obj.description === 'string') {
    config.description = obj.description.trim();
  }
  if (obj.personality != null && typeof obj.personality === 'string' && obj.personality.trim()) {
    config.personality = (obj.personality as string).trim();
  }
  if (Array.isArray(obj.skills)) {
    config.skills = obj.skills.filter((s): s is string => typeof s === 'string');
  }
  if (Array.isArray(obj.tools)) {
    config.tools = obj.tools.filter((t): t is string => typeof t === 'string');
  }
  if (typeof obj.schedule === 'string' && obj.schedule.trim()) {
    config.schedule = obj.schedule.trim();
  }
  if (obj.schedule_input != null && typeof obj.schedule_input === 'string') {
    config.schedule_input = (obj.schedule_input as string).trim() || undefined;
  }
  if (obj.schedule_enabled === false) {
    config.schedule_enabled = false;
  } else if (obj.schedule_enabled === true) {
    config.schedule_enabled = true;
  }
  if (obj.avatar != null && typeof obj.avatar === 'string' && obj.avatar.trim()) {
    config.avatar = (obj.avatar as string).trim();
  }
  if (obj.user_created === true) {
    config.user_created = true;
  }
  if (obj.limits && typeof obj.limits === 'object') {
    const lim = obj.limits as Record<string, unknown>;
    config.limits = {};
    if (typeof lim.max_turns === 'number' && lim.max_turns > 0) {
      config.limits.max_turns = lim.max_turns;
    }
    if (typeof lim.max_runtime === 'number' && lim.max_runtime > 0) {
      config.limits.max_runtime = lim.max_runtime;
    }
    if (typeof lim.max_tokens === 'number' && lim.max_tokens > 0) {
      config.limits.max_tokens = lim.max_tokens;
    }
  }

  return config;
}

/** Alias for validateAgentConfig (used by agent-registry). */
export const parseAgentConfig = validateAgentConfig;
