import { useEffect, useState } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { MarkdownContent } from "@/components/markdown-content"
import { api } from "@/lib/api"

export type SetupDocKey = "telegram-setup" | "slack-setup" | "discord-setup" | "signal-setup" | "viber-setup"

export function SetupDocSheet({
  docKey,
  title,
  open,
  onOpenChange,
}: {
  docKey: SetupDocKey
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    api
      .getDoc(docKey)
      .then((r) => {
        setContent(r.content)
      })
      .catch((e) => {
        setError(e.message)
        setContent(null)
      })
      .finally(() => setLoading(false))
  }, [open, docKey])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="p-4 border-b shrink-0">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto p-4">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {content && !loading && (
            <MarkdownContent content={content} className="text-sm [&_h1]:text-lg [&_h2]:text-base [&_h1]:mt-4 [&_h2]:mt-3 [&_ul]:my-2 [&_ol]:my-2" />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
