/**
 * Task Queue + Worker Pool + Scheduler (Phase 4).
 * TaskStore interface allows swapping in-memory vs Redis (or other) backends.
 */

import { randomUUID } from "node:crypto";
import os from "node:os";
import { readFile, appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import cron from "node-cron";
import { loadAgents, getAgent } from "./agent-registry.js";
import { runAgent } from "./runtime.js";
import { listGraphs, loadGraph, runGraph } from "./graphs.js";
import { publishWithBuffer } from "./events.js";
import { errorMessage } from "./error.js";

export type TaskStatus = "queued" | "running" | "completed" | "failed";

export interface Task {
  id: string;
  /** Set for agent tasks. */
  agent_id?: string;
  /** Set for graph tasks. Exactly one of agent_id or graph_id is set. */
  graph_id?: string;
  input: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  result?: {
    success: boolean;
    output: string;
    error?: string;
    turns: number;
    tool_calls?: number;
    /** Present for graph runs. */
    node_results?: Array<{ node_id: string; agent_id: string; success: boolean; output: string; error?: string }>;
  };
}

// --- TaskStore interface (design: doc/DISTRIBUTED_WORKERS.md §8) ---

export interface TaskStore {
  enqueue(task: Task): Promise<void>;
  /** Returns next queued task and marks it running; null if none. */
  claim(): Promise<Task | null>;
  update(task: Task): Promise<void>;
  getById(id: string): Promise<Task | null>;
  list(limit?: number): Promise<Task[]>;
}

function nowIso(): string {
  return new Date().toISOString();
}

// --- NDJSON persistence (used by MemoryTaskStore) ---

const TASKS_DIR =
  process.env.AGENT_OS_TASKS_DIR ||
  join(process.env.HOME || process.env.USERPROFILE || "~", ".agent-os", "tasks");
const TASKS_FILE = join(TASKS_DIR, "tasks.log");

let tasksInitPromise: Promise<void> | null = null;

async function ensureTasksDir(): Promise<void> {
  if (!tasksInitPromise) {
    tasksInitPromise = (async () => {
      try {
        await mkdir(TASKS_DIR, { recursive: true });
      } catch (err) {
        console.error("[tasks] Failed to create tasks dir:", err);
      }
    })();
  }
  await tasksInitPromise;
}

async function appendTaskToFile(task: Task): Promise<void> {
  try {
    await ensureTasksDir();
    const line = JSON.stringify(task) + "\n";
    await appendFile(TASKS_FILE, line, "utf-8");
  } catch (err) {
    console.error("[tasks] Failed to append task:", err);
  }
}

// --- MemoryTaskStore: in-memory Map + queue + NDJSON append ---

export class MemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();
  private readonly queue: string[] = [];

  async enqueue(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
    this.queue.push(task.id);
    publishWithBuffer("task.created", { task });
    void appendTaskToFile(task);
  }

  async claim(): Promise<Task | null> {
    const id = this.queue.shift();
    if (!id) return null;

    const task = this.tasks.get(id);
    if (!task || task.status !== "queued") return null;

    task.status = "running";
    task.updated_at = nowIso();
    publishWithBuffer("task.started", { task });
    void appendTaskToFile(task);
    return task;
  }

  async update(task: Task): Promise<void> {
    this.tasks.set(task.id, task);
    void appendTaskToFile(task);
  }

  async getById(id: string): Promise<Task | null> {
    return this.tasks.get(id) ?? null;
  }

  async list(limit?: number): Promise<Task[]> {
    const list = Array.from(this.tasks.values()).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    return limit != null && limit > 0 ? list.slice(-limit) : list;
  }

  /** Load task history from disk (for replay on startup). Does not re-queue. */
  async loadFromDisk(): Promise<void> {
    try {
      const raw = await readFile(TASKS_FILE, "utf-8");
      const lines = raw.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const t = JSON.parse(trimmed) as Task;
          this.tasks.set(t.id, t);
        } catch {
          // ignore malformed lines
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[tasks] Failed to load tasks from disk:", err);
      }
    }
  }
}

// --- Default store (memory); can be replaced for distributed mode ---

export const memoryTaskStore = new MemoryTaskStore();

const maxWorkers = Math.max(1, (os.cpus?.().length ?? 1) * 2);
let workersStarted = false;

async function workerLoop(store: TaskStore): Promise<void> {
  const POLL_MS = 200;
  while (true) {
    const task = await store.claim();
    if (!task) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      continue;
    }

    try {
      if (task.graph_id) {
        const graph = await loadGraph(task.graph_id);
        if (!graph) {
          task.status = "failed";
          task.result = {
            success: false,
            output: "",
            error: `Graph not found: ${task.graph_id}`,
            turns: 0,
          };
          task.updated_at = nowIso();
          await store.update(task);
          publishWithBuffer("task.failed", { task });
          continue;
        }
        const result = await runGraph({ graph, input: task.input });
        task.result = {
          success: result.success,
          output: result.output,
          error: result.node_results?.find((n) => !n.success)?.error,
          turns: result.node_results?.length ?? 0,
          node_results: result.node_results,
        };
        task.status = result.success ? "completed" : "failed";
        task.updated_at = nowIso();
        await store.update(task);
        publishWithBuffer(
          result.success ? "task.completed" : "task.failed",
          { task }
        );
      } else {
        const agentId = task.agent_id!;
        const agent = await getAgent(agentId);
        if (!agent) {
          task.status = "failed";
          task.result = {
            success: false,
            output: "",
            error: `Agent not found: ${agentId}`,
            turns: 0,
          };
          task.updated_at = nowIso();
          await store.update(task);
          publishWithBuffer("task.failed", { task });
          continue;
        }
        const result = await runAgent({ agent, task: task.input });
        task.result = result;
        task.status = result.success ? "completed" : "failed";
        task.updated_at = nowIso();
        await store.update(task);
        publishWithBuffer(
          result.success ? "task.completed" : "task.failed",
          { task }
        );
      }
    } catch (err) {
      const msg = errorMessage(err);
      task.status = "failed";
      task.result = {
        success: false,
        output: "",
        error: msg,
        turns: 0,
      };
      task.updated_at = nowIso();
      await store.update(task);
      publishWithBuffer("task.failed", { task });
    }
  }
}

export function startWorkers(store: TaskStore = memoryTaskStore): void {
  if (workersStarted) return;
  workersStarted = true;
  if (store === memoryTaskStore) {
    void memoryTaskStore.loadFromDisk().then(() => {
      for (let i = 0; i < maxWorkers; i++) void workerLoop(store);
    });
  } else {
    for (let i = 0; i < maxWorkers; i++) void workerLoop(store);
  }
}

// --- Public API (async; use default memory store) ---

export async function listTasks(limit?: number): Promise<Task[]> {
  return memoryTaskStore.list(limit);
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  const task = await memoryTaskStore.getById(id);
  return task ?? undefined;
}

export async function enqueueTask(agent_id: string, input: string): Promise<Task> {
  const id = randomUUID();
  const t: Task = {
    id,
    agent_id,
    input,
    status: "queued",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await memoryTaskStore.enqueue(t);
  return t;
}

export async function enqueueGraphTask(graph_id: string, input: string): Promise<Task> {
  const id = randomUUID();
  const t: Task = {
    id,
    graph_id,
    input,
    status: "queued",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await memoryTaskStore.enqueue(t);
  return t;
}

/**
 * Scheduler: cron per agent/graph with schedule. Enqueues into the task store.
 */
let schedulerStarted = false;

export function startScheduler(store: TaskStore = memoryTaskStore): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  void (async () => {
    try {
      const agents = await loadAgents();
      for (const agent of agents) {
        if (!agent.schedule || agent.schedule_enabled === false) continue;
        const agentId = agent.id;
        cron.schedule(agent.schedule, async () => {
          const current = await loadAgents();
          const a = current.find((x) => x.id === agentId);
          const input = a?.schedule_input?.trim() || "Scheduled run";
          await enqueueTask(agentId, input);
        });
      }
      const graphSummaries = await listGraphs();
      for (const { id: graphId } of graphSummaries) {
        const graph = await loadGraph(graphId);
        if (!graph?.schedule || graph.schedule_enabled === false) continue;
        const gid = graph.id;
        cron.schedule(graph.schedule, async () => {
          const g = await loadGraph(gid);
          const input = g?.schedule_input?.trim() || "Scheduled run";
          await enqueueGraphTask(gid, input);
        });
      }
    } catch (err) {
      console.error("[scheduler] Error while registering cron jobs:", err);
    }
  })();
}
