import { SettingsPage } from "./views/SettingsPage"
import type { NavRouteMeta } from "@/core/navigation"

export const settingsRoute: NavRouteMeta = {
  id: "settings",
  title: "Settings",
  path: "/settings",
  sidebarGroup: "footer",
}

export const settingsRouteElement = <SettingsPage />
