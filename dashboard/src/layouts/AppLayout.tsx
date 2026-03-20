import * as React from "react"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"
import { MoonIcon, SunIcon, Github, MessageCircleIcon } from "lucide-react"
import type { AppRouteId, NavRouteMeta } from "@/core/navigation"

const CHAT_FAB_STORAGE_KEY = "sulala-chat-fab-position"
const CHAT_FAB_SIZE_PX = 56 /** Tailwind size-14 */
const CHAT_FAB_MARGIN_PX = 24
const CHAT_FAB_DRAG_THRESHOLD_PX = 6

function clampFabPosition(
  x: number,
  y: number,
  viewportW: number,
  viewportH: number,
  edgeMargin = 8,
) {
  const maxX = Math.max(edgeMargin, viewportW - CHAT_FAB_SIZE_PX - edgeMargin)
  const maxY = Math.max(edgeMargin, viewportH - CHAT_FAB_SIZE_PX - edgeMargin)
  return {
    x: Math.min(Math.max(edgeMargin, x), maxX),
    y: Math.min(Math.max(edgeMargin, y), maxY),
  }
}

function readStoredFabPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(CHAT_FAB_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { x?: number; y?: number }
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

const GITHUB_URL = "https://github.com/Sulala-ai/sulala"

export interface AppLayoutProps {
  activeRouteId: AppRouteId
  onNavigate: (page: AppRouteId) => void
  routes: NavRouteMeta[]
  children: React.ReactNode
}

export function AppLayout({ activeRouteId, onNavigate, routes, children }: AppLayoutProps) {
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark" || (theme === "system" && typeof document !== "undefined" && document.documentElement.classList.contains("dark"))

  const [chatFabPos, setChatFabPos] = React.useState<{ x: number; y: number } | null>(null)
  const chatFabPosRef = React.useRef<{ x: number; y: number } | null>(null)
  const chatFabDragRef = React.useRef({
    pointerId: -1,
    didDrag: false,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
  })

  React.useLayoutEffect(() => {
    chatFabPosRef.current = chatFabPos
  }, [chatFabPos])

  React.useLayoutEffect(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    const stored = readStoredFabPosition()
    const next = stored
      ? clampFabPosition(stored.x, stored.y, w, h)
      : clampFabPosition(
          w - CHAT_FAB_SIZE_PX - CHAT_FAB_MARGIN_PX,
          h - CHAT_FAB_SIZE_PX - CHAT_FAB_MARGIN_PX,
          w,
          h,
        )
    setChatFabPos(next)
  }, [])

  React.useEffect(() => {
    function onResize() {
      setChatFabPos((prev) =>
        prev
          ? clampFabPosition(prev.x, prev.y, window.innerWidth, window.innerHeight)
          : prev,
      )
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  function onChatFabPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || chatFabPos === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    chatFabDragRef.current = {
      pointerId: e.pointerId,
      didDrag: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: chatFabPos.x,
      originY: chatFabPos.y,
    }
  }

  function onChatFabPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = chatFabDragRef.current
    if (d.pointerId !== e.pointerId || chatFabPos === null) return
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return

    const dx = e.clientX - d.startClientX
    const dy = e.clientY - d.startClientY
    if (!d.didDrag && (Math.abs(dx) > CHAT_FAB_DRAG_THRESHOLD_PX || Math.abs(dy) > CHAT_FAB_DRAG_THRESHOLD_PX)) {
      d.didDrag = true
    }
    if (!d.didDrag) return

    const next = clampFabPosition(d.originX + dx, d.originY + dy, window.innerWidth, window.innerHeight)
    chatFabPosRef.current = next
    setChatFabPos(next)
  }

  function onChatFabPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const d = chatFabDragRef.current
    if (d.pointerId !== e.pointerId) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    const wasDrag = d.didDrag
    d.pointerId = -1
    d.didDrag = false

    if (!wasDrag) {
      onNavigate("chat")
    } else {
      const p = chatFabPosRef.current
      if (p) {
        try {
          localStorage.setItem(CHAT_FAB_STORAGE_KEY, JSON.stringify(p))
        } catch {
          /* ignore quota / private mode */
        }
      }
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar activeRouteId={activeRouteId} onNavigate={onNavigate} routes={routes} />
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
        {activeRouteId !== "chat" && chatFabPos !== null && (
          <Button
            type="button"
            size="icon"
            style={{ left: chatFabPos.x, top: chatFabPos.y }}
            className="fixed z-50 size-14 shrink-0 cursor-grab touch-none select-none rounded-full shadow-lg active:cursor-grabbing"
            onPointerDown={onChatFabPointerDown}
            onPointerMove={onChatFabPointerMove}
            onPointerUp={onChatFabPointerUp}
            onPointerCancel={onChatFabPointerUp}
            aria-label="Open chat (drag to move)"
          >
            <MessageCircleIcon className="size-6" aria-hidden />
          </Button>
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}
