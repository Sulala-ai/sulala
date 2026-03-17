/**
 * Seed fake memories for testing the Memory graph UI.
 * Uses the same DB as the server (see getMemoryDbPath).
 *
 * Run from sulala package root:
 *   bun run scripts/seed-fake-memory.ts
 *
 * Or with same env as dev (so DB is under ./data):
 *   AGENT_OS_AGENTS_DIR=./data/agents bun run scripts/seed-fake-memory.ts
 */
/// <reference types="node" />
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { getMemoryDbPath } from "../src/core/config.js";
import { MemoryStore } from "../src/db/memory-store.js";

const dbPath = getMemoryDbPath();
mkdirSync(dirname(dbPath), { recursive: true });
const store = new MemoryStore(dbPath);

const AGENTS = ["dev_agent", "personal_agent", "writer_agent", "research_agent"] as const;

const SEED_MEMORIES: Array<{
  agent_id: (typeof AGENTS)[number];
  text: string;
  tags?: string[];
  user_id?: string | null;
}> = [
  { agent_id: "dev_agent", text: "User prefers dark mode in the IDE.", tags: ["preferences", "ui"] },
  { agent_id: "dev_agent", text: "Default branch is main; we use conventional commits.", tags: ["workflow", "git"] },
  { agent_id: "dev_agent", text: "Team uses Bun for this project.", tags: ["tooling", "runtime"] },
  { agent_id: "personal_agent", text: "User's name is Alex.", tags: ["identity"] },
  { agent_id: "personal_agent", text: "Reminder: standup at 10:00 on weekdays.", tags: ["schedule", "work"] },
  { agent_id: "personal_agent", text: "Favorite timezone is Europe/London.", tags: ["preferences"] },
  { agent_id: "writer_agent", text: "Tone for blog posts should be casual and friendly.", tags: ["style", "content"] },
  { agent_id: "writer_agent", text: "Avoid jargon in customer-facing copy.", tags: ["style", "content"] },
  { agent_id: "research_agent", text: "Prefer peer-reviewed sources when available.", tags: ["sources", "quality"] },
  { agent_id: "research_agent", text: "Save summaries to the shared drive.", tags: ["workflow", "storage"] },
  { agent_id: "research_agent", text: "User is interested in AI safety and alignment.", tags: ["topics", "interest"] },
  { agent_id: "dev_agent", text: "CI runs on every push to main.", tags: ["workflow", "ci"] },
  { agent_id: "writer_agent", text: "Target audience is technical but non-expert.", tags: ["audience", "content"] },
];

let added = 0;
for (const m of SEED_MEMORIES) {
  const id = store.insertMemory({
    agent_id: m.agent_id,
    text: m.text,
    tags: m.tags ?? undefined,
    user_id: m.user_id ?? null,
  });
  if (id) added++;
}

console.log(`Seeded ${added} fake memories into ${dbPath}`);
console.log("Open Dashboard → Memory → Graph, then click Load graph to view.");
