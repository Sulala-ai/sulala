import { DEFAULT_ROUTE_ID, type NavRouteMeta } from "@/core/navigation"
import { agentsRoute } from "@/features/agents/routes"
import { chatRoute } from "@/features/chat/routes"
import { graphsRoute, graphChatRoute } from "@/features/graphs/routes"
import { skillsRoute } from "@/features/skills/routes"
import { schedulesRoute } from "@/features/schedules/routes"
import { memoryRoute } from "@/features/memory/routes"
import { settingsRoute } from "@/features/settings/routes"

export const appRoutes: NavRouteMeta[] = [
  agentsRoute,
  chatRoute,
  graphsRoute,
  { ...graphChatRoute, sidebarVisible: false },
  skillsRoute,
  schedulesRoute,
  memoryRoute,
  settingsRoute,
]

export function getPathByRouteId(routeId: string): string {
  return appRoutes.find((route) => route.id === routeId)?.path ?? `/${DEFAULT_ROUTE_ID}`
}

export function getRouteIdByPathname(pathname: string) {
  const byLongestPath = [...appRoutes].sort((a, b) => b.path.length - a.path.length)
  return byLongestPath.find((route) => pathname.startsWith(route.path))?.id ?? DEFAULT_ROUTE_ID
}
