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

export type PageId = "agents" | "chat" | "tasks" | "logs" | "graphs" | "graph-chat" | "skills" | "schedules" | "memory" | "settings"

const MAIN_PAGES: { id: PageId; title: string; icon: React.ReactNode }[] = [
  { id: "agents", title: "Agents", icon: <BotIcon className="size-4" /> },
  { id: "chat", title: "Chat", icon: <MessageCircleIcon className="size-4" /> },
  { id: "graphs", title: "Graphs", icon: <GitBranchIcon className="size-4" /> },
  { id: "schedules", title: "Schedules", icon: <CalendarClockIcon className="size-4" /> },
  { id: "memory", title: "Memory", icon: <BrainIcon className="size-4" /> },
]

const SKILLS_GROUP_PAGES: { id: PageId; title: string; icon: React.ReactNode }[] = [
  { id: "skills", title: "Skills", icon: <PuzzleIcon className="size-4" /> },
]

export function AppSidebar({
  activePage,
  onNavigate,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activePage: PageId
  onNavigate: (page: PageId) => void
}) {
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
              {MAIN_PAGES.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    tooltip={p.title}
                    isActive={activePage === p.id}
                    onClick={() => onNavigate(p.id)}
                  >
                    {p.icon}
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
              {SKILLS_GROUP_PAGES.map((p) => (
                <SidebarMenuItem key={p.id}>
                  <SidebarMenuButton
                    tooltip={p.title}
                    isActive={activePage === p.id}
                    onClick={() => onNavigate(p.id)}
                  >
                    {p.icon}
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
            <SidebarMenuButton
              tooltip="Settings"
              isActive={activePage === "settings"}
              onClick={() => onNavigate("settings")}
            >
              <Settings2Icon className="size-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
