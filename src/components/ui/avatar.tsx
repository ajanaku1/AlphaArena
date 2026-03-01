import * as React from "react"

import { cn } from "@/lib/utils"

const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    src?: string
    fallback?: string
  }
>(({ className, src, fallback, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    )}
    {...props}
  >
    {src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="aspect-square h-full w-full object-cover"
        src={src}
        alt="Avatar"
      />
    ) : fallback ? (
      <span className="flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground text-sm font-medium">
        {fallback}
      </span>
    ) : (
      <span className="flex h-full w-full items-center justify-center rounded-full bg-muted" />
    )}
  </span>
))
Avatar.displayName = "Avatar"

export { Avatar }
