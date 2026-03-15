/**
 * Agent Runtime — executes the LLM loop for a single agent.
 * Phase 3: skills + tools.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentConfig } from "../types/agent.js";
import { callLLM, callLLMStream } from "./llm.js";
import { getToolsForAgent, toolToOpenAIFormat, getTool } from "./tool-registry.js";
import "../tools/index.js"; // Register built-in tools
import { loadSkillsForAgent, getSkillDocContext } from "../skills/loader.js";
import { publishWithBuffer } from "./events.js";
import { ensureWorkspace, getWorkspaceDir } from "./config.js";
import { loadAgents } from "./agent-registry.js";
import { errorMessage } from "./error.js";

export interface RunOptions {
  task: string;
  agent: AgentConfig;
  /** Prior turns (user/assistant only) to send as context. Last entry should be the preceding turn. */
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ToolCallStep {
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
}

export interface RunResult {
  success: boolean;
  output: string;
  error?: string;
  turns: number;
  tool_calls?: number;
  /** Tool calls made during this run (for UI visibility). */
  steps?: ToolCallStep[];
  /** Token usage across all LLM calls in this run. */
  usage?: { input_tokens: number; output_tokens: number };
  /** Model used (for cost estimation). */
  model?: string;
}

/** Stream event: assistant delta, tool_call result, done, or error. */
export type AgentStreamEvent =
  | { type: "assistant"; delta: string }
  | { type: "tool_call"; name: string; result?: unknown; error?: string }
  | { type: "done"; finalContent: string; turnCount: number; usage?: { input_tokens: number; output_tokens: number }; model?: string; steps?: ToolCallStep[] }
  | { type: "error"; message: string };

const MAX_HISTORY_TURNS = 20; // cap to avoid context overflow

/** Message shown when task needs a skill the agent doesn't have. Avoids unnecessary LLM calls and 429s. */
const SKILL_REQUIRED_MESSAGE =
  "This task requires a skill that this agent doesn't have. Install the skill from hub.sulala.ai (Dashboard → Skills → install from store), then add it to this agent in Edit agent.";

/** If the LLM error looks like rate limit (429), return a user-friendly message that suggests installing missing skills. */
function formatLLMErrorForUser(err: unknown): string {
  const msg = errorMessage(err);
  if (msg.includes("429") || /rate_limit|rate limit/i.test(msg)) {
    return `Request limit reached. If this task requires a skill the agent doesn't have, install it from hub.sulala.ai and add it to this agent to avoid repeated attempts. Otherwise try again later.`;
  }
  return msg;
}

function runAgentInner(options: RunOptions): Promise<RunResult> {
  return (async () => {
  const { task, agent, conversationHistory = [] } = options;
  const maxTurns = agent.limits?.max_turns ?? 10;
  const maxTokens = agent.limits?.max_tokens;

  await ensureWorkspace(agent.id);

  // Load any skills declared on this agent (registers their tools).
  await loadSkillsForAgent(agent);

  publishWithBuffer("agent.started", {
    agent_id: agent.id,
    task,
  });

  const allowedTools = getToolsForAgent(agent);
  const allowedToolIds = new Set(allowedTools.map((t) => t.id));
  const tools = allowedTools.length > 0 ? allowedTools.map(toolToOpenAIFormat) : undefined;

  const skillDocContext = await getSkillDocContext(agent.skills ?? []);
  const workspaceContext = await readWorkspacePromptContext(agent.id);
  let delegateableAgents: Array<{ id: string; name: string; skills?: string[] }> | undefined;
  if (allowedToolIds.has("run_agent")) {
    const all = await loadAgents();
    delegateableAgents = all
      .filter((a) => a.id !== agent.id)
      .map((a) => ({ id: a.id, name: a.name, skills: a.skills ?? [] }));
  }
  const systemPrompt = buildSystemPrompt(agent, allowedTools.length > 0, skillDocContext, workspaceContext, delegateableAgents);

  const history = conversationHistory.slice(-MAX_HISTORY_TURNS * 2).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; name: string; arguments: string }>;
  }> = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: task },
  ];

  let turns = 0;
  let output = "";
  let toolCallCount = 0;
  let nudgedForSummary = false;
  const steps: ToolCallStep[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  while (turns < maxTurns) {
    turns++;
    try {
      const response = await callLLM({
        model: agent.model,
        messages,
        tools,
        max_tokens: maxTokens,
      });

      if (response.usage) {
        totalInputTokens += response.usage.prompt_tokens ?? 0;
        totalOutputTokens += response.usage.completion_tokens ?? 0;
      }

      const text = response.content?.trim() ?? "";
      const toolCalls = response.tool_calls;

      // Add assistant message (include tool_calls so API gets full context on next request)
      messages.push({
        role: "assistant",
        content: text || (toolCalls ? "" : "I have no response."),
        tool_calls: toolCalls?.map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments })),
      });

      if (toolCalls && toolCalls.length > 0) {
        toolCallCount += toolCalls.length;
        let turnToolErrors = 0;
        for (const tc of toolCalls) {
          const tool = getTool(tc.name);
          let args: Record<string, unknown> = {};
          try {
            if (tc.arguments?.trim()) {
              args = JSON.parse(tc.arguments) as Record<string, unknown>;
            }
          } catch {
            args = {};
          }
          if (!tool) {
            turnToolErrors++;
            publishWithBuffer("tool.called", {
              agent_id: agent.id,
              tool_id: tc.name,
              task,
              error: "Unknown tool",
            });
            steps.push({ tool: tc.name, args, error: "Unknown tool" });
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
              tool_call_id: tc.id,
            });
            continue;
          }
          if (!allowedToolIds.has(tool.id)) {
            turnToolErrors++;
            publishWithBuffer("tool.called", {
              agent_id: agent.id,
              tool_id: tc.name,
              task,
              error: "Tool not allowed for this agent",
            });
            steps.push({ tool: tc.name, args, error: "Tool not allowed for this agent" });
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: `Tool not allowed: ${tc.name}` }),
              tool_call_id: tc.id,
            });
            continue;
          }
          try {
            const result = await tool.execute(args, { agentId: agent.id });
            publishWithBuffer("tool.completed", {
              agent_id: agent.id,
              tool_id: tc.name,
              task,
              ok: true,
            });
            steps.push({ tool: tc.name, args, result });
            messages.push({
              role: "tool",
              content: JSON.stringify(result),
              tool_call_id: tc.id,
            });
          } catch (err) {
            const msg = errorMessage(err);
            publishWithBuffer("tool.completed", {
              agent_id: agent.id,
              tool_id: tc.name,
              task,
              ok: false,
              error: msg,
            });
            steps.push({ tool: tc.name, args, error: msg });
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: msg }),
              tool_call_id: tc.id,
            });
          }
        }
        // If every tool call this turn was unknown/not allowed, avoid more LLM turns and tell user to install skill
        if (turnToolErrors === toolCalls.length && turnToolErrors > 0) {
          publishWithBuffer("agent.completed", { agent_id: agent.id, task, success: true });
          return {
            success: true,
            output: SKILL_REQUIRED_MESSAGE,
            turns,
            tool_calls: toolCallCount,
            steps: steps.length > 0 ? steps : undefined,
            usage:
              totalInputTokens > 0 || totalOutputTokens > 0
                ? { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
                : undefined,
            model: agent.model,
          };
        }
        // Only accumulate actual content; don't overwrite with placeholder so next turn's summary becomes output
        if (text) output = text;
        continue; // Loop again for model to process tool results
      }

      // Model returned no tool calls. If we have tool results but empty text, nudge once for a summary.
      if (!text && toolCallCount > 0 && !nudgedForSummary) {
        nudgedForSummary = true;
        messages.push({
          role: "user",
          content: "Summarize the tool results above in one short paragraph for the user.",
        });
        continue;
      }

      output = text;
      break;
    } catch (err) {
      const msg = formatLLMErrorForUser(err);
      publishWithBuffer("agent.completed", {
        agent_id: agent.id,
        task,
        success: false,
        error: msg,
      });
      return {
        success: false,
        output: "",
        error: msg,
        turns,
        tool_calls: toolCallCount,
        steps: steps.length > 0 ? steps : undefined,
        usage:
          totalInputTokens > 0 || totalOutputTokens > 0
            ? { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
            : undefined,
        model: agent.model,
      };
    }
  }

  publishWithBuffer("agent.completed", {
    agent_id: agent.id,
    task,
    success: true,
  });

  // If we used tools but have no summary (e.g. hit turn limit or model kept calling tools), force one final call with no tools so the model must reply with text
  let finalOutput = output.trim();
  if (!finalOutput && toolCallCount > 0) {
    try {
      const summaryMessages = [
        ...messages,
        { role: "user" as const, content: "Summarize the tool results above in one short paragraph for the user. Reply only with the summary, no tool calls." },
      ];
      const summaryResponse = await callLLM({
        model: agent.model,
        messages: summaryMessages,
        tools: undefined, // no tools so model must respond with text
      });
      if (summaryResponse.usage) {
        totalInputTokens += summaryResponse.usage.prompt_tokens ?? 0;
        totalOutputTokens += summaryResponse.usage.completion_tokens ?? 0;
      }
      const summary = summaryResponse.content?.trim();
      if (summary) finalOutput = summary;
    } catch {
      // ignore
    }
    if (!finalOutput) finalOutput = `Used ${toolCallCount} tool(s). Model did not return a summary.`;
  }

  return {
    success: true,
    output: finalOutput,
    turns,
    tool_calls: toolCallCount > 0 ? toolCallCount : undefined,
    steps: steps.length > 0 ? steps : undefined,
    usage:
      totalInputTokens > 0 || totalOutputTokens > 0
        ? { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
        : undefined,
    model: agent.model,
  };
  })();
}

export async function runAgent(options: RunOptions): Promise<RunResult> {
  const { agent } = options;
  const maxRuntimeSeconds = agent.limits?.max_runtime;
  if (typeof maxRuntimeSeconds === "number" && maxRuntimeSeconds > 0) {
    const timeout = new Promise<RunResult>((_, reject) => {
      setTimeout(
        () => reject(new Error(`Agent run exceeded max_runtime (${maxRuntimeSeconds}s)`)),
        maxRuntimeSeconds * 1000
      );
    });
    return Promise.race([runAgentInner(options), timeout]);
  }
  return runAgentInner(options);
}

/**
 * Run agent with streaming: calls onEvent for each assistant delta, tool_call, then done (or error).
 */
export async function runAgentStream(options: RunOptions, onEvent: (ev: AgentStreamEvent) => void): Promise<void> {
  const { task, agent, conversationHistory = [] } = options;
  const maxTurns = agent.limits?.max_turns ?? 10;
  const maxTokens = agent.limits?.max_tokens;

  await ensureWorkspace(agent.id);
  await loadSkillsForAgent(agent);

  publishWithBuffer("agent.started", { agent_id: agent.id, task });

  const allowedTools = getToolsForAgent(agent);
  const allowedToolIds = new Set(allowedTools.map((t) => t.id));
  const tools = allowedTools.length > 0 ? allowedTools.map(toolToOpenAIFormat) : undefined;

  const skillDocContext = await getSkillDocContext(agent.skills ?? []);
  const workspaceContext = await readWorkspacePromptContext(agent.id);
  let delegateableAgents: Array<{ id: string; name: string; skills?: string[] }> | undefined;
  if (allowedToolIds.has("run_agent")) {
    const all = await loadAgents();
    delegateableAgents = all
      .filter((a) => a.id !== agent.id)
      .map((a) => ({ id: a.id, name: a.name, skills: a.skills ?? [] }));
  }
  const systemPrompt = buildSystemPrompt(agent, allowedTools.length > 0, skillDocContext, workspaceContext, delegateableAgents);

  const history = conversationHistory.slice(-MAX_HISTORY_TURNS * 2).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_call_id?: string;
    tool_calls?: Array<{ id: string; name: string; arguments: string }>;
  }> = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: task },
  ];

  let turns = 0;
  let output = "";
  let toolCallCount = 0;
  let nudgedForSummary = false;
  const steps: ToolCallStep[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  try {
    while (turns < maxTurns) {
      turns++;
      let streamedContent = "";
      let streamToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

      for await (const chunk of callLLMStream({
        model: agent.model,
        messages,
        tools,
        max_tokens: maxTokens,
      })) {
        if ("delta" in chunk) {
          streamedContent += chunk.delta;
          onEvent({ type: "assistant", delta: chunk.delta });
        } else if (chunk.done) {
          streamedContent = chunk.content;
          streamToolCalls = chunk.tool_calls ?? [];
          if (chunk.usage) {
            totalInputTokens += chunk.usage.prompt_tokens ?? 0;
            totalOutputTokens += chunk.usage.completion_tokens ?? 0;
          }
        }
      }

      const text = streamedContent.trim();
      messages.push({
        role: "assistant",
        content: text || (streamToolCalls.length ? "" : "I have no response."),
        tool_calls: streamToolCalls.map((tc) => ({ id: tc.id, name: tc.name, arguments: tc.arguments })),
      });

      if (streamToolCalls.length > 0) {
        toolCallCount += streamToolCalls.length;
        let turnToolErrors = 0;
        for (const tc of streamToolCalls) {
          const tool = getTool(tc.name);
          let args: Record<string, unknown> = {};
          try {
            if (tc.arguments?.trim()) args = JSON.parse(tc.arguments) as Record<string, unknown>;
          } catch {
            args = {};
          }
          if (!tool) {
            turnToolErrors++;
            onEvent({ type: "tool_call", name: tc.name, error: "Unknown tool" });
            steps.push({ tool: tc.name, args, error: "Unknown tool" });
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: `Unknown tool: ${tc.name}` }),
              tool_call_id: tc.id,
            });
            continue;
          }
          if (!allowedToolIds.has(tool.id)) {
            turnToolErrors++;
            onEvent({ type: "tool_call", name: tc.name, error: "Tool not allowed" });
            steps.push({ tool: tc.name, args, error: "Tool not allowed for this agent" });
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: `Tool not allowed: ${tc.name}` }),
              tool_call_id: tc.id,
            });
            continue;
          }
          try {
            const result = await tool.execute(args, { agentId: agent.id });
            onEvent({ type: "tool_call", name: tc.name, result });
            steps.push({ tool: tc.name, args, result });
            messages.push({ role: "tool", content: JSON.stringify(result), tool_call_id: tc.id });
          } catch (err) {
            const msg = errorMessage(err);
            onEvent({ type: "tool_call", name: tc.name, error: msg });
            steps.push({ tool: tc.name, args, error: msg });
            messages.push({
              role: "tool",
              content: JSON.stringify({ error: msg }),
              tool_call_id: tc.id,
            });
          }
        }
        if (turnToolErrors === streamToolCalls.length && turnToolErrors > 0) {
          onEvent({
            type: "done",
            finalContent: SKILL_REQUIRED_MESSAGE,
            turnCount: turns,
            usage:
              totalInputTokens > 0 || totalOutputTokens > 0
                ? { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
                : undefined,
            model: agent.model,
            steps: steps.length > 0 ? steps : undefined,
          });
          return;
        }
        if (text) output = text;
        continue;
      }

      if (!text && toolCallCount > 0 && !nudgedForSummary) {
        nudgedForSummary = true;
        messages.push({
          role: "user",
          content: "Summarize the tool results above in one short paragraph for the user.",
        });
        continue;
      }

      output = text;
      break;
    }

    let finalOutput = output.trim();
    if (!finalOutput && toolCallCount > 0) {
      try {
        const summaryMessages = [
          ...messages,
          {
            role: "user" as const,
            content: "Summarize the tool results above in one short paragraph for the user. Reply only with the summary, no tool calls.",
          },
        ];
        for await (const chunk of callLLMStream({
          model: agent.model,
          messages: summaryMessages,
          tools: undefined,
        })) {
          if ("delta" in chunk) onEvent({ type: "assistant", delta: chunk.delta });
          else if (chunk.done && chunk.usage) {
            totalInputTokens += chunk.usage.prompt_tokens ?? 0;
            totalOutputTokens += chunk.usage.completion_tokens ?? 0;
            if (chunk.content?.trim()) finalOutput = chunk.content.trim();
          }
        }
      } catch {
        // ignore
      }
      if (!finalOutput) finalOutput = `Used ${toolCallCount} tool(s). Model did not return a summary.`;
    }

    onEvent({
      type: "done",
      finalContent: finalOutput,
      turnCount: turns,
      usage:
        totalInputTokens > 0 || totalOutputTokens > 0
          ? { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }
          : undefined,
      model: agent.model,
      steps: steps.length > 0 ? steps : undefined,
    });
  } catch (err) {
    const msg = formatLLMErrorForUser(err);
    onEvent({ type: "error", message: msg });
    throw err;
  }
}

/** Workspace prompt files (in order) included in system prompt when present. */
const WORKSPACE_PROMPT_FILES = ["IDENTITY.md", "USER.md", "SYSTEM.md", "TOOLS.md"] as const;

/** Read IDENTITY, USER, SYSTEM, TOOLS from agent workspace and return concatenated context, or "" if none. */
async function readWorkspacePromptContext(agentId: string): Promise<string> {
  const workspaceDir = getWorkspaceDir(agentId);
  const chunks: string[] = [];
  for (const name of WORKSPACE_PROMPT_FILES) {
    try {
      const content = await readFile(join(workspaceDir, name), "utf-8");
      const trimmed = content.trim();
      if (trimmed) chunks.push(trimmed);
    } catch {
      // file missing or unreadable, skip
    }
  }
  if (chunks.length === 0) return "";
  return "# Workspace context\n\n" + chunks.join("\n\n---\n\n");
}

function buildSystemPrompt(
  agent: AgentConfig,
  hasTools: boolean,
  skillDocContext?: string,
  workspaceContext?: string,
  delegateableAgents?: Array<{ id: string; name: string; skills?: string[] }>
): string {
  const parts: string[] = [];
  if (workspaceContext?.trim()) {
    parts.push(workspaceContext.trim());
    parts.push("---");
  }
  parts.push(`You are ${agent.name}.`);
  if (agent.description) {
    parts.push(agent.description);
  }
  if (agent.personality) {
    parts.push(`Personality: ${agent.personality}`);
    parts.push("Adapt your tone to the user: if they seem frustrated, acknowledge their feelings briefly before solving; if they're in a hurry, be concise; if they're curious, be encouraging.");
  }
  parts.push("Answer the user's task concisely.");
  const skillList = agent.skills?.length ? agent.skills.join(", ") : "none (built-in tools only)";
  parts.push(`Your skills: ${skillList}.`);
  // When the task clearly requires a skill not in the list, tell user to install from hub — do not attempt the task (avoids 429 from repeated LLM/tool attempts).
  parts.push(
    "If the user's task clearly requires a capability that only a skill can provide (e.g. post to Bluesky, send email, search the web, weather, run a specific integration) and that skill is NOT in your skills list above: reply with a single short message that you don't have that skill and they should install it from hub.sulala.ai (Dashboard → Skills → install from store) and add it to this agent in Edit agent. Do NOT attempt the task. Do NOT call any tools. Do NOT suggest workarounds. One sentence only."
  );
  if (delegateableAgents?.length) {
    parts.push(
      "You have the run_agent tool. When the user asks for something that another agent can do (e.g. post to Bluesky, search the web, send email), use run_agent with that agent's id and the task. Then summarize the result for the user."
    );
    parts.push(
      "Available agents to delegate to (use run_agent with agent_id and task): " +
        delegateableAgents.map((a) => `${a.id} (${a.name})`).join(", ") +
        "."
    );
    const memoryAgentIds = delegateableAgents.filter((a) => a.skills?.includes("memory")).map((a) => a.id);
    if (memoryAgentIds.length) {
      parts.push(
        `Agents with long-term memory (use for remember/save requests): ${memoryAgentIds.join(", ")}. When the user asks to remember something, save a fact about themselves, or store information for later, use run_agent with one of these agents and a task like "Remember that [fact]" or "Save: [fact]". Do not say you cannot save—delegate to an agent that has memory.`
      );
    }
  }
  if (hasTools) {
    parts.push("You have access to tools. Use them when helpful to answer the user.");
    parts.push(`Your agent id is "${agent.id}". When a skill requires agent_id (e.g. memory_write), use this value in the request body.`);
    parts.push("After using tools, always reply with a brief summary for the user; never end with only tool calls.");
    // Generic: when skills expose *_request tools, use the right skill's tool for skill-specific tasks (per skill doc), not echo/memory.
    if (skillDocContext?.includes("_request")) {
      parts.push(
        "When the user asks for something a skill handles (e.g. list connections, send email, call an API), use that skill's request tool (e.g. skill_id_request) with the method, path, and body from the skill documentation below. Do not use echo, memory_search, or memory_write for skill-specific actions—use the skill's request tool as described in the skill documentation."
      );
    }
  }
  if (skillDocContext) {
    parts.push("---\n\n# Skill documentation\n\nUse the following documentation to know how to call skill APIs. When you have a tool like \"skill_id:request\", use method, path, query, and body as described below.\n\n" + skillDocContext);
  }
  return parts.join("\n\n");
}
