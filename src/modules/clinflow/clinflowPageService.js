function numberedPage(page, fallbackNumber) {
  return {
    pageNumber: Number(page?.pageNumber) || fallbackNumber,
    content: String(page?.content || "").trim(),
    lineCount: Number(page?.lineCount) || 0,
    reconstructed: Boolean(page?.reconstructed),
    truncated: Boolean(page?.truncated),
  };
}

function splitCombinedText(content, pageCount) {
  const text = String(content || "").trim();
  if (!text) return [];
  const explicitPages = text
    .split(/\f|(?:^|\n)\s*(?:-{2,}\s*)?page\s+\d+(?:\s*-{2,})?\s*(?:\n|$)/i)
    .map((page) => page.trim())
    .filter(Boolean);
  if (explicitPages.length === pageCount) return explicitPages;

  const lines = text.split(/\r?\n/);
  return Array.from({ length: pageCount }, (_, index) => {
    const start = Math.floor((index * lines.length) / pageCount);
    const end = Math.floor(((index + 1) * lines.length) / pageCount);
    return lines.slice(start, end).join("\n").trim();
  });
}

export function normaliseClinFlowPages(ocr = {}) {
  const exactPages = Array.isArray(ocr.pages)
    ? ocr.pages.map((page, index) => numberedPage(page, index + 1)).filter((page) => page.content)
    : [];
  if (exactPages.length) return { pages: exactPages, reconstructed: false };

  const requestedCount = Math.max(1, Number(ocr.pageCount) || 1);
  const splitPages = splitCombinedText(ocr.content, requestedCount);
  if (!splitPages.length) {
    return { pages: [numberedPage({ content: "Azure returned no readable text." }, 1)], reconstructed: false };
  }
  return {
    pages: splitPages.map((content, index) => numberedPage({ content, reconstructed: requestedCount > 1 }, index + 1)),
    reconstructed: requestedCount > 1,
  };
}
