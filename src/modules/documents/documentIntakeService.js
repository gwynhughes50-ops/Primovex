import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { MAX_FILE_BYTES, imageToPdf, intakeOptions } from "./documentIntake";

// Reading a dropped document: the file is turned into a PDF if it is a photo, sent to the server (readDocumentForRegister), and the checked suggestion comes back.
// Demo and Training mode never contact the server: they answer with a made-up sample so the whole screen can be tried safely.

const isPdf = (file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
const isImage = (file) => /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type || "") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name || "");

// the problem with a chosen file, or "" when it can be used
export function fileProblem(file) {
  if (!file) return "Choose a file.";
  if (!file.size) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES * 2) return "That file is too big. Use a PDF or photo under 10 MB.";
  if (!isPdf(file) && !isImage(file)) return "Drop a PDF or a photo (JPEG or PNG).";
  return "";
}

// A photo becomes a one-page PDF (shrunk to a readable size, turned the right way up) so it can be kept in the register like any other certificate.
// A PDF is used as it is. Returns a File.
export async function toPdfFile(file) {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  if (isPdf(file)) {
    if (file.size > MAX_FILE_BYTES) throw new Error("That PDF is over 10 MB. Ask for a smaller copy.");
    return file;
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const longest = 2200;
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("That photo could not be read. Try another, or take it again.");
  const pdf = imageToPdf(new Uint8Array(await blob.arrayBuffer()), width, height);
  if (pdf.length > MAX_FILE_BYTES) throw new Error("That photo is too big. Take it again a little further away.");
  return new File([pdf], `${String(file.name || "photo").replace(/\.[^.]+$/, "") || "photo"}.pdf`, { type: "application/pdf" });
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

// made-up answers for Demo and Training mode
export function sampleResult(kind = "auto") {
  if (kind === "coshh") {
    return {
      ok: true, sample: true, kind: "coshh", kindGuess: "coshh", fileName: "Sample safety data sheet.pdf", warnings: [],
      fields: {
        productName: { value: "Sample Surface Cleaner", evidence: "Product name: Sample Surface Cleaner", verified: true },
        supplier: { value: "Sample Cleaning Supplies Ltd", evidence: "Supplier: Sample Cleaning Supplies Ltd", verified: true },
        hazards: [{ key: "irritant", evidence: "H319 Causes serious eye irritation", verified: true }, { key: "flammable", evidence: null, verified: false }],
        notHazardous: { value: false, evidence: null, verified: false },
        ppe: [{ key: "gloves", evidence: "Wear protective gloves", verified: true }, { key: "eye-protection", evidence: "eye protection", verified: true }],
        firstAid: [{ key: "eyes", evidence: "In case of eye contact rinse with water", verified: true }],
      },
    };
  }
  return {
    ok: true, sample: true, kind: "certificate", kindGuess: "certificate", fileName: "Sample gas safety record.pdf", warnings: [],
    fields: {
      type: { value: "gas_safety", evidence: "GAS SAFETY RECORD", verified: true },
      provider: { value: "Sample Gas Services Ltd", evidence: "Carried out by: Sample Gas Services Ltd", verified: true },
      reference: { value: "GSR-00001", evidence: "Certificate number: GSR-00001", verified: true },
      completedOn: { value: "2026-10-14", evidence: "Date of inspection: 14/10/2026", verified: true },
      expiryDate: { value: null, evidence: null, verified: false },
      premises: { value: "Main Surgery", evidence: "Premises: Main Surgery", verified: true },
    },
  };
}

// Reads a document. `kind` is "auto" (let the AI say what it is), "certificate" or "coshh". Throws a plain sentence on failure.
export async function readDocument(pdfFile, kind = "auto") {
  if (isSafeSyntheticMode()) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return sampleResult(kind);
  }
  const base64 = await toBase64(pdfFile);
  const response = await httpsCallable(functions, "readDocumentForRegister", { timeout: 160000 })({
    base64, mimeType: "application/pdf", fileName: pdfFile.name, kind, options: intakeOptions(),
  });
  return response.data;
}
