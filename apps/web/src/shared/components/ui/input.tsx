import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-xl bg-surface-container-highest px-3 py-1 text-base text-on-surface transition-all outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-on-surface placeholder:text-on-surface-variant disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:shadow-[0_0_0_4px_rgba(167,165,255,0.2)]",
        "aria-invalid:shadow-[0_0_0_4px_rgba(255,92,92,0.2)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
