import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { SetupDocSheet } from "@/components/setup-doc-sheet"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import { ChannelStepIndicator } from "./ChannelStepIndicator"

const BASE = import.meta.env.VITE_AGENT_OS_API ?? "http://127.0.0.1:3010"

export function SettingsTelegram() {
  const [botToken, setBotToken] = useState("")
  const [defaultAgentId, setDefaultAgentId] = useState("")
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [telegramConfigured, setTelegramConfigured] = useState(false)
  const [status, setStatus] = useState<{ configured: boolean; webhook_set: boolean; webhook_url: string | null; error?: string } | null>(null)
  const [webhookBaseUrl, setWebhookBaseUrl] = useState("")
  const [settingWebhook, setSettingWebhook] = useState(false)
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [setupDocOpen, setSetupDocOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testing, setTesting] = useState(false)
  const [telegramReportChatId, setTelegramReportChatId] = useState<string | null>(null)

  function loadStatus() {
    api.getTelegramStatus().then(setStatus).catch(() => setStatus(null))
  }

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAgents()])
      .then(([settings, agentsRes]) => {
        setTelegramConfigured(Boolean(settings.telegram_configured))
        setDefaultAgentId(settings.telegram_default_agent_id ?? "")
        setTelegramReportChatId(settings.telegram_report_chat_id ?? null)
        setAgents(agentsRes.agents.map((a) => ({ id: a.id, name: a.name })))
        if (!settings.telegram_configured) setBotToken("")
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!loading) loadStatus()
  }, [loading])

  const defaultWebhookBase = BASE.replace(/\/$/, "")
  const webhookUrl = `${defaultWebhookBase}/api/channels/telegram/webhook`

  useEffect(() => {
    if (!webhookBaseUrl && defaultWebhookBase) setWebhookBaseUrl(defaultWebhookBase)
  }, [defaultWebhookBase])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    api
      .saveSettings({
        telegram_bot_token: botToken.trim() || null,
        telegram_default_agent_id: defaultAgentId.trim() || null,
      })
      .then(() => {
        setTelegramConfigured(Boolean(botToken.trim()))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        setTesting(true)
        loadStatus()
        setTimeout(() => setTesting(false), 1500)
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  const telegramStep: 1 | 2 | 3 = !status?.configured ? 1 : status?.error ? 2 : 3
  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>

  return (
    <div className="space-y-6">
      <SetupDocSheet docKey="telegram-setup" title="How to set up Telegram" open={setupDocOpen} onOpenChange={setSetupDocOpen} />
      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Paste your bot token from BotFather. For local dev the server uses polling (no HTTPS). For production, set a webhook in Advanced.</CardDescription>
          <ChannelStepIndicator currentStep={telegramStep} />
          <button type="button" className="flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => setSetupDocOpen(true)}>
            <ChevronRightIcon className="size-4" />
            How to get credentials
          </button>
        </CardHeader>
        <CardContent>
          {status && status.configured && (
            <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">Status:</span>
                <span className="text-green-600 dark:text-green-400">{status.webhook_set ? "Webhook connected" : "Using polling"}</span>
                {status.webhook_url && <span className="text-muted-foreground truncate max-w-[200px]" title={status.webhook_url}>{status.webhook_url}</span>}
                {status.error && <span className="text-destructive">{status.error}</span>}
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={loadStatus}>Refresh</Button>
              </div>
            </div>
          )}
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Bot token *</Label>
              <Input
                id="telegram-token"
                type="password"
                autoComplete="off"
                placeholder={telegramConfigured ? "•••••••• (leave blank to keep existing)" : "123456:ABC-DEF..."}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              {telegramConfigured && !botToken && <p className="text-xs text-muted-foreground">Token is already set. Enter a new one to replace, or leave blank to keep it.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="telegram-agent">Default agent</Label>
              <select
                id="telegram-agent"
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={defaultAgentId}
                onChange={(e) => setDefaultAgentId(e.target.value)}
              >
                <option value="">First agent (fallback)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">Agent that will reply to Telegram messages.</p>
            </div>
            <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-1">
              <p className="text-sm font-medium">Schedule reports</p>
              <p className="text-xs text-muted-foreground">
                To send schedule run reports to a Telegram chat without knowing your chat ID: open a chat with your bot and send <code className="rounded bg-muted px-1">/set_report_chat</code>. That chat will then be used when you choose &quot;Use channel from Settings&quot; in an agent or graph schedule.
              </p>
              <p className="text-xs text-muted-foreground">
                Current report chat: {telegramReportChatId ? <span className="font-mono">{telegramReportChatId}</span> : "Not set"}
              </p>
            </div>
            <div className="space-y-2">
              <Button type="button" variant="ghost" size="sm" className="px-0 text-muted-foreground" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? <ChevronDownIcon className="size-4 mr-1 inline" /> : <ChevronRightIcon className="size-4 mr-1 inline" />}
                {showAdvanced ? "Hide advanced" : "Show advanced"}
              </Button>
              {showAdvanced && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <Label>Webhook (optional, for production)</Label>
                  <p className="text-xs text-muted-foreground">Only needed when you have a public HTTPS URL. If unset, the server uses polling.</p>
                  <p className="text-sm font-mono break-all bg-muted/50 rounded px-2 py-1.5">{webhookUrl}</p>
                  {status?.configured && !status?.webhook_set && (
                    <div className="flex flex-wrap items-end gap-2 pt-2">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <Label htmlFor="webhook-base" className="text-xs">Public base URL (HTTPS)</Label>
                        <Input
                          id="webhook-base"
                          type="url"
                          placeholder="https://your-ngrok-or-domain.com"
                          value={webhookBaseUrl}
                          onChange={(e) => { setWebhookBaseUrl(e.target.value); setWebhookError(null) }}
                          className="font-mono text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        disabled={settingWebhook || !webhookBaseUrl.trim()}
                        onClick={() => {
                          setWebhookError(null)
                          setSettingWebhook(true)
                          api.setTelegramWebhook(webhookBaseUrl.trim())
                            .then((r) => { if (r.ok) loadStatus(); else setWebhookError(r.error ?? "Failed") })
                            .catch((e) => setWebhookError(e.message))
                            .finally(() => setSettingWebhook(false))
                        }}
                      >
                        {settingWebhook ? "Setting…" : "Set webhook"}
                      </Button>
                    </div>
                  )}
                  {webhookError && <p className="text-sm text-destructive">{webhookError}</p>}
                </div>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : testing ? "Verifying…" : saved ? "Saved" : "Save & Test"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
