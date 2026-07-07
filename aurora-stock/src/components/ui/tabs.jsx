import * as React from "react";

export function Tabs({ value, onValueChange, children, className = "" }) {
  // Very small controlled wrapper to match shadcn-style API
  const ctx = React.useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
  return (
    <div className={className} data-tabs="">
      <TabsContext.Provider value={ctx}>{children}</TabsContext.Provider>
    </div>
  );
}

const TabsContext = React.createContext({ value: undefined, onValueChange: () => {} });

export function TabsList({ children, className = "" }) {
  return <div className={`inline-flex gap-2 ${className}`}>{children}</div>;
}

export function TabsTrigger({ value, children, className = "", disabled = false }) {
  const { value: active, onValueChange } = React.useContext(TabsContext);

  const isActive = active === value;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onValueChange?.(value)}
      className={[
        "rounded-xl px-3 py-2 text-sm transition",
        isActive
          ? "bg-teal-500 text-slate-950"
          : "bg-slate-900/60 text-slate-200 hover:bg-slate-800/70",
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className = "" }) {
  const { value: active } = React.useContext(TabsContext);
  if (active !== value) return null;
  return <div className={className}>{children}</div>;
}
