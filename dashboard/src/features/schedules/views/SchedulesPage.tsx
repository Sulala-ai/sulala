import { useEffect, useState } from "react";
import { api, type AgentSummary, type TaskItem, type Graph } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Pause, Play, MessageCircle, CalendarClock, GitBranch, ExternalLink, PlayCircle } from "lucide-react";
import { useChatNav } from "@/features/chat";
import { toast } from "sonner";
import type { PageId } from "@/components/app-sidebar";

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

export function SchedulesPage({ onNavigate }: { onNavigate?: (page: PageId) => void }) {
  const { openChatWithAgent } = useChatNav();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [graphs, setGraphs] = useState<Graph[]>([]);
  const [tasksByAgent, setTasksByAgent] = useState<Record<string, TaskItem | null>>({});
  const [tasksByGraph, setTasksByGraph] = useState<Record<string, TaskItem | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [togglingGraphId, setTogglingGraphId] = useState<string | null>(null);

  function loadAgents() {
    return api.getAgents().then((r) => setAgents(r.agents)).catch((e) => setError(e.message));
  }

  function loadGraphs() {
    return api
      .getGraphs()
      .then((r) => Promise.all(r.graphs.map((g) => api.getGraph(g.id))))
      .then((list) => setGraphs(list))
      .catch((e) => setError(e.message));
  }

  function load() {
    return Promise.all([loadAgents(), loadGraphs()]);
  }

  useEffect(() => {
    load()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
  }, []);

  // Load recent tasks for "last run" (agents and graphs with a schedule)
  useEffect(() => {
    const scheduledAgents = agents.filter((a) => a.schedule?.trim());
    const scheduledGraphs = graphs.filter((g) => g.schedule?.trim());
    if (scheduledAgents.length === 0 && scheduledGraphs.length === 0) {
      setTasksByAgent({});
      setTasksByGraph({});
      return;
    }
    api
      .getTasks({ limit: 300 })
      .then(({ tasks }) => {
        const byAgent: Record<string, TaskItem | null> = {};
        for (const a of scheduledAgents) {
          const agentTasks = tasks
            .filter((t) => t.agent_id === a.id && (t.status === "completed" || t.status === "failed"))
            .sort((x, y) => y.updated_at.localeCompare(x.updated_at));
          byAgent[a.id] = agentTasks[0] ?? null;
        }
        setTasksByAgent(byAgent);
        const byGraph: Record<string, TaskItem | null> = {};
        for (const g of scheduledGraphs) {
          const graphTasks = tasks
            .filter((t) => t.graph_id === g.id && (t.status === "completed" || t.status === "failed"))
            .sort((x, y) => y.updated_at.localeCompare(x.updated_at));
          byGraph[g.id] = graphTasks[0] ?? null;
        }
        setTasksByGraph(byGraph);
      })
      .catch(() => {
        setTasksByAgent({});
        setTasksByGraph({});
      });
  }, [agents, graphs]);

  const scheduledAgents = agents.filter((a) => a.schedule?.trim());
  const scheduledGraphs = graphs.filter((g) => g.schedule?.trim());

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
                              await loadGraphs();
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
    </div>
  );
}
