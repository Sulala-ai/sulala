import { useEffect, useState } from "react"
import { api, type Graph, type GraphNode, type GraphEdge, type AgentSummary } from "@/lib/api"
import { toast } from "sonner"
import { useGraphChat } from "../contexts/graph-chat-context"

const EMPTY_GRAPH: Graph = { id: "", nodes: [], edges: [] }

function emptyGraph(): Graph {
  return { id: "", nodes: [], edges: [] }
}

export function useGraphsPage() {
  const { openGraphChat } = useGraphChat()
  const [showEditorModal, setShowEditorModal] = useState(false)
  const [graphs, setGraphs] = useState<{ id: string }[]>([])
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editGraph, setEditGraph] = useState<Graph>(EMPTY_GRAPH)
  const [editGraphId, setEditGraphId] = useState("")
  const [newGraphId, setNewGraphId] = useState("")
  const [editorError, setEditorError] = useState<string | null>(null)
  const [graphDetails, setGraphDetails] = useState<Record<string, Graph>>({})
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [runNowId, setRunNowId] = useState<string | null>(null)
  const [draggingNodeIndex, setDraggingNodeIndex] = useState<number | null>(null)
  const [dragStart, setDragStart] = useState<{ clientX: number; clientY: number; nodeX: number; nodeY: number } | null>(null)

  function refetchGraphs() {
    api.getGraphs().then((r) => setGraphs(r.graphs)).catch(() => {})
  }

  useEffect(() => {
    api.getGraphs().then((r) => setGraphs(r.graphs)).catch((e) => setError(e.message)).finally(() => setLoading(false))
    api.getAgents().then((r) => setAgents(r.agents)).catch(() => setAgents([]))
  }, [])

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
    return () => {
      cancelled = true
    }
  }, [graphs])

  useEffect(() => {
    if (!editGraphId) {
      setEditGraph(EMPTY_GRAPH)
      setEditorError(null)
      return
    }
    setEditorError(null)
    api
      .getGraph(editGraphId)
      .then((g) => {
        const nodes = g.nodes.map((n, i) => {
          if (n.x != null && n.y != null) return n
          return {
            ...n,
            x: 24 + (i % 4) * 220,
            y: 24 + Math.floor(i / 4) * 140,
          }
        })
        setEditGraph({ ...g, nodes })
      })
      .catch(() => {
        setEditorError("Failed to load graph")
        setEditGraph(EMPTY_GRAPH)
      })
  }, [editGraphId])

  useEffect(() => {
    if (draggingNodeIndex === null || !dragStart) return
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - dragStart.clientX
      const dy = e.clientY - dragStart.clientY
      setEditGraph((g) => ({
        ...g,
        nodes: g.nodes.map((n, j) => (j === draggingNodeIndex ? { ...n, x: dragStart.nodeX + dx, y: dragStart.nodeY + dy } : n)),
      }))
    }
    const onUp = () => {
      setDraggingNodeIndex(null)
      setDragStart(null)
    }
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [draggingNodeIndex, dragStart])

  function addNode() {
    const id = `node_${editGraph.nodes.length + 1}`
    const agent = agents[0]?.id ?? ""
    const count = editGraph.nodes.length
    const x = 24 + (count % 4) * 220
    const y = 24 + Math.floor(count / 4) * 140
    setEditGraph((g) => ({ ...g, nodes: [...g.nodes, { id, agent, x, y }] }))
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

  function getNodePosition(n: GraphNode, i: number) {
    const x = n.x ?? 24 + (i % 4) * 220
    const y = n.y ?? 24 + Math.floor(i / 4) * 140
    return { x, y }
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

  return {
    showEditorModal,
    setShowEditorModal,
    graphs,
    agents,
    loading,
    error,
    editGraph,
    setEditGraph,
    editGraphId,
    setEditGraphId,
    newGraphId,
    setNewGraphId,
    editorError,
    graphDetails,
    setGraphDetails,
    editingScheduleId,
    setEditingScheduleId,
    runNowId,
    setRunNowId,
    draggingNodeIndex,
    setDraggingNodeIndex,
    setDragStart,
    addNode,
    removeNode,
    updateNode,
    addEdge,
    removeEdge,
    updateEdge,
    getNodePosition,
    handleSave,
    startNewGraph,
    openRunForGraph,
    openEditForGraph,
    openNewGraphModal,
    refetchGraphs,
    EMPTY_GRAPH,
  }
}
