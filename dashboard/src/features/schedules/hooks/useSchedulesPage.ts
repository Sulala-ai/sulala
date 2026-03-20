import { useEffect, useState } from "react"
import { api, type AgentSummary, type Graph, type TaskItem } from "@/lib/api"

export function useSchedulesPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [graphs, setGraphs] = useState<Graph[]>([])
  const [tasksByAgent, setTasksByAgent] = useState<Record<string, TaskItem | null>>({})
  const [tasksByGraph, setTasksByGraph] = useState<Record<string, TaskItem | null>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [togglingGraphId, setTogglingGraphId] = useState<string | null>(null)
  const [historyFor, setHistoryFor] = useState<{ type: "agent" | "graph"; id: string; name: string } | null>(null)
  const [historyTasks, setHistoryTasks] = useState<TaskItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  function loadAgents() {
    return api.getAgents().then((r) => setAgents(r.agents)).catch((e) => setError(e.message))
  }

  function loadGraphs() {
    return api
      .getGraphs()
      .then((r) => Promise.all(r.graphs.map((g) => api.getGraph(g.id))))
      .then((list) => setGraphs(list))
      .catch((e) => setError(e.message))
  }

  function load() {
    return Promise.all([loadAgents(), loadGraphs()])
  }

  useEffect(() => {
    load()
      .then(() => setLoading(false))
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const scheduledAgents = agents.filter((a) => a.schedule?.trim())
    const scheduledGraphs = graphs.filter((g) => g.schedule?.trim())
    if (scheduledAgents.length === 0 && scheduledGraphs.length === 0) {
      queueMicrotask(() => {
        setTasksByAgent({})
        setTasksByGraph({})
      })
      return
    }
    api
      .getTasks({ limit: 300 })
      .then(({ tasks }) => {
        const byAgent: Record<string, TaskItem | null> = {}
        for (const a of scheduledAgents) {
          const agentTasks = tasks
            .filter((t) => t.agent_id === a.id && (t.status === "completed" || t.status === "failed"))
            .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
          byAgent[a.id] = agentTasks[0] ?? null
        }
        setTasksByAgent(byAgent)
        const byGraph: Record<string, TaskItem | null> = {}
        for (const g of scheduledGraphs) {
          const graphTasks = tasks
            .filter((t) => t.graph_id === g.id && (t.status === "completed" || t.status === "failed"))
            .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
          byGraph[g.id] = graphTasks[0] ?? null
        }
        setTasksByGraph(byGraph)
      })
      .catch(() => {
        setTasksByAgent({})
        setTasksByGraph({})
      })
  }, [agents, graphs])

  const scheduledAgents = agents.filter((a) => a.schedule?.trim())
  const scheduledGraphs = graphs.filter((g) => g.schedule?.trim())

  function openHistory(type: "agent" | "graph", id: string, name: string) {
    setHistoryFor({ type, id, name })
    setHistoryTasks([])
    setHistoryLoading(true)
    const params = type === "agent" ? { agent_id: id, limit: 50 } : { graph_id: id, limit: 50 }
    api
      .getTasks(params)
      .then(({ tasks }) => setHistoryTasks(tasks.sort((a, b) => b.updated_at.localeCompare(a.updated_at))))
      .catch(() => setHistoryTasks([]))
      .finally(() => setHistoryLoading(false))
  }

  return {
    agents,
    graphs,
    tasksByAgent,
    tasksByGraph,
    loading,
    error,
    togglingId,
    setTogglingId,
    togglingGraphId,
    setTogglingGraphId,
    historyFor,
    setHistoryFor,
    historyTasks,
    historyLoading,
    scheduledAgents,
    scheduledGraphs,
    openHistory,
    load,
  }
}
