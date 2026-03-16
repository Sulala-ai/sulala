import { useEffect, useState } from "react"
import { getEventStreamUrl } from "@/lib/api"

export interface StreamEvent {
  type: string
  timestamp: string
  data: unknown
}

/**
 * Connects to the backend event stream over WebSocket. When any task/log event
 * is received, lastEvent updates so consumers can refetch (e.g. tasks list, logs).
 */
export function useEventStream(): { lastEvent: StreamEvent | null; connected: boolean } {
  const [lastEvent, setLastEvent] = useState<StreamEvent | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const url = getEventStreamUrl()
    const ws = new WebSocket(url)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as StreamEvent
        setLastEvent(event)
      } catch {
        // ignore parse errors
      }
    }

    return () => {
      ws.close()
    }
  }, [])

  return { lastEvent, connected }
}
