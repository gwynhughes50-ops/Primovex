import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { MAX_FILE_BYTES, imageToPdf, intakeOptions } from "./documentIntake";
import { htmlToText, parseEml, pickAttachment } from "./emailParser";
import { textToPdf } from "./textPdf";

// Reading a dropped document. Whatever is dropped, the REGISTER keeps a PDF (the registers and the desktop viewer only hold PDFs), and the server reads whatever Azure can read.
//   PDF                         read and kept as it is
//   photo (jpg, png, webp, gif, bmp)   turned into a one-page PDF on this device, which is both read and kept
//   email (.eml)                the PDF or photo attached to it is the document; with none, the email's text is made into a PDF
//   text, csv, web page         made into a PDF of its text
//   Word, Excel, PowerPoint     read by the server; the record is a labelled TEXT COPY made from what was read (use Replace PDF to attach the real PDF)
//   TIFF, HEIC (and BMP/other pictures this device cannot open)   the same: read by the server, text copy as the record
//   anything else (old .doc, .xls, .rtf, .msg, zip, programs)     refused, with what to do instead
// Demo and Training mode never contact the server: they answer with a made-up sample.

const extOf = (file) => (String(file?.name || "").toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || "";
const GROUPS = {
  pdf: ["pdf"],
  image: ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif", "avif"],
  office: ["docx", "xlsx", "pptx"],
  email: ["eml"],
  text: ["txt", "csv", "tsv", "md", "log"],
  html: ["html", "htm"],
};
const INSTEAD = {
  doc: "a Word 97-2003 file (.doc)", xls: "an Excel 97-2003 file (.xls)", ppt: "a PowerPoint 97-2003 file (.ppt)", rtf: "a Rich Text file (.rtf)", odt: "an OpenDocument file", ods: "an OpenDocument file", odp: "an OpenDocument file",
  pages: "an Apple Pages file", numbers: "an Apple Numbers file", key: "an Apple Keynote file",
};

export const ACCEPT = ".pdf,.docx,.xlsx,.pptx,.eml,.txt,.csv,.html,.htm,.tif,.tiff,.heic,.heif,.bmp,.webp,.gif,image/*";
export const DROP_HINT = "A PDF, a photo, a Word, Excel or PowerPoint file, an email (.eml), or a text or web-page file, under 10 MB.";

// "pdf" | "image" | "office" | "email" | "text" | "html", or "" if it is none of those (decided by the name first, then the type the browser gave)
export function classify(file) {
  const ext = extOf(file);
  for (const [group, list] of Object.entries(GROUPS)) if (list.includes(ext)) return group;
  const type = String(file?.type || "").toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type.startsWith("image/")) return "image";
  if (type === "message/rfc822") return "email";
  if (type === "text/html") return "html";
  if (type.startsWith("text/")) return "text";
  if (/officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)$/.test(type)) return "office";
  return "";
}

// the problem with a chosen file, in words, or "" when it can be used
export function fileProblem(file) {
  if (!file) return "Choose a file.";
  if (!file.size) return "That file is empty.";
  if (file.size > MAX_FILE_BYTES * 2) return "That file is too big. Use one under 10 MB.";
  if (classify(file)) return "";
  const ext = extOf(file);
  if (ext === "msg") return "That is an Outlook message file, which Primovex cannot open. Drag the attachment itself out of the email and drop that, or save the email as an .eml file.";
  if (INSTEAD[ext]) return `Primovex cannot read ${INSTEAD[ext]} directly. Open it, choose Save as, pick PDF (or a Word .docx file), and drop that.`;
  return `Primovex cannot read ${ext ? `.${ext} files` : "that kind of file"}. Use a PDF, a photo, a Word, Excel or PowerPoint file, an email (.eml), or a text file.`;
}

// a name for the PDF kept in the register: the file's own name, unless it is a long camera name (JPEG_20261106_143900_4459904644...), which becomes "Photo 2026-11-06 14-39"
export function friendlyName(file, now = new Date()) {
  const own = String(file?.name || "document").replace(/\.[^.]+$/, "") || "document";
  if (own.length <= 36) return own;
  if (!/\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif)$/i.test(String(file?.name || ""))) return own.slice(0, 36).trim(); // a long document name is only shortened
  const p = (n) => String(n).padStart(2, "0");
  return `Photo ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}-${p(now.getMinutes())}`;
}
const baseName = (file) => friendlyName(file);
const pdfFile = (bytes, name) => new File([bytes], `${name}.pdf`, { type: "application/pdf" });

async function photoToPdf(file) {
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
  const bytes = imageToPdf(new Uint8Array(await blob.arrayBuffer()), width, height);
  if (bytes.length > MAX_FILE_BYTES) throw new Error("That photo is too big. Take it again a little further away.");
  return pdfFile(bytes, baseName(file));
}

const TEXT_REASON = "This is a text copy of the document, not the original file.";

// What to send to be read and what to keep as the record. { send, record, how, note }; `record` is null when it can only be made after reading (from the text that was read).
export async function prepareFile(file, { inEmail = false } = {}) {
  const problem = fileProblem(file);
  if (problem) throw new Error(problem);
  const kind = classify(file);

  if (kind === "pdf") {
    if (file.size > MAX_FILE_BYTES) throw new Error("That PDF is over 10 MB. Ask for a smaller copy.");
    return { send: file, record: file, how: "pdf", note: "" };
  }

  if (kind === "image") {
    try {
      const pdf = await photoToPdf(file);
      return { send: pdf, record: pdf, how: "photo", note: "" };
    } catch (problemFound) {
      // a picture this device cannot open (TIFF, and HEIC outside Apple devices) is sent as it is; the server can read it
      if (/^(tiff?|heic|heif|bmp)$/.test(extOf(file)) && file.size <= MAX_FILE_BYTES) {
        return { send: file, record: null, how: "picture", note: "This picture could not be turned into a PDF on this device, so it was read as it is. The record will be a text copy: use Replace PDF to attach a PDF of the picture." };
      }
      throw new Error(problemFound?.message || "That picture could not be opened. Try saving it as a JPEG or PDF.");
    }
  }

  if (kind === "office") {
    if (file.size > MAX_FILE_BYTES) throw new Error("That file is over 10 MB.");
    return { send: file, record: null, how: "office", note: "Word, Excel and PowerPoint files cannot be kept in the register, which holds PDFs. The record will be a text copy of what was read: use Replace PDF to attach the real PDF." };
  }

  if (kind === "email" && !inEmail) {
    const mail = parseEml(new Uint8Array(await file.arrayBuffer()));
    const chosen = pickAttachment(mail.attachments);
    if (chosen) {
      const inner = new File([chosen.bytes], chosen.name, { type: chosen.type });
      const prepared = await prepareFile(inner, { inEmail: true });
      return { ...prepared, how: "email-attachment", note: `Using the attachment "${chosen.name}" from the email${mail.headers.subject ? ` "${mail.headers.subject}"` : ""}.` };
    }
    if (mail.text) {
      const pdf = pdfFile(textToPdf(mail.text, { title: "Email", source: file.name, reason: "This is a PDF of the email's text. It had no PDF or photo attached." }), baseName(file));
      return { send: pdf, record: pdf, how: "email-text", note: "The email had no PDF or photo attached, so its text was read." };
    }
    throw new Error("That email has no attachment and no text Primovex can read. Drag the attachment itself out of the email and drop that.");
  }
  if (kind === "email") throw new Error("That attachment is itself an email. Open it and save its attachment.");

  // text and web pages: the text becomes a PDF
  const raw = await file.text();
  const text = kind === "html" ? htmlToText(raw) : raw;
  if (!text.trim()) throw new Error("There is no text in that file.");
  if (text.length > 200000) throw new Error("That text file is too long. Use the part that holds the certificate.");
  const pdf = pdfFile(textToPdf(text, { title: kind === "html" ? "Web page" : "Text file", source: file.name, reason: TEXT_REASON }), baseName(file));
  return { send: pdf, record: pdf, how: kind, note: "" };
}

// the record, once the read is done: the one already made, or (for a Word, Excel or picture the browser cannot turn into a PDF) a labelled text copy of what the server read
export function recordAfterReading(prepared, result, original) {
  if (prepared.record) return prepared.record;
  const text = String(result?.textCopy || "").trim();
  if (!text) throw new Error("That document was read, but no copy of it could be made to keep. Save it as a PDF and drop that.");
  return pdfFile(
    textToPdf(text, { title: "Text copy of a document", source: original?.name || "", reason: "The original file could not be kept here (the register holds PDFs), so this is the text Primovex read from it. Keep the original file too." }),
    `${baseName(original)}-text-copy`,
  );
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
// (a file name containing "unsafe" or "fail" gives a certificate that records a failed result, to show how that looks)
export function sampleResult(kind = "auto", fileName = "") {
  const textCopy = "SAMPLE TEXT\nThis is made-up text standing in for what would be read from the document.";
  if (kind === "coshh") {
    return {
      ok: true, sample: true, kind: "coshh", kindGuess: "coshh", fileName: "Sample safety data sheet.pdf", warnings: [], textCopy,
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
    ok: true, sample: true, kind: "certificate", kindGuess: "certificate", fileName: "Sample gas safety record.pdf", textCopy,
    fields: {
      type: { value: "gas_safety", evidence: "GAS SAFETY RECORD", verified: true },
      provider: { value: "Sample Gas Services Ltd", evidence: "Carried out by: Sample Gas Services Ltd", verified: true },
      reference: { value: "GSR-00001", evidence: "Certificate number: GSR-00001", verified: true },
      completedOn: { value: "2026-10-14", evidence: "Date of inspection: 14/10/2026", verified: true },
      expiryDate: { value: null, evidence: null, verified: false },
      premises: { value: "Main Surgery", evidence: "Premises: Main Surgery", verified: true },
      engineer: { value: "A. Sample", evidence: "Engineer: A. Sample", verified: true },
      findings: /unsafe|fail/i.test(fileName)
        ? [
          { label: "Gas supply tightness test", answer: "Fail", problem: true, evidence: "Gas supply tightness test: Fail", verified: true },
          { label: "Boiler: safe to use", answer: "No", problem: true, evidence: "Boiler: safe to use: No", verified: true },
          { label: "Carbon monoxide alarm fitted", answer: "Yes", problem: false, evidence: "Carbon monoxide alarm fitted: Yes", verified: true },
        ]
        : [
          { label: "Gas supply tightness test", answer: "Pass", problem: false, evidence: "Gas supply tightness test: Pass", verified: true },
          { label: "Boiler: safe to use", answer: "Yes", problem: false, evidence: "Boiler: safe to use: Yes", verified: true },
        ],
    },
    warnings: /unsafe|fail/i.test(fileName) ? ["This document records a failed or unsafe result: Gas supply tightness test: Fail; Boiler: safe to use: No. Do not treat it as a pass."] : [],
  };
}

// Reads a document. `file` is what prepareFile chose to send. `kind` is "auto" (let the AI say what it is), "certificate" or "coshh". Throws a plain sentence on failure.
export async function readDocument(file, kind = "auto") {
  if (isSafeSyntheticMode()) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return sampleResult(kind, file?.name);
  }
  const base64 = await toBase64(file);
  const response = await httpsCallable(functions, "readDocumentForRegister", { timeout: 160000 })({
    base64, mimeType: file.type || "application/octet-stream", fileName: file.name, kind, options: intakeOptions(),
  });
  return response.data;
}
