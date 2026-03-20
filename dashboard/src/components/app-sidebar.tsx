import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { BotIcon, Settings2Icon, GitBranchIcon, PuzzleIcon, MessageCircleIcon, CalendarClockIcon, BrainIcon } from "lucide-react"
import type { AppRouteId, NavRouteMeta } from "@/core/navigation"

const ROUTE_ICONS: Record<AppRouteId, React.ReactNode> = {
  agents: <BotIcon className="size-4" />,
  chat: <MessageCircleIcon className="size-4" />,
  graphs: <GitBranchIcon className="size-4" />,
  "graph-chat": <GitBranchIcon className="size-4" />,
  skills: <PuzzleIcon className="size-4" />,
  schedules: <CalendarClockIcon className="size-4" />,
  memory: <BrainIcon className="size-4" />,
  settings: <Settings2Icon className="size-4" />,
}

export function AppSidebar({
  activeRouteId,
  onNavigate,
  routes,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activeRouteId: AppRouteId
  onNavigate: (page: AppRouteId) => void
  routes: NavRouteMeta[]
}) {
  const mainPages = routes.filter((route) => route.sidebarGroup === "main" && route.sidebarVisible !== false)
  const skillsPages = routes.filter((route) => route.sidebarGroup === "skills" && route.sidebarVisible !== false)
  const footerPage = routes.find((route) => route.sidebarGroup === "footer")

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
              <button type="button" onClick={() => onNavigate("agents")} className="flex items-center gap-2">
                <span className="relative flex size-8 shrink-0 items-center justify-center">
                  <img src="/logo_dark.png" alt="" className="size-6 dark:hidden" />
                  <img src="/logo_white.png" alt="" className="hidden size-6 dark:block" />
                </span>
                <span className="text-base font-semibold">Sulala Agent</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainPages.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    tooltip={p.title}
                    isActive={activeRouteId === p.id}
                    onClick={() => onNavigate(p.id)}
                  >
                    {ROUTE_ICONS[p.id]}
                    <span>{p.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Skills</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {skillsPages.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    tooltip={p.title}
                    isActive={activeRouteId === p.id}
                    onClick={() => onNavigate(p.id)}
                  >
                    {ROUTE_ICONS[p.id]}
                    <span>{p.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            {footerPage ? (
              <SidebarMenuButton
                tooltip={footerPage.title}
                isActive={activeRouteId === footerPage.id}
                onClick={() => onNavigate(footerPage.id)}
              >
                {ROUTE_ICONS[footerPage.id]}
                <span>{footerPage.title}</span>
              </SidebarMenuButton>
            ) : null}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
