import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { ExternalLinkIcon } from "lucide-react"
import { SettingsOllama } from "@/features/settings/components/SettingsOllama"

const AI_PROVIDER_OPTIONS: {
  id: "openai" | "anthropic" | "google" | "openrouter"
  label: string
  getKeyUrl: string
  envVar: string
  hint: string
}[] = [
  { id: "openai", label: "OpenAI", getKeyUrl: "https://platform.openai.com/api-keys", envVar: "OPENAI_API_KEY", hint: "GPT-4, GPT-4o. Used when agent model is e.g. gpt-4o-mini." },
  { id: "anthropic", label: "Anthropic", getKeyUrl: "https://console.anthropic.com/settings/keys", envVar: "ANTHROPIC_API_KEY", hint: "Claude. Set this when your agent uses Anthropic as provider; or use OpenRouter key with model anthropic/claude-*." },
  { id: "google", label: "Google (Gemini)", getKeyUrl: "https://aistudio.google.com/app/apikey", envVar: "GOOGLE_GENERATIVE_AI_API_KEY", hint: "Gemini. Set this when your agent uses Google (Gemini) as provider; or use OpenRouter with model google/gemini-*." },
  { id: "openrouter", label: "OpenRouter", getKeyUrl: "https://openrouter.ai/keys", envVar: "OPENROUTER_API_KEY", hint: "One key for 400+ models (OpenAI, Claude, Gemini via e.g. openai/gpt-4o, anthropic/claude-3.5-sonnet)." },
]

export type AiProviderFormProps = {
  /** When true, hide the card wrapper and long description (for onboarding). */
  compact?: boolean
  /** Called when the form loads or after save so parent knows if at least one key is set. */
  onHasKeyChange?: (hasKey: boolean) => void
}

export function AiProviderForm({ compact, onHasKeyChange }: AiProviderFormProps) {
  const [hasKeys, setHasKeys] = useState<Record<string, boolean>>({})
  const [ollamaEnabled, setOllamaEnabled] = useState(false)
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [customBase, setCustomBase] = useState("")
  const [customDefaultModel, setCustomDefaultModel] = useState("")
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .getSettings()
      .then((r) => {
        setHasKeys({
          openai: r.has_openai_key ?? false,
          anthropic: r.has_anthropic_key ?? false,
          google: r.has_google_key ?? false,
          openrouter: r.has_openrouter_key ?? false,
          custom_openai: Boolean(r.custom_openai_base_url?.trim() && r.has_custom_openai_key),
        })
        setOllamaEnabled(r.ollama_enabled === true)
        setCustomBase(r.custom_openai_base_url ?? "")
        setCustomDefaultModel(r.custom_openai_default_model ?? "")
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (loading) return
    const hasCloud = AI_PROVIDER_OPTIONS.some((o) => hasKeys[o.id])
    const hasCustom = Boolean(hasKeys.custom_openai)
    onHasKeyChange?.(hasCloud || ollamaEnabled || hasCustom)
  }, [loading, hasKeys, ollamaEnabled, onHasKeyChange])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const payload: {
      openai_api_key?: string | null
      anthropic_api_key?: string | null
      google_api_key?: string | null
      openrouter_api_key?: string | null
      custom_openai_base_url?: string | null
      custom_openai_api_key?: string | null
      custom_openai_default_model?: string | null
    } = {}
    if (touched.openai) payload.openai_api_key = keys.openai?.trim() || null
    if (touched.anthropic) payload.anthropic_api_key = keys.anthropic?.trim() || null
    if (touched.google) payload.google_api_key = keys.google?.trim() || null
    if (touched.openrouter) payload.openrouter_api_key = keys.openrouter?.trim() || null
    if (touched.custom_base) payload.custom_openai_base_url = customBase.trim() || null
    if (touched.custom_key) payload.custom_openai_api_key = keys.custom_openai?.trim() || null
    if (touched.custom_default) payload.custom_openai_default_model = customDefaultModel.trim() || null
    api
      .saveSettings(payload)
      .then(() => api.getSettings())
      .then((r) => {
        setHasKeys({
          openai: r.has_openai_key ?? false,
          anthropic: r.has_anthropic_key ?? false,
          google: r.has_google_key ?? false,
          openrouter: r.has_openrouter_key ?? false,
          custom_openai: Boolean(r.custom_openai_base_url?.trim() && r.has_custom_openai_key),
        })
        setCustomBase(r.custom_openai_base_url ?? "")
        setCustomDefaultModel(r.custom_openai_default_model ?? "")
        setKeys((prev) => ({
          ...prev,
          ...Object.fromEntries(AI_PROVIDER_OPTIONS.filter((o) => touched[o.id]).map((o) => [o.id, ""])),
          ...(touched.custom_key ? { custom_openai: "" } : {}),
        }))
        setTouched({})
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      })
      .catch((e) => setError(e.message))
      .finally(() => setSaving(false))
  }

  if (loading) {
    return <div className="p-4 text-muted-foreground">Loading settings…</div>
  }

  const formContent = (
    <form className="space-y-6" onSubmit={handleSave}>
      {AI_PROVIDER_OPTIONS.map((opt) => (
        <div key={opt.id} className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={`api-key-${opt.id}`}>{opt.label}</Label>
            <a
              href={opt.getKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Get API key
              <ExternalLinkIcon className="size-3" />
            </a>
          </div>
          <Input
            id={`api-key-${opt.id}`}
            type="password"
            autoComplete="off"
            placeholder={hasKeys[opt.id] && !touched[opt.id] ? "•••••••• (leave blank to keep, or enter new to replace)" : `Paste ${opt.label} key…`}
            value={keys[opt.id] ?? ""}
            onChange={(e) => {
              setKeys((k) => ({ ...k, [opt.id]: e.target.value }))
              setTouched((t) => ({ ...t, [opt.id]: true }))
            }}
            className="font-mono text-sm"
          />
          {!compact && <p className="text-xs text-muted-foreground">{opt.hint}</p>}
        </div>
      ))}
      <div className="space-y-2 border-t pt-6">
        <Label htmlFor="custom-openai-base">Custom (OpenAI-compatible API)</Label>
        <Input
          id="custom-openai-base"
          type="url"
          autoComplete="off"
          placeholder="https://your-host/v1 or https://your-host ( /v1 added automatically )"
          value={customBase}
          onChange={(e) => {
            setCustomBase(e.target.value)
            setTouched((t) => ({ ...t, custom_base: true }))
          }}
          className="font-mono text-sm"
        />
        {!compact && (
          <p className="text-xs text-muted-foreground">
            Any OpenAI-compatible <code className="text-xs">/v1/chat/completions</code> endpoint. Use agent model id{" "}
            <code className="text-xs">custom/your-model-name</code>. Env: <code className="text-xs">CUSTOM_OPENAI_API_BASE</code>,{" "}
            <code className="text-xs">CUSTOM_OPENAI_API_KEY</code>.
          </p>
        )}
        <Label htmlFor="custom-openai-key" className="pt-2 block">
          API key (custom endpoint)
        </Label>
        <Input
          id="custom-openai-key"
          type="password"
          autoComplete="off"
          placeholder={
            hasKeys.custom_openai && !touched.custom_key
              ? "•••••••• (leave blank to keep, or enter new to replace)"
              : "Bearer token for the custom API…"
          }
          value={keys.custom_openai ?? ""}
          onChange={(e) => {
            setKeys((k) => ({ ...k, custom_openai: e.target.value }))
            setTouched((t) => ({ ...t, custom_key: true }))
          }}
          className="font-mono text-sm"
        />
        <Label htmlFor="custom-openai-default" className="pt-2 block">
          Default model name (optional)
        </Label>
        <Input
          id="custom-openai-default"
          type="text"
          autoComplete="off"
          placeholder="e.g. gpt-4o-mini (default installs use custom/ plus this name)"
          value={customDefaultModel}
          onChange={(e) => {
            setCustomDefaultModel(e.target.value)
            setTouched((t) => ({ ...t, custom_default: true }))
          }}
          className="font-mono text-sm"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={saving || !Object.keys(touched).length}>
        {saved ? "Saved" : saving ? "Saving…" : "Save"}
      </Button>
    </form>
  )

  const ollamaBlock = (
    <SettingsOllama
      compact={compact}
      onOllamaConfigured={(en) => {
        setOllamaEnabled(en)
      }}
    />
  )

  if (compact) {
    return (
      <div className="space-y-4">
        {formContent}
        {ollamaBlock}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI API keys</CardTitle>
          <CardDescription>
            Add API keys for the providers you use. Stored in ~/.agent-os on the server. Env vars override if set. Agents use OpenAI or OpenRouter depending on the model (e.g. openai/gpt-4o uses OpenRouter). For a private OpenAI-compatible server, set the custom base URL and key, then use model ids like custom/your-model.
          </CardDescription>
        </CardHeader>
        <CardContent>{formContent}</CardContent>
      </Card>
      {ollamaBlock}
    </div>
  )
}
