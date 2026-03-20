import { useEffect, useState } from "react"
import { api, type TaskItem } from "@/lib/api"
import { useEventStream } from "@/hooks/useEventStream"

export function useTasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { lastEvent, connected } = useEventStream()

  function load() {
    api
      .getTasks({ limit: 50 })
      .then((r) => setTasks(r.tasks))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (lastEvent) load()
  }, [lastEvent])

  return {
    tasks,
    loading,
    error,
    connected,
  }
}
