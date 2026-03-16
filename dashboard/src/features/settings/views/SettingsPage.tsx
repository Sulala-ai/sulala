import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { LayoutDashboardIcon, ListTodoIcon, ScrollTextIcon, SendIcon, ChevronDownIcon, ChevronRightIcon, LockIcon, CopyIcon } from "lucide-react"
import { TasksPage } from "@/features/tasks"
import { SetupDocSheet } from "@/components/setup-doc-sheet"
import { LogsPage } from "@/features/logs"
import { AiProviderForm } from "@/features/settings/components/AiProviderForm"
import { cn } from "@/lib/utils"

const BASE = import.meta.env.VITE_AGENT_OS_API ?? "http://0.0.0.0:3010"

type SettingsSection = "dashboard_access" | "ai_provider" | "channels" | "telegram" | "slack" | "discord" | "signal" | "viber" | "tasks" | "logs"

const CHANNEL_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "channels", label: "Overview" },
  { id: "telegram", label: "Telegram" },
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
  { id: "signal", label: "Signal" },
  { id: "viber", label: "Viber" },
]

const TOP_NAV_BEFORE_CHANNELS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard_access", label: "Dashboard access", icon: <LockIcon className="size-4" /> },
  { id: "ai_provider", label: "AI Provider", icon: <LayoutDashboardIcon className="size-4" /> },
]
const TOP_NAV_AFTER_CHANNELS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: "tasks", label: "Tasks", icon: <ListTodoIcon className="size-4" /> },
  { id: "logs", label: "Logs", icon: <ScrollTextIcon className="size-4" /> },
]

const isChannelSection = (s: SettingsSection) => s === "channels" || s === "telegram" || s === "slack" || s === "discord" || s === "signal" || s === "viber"

/** OpenFang-style 3-step indicator: Configure → Verify → Ready */
function ChannelStepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Configure" },
    { n: 2, label: "Verify" },
    { n: 3, label: "Ready" },
  ]
  return (
    <div className="flex items-center gap-2 text-sm mb-4">
      {steps.map(({ n, label }) => (
        <span key={n} className="flex items-center gap-2">
          <span
            className={cn(
              "font-medium",
              n === currentStep ? "text-primary" : "text-muted-foreground"
            )}
          >
            {n} {label}
          </span>
          {n < 3 && <span className="text-muted-foreground">→</span>}
        </span>
      ))}
    </div>
  )
}

function SettingsOverview() {
  return <AiProviderForm />
}

function SettingsDashboardAccess() {
  const [regenerating, setRegenerating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleRegenerate() {
    setRegenerating(true)
    setNewToken(null)
    setMessage(null)
    try {
      const res = await api.regenerateDashboardToken()
      setNewToken(res.token)
      setMessage(res.message)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setRegenerating(false)
    }
  }

  function handleCopy() {
    if (!newToken) return
    void navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard login token</CardTitle>
          <CardDescription>
            The gateway token is used to log in to this dashboard. You can regenerate it here and copy the new token.
            After restarting the server, the new token will be required to log in; your current session stays valid until then.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate token"}
          </Button>
          {newToken && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <Label className="text-xs">New token (copy and save it)</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={newToken} className="font-mono text-sm" />
                <Button type="button" variant="outline" size="icon" onClick={handleCopy} title="Copy">
                  <CopyIcon className="size-4" />
                </Button>
              </div>
              {copied && <p className="text-xs text-green-600 dark:text-green-400">Copied to clipboard.</p>}
              {message && <p className="text-xs text-muted-foreground">{message}</p>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            You can also view or regenerate the token from the CLI: <code className="rounded bg-muted px-1">sulala dashboard-token</code> or <code className="rounded bg-muted px-1">sulala dashboard-token --regenerate</code>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsTelegram() {
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

  function loadStatus() {
    api.getTelegramStatus().then(setStatus).catch(() => setStatus(null))
  }

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAgents()])
      .then(([settings, agentsRes]) => {
        setTelegramConfigured(Boolean(settings.telegram_configured))
        setDefaultAgentId(settings.telegram_default_agent_id ?? "")
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

  if (loading) {
    return <div className="p-4 text-muted-foreground">Loading…</div>
  }

  return (
    <div className="space-y-6">
      <SetupDocSheet docKey="telegram-setup" title="How to set up Telegram" open={setupDocOpen} onOpenChange={setSetupDocOpen} />
      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
          <CardDescription>Paste your bot token from BotFather. For local dev the server uses polling (no HTTPS). For production, set a webhook in Advanced.</CardDescription>
          <ChannelStepIndicator currentStep={telegramStep} />
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
            onClick={() => setSetupDocOpen(true)}
          >
            <ChevronRightIcon className="size-4" />
            How to get credentials
          </button>
        </CardHeader>
        <CardContent>
          {status && status.configured && (
            <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">Status:</span>
                <span className="text-green-600 dark:text-green-400">
                  {status.webhook_set ? "Webhook connected" : "Using polling"}
                </span>
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
              {telegramConfigured && !botToken && (
                <p className="text-xs text-muted-foreground">Token is already set. Enter a new one to replace, or leave blank to keep it.</p>
              )}
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

function SettingsSignal() {
  const [bridgeUrl, setBridgeUrl] = useState("")
  const [defaultAgentId, setDefaultAgentId] = useState("")
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signalConfigured, setSignalConfigured] = useState(false)
  const [status, setStatus] = useState<{ configured: boolean } | null>(null)
  const [setupDocOpen, setSetupDocOpen] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAgents()])
      .then(([s, agentsRes]) => {
        setSignalConfigured(Boolean(s.signal_configured))
        setBridgeUrl(s.signal_bridge_url ?? "")
        setDefaultAgentId(s.signal_default_agent_id ?? "")
        setAgents(agentsRes.agents.map((a) => ({ id: a.id, name: a.name })))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!loading) api.getSignalStatus().then(setStatus).catch(() => setStatus(null))
  }, [loading])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    api
      .saveSettings({
        signal_bridge_url: bridgeUrl.trim() ? bridgeUrl.trim() : (signalConfigured ? undefined : null),
        signal_default_agent_id: defaultAgentId.trim() || null,
      })
      .then(() => {
        setSignalConfigured(Boolean(bridgeUrl.trim()))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        setTesting(true)
        api.getSignalStatus().then(setStatus).finally(() => setTimeout(() => setTesting(false), 800))
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  const signalStep: 1 | 2 | 3 = !status?.configured ? 1 : 3

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>
  return (
    <div className="space-y-6">
      <SetupDocSheet docKey="signal-setup" title="How to set up Signal" open={setupDocOpen} onOpenChange={setSetupDocOpen} />
      <Card>
        <CardHeader>
          <CardTitle>Signal</CardTitle>
          <CardDescription>
            Use a Signal bridge (e.g. signal-cli or signal-cli-api) that receives Signal messages and POSTs to our webhook. We reply via the bridge’s send endpoint.
          </CardDescription>
          <ChannelStepIndicator currentStep={signalStep} />
          <button type="button" className="flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => setSetupDocOpen(true)}>
            <ChevronRightIcon className="size-4" />
            How to get credentials
          </button>
        </CardHeader>
        <CardContent>
          {status?.configured && (
            <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">Status:</span>{" "}
              <span className="text-green-600 dark:text-green-400">Bridge URL set</span>
            </div>
          )}
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="signal-bridge-url">Bridge URL *</Label>
              <Input
                id="signal-bridge-url"
                type="url"
                autoComplete="off"
                placeholder={signalConfigured ? "Leave blank to keep current" : "http://localhost:8080"}
                value={bridgeUrl}
                onChange={(e) => setBridgeUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Base URL of the Signal bridge. The bridge must POST incoming messages to our webhook and expose POST /send with body {"{ to, text }"} for replies.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signal-agent">Default agent</Label>
              <select
                id="signal-agent"
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={defaultAgentId}
                onChange={(e) => setDefaultAgentId(e.target.value)}
              >
                <option value="">First agent (fallback)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all">Webhook URL (for bridge): {BASE}/api/channels/signal/webhook</p>
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

function SettingsViber() {
  const [authToken, setAuthToken] = useState("")
  const [defaultAgentId, setDefaultAgentId] = useState("")
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viberConfigured, setViberConfigured] = useState(false)
  const [status, setStatus] = useState<{ configured: boolean; webhook_set?: boolean; webhook_url?: string | null; error?: string } | null>(null)
  const [setupDocOpen, setSetupDocOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [webhookBaseUrl, setWebhookBaseUrl] = useState("")
  const [webhookError, setWebhookError] = useState<string | null>(null)
  const [settingWebhook, setSettingWebhook] = useState(false)

  const webhookUrl = BASE + "/api/channels/viber/webhook"

  function loadStatus() {
    api.getViberStatus().then(setStatus).catch(() => setStatus(null))
  }

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAgents()])
      .then(([s, agentsRes]) => {
        setViberConfigured(Boolean(s.viber_configured))
        setDefaultAgentId(s.viber_default_agent_id ?? "")
        setAgents(agentsRes.agents.map((a) => ({ id: a.id, name: a.name })))
        if (!s.viber_configured) setAuthToken("")
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!loading) loadStatus()
  }, [loading])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    api
      .saveSettings({
        viber_auth_token: authToken.trim() || (viberConfigured ? undefined : null),
        viber_default_agent_id: defaultAgentId.trim() || null,
      })
      .then(() => {
        setViberConfigured(Boolean(authToken.trim()))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        setTesting(true)
        loadStatus()
        setTimeout(() => setTesting(false), 800)
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  const viberStep: 1 | 2 | 3 = !status?.configured ? 1 : status?.error ? 2 : 3

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>
  return (
    <div className="space-y-6">
      <SetupDocSheet docKey="viber-setup" title="How to set up Viber" open={setupDocOpen} onOpenChange={setSetupDocOpen} />
      <Card>
        <CardHeader>
          <CardTitle>Viber</CardTitle>
          <CardDescription>Paste your Viber bot auth token. Viber requires a public HTTPS URL for the webhook—set it in Advanced.</CardDescription>
          <ChannelStepIndicator currentStep={viberStep} />
          <button type="button" className="flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => setSetupDocOpen(true)}>
            <ChevronRightIcon className="size-4" />
            How to get credentials
          </button>
        </CardHeader>
        <CardContent>
          {status?.configured && (
            <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">Status:</span>
                <span className={status.webhook_set ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                  {status.webhook_set ? "Webhook connected" : "Webhook not set"}
                </span>
                {status.webhook_url && <span className="text-muted-foreground truncate max-w-[200px]" title={status.webhook_url}>{status.webhook_url}</span>}
                {status.error && <span className="text-destructive">{status.error}</span>}
                <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={loadStatus}>Refresh</Button>
              </div>
            </div>
          )}
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="viber-token">Auth token *</Label>
              <Input
                id="viber-token"
                type="password"
                autoComplete="off"
                placeholder={viberConfigured ? "•••••••• (leave blank to keep)" : "Paste auth token…"}
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">From Viber: More → Settings → Bots → Edit Info → Your app key.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="viber-agent">Default agent</Label>
              <select
                id="viber-agent"
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={defaultAgentId}
                onChange={(e) => setDefaultAgentId(e.target.value)}
              >
                <option value="">First agent (fallback)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Button type="button" variant="ghost" size="sm" className="px-0 text-muted-foreground" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? <ChevronDownIcon className="size-4 mr-1 inline" /> : <ChevronRightIcon className="size-4 mr-1 inline" />}
                {showAdvanced ? "Hide advanced" : "Show advanced"}
              </Button>
              {showAdvanced && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <Label>Webhook (required for Viber)</Label>
                  <p className="text-xs text-muted-foreground">Viber requires a public HTTPS URL. Use ngrok or your domain.</p>
                  <p className="text-sm font-mono break-all bg-muted/50 rounded px-2 py-1.5">{webhookUrl}</p>
                  {status?.configured && (
                    <div className="flex flex-wrap items-end gap-2 pt-2">
                      <div className="flex-1 min-w-[200px] space-y-1">
                        <Label htmlFor="viber-webhook-base" className="text-xs">Public base URL (HTTPS)</Label>
                        <Input
                          id="viber-webhook-base"
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
                          api.setViberWebhook(webhookBaseUrl.trim())
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

function SettingsChannelsOverview({ onConfigure }: { onConfigure: (s: SettingsSection) => void }) {
  const [settings, setSettings] = useState<{
    telegram_configured?: boolean
    slack_configured?: boolean
    discord_configured?: boolean
    signal_configured?: boolean
    viber_configured?: boolean
  } | null>(null)
  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => setSettings(null))
  }, [])
  const channels: { id: SettingsSection; name: string; configured: boolean }[] = [
    { id: "telegram", name: "Telegram", configured: Boolean(settings?.telegram_configured) },
    { id: "slack", name: "Slack", configured: Boolean(settings?.slack_configured) },
    { id: "discord", name: "Discord", configured: Boolean(settings?.discord_configured) },
    { id: "signal", name: "Signal", configured: Boolean(settings?.signal_configured) },
    { id: "viber", name: "Viber", configured: Boolean(settings?.viber_configured) },
  ]
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            Connect messaging platforms so users can talk to your agent from Telegram, Slack, Discord, Signal, or Viber. Configure each channel below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 min-w-[200px]"
              >
                <div>
                  <p className="font-medium">{ch.name}</p>
                  <p className={cn("text-xs", ch.configured ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                    {ch.configured ? "Configured" : "Not configured"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onConfigure(ch.id)}>
                  Configure
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SettingsSlack() {
  const [botToken, setBotToken] = useState("")
  const [signingSecret, setSigningSecret] = useState("")
  const [defaultAgentId, setDefaultAgentId] = useState("")
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slackConfigured, setSlackConfigured] = useState(false)
  const [status, setStatus] = useState<{ configured: boolean } | null>(null)
  const [setupDocOpen, setSetupDocOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAgents()])
      .then(([s, agentsRes]) => {
        setSlackConfigured(Boolean(s.slack_configured))
        setDefaultAgentId(s.slack_default_agent_id ?? "")
        setAgents(agentsRes.agents.map((a) => ({ id: a.id, name: a.name })))
        if (!s.slack_configured) setBotToken("")
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!loading) api.getSlackStatus().then(setStatus).catch(() => setStatus(null))
  }, [loading])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    api
      .saveSettings({
        slack_bot_token: botToken.trim() || null,
        slack_signing_secret: signingSecret.trim() || null,
        slack_default_agent_id: defaultAgentId.trim() || null,
      })
      .then(() => {
        setSlackConfigured(Boolean(botToken.trim()))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        setTesting(true)
        api.getSlackStatus().then(setStatus).finally(() => setTimeout(() => setTesting(false), 800))
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  const slackStep: 1 | 2 | 3 = !status?.configured ? 1 : 3

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>
  return (
    <div className="space-y-6">
      <SetupDocSheet docKey="slack-setup" title="How to set up Slack" open={setupDocOpen} onOpenChange={setSetupDocOpen} />
      <Card>
        <CardHeader>
          <CardTitle>Slack</CardTitle>
          <CardDescription>Paste your bot token from the Slack Developer Portal. Set the Events API Request URL to your webhook.</CardDescription>
          <ChannelStepIndicator currentStep={slackStep} />
          <button type="button" className="flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => setSetupDocOpen(true)}>
            <ChevronRightIcon className="size-4" />
            How to get credentials
          </button>
        </CardHeader>
        <CardContent>
          {status?.configured && (
            <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">Status:</span>{" "}
              <span className="text-green-600 dark:text-green-400">Bot token set</span>
            </div>
          )}
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="slack-token">Bot token (xoxb-…) *</Label>
              <Input
                id="slack-token"
                type="password"
                autoComplete="off"
                placeholder={slackConfigured ? "•••••••• (leave blank to keep)" : "xoxb-…"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Button type="button" variant="ghost" size="sm" className="px-0 text-muted-foreground" onClick={() => setShowAdvanced(!showAdvanced)}>
                {showAdvanced ? <ChevronDownIcon className="size-4 mr-1 inline" /> : <ChevronRightIcon className="size-4 mr-1 inline" />}
                {showAdvanced ? "Hide advanced" : "Show advanced"}
              </Button>
              {showAdvanced && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <Label htmlFor="slack-signing-secret">Signing secret</Label>
                  <Input
                    id="slack-signing-secret"
                    type="password"
                    autoComplete="off"
                    placeholder="From app Basic Information → Signing Secret"
                    value={signingSecret}
                    onChange={(e) => setSigningSecret(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Required to verify requests from Slack. Find it in your app’s Basic Info.</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-agent">Default agent</Label>
              <select
                id="slack-agent"
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={defaultAgentId}
                onChange={(e) => setDefaultAgentId(e.target.value)}
              >
                <option value="">First agent (fallback)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all">Webhook URL: {BASE}/api/channels/slack/webhook</p>
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

function SettingsDiscord() {
  const [botToken, setBotToken] = useState("")
  const [publicKey, setPublicKey] = useState("")
  const [defaultAgentId, setDefaultAgentId] = useState("")
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discordConfigured, setDiscordConfigured] = useState(false)
  const [status, setStatus] = useState<{ configured: boolean } | null>(null)
  const [setupDocOpen, setSetupDocOpen] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAgents()])
      .then(([s, agentsRes]) => {
        setDiscordConfigured(Boolean(s.discord_configured))
        setDefaultAgentId(s.discord_default_agent_id ?? "")
        setAgents(agentsRes.agents.map((a) => ({ id: a.id, name: a.name })))
        if (!s.discord_configured) setBotToken("")
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    if (!loading) api.getDiscordStatus().then(setStatus).catch(() => setStatus(null))
  }, [loading])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    api
      .saveSettings({
        discord_bot_token: botToken.trim() || null,
        discord_public_key: publicKey.trim() || null,
        discord_default_agent_id: defaultAgentId.trim() || null,
      })
      .then(() => {
        setDiscordConfigured(Boolean(botToken.trim()))
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        setTesting(true)
        api.getDiscordStatus().then(setStatus).finally(() => setTimeout(() => setTesting(false), 800))
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  const discordStep: 1 | 2 | 3 = !status?.configured ? 1 : 3

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>
  return (
    <div className="space-y-6">
      <SetupDocSheet docKey="discord-setup" title="How to set up Discord" open={setupDocOpen} onOpenChange={setSetupDocOpen} />
      <Card>
        <CardHeader>
          <CardTitle>Discord</CardTitle>
          <CardDescription>Paste your bot token and application public key from the Discord Developer Portal. Set the Interactions endpoint URL to your webhook.</CardDescription>
          <ChannelStepIndicator currentStep={discordStep} />
          <button type="button" className="flex items-center gap-1 text-sm text-primary hover:underline" onClick={() => setSetupDocOpen(true)}>
            <ChevronRightIcon className="size-4" />
            How to get credentials
          </button>
        </CardHeader>
        <CardContent>
          {status?.configured && (
            <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="font-medium">Status:</span>{" "}
              <span className="text-green-600 dark:text-green-400">Bot token set</span>
            </div>
          )}
          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="discord-token">Bot token *</Label>
              <Input
                id="discord-token"
                type="password"
                autoComplete="off"
                placeholder={discordConfigured ? "•••••••• (leave blank to keep)" : "Paste bot token…"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="discord-public-key">Application public key (hex) *</Label>
              <Input
                id="discord-public-key"
                type="text"
                autoComplete="off"
                placeholder="64-char hex from Developer Portal → General Information"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Required to verify interaction requests. Copy from your app’s General Information.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discord-agent">Default agent</Label>
              <select
                id="discord-agent"
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm"
                value={defaultAgentId}
                onChange={(e) => setDefaultAgentId(e.target.value)}
              >
                <option value="">First agent (fallback)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground font-mono break-all">Interactions URL: {BASE}/api/channels/discord/webhook</p>
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

export function SettingsPage() {
  const [section, setSection] = useState<SettingsSection>("ai_provider")
  const channelsOpen = isChannelSection(section)

  return (
    <div className="flex flex-1 min-h-0">
      <nav className="w-52 shrink-0 border-r bg-muted/30 p-3 flex flex-col gap-0.5">
        {TOP_NAV_BEFORE_CHANNELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
              section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="pt-1 mt-1 border-t border-border/50">
          <button
            type="button"
            onClick={() => setSection("channels")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
              channelsOpen ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {channelsOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            <SendIcon className="size-4" />
            Channels
          </button>
          {channelsOpen && (
            <div className="ml-3 mt-0.5 flex flex-col gap-0.5">
              {CHANNEL_SECTIONS.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSection(sub.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors w-full text-left",
                    section === sub.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {TOP_NAV_AFTER_CHANNELS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
              section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6">
          {section === "dashboard_access" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Dashboard access</h1>
                <p className="text-muted-foreground text-sm">
                  Manage the gateway token used to log in to this dashboard. Regenerate here or via the CLI.
                </p>
              </div>
              <SettingsDashboardAccess />
            </>
          )}
          {section === "ai_provider" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Settings</h1>
                <p className="text-muted-foreground text-sm">
                  Configure your AI provider and API key. Agents use this for LLM and agent-suggestion calls.
                </p>
              </div>
              <SettingsOverview />
            </>
          )}
          {section === "channels" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Channels</h1>
                <p className="text-muted-foreground text-sm">
                  Connect Telegram, Slack, or Discord so users can talk to your agent from those platforms.
                </p>
              </div>
              <SettingsChannelsOverview onConfigure={setSection} />
            </>
          )}
          {section === "telegram" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Telegram</h1>
                <p className="text-muted-foreground text-sm">
                  Connect a Telegram bot to talk to your agent from Telegram.
                </p>
              </div>
              <SettingsTelegram />
            </>
          )}
          {section === "slack" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Slack</h1>
                <p className="text-muted-foreground text-sm">
                  Connect Slack so users can message your agent in channels or DMs.
                </p>
              </div>
              <SettingsSlack />
            </>
          )}
          {section === "discord" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Discord</h1>
                <p className="text-muted-foreground text-sm">
                  Connect Discord via a slash command (e.g. /chat) to talk to your agent.
                </p>
              </div>
              <SettingsDiscord />
            </>
          )}
          {section === "signal" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Signal</h1>
                <p className="text-muted-foreground text-sm">
                  Connect Signal via a bridge (e.g. signal-cli) so users can message your agent.
                </p>
              </div>
              <SettingsSignal />
            </>
          )}
          {section === "viber" && (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-semibold">Viber</h1>
                <p className="text-muted-foreground text-sm">
                  Connect a Viber bot so users can message your agent from Viber.
                </p>
              </div>
              <SettingsViber />
            </>
          )}
          {section === "tasks" && <TasksPage />}
          {section === "logs" && <LogsPage />}
        </div>
      </main>
    </div>
  )
}
