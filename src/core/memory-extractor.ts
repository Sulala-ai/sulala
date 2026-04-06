/**
 * Auto-memory extraction: after each conversation turn or scheduled run,
 * use a small LLM call to extract memorable facts and save them to the memories table.
 */

import type { MemoryStore } from "../db/memory-store.js";
import { callLLM } from "./llm.js";
import { errorMessage } from "./error.js";

const MAX_TURNS_FOR_EXTRACTION = 12;
const MAX_TEXT_LENGTH = 1200;
const MAX_FACTS = 8;

/**
 * Minimum milliseconds between extraction calls per agent.
 * Prevents flooding the LLM API when the user sends many messages quickly.
 * Default: 5 minutes. Override with AGENT_OS_MEMORY_EXTRACT_COOLDOWN_MS env var.
 */
const EXTRACT_COOLDOWN_MS = (() => {
  const env = process.env.AGENT_OS_MEMORY_EXTRACT_COOLDOWN_MS;
  if (env) {
    const n = parseInt(env, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 5 * 60 * 1000;
})();

/** Tracks last successful extraction timestamp per agent to enforce cooldown. */
const lastExtractedAt = new Map<string, number>();

function isCoolingDown(agentId: string): boolean {
  if (EXTRACT_COOLDOWN_MS === 0) return false;
  const last = lastExtractedAt.get(agentId);
  return last !== undefined && Date.now() - last < EXTRACT_COOLDOWN_MS;
}

function markExtracted(agentId: string): void {
  lastExtractedAt.set(agentId, Date.now());
}

const EXTRACTION_SYSTEM_PROMPT = `You are a memory assistant. Given recent conversation turns between a user and an AI agent, extract facts worth remembering about the USER and their session.

Capture any of these:
- Topics, assets, or subjects the user asked about or researched (e.g. "User researched SEI crypto on 2024-06-01")
- Key data points or findings from the session the user might want to recall later
- User preferences, communication style, tools, or formats they prefer
- Personal context: projects, role, goals, location, timezone
- Decisions or conclusions the user reached
- Recurring interests or patterns

Rules:
- Output ONLY a valid JSON array of short strings, nothing else.
- Each string is one clear, concise fact (≤ 25 words). Include a date or ticker/name where relevant.
- Max ${MAX_FACTS} facts. If truly nothing is worth saving, output [].

Examples:
["User researched SEI (Sei Network) crypto: price $0.054, support $0.049, 45% base case sideways",
 "User prefers bullet-point summaries",
 "User is tracking DeFi tokens on Sei Network"]`;

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen) + "…" : text;
}

function buildConversationText(
  history: Array<{ role: string; content: string }>,
  currentTask: string,
  currentOutput: string
): string {
  const recentHistory = history.slice(-MAX_TURNS_FOR_EXTRACTION);
  const turns = [
    ...recentHistory.map((t) => `${t.role === "user" ? "User" : "Agent"}: ${truncate(t.content, 400)}`),
    `User: ${truncate(currentTask, 400)}`,
    `Agent: ${truncate(currentOutput, 600)}`,
  ];
  return turns.join("\n");
}

function parseFactsFromResponse(raw: string): string[] {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .slice(0, MAX_FACTS);
    }
  } catch {
    // not valid JSON; skip
  }
  return [];
}

/**
 * Extract memorable facts from a conversation turn and save them to the memories table.
 * Runs fire-and-forget (call with void).
 */
export async function extractAndSaveMemories(
  memoryStore: MemoryStore,
  agentId: string,
  agentModel: string,
  userId: string | null,
  history: Array<{ role: string; content: string }>,
  currentTask: string,
  currentOutput: string
): Promise<void> {
  if (isCoolingDown(agentId)) {
    console.log(`[memory-extractor] skipping (cooldown active) agent=${agentId}`);
    return;
  }
  console.log(`[memory-extractor] extracting memories for agent=${agentId} model=${agentModel}`);

  try {
    const conversationText = buildConversationText(history, currentTask, currentOutput);
    if (!conversationText.trim()) {
      console.log(`[memory-extractor] skipping — empty conversation text`);
      return;
    }

    const response = await callLLM({
      model: agentModel,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: `Conversation:\n${conversationText}` },
      ],
      max_tokens: 400,
    });

    const raw = (response.content ?? "").trim();
    console.log(`[memory-extractor] raw LLM response: ${raw.slice(0, 200)}`);
    const facts = parseFactsFromResponse(raw);
    if (facts.length === 0) {
      console.log(`[memory-extractor] no facts extracted (empty or unparseable response)`);
      return;
    }

    console.log(`[memory-extractor] saving ${facts.length} fact(s) for agent=${agentId}`);
    for (const fact of facts) {
      memoryStore.insertMemory({
        user_id: userId,
        agent_id: agentId,
        text: fact,
        tags: ["auto"],
      });
    }
    markExtracted(agentId);
  } catch (err) {
    console.error("[memory-extractor] extractAndSaveMemories failed:", errorMessage(err));
  }
}

const SCHEDULED_RUN_SYSTEM_PROMPT = `You are a memory assistant. Given the input and output of an automated scheduled task run, write one concise summary sentence (≤ 25 words) worth saving as a memory. Output ONLY the sentence, nothing else.`;

/**
 * Save a brief memory about the outcome of a scheduled agent run.
 * Runs fire-and-forget (call with void).
 */
export async function saveScheduledRunMemory(
  memoryStore: MemoryStore,
  agentId: string,
  agentModel: string,
  agentName: string,
  taskInput: string,
  taskOutput: string,
  success: boolean
): Promise<void> {
  const schedKey = `sched:${agentId}`;
  if (isCoolingDown(schedKey)) return;

  try {
    const date = new Date().toISOString().split("T")[0];
    const statusLabel = success ? "completed successfully" : "failed";
    const snippet = truncate(taskOutput || taskInput, MAX_TEXT_LENGTH);

    const response = await callLLM({
      model: agentModel,
      messages: [
        { role: "system", content: SCHEDULED_RUN_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Agent: "${agentName}" | Date: ${date} | Status: ${statusLabel}\nTask input: ${truncate(taskInput, 300)}\nOutput: ${snippet}`,
        },
      ],
      max_tokens: 80,
    });

    const summary = (response.content ?? "").trim();
    if (!summary) return;

    memoryStore.insertMemory({
      user_id: null,
      agent_id: agentId,
      text: summary,
      tags: ["auto", "scheduled"],
    });
    markExtracted(schedKey);
  } catch (err) {
    console.error("[memory-extractor] saveScheduledRunMemory failed:", errorMessage(err));
  }
}
