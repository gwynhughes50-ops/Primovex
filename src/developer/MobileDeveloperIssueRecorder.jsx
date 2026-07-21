import { useEffect, useState } from 'react';
import { Bug, Download, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { developerAccessAllowed } from './developerAccess';
import { createDeveloperIssue, downloadDeveloperBundle, listDeveloperIssues } from './developerIssueService';

export default function MobileDeveloperIssueRecorder() {
  const { role } = useAuth();
  const allowed = developerAccessAllowed(role);
  const [open, setOpen] = useState(false); const [issues, setIssues] = useState(() => listDeveloperIssues());
  const [form, setForm] = useState({ title: '', description: '', expected: '', actual: '', module: 'Mobile', severity: 'minor' });
  useEffect(() => { const refresh = () => setIssues(listDeveloperIssues()); window.addEventListener('primovex:developer-issues-changed', refresh); return () => window.removeEventListener('primovex:developer-issues-changed', refresh); }, []);
  if (!allowed) return null;
  const save = (event) => { event.preventDefault(); if (!form.title.trim()) return; createDeveloperIssue(form); setForm({ title: '', description: '', expected: '', actual: '', module: 'Mobile', severity: 'minor' }); setOpen(false); };
  return <>
    <button type="button" onClick={() => setOpen(true)} className="fixed right-3 z-[96] grid h-11 w-11 place-items-center rounded-full border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] text-[var(--medtrak-accent)] shadow-xl" style={{ bottom: 'calc(5.6rem + env(safe-area-inset-bottom))' }} aria-label="Report developer issue"><Bug className="h-5 w-5"/></button>
    {open && <div className="fixed inset-x-0 top-0 z-[130] flex items-end bg-black/50" style={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}><form onSubmit={save} className="max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] w-full overflow-y-auto rounded-t-[2rem] border border-[var(--medtrak-border)] bg-[var(--medtrak-panel)] p-5 pb-8"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-[var(--medtrak-accent)]">Developer only</p><h2 className="text-xl font-bold">Report an issue</h2><p className="text-xs text-[var(--medtrak-muted)]">{issues.filter(i=>i.status==='open').length} open reports</p></div><button type="button" onClick={()=>setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-[var(--medtrak-border)]"><X/></button></div>
      <input autoFocus value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="What went wrong?" className="mt-4 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"/>
      <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Steps to reproduce" rows="3" className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"/>
      <div className="mt-3 grid grid-cols-2 gap-2"><select value={form.module} onChange={e=>setForm({...form,module:e.target.value})} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"><option>Mobile</option><option>Sense</option><option>Spaces</option><option>Facilities</option><option>Inventory</option><option>Connect</option><option>Login</option><option>Theme</option></select><select value={form.severity} onChange={e=>setForm({...form,severity:e.target.value})} className="rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"><option value="cosmetic">Cosmetic</option><option value="minor">Minor</option><option value="major">Major</option><option value="blocking">Blocking</option></select></div>
      <input value={form.expected} onChange={e=>setForm({...form,expected:e.target.value})} placeholder="Expected result" className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"/><input value={form.actual} onChange={e=>setForm({...form,actual:e.target.value})} placeholder="Actual result" className="mt-3 w-full rounded-xl border border-[var(--medtrak-border)] bg-[var(--medtrak-bg)] p-3"/>
      <button className="mt-4 w-full rounded-xl bg-[var(--medtrak-accent)] p-3 font-bold text-white">Save issue</button><button type="button" onClick={downloadDeveloperBundle} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--medtrak-border)] p-3 font-semibold"><Download className="h-4 w-4"/>Export development bundle</button>
    </form></div>}
  </>;
}
