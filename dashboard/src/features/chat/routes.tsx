import { ChatPage } from "./views/ChatPage"
import type { NavRouteMeta } from "@/core/navigation"

export const chatRoute: NavRouteMeta = {
  id: "chat",
  title: "Chat",
  path: "/chat",
  sidebarGroup: "main",
}

export const chatRouteElement = <ChatPage />
