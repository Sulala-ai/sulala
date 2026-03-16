import { useEffect, useState } from "react"
import { api, type Graph, type GraphNode, type GraphEdge, type AgentSummary } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Trash2Icon, PlusIcon, ArrowRightIcon, PlayIcon, PencilIcon, X, CalendarIcon, Pause, Play, MoreVertical } from "lucide-react"
import { toast } from "sonner"
import { useGraphChat } from "../contexts/graph-chat-context"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { ScheduleDialog, scheduleHint } from "@/components/schedule-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const EMPTY_GRAPH: Graph = { id: "", nodes: [], edges: [] }

function emptyGraph(): Graph {
  return { id: "", nodes: [], edges: [] }
}

const GRAPH_AVATARS = ["agent1.jpg", "agent2.jpg", "agent3.jpg", "agent4.jpg"]
const DEFAULT_AVATAR = "agent1.jpg"

function graphAvatarUrl(graphId: string): string {
  let n = 0
  for (let i = 0; i < graphId.length; i++) n += graphId.charCodeAt(i)
  return `/media/${GRAPH_AVATARS[Math.abs(n) % GRAPH_AVATARS.length]!}`
}

function agentAvatarUrl(agentId: string, agents: AgentSummary[]): string {
  const agent = agents.find((a) => a.id === agentId)
  return `/media/${agent?.avatar || DEFAULT_AVATAR}`
}

export function GraphsPage() {
  const { openGraphChat } = useGraphChat()
  const [showEditorModal, setShowEditorModal] = useState(false)
  const [graphs, setGraphs] = useState<{ id: string }[]>([])
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Editor state
  const [editGraph, setEditGraph] = useState<Graph>(EMPTY_GRAPH)
  const [editGraphId, setEditGraphId] = useState("")
  const [newGraphId, setNewGraphId] = useState("")
  const [editorError, setEditorError] = useState<string | null>(null)
  const [graphDetails, setGraphDetails] = useState<Record<string, Graph>>({})
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [runNowId, setRunNowId] = useState<string | null>(null)

  function refetchGraphs() {
    api.getGraphs().then((r) => setGraphs(r.graphs)).catch(() => {})
  }

  useEffect(() => {
    api.getGraphs().then((r) => setGraphs(r.graphs)).catch((e) => setError(e.message)).finally(() => setLoading(false))
    api.getAgents().then((r) => setAgents(r.agents)).catch(() => setAgents([]))
  }, [])

  // Load full graph for each id so we can show agent avatars in the list
  useEffect(() => {
    if (graphs.length === 0) return
    let cancelled = false
    Promise.all(graphs.map((g) => api.getGraph(g.id)))
      .then((loaded) => {
        if (cancelled) return
        const next: Record<string, Graph> = {}
        graphs.forEach((g, i) => {
          next[g.id] = loaded[i]!
        })
        setGraphDetails((prev) => ({ ...prev, ...next }))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [graphs])

  useEffect(() => {
    if (!editGraphId) {
      setEditGraph(EMPTY_GRAPH)
      setEditorError(null)
      return
    }
    setEditorError(null)
    api.getGraph(editGraphId).then(setEditGraph).catch(() => {
      setEditorError("Failed to load graph")
      setEditGraph(EMPTY_GRAPH)
    })
  }, [editGraphId])

  function addNode() {
    const id = `node_${editGraph.nodes.length + 1}`
    const agent = agents[0]?.id ?? ""
    setEditGraph((g) => ({ ...g, nodes: [...g.nodes, { id, agent }] }))
  }

  function removeNode(nodeId: string) {
    setEditGraph((g) => ({
      ...g,
      nodes: g.nodes.filter((n) => n.id !== nodeId),
      edges: g.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }))
  }

  function updateNode(i: number, patch: Partial<GraphNode>) {
    setEditGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n, j) => (j === i ? { ...n, ...patch } : n)),
    }))
  }

  function addEdge() {
    const from = editGraph.nodes[0]?.id ?? ""
    const to = editGraph.nodes[1]?.id ?? from
    if (from && to) setEditGraph((g) => ({ ...g, edges: [...g.edges, { from, to }] }))
  }

  function removeEdge(i: number) {
    setEditGraph((g) => ({ ...g, edges: g.edges.filter((_, j) => j !== i) }))
  }

  function updateEdge(i: number, patch: Partial<GraphEdge>) {
    setEditGraph((g) => ({
      ...g,
      edges: g.edges.map((e, j) => (j === i ? { ...e, ...patch } : e)),
    }))
  }

  async function handleSave() {
    const id = (editGraphId || newGraphId.trim()).trim()
    if (!id) {
      setEditorError("Graph ID required")
      return
    }
    setEditorError(null)
    const toSave: Graph = {
      ...editGraph,
      id,
      schedule: editGraph.schedule?.trim() || undefined,
      schedule_input: editGraph.schedule_input?.trim() || undefined,
      schedule_enabled: editGraph.schedule_enabled !== false,
    }
    if (!toSave.nodes.length) {
      setEditorError("Add at least one node")
      return
    }
    try {
      await api.saveGraph(toSave)
      toast.success("Graph saved")
      setEditGraph(toSave)
      setEditGraphId(id)
      setNewGraphId("")
      setGraphDetails((prev) => ({ ...prev, [id]: toSave }))
      refetchGraphs()
      setShowEditorModal(false)
    } catch (e) {
      setEditorError(e instanceof Error ? e.message : String(e))
    }
  }

  function startNewGraph() {
    setEditGraphId("")
    setNewGraphId("")
    setEditGraph(emptyGraph())
    setEditorError(null)
  }

  function openRunForGraph(id: string) {
    openGraphChat(id)
  }

  function openEditForGraph(id: string) {
    setEditGraphId(id)
    setShowEditorModal(true)
  }

  function openNewGraphModal() {
    startNewGraph()
    setShowEditorModal(true)
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading graphs…</div>
  if (error && graphs.length === 0) return <div className="p-4 text-destructive">Failed to load graphs: {error}</div>

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Graphs</h1>
          <p className="text-muted-foreground">Run workflows or edit graphs: add agent nodes, connect them, then run.</p>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A graph is a pipeline of agents: each <strong>node</strong> is an agent; <strong>edges</strong> define the order (from → to). You provide one input; it is passed to the first node(s) with no incoming edges. Each node runs and its output can feed the next. The final output is from the last node in the chain.
          </p>
        </div>
        <Button onClick={openNewGraphModal}>
          New graph
        </Button>
      </div>

      {graphs.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>No graphs yet</CardTitle>
            <CardDescription>Create your first graph to run a multi-step workflow.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={openNewGraphModal}>
              Create your first graph
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your graphs</CardTitle>
          <CardDescription>Run or edit a graph. Stored in ~/.agent-os/graphs/ (or AGENT_OS_GRAPHS_DIR).</CardDescription>
        </CardHeader>
        <CardContent>
          {graphs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No graphs yet. Use New graph to create one.</p>
          ) : (
            <ul className="space-y-2">
              {graphs.map((g) => (
                <li key={g.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {(graphDetails[g.id]?.nodes ?? []).length > 0
                        ? (graphDetails[g.id]!.nodes.slice(0, 4).map((node) => (
                            <Avatar
                              key={node.id}
                              className="size-8 shrink-0 border-2 border-background ring-1 ring-border"
                            >
                              <AvatarImage src={agentAvatarUrl(node.agent, agents)} alt="" />
                            </Avatar>
                          )))
                        : (
                            <Avatar className="size-8 shrink-0 border-2 border-background">
                              <AvatarImage src={graphAvatarUrl(g.id)} alt="" />
                            </Avatar>
                          )}
                    </div>
                    <span className="font-mono text-sm">{g.id}</span>
                    {(graphDetails[g.id]?.schedule_input ?? "") && (
                      <span className="text-xs text-muted-foreground">Scheduled: &quot;{graphDetails[g.id]?.schedule_input}&quot;</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      <CalendarIcon className="mr-0.5 inline size-3" />
                      {scheduleHint(graphDetails[g.id]?.schedule ?? undefined)}
                      {(graphDetails[g.id]?.schedule ?? "") && graphDetails[g.id]?.schedule_enabled === false && (
                        <span className="ml-1 text-muted-foreground/80">(paused)</span>
                      )}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openRunForGraph(g.id)}>
                          <PlayIcon className="mr-2 size-4" />
                          Chat
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditForGraph(g.id)}>
                          <PencilIcon className="mr-2 size-4" />
                          Edit graph
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setEditingScheduleId(g.id)}>
                          <CalendarIcon className="mr-2 size-4" />
                          Edit schedule
                        </DropdownMenuItem>
                        {(graphDetails[g.id]?.schedule ?? "") && (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                const full = await api.getGraph(g.id)
                                const next = !(full.schedule_enabled !== false)
                                await api.saveGraph({ ...full, schedule_enabled: next })
                                setGraphDetails((prev) => ({ ...prev, [g.id]: { ...full, schedule_enabled: next } }))
                                toast.success(next ? "Schedule resumed" : "Schedule paused")
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : String(e))
                              }
                            }}
                          >
                            {graphDetails[g.id]?.schedule_enabled === false ? (
                              <><Play className="mr-2 size-4" /> Resume schedule</>
                            ) : (
                              <><Pause className="mr-2 size-4" /> Pause schedule</>
                            )}
                          </DropdownMenuItem>
                        )}
                        {(graphDetails[g.id]?.schedule ?? "") && (
                          <DropdownMenuItem
                            disabled={runNowId !== null}
                            onClick={async () => {
                              if (runNowId) return
                              setRunNowId(g.id)
                              try {
                                await api.enqueueGraphTask(g.id, (graphDetails[g.id]?.schedule_input ?? "").trim() || "Scheduled run")
                                toast.success("Job queued")
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : String(e))
                              } finally {
                                setRunNowId(null)
                              }
                            }}
                          >
                            {runNowId === g.id ? "Queuing…" : "Run now"}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {editingScheduleId && graphDetails[editingScheduleId] && (
        <ScheduleDialog
          open={true}
          onOpenChange={(open) => !open && setEditingScheduleId(null)}
          schedule={graphDetails[editingScheduleId]!.schedule}
          scheduleInput={graphDetails[editingScheduleId]!.schedule_input}
          title="Edit schedule"
          onSave={async (payload) => {
            const full = await api.getGraph(editingScheduleId)
            const updated = {
              ...full,
              schedule: payload.schedule ?? undefined,
              schedule_input: payload.schedule_input ?? undefined,
              schedule_enabled: true,
            }
            await api.saveGraph(updated)
            setGraphDetails((prev) => ({ ...prev, [editingScheduleId]: updated }))
            toast.success("Schedule saved. Restart server for cron to take effect.")
          }}
        />
      )}

      {showEditorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowEditorModal(false)} aria-hidden />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editGraphId ? "Edit graph" : "New graph"}</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowEditorModal(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label>Open graph</Label>
                  <select
                    className="flex h-9 min-w-[160px] rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                    value={editGraphId}
                    onChange={(e) => setEditGraphId(e.target.value)}
                  >
                    <option value="">New graph…</option>
                    {graphs.map((g) => (
                      <option key={g.id} value={g.id}>{g.id}</option>
                    ))}
                  </select>
                </div>
                {!editGraphId && (
                  <div className="space-y-1">
                    <Label htmlFor="new-graph-id">New graph ID</Label>
                    <Input
                      id="new-graph-id"
                      placeholder="e.g. my_pipeline"
                      value={newGraphId}
                      onChange={(e) => setNewGraphId(e.target.value)}
                      className="w-40"
                    />
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={startNewGraph}>
                  New graph
                </Button>
                <Button type="button" size="sm" onClick={handleSave} disabled={!editGraph.nodes.length}>
                  Save
                </Button>
                {editGraphId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => { setShowEditorModal(false); openRunForGraph(editGraphId) }}
                  >
                    <PlayIcon className="mr-1 size-3" />
                    Run this graph
                  </Button>
                )}
              </div>
              {editorError && <p className="text-sm text-destructive">{editorError}</p>}

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Nodes</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addNode}>
                      <PlusIcon className="mr-1 size-3" /> Add
                    </Button>
                  </div>
                  <ul className="space-y-2">
                    {editGraph.nodes.map((n, i) => (
                      <li key={n.id} className="flex items-center gap-2 rounded-lg border p-2">
                        <Input
                          placeholder="Node id"
                          value={n.id}
                          onChange={(e) => updateNode(i, { id: e.target.value })}
                          className="h-8 font-mono text-xs"
                        />
                        <select
                          className="h-8 min-w-[100px] rounded border border-input bg-transparent px-2 text-xs"
                          value={n.agent}
                          onChange={(e) => updateNode(i, { agent: e.target.value })}
                        >
                          {agents.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeNode(n.id)}>
                          <Trash2Icon className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Edges (from → to)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addEdge} disabled={editGraph.nodes.length < 2}>
                      <PlusIcon className="mr-1 size-3" /> Add
                    </Button>
                  </div>
                  <ul className="space-y-2">
                    {editGraph.edges.map((e, i) => (
                      <li key={i} className="flex items-center gap-2 rounded-lg border p-2">
                        <select
                          className="h-8 flex-1 rounded border border-input bg-transparent px-2 text-xs"
                          value={e.from}
                          onChange={(ev) => updateEdge(i, { from: ev.target.value })}
                        >
                          {editGraph.nodes.map((n) => (
                            <option key={n.id} value={n.id}>{n.id}</option>
                          ))}
                        </select>
                        <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" />
                        <select
                          className="h-8 flex-1 rounded border border-input bg-transparent px-2 text-xs"
                          value={e.to}
                          onChange={(ev) => updateEdge(i, { to: ev.target.value })}
                        >
                          {editGraph.nodes.map((n) => (
                            <option key={n.id} value={n.id}>{n.id}</option>
                          ))}
                        </select>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeEdge(i)}>
                          <Trash2Icon className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Schedule (cron, optional)</Label>
                  <Input
                    placeholder="e.g. 0 9 * * *"
                    value={editGraph.schedule ?? ""}
                    onChange={(e) => setEditGraph((g) => ({ ...g, schedule: e.target.value || undefined }))}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Scheduled task (optional)</Label>
                  <Input
                    placeholder="Task when schedule runs"
                    value={editGraph.schedule_input ?? ""}
                    onChange={(e) => setEditGraph((g) => ({ ...g, schedule_input: e.target.value || undefined }))}
                    className="text-xs"
                  />
                </div>
              </div>

              {editGraph.nodes.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">Preview</div>
                  <div className="flex flex-wrap items-center gap-2">
                    {editGraph.nodes.map((n, i) => (
                      <span key={n.id}>
                        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-xs">{n.id}</span>
                        <span className="text-muted-foreground text-xs">({agents.find((a) => a.id === n.agent)?.name ?? n.agent})</span>
                        {i < editGraph.nodes.length - 1 && <ArrowRightIcon className="inline size-3 text-muted-foreground" />}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
