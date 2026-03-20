import { getWorkspaceFileUrl } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PanelLeftIcon, ChevronLeftIcon, PencilIcon, ChevronRightIcon, WrenchIcon, UserIcon, BotIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MarkdownContent } from "@/components/markdown-content"
import { Particles } from "@/components/ui/particles"
import { ShimmerBorder } from "@/components/ui/shimmer-border"
import { useChatSession } from "../hooks/useChatSession"
import type { TokenUsage } from "../types/chat.types"

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
  const {
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
    selectConversation,
    renameConversation,
    summarizeConversation,
    startNewConversation,
  } = useChatSession()

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
                            await renameConversation(c.id, editingTitle)
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
                              await selectConversation(c.id)
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
        <div className="shrink-0 border-b p-4 relative z-10">
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
              <Button variant="outline" size="sm" disabled={!conversationId} onClick={summarizeConversation}>Summarize</Button>
              <Button variant="outline" size="sm" onClick={startNewConversation}>New conversation</Button>
            </div>
          </div>
        </div>

        {agentId && (
          <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
            <div className="flex h-[420px] w-full max-w-2xl flex-col items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-b from-background via-background/80 to-background">
              <Particles className="absolute inset-0" />
              {messages.length === 0 && (
                <div className="relative flex flex-col items-center text-center gap-4">
                  <ShimmerBorder className="p-1.5">
                    <Avatar className="size-20 rounded-full bg-background/80 backdrop-blur">
                      <AvatarImage src={avatarUrl(agents.find((a) => a.id === agentId)?.avatar)} alt="" />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        <BotIcon className="size-8" />
                      </AvatarFallback>
                    </Avatar>
                  </ShimmerBorder>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Hi, I'm {agents.find((a) => a.id === agentId)?.name ?? agentId}, your AI assistant. Send a message to start a conversation.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="relative z-10 flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((m, i) => {
              const isStreaming = sending && i === messages.length - 1 && m.role === "assistant" && !m.timestamp
              const isUser = m.role === "user"
              const convAgentId = conversations.find((c) => c.id === conversationId)?.agent_id ?? agentId
              const currentAgent = agents.find((a) => a.id === convAgentId)
              return (
                <div key={i} className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""} max-w-[95%] ${isUser ? "ml-auto" : "mr-auto"}`}>
                  <Avatar className="size-8 shrink-0 rounded-full border border-border">
                    {isUser ? <AvatarFallback className="bg-primary text-primary-foreground"><UserIcon className="size-4" /></AvatarFallback> : <><AvatarImage src={avatarUrl(currentAgent?.avatar)} alt="" /><AvatarFallback className="bg-muted text-muted-foreground"><BotIcon className="size-4" /></AvatarFallback></>}
                  </Avatar>
                  <div className={`flex min-w-0 flex-1 flex-col ${isUser ? "items-end" : "items-start"}`}>
                    {m.role === "assistant" && currentAgent && (
                      <span className="mb-0.5 text-xs font-medium text-muted-foreground">{currentAgent.name}</span>
                    )}
                    <div className={isUser ? "w-fit max-w-full sm:max-w-[72ch] rounded-2xl rounded-tr-sm bg-primary px-4 py-2 text-sm text-primary-foreground" : "w-fit max-w-full sm:max-w-[72ch] rounded-2xl rounded-tl-sm border bg-muted/50 px-4 py-2 text-sm"}>
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
              {sending ? (
                <Button type="button" variant="outline" onClick={stopSending}>Stop</Button>
              ) : (
                <Button type="submit" disabled={!input.trim()}>Send</Button>
              )}
            </div>
            {attachment && <p className="text-xs text-muted-foreground">File will be uploaded to the agent workspace and the path shared with the agent (e.g. for YouTube upload).</p>}
          </form>
        </div>
      </div>
    </div>
  )
}
