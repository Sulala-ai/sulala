import { LayoutDashboardIcon, ListTodoIcon, ScrollTextIcon, LockIcon } from "lucide-react"
import { useSettingsPage } from "@/features/settings/hooks/useSettingsPage"
import type { SettingsSection } from "@/features/settings/types/settings.types"
import { SettingsNav } from "@/features/settings/components/SettingsNav"
import { SettingsContent } from "@/features/settings/components/SettingsContent"
import { SettingsChannelsOverview } from "@/features/settings/components/SettingsChannelsOverview"
import { SettingsTelegram } from "@/features/settings/components/SettingsTelegram"
import { SettingsSlack } from "@/features/settings/components/SettingsSlack"
import { SettingsDiscord } from "@/features/settings/components/SettingsDiscord"
import { SettingsSignal } from "@/features/settings/components/SettingsSignal"
import { SettingsViber } from "@/features/settings/components/SettingsViber"
import { SettingsDashboardAccess } from "@/features/settings/components/SettingsDashboardAccess"
import { SettingsOverview } from "@/features/settings/components/SettingsOverview"

const CHANNEL_SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "channels", label: "Overview" },
  { id: "telegram", label: "Telegram" },
  { id: "slack", label: "Slack" },
  { id: "discord", label: "Discord" },
  { id: "signal", label: "Signal" },
  { id: "viber", label: "Viber" },
]

const TOP_NAV_BEFORE_CHANNELS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard_access", label: "Dashboard access", icon: <LockIcon className="size-4" /> },
  { id: "ai_provider", label: "AI Provider", icon: <LayoutDashboardIcon className="size-4" /> },
]
const TOP_NAV_AFTER_CHANNELS: { id: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { id: "tasks", label: "Tasks", icon: <ListTodoIcon className="size-4" /> },
  { id: "logs", label: "Logs", icon: <ScrollTextIcon className="size-4" /> },
]

export function SettingsPage() {
  const { section, setSection, channelsOpen, openTasksPage, openLogsPage } = useSettingsPage()

  return (
    <div className="flex flex-1 min-h-0">
      <SettingsNav
        section={section}
        channelsOpen={channelsOpen}
        topBeforeChannels={TOP_NAV_BEFORE_CHANNELS}
        channelSections={CHANNEL_SECTIONS}
        topAfterChannels={TOP_NAV_AFTER_CHANNELS}
        onSectionChange={setSection}
      />
      <main className="flex-1 min-w-0 overflow-auto">
        <SettingsContent
          section={section}
          setSection={setSection}
          openTasksPage={openTasksPage}
          openLogsPage={openLogsPage}
          SettingsDashboardAccess={SettingsDashboardAccess}
          SettingsOverview={SettingsOverview}
          SettingsChannelsOverview={SettingsChannelsOverview}
          SettingsTelegram={SettingsTelegram}
          SettingsSlack={SettingsSlack}
          SettingsDiscord={SettingsDiscord}
          SettingsSignal={SettingsSignal}
          SettingsViber={SettingsViber}
        />
      </main>
    </div>
  )
}
