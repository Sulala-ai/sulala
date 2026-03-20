export type AppRouteId =
  | "agents"
  | "chat"
  | "graphs"
  | "graph-chat"
  | "skills"
  | "schedules"
  | "memory"
  | "settings"

export type SidebarGroup = "main" | "skills" | "footer"

export interface NavRouteMeta {
  id: AppRouteId
  title: string
  path: string
  sidebarGroup: SidebarGroup
  sidebarVisible?: boolean
}

export const DEFAULT_ROUTE_ID: AppRouteId = "agents"
