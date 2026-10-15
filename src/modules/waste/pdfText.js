// Reads the text of a PDF on this computer (nothing is uploaded to read it) and returns it as positioned pieces for
// consignmentParse. pdf.js is loaded only when a PDF is dropped, so it costs nothing until then. A scan or a photo has no
// text: the result is then empty and the page asks the person to type the details.

export async function readPdfText(file) {
  const [pdfjs, worker] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages = [];
  try {
    for (let number = 1; number <= Math.min(pdf.numPages, 10); number += 1) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(content.items.filter((i) => typeof i.str === "string" && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] })));
    }
  } finally {
    await pdf.destroy();
  }
  return pages;
}
