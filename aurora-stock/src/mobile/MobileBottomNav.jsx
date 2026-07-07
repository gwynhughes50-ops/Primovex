import { mobileNavigation } from "@/config/navigation";
import { resolveIcon } from "@/config/medtrakIcons";

export default function MobileBottomNav({ activeKey = "home", onNavigate, onScanClick }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800 bg-slate-950/95 px-3 pb-3 pt-2 text-slate-100 backdrop-blur">
      <div className="mx-auto flex max-w-md items-end justify-around">
        {mobileNavigation.map((item) => {
          const Icon = resolveIcon(item.icon, "helpCircle");
          const isActive = activeKey === item.key;

          if (item.primary) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={onScanClick}
                className="-mt-8 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-teal-400 text-slate-950 shadow-lg shadow-teal-500/30 transition hover:bg-teal-300 active:scale-95"
              >
                <Icon className="h-6 w-6" />
                <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide">{item.label}</span>
              </button>
            );
          }

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate?.(item.key)}
              className={`flex min-h-12 min-w-12 flex-col items-center gap-1 rounded-xl px-2 py-1 text-xs transition ${
                isActive
                  ? "bg-teal-500/15 text-teal-100"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
