/**
 * Graph manager + runner (Phase 6).
 *
 * Graphs are stored as JSON under ~/.agent-os/graphs/ (or AGENT_OS_GRAPHS_DIR).
 * When the graphs dir is empty, seed graphs from data/graphs/ are copied in.
 */

import { readFile, readdir, writeFile, mkdir, copyFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { ScheduleReportTarget } from "../types/agent.js";
import { getAgent } from "./agent-registry.js";
import { runAgent } from "./runtime.js";
import { errorMessage } from "./error.js";

export interface GraphNode {
  id: string;
  agent: string;
  /** Optional position for editor layout (x, y in pixels). */
  x?: number;
  y?: number;
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
  /** Send schedule run report to these targets (e.g. Telegram chat). */
  schedule_report_targets?: ScheduleReportTarget[];
}

const DEFAULT_GRAPHS_DIR = join(
  process.env.HOME || process.env.USERPROFILE || "~",
  ".agent-os",
  "graphs"
);

export function getGraphsDir(): string {
  return process.env.AGENT_OS_GRAPHS_DIR || DEFAULT_GRAPHS_DIR;
}

/** Path to seed graphs in the repo (data/graphs). Used when user graphs dir is empty. */
export function getSeedGraphsDir(): string {
  if (process.env.AGENT_OS_SEED_GRAPHS_DIR) return process.env.AGENT_OS_SEED_GRAPHS_DIR;
  const fromDist = join(import.meta.dir, "..", "data", "graphs");
  const fromSrc = join(import.meta.dir, "..", "..", "data", "graphs");
  if (existsSync(fromDist)) return fromDist;
  if (existsSync(fromSrc)) return fromSrc;
  return join(process.cwd(), "data", "graphs");
}

/** Copy seed graphs into user graphs dir when it is empty. Call after agents are installed (e.g. onboard) so pipeline graphs exist. */
export async function seedGraphsIfEmpty(): Promise<void> {
  const dir = getGraphsDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    entries = [];
  }
  if (entries.length === 0) {
    const seedDir = getSeedGraphsDir();
    try {
      const seedEntries = await readdir(seedDir);
      await mkdir(dir, { recursive: true });
      for (const name of seedEntries) {
        if (name.endsWith(".json")) {
          await copyFile(join(seedDir, name), join(dir, name));
        }
      }
    } catch {
      // no seed dir or copy failed
    }
  }
}

export interface GraphSummary {
  id: string;
}

export async function listGraphs(): Promise<GraphSummary[]> {
  const dir = getGraphsDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    entries = [];
  }
  if (entries.length === 0) {
    await seedGraphsIfEmpty();
    try {
      entries = await readdir(dir);
    } catch {
      entries = [];
    }
  }
  const summaries: GraphSummary[] = [];
  for (const name of entries) {
    if (name.endsWith(".json")) {
      const id = name.replace(/\.graph\.json$/, "").replace(/\.json$/, "");
      if (id) summaries.push({ id });
    }
  }
  return summaries;
}

export async function loadGraph(id: string): Promise<Graph | null> {
  const dir = getGraphsDir();
  try {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      entries = [];
    }
    const file = entries.find(
      (name) => name === `${id}.json` || name === `${id}.graph.json`
    );
    if (file) {
      const raw = await readFile(join(dir, file), "utf-8");
      const parsed = JSON.parse(raw) as Graph;
      validateGraph(parsed);
      return parsed;
    }
    const seedDir = getSeedGraphsDir();
    const seedFile = `${id}.json`;
    try {
      const raw = await readFile(join(seedDir, seedFile), "utf-8");
      const parsed = JSON.parse(raw) as Graph;
      validateGraph(parsed);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, seedFile), raw, "utf-8");
      return parsed;
    } catch {
      return null;
    }
  } catch (err) {
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

/** Delete a graph by id. Removes the file from the user graphs dir only. */
export async function deleteGraph(id: string): Promise<void> {
  if (!id || typeof id !== "string") throw new Error("Graph id required");
  const dir = getGraphsDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return;
  }
  const file = entries.find((name) => name === `${id}.json` || name === `${id}.graph.json`);
  if (file) await unlink(join(dir, file));
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

/** Default max LLM turns per node when running a graph (reduces API usage and rate-limit risk). */
const DEFAULT_GRAPH_MAX_TURNS_PER_NODE = 5;

/** Max chars from each predecessor's output passed to the next node (avoids huge payloads and context overflow). */
const DEFAULT_GRAPH_MAX_PREDECESSOR_OUTPUT_CHARS = 4000;

/** Hard timeout per node run (ms) so a stuck tool call can't stall the whole graph. */
const DEFAULT_GRAPH_NODE_TIMEOUT_MS = 120_000;

const DEBUG_GRAPHS =
  (process.env.AGENT_OS_DEBUG ?? "").trim() === "1" ||
  (process.env.AGENT_OS_DEBUG_GRAPHS ?? "").trim() === "1";

function graphDebug(msg: string): void {
  if (!DEBUG_GRAPHS) return;
  console.log(msg);
}

function truncatePredecessorOutput(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n… [output truncated for next node]";
}

function buildGraphNodeTaskInput(args: {
  graphId: string;
  initialInput: string;
  nodeId: string;
  agentId: string;
  predecessors: Array<{ node_id: string; agent_id: string; output: string }>;
  successors: Array<{ node_id: string; agent_id: string }>;
}): string {
  const { graphId, initialInput, nodeId, agentId, predecessors, successors } = args;
  const predBlock =
    predecessors.length === 0
      ? "(none)"
      : predecessors
          .map(
            (p) =>
              `---\nfrom: ${p.node_id} (${p.agent_id})\ncontent:\n${p.output.trim() || "(empty)"}`
          )
          .join("\n\n");

  const nextBlock =
    successors.length === 0
      ? "(this is the final node; no next agent)"
      : successors
          .map((s, idx) => `${idx + 1}. ${s.node_id} (${s.agent_id || "agent"})`)
          .join("\n");

  // Important: agent system prompts are generic (chat-oriented). This wrapper forces “team handoff” behavior.
  return `You are running as part of a multi-agent graph pipeline.

Graph: ${graphId}
Current node: ${nodeId} (${agentId})

Next node(s) in the pipeline:
${nextBlock}

User goal (original input):
${initialInput.trim()}

Handoff from previous node(s):
${predBlock}

Rules (strict):
- Do NOT ask the user follow-up questions. If something is missing, make the most reasonable assumptions and proceed.
- Treat the previous node outputs as authoritative context and continue the work.
- Produce output that the NEXT node(s) above can immediately use.
- If you used tools, include the final results in your output (not just “I did it”).

Required output format:
Return a single JSON object only (no markdown), with:
{
  "done": boolean,
  "result": "your main deliverable (what you produced in this node)",
  "next": "exact instruction to the next node(s) above about what to do with result. Address them by role, e.g. 'Source Verify Agent: verify these facts by checking reputable sources and flag anything inconsistent.'",
  "artifacts": { "key": "value" }
}

Now do your node's job.`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export interface GraphRunOptions {
  graph: Graph;
  input: string;
  /** Cap each node at this many LLM turns. Default 5 to prevent excessive API calls. Omit to use default. */
  max_turns_per_node?: number;
  /** Max chars from each predecessor's output when building input for the next node. Default 4000. Set 0 to disable truncation. */
  max_predecessor_output_chars?: number;
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

/** Successors of each node (nodes that this node connects to). */
function getSuccessors(graph: Graph): Map<string, string[]> {
  const succ = new Map<string, string[]>();
  for (const n of graph.nodes) succ.set(n.id, []);
  for (const edge of graph.edges) {
    if (succ.has(edge.from)) {
      succ.get(edge.from)!.push(edge.to);
    }
  }
  for (const [, s] of succ) s.sort();
  return succ;
}

/**
 * Graph runner: one node after another to avoid API rate limits and reduce load.
 * - Levels run in order (level 0, then level 1, …). Within each level, nodes run sequentially (not in parallel).
 * - A node's input is the concatenation of its predecessors' outputs (or initial input if no predecessors).
 */
export async function runGraph(
  options: GraphRunOptions
): Promise<GraphRunResult> {
  const {
    graph,
    input,
    max_turns_per_node = DEFAULT_GRAPH_MAX_TURNS_PER_NODE,
    max_predecessor_output_chars = DEFAULT_GRAPH_MAX_PREDECESSOR_OUTPUT_CHARS,
  } = options;
  const nodeTimeoutMs = Number(process.env.AGENT_OS_GRAPH_NODE_TIMEOUT_MS ?? DEFAULT_GRAPH_NODE_TIMEOUT_MS) || DEFAULT_GRAPH_NODE_TIMEOUT_MS;

  const levels = topologicalLevels(graph);
  const predecessors = getPredecessors(graph);
  const successors = getSuccessors(graph);
  const outputs = new Map<string, string>();
  const nodeResults: GraphRunResult["node_results"] = [];

  const inputPreview = input.length > 80 ? input.slice(0, 80) + "…" : input;
  graphDebug(`[graph] Running graph "${graph.id}" (sync), input: ${JSON.stringify(inputPreview)}`);

  for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
    const level = levels[levelIndex]!;
    const nodeNames = level
      .map((id) => {
        const n = graph.nodes.find((nn) => nn.id === id);
        return n ? `${n.id} (${n.agent})` : id;
      })
      .join(", ");
    graphDebug(`[graph] Level ${levelIndex}: running nodes one by one: ${nodeNames}`);

    const runOne = async (nodeId: string): Promise<{ node_id: string; agent_id: string; success: boolean; output: string; error?: string }> => {
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) {
        graphDebug(`[graph] node ${nodeId} failed: Node not found`);
        return { node_id: nodeId, agent_id: "", success: false, output: "", error: "Node not found" };
      }
      const agent = await getAgent(node.agent);
      if (!agent) {
        graphDebug(`[graph] node ${node.id} failed: Agent not found (${node.agent})`);
        return {
          node_id: node.id,
          agent_id: node.agent,
          success: false,
          output: "",
          error: `Agent not found: ${node.agent}`,
        };
      }
      const preds = predecessors.get(node.id) ?? [];
      const predOutputs = preds
        .map((p) => {
          const raw = outputs.get(p) ?? "";
          const clipped =
            max_predecessor_output_chars > 0
              ? truncatePredecessorOutput(raw, max_predecessor_output_chars)
              : raw;
          return { node_id: p, agent_id: graph.nodes.find((n) => n.id === p)?.agent ?? "", output: clipped };
        })
        .filter((p) => Boolean(p.output?.trim()));
      const nextIds = successors.get(node.id) ?? [];
      const nextMeta = nextIds.map((nid) => ({
        node_id: nid,
        agent_id: graph.nodes.find((n) => n.id === nid)?.agent ?? "",
      }));

      const taskInput = buildGraphNodeTaskInput({
        graphId: graph.id,
        initialInput: input,
        nodeId: node.id,
        agentId: node.agent,
        predecessors: predOutputs,
        successors: nextMeta,
      });

      graphDebug(`[graph] node ${node.id} (${node.agent}) running…`);
      try {
        const result = await withTimeout(
          runAgent({
            agent,
            task: taskInput,
            maxTurnsOverride: max_turns_per_node,
          }),
          nodeTimeoutMs,
          `[graph] node ${node.id} (${node.agent})`
        );
        outputs.set(node.id, result.output || "");
        const outPreview = (result.output?.length ?? 0) > 60 ? (result.output ?? "").slice(0, 60) + "…" : (result.output ?? "");
        graphDebug(`[graph] node ${node.id} done: success=${result.success}${result.error ? ` error=${result.error}` : ""} output=${JSON.stringify(outPreview)}`);
        return {
          node_id: node.id,
          agent_id: node.agent,
          success: result.success,
          output: result.output,
          error: result.error,
        };
      } catch (err) {
        const msg = errorMessage(err);
        graphDebug(`[graph] node ${node.id} failed: ${msg}`);
        outputs.set(node.id, "");
        return { node_id: node.id, agent_id: node.agent, success: false, output: "", error: msg };
      }
    };

    for (const nodeId of level) {
      const r = await runOne(nodeId);
      nodeResults.push(r);
    }
  }

  const last = nodeResults[nodeResults.length - 1];
  graphDebug(`[graph] Graph "${graph.id}" finished (sync). success=${last ? last.success : false}`);
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
  const {
    graph,
    input,
    max_turns_per_node = DEFAULT_GRAPH_MAX_TURNS_PER_NODE,
    max_predecessor_output_chars = DEFAULT_GRAPH_MAX_PREDECESSOR_OUTPUT_CHARS,
  } = options;
  const nodeTimeoutMs = Number(process.env.AGENT_OS_GRAPH_NODE_TIMEOUT_MS ?? DEFAULT_GRAPH_NODE_TIMEOUT_MS) || DEFAULT_GRAPH_NODE_TIMEOUT_MS;
  const levels = topologicalLevels(graph);
  const predecessors = getPredecessors(graph);
  const successors = getSuccessors(graph);
  const outputs = new Map<string, string>();
  const nodeResults: GraphRunResult["node_results"] = [];

  const inputPreview = input.length > 80 ? input.slice(0, 80) + "…" : input;
  graphDebug(`[graph] Running graph "${graph.id}", input: ${JSON.stringify(inputPreview)}`);

  try {
    for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
      const level = levels[levelIndex]!;
      const nodeNames = level
        .map((id) => {
          const n = graph.nodes.find((nn) => nn.id === id);
          return n ? `${n.id} (${n.agent})` : id;
        })
        .join(", ");
      graphDebug(`[graph] Level ${levelIndex}: running nodes one by one: ${nodeNames}`);

      const runOne = async (
        nodeId: string
      ): Promise<{ node_id: string; agent_id: string; success: boolean; output: string; error?: string }> => {
        const node = graph.nodes.find((n) => n.id === nodeId);
        if (!node) {
          graphDebug(`[graph] node ${nodeId} failed: Node not found`);
          return { node_id: nodeId, agent_id: "", success: false, output: "", error: "Node not found" };
        }
        const agent = await getAgent(node.agent);
        if (!agent) {
          graphDebug(`[graph] node ${node.id} failed: Agent not found (${node.agent})`);
          return {
            node_id: node.id,
            agent_id: node.agent,
            success: false,
            output: "",
            error: `Agent not found: ${node.agent}`,
          };
        }
        const preds = predecessors.get(node.id) ?? [];
        const predOutputs = preds
          .map((p) => {
            const raw = outputs.get(p) ?? "";
            const clipped =
              max_predecessor_output_chars > 0
                ? truncatePredecessorOutput(raw, max_predecessor_output_chars)
                : raw;
            return { node_id: p, agent_id: graph.nodes.find((n) => n.id === p)?.agent ?? "", output: clipped };
          })
          .filter((p) => Boolean(p.output?.trim()));
        const nextIds = successors.get(node.id) ?? [];
        const nextMeta = nextIds.map((nid) => ({
          node_id: nid,
          agent_id: graph.nodes.find((n) => n.id === nid)?.agent ?? "",
        }));

        const taskInput = buildGraphNodeTaskInput({
          graphId: graph.id,
          initialInput: input,
          nodeId: node.id,
          agentId: node.agent,
          predecessors: predOutputs,
          successors: nextMeta,
        });

        graphDebug(`[graph] node ${node.id} (${node.agent}) running…`);
        try {
          const result = await withTimeout(
            runAgent({
              agent,
              task: taskInput,
              maxTurnsOverride: max_turns_per_node,
            }),
            nodeTimeoutMs,
            `[graph] node ${node.id} (${node.agent})`
          );
          outputs.set(node.id, result.output || "");
          const payload = {
            node_id: node.id,
            agent_id: node.agent,
            success: result.success,
            output: result.output,
            error: result.error,
          };
          nodeResults.push(payload);
          const outPreview =
            (result.output?.length ?? 0) > 60
              ? (result.output ?? "").slice(0, 60) + "…"
              : (result.output ?? "");
          graphDebug(`[graph] node ${node.id} done: success=${result.success}${result.error ? ` error=${result.error}` : ""} output=${JSON.stringify(outPreview)}`);
          onEvent({ type: "node_done", ...payload });
          return payload;
        } catch (err) {
          const msg = errorMessage(err);
          graphDebug(`[graph] node ${node.id} failed: ${msg}`);
          const payload = {
            node_id: node.id,
            agent_id: node.agent,
            success: false,
            output: "",
            error: msg,
          };
          outputs.set(node.id, "");
          nodeResults.push(payload);
          onEvent({ type: "node_done", ...payload });
          return payload;
        }
      };

      for (const nodeId of level) {
        await runOne(nodeId);
      }
    }

    const last = nodeResults[nodeResults.length - 1];
    graphDebug(`[graph] Graph "${graph.id}" finished. success=${last ? last.success : false}`);
    onEvent({
      type: "done",
      success: last ? last.success : false,
      output: last ? last.output : "",
      node_results: nodeResults,
    });
  } catch (err) {
    const msg = errorMessage(err);
    console.error(`[graph] Graph "${graph.id}" error:`, msg);
    onEvent({ type: "error", message: msg });
    throw err;
  }
}


