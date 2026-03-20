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

export function SettingsViber() {
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
