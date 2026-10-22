import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { subscribeUsageSessions } from "@/services/usageService";
import { appVersionRows } from "@/lib/appVersions";

// Who is on which version of the Primovex app (Security Centre, for administrators and audit readers). Built from the sign-in
// sessions the server already keeps, so nothing extra is collected. Someone who has not updated is flagged so they can be helped.

const DAYS = 90;
const OWN_VERSION = typeof __PRIMOVEX_VERSION__ !== "undefined" ? __PRIMOVEX_VERSION__ : "";
const STATE = {
  behind: { label: "Behind", tone: "bg-amber-500/15 text-amber-100", Icon: AlertTriangle },
  unknown: { label: "Version not reported", tone: "bg-slate-500/15 text-slate-300", Icon: HelpCircle },
  current: { label: "Up to date", tone: "bg-emerald-500/10 text-emerald-200", Icon: CheckCircle2 },
};
const seenText = (row) => (row.daysAgo === null ? "—" : row.daysAgo === 0 ? "Today" : row.daysAgo === 1 ? "Yesterday" : `${row.daysAgo} days ago`);

export default function AppVersionsPanel({ onClose }) {
  const { profile, isAdmin, can } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [behindOnly, setBehindOnly] = useState(false);
  const practiceId = profile?.practiceId || profile?.organisationId || profile?.organizationId || "primary";
  const permitted = isAdmin || can?.("audit.read");

  useEffect(() => {
    if (!permitted) return undefined;
    const since = new Date(Date.now() - DAYS * 86400000);
    return subscribeUsageSessions(
      { practiceId, since, max: 2000 },
      (rows) => { setSessions(rows); setLoading(false); },
      (err) => { setError(err?.code === "permission-denied" ? "You don't have permission to read this." : err?.message || "Could not load the app versions."); setLoading(false); },
    );
  }, [permitted, practiceId]);

  const { rows, latest, counts } = useMemo(() => appVersionRows(sessions, { latest: OWN_VERSION }), [sessions]);
  const shown = behindOnly ? rows.filter((r) => r.state !== "current") : rows;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Who is on which version" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-50">Who is on which version</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">The installed Windows and Android apps, from sign-ins in the last {DAYS} days. The website and the iPhone Home Screen app update themselves, so they are not listed.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        {loading && !error && <p className="mt-3 flex items-center gap-2 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…</p>}

        {!loading && !error && (
          <>
            <div className="mt-4 grid gap-2 sm:grid-cols-4">
              {[["Newest version", latest || "—", ""], ["Behind", counts.behind, counts.behind ? "bg-amber-500/10" : ""], ["Version not reported", counts.unknown, ""], ["Up to date", counts.current, "bg-emerald-500/10"]].map(([label, value, tone]) => (
                <div key={label} className={`rounded-xl border border-slate-800 p-3 ${tone}`}><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-50">{value}</p></div>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-200"><input type="checkbox" checked={behindOnly} onChange={(e) => setBehindOnly(e.target.checked)} /> Only show copies that need attention</label>

            {rows.length === 0 ? (
              <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">No installed app has signed in during the last {DAYS} days{counts.webOnly ? `, though ${counts.webOnly} ${counts.webOnly === 1 ? "person has" : "people have"} used the website or phone` : ""}.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-900 text-left text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Device</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Last signed in</th><th className="px-3 py-2">Status</th></tr></thead>
                  <tbody>
                    {shown.map((r) => {
                      const { label, tone, Icon } = STATE[r.state];
                      return (
                        <tr key={r.key} className="border-t border-slate-800 align-top">
                          <td className="px-3 py-2"><span className="font-semibold text-slate-100">{r.name}</span><span className="block text-xs text-slate-500">{r.role}</span></td>
                          <td className="px-3 py-2 text-slate-300">{r.device}</td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-200">{r.version || "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-300">{seenText(r)}{r.notSeenRecently && r.daysAgo !== null ? <span className="block text-xs text-amber-200">Not seen for a while</span> : null}</td>
                          <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!shown.length && <p className="p-4 text-sm text-slate-400">Everyone listed is up to date.</p>}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-300">
              <p className="font-semibold text-slate-100">Someone is behind?</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>From 0.15.62 the app has "Check for updates" at the bottom of the sidebar: ask them to press it.</li>
                <li>A copy older than 0.15.42 cannot update itself. It needs the installer run once; after that it updates by itself.</li>
                <li>"Version not reported" means that copy has not sent its version: it is probably very old, so treat it the same way.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
