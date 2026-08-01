import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

const MAX_FILE_BYTES = 4 * 1024 * 1024;

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return window.btoa(binary);
}

export function validateSyntheticPdf(file) {
  if (!file) throw new Error("Choose one of the Primovex synthetic test PDFs.");
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("ClinFlow accepts PDF files only.");
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    throw new Error("The Azure free-tier test file must be no larger than 4 MB.");
  }
}

export async function getDocumentIntelligenceHealth() {
  const call = httpsCallable(functions, "clinFlowDocumentIntelligenceHealth", { timeout: 30000 });
  const response = await call({});
  return response.data;
}

export async function analyzeSyntheticDocument(file, syntheticAttestation) {
  validateSyntheticPdf(file);
  if (!syntheticAttestation) throw new Error("Confirm that the document contains synthetic test data only.");
  const documentBase64 = arrayBufferToBase64(await file.arrayBuffer());
  const call = httpsCallable(functions, "analyzeSyntheticClinFlowDocument", { timeout: 120000 });
  const response = await call({
    dataMode: "synthetic",
    syntheticAttestation: true,
    fileName: file.name,
    documentBase64,
  });
  return response.data;
}

export { MAX_FILE_BYTES };
