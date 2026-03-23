import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { api, type AgentSummary, type ConversationSummary } from "@/lib/api"
import { useChatNav } from "../contexts/chat-nav-context"
import type { ChatMessage, ToolCallStep, TokenUsage } from "../types/chat.types"

function mapConversationMessage(
  content: { text?: string; steps?: ToolCallStep[]; timestamp?: string; usage?: TokenUsage; model?: string } | string,
  role: "user" | "assistant",
): ChatMessage {
  const text =
    typeof content === "string"
      ? content
      : typeof content?.text === "string"
        ? content.text
        : JSON.stringify(content)
  const steps = typeof content === "object" && content !== null && Array.isArray(content.steps) ? content.steps : undefined
  const timestamp = typeof content === "object" && content !== null && typeof content.timestamp === "string" ? content.timestamp : undefined
  const usage =
    typeof content === "object" &&
    content !== null &&
    content.usage &&
    typeof content.usage.input_tokens === "number" &&
    typeof content.usage.output_tokens === "number"
      ? content.usage
      : undefined
  const model = typeof content === "object" && content !== null && typeof content.model === "string" ? content.model : undefined
  return { role, content: text, steps, timestamp, usage, model }
}

function useProvideChatSession() {
  const { preselectedAgentId, clearPreselectedAgent } = useChatNav()
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [agentId, setAgentId] = useState("")
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [autoSummarized, setAutoSummarized] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sendAbortRef = useRef<AbortController | null>(null)
  /** Fresh read for async handlers (e.g. late conversation fetch) so we never overwrite an active stream. */
  const sendingRef = useRef(false)
  useEffect(() => {
    sendingRef.current = sending
  }, [sending])

  useEffect(() => {
    let cancelled = false
    const savedConvId = window.localStorage.getItem("agent-os-chat-conversation-id")
    if (savedConvId) {
      setConversationId(savedConvId)
      api
        .getConversationMessages({ conversation_id: savedConvId, limit: 100 })
        .then((r) => {
          if (cancelled) return
          const history = r.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => mapConversationMessage(m.content as string | Record<string, unknown>, m.role as "user" | "assistant"))
          if (history.length === 0) return
          setMessages((prev) => {
            if (cancelled) return prev
            if (sendingRef.current) return prev
            // Local thread is ahead of this server snapshot (streaming or not yet persisted).
            if (prev.length > history.length) return prev
            return history
          })
        })
        .catch(() => {})
    }
    api
      .getAgents()
      .then((r) => {
        if (cancelled) return
        setAgents(r.agents)
        const ids = r.agents.map((a) => a.id)
        if (preselectedAgentId && ids.includes(preselectedAgentId)) {
          setAgentId(preselectedAgentId)
          clearPreselectedAgent()
        } else if (r.agents.length && !agentId) {
          const saved = window.localStorage.getItem("agent-os-chat-agent-id")
          const defaultId = saved && ids.includes(saved) ? saved : ids.includes("manager_agent") ? "manager_agent" : r.agents[0].id
          setAgentId(defaultId)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [preselectedAgentId, clearPreselectedAgent])

  useEffect(() => {
    if (!agentId) return
    api
      .getConversations({ agent_id: agentId, limit: 50 })
      .then((r) => setConversations(r.conversations))
      .catch(() => setConversations([]))
  }, [agentId])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!agentId || !text || sending) return
    setInput("")
    setAttachment(null)
    const userContent = attachment ? `${text}\n[Attached: ${attachment.name}]` : text
    setMessages((prev) => [...prev, { role: "user", content: userContent, timestamp: new Date().toISOString() }])
    setSending(true)
    const controller = new AbortController()
    sendAbortRef.current = controller
    try {
      const saveUser = await api.saveConversationMessage({
        conversation_id: conversationId ?? undefined,
        agent_id: agentId,
        role: "user",
        content: { text: userContent },
      })
      if (!conversationId && saveUser.conversation_id) {
        setConversationId(saveUser.conversation_id)
        setAutoSummarized(false)
        window.localStorage.setItem("agent-os-chat-conversation-id", saveUser.conversation_id)
      }
      const convId = saveUser.conversation_id ?? conversationId ?? undefined
      setMessages((prev) => [...prev, { role: "assistant", content: "" }])

      let attachmentPaths: string[] | undefined
      if (attachment) {
        const { path } = await api.uploadAgentFile(agentId, attachment)
        attachmentPaths = [path]
      }

      await api.runAgentStream(agentId, text, {
        attachment_paths: attachmentPaths,
        conversation_id: convId,
        signal: controller.signal,
        onDelta(delta) {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") next[next.length - 1] = { ...last, content: last.content + delta }
            return next
          })
        },
        onDone(data) {
          const assistantTimestamp = new Date().toISOString()
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: data.finalContent || last.content,
                steps: data.steps,
                timestamp: assistantTimestamp,
                usage: data.usage,
                model: data.model,
              }
            }
            return next
          })
          const savedContent: { text: string; steps?: ToolCallStep[]; timestamp: string; usage?: TokenUsage; model?: string } = {
            text: data.finalContent,
            timestamp: assistantTimestamp,
          }
          if (data.steps?.length) savedContent.steps = data.steps
          if (data.usage) savedContent.usage = data.usage
          if (data.model) savedContent.model = data.model
          api.saveConversationMessage({ conversation_id: convId, agent_id: agentId, role: "assistant", content: savedContent }).catch(() => {})
          api
            .getConversations({ agent_id: agentId, limit: 50 })
            .then((res) => setConversations(res.conversations))
            .catch(() => {})
        },
        onError(message) {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") next[next.length - 1] = { ...last, content: `Error: ${message}`, timestamp: new Date().toISOString() }
            return next
          })
        },
      })

      const approxTurns = messages.length + 2
      if (convId && !autoSummarized && approxTurns >= 20) {
        try {
          const res = await api.summarizeConversation(convId)
          setMessages((prev) => [...prev, { role: "assistant", content: `Summary: ${res.summary}` }])
          setAutoSummarized(true)
        } catch {
          // ignore
        }
      }
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError"
      const errorContent = isAbort ? null : `Error: ${e instanceof Error ? e.message : String(e)}`
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === "assistant" && !last.timestamp) {
          const finalContent = isAbort ? (last.content || "Stopped") : (errorContent ?? last.content)
          next[next.length - 1] = { ...last, content: finalContent, timestamp: new Date().toISOString() }
          return next
        }
        if (errorContent) return [...prev, { role: "assistant" as const, content: errorContent, timestamp: new Date().toISOString() }]
        return next
      })
    } finally {
      sendAbortRef.current = null
      setSending(false)
    }
  }

  async function selectConversation(id: string) {
    if (sendingRef.current) return
    setConversationId(id)
    window.localStorage.setItem("agent-os-chat-conversation-id", id)
    try {
      const r = await api.getConversationMessages({ conversation_id: id, limit: 100 })
      const history = r.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => mapConversationMessage(m.content as string | Record<string, unknown>, m.role as "user" | "assistant"))
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
      const res = await api.getConversations({ agent_id: agentId, limit: 50 })
      setConversations(res.conversations)
    } catch {
      // ignore
    }
  }

  async function summarizeConversation() {
    if (!conversationId) return
    try {
      const res = await api.summarizeConversation(conversationId)
      setMessages((prev) => [...prev, { role: "assistant", content: `Summary: ${res.summary}` }])
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error summarizing: ${e instanceof Error ? e.message : String(e)}` }])
    }
  }

  function startNewConversation() {
    setConversationId(null)
    setMessages([])
    setAutoSummarized(false)
    window.localStorage.removeItem("agent-os-chat-conversation-id")
  }

  function stopSending() {
    sendAbortRef.current?.abort()
  }

  async function updateAgentModel(nextModel: string) {
    const trimmed = nextModel.trim()
    if (!agentId || !trimmed) return
    try {
      const res = await api.updateAgent(agentId, { model: trimmed })
      setAgents((prev) => prev.map((a) => (a.id === agentId ? { ...a, model: res.agent.model } : a)))
    } catch {
      // ignore model update errors in chat UI
    }
  }

  return {
    agents,
    loading,
    error,
    agentId,
    setAgentId,
    conversationId,
    conversations,
    messages,
    input,
    setInput,
    attachment,
    setAttachment,
    sending,
    showSidebar,
    setShowSidebar,
    editingConvId,
    setEditingConvId,
    editingTitle,
    setEditingTitle,
    scrollRef,
    handleSend,
    stopSending,
    updateAgentModel,
    selectConversation,
    renameConversation,
    summarizeConversation,
    startNewConversation,
  }
}

type ChatSessionContextValue = ReturnType<typeof useProvideChatSession>

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null)

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const value = useProvideChatSession()
  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>
}

export function useChatSession() {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) throw new Error("useChatSession must be used within ChatSessionProvider")
  return ctx
}
