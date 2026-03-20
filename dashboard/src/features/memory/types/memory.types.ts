export interface MemoryResult {
  id: number
  user_id: string | null
  agent_id: string
  scope?: string
  text: string
  tags?: unknown
  created_at: string
}
