export interface ToolCallStep {
  tool: string
  args?: unknown
  result?: unknown
  error?: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
}

export interface GeneratedArtifact {
  kind: "web_preview"
  filename: string
}

export type ChatMessage = {
  role: "user" | "assistant"
  content: string
  steps?: ToolCallStep[]
  timestamp?: string
  usage?: TokenUsage
  model?: string
  artifact?: GeneratedArtifact
}
