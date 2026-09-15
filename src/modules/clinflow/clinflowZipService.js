const encoder = new TextEncoder();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

async function normaliseEntry(entry) {
  const data = entry.data instanceof Blob
    ? new Uint8Array(await entry.data.arrayBuffer())
    : encoder.encode(typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data, null, 2));
  return { name: String(entry.name).replace(/\\/g, "/"), data, crc: crc32(data) };
}

export async function createZipBlob(entries) {
  const files = await Promise.all(entries.map(normaliseEntry));
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50);
    write16(localView, 4, 20);
    write16(localView, 6, 0x0800);
    write16(localView, 8, 0);
    write32(localView, 14, file.crc);
    write32(localView, 18, file.data.length);
    write32(localView, 22, file.data.length);
    write16(localView, 26, name.length);
    local.set(name, 30);
    localParts.push(local, file.data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50);
    write16(centralView, 4, 20);
    write16(centralView, 6, 20);
    write16(centralView, 8, 0x0800);
    write16(centralView, 10, 0);
    write32(centralView, 16, file.crc);
    write32(centralView, 20, file.data.length);
    write32(centralView, 24, file.data.length);
    write16(centralView, 28, name.length);
    write32(centralView, 42, offset);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + file.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50);
  write16(endView, 8, files.length);
  write16(endView, 10, files.length);
  write32(endView, 12, centralSize);
  write32(endView, 16, offset);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

export function safePackName(value) {
  return String(value || "clinflow-document")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "clinflow-document";
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = globalThis.document.createElement("a");
  link.href = url;
  link.download = fileName;
  globalThis.document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Docman ingests one letter per upload, so each document's entry here is the
// single self-contained PDF (ClinFlow summary with a genuine copy of the
// original letter's pages already appended) — the exact file to drag into
// Docman, not a folder of several files. The untouched original and the
// governance manifest stay available separately (Original PDF download,
// local device cache) rather than being bundled into what gets uploaded.
export async function createDocmanPackZip(packs) {
  const entries = packs.map((pack) => ({
    name: safePackName(`${pack.title}-${pack.documentId}`) + ".pdf",
    data: pack.summaryBlob,
  }));
  return createZipBlob(entries);
}
