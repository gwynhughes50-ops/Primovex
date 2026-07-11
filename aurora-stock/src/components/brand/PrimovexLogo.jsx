import { useMedTrakTheme } from "@/components/theme/MedTrakThemeProvider";

const BRAND_ASSETS = {
  logoLight: "/branding/primovex-logo-approved.png",
  logoDark: "/branding/primovex-logo-dark.png",
  mark: "/branding/primovex-mark-approved.png",
};

export function PrimovexMark({
  className = "h-12 w-12",
  title = "Primovex",
}) {
  return (
    <img
      src={BRAND_ASSETS.mark}
      alt={title}
      className={`block object-contain ${className}`}
      draggable="false"
    />
  );
}

/**
 * Official Primovex brand artwork.
 *
 * The full lock-up automatically switches between the approved light-surface
 * artwork and the high-contrast dark-surface artwork. This keeps the icon,
 * wordmark and tagline consistent across every theme without page-level logo
 * decisions.
 *
 * `compact` sizes the lock-up for the application header. Use `markOnly` for
 * favicons, mobile controls and compact brand surfaces.
 */
export default function PrimovexLogo({
  className = "",
  compact = false,
  markOnly = false,
  title = "Primovex, AI Practice Intelligence",
  variant = "auto",
}) {
  const { theme } = useMedTrakTheme();

  if (markOnly) {
    return <PrimovexMark className={className || "h-12 w-12"} title={title} />;
  }

  const useDarkSurfaceArtwork =
    variant === "dark" || (variant === "auto" && !theme.light);

  const logoSrc = useDarkSurfaceArtwork
    ? BRAND_ASSETS.logoDark
    : BRAND_ASSETS.logoLight;

  return (
    <img
      src={logoSrc}
      alt={title}
      className={`block h-auto object-contain object-left ${
        compact
          ? "w-[245px] max-w-[58vw] sm:w-[285px]"
          : "w-[300px] max-w-[82vw] sm:w-[390px] lg:w-[440px]"
      } ${className}`}
      draggable="false"
    />
  );
}
