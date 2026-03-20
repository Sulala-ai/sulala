import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { api, type SkillSummary, type StoreRegistrySkill } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { MoreHorizontal, Settings, Trash2, ArrowUpCircle } from "lucide-react"
import { toast } from "sonner"
import { McpServersForm } from "@/features/settings/components/McpServersForm"
import type {
  SchemaProperty,
} from "@/features/skills/types/skills.types"
import { InstallSkillModal } from "@/features/skills/components/InstallSkillModal"
import { SkillSetupDialog } from "@/features/skills/components/SkillSetupDialog"
import { useSkillsPage } from "@/features/skills/hooks/useSkillsPage"
import { InstalledSkillsTab } from "@/features/skills/components/InstalledSkillsTab"
import { DiscoverSkillsTab } from "@/features/skills/components/DiscoverSkillsTab"

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
  const {
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
  } = useSkillsPage()

  const skillColumns = useMemo<ColumnDef<SkillSummary>[]>(() => [
    {
      id: "logo",
      header: "",
      cell: ({ row }) => {
        const logo = row.original.logo
        if (logo?.trim()) {
          return (
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background">
              <img src={logo} alt="" className="size-5 object-contain" />
            </span>
          )
        }
        return (
          <span className="relative flex size-8 shrink-0 items-center justify-center rounded border border-border bg-muted/50">
            <img src="/logo_dark.png" alt="" className="size-5 object-contain dark:hidden" />
            <img src="/logo_white.png" alt="" className="hidden size-5 object-contain dark:block" />
          </span>
        )
      },
    },
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
      id: "category",
      header: "Category",
      cell: ({ row }) => <span className="text-muted-foreground text-sm">{row.original.category?.trim() ?? "—"}</span>,
    },
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
                        logo: storeSkill.logo,
                        category: storeSkill.category,
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
  ], [
    handleUninstall,
    installingSlug,
    load,
    loadStoreRegistry,
    setInstallingSlug,
    setSetupDialogSkill,
    storeSkills,
    uninstallingId,
  ])

  const skillsTable = useReactTable({
    data: filteredSkills,
    columns: skillColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  async function handleInstallDefaultSkills() {
    setInstallingSystem(true)
    try {
      const { installed } = await api.installSystemSkills()
      toast.success(
        installed > 0
          ? `Installed ${installed} default skill${installed === 1 ? "" : "s"}.`
          : "No new skills to install (already present)."
      )
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setInstallingSystem(false)
    }
  }

  async function handleInstallManyFromDiscover(selectedSkills: StoreRegistrySkill[]) {
    let ok = 0
    for (const s of selectedSkills) {
      try {
        await api.installSkill({
          url: s.downloadUrl!,
          slug: s.slug,
          version: s.version,
          logo: s.logo,
          category: s.category,
        })
        ok++
      } catch {
        toast.error(`Failed: ${s.name}`)
      }
    }
    if (ok) {
      toast.success(ok === 1 ? `Installed: ${selectedSkills[0]!.name}` : `Installed/updated ${ok} skills`)
      load()
      loadStoreRegistry()
    }
  }

  async function handleInstallOneFromDiscover(s: StoreRegistrySkill) {
    const downloadUrl = s.downloadUrl ?? ""
    if (!downloadUrl) return
    const installedSkill = skills.find((i) => i.id === s.slug)
    const updateAvailable = !!(installedSkill && s.version && isVersionNewer(s.version, installedSkill.version))
    setInstallingSlug(s.slug)
    try {
      const r = await api.installSkill({
        url: downloadUrl,
        slug: s.slug,
        version: s.version,
        logo: s.logo,
        category: s.category,
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
          <Button variant={skills.length === 0 ? "default" : "outline"} size={skills.length === 0 ? "default" : "sm"} onClick={handleInstallDefaultSkills} disabled={installingSystem}>
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
          <InstalledSkillsTab
            skills={skills}
            installedSearch={installedSearch}
            setInstalledSearch={setInstalledSearch}
            installingSystem={installingSystem}
            onInstallDefaultSkills={handleInstallDefaultSkills}
            skillsTable={skillsTable}
            skillColumns={skillColumns}
          />
        </TabsContent>
        <TabsContent value="discover" className="mt-4">
          <DiscoverSkillsTab
            skills={skills}
            storeSkills={storeSkills}
            storeBase={storeBase}
            storeRegistryUrl={storeRegistryUrl}
            storeLoading={storeLoading}
            storeError={storeError}
            discoverSearch={discoverSearch}
            setDiscoverSearch={setDiscoverSearch}
            discoverTotal={discoverTotal}
            discoverPageSize={discoverPageSize}
            setDiscoverPageSize={setDiscoverPageSize}
            setDiscoverPage={setDiscoverPage}
            discoverSelected={discoverSelected}
            setDiscoverSelected={setDiscoverSelected}
            bulkInstalling={bulkInstalling}
            setBulkInstalling={setBulkInstalling}
            discoverSlice={discoverSlice}
            discoverSelectAllRef={discoverSelectAllRef}
            discoverPageIndex={discoverPageIndex}
            discoverTotalPages={discoverTotalPages}
            installingSlug={installingSlug}
            onRefresh={loadStoreRegistry}
            onInstallMany={handleInstallManyFromDiscover}
            onInstallOne={handleInstallOneFromDiscover}
            isVersionNewer={isVersionNewer}
          />
        </TabsContent>
        <TabsContent value="mcp" className="mt-4">
          <McpServersForm />
        </TabsContent>
      </Tabs>

      {showInstallModal && (
        <InstallSkillModal
          installError={installError}
          installing={installing}
          installPath={installPath}
          setInstallPath={setInstallPath}
          installUrl={installUrl}
          setInstallUrl={setInstallUrl}
          uploadFile={uploadFile}
          setUploadFile={setUploadFile}
          uploadSkillMdFile={uploadSkillMdFile}
          setUploadSkillMdFile={setUploadSkillMdFile}
          skillMdId={skillMdId}
          setSkillMdId={setSkillMdId}
          onClose={() => setShowInstallModal(false)}
          onUpload={handleUpload}
          onInstallFromPath={handleInstallFromPath}
          onInstallFromUrl={handleInstallFromUrl}
          onUploadSkillMd={handleUploadSkillMd}
        />
      )}

      {setupDialogSkill && (
        <SkillSetupDialog
          setupDialogSkill={setupDialogSkill}
          setupMarkdown={setupMarkdown}
          configError={configError}
          configuredKeys={configuredKeys}
          configValues={configValues}
          schemas={schemas}
          visibleSecrets={visibleSecrets}
          savingSkillId={savingSkillId}
          isSecretField={isSecretField}
          setVisibleSecrets={setVisibleSecrets}
          setConfigValue={setConfigValue}
          onClose={() => {
            setSetupDialogSkill(null)
            setConfigError(null)
          }}
          onSave={() =>
            saveSkillConfig(setupDialogSkill.id, setupDialogSkill.required_env!).then(() => {
              toast.success("Configuration saved")
              setSetupDialogSkill(null)
              setConfigError(null)
            })
          }
        />
      )}
    </div>
  )
}
