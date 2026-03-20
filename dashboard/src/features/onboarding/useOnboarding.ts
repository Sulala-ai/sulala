import { useCallback, useEffect, useState } from "react"
import { api, getWorkspaceStatus, setupWorkspace } from "@/lib/api"

export type OnboardingState = {
  /** Show the onboarding wizard (first run and not yet completed). */
  showWizard: boolean
  /** At least one AI API key is configured. */
  hasAnyAiKey: boolean
  /** At least one agent exists. */
  hasAnyAgent: boolean
  /** At least one channel is configured. */
  hasAnyChannel: boolean
  /** Loading settings and agents. */
  loading: boolean
  /** True while ensuring workspace (folders + DB + default agents) is ready. Shown as "Setting up workspace…". */
  settingUp: boolean
  /** If workspace could not be prepared (e.g. disk error). */
  workspaceError: string | null
  /** Re-fetch and recompute state (e.g. after completing a step). */
  refresh: () => void
  /** Mark onboarding as completed (persist to ~/.agent-os/config.json and refresh). */
  completeOnboarding: () => void
  /** Reset onboarding so wizard shows again (for testing). */
  resetOnboarding: () => void
}

/**
 * @param authReady When true, user is authenticated (or auth is disabled). Only then do we run workspace check and fetch settings/agents to avoid 401s before login.
 */
export function useOnboarding(authReady: boolean): OnboardingState {
  const [loading, setLoading] = useState(true)
  const [settingUp, setSettingUp] = useState(false)
  const [workspaceError, setWorkspaceError] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)
  const [hasAnyAiKey, setHasAnyAiKey] = useState(false)
  const [hasAnyAgent, setHasAnyAgent] = useState(false)
  const [hasAnyChannel, setHasAnyChannel] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    setWorkspaceError(null)
    Promise.all([api.getSettings(), api.getAgents()])
      .then(([settings, agentsRes]) => {
        const ai =
          Boolean(settings.has_openai_key) ||
          Boolean(settings.has_anthropic_key) ||
          Boolean(settings.has_google_key) ||
          Boolean(settings.has_openrouter_key) ||
          Boolean(settings.ollama_enabled)
        const channel =
          Boolean(settings.telegram_configured) ||
          Boolean(settings.slack_configured) ||
          Boolean(settings.discord_configured) ||
          Boolean(settings.signal_configured) ||
          Boolean(settings.viber_configured)
        setHasAnyAiKey(ai)
        setHasAnyAgent(agentsRes.agents.length > 0)
        setHasAnyChannel(channel)
        setShowWizard(!settings.onboarding_completed)
      })
      .catch(() => {
        setShowWizard(false)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!authReady) {
      setLoading(false)
      setShowWizard(false)
      return
    }
    let cancelled = false
    async function ensureWorkspaceThenRefresh() {
      setLoading(true)
      setWorkspaceError(null)
      try {
        const status = await getWorkspaceStatus()
        if (cancelled) return
        if (!status.ready) {
          setSettingUp(true)
          await setupWorkspace()
          if (cancelled) return
          const again = await getWorkspaceStatus()
          setSettingUp(false)
          if (cancelled) return
          if (!again.ready) {
            setWorkspaceError(again.error ?? "Workspace could not be prepared.")
            setLoading(false)
            return
          }
        }
        const [settings, agentsRes] = await Promise.all([api.getSettings(), api.getAgents()])
        if (cancelled) return
        const ai =
          Boolean(settings.has_openai_key) ||
          Boolean(settings.has_anthropic_key) ||
          Boolean(settings.has_google_key) ||
          Boolean(settings.has_openrouter_key) ||
          Boolean(settings.ollama_enabled)
        const channel =
          Boolean(settings.telegram_configured) ||
          Boolean(settings.slack_configured) ||
          Boolean(settings.discord_configured) ||
          Boolean(settings.signal_configured) ||
          Boolean(settings.viber_configured)
        setHasAnyAiKey(ai)
        setHasAnyAgent(agentsRes.agents.length > 0)
        setHasAnyChannel(channel)
        setShowWizard(!settings.onboarding_completed)
      } catch {
        if (!cancelled) setShowWizard(false)
      } finally {
        if (!cancelled) {
          setSettingUp(false)
          setLoading(false)
        }
      }
    }
    ensureWorkspaceThenRefresh()
    return () => {
      cancelled = true
    }
  }, [authReady])

  const completeOnboarding = useCallback(() => {
    api.saveSettings({ onboarding_completed: true }).then(() => refresh()).catch(() => refresh())
  }, [refresh])

  const resetOnboarding = useCallback(() => {
    api.saveSettings({ onboarding_completed: false }).then(() => refresh()).catch(() => refresh())
  }, [refresh])

  return {
    showWizard,
    hasAnyAiKey,
    hasAnyAgent,
    hasAnyChannel,
    loading,
    settingUp,
    workspaceError,
    refresh,
    completeOnboarding,
    resetOnboarding,
  }
}
