import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { SetupDocSheet } from "@/components/setup-doc-sheet"
import { ChevronRightIcon } from "lucide-react"
import { ChannelStepIndicator } from "./ChannelStepIndicator"

const BASE = import.meta.env.VITE_AGENT_OS_API ?? "http://127.0.0.1:3010"

export function SettingsDiscord() {
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
