export type GraphNodeResult = {
  node_id: string
  agent_id: string
  success: boolean
  output: string
  error?: string
}

export type GraphChatMessage = {
  role: "user" | "assistant"
  content: string
  steps?: GraphNodeResult[]
  timestamp?: string
}
