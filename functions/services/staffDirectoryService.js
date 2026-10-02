// A minimal staff list for the "Assigned To" and "Manager for Escalation"
// pickers on the SAR register. The Firestore rules (rightly) don't let everyone
// read the users collection - it holds email addresses and roles - so a SAR
// team member who isn't an administrator got an empty list and no one to pick.
// This returns only what a picker needs (an id, a display name and the role),
// and only for people allowed to assign SARs or work on concerns.

// The label people see: their name, else their email, else a placeholder. The
// email is only ever used as the label for someone with no name, never sent as
// a separate field.
function staffLabel(user) {
  return String(user.displayName || "").trim() || String(user.email || "").trim() || "Unnamed user";
}

// Active accounts only (nobody can usefully be assigned a SAR once deactivated),
// sorted by name. Pure, so it can be tested.
function staffDirectoryEntries(users = []) {
  return users
    .filter((user) => user && user.id && user.active !== false)
    .map((user) => ({ id: user.id, label: staffLabel(user), role: String(user.role || "") }))
    .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

async function listStaffDirectory({ db }) {
  const snapshot = await db.collection("users").get();
  return staffDirectoryEntries(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
}

module.exports = { listStaffDirectory, staffDirectoryEntries, staffLabel };
