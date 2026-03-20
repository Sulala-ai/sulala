import type { SettingsSection } from "../types/settings.types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface SettingsContentProps {
  section: SettingsSection
  setSection: (section: SettingsSection) => void
  openTasksPage: () => void
  openLogsPage: () => void
  SettingsDashboardAccess: () => React.ReactNode
  SettingsOverview: () => React.ReactNode
  SettingsChannelsOverview: (props: { onConfigure: (section: SettingsSection) => void }) => React.ReactNode
  SettingsTelegram: () => React.ReactNode
  SettingsSlack: () => React.ReactNode
  SettingsDiscord: () => React.ReactNode
  SettingsSignal: () => React.ReactNode
  SettingsViber: () => React.ReactNode
}

export function SettingsContent({
  section,
  setSection,
  openTasksPage,
  openLogsPage,
  SettingsDashboardAccess,
  SettingsOverview,
  SettingsChannelsOverview,
  SettingsTelegram,
  SettingsSlack,
  SettingsDiscord,
  SettingsSignal,
  SettingsViber,
}: SettingsContentProps) {
  return (
    <div className="p-6">
      {section === "dashboard_access" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Dashboard access</h1>
            <p className="text-muted-foreground text-sm">
              Manage the gateway token used to log in to this dashboard. Regenerate here or via the CLI.
            </p>
          </div>
          <SettingsDashboardAccess />
        </>
      )}
      {section === "ai_provider" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-muted-foreground text-sm">
              Configure your AI provider and API key. Agents use this for LLM and agent-suggestion calls.
            </p>
          </div>
          <SettingsOverview />
        </>
      )}
      {section === "channels" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Channels</h1>
            <p className="text-muted-foreground text-sm">
              Connect Telegram, Slack, or Discord so users can talk to your agent from those platforms.
            </p>
          </div>
          <SettingsChannelsOverview onConfigure={setSection} />
        </>
      )}
      {section === "telegram" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Telegram</h1>
            <p className="text-muted-foreground text-sm">
              Connect a Telegram bot to talk to your agent from Telegram.
            </p>
          </div>
          <SettingsTelegram />
        </>
      )}
      {section === "slack" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Slack</h1>
            <p className="text-muted-foreground text-sm">
              Connect Slack so users can message your agent in channels or DMs.
            </p>
          </div>
          <SettingsSlack />
        </>
      )}
      {section === "discord" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Discord</h1>
            <p className="text-muted-foreground text-sm">
              Connect Discord via a slash command (e.g. /chat) to talk to your agent.
            </p>
          </div>
          <SettingsDiscord />
        </>
      )}
      {section === "signal" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Signal</h1>
            <p className="text-muted-foreground text-sm">
              Connect Signal via a bridge (e.g. signal-cli) so users can message your agent.
            </p>
          </div>
          <SettingsSignal />
        </>
      )}
      {section === "viber" && (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Viber</h1>
            <p className="text-muted-foreground text-sm">
              Connect a Viber bot so users can message your agent from Viber.
            </p>
          </div>
          <SettingsViber />
        </>
      )}
      {section === "tasks" && (
        <Card>
          <CardHeader>
            <CardTitle>Tasks</CardTitle>
            <CardDescription>Task history is now a dedicated page for cleaner feature separation.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={openTasksPage}>Open Tasks</Button>
          </CardContent>
        </Card>
      )}
      {section === "logs" && (
        <Card>
          <CardHeader>
            <CardTitle>Logs</CardTitle>
            <CardDescription>Logs moved to a dedicated feature route to reduce settings-page coupling.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" onClick={openLogsPage}>Open Logs</Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
