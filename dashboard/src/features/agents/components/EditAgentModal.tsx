import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X, FileText } from "lucide-react"
import { AI_PROVIDERS, getModelsForProvider, type AIProviderId } from "../ai-providers"

interface EditAgentModalProps {
  open: boolean
  editingAgentId: string | null
  onClose: () => void
  editProvider: AIProviderId
  setEditProvider: (provider: AIProviderId) => void
  editForm: {
    name: string
    description: string
    model: string
    personality: string
    skills: string[]
    avatar: string | undefined
    schedule: string
    schedule_input: string
  }
  setEditForm: React.Dispatch<
    React.SetStateAction<{
      name: string
      description: string
      model: string
      personality: string
      skills: string[]
      avatar: string | undefined
      schedule: string
      schedule_input: string
    }>
  >
  selectableSkills: Array<{ id: string; name: string }>
  availableAvatars: string[]
  promptTab: "identity" | "user" | "tools" | "playbook"
  setPromptTab: (tab: "identity" | "user" | "tools" | "playbook") => void
  promptLoading: boolean
  promptContent: string
  setPromptContent: (content: string) => void
  promptError: string | null
  promptSaving: boolean
  promptFilenames: Record<"identity" | "user" | "tools" | "playbook", string>
  savePromptFile: (agentId: string, filename: string, content: string) => Promise<void>
  onPromptSaved: (filename: string) => void
  editError: string | null
  editSaving: boolean
  saveEditedAgent: () => Promise<void>
  onAgentSaved: () => void
}

export function EditAgentModal({
  open,
  editingAgentId,
  onClose,
  editProvider,
  setEditProvider,
  editForm,
  setEditForm,
  selectableSkills,
  availableAvatars,
  promptTab,
  setPromptTab,
  promptLoading,
  promptContent,
  setPromptContent,
  promptError,
  promptSaving,
  promptFilenames,
  savePromptFile,
  onPromptSaved,
  editError,
  editSaving,
  saveEditedAgent,
  onAgentSaved,
}: EditAgentModalProps) {
  if (!open || !editingAgentId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-agent-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 id="edit-agent-title" className="text-lg font-semibold">Edit agent</h2>
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={onClose} aria-label="Close">
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
              <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. My Assistant" />
            </div>
            <div>
              <Label>AI provider</Label>
              <select
                value={editProvider}
                onChange={(e) => {
                  const p = e.target.value as AIProviderId
                  setEditProvider(p)
                  if (p !== "custom") {
                    const models = getModelsForProvider(p)
                    setEditForm((f) => ({ ...f, model: models[0]?.id ?? f.model }))
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
              {editProvider === "custom" ? (
                <Input value={editForm.model} onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value }))} placeholder="e.g. gpt-4o-mini" className="mt-1" />
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
            <Input value={editForm.description} onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))} placeholder="What this agent does" />
          </div>
          <div>
            <Label>Personality (optional)</Label>
            <Input value={editForm.personality} onChange={(e) => setEditForm((f) => ({ ...f, personality: e.target.value }))} placeholder="e.g. Friendly, supportive" />
          </div>
          <div>
            <Label>Avatar (optional)</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {availableAvatars.map((filename) => (
                <button
                  key={filename}
                  type="button"
                  onClick={() => setEditForm((f) => ({ ...f, avatar: f.avatar === filename ? undefined : filename }))}
                  className={`h-10 w-10 rounded-full overflow-hidden border-2 focus:outline-none ${editForm.avatar === filename ? "border-primary ring-1 ring-primary" : "border-transparent hover:border-muted-foreground"}`}
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
              <button type="button" className="underline hover:text-primary" onClick={() => {
                const allIds = selectableSkills.map((s) => s.id)
                setEditForm((f) => ({ ...f, skills: allIds }))
              }}>Select all skills</button>
              <span>·</span>
              <button type="button" className="underline hover:text-primary" onClick={() => setEditForm((f) => ({ ...f, skills: [] }))}>Clear</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectableSkills.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={(editForm.skills ?? []).includes(s.id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...(editForm.skills ?? []), s.id] : (editForm.skills ?? []).filter((x) => x !== s.id)
                      setEditForm((f) => ({ ...f, skills: next }))
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
              <Input placeholder="e.g. 0 9 * * * (daily 9am)" value={editForm.schedule} onChange={(e) => setEditForm((f) => ({ ...f, schedule: e.target.value }))} className="font-mono text-sm" />
            </div>
            <div>
              <Label>Scheduled task (optional)</Label>
              <Input placeholder="Task to run on schedule" value={editForm.schedule_input} onChange={(e) => setEditForm((f) => ({ ...f, schedule_input: e.target.value }))} />
            </div>
          </div>
          <div className="border-t pt-4 mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Workspace prompt (Identity, User, Tools, Playbook)
            </div>
            <p className="text-xs text-muted-foreground">These files are used in the agent&apos;s system prompt. Edit below; they are stored in the agent&apos;s workspace.</p>
            <div className="flex flex-wrap gap-1">
              {(["identity", "user", "tools", "playbook"] as const).map((tab) => (
                <Button key={tab} type="button" variant={promptTab === tab ? "secondary" : "ghost"} size="sm" onClick={() => setPromptTab(tab)}>
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
                    try {
                      await savePromptFile(editingAgentId, promptFilenames[promptTab], promptContent)
                      onPromptSaved(promptFilenames[promptTab])
                    } catch {}
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
                try {
                  await saveEditedAgent()
                  onAgentSaved()
                } catch {}
              }}
            >
              {editSaving ? "Saving…" : "Save"}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
