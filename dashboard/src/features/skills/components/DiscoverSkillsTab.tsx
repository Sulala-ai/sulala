import type { SkillSummary, StoreRegistrySkill } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Store, Search, ArrowUpCircle, ArrowUpRight, ChevronLeft, ChevronRight, Download } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DiscoverSkillsTabProps {
  skills: SkillSummary[]
  storeSkills: StoreRegistrySkill[]
  storeBase: string | null
  storeRegistryUrl: string | null
  storeLoading: boolean
  storeError: string | null
  discoverSearch: string
  setDiscoverSearch: (v: string) => void
  discoverTotal: number
  discoverPageSize: number
  setDiscoverPageSize: (n: number) => void
  setDiscoverPage: (v: number | ((p: number) => number)) => void
  discoverSelected: Set<string>
  setDiscoverSelected: React.Dispatch<React.SetStateAction<Set<string>>>
  bulkInstalling: boolean
  setBulkInstalling: (v: boolean) => void
  discoverSlice: StoreRegistrySkill[]
  discoverSelectAllRef: React.RefObject<HTMLInputElement | null>
  discoverPageIndex: number
  discoverTotalPages: number
  installingSlug: string | null
  onRefresh: () => void
  onInstallMany: (skills: StoreRegistrySkill[]) => Promise<void>
  onInstallOne: (skill: StoreRegistrySkill) => Promise<void>
  isVersionNewer: (storeVersion: string, installedVersion: string | undefined) => boolean
}

export function DiscoverSkillsTab({
  skills,
  storeSkills,
  storeBase,
  storeRegistryUrl,
  storeLoading,
  storeError,
  discoverSearch,
  setDiscoverSearch,
  discoverTotal,
  discoverPageSize,
  setDiscoverPageSize,
  setDiscoverPage,
  discoverSelected,
  setDiscoverSelected,
  bulkInstalling,
  setBulkInstalling,
  discoverSlice,
  discoverSelectAllRef,
  discoverPageIndex,
  discoverTotalPages,
  installingSlug,
  onRefresh,
  onInstallMany,
  onInstallOne,
  isVersionNewer,
}: DiscoverSkillsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="h-5 w-5" />
          Discover
        </CardTitle>
        <CardDescription>
          Skills from the SulalaHub store (ZIP install). Use <strong>Details</strong> to open the skill on the store:
          see creator, rating, comments, and to rate, comment, or report.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {storeLoading && <p className="text-sm text-muted-foreground">Loading store…</p>}
        {storeError && <p className="text-sm text-destructive mb-4">{storeError}</p>}
        {storeRegistryUrl && (
          <p className="text-xs text-muted-foreground mb-3 font-mono truncate" title={storeRegistryUrl}></p>
        )}
        {!storeBase && !storeLoading && (
          <p className="text-sm text-muted-foreground">
            No store configured. A default registry URL is set in workspace config when you run{" "}
            <code className="rounded bg-muted px-1">sulala onboard</code> (
            <code className="rounded bg-muted px-1">~/.agent-os/config.json</code> →{" "}
            <code className="rounded bg-muted px-1">skills_registry_url</code>). You can override with{" "}
            <code className="rounded bg-muted px-1">SKILLS_REGISTRY_URL</code> (env) and restart the agent, then open
            Discover again.
          </p>
        )}
        {storeBase && storeSkills.length === 0 && !storeLoading && (
          <p className="text-sm text-muted-foreground">
            No skills returned. Ensure the URL above is the registry (
            <code className="rounded bg-muted px-1">/api/sulalahub/registry</code>), not a skill content URL (
            <code className="rounded bg-muted px-1">/api/sulalahub/skills/…</code>).
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
                <Button variant="outline" size="sm" onClick={onRefresh} disabled={storeLoading}>
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
                <span className="text-sm text-muted-foreground">{discoverSelected.size} selected</span>
                <Button
                  size="sm"
                  disabled={bulkInstalling}
                  onClick={async () => {
                    const toInstall = discoverSlice.filter(
                      (s) => discoverSelected.has(s.slug) && (s.downloadUrl ?? "").trim() !== ""
                    )
                    if (toInstall.length === 0) return
                    setBulkInstalling(true)
                    await onInstallMany(toInstall)
                    setDiscoverSelected(new Set())
                    setBulkInstalling(false)
                  }}
                >
                  {bulkInstalling ? "Installing…" : "Install / Update selected"}
                </Button>
                <Button size="sm" variant="ghost" disabled={bulkInstalling} onClick={() => setDiscoverSelected(new Set())}>
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
                        checked={discoverSlice.length > 0 && discoverSlice.every((s) => discoverSelected.has(s.slug))}
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
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
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
                    const selected = discoverSelected.has(s.slug)
                    return (
                      <TableRow key={s.slug}>
                        <TableCell className="w-10">
                          <input
                            type="checkbox"
                            aria-label={`Select ${s.name}`}
                            checked={selected}
                            onChange={(e) => {
                              if (e.target.checked) setDiscoverSelected((prev) => new Set([...prev, s.slug]))
                              else {
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
                        <TableCell className="w-12">
                          {s.logo?.trim() ? (
                            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-background">
                              <img src={s.logo} alt="" className="size-5 object-contain" />
                            </span>
                          ) : (
                            <span className="relative flex size-8 shrink-0 items-center justify-center rounded border border-border bg-muted/50">
                              <img src="/logo_dark.png" alt="" className="size-5 object-contain dark:hidden" />
                              <img src="/logo_white.png" alt="" className="hidden size-5 object-contain dark:block" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.category?.trim() ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[320px] truncate" title={s.description}>
                          {s.description ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">{s.version ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {storeBase && (
                              <Button size="sm" variant="ghost" className="text-muted-foreground" asChild>
                                <a
                                  href={`${storeBase.replace(/\/$/, "")}/skills/${encodeURIComponent(s.slug)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View on store: creator, rating, comments, rate, report"
                                >
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
                                onClick={() => onInstallOne(s)}
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
  )
}
