import { useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { CopyIcon } from "lucide-react"

export function SettingsDashboardAccess() {
  const [regenerating, setRegenerating] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleRegenerate() {
    setRegenerating(true)
    setNewToken(null)
    setMessage(null)
    try {
      const res = await api.regenerateDashboardToken()
      setNewToken(res.token)
      setMessage(res.message)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setRegenerating(false)
    }
  }

  function handleCopy() {
    if (!newToken) return
    void navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard login token</CardTitle>
          <CardDescription>
            The gateway token is used to log in to this dashboard. You can regenerate it here and copy the new token.
            After restarting the server, the new token will be required to log in; your current session stays valid until then.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button type="button" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate token"}
          </Button>
          {newToken && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <Label className="text-xs">New token (copy and save it)</Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={newToken} className="font-mono text-sm" />
                <Button type="button" variant="outline" size="icon" onClick={handleCopy} title="Copy">
                  <CopyIcon className="size-4" />
                </Button>
              </div>
              {copied && <p className="text-xs text-green-600 dark:text-green-400">Copied to clipboard.</p>}
              {message && <p className="text-xs text-muted-foreground">{message}</p>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            You can also view or regenerate the token from the CLI: <code className="rounded bg-muted px-1">sulala dashboard-token</code> or <code className="rounded bg-muted px-1">sulala dashboard-token --regenerate</code>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
