import { createContext, useContext, useState, useCallback } from "react"
import type { AppRouteId } from "@/core/navigation"

type OnNavigate = (page: AppRouteId) => void

type ChatNavContextValue = {
  openChatWithAgent: (agentId: string) => void
  preselectedAgentId: string | null
  clearPreselectedAgent: () => void
}

const ChatNavContext = createContext<ChatNavContextValue | null>(null)

export function ChatNavProvider({
  children,
  onNavigate,
}: {
  children: React.ReactNode
  onNavigate: OnNavigate
}) {
  const [preselectedAgentId, setPreselectedAgentId] = useState<string | null>(null)
  const openChatWithAgent = useCallback(
    (agentId: string) => {
      setPreselectedAgentId(agentId)
      onNavigate("chat")
    },
    [onNavigate]
  )
  const clearPreselectedAgent = useCallback(() => setPreselectedAgentId(null), [])
  return (
    <ChatNavContext.Provider
      value={{ openChatWithAgent, preselectedAgentId, clearPreselectedAgent }}
    >
      {children}
    </ChatNavContext.Provider>
  )
}

export function useChatNav(): ChatNavContextValue {
  const ctx = useContext(ChatNavContext)
  if (!ctx) {
    return {
      openChatWithAgent: () => {},
      preselectedAgentId: null,
      clearPreselectedAgent: () => {},
    }
  }
  return ctx
}
