import { useEffect, useState } from "react";
import { api, type TaskItem } from "@/lib/api";
import { useEventStream } from "@/hooks/useEventStream";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastEvent, connected } = useEventStream();

  function load(skipLoading = false) {
    if (!skipLoading) setLoading(true);
    api
      .getTasks({ limit: 50 })
      .then((r) => setTasks(r.tasks))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (lastEvent) load(true);
  }, [lastEvent]);

  if (loading && tasks.length === 0) return <div className="p-4 text-muted-foreground">Loading tasks…</div>;
  if (error && tasks.length === 0) return <div className="p-4 text-destructive">Failed to load tasks: {error}</div>;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-muted-foreground">Live updates when tasks complete.</p>
        </div>
        <div className="flex items-center gap-2">
          {connected && <Badge variant="secondary">Live</Badge>}
          <Badge variant="outline">{tasks.length} tasks</Badge>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Agent / Graph</TableHead>
            <TableHead>Input</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="max-w-xs">Result</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <Badge
                  variant={
                    t.status === "completed"
                      ? "default"
                      : t.status === "failed"
                        ? "destructive"
                        : t.status === "running"
                          ? "secondary"
                          : "outline"
                  }
                >
                  {t.status}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {t.graph_id ? `graph: ${t.graph_id}` : (t.agent_id ?? "—")}
              </TableCell>
              <TableCell className="max-w-[200px] truncate text-sm">{t.input}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{t.updated_at}</TableCell>
              <TableCell className="max-w-xs truncate text-xs">
                {t.result?.output ?? t.result?.error ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
