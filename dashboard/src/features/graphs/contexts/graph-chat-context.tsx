import { createContext, useContext, useState, useCallback } from "react"
import type { AppRouteId } from "@/core/navigation"

type OnNavigate = (page: AppRouteId) => void

type GraphChatContextValue = {
  openGraphChat: (graphId: string, initialInput?: string) => void
  graphChatGraphId: string | null
  graphChatInitialInput: string | null
  clearGraphChat: () => void
}

const GraphChatContext = createContext<GraphChatContextValue | null>(null)

export function GraphChatProvider({
  children,
  onNavigate,
}: {
  children: React.ReactNode
  onNavigate: OnNavigate
}) {
  const [graphChatGraphId, setGraphChatGraphId] = useState<string | null>(null)
  const [graphChatInitialInput, setGraphChatInitialInput] = useState<string | null>(null)

  const openGraphChat = useCallback(
    (graphId: string, initialInput?: string) => {
      setGraphChatGraphId(graphId)
      setGraphChatInitialInput(initialInput?.trim() ?? null)
      onNavigate("graph-chat")
    },
    [onNavigate]
  )

  const clearGraphChat = useCallback(() => {
    setGraphChatGraphId(null)
    setGraphChatInitialInput(null)
  }, [])

  return (
    <GraphChatContext.Provider
      value={{ openGraphChat, graphChatGraphId, graphChatInitialInput, clearGraphChat }}
    >
      {children}
    </GraphChatContext.Provider>
  )
}

export function useGraphChat(): GraphChatContextValue {
  const ctx = useContext(GraphChatContext)
  if (!ctx) {
    return {
      openGraphChat: () => {},
      graphChatGraphId: null,
      graphChatInitialInput: null,
      clearGraphChat: () => {},
    }
  }
  return ctx
}
