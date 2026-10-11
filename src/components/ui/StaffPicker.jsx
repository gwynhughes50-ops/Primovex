import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { listStaffDirectory } from "@/services/staffDirectoryService";
import { pickedPerson, staffChoices } from "@/modules/staff/staffChoices";

// One staff list for the whole app session, fetched once and kept for a few minutes.
let cache = { at: 0, promise: null };
const loadStaff = () => {
  if (!cache.promise || Date.now() - cache.at > 5 * 60 * 1000) {
    cache = { at: Date.now(), promise: listStaffDirectory().catch(() => { cache = { at: 0, promise: null }; return []; }) };
  }
  return cache.promise;
};

// Choose a person from the practice's real accounts, for the audit trail: nobody types a name. Defaults to the person
// signed in. value / onChange use { uid, name }.
export default function StaffPicker({ value, onChange, label, id }) {
  const { user, displayName } = useAuth();
  const me = useMemo(() => (user?.uid ? { uid: user.uid, name: displayName || user.email || "You" } : null), [user?.uid, displayName, user?.email]);
  const [staff, setStaff] = useState([]);
  useEffect(() => { let live = true; loadStaff().then((list) => { if (live) setStaff(list); }); return () => { live = false; }; }, []);
  const choices = useMemo(() => staffChoices(staff, me), [staff, me]);
  const uid = value?.uid || "";
  // nobody chosen yet: it is the person signed in, until they pick someone else
  useEffect(() => { if (!uid && me) onChange?.({ uid: me.uid, name: me.name }); }, [uid, me]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <label htmlFor={id} className="text-xs text-slate-300">{label}</label>
      <select
        id={id}
        value={uid}
        onChange={(event) => onChange?.(pickedPerson(choices, event.target.value))}
        className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
      >
        {choices.map((c) => <option key={c.uid} value={c.uid}>{c.uid === me?.uid ? `${c.name} (you)` : c.name}{c.role ? ` · ${c.role}` : ""}</option>)}
      </select>
    </div>
  );
}
