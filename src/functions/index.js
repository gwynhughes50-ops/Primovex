/**
 * Firebase Cloud Function: sendComplianceReport
 * - Callable function
 * - Expects: { siteId, emailTo, from, to, selection, html }
 * - Sends PDF attachment (generated from HTML) via SendGrid
 *
 * ✅ Requirements:
 *   - Firebase Functions (Node 18+)
 *   - SendGrid API key set in functions env vars
 *   - Uses puppeteer-core + @sparticuz/chromium for serverless Chrome
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

const sgMail = require("@sendgrid/mail");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

function requireString(val, field) {
  const s = typeof val === "string" ? val.trim() : "";
  if (!s) throw new HttpsError("invalid-argument", `Missing/invalid ${field}`);
  return s;
}

function safeFilename(s) {
  return String(s || "")
    .trim()
    .replace(/[^\w\-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

async function htmlToPdfBuffer(html) {
  const executablePath = await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath,
    headless: chromium.headless,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function getSendgridApiKey() {
  return process.env.SENDGRID_API_KEY || process.env.SENDGRID_KEY || "";
}

function getFromEmail() {
  // Must be a verified sender in SendGrid
  return process.env.SENDGRID_FROM || "no-reply@example.com";
}

exports.sendComplianceReport = onCall({ region: "europe-west2" }, async (request) => {
  try {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const data = request.data || {};
    const siteId = requireString(data.siteId, "siteId");
    const emailTo = requireString(data.emailTo, "emailTo");
    const from = typeof data.from === "string" ? data.from.trim() : "";
    const to = typeof data.to === "string" ? data.to.trim() : "";
    const html = requireString(data.html, "html");

    const apiKey = getSendgridApiKey();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "SENDGRID_API_KEY is not set. Configure env var in Functions."
      );
    }

    const fromEmail = getFromEmail();
    if (!fromEmail || fromEmail.includes("example.com")) {
      throw new HttpsError(
        "failed-precondition",
        "SENDGRID_FROM is not set (or is still example.com). Set a verified sender email."
      );
    }

    sgMail.setApiKey(apiKey);

    const fileBase = safeFilename(`Aurora_Compliance_${siteId}_${from || "from"}_${to || "to"}`);
    const filename = `${fileBase}.pdf`;

    logger.info("Generating PDF for compliance report", { siteId, from, to, toEmail: emailTo });

    const pdfBuffer = await htmlToPdfBuffer(html);

    const subject = `Compliance report (${siteId})${from || to ? ` ${from || "…"} to ${to || "…"} ` : ""}`;
    const text =
      "Attached is the Aurora compliance report.\n\n" +
      (from || to ? `Date filter: ${from || "…"} to ${to || "…"}\n` : "") +
      `Site: ${siteId}\n`;

    await sgMail.send({
      to: emailTo,
      from: fromEmail,
      subject,
      text,
      attachments: [
        {
          content: pdfBuffer.toString("base64"),
          filename,
          type: "application/pdf",
          disposition: "attachment",
        },
      ],
    });

    logger.info("Compliance report email sent", { to: emailTo, siteId });
    return { ok: true };
  } catch (err) {
    logger.error("sendComplianceReport failed", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", "Failed to send compliance report.");
  }
});
