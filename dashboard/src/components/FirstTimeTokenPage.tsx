import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setDashboardToken } from "@/lib/api"
import { CopyIcon, SparklesIcon } from "lucide-react"

export type FirstTimeTokenPageProps = {
  token: string
  onContinue: () => void
}

/**
 * First-time onboarding: show the dashboard token to copy, then continue to dashboard.
 * Next time the user will see the login page and must enter this token.
 */
export function FirstTimeTokenPage({ token, onContinue }: FirstTimeTokenPageProps) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleContinue() {
    setDashboardToken(token)
    onContinue()
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <SparklesIcon className="size-5 text-primary" />
          </div>
          <CardTitle className="text-xl">Welcome — save your login token</CardTitle>
          <CardDescription>
            Copy this token and store it somewhere safe. You will need it to log in next time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Dashboard token (copy and save)</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={token}
                className="font-mono text-sm"
                type="text"
                aria-label="Dashboard token"
              />
              <Button type="button" variant="outline" onClick={handleCopy} title="Copy token">
                {copied ? "Copied!" : (
                  <>
                    <CopyIcon className="size-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          </div>
          <Button onClick={handleContinue} className="w-full">
            Continue to dashboard
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You can regenerate the token later in Settings → Dashboard access.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
