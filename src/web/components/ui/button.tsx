import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-lime-300/60 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        primary: "bg-lime-300 text-emerald-950 shadow-sm hover:bg-lime-200",
        secondary: "border border-white/15 bg-white/8 text-white hover:bg-white/14",
        ghost: "text-emerald-100 hover:bg-white/10",
        danger: "border border-red-300/30 bg-red-950/35 text-red-100 hover:bg-red-900/50",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
