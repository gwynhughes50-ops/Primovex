import { listStaffDirectory } from "@/services/staffDirectoryService";

// The names of the colleagues this person may mention to Ask Primovex (a message to a colleague, "when did Craig last log in"), so the patient-identity
// guard does not refuse them. Read from the staff list when this person's role may read it, and always includes their own name. Kept for ten minutes.
let cache = { at: 0, names: [] };
const TTL = 10 * 60 * 1000;

export async function loadStaffNames(ownName = "") {
  if (Date.now() - cache.at > TTL) {
    let names = [];
    try { names = (await listStaffDirectory()).map((row) => row.label).filter(Boolean); } catch { names = []; }
    cache = { at: Date.now(), names };
  }
  return ownName ? [...cache.names, ownName] : cache.names;
}
