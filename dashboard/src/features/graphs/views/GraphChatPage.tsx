import { useEffect, useRef, useState } from "react"
import { api, type AgentSummary, type ConversationSummary } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeftIcon, ChevronRightIcon, UserIcon, GitBranchIcon, BotIcon, PanelLeftIcon, PencilIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MarkdownContent } from "@/components/markdown-content"

const DEFAULT_AVATAR = "agent1.jpg"

function avatarUrl(filename: string | null | undefined): string {
  return `/media/${filename || DEFAULT_AVATAR}`
}

export type GraphNodeResult = {
  node_id: string
  agent_id: string
  success: boolean
  output: string
  error?: string
}

export type GraphChatMessage = {
  role: "user" | "assistant"
  content: string
  steps?: GraphNodeResult[]
  timestamp?: string
}

function formatMessageTime(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export function GraphChatPage({
  graphId,
  initialInput,
  onBack,
}: {
  graphId: string
  initialInput: string | null
  onBack: () => void
}) {
  const [messages, setMessages] = useState<GraphChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const initialSentRef = useRef(false)

  useEffect(() => {
    api.getAgents().then((r) => setAgents(r.agents)).catch(() => setAgents([]))
  }, [])

  useEffect(() => {
    if (!graphId) return
    api.getConversations({ graph_id: graphId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => setConversations([]))
  }, [graphId])

  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    api
      .getConversationMessages({ conversation_id: conversationId, limit: 100 })
      .then((r) => {
        const history = r.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m): GraphChatMessage => {
            const c = m.content as { text?: string; steps?: GraphNodeResult[]; timestamp?: string } | string
            const text = typeof c === "string" ? c : typeof c?.text === "string" ? c.text : JSON.stringify(c ?? "")
            const steps = typeof c === "object" && c !== null && Array.isArray(c.steps) ? c.steps : undefined
            const timestamp = typeof c === "object" && c !== null && typeof c.timestamp === "string" ? c.timestamp : undefined
            return { role: m.role as "user" | "assistant", content: text, steps, timestamp }
          })
        setMessages(history)
      })
      .catch(() => setMessages([]))
  }, [conversationId])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim()) return
    const userTs = new Date().toISOString()
    setInput("")
    setSending(true)

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
      // continue to show message in UI even if save fails
    }
    setMessages((prev) => [...prev, { role: "user", content: text.trim(), timestamp: userTs }])
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])

    try {
      await api.runGraphStream(graphId, text.trim(), {
        onNodeDone(nodeData) {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") {
              const steps = [...(last.steps ?? []), nodeData]
              next[next.length - 1] = { ...last, steps, content: last.content || "Running…" }
            }
            return next
          })
        },
        onDone(data) {
          const ts = new Date().toISOString()
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: data.output || "(no output)",
                steps: data.node_results?.length ? data.node_results : last.steps,
                timestamp: ts,
              }
            }
            return next
          })
          const finalContent = data.output || "(no output)"
          const steps = data.node_results?.length ? data.node_results : undefined
          api
            .saveConversationMessage({
              graph_id: graphId,
              conversation_id: currentConvId ?? undefined,
              role: "assistant",
              content: { text: finalContent, steps, timestamp: ts },
            })
            .catch(() => {})
          api.getConversations({ graph_id: graphId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => {})
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === "assistant") next[next.length - 1] = { ...last, content: `Error: ${msg}`, timestamp: new Date().toISOString() }
        return next
      })
    } finally {
      setSending(false)
    }
  }

  useEffect(() => {
    if (!graphId || initialSentRef.current || !initialInput?.trim()) return
    initialSentRef.current = true
    const text = initialInput.trim()
    const userTs = new Date().toISOString()
    setMessages((prev) => [...prev, { role: "user", content: text, timestamp: userTs }])
    setSending(true)
    setMessages((prev) => [...prev, { role: "assistant", content: "" }])
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
      .runGraphStream(graphId, text, {
        onNodeDone(nodeData) {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") {
              const steps = [...(last.steps ?? []), nodeData]
              next[next.length - 1] = { ...last, steps, content: last.content || "Running…" }
            }
            return next
          })
        },
        onDone(data) {
          const ts = new Date().toISOString()
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") {
              next[next.length - 1] = {
                ...last,
                content: data.output || "(no output)",
                steps: data.node_results?.length ? data.node_results : last.steps,
                timestamp: ts,
              }
            }
            return next
          })
          const convId = initialConvId
          if (convId) {
            api
              .saveConversationMessage({
                graph_id: graphId,
                conversation_id: convId,
                role: "assistant",
                content: { text: data.output || "(no output)", steps: data.node_results, timestamp: ts },
              })
              .catch(() => {})
            api.getConversations({ graph_id: graphId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => {})
          }
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
      .finally(() => setSending(false))
  }, [graphId, initialInput])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    await sendMessage(text)
  }

  if (!graphId) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-muted-foreground">
        <p>No graph selected.</p>
        <Button variant="outline" onClick={onBack}>
          Back to Graphs
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {!showSidebar && (
        <div className="flex shrink-0 flex-col border-r bg-muted/30">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-none" title="Show conversations" onClick={() => setShowSidebar(true)}>
            <PanelLeftIcon className="size-5" />
          </Button>
        </div>
      )}
      {showSidebar && (
        <div className="flex w-64 flex-col border-r">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Conversations</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Hide sidebar" onClick={() => setShowSidebar(false)}>
              <ChevronLeftIcon className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">No conversations yet.</div>
            ) : (
              <ul className="space-y-0.5 p-2">
                {conversations.map((c) => {
                  const active = c.id === conversationId
                  const isEditing = editingConvId === c.id
                  const displayTitle = c.title && c.title.trim().length > 0 ? c.title : "Untitled conversation"
                  return (
                    <li key={c.id} className="group/list flex items-center gap-0.5 rounded-md">
                      {isEditing ? (
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={async () => {
                            const t = editingTitle.trim().slice(0, 200) || "Untitled conversation"
                            setEditingConvId(null)
                            try {
                              await api.updateConversationTitle(c.id, t)
                              api.getConversations({ graph_id: graphId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => {})
                            } catch {
                              // ignore
                            }
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
                          className="h-7 flex-1 text-xs"
                          autoFocus
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            className={"min-w-0 flex-1 rounded-md px-2 py-1 text-left text-xs " + (active ? "bg-primary/10 font-medium" : "hover:bg-muted")}
                            onClick={async () => {
                              setConversationId(c.id)
                              try {
                                const r = await api.getConversationMessages({ conversation_id: c.id, limit: 100 })
                                const history = r.messages
                                  .filter((m) => m.role === "user" || m.role === "assistant")
                                  .map((m): GraphChatMessage => {
                                    const content = m.content as { text?: string; steps?: GraphNodeResult[]; timestamp?: string } | string
                                    const text = typeof content === "string" ? content : typeof content?.text === "string" ? content.text : JSON.stringify(content ?? "")
                                    const steps = typeof content === "object" && content !== null && Array.isArray(content.steps) ? content.steps : undefined
                                    const timestamp = typeof content === "object" && content !== null && typeof content.timestamp === "string" ? content.timestamp : undefined
                                    return { role: m.role as "user" | "assistant", content: text, steps, timestamp }
                                  })
                                setMessages(history)
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            <div className="truncate">{displayTitle}</div>
                            <div className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</div>
                          </button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover/list:opacity-100" title="Rename" onClick={(e) => { e.stopPropagation(); setEditingConvId(c.id); setEditingTitle(displayTitle) }}>
                            <PencilIcon className="size-3" />
                          </Button>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col">
        <div className="shrink-0 flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to Graphs">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <span className="font-mono text-sm font-medium">{graphId}</span>
            <span className="text-muted-foreground text-xs">Graph chat</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setConversationId(null); setMessages([]) }}>New conversation</Button>
        </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
          {messages.length === 0 && !initialInput && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Send a message to run the graph. Each message is sent as input to the first node(s).
            </p>
          )}
          {messages.map((m, i) => {
            const isStreaming = sending && i === messages.length - 1 && m.role === "assistant" && !m.timestamp
            const isUser = m.role === "user"
            return (
              <div
                key={i}
                className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""} max-w-[95%] ${isUser ? "ml-auto" : "mr-auto"}`}
              >
                <Avatar className="size-8 shrink-0 rounded-full border border-border">
                  {isUser ? (
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <UserIcon className="size-4" />
                    </AvatarFallback>
                  ) : (
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <GitBranchIcon className="size-4" />
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className={`flex min-w-0 flex-1 flex-col ${isUser ? "items-end" : "items-start"}`}>
                  <div
                    className={
                      isUser
                        ? "rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                        : "rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-2 text-sm"
                    }
                  >
                    {isUser ? (
                      <div className="whitespace-pre-wrap break-words">
                        {m.content}
                        {isStreaming && <span className="animate-pulse">▌</span>}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap break-words">
                        <MarkdownContent content={m.content} />
                        {isStreaming && <span className="animate-pulse">▌</span>}
                      </div>
                    )}
                    {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                      <details className="group mt-2 border-t border-border/50 pt-2">
                        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                          <ChevronRightIcon className="size-3 shrink-0 transition-transform group-open:rotate-90" />
                          <GitBranchIcon className="size-3 shrink-0" />
                          <span>Steps ({m.steps.length})</span>
                        </summary>
                        <ul className="mt-2 space-y-2 pl-4">
                        {m.steps.map((step, j) => {
  const agent = agents.find((a) => a.id === step.agent_id)
  return (
    <li key={j} className="flex gap-2 rounded border border-border/50 bg-muted/30 p-2 text-xs">
      <Avatar className="size-6 shrink-0 rounded-full border border-border">
        <AvatarImage src={avatarUrl(agent?.avatar)} alt="" />
        <AvatarFallback className="bg-muted text-muted-foreground">
          <BotIcon className="size-3" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">
          {step.node_id} <span className="text-muted-foreground">→ {agent?.name ?? step.agent_id}</span>
        </div>
        {step.error != null && <div className="mt-1 text-destructive">{step.error}</div>}
        {step.output != null && step.error == null && (
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
            {step.output || "(no output)"}
          </pre>
        )}
      </div>
    </li>
  )
})}
                        </ul>
                      </details>
                    )}
                  </div>
                  <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground ${isUser ? "justify-end" : ""}`}>
                    {m.timestamp && <span>{formatMessageTime(m.timestamp)}</span>}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={scrollRef} />
        </div>
      </div>

        <div className="shrink-0 border-t p-4">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl gap-2">
            <Input
              placeholder="Message (input for the graph)…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending}
              className="flex-1"
            />
            <Button type="submit" disabled={sending || !input.trim()}>
              {sending ? "Running…" : "Send"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
