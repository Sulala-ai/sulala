import { Eye, EyeOff, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MarkdownContent } from "@/components/markdown-content"
import type { SkillSummary } from "@/lib/api"
import type { ConfigFormState, ConfiguredKeysState, SchemaProperty } from "@/features/skills/types/skills.types"

interface SkillSetupDialogProps {
  setupDialogSkill: SkillSummary
  setupMarkdown: string | null
  configError: string | null
  configuredKeys: ConfiguredKeysState
  configValues: ConfigFormState
  schemas: Record<string, Record<string, unknown> | null>
  visibleSecrets: Set<string>
  savingSkillId: string | null
  isSecretField: (key: string, propMeta: SchemaProperty | undefined) => boolean
  setVisibleSecrets: React.Dispatch<React.SetStateAction<Set<string>>>
  setConfigValue: (skillId: string, key: string, value: string) => void
  onClose: () => void
  onSave: () => void
}

export function SkillSetupDialog({
  setupDialogSkill,
  setupMarkdown,
  configError,
  configuredKeys,
  configValues,
  schemas,
  visibleSecrets,
  savingSkillId,
  isSecretField,
  setVisibleSecrets,
  setConfigValue,
  onClose,
  onSave,
}: SkillSetupDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border bg-background p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Setup — {setupDialogSkill.name}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
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
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={savingSkillId === setupDialogSkill.id} onClick={onSave}>
            {savingSkillId === setupDialogSkill.id ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  )
}
