import { useState, useEffect } from "react"
import { AppLayout, type PageId } from "@/layouts"
import { ChatNavProvider } from "@/features/chat"
import { GraphChatProvider, useGraphChat } from "@/features/graphs"
import { AgentsPage } from "@/features/agents"
import { ChatPage } from "@/features/chat"
import { GraphsPage, GraphChatPage } from "@/features/graphs"
import { SkillsPage } from "@/features/skills"
import { SchedulesPage } from "@/features/schedules"
import { MemoryPage } from "@/features/memory"
import { SettingsPage } from "@/features/settings"
import { OnboardingWizard, useOnboarding } from "@/features/onboarding"
import { LoginPage } from "@/components/LoginPage"
import { FirstTimeTokenPage } from "@/components/FirstTimeTokenPage"
import { getDashboardToken, getBootstrapToken, isAuthRequired, UNAUTHORIZED_EVENT } from "@/lib/api"

function MainContent({ page, onNavigate }: { page: PageId; onNavigate: (p: PageId) => void }) {
  const { graphChatGraphId, graphChatInitialInput, clearGraphChat } = useGraphChat()
  switch (page) {
    case "agents":
      return <AgentsPage onNavigate={onNavigate} />
    case "chat":
      return <ChatPage />
    case "graphs":
      return <GraphsPage />
    case "graph-chat":
      return (
        <GraphChatPage
          graphId={graphChatGraphId ?? ""}
          initialInput={graphChatInitialInput}
          onBack={() => {
            clearGraphChat()
            onNavigate("graphs")
          }}
        />
      )
    case "skills":
      return <SkillsPage />
    case "schedules":
      return <SchedulesPage onNavigate={onNavigate} />
    case "memory":
      return <MemoryPage />
    case "settings":
      return <SettingsPage />
    default:
      return <AgentsPage onNavigate={onNavigate} />
  }
}

export function App() {
  const [activePage, setActivePage] = useState<PageId>("agents")
  const [authState, setAuthState] = useState<"checking" | "required" | "ok">(() =>
    getDashboardToken() ? "ok" : "checking"
  )
  /** When auth required: undefined = still fetching bootstrap, string = first-time token to show, null = show login */
  const [bootstrapToken, setBootstrapToken] = useState<string | null | undefined>(undefined)
  const authReady = authState === "ok"
  const { showWizard, loading, settingUp, workspaceError, hasAnyAiKey, hasAnyAgent, refresh, completeOnboarding } = useOnboarding(authReady)

  useEffect(() => {
    const handler = () => setAuthState("required")
    window.addEventListener(UNAUTHORIZED_EVENT, handler)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
  }, [])

  useEffect(() => {
    if (authState !== "checking") return
    isAuthRequired()
      .then((required) => setAuthState(required ? "required" : "ok"))
      .catch(() => setAuthState("ok"))
  }, [authState])

  useEffect(() => {
    if (authState !== "required") return
    setBootstrapToken(undefined)
    getBootstrapToken()
      .then((token) => setBootstrapToken(token ?? null))
      .catch(() => setBootstrapToken(null))
  }, [authState])

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (authState === "required") {
    if (bootstrapToken === undefined) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      )
    }
    if (bootstrapToken !== null) {
      return (
        <FirstTimeTokenPage
          token={bootstrapToken}
          onContinue={() => setAuthState("ok")}
        />
      )
    }
    return (
      <LoginPage
        onSuccess={() => setAuthState("ok")}
      />
    )
  }

  if (workspaceError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6">
        <p className="text-sm font-medium text-destructive">Workspace setup failed</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">{workspaceError}</p>
        <p className="text-xs text-muted-foreground">Ensure the app has write access to its data directory (e.g. not on iCloud or a read-only volume).</p>
      </div>
    )
  }

  if (loading && !showWizard) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <p className="text-sm text-muted-foreground">
          {settingUp ? "Setting up workspace…" : "Loading…"}
        </p>
        {settingUp && (
          <p className="text-xs text-muted-foreground">Creating database and default agents</p>
        )}
      </div>
    )
  }

  if (showWizard) {
    return (
      <OnboardingWizard
        hasAnyAiKey={hasAnyAiKey}
        hasAnyAgent={hasAnyAgent}
        onRefresh={refresh}
        onComplete={completeOnboarding}
        onCompleteAndOpenSettings={() => {
          setActivePage("settings")
          completeOnboarding()
        }}
      />
    )
  }

  return (
    <ChatNavProvider onNavigate={(page) => setActivePage(page as PageId)}>
      <GraphChatProvider onNavigate={(page) => setActivePage(page as PageId)}>
        <AppLayout activePage={activePage} onNavigate={setActivePage}>
          <MainContent page={activePage} onNavigate={setActivePage} />
        </AppLayout>
      </GraphChatProvider>
    </ChatNavProvider>
  )
}

export default App
