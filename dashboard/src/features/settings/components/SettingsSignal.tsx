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

export function SettingsSignal() {
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
        signal_bridge_url: bridgeUrl.trim() ? bridgeUrl.trim() : signalConfigured ? undefined : null,
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
