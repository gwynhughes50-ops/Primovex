import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

// Splitting a stack scanned as one file into separate letters at the blank pages between them. The scanner's own software (for the Fujitsu scanners, PaperStream Capture's
// blank page or separator sheet settings) is the better place to do this; this is the fallback. It is deliberately cautious: a page counts as blank only if it has no text
// text in it (typed, or the invisible text layer of a searchable scan) and its picture is tiny beside the other pages', so a page with just a signature is kept. A blank page is left out of the letters it separates, but the original file
// is never changed or deleted (it is moved to the "done" folder as it came). Returns null when there is nothing to split.

const BLANK_SHARE = 0.05; // a blank page's picture is at most 5% the size of the typical page's
const BLANK_MAX_BYTES = 8000; // and no more than 8 KB
const TYPICAL_MIN_BYTES = 20000; // below this the typical page is too small to tell blank from not

const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };

// Does the page's drawing instructions contain any text (a "BT" begin-text command)? If they cannot be read, assume yes: a page is never called blank on a guess.
function hasText(page, context) {
  try {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((ref) => context.lookup(ref)) : contents ? [contents] : [];
    return streams.some((stream) => {
      const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
      return /\bBT\b/.test(new TextDecoder("latin1").decode(bytes));
    });
  } catch {
    return true;
  }
}

// What each page holds: the bytes of its pictures, and whether it has any text (typed, or the invisible text layer of a searchable scan)
export function pageContents(pdf) {
  const context = pdf.context;
  return pdf.getPages().map((page) => {
    const resources = page.node.Resources();
    let imageBytes = 0;
    if (resources) {
      const xobjects = resources.lookup(PDFName.of("XObject"));
      if (xobjects instanceof PDFDict) {
        for (const [, ref] of xobjects.entries()) {
          const object = context.lookup(ref);
          if (object?.dict?.get(PDFName.of("Subtype")) === PDFName.of("Image")) imageBytes += object.contents?.length || 0;
        }
      }
    }
    return { imageBytes, hasText: hasText(page, context) };
  });
}

export function blankPages(contents) {
  const typical = median(contents.filter((c) => c.imageBytes > 0).map((c) => c.imageBytes));
  return contents.map((c) => !c.hasText && (c.imageBytes === 0 || (typical >= TYPICAL_MIN_BYTES && c.imageBytes <= BLANK_MAX_BYTES && c.imageBytes <= typical * BLANK_SHARE)));
}

// Runs of pages between blank ones: [[0,1],[3,4,5]]. Leading, trailing and repeated blanks make no empty letters.
export function segmentsOf(blank) {
  const segments = [];
  let current = [];
  blank.forEach((isBlank, index) => {
    if (isBlank) { if (current.length) segments.push(current); current = []; } else current.push(index);
  });
  if (current.length) segments.push(current);
  return segments;
}

export async function splitAtBlankPages(bytes, { maxLetters = 25 } = {}) {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const blank = blankPages(pageContents(source));
  const segments = segmentsOf(blank);
  if (segments.length < 2 || segments.length > maxLetters) return null;
  const parts = [];
  for (const pages of segments) {
    const out = await PDFDocument.create();
    (await out.copyPages(source, pages)).forEach((page) => out.addPage(page));
    parts.push({ bytes: await out.save(), pages });
  }
  return { parts, blankPages: blank.filter(Boolean).length, pageCount: blank.length };
}
