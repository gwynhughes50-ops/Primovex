export default function MobileBrandLockup({ compact = false }) {
  return (
    <div className="flex flex-col items-center text-center" aria-label="Primovex">
      <img
        src="/branding/primovex-mark-only.png"
        alt=""
        className={`${compact ? "h-[4.25rem] w-[4.9rem]" : "h-[5.5rem] w-[6.25rem]"} object-contain`}
      />
      <div className={`${compact ? "mt-3 text-[1.05rem]" : "mt-4 text-[1.25rem]"} font-extrabold uppercase leading-none tracking-[0.28em] text-[var(--medtrak-text)]`}>
        Primovex
      </div>
      {!compact && (
        <p className="mt-3 text-[0.69rem] font-semibold uppercase tracking-[0.2em] text-[var(--medtrak-muted)]">
          Practice Operations Platform
        </p>
      )}
    </div>
  );
}
