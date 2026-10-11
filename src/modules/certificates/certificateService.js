import { useEffect, useState } from "react";
import { addDoc, arrayUnion, collection, deleteField, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { demoCertificates } from "@/data/demoCompliance";
import { normaliseCertificate, renewal, toRecord } from "./certificates";

const COLLECTION = "compliance_certificates";
export const MAX_CERT_BYTES = 15 * 1024 * 1024;

// Every certificate on the register. `list` is null until the first answer arrives; demo and training mode show samples.
export function useCertificates(enabled = true) {
  const [state, setState] = useState({ list: null, error: "" });
  useEffect(() => {
    if (!enabled) { setState({ list: null, error: "" }); return undefined; }
    if (isSafeSyntheticMode()) { setState({ list: demoCertificates().map((c) => normaliseCertificate(c.id, c)), error: "" }); return undefined; }
    return onSnapshot(
      collection(db, COLLECTION),
      (snap) => setState({ list: snap.docs.map((d) => normaliseCertificate(d.id, d.data())), error: "" }),
      (error) => setState({ list: [], error: error?.code === "permission-denied" ? "Your role can't open the certificates register." : "Could not load the certificates register." }),
    );
  }, [enabled]);
  return state;
}

export function pdfProblem(file) {
  if (!file) return "Choose the certificate file.";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
  if (!isPdf) return "The certificate must be a PDF file.";
  if (file.size > MAX_CERT_BYTES) return "That PDF is over 15 MB. Ask the contractor for a smaller copy.";
  if (!file.size) return "That file is empty.";
  return "";
}

const safeName = (name) => String(name || "certificate.pdf").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "certificate.pdf";

// uploads the PDF and returns where it is
export async function uploadCertificate(certId, file) {
  const problem = pdfProblem(file);
  if (problem) throw new Error(problem);
  const path = `compliance_certs/${certId}/${Date.now()}_${safeName(file.name)}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: "application/pdf" });
  return { certUrl: await getDownloadURL(fileRef), certPath: path, certFileName: file.name || "certificate.pdf" };
}

const who = (actor = {}) => actor.displayName || actor.name || actor.email || "Unknown";

// Saves a certificate. A new one is created first (the PDF needs a folder to live in), then the PDF is uploaded and attached.
// If the upload fails the record exists, and the error says which, so a retry updates it instead of adding a second.
export async function saveCertificate(form, { pendingFile = null, actor = {} } = {}) {
  const base = { ...toRecord(form), updatedAt: serverTimestamp(), updatedByName: who(actor) };
  let id = form.id;
  if (!id) {
    const created = await addDoc(collection(db, COLLECTION), { ...base, certUrl: "", certPath: "", certFileName: "", previous: [], createdAt: serverTimestamp(), createdByName: who(actor) });
    id = created.id;
  }
  if (pendingFile) {
    let sheet;
    try { sheet = await uploadCertificate(id, pendingFile); } catch (problem) { const failure = new Error(problem?.message || "The certificate could not be uploaded."); failure.savedId = id; throw failure; }
    await updateDoc(doc(db, COLLECTION, id), { ...base, ...sheet });
    if (form.certPath && form.certPath !== sheet.certPath) { try { await deleteObject(ref(storage, form.certPath)); } catch (error) { console.warn("Old certificate file could not be removed.", error); } }
  } else {
    await updateDoc(doc(db, COLLECTION, id), base);
  }
  return id;
}

// Record a renewal: the new dates and PDF replace the old, and the old one is kept in the history (its file is kept too).
export async function renewCertificate(cert, { completedOn, expiryDate, provider, reference, file, actor = {} }) {
  const sheet = file ? await uploadCertificate(cert.id, file) : { certUrl: "", certPath: "", certFileName: "" };
  const { patch, previousEntry } = renewal(cert, { completedOn, expiryDate, provider, reference, ...sheet }, actor);
  await updateDoc(doc(db, COLLECTION, cert.id), { ...patch, previous: arrayUnion(previousEntry), lastRenewedAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedByName: who(actor) });
}

export const retireCertificate = (cert, reason, actor) => updateDoc(doc(db, COLLECTION, cert.id), { active: false, retiredReason: String(reason || "").slice(0, 120), retiredAt: serverTimestamp(), retiredByName: who(actor), updatedAt: serverTimestamp() });
export const restoreCertificate = (cert, actor) => updateDoc(doc(db, COLLECTION, cert.id), { active: true, retiredReason: "", retiredAt: deleteField(), restoredByName: who(actor), updatedAt: serverTimestamp() });
