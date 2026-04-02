import { useCallback, useEffect, useState } from "react"
import { api, type LogEvent } from "@/lib/api"
import { useEventStream } from "@/hooks/useEventStream"

export function useLogs() {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { lastEvent, connected } = useEventStream()

  const load = useCallback((skipLoading = false) => {
    if (!skipLoading) setLoading(true)
    api
      .getLogs()
      .then((r) => setEvents(r.events ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (lastEvent) load(true)
  }, [lastEvent, load])

  return { events, loading, error, connected }
}
