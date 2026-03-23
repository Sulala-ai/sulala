import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { AIModelOption } from "../ai-providers"

/**
 * Loads installed Ollama model tags from the server (GET /api/ollama/models → local daemon /api/tags).
 * Only fetches when `active` is true (e.g. user picked Ollama as provider).
 */
export function useOllamaModels(active: boolean): { options: AIModelOption[]; loading: boolean; error: string | null } {
  const [options, setOptions] = useState<AIModelOption[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) {
      setOptions([])
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    api
      .getOllamaModels()
      .then((r) => {
        if (!cancelled) setOptions(r.models ?? [])
      })
      .catch((e) => {
        if (!cancelled) {
          setOptions([])
          setError(e instanceof Error ? e.message : String(e))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [active])

  return { options, loading, error }
}
