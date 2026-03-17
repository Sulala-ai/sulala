 "use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, type AgentSummary, type MemoryGraphNode, type MemoryGraphEdge } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrainIcon, SearchIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ForceGraph2D from "react-force-graph-2d";

export interface MemoryResult {
  id: number;
  user_id: string | null;
  agent_id: string;
  scope?: string;
  text: string;
  tags?: unknown;
  created_at: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function MemoryPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [activeTab, setActiveTab] = useState<"list" | "graph">("graph");
  const [results, setResults] = useState<MemoryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [addAgentId, setAddAgentId] = useState("");
  const [addText, setAddText] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [graphNodes, setGraphNodes] = useState<MemoryGraphNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<MemoryGraphEdge[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const graphRef = useRef<any>(null);
  const graphWrapRef = useRef<HTMLDivElement | null>(null);
  const [graphSize, setGraphSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = selectedNodeId
    ? graphNodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const selectedNodeLabel = (() => {
    if (!selectedNode) return "";
    if (selectedNode.type === "agent") {
      const agentId = (selectedNode as any).agent_id as string | undefined;
      const agent = agentId ? agents.find((a) => a.id === agentId) : undefined;
      return agent?.name ?? agentId ?? selectedNode.id;
    }
    if (selectedNode.type === "tag") return String((selectedNode as any).label ?? selectedNode.id);
    if (selectedNode.type === "memory") return String((selectedNode as any).label ?? (selectedNode as any).text ?? selectedNode.id);
    return selectedNode.id;
  })();

  const selectedConnected = (() => {
    if (!selectedNode) return { incoming: [] as string[], outgoing: [] as string[] };
    const incoming = graphEdges.filter((e) => e.to === selectedNode.id).map((e) => e.from);
    const outgoing = graphEdges.filter((e) => e.from === selectedNode.id).map((e) => e.to);
    return { incoming, outgoing };
  })();

  useEffect(() => {
    api
      .getAgents()
      .then((r) => setAgents(r.agents))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const preset = sessionStorage.getItem("memoryFilterAgentId");
      if (preset) {
        sessionStorage.removeItem("memoryFilterAgentId");
        setAgentFilter(preset);
        setActiveTab("list");
        setSearching(true);
        setError(null);
        api
          .searchMemory({ agent_id: preset, limit: 50, semantic: false })
          .then((r) => setResults(r.results as MemoryResult[]))
          .catch((e) => setError(e.message))
          .finally(() => setSearching(false));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (activeTab === "graph" && graphNodes.length === 0 && !graphLoading) loadGraph();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "graph" || graphNodes.length === 0 || (graphSize.w > 0 && graphSize.h > 0)) return;
    const el = graphWrapRef.current;
    if (!el) return;
    let rafId = 0;
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 10;
    const measure = () => {
      if (cancelled || attempts >= maxAttempts) return;
      attempts += 1;
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      if (w > 0 && h > 0) {
        setGraphSize({ w, h });
        return;
      }
      rafId = requestAnimationFrame(measure);
    };
    rafId = requestAnimationFrame(measure);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [activeTab, graphNodes.length, graphSize.w, graphSize.h]);

  function runSearch() {
    if (activeTab === "graph") {
      loadGraph();
      return;
    }
    setSearching(true);
    setError(null);
    api
      .searchMemory({
        q: q.trim() || undefined,
        agent_id: agentFilter.trim() || undefined,
        limit: 50,
        semantic,
      })
      .then((r) => setResults(r.results as MemoryResult[]))
      .catch((e) => setError(e.message))
      .finally(() => setSearching(false));
  }

  function loadGraph() {
    setGraphLoading(true);
    setGraphError(null);
    api
      .getMemoryGraph({
        q: q.trim() || undefined,
        agent_id: agentFilter.trim() || undefined,
        limit: 200,
      })
      .then((r) => {
        setGraphNodes(r.nodes ?? []);
        setGraphEdges(r.edges ?? []);
      })
      .catch((e) => setGraphError(e.message))
      .finally(() => setGraphLoading(false));
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this memory?")) return;
    setDeletingId(id);
    api
      .deleteMemory(id)
      .then(() => setResults((prev) => prev.filter((m) => m.id !== id)))
      .catch((e) => setError(e.message))
      .finally(() => setDeletingId(null));
  }

  function handleAddMemory() {
    if (!addAgentId.trim() || !addText.trim()) {
      setAddError("Agent and text are required.");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    setAddSuccess(false);
    api
      .writeMemory({ agent_id: addAgentId.trim(), text: addText.trim() })
      .then(() => {
        setAddText("");
        setAddSuccess(true);
        runSearch();
      })
      .catch((e) => setAddError(e.message))
      .finally(() => setAddSaving(false));
  }

  useLayoutEffect(() => {
    const el = graphWrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      setGraphSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    if (activeTab === "graph") {
      const raf = requestAnimationFrame(() => update());
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeTab, graphNodes.length]);

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>;

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-x-hidden">
      {/* Full-page background: dot pattern always; graph only on Graph tab */}
      <div className="absolute inset-0 z-0 min-h-[calc(100vh-3rem)]">
        <DotPattern
          className={cn(
            "h-full w-full opacity-60",
            "[mask-image:radial-gradient(ellipse_90%_90%_at_50%_50%,white,transparent_70%)]"
          )}
        />
        {/* Graph container always mounted so ref + ResizeObserver get valid size; hidden when List tab via opacity only (no invisible) so size stays non-zero */}
        <div
          ref={graphWrapRef}
          className={cn(
            "absolute inset-0 h-full w-full min-h-[400px]",
            activeTab !== "graph" && "pointer-events-none"
          )}
          style={{
            opacity: activeTab === "graph" && graphNodes.length > 0 && !graphLoading ? 0.9 : 0,
          }}
          aria-hidden={activeTab !== "graph"}
        >
          {activeTab === "graph" && !graphLoading && graphNodes.length > 0 && graphSize.w > 0 && graphSize.h > 0 && (
            <ForceGraph2D
              ref={graphRef as any}
              width={graphSize.w}
              height={graphSize.h}
              graphData={{
                nodes: graphNodes.map((n) => ({
                  id: n.id,
                  label:
                    n.type === "agent"
                      ? (agents.find((a) => a.id === (n as any).agent_id)?.name ?? (n as any).agent_id)
                      : n.type === "memory"
                      ? String((n as any).label ?? (n as any).text ?? n.id)
                      : n.type === "tag"
                      ? String((n as any).label ?? n.id)
                      : n.id,
                  type: n.type,
                })),
                links: graphEdges.map((e) => ({
                  source: e.from,
                  target: e.to,
                  type: e.type,
                })),
              }}
              onNodeClick={(node) => {
                const id = String((node as any).id ?? "");
                if (!id) return;
                setSelectedNodeId(id);
                setDetailsOpen(true);
              }}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = (node as any).label as string;
                const type = (node as any).type as string;
                const fontSize = 12 / globalScale;
                const radius = 6;
                ctx.beginPath();
                if (type === "agent") {
                  ctx.fillStyle = "#0f172a";
                } else if (type === "tag") {
                  ctx.fillStyle = "#16a34a";
                } else {
                  ctx.fillStyle = "#2563eb";
                }
                ctx.arc(node.x!, node.y!, radius, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.font = `${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                ctx.fillStyle = "#111827";
                ctx.fillText(label, node.x! + radius + 3, node.y!);
              }}
              linkColor={(link) =>
                (link as any).type === "tagged" ? "rgba(22,163,74,0.4)" : "rgba(148,163,184,0.6)"
              }
              linkWidth={1}
              cooldownTicks={60}
              onEngineStop={() => {
                const g = graphRef.current as any;
                if (g) g.zoomToFit(400);
              }}
            />
          )}
        </div>
      </div>

      {/* Foreground: header with tabs + content */}
      <div className="relative z-10 flex flex-col gap-4 p-6 w-full max-w-full max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-4  px-4 py-3 ">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <BrainIcon className="size-6" />
              Memory
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {activeTab === "list"
                ? "Search and add long-term memories. Switch to Graph to visualize."
                : "Visualize agents, memories, and tags. Click a node for details."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full border bg-muted/60 p-1 text-xs">
            <button
                type="button"
                className={cn(
                  "px-3 py-1.5 rounded-full",
                  activeTab === "graph" ? "bg-background shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => setActiveTab("graph")}
              >
                Graph
              </button>
              <button
                type="button"
                className={cn(
                  "px-3 py-1.5 rounded-full",
                  activeTab === "list" ? "bg-background shadow-sm" : "text-muted-foreground"
                )}
                onClick={() => setActiveTab("list")}
              >
                List
              </button>
             
            </div>
            <Button onClick={runSearch} disabled={searching || graphLoading}>
              <SearchIcon className="size-4 mr-1" />
              {activeTab === "graph"
                ? graphLoading ? "Loading…" : "Load graph"
                : searching ? "Searching…" : "Search"}
            </Button>
          </div>
        </div>
        {(error || graphError) && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
            {error && graphError && " · "}
            {graphError}
          </div>
        )}

        {activeTab === "list" ? (
          <>
            <Card className="bg-background/90 backdrop-blur-sm shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Search memories</CardTitle>
                <CardDescription>Filter by text or agent. Leave search empty to list recent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label className="text-xs">Query (optional)</Label>
                    <Input
                      placeholder="Search in memory text…"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runSearch()}
                      className="mt-1"
                    />
                  </div>
                  <div className="w-[180px]">
                    <Label className="text-xs">Agent</Label>
                    <select
                      value={agentFilter}
                      onChange={(e) => setAgentFilter(e.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      <option value="">All agents</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={semantic}
                      onChange={(e) => setSemantic(e.target.checked)}
                      className="rounded border-input"
                    />
                    Semantic search
                  </label>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-background/90 backdrop-blur-sm shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Add memory</CardTitle>
                <CardDescription>Store a fact for an agent.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Agent</Label>
                    <select
                      value={addAgentId}
                      onChange={(e) => setAddAgentId(e.target.value)}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      <option value="">Select agent</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Text</Label>
                    <Input
                      placeholder="e.g. User prefers dark mode"
                      value={addText}
                      onChange={(e) => setAddText(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
                {addError && <p className="text-sm text-destructive">{addError}</p>}
                {addSuccess && <p className="text-sm text-green-600">Memory saved.</p>}
                <Button
                  onClick={handleAddMemory}
                  disabled={addSaving || !addAgentId.trim() || !addText.trim()}
                >
                  <PlusIcon className="size-4 mr-1" />
                  {addSaving ? "Saving…" : "Add memory"}
                </Button>
              </CardContent>
            </Card>
            <Card className="bg-background/90 backdrop-blur-sm shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Results</CardTitle>
                <CardDescription>{results.length} memor{results.length === 1 ? "y" : "ies"}</CardDescription>
              </CardHeader>
              <CardContent>
                {results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Run a search or leave query empty and click Search.</p>
                ) : (
                  <ul className="space-y-3">
                    {results.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-lg border bg-card p-3 text-sm flex items-start justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-muted-foreground text-xs">
                            {agents.find((a) => a.id === m.agent_id)?.name ?? m.agent_id}
                            {m.user_id ? ` · user ${m.user_id}` : ""} · {formatDate(m.created_at)}
                          </p>
                          <p className="mt-1">{m.text}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDelete(m.id)}
                          disabled={deletingId === m.id}
                          title="Delete memory"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className= "px-4 py-3  max-w-md">
            <p className="text-sm text-muted-foreground">
              {graphLoading
                ? "Loading memory graph…"
                : graphNodes.length === 0
                ? "No graph data yet. Click Load graph."
                : `${graphNodes.length} nodes · ${graphEdges.length} edges`}
            </p>
          </div>
        )}
      </div>

      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
        <SheetContent side="right" className="w-[420px] sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Details</SheetTitle>
            <SheetDescription>
              {selectedNode ? `${selectedNode.type} • ${selectedNodeLabel}` : "Select a node to see details."}
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-4 space-y-4 overflow-auto">
            {!selectedNode ? (
              <div className="text-sm text-muted-foreground">No selection.</div>
            ) : (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <div className="w-24 text-muted-foreground">Type</div>
                    <div className="font-medium">{selectedNode.type}</div>
                  </div>
                  <div className="flex gap-2">
                    <div className="w-24 text-muted-foreground">ID</div>
                    <div className="font-mono text-xs break-all">{selectedNode.id}</div>
                  </div>
                  {selectedNode.type === "agent" && (
                    <div className="flex gap-2">
                      <div className="w-24 text-muted-foreground">Agent</div>
                      <div className="font-medium">{selectedNodeLabel}</div>
                    </div>
                  )}
                  {selectedNode.type === "tag" && (
                    <div className="flex gap-2">
                      <div className="w-24 text-muted-foreground">Tag</div>
                      <div className="font-medium">{selectedNodeLabel}</div>
                    </div>
                  )}
                  {selectedNode.type === "memory" && (
                    <>
                      <div className="flex gap-2">
                        <div className="w-24 text-muted-foreground">Text</div>
                        <div className="break-words">{String((selectedNode as any).text ?? selectedNodeLabel)}</div>
                      </div>
                      {typeof (selectedNode as any).created_at === "string" && (
                        <div className="flex gap-2">
                          <div className="w-24 text-muted-foreground">Created</div>
                          <div className="font-mono text-xs">{String((selectedNode as any).created_at)}</div>
                        </div>
                      )}
                      {(selectedNode as any).user_id && (
                        <div className="flex gap-2">
                          <div className="w-24 text-muted-foreground">User</div>
                          <div className="font-mono text-xs break-all">{String((selectedNode as any).user_id)}</div>
                        </div>
                      )}
                      {(selectedNode as any).scope && (
                        <div className="flex gap-2">
                          <div className="w-24 text-muted-foreground">Scope</div>
                          <div className="font-medium">{String((selectedNode as any).scope)}</div>
                        </div>
                      )}
                      {(selectedNode as any).tags && (
                        <div className="flex gap-2">
                          <div className="w-24 text-muted-foreground">Tags</div>
                          <div className="font-mono text-xs break-all">{String((selectedNode as any).tags)}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Connections</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedConnected.incoming.length} incoming • {selectedConnected.outgoing.length} outgoing
                  </div>
                  <div className="space-y-1">
                    {selectedConnected.outgoing.slice(0, 10).map((id) => (
                      <button
                        key={`out:${id}`}
                        type="button"
                        className="w-full text-left text-sm rounded-md border px-2 py-1 hover:bg-muted"
                        onClick={() => setSelectedNodeId(id)}
                      >
                        → {id}
                      </button>
                    ))}
                    {selectedConnected.incoming.slice(0, 10).map((id) => (
                      <button
                        key={`in:${id}`}
                        type="button"
                        className="w-full text-left text-sm rounded-md border px-2 py-1 hover:bg-muted"
                        onClick={() => setSelectedNodeId(id)}
                      >
                        ← {id}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
