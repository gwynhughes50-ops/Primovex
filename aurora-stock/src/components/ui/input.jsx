// src/components/ui/input.jsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(function Input(
  { className = "", type = "text", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-slate-800/70 bg-slate-950/40 px-3 py-2 text-sm text-slate-100",
        "placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/70",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
export default Input;
