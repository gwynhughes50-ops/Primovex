import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Monitor, Smartphone } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ROLE_TEMPLATES } from "@/core/identity/capabilities";
import { viewAsChoices } from "@/core/identity/viewAs";
import { OPEN_PHONE_PREVIEW } from "@/components/security/ViewAsBanner";

// Advanced Admin > View as: pick a kind of account (the Caretaker, a Nurse, a custom role) and look at the desktop or
// the phone app the way that account sees it, without signing in as them. For checking what a role gets after
// changing its permissions. Only for a System Admin; see core/identity/viewAs.js for exactly what it does.
export default function ViewAsPanel() {
  const { canViewAs, customRoles, viewingAs, setViewAs, realRole } = useAuth();
  const navigate = useNavigate();
  const choices = useMemo(() => viewAsChoices({ builtIn: Object.keys(ROLE_TEMPLATES), custom: customRoles || [] }), [customRoles]);
  const [role, setRole] = useState(viewingAs || "Caretaker");
  if (!canViewAs) return null;

  const viewDesktop = () => { setViewAs(role); navigate("/dashboard"); };
  const openPhone = () => window.dispatchEvent(new CustomEvent(OPEN_PHONE_PREVIEW, { detail: { role } }));

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg" aria-label="View as another account type">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-100"><Eye className="h-5 w-5 text-teal-300" aria-hidden="true" /> View as</h2>
      <p className="mt-1 max-w-3xl text-sm text-slate-400">See Primovex the way another kind of account sees it, without signing in as them. This changes what the screens show. You stay signed in as {realRole}, so anything you do while viewing is recorded as you.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">Account type
          <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 block min-w-56 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-300/60">
            <optgroup label="Built-in roles">{choices.builtIn.map((name) => <option key={name} value={name}>{name}</option>)}</optgroup>
            {choices.custom.length > 0 && <optgroup label="Your own roles">{choices.custom.map((name) => <option key={name} value={name}>{name}</option>)}</optgroup>}
          </select>
        </label>
        <button type="button" onClick={viewDesktop} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-slate-950"><Monitor className="h-4 w-4" aria-hidden="true" /> View the desktop as {role}</button>
        <button type="button" onClick={openPhone} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-100"><Smartphone className="h-4 w-4" aria-hidden="true" /> Open the phone as {role}</button>
        {viewingAs && <button type="button" onClick={() => setViewAs(null)} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-300">Stop viewing as {viewingAs}</button>}
      </div>
    </section>
  );
}
