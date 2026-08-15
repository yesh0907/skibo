import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-white/12 bg-emerald-950/65 shadow-2xl shadow-black/15 backdrop-blur-sm", className)}
      {...props}
    />
  );
}
