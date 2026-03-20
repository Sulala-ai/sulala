import type { AgentSummary } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MoreVertical, MessageCircle, BrainIcon, Pencil, Calendar, Play, Pause, PlayCircle, Trash2 } from "lucide-react"
import { scheduleHint } from "@/components/schedule-dialog"

type AgentActionItem = {
  id: string
  name: string
  model?: string
  avatar?: string | null
  description?: string
  schedule?: string | null
  schedule_enabled?: boolean
  schedule_input?: string | null
}

interface AgentsListCardProps {
  agents: AgentActionItem[]
  installingSystem: boolean
  editingAvatarId: string | null
  avatarSaving: boolean
  deletingId: string | null
  runJobId: string | null
  availableAvatars: string[]
  onInstallSystem: () => Promise<void>
  onOpenCreate: () => void
  onOpenChat: (agentId: string) => void
  onManageMemory?: (agentId: string) => void
  onStartEdit: (agent: AgentSummary) => void
  onEditSchedule: (agentId: string) => void
  onToggleSchedule: (agent: AgentActionItem) => Promise<void>
  onRunNow: (agent: AgentActionItem) => Promise<void>
  onDelete: (agent: AgentActionItem) => Promise<void>
  onToggleAvatarPicker: (agentId: string) => void
  onSelectAvatar: (agentId: string, filename: string) => Promise<void>
  onCancelAvatar: () => void
  avatarUrl: (filename: string | null | undefined) => string
}

export function AgentsListCard({
  agents,
  installingSystem,
  editingAvatarId,
  avatarSaving,
  deletingId,
  runJobId,
  availableAvatars,
  onInstallSystem,
  onOpenCreate,
  onOpenChat,
  onManageMemory,
  onStartEdit,
  onEditSchedule,
  onToggleSchedule,
  onRunNow,
  onDelete,
  onToggleAvatarPicker,
  onSelectAvatar,
  onCancelAvatar,
  avatarUrl,
}: AgentsListCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your agents</CardTitle>
        <CardDescription>
          {agents.length === 0
            ? "No agents yet. Install from system or add your own."
            : `${agents.length} agent${agents.length === 1 ? "" : "s"}. Edit schedule to run on a schedule.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {agents.length === 0 ? (
          <div className="py-6 space-y-4">
            <p className="text-sm text-muted-foreground text-center">Install default agents from the system, or create a custom one.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button disabled={installingSystem} onClick={onInstallSystem}>
                {installingSystem ? "Installing…" : "Install from system"}
              </Button>
              <Button variant="outline" onClick={onOpenCreate}>
                Add agent
              </Button>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {agents.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card p-4 transition-colors hover:border-border">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="relative shrink-0">
                      <img src={avatarUrl(a.avatar)} alt="" className="h-12 w-12 rounded-full object-cover border border-border" />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full p-0 text-xs"
                        title="Change avatar"
                        disabled={avatarSaving}
                        onClick={() => onToggleAvatarPicker(a.id)}
                      >
                        ✎
                      </Button>
                    </div>
                    <div>
                      <span className="font-medium">{a.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{a.id} · {a.model}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                      Schedule: {scheduleHint(a.schedule ?? undefined)}
                      {a.schedule && a.schedule_enabled === false && <span className="ml-1 text-muted-foreground/80">(paused)</span>}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onOpenChat(a.id)}>
                          <MessageCircle className="size-4" />
                          Chat
                        </DropdownMenuItem>
                        {onManageMemory ? (
                          <DropdownMenuItem onClick={() => onManageMemory(a.id)}>
                            <BrainIcon className="size-4" />
                            Manage memory
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onClick={() => onStartEdit(a as AgentSummary)}>
                          <Pencil className="size-4" />
                          Edit agent
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onEditSchedule(a.id)}>
                          <Calendar className="size-4" />
                          Edit schedule
                        </DropdownMenuItem>
                        {a.schedule && (
                          <DropdownMenuItem onClick={() => onToggleSchedule(a)}>
                            {a.schedule_enabled === false ? (
                              <>
                                <Play className="size-4" />
                                Resume schedule
                              </>
                            ) : (
                              <>
                                <Pause className="size-4" />
                                Pause schedule
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem disabled={runJobId === a.id} onClick={() => onRunNow(a)}>
                          <PlayCircle className="size-4" />
                          {runJobId === a.id ? "Running…" : "Run job now"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" disabled={deletingId === a.id} onClick={() => onDelete(a)}>
                          <Trash2 className="size-4" />
                          {deletingId === a.id ? "Deleting…" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {a.description && <span className="text-sm text-muted-foreground">{a.description}</span>}
                {(a.schedule_input ?? "") && <p className="text-xs text-muted-foreground">Scheduled task: "{a.schedule_input}"</p>}
                {editingAvatarId === a.id && (
                  <div className="mt-2 flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
                    <span className="text-xs text-muted-foreground w-full">Choose avatar</span>
                    {availableAvatars.map((filename) => (
                      <button
                        key={filename}
                        type="button"
                        onClick={() => onSelectAvatar(a.id, filename)}
                        className="h-12 w-12 rounded-full overflow-hidden border-2 border-transparent hover:border-primary focus:border-primary focus:outline-none"
                        title={filename}
                      >
                        <img src={`/media/${filename}`} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={onCancelAvatar}>
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
