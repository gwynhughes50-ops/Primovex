import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Aurora-themed shadcn-compatible Button
 * - Exports BOTH Button and buttonVariants
 * - Keeps shadcn API: variant + size
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-teal-500 to-emerald-400 text-slate-950 shadow-md hover:from-teal-400 hover:to-emerald-300",
        destructive:
          "bg-rose-500 text-slate-950 shadow-md hover:bg-rose-400",
        outline:
          "border border-slate-700/80 bg-slate-900/60 text-slate-100 hover:bg-slate-800/80",
        secondary:
          "bg-slate-800/70 text-slate-100 hover:bg-slate-800",
        ghost:
          "bg-transparent text-slate-200 hover:bg-slate-800/70",
        link:
          "text-teal-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
