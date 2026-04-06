/**
 * Auto-memory for scheduled runs: subscribe to task.completed / task.failed events
 * and save a brief memory for each scheduled run whose agent has auto_memory enabled.
 */

import { subscribe } from "./events.js";
import { getAgent } from "./agent-registry.js";
import { loadGraph } from "./graphs.js";
import { saveScheduledRunMemory } from "./memory-extractor.js";
import type { MemoryStore } from "../db/memory-store.js";
import type { Task } from "./tasks.js";

async function handleScheduledTaskFinished(
  memoryStore: MemoryStore,
  task: Task
): Promise<void> {
  if (!task.scheduled_run) return;

  if (task.agent_id) {
    const agent = await getAgent(task.agent_id);
    if (!agent?.auto_memory) return;
    await saveScheduledRunMemory(
      memoryStore,
      agent.id,
      agent.model,
      agent.name,
      task.input,
      task.result?.output ?? task.result?.error ?? "",
      task.status === "completed"
    );
  } else if (task.graph_id) {
    const graph = await loadGraph(task.graph_id);
    if (!graph) return;
    // For graph runs, check if any node's agent has auto_memory enabled
    const nodeResults = task.result?.node_results ?? [];
    for (const nr of nodeResults) {
      const agent = await getAgent(nr.agent_id);
      if (!agent?.auto_memory) continue;
      await saveScheduledRunMemory(
        memoryStore,
        nr.agent_id,
        agent.model,
        agent.name,
        task.input,
        nr.output ?? nr.error ?? "",
        nr.success
      );
    }
  }
}

/**
 * Register task event handlers that auto-save memories for scheduled runs.
 * Call once at server startup, after memoryStore is created.
 */
export function initAutoMemory(memoryStore: MemoryStore): void {
  const handler = (event: { type: string; data: { task: Task } }) => {
    void handleScheduledTaskFinished(memoryStore, event.data.task);
  };
  subscribe("task.completed", handler);
  subscribe("task.failed", handler);
}
