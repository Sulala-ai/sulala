import { AgentsPage } from "./views/AgentsPage"
import type { NavRouteMeta } from "@/core/navigation"

export const agentsRoute: NavRouteMeta = {
  id: "agents",
  title: "Agents",
  path: "/agents",
  sidebarGroup: "main",
}

export const agentsRouteElement = <AgentsPage />
