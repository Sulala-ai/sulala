import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setDashboardToken } from "@/lib/api"
import { api } from "@/lib/api"
import { LockIcon } from "lucide-react"

export type LoginPageProps = {
  onSuccess: () => void
}

/**
 * Gateway-token login when the server uses DASHBOARD_SECRET.
 * User enters the secret; we verify with a light API call then call onSuccess.
 */
export function LoginPage({ onSuccess }: LoginPageProps) {
  const [token, setTokenInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = token.trim()
    if (!value) {
      setError("Enter the dashboard token.")
      return
    }
    setError(null)
    setVerifying(true)
    setDashboardToken(value)
    try {
      await api.getAgents()
      onSuccess()
    } catch {
      setDashboardToken(null)
      setError("Invalid token. Run sulala dashboard-token in a terminal to view or copy the token.")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <LockIcon className="size-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Dashboard access</CardTitle>
          <CardDescription>
            This server is protected. Enter the dashboard token to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dashboard-token">Token</Label>
              <p className="text-xs text-muted-foreground">
                Get your token from the server: run{" "}
                <code className="rounded bg-muted px-1">sulala dashboard-token</code> in a terminal and paste it here.
                To generate a new token: <code className="rounded bg-muted px-1">sulala dashboard-token --regenerate</code>
              </p>
              <Input
                id="dashboard-token"
                type="password"
                placeholder="Paste your dashboard token…"
                value={token}
                onChange={(e) => {
                  setTokenInput(e.target.value)
                  setError(null)
                }}
                autoComplete="current-password"
                autoFocus
                disabled={verifying}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={verifying}>
              {verifying ? "Verifying…" : "Continue"}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            After logging in, you can regenerate the token in Settings → Dashboard access.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
