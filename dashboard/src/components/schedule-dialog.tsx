"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { X } from "lucide-react"

export const SCHEDULE_PRESETS = [
  { value: "", label: "Not scheduled" },
  { value: "*/5 * * * *", label: "Every 5 min" },
  { value: "*/10 * * * *", label: "Every 10 min" },
  { value: "0 * * * *", label: "Every hour" },
  { value: "0 7 * * *", label: "Daily at 7:00" },
  { value: "0 9 * * *", label: "Daily at 9:00" },
  { value: "0 18 * * *", label: "Daily at 18:00" },
  { value: "0 18 * * 1-5", label: "Weekdays at 18:00" },
] as const

const CUSTOM_VALUE = "__custom__"

/** Sentinel address meaning "use the Telegram chat configured in Settings" (set via /set_report_chat). */
export const TELEGRAM_REPORT_ADDRESS_SETTINGS = "__default__"

function cronToPreset(cron: string | null | undefined): string {
  const t = (cron ?? "").trim()
  if (!t) return ""
  const found = SCHEDULE_PRESETS.find((p) => p.value === t)
  return found ? found.value : CUSTOM_VALUE
}

export function scheduleHint(cron: string | null | undefined): string {
  if (!cron || !cron.trim()) return "Not scheduled"
  const t = cron.trim()
  const found = SCHEDULE_PRESETS.find((p) => p.value === t)
  if (found) return found.label
  if (/^0 \d+ \* \* \*$/.test(t)) return `Daily at ${t.split(" ")[1]}:00`
  return t
}

export interface ScheduleReportTarget {
  channel: "telegram"
  address: string
}

export interface ScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule: string | null | undefined
  scheduleInput: string | null | undefined
  /** Telegram chat ID(s) to send schedule report to. First one is shown in the single input. */
  scheduleReportTargets?: ScheduleReportTarget[] | null
  onSave: (payload: {
    schedule: string | null
    schedule_input: string | null
    schedule_enabled?: boolean
    schedule_report_targets?: ScheduleReportTarget[] | null
  }) => Promise<void>
  title?: string
  saveLabel?: string
}

export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  scheduleInput,
  scheduleReportTargets,
  onSave,
  title = "Schedule",
  saveLabel = "Save",
}: ScheduleDialogProps) {
  const [preset, setPreset] = useState<string>(() => cronToPreset(schedule))
  const [advancedCron, setAdvancedCron] = useState(() => (cronToPreset(schedule) === CUSTOM_VALUE ? (schedule ?? "").trim() : ""))
  const [inputTask, setInputTask] = useState(() => (scheduleInput ?? "").trim())
  const [reportMode, setReportMode] = useState<"none" | "settings" | "custom">(() => {
    const t = scheduleReportTargets?.find((r) => r.channel === "telegram")
    const addr = t?.address ?? ""
    if (!addr) return "none"
    if (addr === TELEGRAM_REPORT_ADDRESS_SETTINGS) return "settings"
    return "custom"
  })
  const [telegramChatId, setTelegramChatId] = useState(() => {
    const t = scheduleReportTargets?.find((r) => r.channel === "telegram")
    const addr = t?.address ?? ""
    return addr && addr !== TELEGRAM_REPORT_ADDRESS_SETTINGS ? addr : ""
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      const c = (schedule ?? "").trim()
      setPreset(cronToPreset(schedule))
      setAdvancedCron(cronToPreset(schedule) === CUSTOM_VALUE ? c : "")
      setInputTask((scheduleInput ?? "").trim())
      const t = scheduleReportTargets?.find((r) => r.channel === "telegram")
      const addr = t?.address ?? ""
      setReportMode(!addr ? "none" : addr === TELEGRAM_REPORT_ADDRESS_SETTINGS ? "settings" : "custom")
      setTelegramChatId(addr && addr !== TELEGRAM_REPORT_ADDRESS_SETTINGS ? addr : "")
      setError(null)
    }
  }, [open, schedule, scheduleInput, scheduleReportTargets])

  const effectiveCron =
    preset === CUSTOM_VALUE ? advancedCron.trim() : preset

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const schedule_report_targets =
        reportMode === "none"
          ? null
          : reportMode === "settings"
            ? [{ channel: "telegram" as const, address: TELEGRAM_REPORT_ADDRESS_SETTINGS }]
            : telegramChatId.trim()
              ? [{ channel: "telegram" as const, address: telegramChatId.trim() }]
              : null
      await onSave({
        schedule: effectiveCron || null,
        schedule_input: inputTask.trim() || null,
        schedule_enabled: true,
        schedule_report_targets: schedule_report_targets ?? undefined,
      })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="schedule-dialog-title">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="schedule-dialog-title" className="text-lg font-semibold">
            {title}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">When to run</Label>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {SCHEDULE_PRESETS.map((p) => (
                <option key={p.value || "none"} value={p.value}>
                  {p.label}
                </option>
              ))}
              <option value={CUSTOM_VALUE}>Advanced (cron expression)</option>
            </select>
          </div>

          {preset === CUSTOM_VALUE && (
            <div className="space-y-2">
              <Label className="text-sm">Cron expression</Label>
              <Input
                placeholder="e.g. 0 9 * * * (min hour day month weekday)"
                value={advancedCron}
                onChange={(e) => setAdvancedCron(e.target.value)}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Examples: 0 9 * * * = daily 9:00, */15 * * * * = every 15 min
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm">Scheduled task (optional)</Label>
            <textarea
              placeholder="e.g. Summarize my calendar and top tasks"
              value={inputTask}
              onChange={(e) => setInputTask(e.target.value)}
              rows={4}
              className="flex w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Report to Telegram (optional)</Label>
            <select
              className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
              value={reportMode}
              onChange={(e) => setReportMode(e.target.value as "none" | "settings" | "custom")}
            >
              <option value="none">Don&apos;t send reports</option>
              <option value="settings">Use channel from Settings</option>
              <option value="custom">Custom chat ID</option>
            </select>
            {reportMode === "custom" && (
              <Input
                placeholder="Chat ID or @username (e.g. 123456789)"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="text-sm"
              />
            )}
            <p className="text-xs text-muted-foreground">
              {reportMode === "settings"
                ? "Reports go to the chat you set in Settings → Telegram (send /set_report_chat to your bot to set it)."
                : reportMode === "custom"
                  ? "Enter the Telegram chat ID or @username to receive reports."
                  : "When the scheduled run finishes, you can send a report to a Telegram chat."}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : saveLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
