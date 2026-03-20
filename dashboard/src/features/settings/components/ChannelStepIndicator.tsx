import { cn } from "@/lib/utils"

export function ChannelStepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Configure" },
    { n: 2, label: "Verify" },
    { n: 3, label: "Ready" },
  ]
  return (
    <div className="flex items-center gap-2 text-sm mb-4">
      {steps.map(({ n, label }) => (
        <span key={n} className="flex items-center gap-2">
          <span className={cn("font-medium", n === currentStep ? "text-primary" : "text-muted-foreground")}>
            {n} {label}
          </span>
          {n < 3 && <span className="text-muted-foreground">→</span>}
        </span>
      ))}
    </div>
  )
}
