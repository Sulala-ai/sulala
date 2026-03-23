import { useLogsPage } from "@/features/logs/hooks/useLogsPage"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function formatLogData(data: unknown): string {
  if (data === null) return "null"
  if (typeof data === "string") return data
  try {
    return JSON.stringify(data)
  } catch {
    return "[unserializable log data]"
  }
}

export function LogsPage() {
  const { events, loading, error, connected } = useLogsPage()

  if (loading && events.length === 0) return <div className="p-4 text-muted-foreground">Loading logs…</div>
  if (error && events.length === 0) return <div className="p-4 text-destructive">Failed to load logs: {error}</div>

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Logs</h1>
          <p className="text-muted-foreground">Live updates when tasks/logs events arrive.</p>
        </div>
        <div className="flex items-center gap-2">
          {connected && <Badge variant="secondary">Live</Badge>}
          <Badge variant="outline">{events.length} events</Badge>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Timestamp</TableHead>
            <TableHead className="max-w-[520px]">Data</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e, idx) => (
            <TableRow key={`${e.timestamp}-${idx}`}>
              <TableCell className="font-mono text-xs">{e.type}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{e.timestamp}</TableCell>
              <TableCell className="max-w-[520px] truncate text-xs">
                <code className="font-mono">{formatLogData(e.data)}</code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

