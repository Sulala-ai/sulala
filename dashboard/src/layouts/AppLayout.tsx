import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar, type PageId } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, Github } from "lucide-react"

export type { PageId }

const GITHUB_URL = "https://github.com/Sulala-ai/sulala"

export interface AppLayoutProps {
  activePage: PageId
  onNavigate: (page: PageId) => void
  children: React.ReactNode
}

export function AppLayout({ activePage, onNavigate, children }: AppLayoutProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark" || (theme === "system" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"))

  return (
    <SidebarProvider>
      <AppSidebar activePage={activePage} onNavigate={onNavigate} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <span className="text-sm font-medium text-muted-foreground">Sulala Agent</span>
          <div className="ml-auto flex items-center gap-1">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="GitHub repository"
            >
              <Github className="size-4" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
            </Button>
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
