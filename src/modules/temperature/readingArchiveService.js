import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { recordAudit } from "@/modules/audit/recordAudit";
import { temperatureReadingEvent } from "@/modules/audit/auditEvents";
import { buildArchivePatch, buildRestorePatch } from "./readingArchive";

// Archive a fridge reading (with the reason picked from the list) or bring it back. The database rules let only an admin or someone with temperature.archive do this, and only to the archive fields.
export async function archiveReading(reading, { reasonKey, note = "", actor }) {
  const patch = buildArchivePatch({ reasonKey, note, actor });
  if (!isSafeSyntheticMode()) await updateDoc(doc(db, "temperature_logs", reading.id), patch);
  recordAudit(temperatureReadingEvent("archived", { reading, reasonKey }));
  return patch;
}

export async function restoreReading(reading, { actor }) {
  const patch = buildRestorePatch({ actor });
  if (!isSafeSyntheticMode()) await updateDoc(doc(db, "temperature_logs", reading.id), patch);
  recordAudit(temperatureReadingEvent("restored", { reading }));
  return patch;
}
