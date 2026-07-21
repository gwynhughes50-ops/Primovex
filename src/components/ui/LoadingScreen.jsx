import React from "react";
import { Loader2 } from "lucide-react";

/**
 * LoadingScreen
 * - Aurora dark/teal friendly loading UI
 * - Use fullscreen={false} to embed inside a card/section
 */
export default function LoadingScreen({
  title = "Loading",
  message = "Please wait…",
  fullscreen = true,
}) {
  if (!fullscreen) {
    return (
      <div className="w-full rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 shadow-sm backdrop-blur p-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-200" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-50 truncate">
              {title}
            </div>
            <div className="text-sm text-slate-400">{message}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/40 border border-slate-800/60">
            <div className="h-full w-1/2 animate-[aurora_loadingbar_1.2s_ease-in-out_infinite] bg-gradient-to-r from-teal-500 to-emerald-400" />
          </div>
          <div className="mt-3 text-xs text-slate-500">
            If this takes longer than usual, check your network connection.
          </div>
        </div>

        <style>{`
          @keyframes aurora_loadingbar {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(0%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-72px)] flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800/70 bg-slate-900/60 text-slate-100 shadow-sm backdrop-blur p-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-emerald-500/10 border border-emerald-400/20 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-200" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-50 truncate">
              {title}
            </div>
            <div className="text-sm text-slate-400">{message}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/40 border border-slate-800/60">
            <div className="h-full w-1/2 animate-[aurora_loadingbar_1.2s_ease-in-out_infinite] bg-gradient-to-r from-teal-500 to-emerald-400" />
          </div>
          <div className="mt-3 text-xs text-slate-500">
            If this takes longer than usual, check your network connection.
          </div>
        </div>

        <style>{`
          @keyframes aurora_loadingbar {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(0%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    </div>
  );
}
