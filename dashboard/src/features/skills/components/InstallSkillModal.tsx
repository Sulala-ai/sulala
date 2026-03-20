import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface InstallSkillModalProps {
  installError: string | null
  installing: boolean
  installPath: string
  setInstallPath: (v: string) => void
  installUrl: string
  setInstallUrl: (v: string) => void
  uploadFile: File | null
  setUploadFile: (v: File | null) => void
  uploadSkillMdFile: File | null
  setUploadSkillMdFile: (v: File | null) => void
  skillMdId: string
  setSkillMdId: (v: string) => void
  onClose: () => void
  onUpload: (e: React.FormEvent) => void
  onInstallFromPath: (e: React.FormEvent) => void
  onInstallFromUrl: (e: React.FormEvent) => void
  onUploadSkillMd: (e: React.FormEvent) => void
}

export function InstallSkillModal({
  installError,
  installing,
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
  onClose,
  onUpload,
  onInstallFromPath,
  onInstallFromUrl,
  onUploadSkillMd,
}: InstallSkillModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg rounded-lg border bg-background p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Install skill</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Tabs defaultValue="url" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="url">URL or archive</TabsTrigger>
            <TabsTrigger value="md">SKILL.md file</TabsTrigger>
          </TabsList>
          <TabsContent value="url" className="space-y-4 pt-4">
            <form onSubmit={onUpload} className="space-y-2">
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
            <form onSubmit={onInstallFromPath} className="space-y-2">
              <Label htmlFor="install-path">From path</Label>
              <div className="flex gap-2">
                <Input
                  id="install-path"
                  placeholder="/path/to/skill/folder or ./skills/weather"
                  value={installPath}
                  onChange={(e) => setInstallPath(e.target.value)}
                />
                <Button type="submit" disabled={installing}>
                  Install
                </Button>
              </div>
            </form>
            <form onSubmit={onInstallFromUrl} className="space-y-2">
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
                <Button type="submit" disabled={installing}>
                  Install
                </Button>
              </div>
            </form>
          </TabsContent>
          <TabsContent value="md" className="space-y-4 pt-4">
            <form onSubmit={onUploadSkillMd} className="space-y-2">
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
  )
}
