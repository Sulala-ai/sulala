import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { SettingsSection } from "../types/settings.types"

const CHANNEL_SECTIONS = new Set<SettingsSection>(["channels", "telegram", "slack", "discord", "signal", "viber"])

export function useSettingsPage() {
  const navigate = useNavigate()
  const [section, setSection] = useState<SettingsSection>("ai_provider")

  const channelsOpen = useMemo(() => CHANNEL_SECTIONS.has(section), [section])

  const openTasksPage = () => navigate("/tasks")
  const openLogsPage = () => navigate("/logs")

  return {
    section,
    setSection,
    channelsOpen,
    openTasksPage,
    openLogsPage,
  }
}
