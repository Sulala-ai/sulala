import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react"

import { cn } from "@/lib/utils"

export interface ShimmerBorderProps extends ComponentPropsWithoutRef<"div"> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
}

export const ShimmerBorder: React.FC<ShimmerBorderProps> = ({
  shimmerColor,
  shimmerSize = "0.001em",
  shimmerDuration = "10s",
  borderRadius = "999px",
  background = "rgba(0, 0, 0, 0.4)",
  className,
  children,
  ...props
}) => {
  const resolvedShimmerColor =
    shimmerColor ??
    (typeof window !== "undefined" &&
    document.documentElement.classList.contains("dark")
      ? "#ffffff"
      : "#000000")

  return (
    <div
      style={
        {
          "--spread": "90deg",
          "--shimmer-color": resolvedShimmerColor,
          "--radius": borderRadius,
          "--speed": shimmerDuration,
          "--cut": shimmerSize,
          "--bg": background,
        } as CSSProperties
      }
      className={cn(
        "group relative z-0 flex items-center justify-center overflow-hidden [border-radius:var(--radius)] border border-white/10",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none -z-30 blur-[2px] @container-[size] absolute inset-0 overflow-visible">
        <div className="animate-shimmer-slide absolute inset-0 aspect-[1] h-[100cqh] rounded-none [mask:none]">
          <div className="animate-spin-around absolute -inset-full w-auto [translate:0_0] rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
        </div>
      </div>

      <div className="absolute inset-0 size-full rounded-full px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f] group-hover:shadow-[inset_0_-6px_10px_#ffffff3f] group-active:shadow-[inset_0_-10px_10px_#ffffff3f]" />

      <div className="absolute inset-(--cut) -z-20 [border-radius:var(--radius)] [background:var(--bg)]" />

      <div className="relative z-10">{children}</div>
    </div>
  )
}

