import { useEffect, useRef, useState } from "react"
import { api, getWorkspaceFileUrl, type AgentSummary, type ConversationSummary } from "@/lib/api"
import { useChatNav } from "../contexts/chat-nav-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PanelLeftIcon, ChevronLeftIcon, PencilIcon, ChevronRightIcon, WrenchIcon, UserIcon, BotIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MarkdownContent } from "@/components/markdown-content"

export interface ToolCallStep {
  tool: string
  args?: unknown
  result?: unknown
  error?: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
}

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
  steps?: ToolCallStep[]
  timestamp?: string
  usage?: TokenUsage
  model?: string
}

const DEFAULT_AVATAR = "agent1.jpg"

function avatarUrl(filename: string | null | undefined): string {
  return `/media/${filename || DEFAULT_AVATAR}`
}

function formatMessageTime(iso: string | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

const MODEL_RATES: Array<{ pattern: RegExp; inputPer1M: number; outputPer1M: number }> = [
  { pattern: /gpt-5/i, inputPer1M: 1.25, outputPer1M: 10 },
  { pattern: /gpt-4\.1|gpt-4.1/i, inputPer1M: 2, outputPer1M: 8 },
  { pattern: /gpt-4o/i, inputPer1M: 2.5, outputPer1M: 10 },
  { pattern: /o3/i, inputPer1M: 2, outputPer1M: 8 },
  { pattern: /claude-sonnet/i, inputPer1M: 3, outputPer1M: 15 },
  { pattern: /claude-haiku/i, inputPer1M: 0.8, outputPer1M: 4 },
  { pattern: /claude-opus/i, inputPer1M: 15, outputPer1M: 75 },
  { pattern: /gemini-1\.5-pro|gemini-1.5-pro/i, inputPer1M: 1.25, outputPer1M: 5 },
  { pattern: /gemini-2\.0-flash|gemini-2.0-flash/i, inputPer1M: 0.1, outputPer1M: 0.4 },
  { pattern: /gemini.*flash/i, inputPer1M: 0.15, outputPer1M: 0.6 },
  { pattern: /deepseek/i, inputPer1M: 0.55, outputPer1M: 2.19 },
  { pattern: /mistral.*large/i, inputPer1M: 2, outputPer1M: 6 },
  { pattern: /grok/i, inputPer1M: 3, outputPer1M: 15 },
]
const DEFAULT_INPUT_PER_1M = 2.5
const DEFAULT_OUTPUT_PER_1M = 10

function estimateCost(usage: TokenUsage, model: string | undefined): number {
  const inRate = MODEL_RATES.find((r) => r.pattern.test(model ?? ""))?.inputPer1M ?? DEFAULT_INPUT_PER_1M
  const outRate = MODEL_RATES.find((r) => r.pattern.test(model ?? ""))?.outputPer1M ?? DEFAULT_OUTPUT_PER_1M
  return (usage.input_tokens / 1_000_000) * inRate + (usage.output_tokens / 1_000_000) * outRate
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function ChatPage() {
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

  useEffect(() => {
    const savedConvId = window.localStorage.getItem("agent-os-chat-conversation-id")
    if (savedConvId) {
      setConversationId(savedConvId)
      api
        .getConversationMessages({ conversation_id: savedConvId, limit: 100 })
        .then((r) => {
          const history = r.messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map<ChatMessage>((m) => {
              const c = m.content as { text?: string; steps?: ToolCallStep[]; timestamp?: string; usage?: TokenUsage; model?: string } | string
              const text = typeof c === "string" ? c : typeof c?.text === "string" ? c.text : JSON.stringify(c)
              const steps = typeof c === "object" && c !== null && Array.isArray(c.steps) ? c.steps : undefined
              const timestamp = typeof c === "object" && c !== null && typeof c.timestamp === "string" ? c.timestamp : undefined
              const usage = typeof c === "object" && c !== null && c.usage && typeof c.usage.input_tokens === "number" && typeof c.usage.output_tokens === "number" ? c.usage : undefined
              const model = typeof c === "object" && c !== null && typeof c.model === "string" ? c.model : undefined
              return { role: m.role as ChatMessage["role"], content: text, steps, timestamp, usage, model }
            })
          if (history.length) setMessages(history)
        })
        .catch(() => {})
    }
    api
      .getAgents()
      .then((r) => {
        setAgents(r.agents)
        const ids = r.agents.map((a) => a.id)
        if (preselectedAgentId && ids.includes(preselectedAgentId)) {
          setAgentId(preselectedAgentId)
          clearPreselectedAgent()
        } else if (r.agents.length && !agentId) {
          const saved = window.localStorage.getItem("agent-os-chat-agent-id")
          const defaultId =
            saved && ids.includes(saved)
              ? saved
              : ids.includes("manager_agent")
                ? "manager_agent"
                : r.agents[0].id
          setAgentId(defaultId)
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [preselectedAgentId, clearPreselectedAgent])

  useEffect(() => {
    if (!agentId) return
    api.getConversations({ agent_id: agentId, limit: 50 }).then((r) => setConversations(r.conversations)).catch(() => setConversations([]))
  }, [agentId])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!agentId || !text || sending) return
    setInput("")
    setAttachment(null)
    const userContent = attachment ? `${text}\n[Attached: ${attachment.name}]` : text
    setMessages((prev) => [...prev, { role: "user", content: userContent, timestamp: new Date().toISOString() }])
    setSending(true)
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
              next[next.length - 1] = { ...last, content: data.finalContent || last.content, steps: data.steps, timestamp: assistantTimestamp, usage: data.usage, model: data.model }
            }
            return next
          })
          const finalContent = data.finalContent
          const savedContent: { text: string; steps?: ToolCallStep[]; timestamp: string; usage?: TokenUsage; model?: string } = { text: finalContent, timestamp: assistantTimestamp }
          if (data.steps?.length) savedContent.steps = data.steps
          if (data.usage) savedContent.usage = data.usage
          if (data.model) savedContent.model = data.model
          api.saveConversationMessage({ conversation_id: convId, agent_id: agentId, role: "assistant", content: savedContent }).catch(() => {})
          api.getConversations({ agent_id: agentId, limit: 50 }).then((res) => setConversations(res.conversations)).catch(() => {})
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
      const content = `Error: ${e instanceof Error ? e.message : String(e)}`
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === "assistant" && !last.timestamp) {
          next[next.length - 1] = { ...last, content, timestamp: new Date().toISOString() }
          return next
        }
        return [...prev, { role: "assistant" as const, content, timestamp: new Date().toISOString() }]
      })
    } finally {
      setSending(false)
    }
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading agents…</div>
  if (error) return <div className="p-4 text-destructive">Failed to load agents: {error}</div>

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
                              api.getConversations({ agent_id: agentId, limit: 50 }).then((res) => setConversations(res.conversations)).catch(() => {})
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
                              window.localStorage.setItem("agent-os-chat-conversation-id", c.id)
                              try {
                                const r = await api.getConversationMessages({ conversation_id: c.id, limit: 100 })
                                const history = r.messages
                                  .filter((m) => m.role === "user" || m.role === "assistant")
                                  .map<ChatMessage>((m) => {
                                    const content = m.content as { text?: string; steps?: ToolCallStep[]; timestamp?: string; usage?: TokenUsage; model?: string } | string
                                    const text = typeof content === "string" ? content : typeof content?.text === "string" ? content.text : JSON.stringify(content)
                                    const steps = typeof content === "object" && content !== null && Array.isArray(content.steps) ? content.steps : undefined
                                    const timestamp = typeof content === "object" && content !== null && typeof content.timestamp === "string" ? content.timestamp : undefined
                                    const usage = typeof content === "object" && content !== null && content.usage && typeof content.usage.input_tokens === "number" && typeof content.usage.output_tokens === "number" ? content.usage : undefined
                                    const model = typeof content === "object" && content !== null && typeof content.model === "string" ? content.model : undefined
                                    return { role: m.role as ChatMessage["role"], content: text, steps, timestamp, usage, model }
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
        <div className="shrink-0 border-b p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Label htmlFor="chat-agent" className="text-sm font-medium">Agent</Label>
              <select id="chat-agent" className="flex h-9 min-w-[200px] rounded-lg border border-input bg-transparent px-3 py-1 text-sm" value={agentId} onChange={(e) => { const v = e.target.value; setAgentId(v); if (v) window.localStorage.setItem("agent-os-chat-agent-id", v) }}>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {agentId && (
                <span className="text-sm text-muted-foreground" aria-hidden>
                  Chatting with <strong className="text-foreground">{agents.find((a) => a.id === agentId)?.name ?? agentId}</strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={!conversationId} onClick={async () => {
                if (!conversationId) return
                try {
                  const res = await api.summarizeConversation(conversationId)
                  setMessages((prev) => [...prev, { role: "assistant", content: `Summary: ${res.summary}` }])
                } catch (e) {
                  setMessages((prev) => [...prev, { role: "assistant", content: `Error summarizing: ${e instanceof Error ? e.message : String(e)}` }])
                }
              }}>Summarize</Button>
              <Button variant="outline" size="sm" onClick={() => { setConversationId(null); setMessages([]); setAutoSummarized(false); window.localStorage.removeItem("agent-os-chat-conversation-id") }}>New conversation</Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Send a message to start a conversation.</p>}
            {messages.map((m, i) => {
              const isStreaming = sending && i === messages.length - 1 && m.role === "assistant" && !m.timestamp
              const isUser = m.role === "user"
              const currentAgent = agents.find((a) => a.id === agentId)
              return (
                <div key={i} className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""} max-w-[95%] ${isUser ? "ml-auto" : "mr-auto"}`}>
                  <Avatar className="size-8 shrink-0 rounded-full border border-border">
                    {isUser ? <AvatarFallback className="bg-primary text-primary-foreground"><UserIcon className="size-4" /></AvatarFallback> : <><AvatarImage src={avatarUrl(currentAgent?.avatar)} alt="" /><AvatarFallback className="bg-muted text-muted-foreground"><BotIcon className="size-4" /></AvatarFallback></>}
                  </Avatar>
                  <div className={`flex min-w-0 flex-1 flex-col ${isUser ? "items-end" : "items-start"}`}>
                    {m.role === "assistant" && currentAgent && (
                      <span className="mb-0.5 text-xs font-medium text-muted-foreground">{currentAgent.name}</span>
                    )}
                    <div className={isUser ? "rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground" : "rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-2 text-sm"}>
                      {isUser ? (
                        <div className="whitespace-pre-wrap break-words">{m.content}{isStreaming && <span className="animate-pulse">▌</span>}</div>
                      ) : (
                        <div className="whitespace-pre-wrap break-words">
                          <MarkdownContent content={m.content} />
                          {isStreaming && <span className="animate-pulse">▌</span>}
                        </div>
                      )}
                      {m.role === "assistant" && m.steps && m.steps.length > 0 && (
                        <details className="group mt-2 border-t border-border/50 pt-2">
                          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                            <ChevronRightIcon className="size-3 shrink-0 transition-transform group-open:rotate-90" /><WrenchIcon className="size-3 shrink-0" /><span>Tool calls ({m.steps.length})</span>
                          </summary>
                          <ul className="mt-2 space-y-2 pl-4">
                            {m.steps.map((step, j) => {
                              const execResult = step.tool === "exec" && step.result != null && typeof step.result === "object" ? (step.result as { ok?: boolean; outputFile?: string }) : null
                              const outputFile = execResult?.outputFile
                              const isImage = outputFile && /\.(png|jpe?g|gif|webp|svg)$/i.test(outputFile)
                              return (
                                <li key={j} className="rounded border border-border/50 bg-muted/30 p-2 text-xs">
                                  <div className="font-medium text-foreground">{step.tool}</div>
                                  {step.args != null && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground">{typeof step.args === "string" ? step.args : JSON.stringify(step.args, null, 2)}</pre>}
                                  {step.error != null && <div className="mt-1 text-destructive">{step.error}</div>}
                                  {isImage && agentId && execResult?.ok && (
                                    <div className="mt-2">
                                      <img
                                        src={getWorkspaceFileUrl(agentId, outputFile)}
                                        alt={outputFile}
                                        className="max-h-48 rounded border border-border object-contain"
                                        loading="lazy"
                                      />
                                    </div>
                                  )}
                                  {step.result != null && step.error == null && <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{typeof step.result === "string" ? step.result : JSON.stringify(step.result, null, 2)}</pre>}
                                </li>
                              )
                            })}
                          </ul>
                        </details>
                      )}
                    </div>
                    <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-muted-foreground ${isUser ? "justify-end" : ""}`}>
                      {m.timestamp && <span>{formatMessageTime(m.timestamp)}</span>}
                      {m.role === "assistant" && m.timestamp && m.usage && <span aria-hidden>·</span>}
                      {m.role === "assistant" && m.usage && (
                        <>
                          <span>{formatTokens(m.usage.input_tokens)} in · {formatTokens(m.usage.output_tokens)} out</span>
                          <span>~${estimateCost(m.usage, m.model).toFixed(4)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={scrollRef} />
          </div>
        </div>

        <div className="shrink-0 border-t p-4">
          <form onSubmit={handleSend} className="mx-auto flex max-w-2xl flex-col gap-2">
            <div className="flex gap-2">
              <Input placeholder="Message…" value={input} onChange={(e) => setInput(e.target.value)} disabled={sending} className="flex-1" />
              <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-input bg-transparent px-3 py-2 text-sm hover:bg-muted/50">
                <input type="file" className="sr-only" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} accept="video/*,audio/*,image/*,.mp4,.mov,.webm" />
                <span className="shrink-0 text-muted-foreground">📎</span>
                <span className="truncate max-w-[120px]">{attachment ? attachment.name : "Attach"}</span>
              </label>
              <Button type="submit" disabled={sending || !input.trim()}>{sending ? "Sending…" : "Send"}</Button>
            </div>
            {attachment && <p className="text-xs text-muted-foreground">File will be uploaded to the agent workspace and the path shared with the agent (e.g. for YouTube upload).</p>}
          </form>
        </div>
      </div>
    </div>
  )
}
