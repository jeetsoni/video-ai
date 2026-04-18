import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-xl bg-surface-container-highest px-3 py-2 text-base text-on-surface transition-all outline-none placeholder:text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:shadow-[0_0_0_4px_rgba(167,165,255,0.2)]",
        "aria-invalid:shadow-[0_0_0_4px_rgba(255,92,92,0.2)]",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
