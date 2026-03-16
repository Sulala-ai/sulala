import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type EnvRow = { key: string; value: string; configured?: boolean };

type ServerDraft = {
  id: string;
  name: string;
  enabled: boolean;
  command: string;
  argsText: string;
  envRows: EnvRow[];
};

function parseArgs(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function envRowsToObject(rows: EnvRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const k = row.key.trim();
    if (!k) continue;
    const v = row.value.trim();
    if (!v && row.configured) continue; // keep existing secret without overwriting
    if (!v) continue;
    out[k] = v;
  }
  return out;
}

export function McpServersForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<ServerDraft[]>([]);
  const [testResult, setTestResult] = useState<{ ok: boolean; tools: Array<{ name: string; description?: string }>; error?: string } | null>(null);

  useEffect(() => {
    api
      .getMcpServers()
      .then((res) => {
        setServers(
          res.servers.map((s) => {
            const envRows: EnvRow[] = [];
            const configured = s.env_configured ?? {};
            for (const [k, isConfigured] of Object.entries(configured)) {
              envRows.push({
                key: k,
                value: "",
                configured: Boolean(isConfigured),
              });
            }
            return {
              id: s.id,
              name: s.name ?? "",
              enabled: Boolean(s.enabled),
              command: s.command ?? "",
              argsText: (s.args ?? []).join("\n"),
              envRows: envRows.length ? envRows : [{ key: "", value: "" }],
            };
          })
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  const hasServers = servers.length > 0;

  function addServer() {
    setServers((prev) => [
      ...prev,
      { id: "", name: "", enabled: true, command: "npx", argsText: "", envRows: [{ key: "", value: "" }] },
    ]);
    setSaved(false);
    setTestResult(null);
  }

  function updateServer(idx: number, patch: Partial<ServerDraft>) {
    setServers((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    setSaved(false);
    setTestResult(null);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);
    setTestResult(null);
    try {
      await api.saveMcpServers(
        servers.map((s) => ({
          id: s.id.trim(),
          name: s.name.trim() || null,
          enabled: s.enabled,
          transport: "stdio",
          command: s.command.trim(),
          args: parseArgs(s.argsText),
          env: envRowsToObject(s.envRows),
        }))
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const canTest = useMemo(() => {
    if (servers.length !== 1) return false;
    const s = servers[0];
    return Boolean(s.id.trim() && s.command.trim());
  }, [servers]);

  async function handleTestSingle() {
    if (!canTest) return;
    setError(null);
    setTesting(true);
    setTestResult(null);
    try {
      const s = servers[0];
      const res = await api.testMcpServer({
        id: s.id.trim(),
        name: s.name.trim() || null,
        enabled: s.enabled,
        transport: "stdio",
        command: s.command.trim(),
        args: parseArgs(s.argsText),
        env: envRowsToObject(s.envRows),
      });
      setTestResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }

  function addEnvRow(serverIndex: number) {
    setServers((prev) =>
      prev.map((s, i) =>
        i === serverIndex ? { ...s, envRows: [...s.envRows, { key: "", value: "" }] } : s
      )
    );
    setSaved(false);
    setTestResult(null);
  }

  function updateEnvRow(serverIndex: number, rowIndex: number, patch: Partial<EnvRow>) {
    setServers((prev) =>
      prev.map((s, i) => {
        if (i !== serverIndex) return s;
        const rows = s.envRows.map((row, rIdx) => (rIdx === rowIndex ? { ...row, ...patch } : row));
        return { ...s, envRows: rows };
      })
    );
    setSaved(false);
    setTestResult(null);
  }

  function removeEnvRow(serverIndex: number, rowIndex: number) {
    setServers((prev) =>
      prev.map((s, i) => {
        if (i !== serverIndex) return s;
        const rows = s.envRows.filter((_, rIdx) => rIdx !== rowIndex);
        return { ...s, envRows: rows.length ? rows : [{ key: "", value: "" }] };
      })
    );
    setSaved(false);
    setTestResult(null);
  }

  async function handleDelete(idx: number) {
    setError(null);
    setTestResult(null);
    const s = servers[idx];
    const id = s?.id?.trim();
    if (id) {
      try {
        await api.deleteMcpServer(id);
      } catch (e) {
        // If delete fails, still allow removing from local list and saving later.
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    setServers((prev) => prev.filter((_, i) => i !== idx));
  }

  if (loading) return <div className="p-4 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>MCP Servers</CardTitle>
          <CardDescription>
            Add MCP (Model Context Protocol) servers to expose extra tools to agents. For discovery, browse{" "}
            <a className="text-primary hover:underline" href="https://mcpservers.org/en" target="_blank" rel="noreferrer">
              mcpservers.org
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasServers && (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              No MCP servers configured yet. Click “Add server”.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addServer}>
              Add server
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || servers.length === 0}>
              {saving ? "Saving…" : saved ? "Saved" : "Save"}
            </Button>
            <Button type="button" variant="secondary" disabled={!canTest || testing} onClick={handleTestSingle} title={servers.length === 1 ? "" : "Testing supports a single draft at a time"}>
              {testing ? "Testing…" : "Test (single server)"}
            </Button>
          </div>

          {testResult && (
            <div className={cn("rounded-lg border p-3 text-sm", testResult.ok ? "bg-green-50/50 dark:bg-green-950/20" : "bg-muted/20")}>
              <div className="font-medium">{testResult.ok ? "Test passed" : "Test failed"}</div>
              {testResult.error && <div className="text-destructive mt-1">{testResult.error}</div>}
              <div className="mt-2">
                <div className="text-xs text-muted-foreground mb-1">Tools discovered:</div>
                {testResult.tools.length === 0 ? (
                  <div className="text-muted-foreground">None</div>
                ) : (
                  <ul className="list-disc pl-5 space-y-1">
                    {testResult.tools.map((t) => (
                      <li key={t.name}>
                        <span className="font-mono">{t.name}</span>
                        {t.description ? <span className="text-muted-foreground"> — {t.description}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-4">
            {servers.map((s, idx) => (
              <div key={idx} className="rounded-lg border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">Server #{idx + 1}</div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => updateServer(idx, { enabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleDelete(idx)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>ID *</Label>
                    <Input
                      value={s.id}
                      onChange={(e) => updateServer(idx, { id: e.target.value })}
                      placeholder="twitter-mcp"
                      className="font-mono"
                    />
                    <p className="text-xs text-muted-foreground">Used to prefix tool ids (e.g. mcp_twitter-mcp_post_tweet).</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Name</Label>
                    <Input value={s.name} onChange={(e) => updateServer(idx, { name: e.target.value })} placeholder="Twitter MCP" />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Command *</Label>
                    <Input value={s.command} onChange={(e) => updateServer(idx, { command: e.target.value })} placeholder="npx" className="font-mono" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Args (one per line)</Label>
                    <textarea
                      value={s.argsText}
                      onChange={(e) => updateServer(idx, { argsText: e.target.value })}
                      placeholder={"-y\n@enescinar/twitter-mcp"}
                      className="min-h-[80px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Env (key / value)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => addEnvRow(idx)}>
                      Add variable
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {s.envRows.map((row, rIdx) => (
                      <div key={rIdx} className="flex flex-wrap items-center gap-2">
                        <Input
                          value={row.key}
                          onChange={(e) => updateEnvRow(idx, rIdx, { key: e.target.value })}
                          placeholder="API_KEY"
                          className="font-mono flex-1 min-w-[120px]"
                        />
                        <Input
                          type="password"
                          value={row.value}
                          onChange={(e) => updateEnvRow(idx, rIdx, { value: e.target.value })}
                          placeholder={row.configured ? "•••••••• (already set — leave blank to keep)" : "Value"}
                          className="font-mono flex-[2] min-w-[160px]"
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => removeEnvRow(idx, rIdx)}
                          aria-label="Remove env row"
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Values are stored locally. The server never returns saved secret values to the dashboard.
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

