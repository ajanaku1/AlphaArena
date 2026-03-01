import * as React from "react"

import { cn } from "@/lib/utils"

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "secondary" | "destructive" | "outline" | "success"
  }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex items-center border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[1px] transition-colors focus:outline-none",
      {
        "border-transparent bg-[#B5FF00] text-black":
          variant === "default",
        "border-[#222] bg-[#111] text-muted-foreground":
          variant === "secondary",
        "border-transparent bg-destructive text-destructive-foreground":
          variant === "destructive",
        "border-[#222] text-foreground":
          variant === "outline",
        "border-transparent bg-[#00FF88]/10 text-[#00FF88]":
          variant === "success",
      },
      className
    )}
    {...props}
  />
))
Badge.displayName = "Badge"

export { Badge }
