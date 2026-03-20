import { Navigate, createBrowserRouter } from "react-router-dom"
import { AppShell } from "@/app/AppShell"
import { DEFAULT_ROUTE_ID } from "@/core/navigation"
import { agentsRoute, agentsRouteElement } from "@/features/agents/routes"
import { chatRoute, chatRouteElement } from "@/features/chat/routes"
import { graphsRoute, graphChatRoute, graphsRouteElement, graphChatRouteElement } from "@/features/graphs/routes"
import { skillsRoute, skillsRouteElement } from "@/features/skills/routes"
import { schedulesRoute, schedulesRouteElement } from "@/features/schedules/routes"
import { memoryRoute, memoryRouteElement } from "@/features/memory/routes"
import { settingsRoute, settingsRouteElement } from "@/features/settings/routes"
import { tasksRoutePath, tasksRouteElement } from "@/features/tasks/routes"
import { logsRoutePath, logsRouteElement } from "@/features/logs/routes"

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={`/${DEFAULT_ROUTE_ID}`} replace /> },
      { path: agentsRoute.path.slice(1), element: agentsRouteElement },
      { path: chatRoute.path.slice(1), element: chatRouteElement },
      { path: graphsRoute.path.slice(1), element: graphsRouteElement },
      { path: graphChatRoute.path.slice(1), element: graphChatRouteElement },
      { path: skillsRoute.path.slice(1), element: skillsRouteElement },
      { path: schedulesRoute.path.slice(1), element: schedulesRouteElement },
      { path: memoryRoute.path.slice(1), element: memoryRouteElement },
      { path: settingsRoute.path.slice(1), element: settingsRouteElement },
      { path: tasksRoutePath.slice(1), element: tasksRouteElement },
      { path: logsRoutePath.slice(1), element: logsRouteElement },
      { path: "*", element: <Navigate to={`/${DEFAULT_ROUTE_ID}`} replace /> },
    ],
  },
])
