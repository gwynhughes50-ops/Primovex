import * as React from "react";

const TabsContext = React.createContext({ value: undefined, onValueChange: () => {} });

export function Tabs({ value, onValueChange, children, className = "" }) {
  const ctx = React.useMemo(() => ({ value, onValueChange }), [value, onValueChange]);
  return (
    <div className={className} data-tabs="">
      <TabsContext.Provider value={ctx}>{children}</TabsContext.Provider>
    </div>
  );
}

export function TabsList({ children, className = "" }) {
  return <div className={`flex flex-wrap gap-2 ${className}`}>{children}</div>;
}

export function TabsTrigger({ value, children, className = "", disabled = false }) {
  const { value: active, onValueChange } = React.useContext(TabsContext);
  const isActive = active === value;

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={isActive}
      onClick={() => onValueChange?.(value)}
      className={[
        "rounded-xl border px-3 py-2 text-sm font-semibold transition",
        isActive ? "mt-tab-active" : "mt-tab",
        disabled ? "cursor-not-allowed opacity-50" : "",
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
