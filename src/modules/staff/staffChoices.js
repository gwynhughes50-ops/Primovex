// The people to choose from when someone is named on a record (who took a reading, who opened or resolved an incident).
// Always real accounts, so the audit trail names a person, never whatever was typed. The person signed in is always
// there and first, so a role that can't read the staff list can still record themselves.
//   staff: [{ id, label, role }] from the staff directory; me: { uid, name }
export function staffChoices(staff = [], me = null) {
  const seen = new Set();
  const choices = [];
  const add = (uid, name, role = "") => {
    if (!uid || seen.has(uid)) return;
    seen.add(uid);
    choices.push({ uid, name: String(name || "").trim() || "Unnamed user", role });
  };
  if (me?.uid) add(me.uid, me.name || "You");
  for (const person of staff) add(person?.id, person?.label, person?.role);
  const [first, ...rest] = choices;
  if (me?.uid && first) return [first, ...rest.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))];
  return choices.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

// the { uid, name } to store for a chosen uid ("" when nobody is chosen)
export const pickedPerson = (choices, uid) => {
  const found = choices.find((c) => c.uid === uid);
  return found ? { uid: found.uid, name: found.name } : { uid: "", name: "" };
};
