import { useEffect, useMemo } from "react"
import { api, type CreateAgentPayload, type SkillSummary } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"
import { AI_PROVIDERS, filterOllamaModelsForAgentSkills, getModelsForProvider, type AIProviderId } from "../ai-providers"
import { useOllamaModels } from "../hooks/useOllamaModels"

interface CreateAgentModalProps {
  open: boolean
  onClose: () => void
  createStep: "describe" | "form"
  setCreateStep: (step: "describe" | "form") => void
  describePrompt: string
  setDescribePrompt: (value: string) => void
  suggestLoading: boolean
  setSuggestLoading: (value: boolean) => void
  suggestError: string | null
  setSuggestError: (value: string | null) => void
  createForm: CreateAgentPayload
  setCreateForm: React.Dispatch<React.SetStateAction<CreateAgentPayload>>
  createProvider: AIProviderId
  setCreateProvider: (value: AIProviderId) => void
  createSaving: boolean
  createError: string | null
  selectableSkills: SkillSummary[]
  availableAvatars: string[]
  onCreate: () => Promise<void>
}

export function CreateAgentModal({
  open,
  onClose,
  createStep,
  setCreateStep,
  describePrompt,
  setDescribePrompt,
  suggestLoading,
  setSuggestLoading,
  suggestError,
  setSuggestError,
  createForm,
  setCreateForm,
  createProvider,
  setCreateProvider,
  createSaving,
  createError,
  selectableSkills,
  availableAvatars,
  onCreate,
}: CreateAgentModalProps) {
  const ollamaModels = useOllamaModels(open && createProvider === "ollama")
  const hasSkills = (createForm.skills?.length ?? 0) > 0

  const modelList = useMemo(() => {
    if (createProvider === "ollama") {
      return filterOllamaModelsForAgentSkills(ollamaModels.options, hasSkills)
    }
    return getModelsForProvider(createProvider)
  }, [createProvider, ollamaModels.options, hasSkills])

  useEffect(() => {
    if (createProvider !== "ollama" || !modelList.length) return
    if (!modelList.some((o) => o.id === createForm.model)) {
      setCreateForm((f) => ({ ...f, model: modelList[0]!.id }))
    }
  }, [createProvider, modelList, createForm.model, setCreateForm])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-agent-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 id="create-agent-title" className="text-lg font-semibold">Create agent</h2>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onClose} aria-label="Close">
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
                      setSuggestLoading(true)
                      setSuggestError(null)
                      try {
                        const { suggestion } = await api.suggestAgent(describePrompt)
                        const settings = await api.getSettings()
                        const hasCloud =
                          Boolean(settings.has_openai_key) ||
                          Boolean(settings.has_anthropic_key) ||
                          Boolean(settings.has_google_key) ||
                          Boolean(settings.has_openrouter_key)
                        const useOllama = settings.ollama_enabled === true && !hasCloud
                        const tag = (settings.ollama_default_model || "qwen3").replace(/^ollama\//, "")
                        const defaultModel = useOllama ? `ollama/${tag}` : "gpt-4o-mini"
                        setCreateForm({
                          id: suggestion.id,
                          name: suggestion.name,
                          model: defaultModel,
                          description: suggestion.description || undefined,
                          skills: suggestion.skills?.length ? suggestion.skills : undefined,
                          schedule: suggestion.schedule || undefined,
                          schedule_input: suggestion.schedule_input || undefined,
                        })
                        setCreateProvider(useOllama ? "ollama" : "openai")
                        setCreateStep("form")
                        setDescribePrompt("")
                      } catch (e) {
                        setSuggestError(e instanceof Error ? e.message : String(e))
                      } finally {
                        setSuggestLoading(false)
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
                    onChange={(e) => setCreateForm((f) => ({ ...f, id: e.target.value.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_.-]/g, "_") }))}
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input placeholder="e.g. My Assistant" value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>AI provider</Label>
                <select
                  value={createProvider}
                  onChange={(e) => {
                    const p = e.target.value as AIProviderId
                    setCreateProvider(p)
                    if (p !== "custom" && p !== "ollama") {
                      const models = getModelsForProvider(p)
                      setCreateForm((f) => ({ ...f, model: models[0]?.id ?? f.model }))
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
              </div>
              <div>
                <Label>Model</Label>
                {createProvider === "custom" ? (
                  <Input placeholder="e.g. gpt-4o-mini or openai/gpt-4o" value={createForm.model} onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))} className="mt-1" />
                ) : (
                  <>
                    {createProvider === "ollama" && ollamaModels.loading && (
                      <p className="text-xs text-muted-foreground mt-1">Loading local models…</p>
                    )}
                    {createProvider === "ollama" && ollamaModels.error && !ollamaModels.loading && (
                      <p className="text-xs text-destructive mt-1">{ollamaModels.error}</p>
                    )}
                    <select
                      value={createForm.model}
                      onChange={(e) => setCreateForm((f) => ({ ...f, model: e.target.value }))}
                      disabled={createProvider === "ollama" && ollamaModels.loading && modelList.length === 0}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      {modelList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                      {createForm.model && !modelList.some((m) => m.id === createForm.model) && (
                        <option value={createForm.model}>{createForm.model}</option>
                      )}
                    </select>
                    {createProvider === "ollama" && hasSkills && (
                      <p className="text-xs text-muted-foreground mt-1">
                        With skills, only models that support tool use are listed. Remove all skills to pick any installed model.
                      </p>
                    )}
                    {createProvider === "ollama" && hasSkills && !ollamaModels.loading && ollamaModels.options.length > 0 && modelList.length === 0 && (
                      <p className="text-xs text-destructive mt-1">
                        No installed model reports tool support. Remove skills or pull a model that supports tools (e.g. qwen3.5, llama3.2), then refresh.
                      </p>
                    )}
                  </>
                )}
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input placeholder="What this agent does" value={createForm.description ?? ""} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value || undefined }))} />
              </div>
              <div>
                <Label>Personality (optional)</Label>
                <Input placeholder="e.g. Friendly, supportive" value={createForm.personality ?? ""} onChange={(e) => setCreateForm((f) => ({ ...f, personality: e.target.value || undefined }))} />
              </div>
              <div>
                <Label>Avatar (optional)</Label>
                <p className="text-xs text-muted-foreground mb-1">Pick one or leave blank for a random avatar.</p>
                <div className="flex flex-wrap gap-2">
                  {availableAvatars.map((filename) => (
                    <button
                      key={filename}
                      type="button"
                      onClick={() => setCreateForm((f) => ({ ...f, avatar: f.avatar === filename ? undefined : filename }))}
                      className={`h-10 w-10 rounded-full overflow-hidden border-2 focus:outline-none ${createForm.avatar === filename ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-muted-foreground"}`}
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
                  <button type="button" className="underline hover:text-primary" onClick={() => {
                    const allIds = selectableSkills.map((s) => s.id)
                    setCreateForm((f) => ({ ...f, skills: allIds.length ? allIds : undefined }))
                  }}>Select all skills</button>
                  <span>·</span>
                  <button type="button" className="underline hover:text-primary" onClick={() => setCreateForm((f) => ({ ...f, skills: undefined }))}>Clear</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectableSkills.map((s) => (
                    <label key={s.id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={(createForm.skills ?? []).includes(s.id)}
                        onChange={(e) => {
                          const next = e.target.checked ? [...(createForm.skills ?? []), s.id] : (createForm.skills ?? []).filter((x) => x !== s.id)
                          setCreateForm((f) => ({ ...f, skills: next.length ? next : undefined }))
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
                  <Input placeholder="e.g. 0 9 * * * (daily 9am)" value={createForm.schedule ?? ""} onChange={(e) => setCreateForm((f) => ({ ...f, schedule: e.target.value || undefined }))} className="font-mono text-sm" />
                </div>
                <div>
                  <Label>Scheduled task (optional)</Label>
                  <Input placeholder="Task to run on schedule" value={createForm.schedule_input ?? ""} onChange={(e) => setCreateForm((f) => ({ ...f, schedule_input: e.target.value || undefined }))} />
                </div>
              </div>
              {createError && <p className="text-sm text-destructive">{createError}</p>}
              <div className="flex gap-2 pt-2">
                <Button
                  disabled={
                    createSaving ||
                    !createForm.id ||
                    !createForm.name ||
                    !createForm.model ||
                    (createProvider === "ollama" && hasSkills && modelList.length === 0)
                  }
                  onClick={onCreate}
                >
                  {createSaving ? "Creating…" : "Create"}
                </Button>
                <Button variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
