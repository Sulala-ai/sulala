import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronLeftIcon, ChevronRightIcon, UserIcon, GitBranchIcon, BotIcon, PanelLeftIcon, PencilIcon, ArrowUpIcon, PaperclipIcon } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MarkdownContent } from "@/components/markdown-content"
import { Particles } from "@/components/ui/particles"
import { ShimmerBorder } from "@/components/ui/shimmer-border"
import { useGraphChatSession } from "../hooks/useGraphChatSession"

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

export function GraphChatPage({
  graphId,
  initialInput,
  onBack,
}: {
  graphId: string
  initialInput: string | null
  onBack: () => void
}) {
  const {
    messages,
    input,
    setInput,
    attachment,
    setAttachment,
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
  } = useGraphChatSession(graphId, initialInput)

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
        <div className="shrink-0 flex items-center justify-between gap-2 border-b px-4 py-2 relative z-10">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to Graphs">
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <span className="font-mono text-sm font-medium">{graphId}</span>
            <span className="text-muted-foreground text-xs">Graph chat</span>
          </div>
          <Button variant="outline" size="sm" onClick={startNewConversation}>New conversation</Button>
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

        <div className="shrink-0 p-4">
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl flex-col gap-2">
            <div className="rounded-2xl border border-border/80 bg-background shadow-sm">
              <Input
                placeholder="What's on your mind?"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={sending}
                className="h-12 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <label className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-input text-muted-foreground hover:bg-muted/60" title={attachment ? attachment.name : "Attach file"}>
                    <input type="file" className="sr-only" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} accept="video/*,audio/*,image/*,.mp4,.mov,.webm" />
                    <PaperclipIcon className="size-4" />
                  </label>
                  {/* <SparklesIcon className="size-4" /> */}
                  <span>
                    {graphAgentIds.length > 0
                      ? `${graphAgentIds.length} agent${graphAgentIds.length > 1 ? "s" : ""} will run this input`
                      : "Graph input"}
                  </span>
                </div>
                {sending ? (
                  <Button type="button" variant="outline" onClick={stopSending} className="h-8 rounded-full px-3">
                    Stop
                  </Button>
                ) : (
                  <Button type="submit" disabled={!input.trim()} size="icon" className="h-8 w-8 rounded-full">
                    <ArrowUpIcon className="size-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
              <span className="truncate">{attachment ? `Attached: ${attachment.name}` : "No attachment"}</span>
              <span>Each message is sent to the graph as task input.</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
