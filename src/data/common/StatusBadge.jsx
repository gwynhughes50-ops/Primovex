import { getStatusColour } from "@/config/statusColours";
import { cx } from "@/config/medtrakTheme";

export default function StatusBadge({ status = "neutral", children, className = "" }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", getStatusColour(status), className)}>
      {children || status}
    </span>
  );
}
