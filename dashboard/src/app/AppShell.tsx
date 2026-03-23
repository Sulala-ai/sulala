import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { AppLayout } from "@/layouts"
import { ChatNavProvider, ChatSessionProvider } from "@/features/chat"
import { GraphChatProvider } from "@/features/graphs"
import { type AppRouteId } from "@/core/navigation"
import { appRoutes, getPathByRouteId, getRouteIdByPathname } from "@/core/route-registry"

export function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const activeRouteId = getRouteIdByPathname(location.pathname)

  const handleNavigate = (routeId: AppRouteId) => {
    navigate(getPathByRouteId(routeId))
  }

  return (
    <ChatNavProvider onNavigate={handleNavigate}>
      <GraphChatProvider onNavigate={handleNavigate}>
        <ChatSessionProvider>
          <AppLayout activeRouteId={activeRouteId} onNavigate={handleNavigate} routes={appRoutes}>
            <Outlet />
          </AppLayout>
        </ChatSessionProvider>
      </GraphChatProvider>
    </ChatNavProvider>
  )
}
