import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { GraphChatPage } from "./GraphChatPage"
import { useGraphChat } from "../contexts/graph-chat-context"

export function GraphChatRoutePage() {
  const navigate = useNavigate()
  const { graphChatGraphId, graphChatInitialInput, clearGraphChat } = useGraphChat()

  useEffect(() => {
    if (!graphChatGraphId) {
      navigate("/graphs", { replace: true })
    }
  }, [graphChatGraphId, navigate])

  if (!graphChatGraphId) return null

  return (
    <GraphChatPage
      graphId={graphChatGraphId}
      initialInput={graphChatInitialInput}
      onBack={() => {
        clearGraphChat()
        navigate("/graphs")
      }}
    />
  )
}
