import type { NavRouteMeta } from "@/core/navigation"
import { GraphsPage } from "./views/GraphsPage"
import { GraphChatRoutePage } from "./views/GraphChatRoutePage"

export const graphsRoute: NavRouteMeta = {
  id: "graphs",
  title: "Graphs",
  path: "/graphs",
  sidebarGroup: "main",
}

export const graphChatRoute: NavRouteMeta = {
  id: "graph-chat",
  title: "Graph Chat",
  path: "/graph-chat",
  sidebarGroup: "main",
}

export const graphsRouteElement = <GraphsPage />
export const graphChatRouteElement = <GraphChatRoutePage />
