import { useEffect, useMemo, useRef, useState } from "react"
import { api, type SkillSummary, type StoreRegistrySkill } from "@/lib/api"
import { toast } from "sonner"
import type { ConfigFormState, ConfiguredKeysState } from "@/features/skills/types/skills.types"

export function useSkillsPage() {
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [installPath, setInstallPath] = useState("")
  const [installUrl, setInstallUrl] = useState("")
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadSkillMdFile, setUploadSkillMdFile] = useState<File | null>(null)
  const [skillMdId, setSkillMdId] = useState("")
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)
  const [configValues, setConfigValues] = useState<ConfigFormState>({})
  const [configuredKeys, setConfiguredKeys] = useState<ConfiguredKeysState>({})
  const [savingSkillId, setSavingSkillId] = useState<string | null>(null)
  const [configError, setConfigError] = useState<string | null>(null)
  const [schemas, setSchemas] = useState<Record<string, Record<string, unknown> | null>>({})
  const [showInstallModal, setShowInstallModal] = useState(false)
  const [setupDialogSkill, setSetupDialogSkill] = useState<SkillSummary | null>(null)
  const [setupMarkdown, setSetupMarkdown] = useState<string | null>(null)
  const [uninstallingId, setUninstallingId] = useState<string | null>(null)
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set())
  const [storeSkills, setStoreSkills] = useState<StoreRegistrySkill[]>([])
  const [storeBase, setStoreBase] = useState<string | null>(null)
  const [storeRegistryUrl, setStoreRegistryUrl] = useState<string | null>(null)
  const [storeLoading, setStoreLoading] = useState(false)
  const [storeError, setStoreError] = useState<string | null>(null)
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)
  const [discoverSelected, setDiscoverSelected] = useState<Set<string>>(new Set())
  const [bulkInstalling, setBulkInstalling] = useState(false)
  const discoverSelectAllRef = useRef<HTMLInputElement | null>(null)
  const [skillsTab, setSkillsTab] = useState("installed")
  const [discoverPage, setDiscoverPage] = useState(0)
  const [discoverPageSize, setDiscoverPageSize] = useState(20)
  const [installingSystem, setInstallingSystem] = useState(false)
  const [installedSearch, setInstalledSearch] = useState("")
  const [discoverSearch, setDiscoverSearch] = useState("")

  function load() {
    setLoading(true)
    api
      .getSkills()
      .then((r) => setSkills(r.skills))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  function loadStoreRegistry() {
    setStoreLoading(true)
    setStoreError(null)
    api
      .getStoreRegistry()
      .then((r) => {
        setStoreSkills(r.skills)
        setStoreBase(r.storeBase)
        setStoreRegistryUrl(r.registryUrl ?? null)
        setDiscoverPage(0)
      })
      .catch((e) => setStoreError(e instanceof Error ? e.message : String(e)))
      .finally(() => setStoreLoading(false))
  }

  useEffect(() => {
    if (skillsTab === "discover") loadStoreRegistry()
  }, [skillsTab])

  useEffect(() => {
    loadStoreRegistry()
  }, [])

  const filteredSkills = useMemo(() => {
    const q = installedSearch.trim().toLowerCase()
    if (!q) return skills
    return skills.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false)
    )
  }, [skills, installedSearch])

  const filteredStoreSkills = useMemo(() => {
    const q = discoverSearch.trim().toLowerCase()
    if (!q) return storeSkills
    return storeSkills.filter(
      (s) =>
        s.slug.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.description?.toLowerCase().includes(q) ?? false)
    )
  }, [storeSkills, discoverSearch])

  const discoverTotal = filteredStoreSkills.length
  const discoverTotalPages = Math.max(1, Math.ceil(discoverTotal / discoverPageSize))
  const discoverPageIndex = Math.min(discoverPage, Math.max(0, discoverTotalPages - 1))
  const discoverSlice = filteredStoreSkills.slice(
    discoverPageIndex * discoverPageSize,
    (discoverPageIndex + 1) * discoverPageSize
  )

  useEffect(() => {
    setDiscoverPage(0)
  }, [discoverSearch])

  useEffect(() => {
    if (discoverPage >= discoverTotalPages && discoverTotalPages > 0) setDiscoverPage(discoverTotalPages - 1)
  }, [discoverTotalPages, discoverPage])

  useEffect(() => {
    const el = discoverSelectAllRef.current
    if (!el) return
    const some = discoverSlice.some((s) => discoverSelected.has(s.slug))
    const all = discoverSlice.length > 0 && discoverSlice.every((s) => discoverSelected.has(s.slug))
    el.indeterminate = some && !all
  }, [discoverSelected, discoverSlice])

  async function loadConfigured(skillId: string) {
    try {
      const r = await api.getSkillConfig(skillId)
      setConfiguredKeys((prev) => ({ ...prev, [skillId]: r.configured }))
    } catch {
      setConfiguredKeys((prev) => ({ ...prev, [skillId]: [] }))
    }
  }

  useEffect(() => {
    for (const s of skills) {
      if (s.required_env?.length) loadConfigured(s.id)
      api
        .getSkillConfigSchema(s.id)
        .then((schema) => {
          setSchemas((prev) => ({ ...prev, [s.id]: schema ?? null }))
        })
        .catch(() => setSchemas((prev) => ({ ...prev, [s.id]: null })))
    }
  }, [skills])

  useEffect(() => {
    if (!setupDialogSkill) {
      setSetupMarkdown(null)
      return
    }
    api
      .getSkillSetup(setupDialogSkill.id)
      .then((r) => setSetupMarkdown(r.setup_markdown ?? null))
      .catch(() => setSetupMarkdown(null))
  }, [setupDialogSkill])

  async function saveSkillConfig(skillId: string, requiredEnv: string[]) {
    setConfigError(null)
    setSavingSkillId(skillId)
    try {
      const values = configValues[skillId] ?? {}
      const payload: Record<string, string> = {}
      for (const key of requiredEnv) {
        const v = values[key]?.trim()
        if (v) payload[key] = v
      }
      await api.saveSkillConfig(skillId, payload)
      await loadConfigured(skillId)
      setConfigValues((prev) => ({ ...prev, [skillId]: { ...(prev[skillId] ?? {}), ...payload } }))
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : String(e))
    } finally {
      setSavingSkillId(null)
    }
  }

  function setConfigValue(skillId: string, key: string, value: string) {
    setConfigValues((prev) => ({
      ...prev,
      [skillId]: { ...(prev[skillId] ?? {}), [key]: value },
    }))
  }

  async function handleInstallFromPath(e: React.FormEvent) {
    e.preventDefault()
    if (!installPath.trim()) return
    setInstalling(true)
    setInstallError(null)
    try {
      const r = await api.installSkill({ path: installPath.trim() })
      toast.success(`Installed: ${r.skill.id}`)
      setInstallPath("")
      setInstallUrl("")
      setUploadFile(null)
      setShowInstallModal(false)
      load()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  async function handleInstallFromUrl(e: React.FormEvent) {
    e.preventDefault()
    if (!installUrl.trim()) return
    setInstalling(true)
    setInstallError(null)
    try {
      const r = await api.installSkill({ url: installUrl.trim() })
      toast.success(`Installed: ${r.skill.id}`)
      setInstallUrl("")
      setInstallPath("")
      setUploadFile(null)
      setShowInstallModal(false)
      load()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile) return
    setInstalling(true)
    setInstallError(null)
    try {
      const r = await api.uploadSkill(uploadFile)
      toast.success(`Installed: ${r.skill.id}`)
      setUploadFile(null)
      setInstallPath("")
      setInstallUrl("")
      setShowInstallModal(false)
      load()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  async function handleUploadSkillMd(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadSkillMdFile) return
    setInstalling(true)
    setInstallError(null)
    try {
      const r = await api.uploadSkillMd(uploadSkillMdFile, skillMdId.trim() || undefined)
      toast.success(`Installed: ${r.skill.id}`)
      setUploadSkillMdFile(null)
      setSkillMdId("")
      setShowInstallModal(false)
      load()
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  async function handleUninstall(skillId: string) {
    if (!window.confirm(`Uninstall skill "${skillId}"? This removes the skill folder.`)) return
    setUninstallingId(skillId)
    try {
      await api.uninstallSkill(skillId)
      toast.success(`Uninstalled ${skillId}`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setUninstallingId(null)
    }
  }

  return {
    skills,
    loading,
    error,
    installPath,
    setInstallPath,
    installUrl,
    setInstallUrl,
    uploadFile,
    setUploadFile,
    uploadSkillMdFile,
    setUploadSkillMdFile,
    skillMdId,
    setSkillMdId,
    installing,
    installError,
    setInstallError,
    configValues,
    configuredKeys,
    savingSkillId,
    configError,
    setConfigError,
    schemas,
    showInstallModal,
    setShowInstallModal,
    setupDialogSkill,
    setSetupDialogSkill,
    setupMarkdown,
    uninstallingId,
    visibleSecrets,
    setVisibleSecrets,
    storeSkills,
    storeBase,
    storeRegistryUrl,
    storeLoading,
    storeError,
    installingSlug,
    setInstallingSlug,
    discoverSelected,
    setDiscoverSelected,
    bulkInstalling,
    setBulkInstalling,
    discoverSelectAllRef,
    skillsTab,
    setSkillsTab,
    discoverPage,
    setDiscoverPage,
    discoverPageSize,
    setDiscoverPageSize,
    installingSystem,
    setInstallingSystem,
    installedSearch,
    setInstalledSearch,
    discoverSearch,
    setDiscoverSearch,
    filteredSkills,
    filteredStoreSkills,
    discoverTotal,
    discoverTotalPages,
    discoverPageIndex,
    discoverSlice,
    load,
    loadStoreRegistry,
    saveSkillConfig,
    setConfigValue,
    handleInstallFromPath,
    handleInstallFromUrl,
    handleUpload,
    handleUploadSkillMd,
    handleUninstall,
  }
}
