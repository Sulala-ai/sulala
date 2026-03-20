import { SchedulesPage } from "./views/SchedulesPage"
import type { NavRouteMeta } from "@/core/navigation"

export const schedulesRoute: NavRouteMeta = {
  id: "schedules",
  title: "Schedules",
  path: "/schedules",
  sidebarGroup: "main",
}

export const schedulesRouteElement = <SchedulesPage />
