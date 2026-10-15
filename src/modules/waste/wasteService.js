import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoWaste } from "@/data/demoWaste";
import { consignmentId } from "./consignmentParse";
import { normaliseConsignment } from "./waste";

export const COLLECTION = "waste_consignments";
export const MAX_NOTE_BYTES = 15 * 1024 * 1024;

// Every consignment note on record. `list` is null until the first answer arrives; demo and training mode show samples.
export function useWasteNotes(enabled = true) {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled) { setState({ list: null, error: "" }); return undefined; }
    if (isSafeSyntheticMode()) { setState({ list: demoWaste().map((c) => normaliseConsignment(c.id, c)), error: "" }); return undefined; }
    return onSnapshot(
      collection(db, COLLECTION),
      (snap) => setState({ list: snap.docs.map((d) => normaliseConsignment(d.id, d.data())), error: "" }),
      (error) => setState({ list: [], error: error?.code === "permission-denied" ? "Your role can't open the clinical waste records." : "Could not load the clinical waste records." }),
    );
  }, [enabled]);
  return state;
}

export function pdfProblem(file) {
  if (!file) return "Choose the consignment note PDF.";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return "That is not a PDF file.";
  if (file.size > MAX_NOTE_BYTES) return "That PDF is over 15 MB.";
  if (!file.size) return "That file is empty.";
  return "";
}

const safeName = (name) => String(name || "consignment-note.pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "consignment-note.pdf";
const who = (actor = {}) => actor.displayName || actor.name || actor.email || "Unknown";
const num = (value) => (value === "" || value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value));
const text = (value, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// what is stored for a note: only the fields it should have, with the weights as numbers
export function toRecord(form) {
  const lines = (form.lines || []).map((l) => ({
    wasteCode: text(l.wasteCode, 6), ewc: text(l.ewc, 20), description: text(l.description), kg: num(l.kg), component: text(l.component), concentration: text(l.concentration, 40),
    form: text(l.form, 40), hazard: text(l.hazard, 40), bags: num(l.bags) ?? 0, sharpsBoxes: num(l.sharpsBoxes) ?? 0, sealedUnits: num(l.sealedUnits) ?? 0, wheeledCarts: num(l.wheeledCarts) ?? 0,
  }));
  return {
    consignmentCode: text(form.consignmentCode, 40).toUpperCase(), documentRef: text(form.documentRef, 40), customerSite: text(form.customerSite, 40), premisesCode: text(form.premisesCode, 40),
    collectionDate: text(form.collectionDate, 10), collectionTime: text(form.collectionTime, 5), producer: text(form.producer), carrier: text(form.carrier), destination: text(form.destination, 300),
    lines, totalKg: Math.round(lines.reduce((sum, l) => sum + (l.kg || 0), 0) * 1000) / 1000, notes: text(form.notes, 500),
  };
}

// what is wrong with a form, in words ("" when it is fine)
export function formProblem(form) {
  if (!text(form.consignmentCode)) return "Enter the consignment note code (top of the note).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.collectionDate || "")) return "Enter the date the waste was collected.";
  if (!(form.lines || []).length) return "Add at least one waste line (what was collected, and how much).";
  if ((form.lines || []).some((l) => num(l.kg) === null || num(l.kg) < 0)) return "Every waste line needs its weight in kg.";
  return "";
}

// Adds a note: the PDF is uploaded first, then the record is written under an id made from the consignment code, so the same note
// can't be added twice. If the record fails after the upload the error says so and a retry writes the same record.
export async function addConsignment(form, file, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const problem = formProblem(form) || pdfProblem(file);
  if (problem) throw new Error(problem);
  const record = toRecord(form);
  const id = consignmentId(record.consignmentCode);
  const path = `waste_notes/${id}/${Date.now()}_${safeName(file.name)}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: "application/pdf" });
  const fileUrl = await getDownloadURL(fileRef);
  await setDoc(doc(db, COLLECTION, id), {
    ...record, fileName: file.name || "consignment-note.pdf", filePath: path, fileUrl, fileSize: file.size, voided: false, voidReason: "",
    addedByName: who(actor), addedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedByName: who(actor),
  });
  return id;
}

// Corrects a note's details (the PDF and the code stay as they were)
export async function updateConsignment(id, form, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  const problem = formProblem(form);
  if (problem) throw new Error(problem);
  const { consignmentCode: _keep, ...rest } = toRecord(form);
  await updateDoc(doc(db, COLLECTION, id), { ...rest, updatedAt: serverTimestamp(), updatedByName: who(actor) });
}

// A note entered by mistake is marked, not deleted
export async function setVoided(id, voided, reason, actor = {}) {
  if (isSafeSyntheticMode()) throw new Error("Demo mode can't save changes.");
  await updateDoc(doc(db, COLLECTION, id), { voided: Boolean(voided), voidReason: voided ? text(reason, 120) : "", updatedAt: serverTimestamp(), updatedByName: who(actor) });
}
