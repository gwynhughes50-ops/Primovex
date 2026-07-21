import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Bug, CheckCircle2, Database, Download, HardDrive,
  MonitorSmartphone, RefreshCw, ShieldCheck, Smartphone, Route, Wifi, WifiOff,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  downloadDeveloperBundle,
  listDeveloperIssues,
  updateDeveloperIssue,
} from '@/developer/developerIssueService';
import { developerAccessAllowed } from '@/developer/developerAccess';
import { getSpaceRegistryDiagnostics } from '@/modules/sense/services/sharedSpaceRegistry';
import { getRouteAuditRows } from '@/config/routeManifest';
import OrbLearningReview from '@/orb/OrbLearningReview';
import OrbGovernedActionReview from '@/orb/OrbGovernedActionReview';

function MetricCard({ icon: Icon, label, value, detail }) {
  return <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-4 shadow-sm">
    <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--medtrak-accent)]/10 text-[var(--medtrak-accent)]"><Icon className="h-5 w-5" /></span><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--medtrak-muted)]">{label}</p><p className="text-lg font-bold">{value}</p></div></div>
    {detail && <p className="mt-3 text-xs text-[var(--medtrak-muted)]">{detail}</p>}
  </div>;
}

export default function DeveloperCentre() {
  const navigate = useNavigate();
  const { role, isAdmin, capabilities } = useAuth();
  const allowed = developerAccessAllowed(role);
  const [issues, setIssues] = useState(() => listDeveloperIssues());
  const [registry, setRegistry] = useState(() => getSpaceRegistryDiagnostics());

  const refresh = () => {
    setIssues(listDeveloperIssues());
    setRegistry(getSpaceRegistryDiagnostics());
  };

  useEffect(() => {
    window.addEventListener('primovex:developer-issues-changed', refresh);
    window.addEventListener('primovex:space-registry-changed', refresh);
    return () => {
      window.removeEventListener('primovex:developer-issues-changed', refresh);
      window.removeEventListener('primovex:space-registry-changed', refresh);
    };
  }, []);

  const openIssues = useMemo(() => issues.filter((issue) => issue.status !== 'closed'), [issues]);
  const viewport = `${window.innerWidth} × ${window.innerHeight}`;
  const routeRows = useMemo(() => getRouteAuditRows({ isAdmin, capabilities, developer: allowed }), [isAdmin, capabilities, allowed]);
  const accessibleRoutes = routeRows.filter((route) => route.accessible);
  const [legacyNavigation, setLegacyNavigation] = useState(() => localStorage.getItem('primovex.desktopNavigation.legacy') === 'true');
  const changeNavigationMode = (legacy) => {
    localStorage.setItem('primovex.desktopNavigation.legacy', String(legacy));
    setLegacyNavigation(legacy);
    window.dispatchEvent(new CustomEvent('primovex:navigation-mode', { detail: { legacy } }));
  };

  if (!allowed) {
    return <div className="rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-8 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-[var(--medtrak-muted)]"/><h1 className="mt-4 text-2xl font-bold">Developer Centre is locked</h1><p className="mt-2 text-[var(--medtrak-muted)]">Enable local development mode or sign in as System Admin.</p></div>;
  }

  return <div className="space-y-6 pb-10">
    <section className="rounded-3xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--medtrak-accent)]">Developer only</p><h1 className="mt-1 text-3xl font-bold">Developer Centre</h1><p className="mt-2 max-w-2xl text-sm text-[var(--medtrak-muted)]">Diagnostics, issue history and release evidence in one engineering cockpit.</p></div>
        <div className="flex flex-wrap gap-2"><button onClick={() => navigate('/developer-mobile-preview')} className="inline-flex items-center gap-2 rounded-xl border border-[var(--medtrak-accent)] px-4 py-2 font-semibold text-[var(--medtrak-accent)]"><Smartphone className="h-4 w-4"/>Launch mobile preview</button><button onClick={refresh} className="inline-flex items-center gap-2 rounded-xl border border-[var(--medtrak-border)] px-4 py-2 font-semibold"><RefreshCw className="h-4 w-4"/>Refresh</button><button onClick={downloadDeveloperBundle} className="inline-flex items-center gap-2 rounded-xl bg-[var(--medtrak-accent)] px-4 py-2 font-semibold text-white"><Download className="h-4 w-4"/>Export bundle</button></div>
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard icon={openIssues.length ? Bug : CheckCircle2} label="Open issues" value={openIssues.length} detail={`${issues.length} total recorded`} />
      <MetricCard icon={Database} label="Space Registry" value={`${registry?.spaceCount ?? registry?.count ?? 0} spaces`} detail={`Revision ${registry?.revision ?? 'unknown'}`} />
      <MetricCard icon={navigator.onLine ? Wifi : WifiOff} label="Connectivity" value={navigator.onLine ? 'Online' : 'Offline'} detail="Current browser state" />
      <MetricCard icon={MonitorSmartphone} label="Viewport" value={viewport} detail={`${window.devicePixelRatio || 1}× pixel ratio`} />
    </section>

    <section className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><Route className="h-5 w-5 text-[var(--medtrak-accent)]"/><div><h2 className="font-bold">Route preservation audit</h2><p className="text-sm text-[var(--medtrak-muted)]">{accessibleRoutes.length} accessible routes · {routeRows.length} registered routes</p></div></div><div className="flex gap-2"><button onClick={() => changeNavigationMode(false)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${!legacyNavigation ? 'border-[var(--medtrak-accent)] text-[var(--medtrak-accent)]' : 'border-[var(--medtrak-border)]'}`}>Adaptive sidebar</button><button onClick={() => changeNavigationMode(true)} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${legacyNavigation ? 'border-amber-400 text-amber-300' : 'border-[var(--medtrak-border)]'}`}>Legacy rollback</button></div></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-[var(--medtrak-border)] text-xs uppercase tracking-wide text-[var(--medtrak-muted)]"><th className="px-3 py-2">Route</th><th className="px-3 py-2">Page</th><th className="px-3 py-2">Section</th><th className="px-3 py-2">Sub-pages</th><th className="px-3 py-2">Access</th></tr></thead><tbody>{routeRows.map((route) => <tr key={`${route.path}-${route.label}`} className="border-b border-[var(--medtrak-border)]/60"><td className="px-3 py-2 font-mono text-xs">{route.path}</td><td className="px-3 py-2 font-semibold">{route.label}</td><td className="px-3 py-2 capitalize text-[var(--medtrak-muted)]">{route.section}</td><td className="px-3 py-2 text-xs text-[var(--medtrak-muted)]">{route.children?.join(' · ') || '—'}</td><td className="px-3 py-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${route.accessible ? 'border-emerald-400/40 text-emerald-300' : 'border-slate-500/40 text-slate-400'}`}>{route.accessible ? 'Available' : 'Protected'}</span></td></tr>)}</tbody></table></div>
    </section>

    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 lg:col-span-2">
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Issue register</h2><p className="text-sm text-[var(--medtrak-muted)]">Reports captured from mobile and desktop testing.</p></div><Bug className="h-5 w-5 text-[var(--medtrak-accent)]"/></div>
        <div className="mt-4 space-y-3">
          {issues.length === 0 ? <div className="rounded-xl border border-dashed border-[var(--medtrak-border)] p-8 text-center text-sm text-[var(--medtrak-muted)]">No issues recorded yet. Open the mobile-width view and use the bug button.</div> : issues.map((issue) => <article key={issue.id} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-[var(--medtrak-accent)]">{issue.id}</span><span className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5 text-[11px] uppercase">{issue.severity}</span><span className="rounded-full border border-[var(--medtrak-border)] px-2 py-0.5 text-[11px]">{issue.module}</span></div><h3 className="mt-2 font-bold">{issue.title}</h3><p className="mt-1 text-sm text-[var(--medtrak-muted)]">{issue.description || issue.actual || 'No additional details'}</p><p className="mt-2 text-xs text-[var(--medtrak-muted)]">{issue.route} · {new Date(issue.createdAt).toLocaleString()}</p></div><div className="flex gap-2"><button onClick={() => updateDeveloperIssue(issue.id, { status: issue.status === 'closed' ? 'open' : 'closed' })} className="rounded-lg border border-[var(--medtrak-border)] px-3 py-2 text-xs font-semibold">{issue.status === 'closed' ? 'Reopen' : 'Close'}</button></div></div>
          </article>)}
        </div>
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5"><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-[var(--medtrak-accent)]"/><h2 className="font-bold">Runtime</h2></div><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-[var(--medtrak-muted)]">Version</dt><dd className="font-semibold">{import.meta.env.VITE_APP_VERSION || '0.11.9'}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--medtrak-muted)]">Mode</dt><dd className="font-semibold">{import.meta.env.MODE}</dd></div><div className="flex justify-between gap-4"><dt className="text-[var(--medtrak-muted)]">Platform</dt><dd className="font-semibold">{document.documentElement.dataset.primovexClient || 'web'}</dd></div></dl></div>
        <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5"><div className="flex items-center gap-2"><HardDrive className="h-5 w-5 text-[var(--medtrak-accent)]"/><h2 className="font-bold">Local diagnostics</h2></div><p className="mt-3 text-sm text-[var(--medtrak-muted)]">Issue reports remain on this device until exported or browser storage is cleared.</p></div>
        <div className="rounded-2xl border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5"><div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-[var(--medtrak-accent)]"/><h2 className="font-bold">Mobile testing</h2></div><p className="mt-3 text-sm text-[var(--medtrak-muted)]">Launch the built-in mobile preview to mount the real Primovex mobile shell without rebuilding Android.</p></div>
      </aside>
    </section>
    <OrbLearningReview />
    <OrbGovernedActionReview />
  </div>;
}
