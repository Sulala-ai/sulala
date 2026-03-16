import { useEffect, useState } from "react";
import { api, type AgentSummary } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrainIcon, SearchIcon, PlusIcon, Trash2Icon } from "lucide-react";

export interface MemoryResult {
  id: number;
  user_id: string | null;
  agent_id: string;
  scope?: string;
  text: string;
  tags?: unknown;
  created_at: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function MemoryPage() {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [results, setResults] = useState<MemoryResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [addAgentId, setAddAgentId] = useState("");
  const [addText, setAddText] = useState("");
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);
  const [semantic, setSemantic] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    api
      .getAgents()
      .then((r) => setAgents(r.agents))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Preselect agent and run search when navigating from Agents page (e.g. "Manage memory" link)
  useEffect(() => {
    try {
      const preset = sessionStorage.getItem("memoryFilterAgentId");
      if (preset) {
        sessionStorage.removeItem("memoryFilterAgentId");
        setAgentFilter(preset);
        setSearching(true);
        setError(null);
        api
          .searchMemory({ agent_id: preset, limit: 50, semantic: false })
          .then((r) => setResults(r.results as MemoryResult[]))
          .catch((e) => setError(e.message))
          .finally(() => setSearching(false));
      }
    } catch {
      /* ignore */
    }
  }, []);

  function runSearch() {
    setSearching(true);
    setError(null);
    api
      .searchMemory({
        q: q.trim() || undefined,
        agent_id: agentFilter.trim() || undefined,
        limit: 50,
        semantic,
      })
      .then((r) => setResults(r.results as MemoryResult[]))
      .catch((e) => setError(e.message))
      .finally(() => setSearching(false));
  }

  function handleDelete(id: number) {
    if (!confirm("Delete this memory?")) return;
    setDeletingId(id);
    api
      .deleteMemory(id)
      .then(() => setResults((prev) => prev.filter((m) => m.id !== id)))
      .catch((e) => setError(e.message))
      .finally(() => setDeletingId(null));
  }

  function handleAddMemory() {
    if (!addAgentId.trim() || !addText.trim()) {
      setAddError("Agent and text are required.");
      return;
    }
    setAddSaving(true);
    setAddError(null);
    setAddSuccess(false);
    api
      .writeMemory({
        agent_id: addAgentId.trim(),
        text: addText.trim(),
      })
      .then(() => {
        setAddText("");
        setAddSuccess(true);
        runSearch();
      })
      .catch((e) => setAddError(e.message))
      .finally(() => setAddSaving(false));
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <BrainIcon className="size-6" />
          Memory
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Long-term memories stored by agents (via the memory skill). Search and add memories here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search memories</CardTitle>
          <CardDescription>Filter by text or agent. Leave search empty to list recent memories.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Query (optional)</Label>
              <Input
                placeholder="Search in memory text…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                className="mt-1"
              />
            </div>
            <div className="w-[180px]">
              <Label className="text-xs">Agent</Label>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={semantic}
                onChange={(e) => setSemantic(e.target.checked)}
                className="rounded border-input"
              />
              Semantic search
            </label>
            <Button onClick={runSearch} disabled={searching}>
              <SearchIcon className="size-4 mr-1" />
              {searching ? "Searching…" : "Search"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add memory</CardTitle>
          <CardDescription>Store a fact for an agent. Agents with the memory skill can also write memories via tools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Agent</Label>
              <select
                value={addAgentId}
                onChange={(e) => setAddAgentId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">Select agent</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Text</Label>
              <Input
                placeholder="e.g. User prefers dark mode"
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          {addError && <p className="text-sm text-destructive">{addError}</p>}
          {addSuccess && <p className="text-sm text-green-600">Memory saved.</p>}
          <Button onClick={handleAddMemory} disabled={addSaving || !addAgentId.trim() || !addText.trim()}>
            <PlusIcon className="size-4 mr-1" />
            {addSaving ? "Saving…" : "Add memory"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Results</CardTitle>
          <CardDescription>{results.length} memor{results.length === 1 ? "y" : "ies"}</CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Run a search or leave query empty and click Search to list memories.</p>
          ) : (
            <ul className="space-y-3">
              {results.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border bg-card p-3 text-sm flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-muted-foreground text-xs">
                      {agents.find((a) => a.id === m.agent_id)?.name ?? m.agent_id}
                      {m.user_id ? ` · user ${m.user_id}` : ""}
                      {" · "}
                      {formatDate(m.created_at)}
                    </p>
                    <p className="mt-1">{m.text}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(m.id)}
                    disabled={deletingId === m.id}
                    title="Delete memory"
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
