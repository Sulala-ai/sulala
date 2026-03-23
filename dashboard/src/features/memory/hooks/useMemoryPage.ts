import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { api, type AgentSummary, type MemoryGraphEdge, type MemoryGraphNode } from "@/lib/api"
import type { MemoryResult } from "@/features/memory/types/memory.types"

type MemoryNodeDetails = MemoryGraphNode & {
  agent_id?: string
  label?: string
  text?: string
  created_at?: string
  user_id?: string | null
  scope?: string
  tags?: unknown
}

export function useMemoryPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [activeTab, setActiveTab] = useState<"list" | "graph">("graph")
  const [results, setResults] = useState<MemoryResult[]>([])
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState("")
  const [agentFilter, setAgentFilter] = useState("")
  const [semantic, setSemantic] = useState(false)
  const [addAgentId, setAddAgentId] = useState("")
  const [addText, setAddText] = useState("")
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [addSuccess, setAddSuccess] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [graphNodes, setGraphNodes] = useState<MemoryGraphNode[]>([])
  const [graphEdges, setGraphEdges] = useState<MemoryGraphEdge[]>([])
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const graphWrapRef = useRef<HTMLDivElement | null>(null)
  const [graphSize, setGraphSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const graphAutoLoadedRef = useRef(false)

  const selectedNode = selectedNodeId ? graphNodes.find((n) => n.id === selectedNodeId) ?? null : null

  const selectedNodeLabel = (() => {
    if (!selectedNode) return ""
    if (selectedNode.type === "agent") {
      const agentId = (selectedNode as MemoryNodeDetails).agent_id
      const agent = agentId ? agents.find((a) => a.id === agentId) : undefined
      return agent?.name ?? agentId ?? selectedNode.id
    }
    if (selectedNode.type === "tag") return String((selectedNode as MemoryNodeDetails).label ?? selectedNode.id)
    if (selectedNode.type === "memory") {
      const node = selectedNode as MemoryNodeDetails
      return String(node.label ?? node.text ?? selectedNode.id)
    }
    return selectedNode.id
  })()

  const selectedConnected = (() => {
    if (!selectedNode) return { incoming: [] as string[], outgoing: [] as string[] }
    const incoming = graphEdges.filter((e) => e.to === selectedNode.id).map((e) => e.from)
    const outgoing = graphEdges.filter((e) => e.from === selectedNode.id).map((e) => e.to)
    return { incoming, outgoing }
  })()

  useEffect(() => {
    api
      .getAgents()
      .then((r) => setAgents(r.agents))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    try {
      const preset = sessionStorage.getItem("memoryFilterAgentId")
      if (preset) {
        sessionStorage.removeItem("memoryFilterAgentId")
        queueMicrotask(() => {
          setAgentFilter(preset)
          setActiveTab("list")
          setSearching(true)
          setError(null)
          api
            .searchMemory({ agent_id: preset, limit: 50, semantic: false })
            .then((r) => setResults(r.results as MemoryResult[]))
            .catch((e) => setError(e.message))
            .finally(() => setSearching(false))
        })
      }
    } catch {
      // ignore
    }
  }, [])

  const loadGraph = useCallback(() => {
    setGraphLoading(true)
    setGraphError(null)
    api
      .getMemoryGraph({
        q: q.trim() || undefined,
        agent_id: agentFilter.trim() || undefined,
        limit: 200,
      })
      .then((r) => {
        setGraphNodes(r.nodes ?? [])
        setGraphEdges(r.edges ?? [])
      })
      .catch((e) => setGraphError(e.message))
      .finally(() => setGraphLoading(false))
  }, [agentFilter, q])

  useEffect(() => {
    if (activeTab !== "graph") return
    if (graphAutoLoadedRef.current || graphLoading) return
    graphAutoLoadedRef.current = true
    queueMicrotask(() => loadGraph())
  }, [activeTab, graphLoading, loadGraph])

  useEffect(() => {
    if (activeTab !== "graph" || graphNodes.length === 0 || (graphSize.w > 0 && graphSize.h > 0)) return
    const el = graphWrapRef.current
    if (!el) return
    let rafId = 0
    let cancelled = false
    let attempts = 0
    const maxAttempts = 10
    const measure = () => {
      if (cancelled || attempts >= maxAttempts) return
      attempts += 1
      const rect = el.getBoundingClientRect()
      const w = Math.max(0, Math.floor(rect.width))
      const h = Math.max(0, Math.floor(rect.height))
      if (w > 0 && h > 0) {
        setGraphSize({ w, h })
        return
      }
      rafId = requestAnimationFrame(measure)
    }
    rafId = requestAnimationFrame(measure)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
    }
  }, [activeTab, graphNodes.length, graphSize.w, graphSize.h])

  function runSearch() {
    if (activeTab === "graph") {
      loadGraph()
      return
    }
    setSearching(true)
    setError(null)
    api
      .searchMemory({
        q: q.trim() || undefined,
        agent_id: agentFilter.trim() || undefined,
        limit: 50,
        semantic,
      })
      .then((r) => setResults(r.results as MemoryResult[]))
      .catch((e) => setError(e.message))
      .finally(() => setSearching(false))
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this memory?")) return
    setDeletingId(id)
    api
      .deleteMemory(id)
      .then(() => setResults((prev) => prev.filter((m) => m.id !== id)))
      .catch((e) => setError(e.message))
      .finally(() => setDeletingId(null))
  }

  function handleAddMemory() {
    if (!addAgentId.trim() || !addText.trim()) {
      setAddError("Agent and text are required.")
      return
    }
    setAddSaving(true)
    setAddError(null)
    setAddSuccess(false)
    api
      .writeMemory({ agent_id: addAgentId.trim(), text: addText.trim() })
      .then(() => {
        setAddText("")
        setAddSuccess(true)
        runSearch()
      })
      .catch((e) => setAddError(e.message))
      .finally(() => setAddSaving(false))
  }

  useLayoutEffect(() => {
    const el = graphWrapRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.max(0, Math.floor(rect.width))
      const h = Math.max(0, Math.floor(rect.height))
      setGraphSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    }
    update()
    if (activeTab === "graph") {
      const raf = requestAnimationFrame(() => update())
      const ro = new ResizeObserver(() => update())
      ro.observe(el)
      return () => {
        cancelAnimationFrame(raf)
        ro.disconnect()
      }
    }
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [activeTab, graphNodes.length])

  return {
    agents,
    activeTab,
    setActiveTab,
    results,
    searching,
    q,
    setQ,
    agentFilter,
    setAgentFilter,
    semantic,
    setSemantic,
    addAgentId,
    setAddAgentId,
    addText,
    setAddText,
    addSaving,
    addError,
    addSuccess,
    deletingId,
    graphNodes,
    graphEdges,
    graphLoading,
    graphError,
    loading,
    error,
    graphWrapRef,
    graphSize,
    detailsOpen,
    setDetailsOpen,
    selectedNodeId,
    setSelectedNodeId,
    selectedNode,
    selectedNodeLabel,
    selectedConnected,
    runSearch,
    handleDelete,
    handleAddMemory,
  }
}
