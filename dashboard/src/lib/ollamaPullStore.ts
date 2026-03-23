import { api, type OllamaPullProgress } from "@/lib/api"

export type OllamaPullStoreState = {
  pulling: boolean
  /** Model tag being pulled (no ollama/ prefix). */
  modelTag: string | null
  progress: OllamaPullProgress | null
  pullError: string | null
  pullActionMessage: string | null
}

const initial: OllamaPullStoreState = {
  pulling: false,
  modelTag: null,
  progress: null,
  pullError: null,
  pullActionMessage: null,
}

let state: OllamaPullStoreState = initial
const listeners = new Set<() => void>()
let abortRef: AbortController | null = null
/** Bumps on each new pull so stale async completions cannot overwrite newer pulls. */
let pullGeneration = 0

function emit() {
  for (const l of listeners) l()
}

function setState(partial: Partial<OllamaPullStoreState>) {
  state = { ...state, ...partial }
  emit()
}

export function subscribeOllamaPull(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getOllamaPullSnapshot(): OllamaPullStoreState {
  return state
}

/** Stable snapshot for SSR / hydration (dashboard is client-only but satisfies useSyncExternalStore). */
export function getOllamaPullServerSnapshot(): OllamaPullStoreState {
  return initial
}

export function cancelOllamaPull() {
  abortRef?.abort()
}

export type StartOllamaPullOptions = {
  onComplete?: () => void
}

/**
 * Starts (or replaces) a background Ollama model pull. State survives route changes so the
 * progress UI can remount and stay in sync until the stream finishes.
 */
export function startOllamaPull(modelTag: string, options?: StartOllamaPullOptions) {
  const tag = modelTag.trim() || "qwen3"
  cancelOllamaPull()
  pullGeneration += 1
  const gen = pullGeneration

  setState({
    pulling: true,
    modelTag: tag,
    progress: { percent: null, status: "connecting" },
    pullError: null,
    pullActionMessage: null,
  })

  const ac = new AbortController()
  abortRef = ac

  void (async () => {
    try {
      const r = await api.pullOllamaModelStream(
        tag,
        (p: OllamaPullProgress) => {
          if (gen === pullGeneration) setState({ progress: p })
        },
        ac.signal
      )
      if (gen !== pullGeneration) return
      if (!r.ok) {
        setState({
          pulling: false,
          progress: null,
          pullError: r.error ?? "Pull failed",
          pullActionMessage: null,
        })
      } else {
        setState({
          pulling: false,
          progress: null,
          pullError: null,
          pullActionMessage: `Pulled ${tag}`,
        })
        options?.onComplete?.()
      }
    } catch (e) {
      if (gen !== pullGeneration) return
      if (e instanceof Error && e.name === "AbortError") {
        setState({
          pulling: false,
          progress: null,
          pullError: null,
          pullActionMessage: "Pull cancelled",
        })
      } else {
        setState({
          pulling: false,
          progress: null,
          pullError: e instanceof Error ? e.message : String(e),
          pullActionMessage: null,
        })
      }
    } finally {
      if (abortRef === ac) abortRef = null
    }
  })()
}
