import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { SettingsSection } from "../types/settings.types"

export function SettingsChannelsOverview({ onConfigure }: { onConfigure: (s: SettingsSection) => void }) {
  const [settings, setSettings] = useState<{
    telegram_configured?: boolean
    slack_configured?: boolean
    discord_configured?: boolean
    signal_configured?: boolean
    viber_configured?: boolean
  } | null>(null)

  useEffect(() => {
    api.getSettings().then(setSettings).catch(() => setSettings(null))
  }, [])

  const channels: { id: SettingsSection; name: string; configured: boolean }[] = [
    { id: "telegram", name: "Telegram", configured: Boolean(settings?.telegram_configured) },
    { id: "slack", name: "Slack", configured: Boolean(settings?.slack_configured) },
    { id: "discord", name: "Discord", configured: Boolean(settings?.discord_configured) },
    { id: "signal", name: "Signal", configured: Boolean(settings?.signal_configured) },
    { id: "viber", name: "Viber", configured: Boolean(settings?.viber_configured) },
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Channels</CardTitle>
          <CardDescription>
            Connect messaging platforms so users can talk to your agent from Telegram, Slack, Discord, Signal, or Viber. Configure each channel below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {channels.map((ch) => (
              <div key={ch.id} className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3 min-w-[200px]">
                <div>
                  <p className="font-medium">{ch.name}</p>
                  <p className={cn("text-xs", ch.configured ? "text-green-600 dark:text-green-400" : "text-muted-foreground")}>
                    {ch.configured ? "Configured" : "Not configured"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onConfigure(ch.id)}>
                  Configure
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
