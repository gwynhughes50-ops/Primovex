export default function FormField({ label, description, error, required = false, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-sm font-semibold mt-text-primary">
          {label}{required ? " *" : ""}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs text-rose-400">{error}</span>
      ) : description ? (
        <span className="mt-1.5 block text-xs leading-5 mt-text-muted">{description}</span>
      ) : null}
    </label>
  );
}
