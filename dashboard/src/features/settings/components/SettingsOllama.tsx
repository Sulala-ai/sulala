import { useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { api, type OllamaPullProgress } from "@/lib/api"
import { ExternalLinkIcon, Loader2Icon } from "lucide-react"

export type SettingsOllamaProps = {
  compact?: boolean
  /** Called when enabled flag or save changes the effective “has local AI” state. */
  onOllamaConfigured?: (enabled: boolean) => void
}

export function SettingsOllama({ compact, onOllamaConfigured }: SettingsOllamaProps) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:11434/v1")
  const [defaultModel, setDefaultModel] = useState("qwen3")
  const [apiKey, setApiKey] = useState("")
  const [touchedKey, setTouchedKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [cliInstalled, setCliInstalled] = useState(false)
  const [reachable, setReachable] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [pullProgress, setPullProgress] = useState<OllamaPullProgress | null>(null)
  const pullAbortRef = useRef<AbortController | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  function refreshStatus() {
    setStatusLoading(true)
    setActionMessage(null)
    api
      .getOllamaStatus()
      .then((s) => {
        setCliInstalled(s.cli_installed)
        setReachable(s.reachable)
        setVersion(s.version)
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setStatusLoading(false))
  }

  useEffect(() => {
    api
      .getSettings()
      .then((r) => {
        const en = r.ollama_enabled === true
        setEnabled(en)
        onOllamaConfigured?.(en)
        if (r.ollama_base_url) setBaseUrl(r.ollama_base_url)
        if (r.ollama_default_model) setDefaultModel(r.ollama_default_model)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on mount
  }, [])

  useEffect(() => {
    if (!loading) refreshStatus()
  }, [loading])

  function saveOllama(partial?: { enabled?: boolean }) {
    setError(null)
    setSaving(true)
    const en = partial?.enabled !== undefined ? partial.enabled : enabled
    api
      .saveSettings({
        ollama_enabled: en,
        ollama_base_url: baseUrl.trim() || null,
        ollama_default_model: defaultModel.trim() || null,
        ollama_api_key: touchedKey ? apiKey.trim() || null : undefined,
      })
      .then(() => {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        setTouchedKey(false)
        setApiKey("")
        onOllamaConfigured?.(en)
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  function handleInstall() {
    setInstalling(true)
    setActionMessage(null)
    setError(null)
    api
      .installOllama()
      .then((r) => {
        setActionMessage(r.message)
        refreshStatus()
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setInstalling(false))
  }

  function formatPullStatus(status: string): string {
    if (!status) return "Downloading…"
    if (status === "success") return "Complete"
    if (status === "connecting") return "Connecting…"
    return status.replace(/_/g, " ")
  }

  function cancelPull() {
    pullAbortRef.current?.abort()
  }

  async function handlePull() {
    const tag = defaultModel.trim() || "qwen3"
    setPulling(true)
    setPullProgress({ percent: null, status: "connecting" })
    setActionMessage(null)
    setError(null)
    const ac = new AbortController()
    pullAbortRef.current = ac
    try {
      const r = await api.pullOllamaModelStream(tag, (p) => setPullProgress(p), ac.signal)
      if (!r.ok) {
        setError(r.error ?? "Pull failed")
        setPullProgress(null)
      } else {
        setActionMessage(`Pulled ${tag}`)
        setPullProgress(null)
        refreshStatus()
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setActionMessage("Pull cancelled")
      } else {
        setError(e instanceof Error ? e.message : String(e))
      }
      setPullProgress(null)
    } finally {
      setPulling(false)
      pullAbortRef.current = null
    }
  }

  if (loading) {
    return <div className={compact ? "text-sm text-muted-foreground" : "p-4 text-muted-foreground"}>Loading Ollama settings…</div>
  }

  const inner = (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Checkbox
          id="ollama-enabled"
          checked={enabled}
          onCheckedChange={(v) => {
            const next = v === true
            setEnabled(next)
            saveOllama({ enabled: next })
          }}
          disabled={saving}
        />
        <div className="space-y-1 leading-none">
          <Label htmlFor="ollama-enabled" className="cursor-pointer font-medium">
            Use local Ollama
          </Label>
          <p className="text-xs text-muted-foreground font-normal">
            Free, on-device models. Agent model ids use the prefix <code className="text-xs">ollama/</code> (e.g.{" "}
            <code className="text-xs">ollama/qwen3</code>).
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ollama-base">OpenAI-compatible base URL</Label>
          <Input
            id="ollama-base"
            className="font-mono text-sm"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:11434/v1"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ollama-model">Default model tag</Label>
          <Input
            id="ollama-model"
            className="font-mono text-sm"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            placeholder="qwen3"
          />
          <p className="text-xs text-muted-foreground">Without the ollama/ prefix. Used for new system agents and suggestions.</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ollama-key">Ollama API key (optional)</Label>
        <Input
          id="ollama-key"
          type="password"
          autoComplete="off"
          className="font-mono text-sm"
          placeholder="Usually empty for local"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value)
            setTouchedKey(true)
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button type="button" variant="secondary" size="sm" disabled={saving || statusLoading} onClick={() => refreshStatus()}>
          {statusLoading ? <Loader2Icon className="size-4 animate-spin" /> : "Test connection"}
        </Button>
        <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => saveOllama()}>
          {saved ? "Saved" : saving ? "Saving…" : "Save"}
        </Button>
        {!cliInstalled && (
          <Button type="button" size="sm" disabled={installing} onClick={handleInstall}>
            {installing ? "Installing…" : "Install Ollama"}
          </Button>
        )}
        {(cliInstalled || reachable) && (
          <>
            <Button type="button" variant="outline" size="sm" disabled={pulling} onClick={() => void handlePull()}>
              {pulling ? "Pulling…" : `Pull ${defaultModel.trim() || "qwen3"}`}
            </Button>
            {pulling && (
              <Button type="button" variant="ghost" size="sm" onClick={cancelPull}>
                Cancel
              </Button>
            )}
          </>
        )}
        <a
          href="https://ollama.com/download"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          Download / docs
          <ExternalLinkIcon className="size-3" />
        </a>
      </div>

      {pullProgress && (
        <div className="space-y-2 rounded-md border bg-muted/40 p-3">
          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate font-medium text-foreground" title={pullProgress.status}>
              {formatPullStatus(pullProgress.status)}
            </span>
            {pullProgress.percent != null && (
              <span className="shrink-0 tabular-nums text-foreground">{pullProgress.percent}%</span>
            )}
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {pullProgress.percent != null ? (
              <div
                className="h-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${pullProgress.percent}%` }}
              />
            ) : (
              <div className="h-full w-1/3 max-w-[45%] animate-pulse rounded-full bg-primary/80" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Live download progress from Ollama (layers show a percentage when size is known; otherwise the bar pulses until the next update).
          </p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Status:{" "}
        {statusLoading ? (
          "checking…"
        ) : (
          <>
            CLI {cliInstalled ? "installed" : "not found"}
            {reachable ? ` · daemon reachable${version ? ` (${version})` : ""}` : " · daemon not reachable (start Ollama or check the URL)"}
          </>
        )}
      </p>
      {actionMessage && <p className="text-sm text-muted-foreground">{actionMessage}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!compact && (
        <p className="text-xs text-muted-foreground">
          Install uses Homebrew on macOS or the official script on Linux. Windows: use the download link. Vector memory embeddings still expect a cloud key unless you configure a compatible embedding endpoint separately.
        </p>
      )}
    </div>
  )

  if (compact) {
    return <div className="rounded-lg border bg-muted/30 p-4 space-y-3">{inner}</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local Ollama</CardTitle>
        <CardDescription>
          Run open models on your machine. After install, pull a model (e.g. qwen3) and create agents with provider Ollama or model id{" "}
          <code className="text-xs">ollama/qwen3</code>.
        </CardDescription>
      </CardHeader>
      <CardContent>{inner}</CardContent>
    </Card>
  )
}
