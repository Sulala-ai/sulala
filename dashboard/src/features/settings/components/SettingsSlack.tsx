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

export function SettingsSlack() {
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
