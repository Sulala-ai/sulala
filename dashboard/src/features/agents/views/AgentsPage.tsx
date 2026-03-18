import { useEffect, useState } from "react";
import { api, type AgentSummary, type SkillSummary, type CreateAgentPayload } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { X, MoreVertical, Calendar, Pause, Play, PlayCircle, Trash2, MessageCircle, Pencil, BrainIcon, FileText } from "lucide-react";
import { useChatNav } from "@/features/chat";
import type { PageId } from "@/components/app-sidebar";
import { toast } from "sonner";
import { ScheduleDialog, scheduleHint } from "@/components/schedule-dialog";
import { AI_PROVIDERS, getModelsForProvider, inferProviderFromModel, normalizeModelIdForDisplay, type AIProviderId } from "../ai-providers";

/** Fallback when avatars.json is missing or avatar is unset. */
const DEFAULT_AVATAR = "agent1.jpg";

const AVATARS_JSON_URL = "/media/avatars.json";

function avatarUrl(filename: string | null | undefined): string {
  if (!filename) return `/media/${DEFAULT_AVATAR}`;
  return `/media/${filename}`;
}

export function AgentsPage({ onNavigate }: { onNavigate?: (p: PageId) => void } = {}) {
  const { openChatWithAgent } = useChatNav();
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editingAvatarId, setEditingAvatarId] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runJobId, setRunJobId] = useState<string | null>(null);
  const [installingSystem, setInstallingSystem] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<"describe" | "form">("describe");
  const [skillsList, setSkillsList] = useState<SkillSummary[]>([]);
  const [createForm, setCreateForm] = useState<CreateAgentPayload>({ id: "", name: "", model: "gpt-4o-mini" });
  const [createProvider, setCreateProvider] = useState<AIProviderId>("openai");
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [describePrompt, setDescribePrompt] = useState("");
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editProvider, setEditProvider] = useState<AIProviderId>("openai");
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    model: string;
    personality: string;
    skills: string[];
    avatar?: string;
    schedule: string;
    schedule_input: string;
  }>({ name: "", description: "", model: "gpt-4o-mini", personality: "", skills: [], schedule: "", schedule_input: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [availableAvatars, setAvailableAvatars] = useState<string[]>([DEFAULT_AVATAR]);
  const [promptTab, setPromptTab] = useState<"identity" | "user" | "tools" | "playbook">("identity");
  const [promptContent, setPromptContent] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  /** Memory is always included for all agents; hide from picker so it is not optional. */
  const selectableSkills = skillsList.filter((s) => s.id !== "memory");

  useEffect(() => {
    fetch(AVATARS_JSON_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: string[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableAvatars(data.filter((f) => typeof f === "string"));
        }
      })
      .catch(() => {});
  }, []);

  function loadAgents() {
    return api
      .getAgents()
      .then((r) => {
        setAgents(r.agents);
        const msg = (r as { error?: string }).error;
        setError(msg ?? null);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    loadAgents().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (showCreate || editingAgentId) {
      api.getSkills().then((r) => setSkillsList(r.skills)).catch(() => setSkillsList([]));
    }
  }, [showCreate, editingAgentId]);

  const promptFilenames: Record<typeof promptTab, string> = {
    identity: "IDENTITY.md",
    user: "USER.md",
    tools: "TOOLS.md",
    playbook: "SYSTEM.md",
  };

  useEffect(() => {
    if (!editingAgentId) return;
    setPromptLoading(true);
    setPromptError(null);
    api
      .getWorkspaceFileContent(editingAgentId, promptFilenames[promptTab])
      .then(setPromptContent)
      .catch((e: unknown) => {
        setPromptError(e instanceof Error ? e.message : String(e));
        setPromptContent("");
      })
      .finally(() => setPromptLoading(false));
  }, [editingAgentId, promptTab]);

  if (loading) return <div className="p-4 text-muted-foreground">Loading agents…</div>;
  if (error) return <div className="p-4 text-destructive">Failed to load agents: {error}</div>;

  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-muted-foreground text-sm">Create and manage agents. Use Chat to run an agent with a task.</p>
        </div>
        <Button
          className="shrink-0 mt-2 sm:mt-0"
          onClick={() => {
            setShowCreate(true);
            setCreateStep("describe");
            setCreateForm({ id: "", name: "", model: "gpt-4o-mini" });
            setCreateError(null);
            setSuggestError(null);
          }}
        >
          Add agent
        </Button>
      </div>

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
                <Button
                  disabled={installingSystem}
                  onClick={async () => {
                    setInstallingSystem(true);
                    try {
                      const { installed } = await api.installSystemAgents();
                      await loadAgents();
                      toast.success(installed > 0 ? `Installed ${installed} agent${installed === 1 ? "" : "s"} from system.` : "No new agents to install (already present).");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to install from system");
                    } finally {
                      setInstallingSystem(false);
                    }
                  }}
                >
                  {installingSystem ? "Installing…" : "Install from system"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCreate(true);
                    setCreateStep("describe");
                    setCreateForm({ id: "", name: "", model: "gpt-4o-mini" });
                    setCreateError(null);
                    setSuggestError(null);
                  }}
                >
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
                      <img
                        src={avatarUrl(a.avatar)}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover border border-border"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full p-0 text-xs"
                        title="Change avatar"
                        disabled={avatarSaving}
                        onClick={() =>
                          setEditingAvatarId((prev) => (prev === a.id ? null : a.id))
                        }
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
                      {a.schedule && a.schedule_enabled === false && (
                        <span className="ml-1 text-muted-foreground/80">(paused)</span>
                      )}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="size-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => openChatWithAgent(a.id)}
                        >
                          <MessageCircle className="size-4" />
                          Chat
                        </DropdownMenuItem>
                        {onNavigate && (
                          <DropdownMenuItem
                            onClick={() => {
                              try {
                                sessionStorage.setItem("memoryFilterAgentId", a.id);
                              } catch {
                                /* ignore */
                              }
                              onNavigate("memory");
                            }}
                          >
                            <BrainIcon className="size-4" />
                            Manage memory
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingAgentId(a.id);
                            const rawModel = a.model ?? "gpt-4o-mini";
                            const model = normalizeModelIdForDisplay(rawModel);
                            setEditForm({
                              name: a.name ?? "",
                              description: a.description ?? "",
                              model,
                              personality: a.personality ?? "",
                              skills: a.skills ?? [],
                              avatar: a.avatar ?? undefined,
                              schedule: a.schedule ?? "",
                              schedule_input: a.schedule_input ?? "",
                            });
                            setEditProvider(inferProviderFromModel(rawModel));
                            setEditError(null);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit agent
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingScheduleId(a.id);
                          }}
                        >
                          <Calendar className="size-4" />
                          Edit schedule
                        </DropdownMenuItem>
                        {a.schedule && (
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                await api.updateAgent(a.id, {
                                  schedule_enabled: a.schedule_enabled === false,
                                });
                                await loadAgents();
                                toast.success(a.schedule_enabled === false ? "Schedule resumed" : "Schedule paused");
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Failed to update");
                              }
                            }}
                          >
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
                        <DropdownMenuItem
                          disabled={runJobId === a.id}
                          onClick={async () => {
                            setRunJobId(a.id);
                            try {
                              await api.enqueueTask(a.id, (a.schedule_input ?? "").trim() || "Scheduled run");
                              toast.success("Job queued");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to run job");
                            } finally {
                              setRunJobId(null);
                            }
                          }}
                        >
                          <PlayCircle className="size-4" />
                          {runJobId === a.id ? "Running…" : "Run job now"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={deletingId === a.id}
                          onClick={async () => {
                            if (!confirm(`Delete agent "${a.name}"? This cannot be undone.`)) return;
                            setDeletingId(a.id);
                            const agentIdToRemove = a.id;
                            try {
                              await api.deleteAgent(agentIdToRemove);
                              setAgents((prev) => prev.filter((x) => x.id !== agentIdToRemove));
                              toast.success("Agent deleted");
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Failed to delete agent");
                            } finally {
                              setDeletingId(null);
                            }
                          }}
                        >
                          <Trash2 className="size-4" />
                          {deletingId === a.id ? "Deleting…" : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {a.description && <span className="text-sm text-muted-foreground">{a.description}</span>}
                {(a.schedule_input ?? "") && (
                  <p className="text-xs text-muted-foreground">Scheduled task: "{a.schedule_input}"</p>
                )}
                {editingAvatarId === a.id && (
                  <div className="mt-2 flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
                    <span className="text-xs text-muted-foreground w-full">Choose avatar</span>
                    {availableAvatars.map((filename) => (
                      <button
                        key={filename}
                        type="button"
                        onClick={async () => {
                          setAvatarSaving(true);
                          try {
                            await api.updateAgent(a.id, { avatar: filename });
                            setEditingAvatarId(null);
                            await loadAgents();
                          } finally {
                            setAvatarSaving(false);
                          }
                        }}
                        className="h-12 w-12 rounded-full overflow-hidden border-2 border-transparent hover:border-primary focus:border-primary focus:outline-none"
                        title={filename}
                      >
                        <img src={`/media/${filename}`} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setEditingAvatarId(null)}>
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

      {editingScheduleId && (() => {
        const agent = agents.find((x) => x.id === editingScheduleId);
        return agent ? (
          <ScheduleDialog
            open={true}
            onOpenChange={(open) => !open && setEditingScheduleId(null)}
            schedule={agent.schedule}
            scheduleInput={agent.schedule_input}
            scheduleReportTargets={agent.schedule_report_targets ?? undefined}
            title="Edit schedule"
            onSave={async (payload) => {
              await api.updateAgent(editingScheduleId, {
                schedule: payload.schedule,
                schedule_input: payload.schedule_input,
                schedule_report_targets: payload.schedule_report_targets ?? null,
              });
              await loadAgents();
            }}
          />
        ) : null;
      })()}

      {/* Create agent modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-agent-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setShowCreate(false);
              setCreateError(null);
              setSuggestError(null);
            }}
          />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 id="create-agent-title" className="text-lg font-semibold">Create agent</h2>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
                  setSuggestError(null);
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Describe what you want, or add an agent manually by choosing skills.</p>
            <div className="space-y-4">
              {createStep === "describe" ? (
                <>
                  <div>
                    <Label>Describe your agent (optional)</Label>
                    <p className="text-xs text-muted-foreground mb-1">e.g. &quot;News reporter that gives me daily trending news every day at 9 am&quot;</p>
                    <textarea
                      className="flex min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                      placeholder="Describe the agent you want…"
                      value={describePrompt}
                      onChange={(e) => setDescribePrompt(e.target.value)}
                      rows={3}
                    />
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="default"
                        disabled={suggestLoading || !describePrompt.trim()}
                        onClick={async () => {
                          setSuggestLoading(true);
                          setSuggestError(null);
                          try {
                            const { suggestion } = await api.suggestAgent(describePrompt);
                            setCreateForm({
                              id: suggestion.id,
                              name: suggestion.name,
                              model: "gpt-4o-mini",
                              description: suggestion.description || undefined,
                              skills: suggestion.skills?.length ? suggestion.skills : undefined,
                              schedule: suggestion.schedule || undefined,
                              schedule_input: suggestion.schedule_input || undefined,
                            });
                            setCreateProvider("openai");
                            setCreateStep("form");
                            setDescribePrompt("");
                          } catch (e) {
                            setSuggestError(e instanceof Error ? e.message : String(e));
                          } finally {
                            setSuggestLoading(false);
                          }
                        }}
                      >
                        {suggestLoading ? "Analyzing…" : "Suggest"}
                      </Button>
                    </div>
                    {suggestError && <p className="mt-1 text-sm text-destructive">{suggestError}</p>}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>or</span>
                  </div>
                  <Button variant="outline" onClick={() => setCreateStep("form")}>
                    New agent (choose yourself)
                  </Button>
                </>
              ) : (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label>Id (unique)</Label>
                      <Input
                        placeholder="e.g. my_assistant (letters, numbers, _ - .)"
                        value={createForm.id}
                        onChange={(e) =>
                          setCreateForm((f) => ({
                            ...f,
                            id: e.target.value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "_"),
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Name</Label>
                      <Input
                        placeholder="e.g. My Assistant"
                        value={createForm.name}
                        onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>AI provider</Label>
                    <select
                      value={createProvider}
                      onChange={(e) => {
                        const p = e.target.value as AIProviderId;
                        setCreateProvider(p);
                        if (p !== "custom") {
                          const models = getModelsForProvider(p);
                          setCreateForm((f) => ({ ...f, model: models[0]?.id ?? f.model }));
                        }
                      }}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      {AI_PROVIDERS.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.label}
                        </option>
                      ))}
                    </select>
                    {AI_PROVIDERS.find((p) => p.id === createProvider)?.hint && (
                      <p className="text-xs text-muted-foreground mt-1">{AI_PROVIDERS.find((p) => p.id === createProvider)?.hint}</p>
                    )}
                  </div>
                  <div>
                    <Label>Model</Label>
                    {createProvider === "custom" ? (
                      <Input
                        placeholder="e.g. gpt-4o-mini or openai/gpt-4o"
                        value={createForm.model}
                        onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))}
                        className="mt-1"
                      />
                    ) : (
                      <select
                        value={createForm.model}
                        onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))}
                        className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                      >
                        {getModelsForProvider(createProvider).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <Label>Description (optional)</Label>
                    <Input
                      placeholder="What this agent does"
                      value={createForm.description ?? ""}
                      onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <Label>Personality (optional)</Label>
                    <Input
                      placeholder="e.g. Friendly, supportive"
                      value={createForm.personality ?? ""}
                      onChange={(e) => setCreateForm((f) => ({ ...f, personality: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <Label>Avatar (optional)</Label>
                    <p className="text-xs text-muted-foreground mb-1">Pick one or leave blank for a random avatar.</p>
                    <div className="flex flex-wrap gap-2">
                      {availableAvatars.map((filename) => (
                        <button
                          key={filename}
                          type="button"
                          onClick={() =>
                            setCreateForm((f) => ({
                              ...f,
                              avatar: f.avatar === filename ? undefined : filename,
                            }))
                          }
                          className={`h-10 w-10 rounded-full overflow-hidden border-2 focus:outline-none ${
                            createForm.avatar === filename ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-muted-foreground"
                          }`}
                          title={filename}
                        >
                          <img src={`/media/${filename}`} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Skills (optional)</Label>
                    <p className="text-xs text-muted-foreground mb-1">Pick installed skills. Each skill adds its own tools to the agent. Memory is included for all agents.</p>
                    <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                      <button
                        type="button"
                        className="underline hover:text-primary"
                        onClick={() => {
                          const allIds = selectableSkills.map((s) => s.id);
                          setCreateForm((f) => ({ ...f, skills: allIds.length ? allIds : undefined }));
                        }}
                      >
                        Select all skills
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        className="underline hover:text-primary"
                        onClick={() => {
                          setCreateForm((f) => ({ ...f, skills: undefined }));
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectableSkills.map((s) => (
                        <label key={s.id} className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            checked={(createForm.skills ?? []).includes(s.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...(createForm.skills ?? []), s.id]
                                : (createForm.skills ?? []).filter((x) => x !== s.id);
                              setCreateForm((f) => ({ ...f, skills: next.length ? next : undefined }));
                            }}
                            className="rounded border-input"
                          />
                          {s.name}
                        </label>
                      ))}
                      {selectableSkills.length === 0 && <span className="text-sm text-muted-foreground">No optional skills installed.</span>}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label>Schedule (optional)</Label>
                      <Input
                        placeholder="e.g. 0 9 * * * (daily 9am)"
                        value={createForm.schedule ?? ""}
                        onChange={(e) => setCreateForm((f) => ({ ...f, schedule: e.target.value || undefined }))}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div>
                      <Label>Scheduled task (optional)</Label>
                      <Input
                        placeholder="Task to run on schedule"
                        value={createForm.schedule_input ?? ""}
                        onChange={(e) => setCreateForm((f) => ({ ...f, schedule_input: e.target.value || undefined }))}
                      />
                    </div>
                  </div>
                  {createError && <p className="text-sm text-destructive">{createError}</p>}
                  <div className="flex gap-2 pt-2">
                    <Button
                      disabled={createSaving || !createForm.id || !createForm.name || !createForm.model}
                      onClick={async () => {
                        setCreateSaving(true);
                        setCreateError(null);
                        try {
                          await api.createAgent(createForm);
                          setShowCreate(false);
                          setCreateForm({ id: "", name: "", model: "gpt-4o-mini" });
                          setCreateProvider("openai");
                          await loadAgents();
                        } catch (e) {
                          setCreateError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setCreateSaving(false);
                        }
                      }}
                    >
                      {createSaving ? "Creating…" : "Create"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowCreate(false);
                        setCreateError(null);
                        setSuggestError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit agent modal */}
      {editingAgentId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-agent-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              setEditingAgentId(null);
              setEditError(null);
            }}
          />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h2 id="edit-agent-title" className="text-lg font-semibold">Edit agent</h2>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8"
                onClick={() => {
                  setEditingAgentId(null);
                  setEditError(null);
                }}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              <div>
                <Label>Id (read-only)</Label>
                <Input value={editingAgentId} readOnly className="mt-1 bg-muted font-mono text-sm" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Name</Label>
                  <Input
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. My Assistant"
                  />
                </div>
                <div>
                  <Label>AI provider</Label>
                  <select
                    value={editProvider}
                    onChange={(e) => {
                      const p = e.target.value as AIProviderId;
                      setEditProvider(p);
                      if (p !== "custom") {
                        const models = getModelsForProvider(p);
                        setEditForm((f) => ({ ...f, model: models[0]?.id ?? f.model }));
                      }
                    }}
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  >
                    {AI_PROVIDERS.map((pr) => (
                      <option key={pr.id} value={pr.id}>
                        {pr.label}
                      </option>
                    ))}
                  </select>
                  {AI_PROVIDERS.find((p) => p.id === editProvider)?.hint && (
                    <p className="text-xs text-muted-foreground mt-1">{AI_PROVIDERS.find((p) => p.id === editProvider)?.hint}</p>
                  )}
                </div>
                <div>
                  <Label>Model</Label>
                  {editProvider === "custom" ? (
                    <Input
                      value={editForm.model}
                      onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))}
                      placeholder="e.g. gpt-4o-mini"
                      className="mt-1"
                    />
                  ) : (
                    <select
                      value={editForm.model}
                      onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      {getModelsForProvider(editProvider).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What this agent does"
                />
              </div>
              <div>
                <Label>Personality (optional)</Label>
                <Input
                  value={editForm.personality}
                  onChange={(e) => setEditForm((f) => ({ ...f, personality: e.target.value }))}
                  placeholder="e.g. Friendly, supportive"
                />
              </div>
              <div>
                <Label>Avatar (optional)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {availableAvatars.map((filename) => (
                    <button
                      key={filename}
                      type="button"
                      onClick={() =>
                        setEditForm((f) => ({
                          ...f,
                          avatar: f.avatar === filename ? undefined : filename,
                        }))
                      }
                      className={`h-10 w-10 rounded-full overflow-hidden border-2 focus:outline-none ${
                        editForm.avatar === filename ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-muted-foreground"
                      }`}
                      title={filename}
                    >
                      <img src={`/media/${filename}`} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Skills (optional)</Label>
                <p className="text-xs text-muted-foreground mb-1">Pick installed skills. Memory is included for all agents.</p>
                <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                  <button
                    type="button"
                    className="underline hover:text-primary"
                    onClick={() => {
                      const allIds = selectableSkills.map((s) => s.id);
                      setEditForm((f) => ({ ...f, skills: allIds }));
                    }}
                  >
                    Select all skills
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    className="underline hover:text-primary"
                    onClick={() => {
                      setEditForm((f) => ({ ...f, skills: [] }));
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectableSkills.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={(editForm.skills ?? []).includes(s.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...(editForm.skills ?? []), s.id]
                            : (editForm.skills ?? []).filter((x) => x !== s.id);
                          setEditForm((f) => ({ ...f, skills: next }));
                        }}
                        className="rounded border-input"
                      />
                      {s.name}
                    </label>
                  ))}
                  {selectableSkills.length === 0 && <span className="text-sm text-muted-foreground">No optional skills installed.</span>}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <Label>Schedule (optional)</Label>
                  <Input
                    placeholder="e.g. 0 9 * * * (daily 9am)"
                    value={editForm.schedule}
                    onChange={(e) => setEditForm((f) => ({ ...f, schedule: e.target.value }))}
                    className="font-mono text-sm"
                  />
                </div>
                <div>
                  <Label>Scheduled task (optional)</Label>
                  <Input
                    placeholder="Task to run on schedule"
                    value={editForm.schedule_input}
                    onChange={(e) => setEditForm((f) => ({ ...f, schedule_input: e.target.value }))}
                  />
                </div>
              </div>
              <div className="border-t pt-4 mt-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Workspace prompt (Identity, User, Tools, Playbook)
                </div>
                <p className="text-xs text-muted-foreground">
                  These files are used in the agent&apos;s system prompt. Edit below; they are stored in the agent&apos;s workspace.
                </p>
                <div className="flex flex-wrap gap-1">
                  {(["identity", "user", "tools", "playbook"] as const).map((tab) => (
                    <Button
                      key={tab}
                      type="button"
                      variant={promptTab === tab ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setPromptTab(tab)}
                    >
                      {tab === "identity" ? "Identity" : tab === "user" ? "User" : tab === "tools" ? "Tools" : "Playbook"}
                    </Button>
                  ))}
                </div>
                {promptLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <>
                    <textarea
                      className="flex min-h-[140px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono"
                      value={promptContent}
                      onChange={(e) => setPromptContent(e.target.value)}
                      placeholder={`${promptFilenames[promptTab]} content…`}
                      spellCheck={false}
                      rows={8}
                    />
                    {promptError && <p className="text-sm text-destructive">{promptError}</p>}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={promptSaving}
                      onClick={async () => {
                        setPromptSaving(true);
                        setPromptError(null);
                        try {
                          await api.putWorkspaceFile(editingAgentId!, promptFilenames[promptTab], promptContent);
                          toast.success(`Saved ${promptFilenames[promptTab]}`);
                        } catch (e) {
                          setPromptError(e instanceof Error ? e.message : String(e));
                        } finally {
                          setPromptSaving(false);
                        }
                      }}
                    >
                      {promptSaving ? "Saving…" : `Save ${promptFilenames[promptTab]}`}
                    </Button>
                  </>
                )}
              </div>
              {editError && <p className="text-sm text-destructive">{editError}</p>}
              <div className="flex gap-2 pt-2">
                <Button
                  disabled={editSaving || !editForm.name.trim() || !editForm.model.trim()}
                  onClick={async () => {
                    setEditSaving(true);
                    setEditError(null);
                    try {
                      await api.updateAgent(editingAgentId, {
                        name: editForm.name.trim() || null,
                        description: editForm.description.trim() || null,
                        model: editForm.model.trim() || null,
                        personality: editForm.personality.trim() || null,
                        skills: editForm.skills.length ? editForm.skills : null,
                        avatar: editForm.avatar ?? null,
                        schedule: editForm.schedule.trim() || null,
                        schedule_input: editForm.schedule_input.trim() || null,
                      });
                      setEditingAgentId(null);
                      await loadAgents();
                      toast.success("Agent updated");
                    } catch (e) {
                      setEditError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setEditSaving(false);
                    }
                  }}
                >
                  {editSaving ? "Saving…" : "Save"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditingAgentId(null);
                    setEditError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
