import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { nextReviewFrom, dateKey, normaliseSubstance, toRecord } from "./coshh";

const COLLECTION = "coshh_substances";
export const MAX_SDS_BYTES = 15 * 1024 * 1024;

// Every substance in the register, kept up to date (`enabled` false = do not listen, for someone who may not read it). `list` is null until the first answer arrives, so a screen can
// tell "still loading" from "nothing there"; `error` is set if the register can't be read (no permission, offline).
export function useCoshhSubstances(enabled = true) {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => !enabled ? undefined : onSnapshot(
    collection(db, COLLECTION),
    (snap) => setState({ list: snap.docs.map((d) => normaliseSubstance(d.id, d.data())), error: "" }),
    (error) => setState({ list: [], error: error?.code === "permission-denied" ? "Your role can't open the COSHH register." : "Could not load the COSHH register." }),
  ), [enabled]);
  return state;
}

export function sdsProblem(file) {
  if (!file) return "Choose the safety data sheet file.";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return "The safety data sheet must be a PDF file.";
  if (file.size > MAX_SDS_BYTES) return "That PDF is over 15 MB. Ask the supplier for a smaller copy.";
  if (!file.size) return "That file is empty.";
  return "";
}

const safeName = (name) => String(name || "sheet.pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "sheet.pdf";

// uploads the PDF and returns where it is; the caller puts the three values on the substance
export async function uploadSds(substanceId, file) {
  const problem = sdsProblem(file);
  if (problem) throw new Error(problem);
  const path = `coshh_sds/${substanceId}/${Date.now()}_${safeName(file.name)}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: "application/pdf" });
  const url = await getDownloadURL(fileRef);
  return { sdsUrl: url, sdsPath: path, sdsFileName: file.name || "safety-data-sheet.pdf" };
}

async function removeSdsFile(path) {
  if (!path) return;
  try { await deleteObject(ref(storage, path)); } catch (error) { console.warn("Old safety data sheet could not be removed.", error); }
}

// Saves a substance. A new one is created first (so the PDF has a folder to live in), then the sheet is uploaded
// and attached. `pendingFile` is the PDF chosen on the form, if any; the old sheet is removed once the new one is in.
export async function saveSubstance(form, { pendingFile = null, actorName = "Unknown" } = {}) {
  const base = { ...toRecord(form), updatedAt: serverTimestamp(), updatedBy: actorName };
  let id = form.id;
  if (!id) {
    // the record needs a sheet to be valid, but the sheet needs the id: create it with the sheet blank, then attach
    const created = await addDoc(collection(db, COLLECTION), { ...base, sdsUrl: "", sdsPath: "", sdsFileName: "", createdAt: serverTimestamp(), createdBy: actorName });
    id = created.id;
  }
  if (pendingFile) {
    let sheet;
    try {
      sheet = await uploadSds(id, pendingFile);
    } catch (problem) {
      // the record was created but the PDF did not go up: say which record, so a retry updates it instead of adding a second
      const failure = new Error(problem?.message || "The safety data sheet could not be uploaded.");
      failure.savedId = id;
      throw failure;
    }
    await updateDoc(doc(db, COLLECTION, id), { ...base, ...sheet });
    if (form.sdsPath && form.sdsPath !== sheet.sdsPath) await removeSdsFile(form.sdsPath);
  } else {
    await updateDoc(doc(db, COLLECTION, id), base);
  }
  return id;
}

// "I have reviewed this": the next review falls due a year on from today
export async function markReviewed(substance, actor = {}) {
  const today = dateKey(new Date());
  await updateDoc(doc(db, COLLECTION, substance.id), {
    reviewDate: nextReviewFrom(today),
    lastReviewedAt: today,
    lastReviewedByName: actor.name || "Unknown",
    lastReviewedByUid: actor.uid || "",
    updatedAt: serverTimestamp(),
    updatedBy: actor.name || "Unknown",
  });
  return nextReviewFrom(today);
}

// archived products stay on record (the history of what was kept matters) but drop out of every list
export async function setActive(substance, active, actorName = "Unknown") {
  await updateDoc(doc(db, COLLECTION, substance.id), { active: !!active, updatedAt: serverTimestamp(), updatedBy: actorName });
}
