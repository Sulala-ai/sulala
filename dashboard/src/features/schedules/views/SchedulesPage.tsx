import { useState } from "react";
import { api, type TaskItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Pause, Play, MessageCircle, CalendarClock, GitBranch, ExternalLink, PlayCircle, History } from "lucide-react";
import { useChatNav } from "@/features/chat";
import { toast } from "sonner";
import type { AppRouteId } from "@/core/navigation";
import { useSchedulesPage } from "@/features/schedules/hooks/useSchedulesPage";

const DEFAULT_AVATAR = "agent1.jpg";

function avatarUrl(filename: string | null | undefined): string {
  if (!filename) return `/media/${DEFAULT_AVATAR}`;
  return `/media/${filename}`;
}

/** Human-readable hint for a cron expression. */
function scheduleHint(cron: string | null | undefined): string {
  if (!cron || !cron.trim()) return "Not scheduled";
  const t = cron.trim();
  if (t === "*/10 * * * *") return "Every 10 min";
  if (t === "*/5 * * * *") return "Every 5 min";
  if (t === "0 * * * *") return "Every hour";
  if (t === "0 9 * * *") return "Daily at 9:00";
  if (t === "0 7 * * *") return "Daily at 7:00";
  if (t === "0 18 * * *") return "Daily at 18:00";
  if (/^0 \d+ \* \* \*$/.test(t)) return `Daily at ${t.split(" ")[1]}:00`;
  return t;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3600_000);
  const diffDays = Math.floor(diffMs / 86400_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "medium" });
}

/** Expandable run log row for one task in history. */
function TaskHistoryRow({ task }: { task: TaskItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasLog = Boolean(
    task.result?.output?.trim() || task.result?.error?.trim()
  );
  const statusColor =
    task.status === "completed"
      ? "text-green-600 dark:text-green-400"
      : task.status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/80 bg-muted/20 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="text-sm font-medium">{formatDateTime(task.updated_at)}</span>
        <span className={`text-sm ${statusColor}`}>
          {task.status === "running" ? "Running…" : task.status === "completed" ? "Completed" : task.status === "failed" ? "Failed" : task.status}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 space-y-2 border-t border-border/80">
          {task.input?.trim() && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Input</p>
              <pre className="text-xs bg-background/80 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
                {task.input}
              </pre>
            </div>
          )}
          {task.result?.error?.trim() && (
            <div>
              <p className="text-xs font-medium text-destructive mb-0.5">Error</p>
              <pre className="text-xs bg-destructive/10 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {task.result.error}
              </pre>
            </div>
          )}
          {task.result?.output?.trim() && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">Output</p>
              <pre className="text-xs bg-background/80 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {task.result.output}
              </pre>
            </div>
          )}
          {!hasLog && task.status !== "running" && (
            <p className="text-xs text-muted-foreground">No output captured.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function SchedulesPage({ onNavigate }: { onNavigate?: (page: AppRouteId) => void }) {
  const { openChatWithAgent } = useChatNav();
  const {
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
  } = useSchedulesPage();

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-4 text-destructive">Failed to load: {error}</div>;

  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Schedules</h1>
        <p className="text-muted-foreground text-sm">
          Agents and graphs with a cron schedule. Enable or disable runs here; edit schedules on the Agents or Graphs page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-5" />
            Scheduled agents
          </CardTitle>
          <CardDescription>
            {scheduledAgents.length === 0
              ? "No agents have a schedule. Set a schedule on the Agents page to see them here."
              : `${scheduledAgents.length} agent${scheduledAgents.length === 1 ? "" : "s"} with a schedule.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scheduledAgents.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Go to <strong>Agents</strong> → choose an agent → Edit schedule to add a cron (e.g. daily 9:00).
            </div>
          ) : (
            <ul className="space-y-3">
              {scheduledAgents.map((a) => {
                const lastTask = tasksByAgent[a.id];
                const isPaused = a.schedule_enabled === false;
                return (
                  <li
                    key={a.id}
                    className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card p-4 transition-colors hover:border-border"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={avatarUrl(a.avatar)}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-full object-cover border border-border"
                        />
                        <div>
                          <span className="font-medium">{a.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{a.id}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant={isPaused ? "default" : "secondary"}
                          disabled={togglingId === a.id}
                          onClick={async () => {
                            setTogglingId(a.id);
                            try {
                              await api.updateAgent(a.id, { schedule_enabled: !isPaused });
                              await load();
                              toast.success(isPaused ? "Schedule enabled" : "Schedule paused");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to update");
                            } finally {
                              setTogglingId(null);
                            }
                          }}
                        >
                          {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                          {isPaused ? "Enable" : "Pause"}
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          {isPaused ? "Paused" : "Enabled"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openChatWithAgent(a.id)}
                          className="gap-1"
                        >
                          <MessageCircle className="size-4" />
                          Chat
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openHistory("agent", a.id, a.name)}
                          className="gap-1"
                        >
                          <History className="size-4" />
                          Show history
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <span>
                        <strong className="text-foreground/90">Schedule:</strong> {scheduleHint(a.schedule)}
                      </span>
                      {lastTask ? (
                        <span>
                          <strong className="text-foreground/90">Last run:</strong>{" "}
                          {formatRelativeTime(lastTask.updated_at)}
                          {lastTask.status === "failed" && " (failed)"}
                        </span>
                      ) : (
                        <span>
                          <strong className="text-foreground/90">Last run:</strong> —
                        </span>
                      )}
                    </div>
                    {(a.schedule_input ?? "").trim() && (
                      <p className="text-xs text-muted-foreground">
                        Task: &quot;{a.schedule_input}&quot;
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="size-5" />
            Scheduled graphs
          </CardTitle>
          <CardDescription>
            {scheduledGraphs.length === 0
              ? "No graphs have a schedule. Set a schedule on the Graphs page to see them here."
              : `${scheduledGraphs.length} graph${scheduledGraphs.length === 1 ? "" : "s"} with a schedule.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scheduledGraphs.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Go to <strong>Graphs</strong> → choose a graph → Edit schedule to add a cron (e.g. daily 9:00).
            </div>
          ) : (
            <ul className="space-y-3">
              {scheduledGraphs.map((g) => {
                const lastTask = tasksByGraph[g.id];
                const isPaused = g.schedule_enabled === false;
                return (
                  <li
                    key={g.id}
                    className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card p-4 transition-colors hover:border-border"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                          <GitBranch className="size-6 text-muted-foreground" />
                        </div>
                        <div>
                          <span className="font-medium">Graph</span>
                          <span className="ml-2 text-xs text-muted-foreground">{g.id}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant={isPaused ? "default" : "secondary"}
                          disabled={togglingGraphId === g.id}
                          onClick={async () => {
                            setTogglingGraphId(g.id);
                            try {
                              await api.saveGraph({ ...g, schedule_enabled: !isPaused });
                              await load();
                              toast.success(isPaused ? "Schedule enabled" : "Schedule paused");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to update");
                            } finally {
                              setTogglingGraphId(null);
                            }
                          }}
                        >
                          {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                          {isPaused ? "Enable" : "Pause"}
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          {isPaused ? "Paused" : "Enabled"}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await api.enqueueGraphTask(g.id, (g.schedule_input ?? "").trim() || "Scheduled run");
                              toast.success("Run enqueued");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to enqueue");
                            }
                          }}
                          className="gap-1"
                        >
                          <PlayCircle className="size-4" />
                          Run now
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openHistory("graph", g.id, g.id)}
                          className="gap-1"
                        >
                          <History className="size-4" />
                          Show history
                        </Button>
                        {onNavigate && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onNavigate("graphs")}
                            className="gap-1"
                          >
                            <ExternalLink className="size-4" />
                            Edit
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                      <span>
                        <strong className="text-foreground/90">Schedule:</strong> {scheduleHint(g.schedule)}
                      </span>
                      {lastTask ? (
                        <span>
                          <strong className="text-foreground/90">Last run:</strong>{" "}
                          {formatRelativeTime(lastTask.updated_at)}
                          {lastTask.status === "failed" && " (failed)"}
                        </span>
                      ) : (
                        <span>
                          <strong className="text-foreground/90">Last run:</strong> —
                        </span>
                      )}
                    </div>
                    {(g.schedule_input ?? "").trim() && (
                      <p className="text-xs text-muted-foreground">
                        Task: &quot;{g.schedule_input}&quot;
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!historyFor} onOpenChange={(open) => !open && setHistoryFor(null)}>
        <SheetContent className="flex flex-col w-full sm:max-w-lg overflow-hidden">
          <SheetHeader>
            <SheetTitle>Run history — {historyFor?.name ?? ""}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-2">
            {historyLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : historyTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No runs yet.</p>
            ) : (
              historyTasks.map((task) => <TaskHistoryRow key={task.id} task={task} />)
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
