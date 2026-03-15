/**
 * Graph manager + runner (Phase 6).
 *
 * Graphs are stored as JSON under ~/.agent-os/graphs/ (or AGENT_OS_GRAPHS_DIR).
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getAgent } from "./agent-registry.js";
import { runAgent } from "./runtime.js";
import { errorMessage } from "./error.js";

export interface GraphNode {
  id: string;
  agent: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface Graph {
  id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Optional cron expression for scheduled runs (e.g. "0 9 * * *" = daily 9:00). */
  schedule?: string;
  /** Input/prompt used when the scheduler runs this graph. Default "Scheduled run". */
  schedule_input?: string;
  /** If false, cron for this graph is paused. Default true when schedule is set. */
  schedule_enabled?: boolean;
}

const DEFAULT_GRAPHS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".agent-os",
  "graphs"
);

export function getGraphsDir(): string {
  return process.env.AGENT_OS_GRAPHS_DIR || DEFAULT_GRAPHS_DIR;
}

export interface GraphSummary {
  id: string;
}

export async function listGraphs(): Promise<GraphSummary[]> {
  const dir = getGraphsDir();
  try {
    const entries = await readdir(dir);
    const summaries: GraphSummary[] = [];
    for (const name of entries) {
      if (name.endsWith(".json")) {
        const id = name.replace(/\.graph\.json$/, "").replace(/\.json$/, "");
        if (id) summaries.push({ id });
      }
    }
    return summaries;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function loadGraph(id: string): Promise<Graph | null> {
  const dir = getGraphsDir();
  try {
    const entries = await readdir(dir);
    const file = entries.find(
      (name) => name === `${id}.json` || name === `${id}.graph.json`
    );
    if (!file) return null;
    const raw = await readFile(join(dir, file), "utf-8");
    const parsed = JSON.parse(raw) as Graph;
    validateGraph(parsed);
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("[graphs] Failed to load graph:", err);
    return null;
  }
}

/** Save or create a graph. Overwrites existing file. */
export async function saveGraph(graph: Graph): Promise<void> {
  validateGraph(graph);
  const dir = getGraphsDir();
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${graph.id}.json`);
  await writeFile(path, JSON.stringify(graph, null, 2), "utf-8");
}

function validateGraph(graph: Graph): void {
  if (!graph || typeof graph !== "object") {
    throw new Error("Graph must be an object");
  }
  if (!graph.id || typeof graph.id !== "string") {
    throw new Error("Graph.id must be a string");
  }
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error("Graph.nodes must be a non-empty array");
  }
  if (!Array.isArray(graph.edges)) {
    throw new Error("Graph.edges must be an array");
  }
}

export interface GraphRunOptions {
  graph: Graph;
  input: string;
}

export interface GraphRunResult {
  success: boolean;
  output: string;
  node_results: Array<{
    node_id: string;
    agent_id: string;
    success: boolean;
    output: string;
    error?: string;
  }>;
}

/**
 * Returns nodes grouped by level. Level 0 = no incoming edges; level 1 = depend only on level 0; etc.
 * Nodes in the same level can run in parallel.
 */
function topologicalLevels(graph: Graph): string[][] {
  const nodes = graph.nodes.map((n) => n.id);
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();

  for (const id of nodes) {
    incoming.set(id, 0);
    outgoing.set(id, []);
  }
  for (const edge of graph.edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue;
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.get(edge.from)!.push(edge.to);
  }

  const levels: string[][] = [];
  const remaining = new Map(incoming);

  while (remaining.size > 0) {
    const level: string[] = [];
    for (const [id, count] of remaining.entries()) {
      if (count === 0) level.push(id);
    }
    if (level.length === 0) break; // cycles
    for (const id of level) {
      remaining.delete(id);
      for (const to of outgoing.get(id) ?? []) {
        const c = remaining.get(to);
        if (c !== undefined) remaining.set(to, c - 1);
      }
    }
    levels.push(level);
  }

  if (remaining.size > 0) return [nodes]; // fallback to single level (original order)
  return levels;
}

/** Predecessors of each node (nodes that have an edge to this node). */
function getPredecessors(graph: Graph): Map<string, string[]> {
  const pred = new Map<string, string[]>();
  for (const n of graph.nodes) pred.set(n.id, []);
  for (const edge of graph.edges) {
    if (pred.has(edge.to)) {
      pred.get(edge.to)!.push(edge.from);
    }
  }
  for (const [, p] of pred) p.sort();
  return pred;
}

/**
 * Graph runner with parallel and sequential execution:
 * - Nodes in the same level run in parallel (Promise.all).
 * - Levels run sequentially. A node's input is the concatenation of its predecessors' outputs (or initial input if no predecessors).
 */
export async function runGraph(
  options: GraphRunOptions
): Promise<GraphRunResult> {
  const { graph, input } = options;

  const levels = topologicalLevels(graph);
  const predecessors = getPredecessors(graph);
  const outputs = new Map<string, string>();
  const nodeResults: GraphRunResult["node_results"] = [];

  for (const level of levels) {
    const runOne = async (nodeId: string): Promise<{ node_id: string; agent_id: string; success: boolean; output: string; error?: string }> => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) {
        return { node_id: nodeId, agent_id: "", success: false, output: "", error: "Node not found" };
      }
      const agent = await getAgent(node.agent);
      if (!agent) {
        return {
          node_id: node.id,
          agent_id: node.agent,
          success: false,
          output: "",
          error: `Agent not found: ${node.agent}`,
        };
      }
      const preds = predecessors.get(node.id) ?? [];
      const taskInput =
        preds.length === 0
          ? input
          : preds
              .map((p) => outputs.get(p) ?? "")
              .filter(Boolean)
              .join("\n\n") || input;

      const result = await runAgent({ agent, task: taskInput });
      outputs.set(node.id, result.output || "");
      return {
        node_id: node.id,
        agent_id: node.agent,
        success: result.success,
        output: result.output,
        error: result.error,
      };
    };

    const levelResults = await Promise.all(level.map(runOne));
    for (const r of levelResults) {
      nodeResults.push(r);
    }
  }

  const last = nodeResults[nodeResults.length - 1];
  return {
    success: last ? last.success : false,
    output: last ? last.output : "",
    node_results: nodeResults,
  };
}

export type GraphStreamEvent =
  | { type: "node_done"; node_id: string; agent_id: string; success: boolean; output: string; error?: string }
  | { type: "done"; success: boolean; output: string; node_results: GraphRunResult["node_results"] }
  | { type: "error"; message: string };

/**
 * Run graph and call onEvent for each node completion, then done (or error).
 */
export async function runGraphStream(
  options: GraphRunOptions,
  onEvent: (ev: GraphStreamEvent) => void
): Promise<void> {
  const { graph, input } = options;
  const levels = topologicalLevels(graph);
  const predecessors = getPredecessors(graph);
  const outputs = new Map<string, string>();
  const nodeResults: GraphRunResult["node_results"] = [];

  try {
    for (const level of levels) {
      const runOne = async (
        nodeId: string
      ): Promise<{ node_id: string; agent_id: string; success: boolean; output: string; error?: string }> => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) {
          return { node_id: nodeId, agent_id: "", success: false, output: "", error: "Node not found" };
        }
        const agent = await getAgent(node.agent);
        if (!agent) {
          return {
            node_id: node.id,
            agent_id: node.agent,
            success: false,
            output: "",
            error: `Agent not found: ${node.agent}`,
          };
        }
        const preds = predecessors.get(node.id) ?? [];
        const taskInput =
          preds.length === 0
            ? input
            : preds
                .map((p) => outputs.get(p) ?? "")
                .filter(Boolean)
                .join("\n\n") || input;

        const result = await runAgent({ agent, task: taskInput });
        outputs.set(node.id, result.output || "");
        const payload = {
          node_id: node.id,
          agent_id: node.agent,
          success: result.success,
          output: result.output,
          error: result.error,
        };
        nodeResults.push(payload);
        onEvent({ type: "node_done", ...payload });
        return payload;
      };

      await Promise.all(level.map(runOne));
    }

    const last = nodeResults[nodeResults.length - 1];
    onEvent({
      type: "done",
      success: last ? last.success : false,
      output: last ? last.output : "",
      node_results: nodeResults,
    });
  } catch (err) {
    const msg = errorMessage(err);
    onEvent({ type: "error", message: msg });
    throw err;
  }
}


