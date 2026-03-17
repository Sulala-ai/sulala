 "use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, type AgentSummary, type MemoryGraphNode, type MemoryGraphEdge } from "@/lib/api";
import { Button } from "@/components/ui/button";

import { BrainIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import ForceGraph2D from "react-force-graph-2d";

export function MemoryPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
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
    // Auto-load graph on mount (no filters).
    loadGraph();
  }, []);

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
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function loadGraph() {
    setGraphLoading(true);
    setGraphError(null);
    api
      .getMemoryGraph({
        q: undefined,
        agent_id: undefined,
        limit: 200,
      })
      .then((r) => {
        setGraphNodes(r.nodes ?? []);
        setGraphEdges(r.edges ?? []);
      })
      .catch((e) => setGraphError(e.message))
      .finally(() => setGraphLoading(false));
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 p-6 w-full max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <BrainIcon className="size-6" />
            Memory graph
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visualize long-term memories stored by agents.
          </p>
        </div>
        <Button onClick={loadGraph} disabled={graphLoading}>
          <SearchIcon className="size-4 mr-1" />
          {graphLoading ? "Loading…" : "Reload"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {graphError && <p className="text-sm text-destructive">{graphError}</p>}

      {/* Graph view only */}
      <div className="w-full max-w-full overflow-x-hidden">
        <div>
          <h2 className="text-base">Graph</h2>
          <p className="text-sm text-muted-foreground">
            {graphLoading
              ? "Loading memory graph…"
              : `${graphNodes.length} nodes · ${graphEdges.length} edges`}
          </p>
        </div>
        <div className="w-full max-w-full overflow-x-hidden">
          <div
            ref={graphWrapRef}
            className="bg-background relative flex h-[500px] w-full max-w-full flex-col items-center justify-center overflow-hidden rounded-lg"
          >
            <DotPattern
              className={cn(
                "[mask-image:radial-gradient(300px_circle_at_center,white,transparent)]"
              )}
            />
            {graphLoading ? (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground relative z-10">
                <span>Loading memory graph…</span>
              </div>
            ) : graphNodes.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground relative z-10">
                <span>No graph data yet. Run a search and load the graph.</span>
              </div>
            ) : (
              <div className="h-full w-full max-w-full relative z-10 overflow-hidden">
                <ForceGraph2D
                  ref={graphRef as any}
                  width={graphSize.w || undefined}
                  height={graphSize.h || undefined}
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
                      ctx.fillStyle = "#0f172a"; // dark
                    } else if (type === "tag") {
                      ctx.fillStyle = "#16a34a"; // green
                    } else {
                      ctx.fillStyle = "#2563eb"; // blue for memories
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
              </div>
            )}
          </div>
        </div>
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
