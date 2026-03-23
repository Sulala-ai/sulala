import { useEffect, useState } from "react"
import { api, type LogEvent } from "@/lib/api"
import { useEventStream } from "@/hooks/useEventStream"

export function useLogsPage() {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { lastEvent, connected } = useEventStream()

  function load() {
    api
      .getLogs()
      .then((r) => setEvents(r.events))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (lastEvent) load()
  }, [lastEvent])

  return { events, loading, error, connected }
}

