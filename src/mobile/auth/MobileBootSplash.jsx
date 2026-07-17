import MobileBrandLockup from "./MobileBrandLockup";

export default function MobileBootSplash({ message = "Starting securely" }) {
  return (
    <div className="fixed inset-0 z-[250] grid place-items-center overflow-hidden bg-[var(--medtrak-bg)] px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-[var(--medtrak-text)]">
      <div className="animate-[fadeIn_420ms_ease-out] text-center">
        <MobileBrandLockup />
        <p className="mt-8 text-sm font-medium text-[var(--medtrak-muted)]">{message}</p>
        <div className="mx-auto mt-4 h-1 w-28 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--medtrak-border)_70%,transparent)]">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--medtrak-accent)]" />
        </div>
      </div>
    </div>
  );
}
