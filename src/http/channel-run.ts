/**
 * Shared flow for channel handlers: ensure conversation, load history, run agent, store messages, send reply.
 */
import type { MemoryStore } from "../db/memory-store.js";
import type { AgentConfig } from "../types/agent.js";
import type { AgentOsConfig } from "../core/config.js";
import { loadAgents } from "../core/agent-registry.js";
import { runAgent } from "../core/runtime.js";
import { getConversationHistoryForRun } from "./utils.js";

export type DefaultAgentConfigKey =
  | "telegram_default_agent_id"
  | "slack_default_agent_id"
  | "discord_default_agent_id"
  | "signal_default_agent_id"
  | "viber_default_agent_id";

/** Resolve default agent from config (channel-specific key). Returns first agent if key unset. */
export async function getDefaultAgent(
  config: AgentOsConfig,
  defaultAgentIdKey: DefaultAgentConfigKey
): Promise<AgentConfig | null> {
  const agents = await loadAgents();
  const id = config[defaultAgentIdKey];
  const defaultAgentId = typeof id === "string" ? id.trim() : "";
  if (defaultAgentId) {
    return agents.find((a) => a.id === defaultAgentId) ?? null;
  }
  return agents[0] ?? null;
}

export async function runAgentWithConversation(
  memoryStore: MemoryStore,
  agent: AgentConfig,
  conversationId: string,
  userId: string | null,
  task: string,
  sendReply: (output: string) => Promise<void>
): Promise<void> {
  memoryStore.ensureConversation(conversationId, agent.id, userId);
  const conversationHistory = getConversationHistoryForRun(memoryStore, conversationId);
  memoryStore.insertConversationMessage({
    conversation_id: conversationId,
    agent_id: agent.id,
    user_id: userId,
    role: "user",
    contentJson: JSON.stringify({ text: task }),
  });
  const result = await runAgent({ agent, task, conversationHistory });
  const output = result.success ? result.output : (result.error ?? "Something went wrong.");
  memoryStore.insertConversationMessage({
    conversation_id: conversationId,
    agent_id: agent.id,
    user_id: userId,
    role: "assistant",
    contentJson: JSON.stringify({ text: output }),
  });
  await sendReply(output);
}
