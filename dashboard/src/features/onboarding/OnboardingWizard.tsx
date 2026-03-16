import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AiProviderForm } from "@/features/settings/components/AiProviderForm"
import { api } from "@/lib/api"
import { BotIcon, KeyIcon, MessageCircleIcon, ChevronRightIcon, SparklesIcon } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: 1, title: "AI Provider", icon: KeyIcon },
  { id: 2, title: "First agent", icon: BotIcon },
  { id: 3, title: "Channel", icon: MessageCircleIcon },
] as const

export type OnboardingWizardProps = {
  onComplete: () => void
  onRefresh: () => void
  /** If provided, "Open Settings to add a channel" calls this instead of onComplete (e.g. complete + navigate to settings). */
  onCompleteAndOpenSettings?: () => void
  hasAnyAiKey: boolean
  hasAnyAgent: boolean
}

export function OnboardingWizard({ onComplete, onRefresh, onCompleteAndOpenSettings, hasAnyAiKey, hasAnyAgent }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [step1HasKey, setStep1HasKey] = useState(hasAnyAiKey)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState<string | null>(null)

  const canProceedFromStep1 = step1HasKey
  const currentStepIndex = STEPS.findIndex((s) => s.id === step)

  function handleInstallSystem() {
    setInstallError(null)
    setInstalling(true)
    api
      .installSystemAgents()
      .then(() => {
        onRefresh()
        setStep(3)
      })
      .catch((e) => setInstallError(e instanceof Error ? e.message : String(e)))
      .finally(() => setInstalling(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            <SparklesIcon className="size-4" />
            Welcome to Agent OS
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Set up in 3 steps</h1>
          <p className="text-muted-foreground text-sm">
            Configure your AI provider, add an agent, and optionally connect a channel.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <span key={s.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors",
                  step === s.id
                    ? "bg-primary text-primary-foreground"
                    : i < currentStepIndex
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                )}
              >
                <s.icon className="size-3.5" />
                {s.title}
              </span>
              {i < STEPS.length - 1 && (
                <ChevronRightIcon className="size-4 text-muted-foreground/50" aria-hidden />
              )}
            </span>
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[280px] rounded-xl border bg-card p-6">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Add at least one API key so your agents can use an AI model. OpenRouter lets you use many models with one key.
              </p>
              <AiProviderForm compact onHasKeyChange={setStep1HasKey} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Create your first agent. You can install default agents from the system or add one later from the Agents page.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  onClick={handleInstallSystem}
                  disabled={installing}
                  className="flex-1"
                >
                  {installing ? "Installing…" : "Install default agents"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setStep(3)}
                  className="flex-1"
                >
                  I'll add one later
                </Button>
              </div>
              {installError && (
                <p className="text-sm text-destructive">{installError}</p>
              )}
              {hasAnyAgent && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  You already have at least one agent. Click Next to continue.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect Telegram, Slack, Discord, or another channel so users can talk to your agent from their favorite app. You can configure this anytime in Settings.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button onClick={onComplete} className="flex-1">
                  Get started
                </Button>
                {onCompleteAndOpenSettings && (
                  <Button
                    variant="outline"
                    onClick={onCompleteAndOpenSettings}
                    className="flex-1"
                  >
                    Open Settings to add a channel
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 3 && (
              <Button
                disabled={step === 1 && !canProceedFromStep1}
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
              >
                Next
                <ChevronRightIcon className="ml-1 size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
