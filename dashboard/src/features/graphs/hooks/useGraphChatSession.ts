import { useEffect, useRef, useState } from "react"
import { api, type AgentSummary, type ConversationSummary, type TaskItem } from "@/lib/api"
import type { GraphChatMessage, GraphNodeResult } from "../types/graph-chat.types"

function mapGraphChatMessage(
  content: { text?: string; steps?: GraphNodeResult[]; timestamp?: string } | string,
  role: "user" | "assistant",
): GraphChatMessage {
  const text =
    typeof content === "string"
      ? content
      : typeof content?.text === "string"
        ? content.text
        : JSON.stringify(content ?? "")
  const steps = typeof content === "object" && content !== null && Array.isArray(content.steps) ? content.steps : undefined
  const timestamp = typeof content === "object" && content !== null && typeof content.timestamp === "string" ? content.timestamp : undefined
  return { role, content: text, steps, timestamp }
}

export function useGraphChatSession(graphId: string, initialInput: string | null) {
  const [messages, setMessages] = useState<GraphChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [graphAgentIds, setGraphAgentIds] = useState<string[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialSentRef = useRef(false)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopPollingRef = useRef(false)

  useEffect(() => {
    api.getAgents().then((r) => setAgents(r.agents)).catch(() => setAgents([]))
  }, [])

  useEffect(() => {
    if (!graphId) return
    api.getConversations({ graph_id: graphId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => setConversations([]))
    api
      .getGraph(graphId)
      .then((g) => {
        const ids = Array.from(new Set(g.nodes.map((n) => n.agent).filter((id) => typeof id === "string" && id.length > 0)))
        setGraphAgentIds(ids)
      })
      .catch(() => setGraphAgentIds([]))
  }, [graphId])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  function applyTaskResultToLastMessage(task: TaskItem, conversationIdToSave: string | null) {
    const ts = new Date().toISOString()
    const output = task.result?.output ?? (task.result?.error ? `Error: ${task.result.error}` : "(no output)")
    const steps = task.result?.node_results?.length ? task.result.node_results : undefined
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === "assistant") {
        next[next.length - 1] = { ...last, content: output, steps, timestamp: ts }
      }
      return next
    })
    if (conversationIdToSave) {
      api
        .saveConversationMessage({
          graph_id: graphId,
          conversation_id: conversationIdToSave,
          role: "assistant",
          content: { text: output, steps, timestamp: ts },
        })
        .catch(() => {})
    } else {
      api
        .saveConversationMessage({ graph_id: graphId, role: "user", content: { text: task.input } })
        .then((r) => {
          api
            .saveConversationMessage({
              graph_id: graphId,
              conversation_id: r.conversation_id,
              role: "assistant",
              content: { text: output, steps, timestamp: ts },
            })
            .catch(() => {})
        })
        .catch(() => {})
    }
    api.getConversations({ graph_id: graphId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => {})
  }

  function startPolling(taskId: string, conversationIdToSave: string | null) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)
    const interval = setInterval(async () => {
      if (stopPollingRef.current) {
        clearInterval(interval)
        pollIntervalRef.current = null
        setSending(false)
        return
      }
      try {
        const { task } = await api.getTaskById(taskId)
        if (task.status === "completed" || task.status === "failed") {
          clearInterval(interval)
          pollIntervalRef.current = null
          applyTaskResultToLastMessage(task, conversationIdToSave)
          setSending(false)
          return
        }
      } catch {
        // keep polling
      }
    }, 1500)
    pollIntervalRef.current = interval
  }

  async function sendMessage(text: string) {
    if (!text.trim()) return
    const userTs = new Date().toISOString()
    setInput("")
    setSending(true)
    stopPollingRef.current = false

    let currentConvId = conversationId
    try {
      const saveUser = await api.saveConversationMessage({
        graph_id: graphId,
        conversation_id: conversationId ?? undefined,
        role: "user",
        content: { text: text.trim() },
      })
      currentConvId = saveUser.conversation_id
      if (!conversationId) {
        setConversationId(saveUser.conversation_id)
        api.getConversations({ graph_id: graphId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => {})
      }
    } catch {
      // continue
    }
    setMessages((prev) => [...prev, { role: "user", content: text.trim(), timestamp: userTs }])
    setMessages((prev) => [...prev, { role: "assistant", content: "Running…" }])

    try {
      const { task } = await api.enqueueGraphTask(graphId, text.trim())
      startPolling(task.id, currentConvId)
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === "assistant") {
          next[next.length - 1] = { ...last, content: `Error: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date().toISOString() }
        }
        return next
      })
      setSending(false)
    }
  }

  function stopSending() {
    stopPollingRef.current = true
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    setSending(false)
    setMessages((prev) => {
      const next = [...prev]
      const last = next[next.length - 1]
      if (last?.role === "assistant" && !last.timestamp) {
        next[next.length - 1] = { ...last, content: last.content || "Running in background. Return to this page to see the result." }
      }
      return next
    })
  }

  useEffect(() => {
    if (!graphId || initialSentRef.current) return
    const text = initialInput?.trim()
    api
      .getTasks({ graph_id: graphId, limit: 10 })
      .then(({ tasks }) => {
        const running = [...tasks].reverse().find((t) => t.status === "running" || t.status === "queued")
        if (running && running.graph_id === graphId) {
          initialSentRef.current = true
          setMessages([
            { role: "user", content: running.input, timestamp: running.created_at },
            { role: "assistant", content: "Running…" },
          ])
          setSending(true)
          stopPollingRef.current = false
          startPolling(running.id, null)
          return
        }
        if (!text) return
        initialSentRef.current = true
        const userTs = new Date().toISOString()
        setMessages([{ role: "user", content: text, timestamp: userTs }, { role: "assistant", content: "Running…" }])
        setSending(true)
        stopPollingRef.current = false
        let initialConvId: string | null = null
        api
          .saveConversationMessage({ graph_id: graphId, role: "user", content: { text } })
          .then((r) => {
            initialConvId = r.conversation_id
            setConversationId(r.conversation_id)
            api.getConversations({ graph_id: graphId, limit: 50 }).then((res) => setConversations(res.conversations)).catch(() => {})
          })
          .catch(() => {})
        api
          .enqueueGraphTask(graphId, text)
          .then(({ task }) => startPolling(task.id, initialConvId))
          .catch((e) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === "assistant") {
                next[next.length - 1] = { ...last, content: `Error: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date().toISOString() }
              }
              return next
            })
            setSending(false)
          })
      })
      .catch(() => {})
  }, [graphId, initialInput])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    await sendMessage(text)
  }

  async function selectConversation(id: string) {
    setConversationId(id)
    try {
      const r = await api.getConversationMessages({ conversation_id: id, limit: 100 })
      const history = r.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => mapGraphChatMessage(m.content as string | Record<string, unknown>, m.role as "user" | "assistant"))
      setMessages(history)
    } catch {
      // ignore
    }
  }

  async function renameConversation(id: string, title: string) {
    const nextTitle = title.trim().slice(0, 200) || "Untitled conversation"
    setEditingConvId(null)
    try {
      await api.updateConversationTitle(id, nextTitle)
      const r = await api.getConversations({ graph_id: graphId, limit: 50 })
      setConversations(r.conversations)
    } catch {
      // ignore
    }
  }

  function startNewConversation() {
    setConversationId(null)
    setMessages([])
  }

  return {
    messages,
    input,
    setInput,
    sending,
    agents,
    graphAgentIds,
    conversations,
    conversationId,
    showSidebar,
    setShowSidebar,
    editingConvId,
    setEditingConvId,
    editingTitle,
    setEditingTitle,
    scrollRef,
    stopSending,
    handleSubmit,
    selectConversation,
    renameConversation,
    startNewConversation,
  }
}
