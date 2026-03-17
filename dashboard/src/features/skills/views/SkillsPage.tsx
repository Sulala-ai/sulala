import { useEffect, useState, useMemo, useRef } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { api, type SkillSummary, type StoreRegistrySkill } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { X, MoreHorizontal, Settings, Trash2, Eye, EyeOff, Download, Store, ChevronLeft, ChevronRight, Search, ArrowUpCircle, ArrowUpRight } from "lucide-react"
import { toast } from "sonner"
import { MarkdownContent } from "@/components/markdown-content"
import { McpServersForm } from "@/features/settings/components/McpServersForm"

/** True when storeVersion is strictly greater than installedVersion (semver-style). Used to show Update. */
function isVersionNewer(storeVersion: string, installedVersion: string | undefined): boolean {
  if (!storeVersion?.trim()) return false
  if (!installedVersion?.trim()) return true
  const parse = (v: string) => v.trim().replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0)
  const s = parse(storeVersion)
  const i = parse(installedVersion)
  for (let k = 0; k < Math.max(s.length, i.length); k++) {
    const a = s[k] ?? 0
    const b = i[k] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

/** Per-skill config form state: skillId -> env key -> value (empty = "already set" or not filled) */
type ConfigFormState = Record<string, Record<string, string>>
/** Which keys are already stored (so we show "Already set" placeholder) */
type ConfiguredKeysState = Record<string, string[]>

/** Schema property may include format or secret hint for UI */
type SchemaProperty = { title?: string; description?: string; format?: string; secret?: boolean }

function isSecretField(key: string, propMeta: SchemaProperty | undefined): boolean {
  if (propMeta && typeof propMeta === "object") {
    if (propMeta.format === "password" || propMeta.secret === true) return true
  }
  const upper = key.toUpperCase()
  return (
    upper.includes("PASSWORD") ||
    upper.includes("SECRET") ||
    upper.includes("API_KEY") ||
    upper.includes("TOKEN") ||
    upper.endsWith("_KEY")
  )
}

export function SkillsPage() {
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
  /** Set of "skillId|key" for which the secret value is visible (eye on) */
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set())
  /** Discover tab: store registry */
  const [storeSkills, setStoreSkills] = useState<StoreRegistrySkill[]>([])
  const [storeBase, setStoreBase] = useState<string | null>(null)
  const [storeRegistryUrl, setStoreRegistryUrl] = useState<string | null>(null)
  const [storeLoading, setStoreLoading] = useState(false)
  const [storeError, setStoreError] = useState<string | null>(null)
  const [installingSlug, setInstallingSlug] = useState<string | null>(null)
  /** Discover tab: selected slugs for bulk install/update */
  const [discoverSelected, setDiscoverSelected] = useState<Set<string>>(new Set())
  const [bulkInstalling, setBulkInstalling] = useState(false)
  const discoverSelectAllRef = useRef<HTMLInputElement | null>(null)
  const [skillsTab, setSkillsTab] = useState("installed")
  /** Discover tab pagination */
  const [discoverPage, setDiscoverPage] = useState(0)
  const [discoverPageSize, setDiscoverPageSize] = useState(20)
  const [installingSystem, setInstallingSystem] = useState(false)
  /** Search (installed tab) */
  const [installedSearch, setInstalledSearch] = useState("")
  /** Search (discover tab) */
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

  /** Load store registry once on mount so Installed tab can show update available. */
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
      api.getSkillConfigSchema(s.id).then((schema) => {
        setSchemas((prev) => ({ ...prev, [s.id]: schema ?? null }))
      }).catch(() => setSchemas((prev) => ({ ...prev, [s.id]: null })))
    }
  }, [skills])

  useEffect(() => {
    if (!setupDialogSkill) {
      setSetupMarkdown(null)
      return
    }
    api.getSkillSetup(setupDialogSkill.id).then((r) => setSetupMarkdown(r.setup_markdown ?? null)).catch(() => setSetupMarkdown(null))
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
      setConfigValues((prev) => {
        const next = { ...prev, [skillId]: { ...(prev[skillId] ?? {}), ...payload } }
        return next
      })
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

  const skillColumns = useMemo<ColumnDef<SkillSummary>[]>(() => [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.original.name}</span>
          {row.original.system && <Badge variant="outline" className="text-xs">System</Badge>}
        </div>
      ),
    },
    { accessorKey: "id", header: "ID", cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.id}</span> },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => row.original.description ? <span className="text-muted-foreground text-sm max-w-[240px] truncate block" title={row.original.description}>{row.original.description}</span> : "—",
    },
    {
      id: "version",
      header: "Version",
      cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.version ?? "—"}</span>,
    },
    {
      id: "tools",
      header: "Tools",
      cell: ({ row }) =>
        row.original.tools.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.original.tools.map((t) => (
              <Badge key={t.id} variant="secondary" className="font-mono text-xs">
                {t.id}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const skill = row.original
        const hasConfig = skill.required_env && skill.required_env.length > 0
        const storeSkill = storeSkills.find((s) => s.slug === skill.id)
        const updateAvailable = !!(
          storeSkill?.downloadUrl &&
          storeSkill.version &&
          isVersionNewer(storeSkill.version, skill.version)
        )
        const isUpdating = installingSlug === skill.id
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0" disabled={uninstallingId !== null || isUpdating}>
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {updateAvailable && (
                <DropdownMenuItem
                  onClick={async () => {
                    if (!storeSkill?.downloadUrl) return
                    setInstallingSlug(skill.id)
                    try {
                      await api.installSkill({
                        url: storeSkill.downloadUrl,
                        slug: storeSkill.slug,
                        version: storeSkill.version,
                      })
                      toast.success(`Updated: ${skill.id}`)
                      load()
                      loadStoreRegistry()
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e))
                    } finally {
                      setInstallingSlug(null)
                    }
                  }}
                  disabled={isUpdating}
                >
                  <ArrowUpCircle className="mr-2 h-4 w-4" />
                  {isUpdating ? "Updating…" : "Update from hub"}
                </DropdownMenuItem>
              )}
              {hasConfig && (
                <DropdownMenuItem onClick={() => setSetupDialogSkill(skill)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Setup
                </DropdownMenuItem>
              )}
              {!skill.system && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleUninstall(skill.id)}
                  disabled={uninstallingId === skill.id}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {uninstallingId === skill.id ? "Uninstalling…" : "Uninstall"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [uninstallingId, storeSkills, installingSlug])

  const skillsTable = useReactTable({
    data: filteredSkills,
    columns: skillColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (loading && skills.length === 0) {
    return <div className="p-4 text-muted-foreground">Loading skills…</div>
  }
  if (error && skills.length === 0) {
    return <div className="p-4 text-destructive">Failed to load skills: {error}</div>
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Skills</h1>
          <p className="text-muted-foreground">Browse installed skills and install from URL, path, or SKILL.md.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={skills.length === 0 ? "default" : "outline"}
            size={skills.length === 0 ? "default" : "sm"}
            onClick={async () => {
              setInstallingSystem(true)
              try {
                const { installed } = await api.installSystemSkills()
                toast.success(installed > 0 ? `Installed ${installed} default skill${installed === 1 ? "" : "s"}.` : "No new skills to install (already present).")
                load()
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e))
              } finally {
                setInstallingSystem(false)
              }
            }}
            disabled={installingSystem}
          >
            {installingSystem ? "Installing…" : "Install default skills"}
          </Button>
          <Button onClick={() => { setShowInstallModal(true); setInstallError(null) }}>
            Install skill
          </Button>
        </div>
      </div>

      <Tabs value={skillsTab} onValueChange={setSkillsTab} className="w-full">
        <TabsList className="grid w-full max-w-[420px] grid-cols-3">
          <TabsTrigger value="installed">Installed skills</TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="mcp">MCP Servers</TabsTrigger>
        </TabsList>
        <TabsContent value="installed" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Installed skills</CardTitle>
              <CardDescription>You can find and install more skills from the SulalaHub store. <a href="https://hub.sulala.ai" className="text-blue-500" target="_blank" rel="noopener noreferrer">Visit the store</a> to find and install skills.</CardDescription>
            </CardHeader>
            <CardContent>
              {skills.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No skills installed. Install default skills (memory, date, fetch, jq, file-search) or use Install skill to add one.</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      setInstallingSystem(true)
                      try {
                        const { installed } = await api.installSystemSkills()
                        toast.success(installed > 0 ? `Installed ${installed} default skill${installed === 1 ? "" : "s"}.` : "No new skills to install (already present).")
                        load()
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : String(e))
                      } finally {
                        setInstallingSystem(false)
                      }
                    }}
                    disabled={installingSystem}
                  >
                    {installingSystem ? "Installing…" : "Install default skills"}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, id, or description"
                      value={installedSearch}
                      onChange={(e) => setInstalledSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <div className="overflow-hidden rounded-md border">
                    <Table>
                      <TableHeader>
                        {skillsTable.getHeaderGroups().map((headerGroup) => (
                          <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <TableHead key={header.id}>
                                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                              </TableHead>
                            ))}
                          </TableRow>
                        ))}
                      </TableHeader>
                      <TableBody>
                        {skillsTable.getRowModel().rows?.length ? (
                          skillsTable.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                              {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={skillColumns.length} className="h-24 text-center text-muted-foreground">
                              {installedSearch.trim() ? "No skills match your search." : "No skills."}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="discover" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Discover
              </CardTitle>
              <CardDescription>
                Skills from the SulalaHub store (ZIP install). Use <strong>Details</strong> to open the skill on the store: see creator, rating, comments, and to rate, comment, or report.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {storeLoading && (
                <p className="text-sm text-muted-foreground">Loading store…</p>
              )}
              {storeError && (
                <p className="text-sm text-destructive mb-4">{storeError}</p>
              )}
              {storeRegistryUrl && (
                <p className="text-xs text-muted-foreground mb-3 font-mono truncate" title={storeRegistryUrl}>
                  {/* Registry: {storeRegistryUrl} */}
                </p>
              )}
              {!storeBase && !storeLoading && (
                <p className="text-sm text-muted-foreground">
                  No store configured. A default registry URL is set in workspace config when you run <code className="rounded bg-muted px-1">sulala onboard</code> (<code className="rounded bg-muted px-1">~/.agent-os/config.json</code> → <code className="rounded bg-muted px-1">skills_registry_url</code>). You can override with <code className="rounded bg-muted px-1">SKILLS_REGISTRY_URL</code> (env) and restart the agent, then open Discover again.
                </p>
              )}
              {storeBase && storeSkills.length === 0 && !storeLoading && (
                <p className="text-sm text-muted-foreground">
                  No skills returned. Ensure the URL above is the registry (<code className="rounded bg-muted px-1">/api/sulalahub/registry</code>), not a skill content URL (<code className="rounded bg-muted px-1">/api/sulalahub/skills/…</code>).
                </p>
              )}
              {storeBase && storeSkills.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative max-w-[240px]">
                        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder="Search name, slug, or description"
                          value={discoverSearch}
                          onChange={(e) => setDiscoverSearch(e.target.value)}
                          className="pl-8 h-8"
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={loadStoreRegistry} disabled={storeLoading}>
                        Refresh
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {discoverTotal} skill{discoverTotal !== 1 ? "s" : ""}
                        {discoverSearch.trim() && discoverTotal !== storeSkills.length && ` (filtered from ${storeSkills.length})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="discover-page-size" className="text-sm text-muted-foreground whitespace-nowrap">
                        Per page
                      </Label>
                      <Select
                        value={String(discoverPageSize)}
                        onValueChange={(v) => {
                          setDiscoverPageSize(Number(v))
                          setDiscoverPage(0)
                        }}
                      >
                        <SelectTrigger id="discover-page-size" className="w-[72px]" size="sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {discoverSelected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-sm text-muted-foreground">
                        {discoverSelected.size} selected
                      </span>
                      <Button
                        size="sm"
                        disabled={bulkInstalling}
                        onClick={async () => {
                          const toInstall = discoverSlice.filter(
                            (s) => discoverSelected.has(s.slug) && (s.downloadUrl ?? "").trim() !== ""
                          )
                          if (toInstall.length === 0) return
                          setBulkInstalling(true)
                          let ok = 0
                          let err = 0
                          for (const s of toInstall) {
                            try {
                              await api.installSkill({
                                url: s.downloadUrl!,
                                slug: s.slug,
                                version: s.version,
                              })
                              ok++
                            } catch {
                              err++
                              toast.error(`Failed: ${s.name}`)
                            }
                          }
                          if (ok) {
                            toast.success(ok === 1 ? `Installed: ${toInstall[0]!.name}` : `Installed/updated ${ok} skills`)
                            load()
                            loadStoreRegistry()
                            setDiscoverSelected(new Set())
                          }
                          setBulkInstalling(false)
                        }}
                      >
                        {bulkInstalling ? "Installing…" : "Install / Update selected"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={bulkInstalling}
                        onClick={() => setDiscoverSelected(new Set())}
                      >
                        Clear selection
                      </Button>
                    </div>
                  )}
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <input
                              ref={discoverSelectAllRef}
                              type="checkbox"
                              aria-label="Select all on page"
                              checked={
                                discoverSlice.length > 0 &&
                                discoverSlice.every((s) => discoverSelected.has(s.slug))
                              }
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setDiscoverSelected((prev) => new Set([...prev, ...discoverSlice.map((s) => s.slug)]))
                                } else {
                                  const pageSlugs = new Set(discoverSlice.map((s) => s.slug))
                                  setDiscoverSelected((prev) => new Set([...prev].filter((slug) => !pageSlugs.has(slug))))
                                }
                              }}
                              disabled={bulkInstalling}
                              className="rounded border-input"
                            />
                          </TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[100px]">Version</TableHead>
                          <TableHead className="w-[200px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discoverSlice.map((s) => {
                          const installedSkill = skills.find((i) => i.id === s.slug)
                          const installed = !!installedSkill
                          const updateAvailable = installed && s.version && isVersionNewer(s.version, installedSkill?.version)
                          const downloadUrl = s.downloadUrl ?? ""
                          const doInstallOrUpdate = async () => {
                            if (!downloadUrl) return
                            setInstallingSlug(s.slug)
                            try {
                              const r = await api.installSkill({
                                url: downloadUrl,
                                slug: s.slug,
                                version: s.version,
                              })
                              toast.success(updateAvailable ? `Updated: ${r.skill.id}` : `Installed: ${r.skill.id}`)
                              load()
                              loadStoreRegistry()
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : String(e))
                            } finally {
                              setInstallingSlug(null)
                            }
                          }
                          const selected = discoverSelected.has(s.slug)
                          return (
                            <TableRow key={s.slug}>
                              <TableCell className="w-10">
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${s.name}`}
                                  checked={selected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setDiscoverSelected((prev) => new Set([...prev, s.slug]))
                                    } else {
                                      setDiscoverSelected((prev) => {
                                        const next = new Set(prev)
                                        next.delete(s.slug)
                                        return next
                                      })
                                    }
                                  }}
                                  disabled={bulkInstalling}
                                  className="rounded border-input"
                                />
                              </TableCell>
                              <TableCell className="font-medium">{s.name}</TableCell>
                              <TableCell className="text-muted-foreground text-sm max-w-[320px] truncate" title={s.description}>
                                {s.description ?? "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">{s.version ?? "—"}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {storeBase && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-muted-foreground"
                                      asChild
                                    >
                                      <a
                                        href={`${storeBase.replace(/\/$/, "")}/skills/${encodeURIComponent(s.slug)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="View on store: creator, rating, comments, rate, report"
                                      >
                                        {/* open icon */}
                                        <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                                        Details
                                      </a>
                                    </Button>
                                  )}
                                  {installed && !updateAvailable ? (
                                    <Badge variant="secondary">Installed</Badge>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant={updateAvailable ? "default" : "outline"}
                                      disabled={installingSlug !== null || bulkInstalling || !downloadUrl}
                                      onClick={doInstallOrUpdate}
                                    >
                                      {installingSlug === s.slug ? (
                                        "Installing…"
                                      ) : updateAvailable ? (
                                        <>
                                          <ArrowUpCircle className="mr-1.5 h-3.5 w-3.5" />
                                          Update
                                        </>
                                      ) : (
                                        <>
                                          <Download className="mr-1.5 h-3.5 w-3.5" />
                                          Install
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Showing {discoverTotal === 0 ? 0 : discoverPageIndex * discoverPageSize + 1}–
                      {Math.min((discoverPageIndex + 1) * discoverPageSize, discoverTotal)} of {discoverTotal}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDiscoverPage((p) => Math.max(0, p - 1))}
                        disabled={discoverPageIndex <= 0}
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="min-w-[80px] text-center text-muted-foreground">
                        Page {discoverPageIndex + 1} of {discoverTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDiscoverPage((p) => Math.min(discoverTotalPages - 1, p + 1))}
                        disabled={discoverPageIndex >= discoverTotalPages - 1}
                        aria-label="Next page"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="mcp" className="mt-4">
          <McpServersForm />
        </TabsContent>
      </Tabs>

      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInstallModal(false)} aria-hidden />
          <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Install skill</h2>
              <Button variant="ghost" size="icon" onClick={() => setShowInstallModal(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Tabs defaultValue="url" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="url">URL or archive</TabsTrigger>
                <TabsTrigger value="md">SKILL.md file</TabsTrigger>
              </TabsList>
              <TabsContent value="url" className="space-y-4 pt-4">
                <form onSubmit={handleUpload} className="space-y-2">
                  <Label>Upload archive</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="file"
                      accept=".tar.gz,.tgz,.tar,.zip,application/gzip,application/x-tar,application/zip"
                      className="text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:text-sm"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                    />
                    <Button type="submit" disabled={installing || !uploadFile}>
                      {installing ? "Installing…" : "Upload & install"}
                    </Button>
                  </div>
                </form>
                <form onSubmit={handleInstallFromPath} className="space-y-2">
                  <Label htmlFor="install-path">From path</Label>
                  <div className="flex gap-2">
                    <Input
                      id="install-path"
                      placeholder="/path/to/skill/folder or ./skills/weather"
                      value={installPath}
                      onChange={(e) => setInstallPath(e.target.value)}
                    />
                    <Button type="submit" disabled={installing}>Install</Button>
                  </div>
                </form>
                <form onSubmit={handleInstallFromUrl} className="space-y-2">
                  <Label htmlFor="install-url">From URL (ZIP or tar.gz)</Label>
                  <p className="text-xs text-muted-foreground">
                    Store skill URL or direct ZIP/tar.gz link. Installed to ~/.agent-os/skills/
                  </p>
                  <div className="flex gap-2">
                    <Input
                      id="install-url"
                      placeholder="http://localhost:3000/api/sulalahub/skills/test4 or …/download"
                      value={installUrl}
                      onChange={(e) => setInstallUrl(e.target.value)}
                    />
                    <Button type="submit" disabled={installing}>Install</Button>
                  </div>
                </form>
              </TabsContent>
              <TabsContent value="md" className="space-y-4 pt-4">
                <form onSubmit={handleUploadSkillMd} className="space-y-2">
                  <Label>Upload SKILL.md</Label>
                  <p className="text-xs text-muted-foreground">
                    Upload a single SKILL.md file. Skill id is taken from frontmatter <code className="rounded bg-muted px-1">name</code> or the optional field below.
                  </p>
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      type="file"
                      accept=".md,.markdown"
                      className="text-sm file:mr-2 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:text-sm"
                      onChange={(e) => setUploadSkillMdFile(e.target.files?.[0] ?? null)}
                    />
                    <Input
                      placeholder="Skill ID (optional)"
                      value={skillMdId}
                      onChange={(e) => setSkillMdId(e.target.value)}
                      className="max-w-[180px]"
                    />
                    <Button type="submit" disabled={installing || !uploadSkillMdFile}>
                      {installing ? "Installing…" : "Upload SKILL.md"}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
            {installError && <p className="mt-4 text-sm text-destructive">{installError}</p>}
          </div>
        </div>
      )}

      {setupDialogSkill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setSetupDialogSkill(null); setConfigError(null) }} aria-hidden />
          <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-4 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Setup — {setupDialogSkill.name}</h2>
              <Button variant="ghost" size="icon" onClick={() => { setSetupDialogSkill(null); setConfigError(null) }} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            {setupMarkdown && (
              <div className="mb-4 rounded-md border bg-muted/30 p-3 text-sm prose prose-sm dark:prose-invert max-w-none">
                <MarkdownContent content={setupMarkdown} />
              </div>
            )}
            <p className="mb-3 text-xs text-muted-foreground">
              Required env vars for this skill. Stored in ~/.agent-os/configs/
            </p>
            <div className="space-y-3">
              {setupDialogSkill.required_env?.map((key) => {
                const configured = configuredKeys[setupDialogSkill.id]?.includes(key)
                const value = configValues[setupDialogSkill.id]?.[key] ?? ""
                const schemaProps = schemas[setupDialogSkill.id] && typeof schemas[setupDialogSkill.id] === "object" && "properties" in schemas[setupDialogSkill.id]!
                  ? (schemas[setupDialogSkill.id] as { properties?: Record<string, SchemaProperty> }).properties
                  : undefined
                const propMeta = schemaProps?.[key]
                const label = (typeof propMeta === "object" && propMeta?.title) || key
                const secret = isSecretField(key, propMeta)
                const visibleKey = `${setupDialogSkill.id}|${key}`
                const isVisible = visibleSecrets.has(visibleKey)
                const toggleVisible = () => {
                  setVisibleSecrets((prev) => {
                    const next = new Set(prev)
                    if (next.has(visibleKey)) next.delete(visibleKey)
                    else next.add(visibleKey)
                    return next
                  })
                }
                return (
                  <div key={key} className="flex items-center gap-2">
                    <Label htmlFor={`setup-${setupDialogSkill.id}-${key}`} className="min-w-[120px] font-mono text-xs shrink-0" title={typeof propMeta === "object" ? propMeta.description : undefined}>
                      {label}
                    </Label>
                    <div className="relative flex flex-1 items-center">
                      <Input
                        id={`setup-${setupDialogSkill.id}-${key}`}
                        type={secret ? (isVisible ? "text" : "password") : "text"}
                        autoComplete="off"
                        placeholder={configured && secret ? "•••••••• (already set)" : configured && !secret ? "(already set)" : `Set ${key}`}
                        value={value}
                        onChange={(e) => setConfigValue(setupDialogSkill.id, key, e.target.value)}
                        className="font-mono text-sm flex-1 pr-9"
                      />
                      {secret && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={toggleVisible}
                          aria-label={isVisible ? "Hide value" : "Show value"}
                        >
                          {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {configError && <p className="mt-2 text-sm text-destructive">{configError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setSetupDialogSkill(null); setConfigError(null) }}>
                Cancel
              </Button>
              <Button
                disabled={savingSkillId === setupDialogSkill.id}
                onClick={() => saveSkillConfig(setupDialogSkill.id, setupDialogSkill.required_env!).then(() => {
                  toast.success("Configuration saved")
                  setSetupDialogSkill(null)
                  setConfigError(null)
                })}
              >
                {savingSkillId === setupDialogSkill.id ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
