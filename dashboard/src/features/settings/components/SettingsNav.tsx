import type { SettingsSection } from "../types/settings.types"
import { cn } from "@/lib/utils"
import { SendIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react"

interface NavItem {
  id: SettingsSection
  label: string
  icon?: React.ReactNode
}

interface SettingsNavProps {
  section: SettingsSection
  channelsOpen: boolean
  topBeforeChannels: NavItem[]
  channelSections: { id: SettingsSection; label: string }[]
  topAfterChannels: NavItem[]
  onSectionChange: (section: SettingsSection) => void
}

export function SettingsNav({
  section,
  channelsOpen,
  topBeforeChannels,
  channelSections,
  topAfterChannels,
  onSectionChange,
}: SettingsNavProps) {
  return (
    <nav className="w-52 shrink-0 border-r bg-muted/30 p-3 flex flex-col gap-0.5">
      {topBeforeChannels.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSectionChange(item.id)}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
            section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
      <div className="pt-1 mt-1 border-t border-border/50">
        <button
          type="button"
          onClick={() => onSectionChange("channels")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
            channelsOpen ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {channelsOpen ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
          <SendIcon className="size-4" />
          Channels
        </button>
        {channelsOpen && (
          <div className="ml-3 mt-0.5 flex flex-col gap-0.5">
            {channelSections.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSectionChange(sub.id)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors w-full text-left",
                  section === sub.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {sub.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {topAfterChannels.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSectionChange(item.id)}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left",
            section === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  )
}
