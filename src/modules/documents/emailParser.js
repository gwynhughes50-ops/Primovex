// Reading a saved email (.eml) so that a certificate sent as an attachment can be dropped into Primovex as the email itself: the attachment is the document, and if there is none the email's own text is.
// Pure (no screens), and it works on the file's bytes, because an attachment is binary. It reads the common shapes (multipart mixed, related and alternative, nested; base64 and quoted-printable;
// encoded-word headers); anything it cannot make sense of gives no attachment and no text, and the caller says so.
// An Outlook .msg file is a different, closed format and is not read here: the person is told to drag the attachment out of the email instead.

const latin1 = (bytes) => { let out = ""; for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192)); return out; };
const toBytes = (text) => Uint8Array.from(text, (ch) => ch.charCodeAt(0) & 0xff);

function decodeText(bytes, charset) {
  try { return new TextDecoder(String(charset || "utf-8").toLowerCase().replace(/^"|"$/g, "")).decode(bytes); } catch { return latin1(bytes); }
}

function decodeBase64(text) {
  try { return toBytes(atob(text.replace(/[^A-Za-z0-9+/=]/g, ""))); } catch { return new Uint8Array(0); }
}

function decodeQuotedPrintable(text) {
  const joined = text.replace(/=\r?\n/g, "");
  const out = [];
  for (let i = 0; i < joined.length; i += 1) {
    if (joined[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(joined.slice(i + 1, i + 3))) { out.push(parseInt(joined.slice(i + 1, i + 3), 16)); i += 2; } else out.push(joined.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(out);
}

// "=?utf-8?B?...?=" and "=?iso-8859-1?Q?...?=" in a header
export function decodeWords(value) {
  return String(value || "").replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset, how, body) => {
    const bytes = how.toLowerCase() === "b" ? decodeBase64(body) : decodeQuotedPrintable(body.replace(/_/g, " "));
    return decodeText(bytes, charset);
  }).replace(/\?=\s+=\?/g, "");
}

function splitHeaders(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  const head = m ? raw.slice(0, m.index) : raw;
  const body = m ? raw.slice(m.index + m[0].length) : "";
  const headers = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) { const key = line.slice(0, i).trim().toLowerCase(); if (!(key in headers)) headers[key] = line.slice(i + 1).trim(); }
  }
  return { headers, body };
}

// a header parameter, e.g. boundary or filename or charset, from "multipart/mixed; boundary=abc"
function param(value, name) {
  const star = new RegExp(`${name}\\*=(?:[^']*)'[^']*'([^;]*)`, "i").exec(value || "");
  if (star) { try { return decodeURIComponent(star[1]); } catch { return star[1]; } }
  const m = new RegExp(`${name}=(?:"([^"]*)"|([^;\\s]*))`, "i").exec(value || "");
  return m ? decodeWords(m[1] ?? m[2] ?? "") : "";
}

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", pound: "£", euro: "EUR", ndash: "-", mdash: "-", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "..." };

export function htmlToText(html) {
  return String(html || "")
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, name) => {
      if (name[0] === "#") { const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10); return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""; }
      return ENTITIES[name.toLowerCase()] ?? "";
    })
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function walk(headers, body, out, depth = 0) {
  if (depth > 8) return;
  const type = (headers["content-type"] || "text/plain").split(";")[0].trim().toLowerCase();
  if (type.startsWith("multipart/")) {
    const boundary = param(headers["content-type"], "boundary");
    if (!boundary) return;
    for (const piece of body.split(`--${boundary}`).slice(1)) {
      if (piece.startsWith("--")) break;
      const { headers: h, body: b } = splitHeaders(piece.replace(/^\r?\n/, ""));
      walk(h, b, out, depth + 1);
    }
    return;
  }
  const how = (headers["content-transfer-encoding"] || "7bit").trim().toLowerCase();
  const bytes = how === "base64" ? decodeBase64(body) : how === "quoted-printable" ? decodeQuotedPrintable(body) : toBytes(body);
  const disposition = headers["content-disposition"] || "";
  const name = param(disposition, "filename") || param(headers["content-type"], "name");
  if ((type === "text/plain" || type === "text/html") && !/^attachment/i.test(disposition) && !name) {
    const text = decodeText(bytes, param(headers["content-type"], "charset") || "utf-8");
    out[type === "text/plain" ? "plain" : "html"].push(text);
    return;
  }
  if (bytes.length) out.attachments.push({ name: name || "attachment", type, bytes });
}

// -> { headers: { from, to, subject, date }, text, attachments: [{ name, type, bytes }] }
export function parseEml(input) {
  const raw = typeof input === "string" ? input : latin1(input);
  const { headers, body } = splitHeaders(raw);
  const out = { plain: [], html: [], attachments: [] };
  walk(headers, body, out);
  const shown = { from: decodeWords(headers.from), to: decodeWords(headers.to), subject: decodeWords(headers.subject), date: headers.date || "" };
  const bodyText = (out.plain.join("\n\n").trim() || htmlToText(out.html.join("\n\n"))).trim();
  const lines = [`From: ${shown.from}`, `To: ${shown.to}`, `Subject: ${shown.subject}`, `Date: ${shown.date}`].filter((l) => !/: $/.test(l));
  return { headers: shown, text: bodyText ? `${lines.join("\n")}\n\n${bodyText}` : "", attachments: out.attachments };
}

const EXT = /\.(pdf|docx|xlsx|pptx|jpe?g|png|bmp|tiff?|heic|heif|webp|gif)$/i;
const RANK = (a) => (/\.pdf$/i.test(a.name) || a.type === "application/pdf" ? 0 : /\.(docx|xlsx|pptx)$/i.test(a.name) ? 1 : 2);
const MIN_PICTURE_BYTES = 20 * 1024; // a logo or a signature picture is smaller than a scanned page

// the attachment that is most likely the document: a PDF first, then a Word, Excel or PowerPoint file, then the largest photo; small pictures (logos) are ignored
export function pickAttachment(attachments = []) {
  const usable = attachments.filter((a) => (EXT.test(a.name) || /^(application\/pdf|image\/)/.test(a.type)) && (RANK(a) < 2 || a.bytes.length >= MIN_PICTURE_BYTES));
  return [...usable].sort((a, b) => RANK(a) - RANK(b) || b.bytes.length - a.bytes.length)[0] || null;
}
