import { useEffect, useRef, useState } from "react"
import { api, type AgentSummary, type ConversationSummary, type TaskItem } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeftIcon, ChevronRightIcon, UserIcon, GitBranchIcon, BotIcon, PanelLeftIcon, PencilIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MarkdownContent } from "@/components/markdown-content"
import { Particles } from "@/components/ui/particles"
import { ShimmerBorder } from "@/components/ui/shimmer-border"

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
  gate?: {
    reason: string
    template: string
    suggestions?: Array<{ id: string; title: string; prompt: string }>
    questions?: Array<{ id: string; prompt: string; example?: string }>
  }
  timestamp?: string
}

function parseGatedPayload(data: unknown):
  | {
      ok: true
      reason: string
      template: string
      suggestions?: Array<{ id: string; title: string; prompt: string }>
      questions?: Array<{ id: string; prompt: string; example?: string }>
    }
  | { ok: false } {
  if (!data || typeof data !== "object") return { ok: false }
  const d = data as Record<string, unknown>
  if (d.gated !== true) return { ok: false }
  if (typeof d.reason !== "string" || typeof d.template !== "string") return { ok: false }
  const suggestions =
    Array.isArray(d.suggestions)
      ? d.suggestions
          .filter((s) => s && typeof s === "object")
          .map((s) => {
            const ss = s as Record<string, unknown>
            return {
              id: typeof ss.id === "string" ? ss.id : "",
              title: typeof ss.title === "string" ? ss.title : "",
              prompt: typeof ss.prompt === "string" ? ss.prompt : "",
            }
          })
          .filter((s) => s.id && s.title && s.prompt)
      : undefined
  const questions =
    Array.isArray(d.questions)
      ? d.questions
          .filter((q) => q && typeof q === "object")
          .map((q) => {
            const qq = q as Record<string, unknown>
            return {
              id: typeof qq.id === "string" ? qq.id : "",
              prompt: typeof qq.prompt === "string" ? qq.prompt : "",
              example: typeof qq.example === "string" ? qq.example : undefined,
            }
          })
          .filter((q) => q.id && q.prompt)
      : undefined
  return { ok: true, reason: d.reason, template: d.template, suggestions, questions }
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
      api.saveConversationMessage({ graph_id: graphId, role: "user", content: { text: task.input } }).then((r) => {
        api
          .saveConversationMessage({
            graph_id: graphId,
            conversation_id: r.conversation_id,
            role: "assistant",
            content: { text: output, steps, timestamp: ts },
          })
          .catch(() => {})
      }).catch(() => {})
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
      const maybe = e as unknown as { data?: unknown; message?: string }
      const data = (maybe && typeof maybe === "object" && "data" in maybe ? (maybe as { data?: unknown }).data : undefined) as unknown
      const gated = parseGatedPayload(data)
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === "assistant") {
          if (gated.ok) {
            const reason = gated.reason
            const template = gated.template
            const suggestions = gated.suggestions
            const questions = gated.questions
            next[next.length - 1] = {
              ...last,
              content: `**Prompt needs structure**\n\n${reason}\n\nFill this template and resend:`,
              gate: { reason, template, suggestions, questions },
              timestamp: new Date().toISOString(),
            }
          } else {
            next[next.length - 1] = { ...last, content: `Error: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date().toISOString() }
          }
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
      if (last?.role === "assistant" && !last.timestamp) next[next.length - 1] = { ...last, content: last.content || "Running in background. Return to this page to see the result." }
      return next
    })
  }

  useEffect(() => {
    if (!graphId || initialSentRef.current) return
    const text = initialInput?.trim()
    api.getTasks({ graph_id: graphId, limit: 10 }).then(({ tasks }) => {
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
          const maybe = e as unknown as { data?: unknown; message?: string }
          const data = (maybe && typeof maybe === "object" && "data" in maybe ? (maybe as { data?: unknown }).data : undefined) as unknown
          const gated = parseGatedPayload(data)
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === "assistant") {
              if (gated.ok) {
                const reason = gated.reason
                const template = gated.template
                const suggestions = gated.suggestions
                const questions = gated.questions
                next[next.length - 1] = {
                  ...last,
                  content: `**Prompt needs structure**\n\n${reason}\n\nFill this template and resend:`,
                  gate: { reason, template, suggestions, questions },
                  timestamp: new Date().toISOString(),
                }
              } else {
                next[next.length - 1] = { ...last, content: `Error: ${e instanceof Error ? e.message : String(e)}`, timestamp: new Date().toISOString() }
              }
            }
            return next
          })
          setSending(false)
        })
    }).catch(() => {})
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

      <div className="relative flex flex-1 flex-col">
        <div className="shrink-0 flex items-center justify-between gap-2 border-b px-4 py-2 relative z-10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to Graphs">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <span className="font-mono text-sm font-medium">{graphId}</span>
            <span className="text-muted-foreground text-xs">Graph chat</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setConversationId(null); setMessages([]) }}>New conversation</Button>
        </div>

        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <div className="flex h-[360px] w-full max-w-2xl flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-background via-background/80 to-background">
            <Particles className="absolute inset-0" />
            {messages.length === 0 && !initialInput && (
              <div className="relative flex flex-col items-center text-center gap-4 px-6">
                <div className="flex flex-wrap justify-center gap-4">
                  {(graphAgentIds.length ? agents.filter((a) => graphAgentIds.includes(a.id)) : agents).slice(0, 4).map((agent) => (
                    <div key={agent.id} className="flex flex-col items-center gap-1.5">
                      <ShimmerBorder className="p-1.5 rounded-full">
                        <Avatar className="size-12 rounded-full bg-background/80 backdrop-blur">
                          <AvatarImage src={avatarUrl(agent.avatar)} alt={agent.name} />
                          <AvatarFallback className="bg-muted text-muted-foreground">
                            <BotIcon className="size-5" />
                          </AvatarFallback>
                        </Avatar>
                      </ShimmerBorder>
                      <span className="text-xs font-medium text-foreground/90 max-w-[80px] truncate text-center" title={agent.name}>{agent.name}</span>
                    </div>
                  ))}
                </div>
                <p className="max-w-md text-sm text-muted-foreground">
                  Send a message to run the graph. Each message is sent as input to the first node(s).
                </p>
              </div>
            )}
          </div>
        </div>

      <div className="relative z-10 flex-1 overflow-y-auto p-4">
        <div className="mx-auto max-w-2xl space-y-4">
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
                        ? "w-fit max-w-full sm:max-w-[72ch] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                        : "w-fit max-w-full sm:max-w-[72ch] rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-2 text-sm"
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
                    {m.role === "assistant" && m.gate && (
                      <div className="mt-3 rounded-lg border border-border/60 bg-background/60 p-3">
                        <div className="text-xs font-semibold text-muted-foreground">Structured prompt template</div>
                        {m.gate.suggestions && m.gate.suggestions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.gate.suggestions.map((s) => (
                              <Button
                                key={s.id}
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setInput(s.prompt)
                                  stopPollingRef.current = true
                                  setSending(false)
                                }}
                                title={s.prompt}
                              >
                                {s.title}
                              </Button>
                            ))}
                          </div>
                        )}
                        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-xs text-foreground/90">
{m.gate.template}
                        </pre>
                        {m.gate.questions && m.gate.questions.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {m.gate.questions.map((q) => (
                              <div key={q.id}>
                                <span className="font-medium text-foreground/80">{q.prompt}</span>
                                {q.example ? <span className="ml-1 text-muted-foreground">Example: {q.example}</span> : null}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setInput(m.gate?.template ?? "")
                              stopPollingRef.current = true
                              setSending(false)
                            }}
                          >
                            Use template
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(m.gate?.template ?? "")
                              } catch {
                                // ignore
                              }
                            }}
                          >
                            Copy
                          </Button>
                        </div>
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
  const agentName = agent?.name ?? step.agent_id
  return (
    <li key={j} className="flex gap-2 rounded border border-border/50 bg-muted/30 p-2 text-xs">
      <div className="flex shrink-0 items-start pt-0.5">
        <Avatar className="size-6 rounded-full border border-border">
          <AvatarImage src={avatarUrl(agent?.avatar)} alt={agentName} />
          <AvatarFallback className="bg-muted text-muted-foreground">
            <BotIcon className="size-3" />
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 font-medium text-foreground" title={agentName}>
          {agentName}
          </div>
          <span className="min-w-0 truncate text-[10px] text-muted-foreground" title={step.node_id}>
            
            {step.node_id}
          </span>
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
            {sending ? (
              <Button type="button" variant="outline" onClick={stopSending}>
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()}>
                Send
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
