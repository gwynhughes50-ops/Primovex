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
        "mt-input flex h-10 w-full rounded-xl border px-3 py-2 text-sm",
        "placeholder:opacity-70 focus-visible:outline-none",
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
