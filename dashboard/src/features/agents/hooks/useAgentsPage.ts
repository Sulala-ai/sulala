import { useEffect, useState } from "react"
import { api, type AgentSummary, type CreateAgentPayload, type SkillSummary, type ScheduleReportTarget } from "@/lib/api"
import { type AIProviderId } from "../ai-providers"
import { inferProviderFromModel, normalizeModelIdForDisplay } from "../ai-providers"

const DEFAULT_AVATAR = "agent1.jpg"
const AVATARS_JSON_URL = "/media/avatars.json"

export type PromptTab = "identity" | "user" | "tools" | "playbook"

export const PROMPT_FILENAMES: Record<PromptTab, string> = {
  identity: "IDENTITY.md",
  user: "USER.md",
  tools: "TOOLS.md",
  playbook: "SYSTEM.md",
}

export function useAgentsPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [editingAvatarId, setEditingAvatarId] = useState<string | null>(null)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [runJobId, setRunJobId] = useState<string | null>(null)
  const [installingSystem, setInstallingSystem] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createStep, setCreateStep] = useState<"describe" | "form">("describe")
  const [skillsList, setSkillsList] = useState<SkillSummary[]>([])
  const [createForm, setCreateForm] = useState<CreateAgentPayload>({ id: "", name: "", model: "gpt-4o-mini" })
  const [createProvider, setCreateProvider] = useState<AIProviderId>("openai")
  const [createSaving, setCreateSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [describePrompt, setDescribePrompt] = useState("")
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestError, setSuggestError] = useState<string | null>(null)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editProvider, setEditProvider] = useState<AIProviderId>("openai")
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    model: "gpt-4o-mini",
    personality: "",
    skills: [] as string[],
    avatar: undefined as string | undefined,
    schedule: "",
    schedule_input: "",
  })
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [availableAvatars, setAvailableAvatars] = useState<string[]>([DEFAULT_AVATAR])
  const [promptTab, setPromptTab] = useState<PromptTab>("identity")
  const [promptContent, setPromptContent] = useState("")
  const [promptLoading, setPromptLoading] = useState(false)
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)

  useEffect(() => {
    fetch(AVATARS_JSON_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: string[] | null) => {
        if (Array.isArray(data) && data.length > 0) {
          setAvailableAvatars(data.filter((f) => typeof f === "string"))
        }
      })
      .catch(() => {})
  }, [])

  function loadAgents() {
    return api
      .getAgents()
      .then((r) => {
        setAgents(r.agents)
        const msg = (r as { error?: string }).error
        setError(msg ?? null)
      })
      .catch((e) => setError(e.message))
  }

  async function installFromSystem() {
    setInstallingSystem(true)
    try {
      const result = await api.installSystemAgents()
      await loadAgents()
      return result
    } finally {
      setInstallingSystem(false)
    }
  }

  async function toggleAgentSchedule(agentId: string, enabled: boolean) {
    await api.updateAgent(agentId, { schedule_enabled: enabled })
    await loadAgents()
  }

  async function runAgentNow(agentId: string, input: string) {
    setRunJobId(agentId)
    try {
      await api.enqueueTask(agentId, input.trim() || "Scheduled run")
    } finally {
      setRunJobId(null)
    }
  }

  async function deleteAgentById(agentId: string) {
    setDeletingId(agentId)
    try {
      await api.deleteAgent(agentId)
      setAgents((prev) => prev.filter((x) => x.id !== agentId))
    } finally {
      setDeletingId(null)
    }
  }

  async function updateAgentAvatar(agentId: string, avatar: string) {
    setAvatarSaving(true)
    try {
      await api.updateAgent(agentId, { avatar })
      setEditingAvatarId(null)
      await loadAgents()
    } finally {
      setAvatarSaving(false)
    }
  }

  async function saveAgentSchedule(
    agentId: string,
    payload: { schedule: string | null; schedule_input: string | null; schedule_report_targets?: ScheduleReportTarget[] | null },
  ) {
    await api.updateAgent(agentId, {
      schedule: payload.schedule,
      schedule_input: payload.schedule_input,
      schedule_report_targets: payload.schedule_report_targets ?? null,
    })
    await loadAgents()
  }

  async function savePromptFile(agentId: string, filename: string, content: string) {
    setPromptSaving(true)
    setPromptError(null)
    try {
      await api.putWorkspaceFile(agentId, filename, content)
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setPromptSaving(false)
    }
  }

  async function createAgentFromForm() {
    setCreateSaving(true)
    setCreateError(null)
    try {
      await api.createAgent(createForm)
      setShowCreate(false)
      setCreateForm({ id: "", name: "", model: "gpt-4o-mini" })
      setCreateProvider("openai")
      await loadAgents()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setCreateSaving(false)
    }
  }

  async function saveEditedAgent() {
    if (!editingAgentId) return
    setEditSaving(true)
    setEditError(null)
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
      })
      setEditingAgentId(null)
      await loadAgents()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      setEditSaving(false)
    }
  }

  function openCreateModal() {
    setShowCreate(true)
    setCreateStep("describe")
    setCreateForm({ id: "", name: "", model: "gpt-4o-mini" })
    setCreateError(null)
    setSuggestError(null)
  }

  function closeCreateModal() {
    setShowCreate(false)
    setCreateError(null)
    setSuggestError(null)
  }

  function startEditAgent(agent: AgentSummary) {
    setEditingAgentId(agent.id)
    const rawModel = agent.model ?? "gpt-4o-mini"
    const model = normalizeModelIdForDisplay(rawModel)
    setEditForm({
      name: agent.name ?? "",
      description: agent.description ?? "",
      model,
      personality: agent.personality ?? "",
      skills: agent.skills ?? [],
      avatar: agent.avatar ?? undefined,
      schedule: agent.schedule ?? "",
      schedule_input: agent.schedule_input ?? "",
    })
    setEditProvider(inferProviderFromModel(rawModel))
    setEditError(null)
  }

  function closeEditModal() {
    setEditingAgentId(null)
    setEditError(null)
  }

  function toggleAvatarPicker(agentId: string) {
    setEditingAvatarId((prev) => (prev === agentId ? null : agentId))
  }

  function closeAvatarPicker() {
    setEditingAvatarId(null)
  }

  useEffect(() => {
    loadAgents().finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (showCreate || editingAgentId) {
      api.getSkills().then((r) => setSkillsList(r.skills)).catch(() => setSkillsList([]))
    }
  }, [showCreate, editingAgentId])

  useEffect(() => {
    if (!editingAgentId) return
    setPromptLoading(true)
    setPromptError(null)
    api
      .getWorkspaceFileContent(editingAgentId, PROMPT_FILENAMES[promptTab])
      .then(setPromptContent)
      .catch((e: unknown) => {
        setPromptError(e instanceof Error ? e.message : String(e))
        setPromptContent("")
      })
      .finally(() => setPromptLoading(false))
  }, [editingAgentId, promptTab])

  return {
    agents,
    setAgents,
    loading,
    error,
    editingScheduleId,
    setEditingScheduleId,
    editingAvatarId,
    setEditingAvatarId,
    avatarSaving,
    setAvatarSaving,
    deletingId,
    setDeletingId,
    runJobId,
    setRunJobId,
    installingSystem,
    setInstallingSystem,
    showCreate,
    setShowCreate,
    createStep,
    setCreateStep,
    skillsList,
    createForm,
    setCreateForm,
    createProvider,
    setCreateProvider,
    createSaving,
    setCreateSaving,
    createError,
    setCreateError,
    describePrompt,
    setDescribePrompt,
    suggestLoading,
    setSuggestLoading,
    suggestError,
    setSuggestError,
    editingAgentId,
    setEditingAgentId,
    editProvider,
    setEditProvider,
    editForm,
    setEditForm,
    editSaving,
    setEditSaving,
    editError,
    setEditError,
    availableAvatars,
    promptTab,
    setPromptTab,
    promptContent,
    setPromptContent,
    promptLoading,
    promptSaving,
    setPromptSaving,
    promptError,
    setPromptError,
    loadAgents,
    installFromSystem,
    toggleAgentSchedule,
    runAgentNow,
    deleteAgentById,
    updateAgentAvatar,
    saveAgentSchedule,
    savePromptFile,
    createAgentFromForm,
    saveEditedAgent,
    openCreateModal,
    closeCreateModal,
    startEditAgent,
    closeEditModal,
    toggleAvatarPicker,
    closeAvatarPicker,
    promptFilenames: PROMPT_FILENAMES,
  }
}
