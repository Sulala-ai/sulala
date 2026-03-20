import { MemoryPage } from "./views/MemoryPage"
import type { NavRouteMeta } from "@/core/navigation"

export const memoryRoute: NavRouteMeta = {
  id: "memory",
  title: "Memory",
  path: "/memory",
  sidebarGroup: "main",
}

export const memoryRouteElement = <MemoryPage />
