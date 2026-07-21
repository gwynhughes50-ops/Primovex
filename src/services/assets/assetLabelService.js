export function getAssetPrefix(collectionName) {
  if (collectionName === "anaphylaxis_boxes") return "ANX";
  if (collectionName === "emergency_assets") return "EDK";
  return "MTA";
}

export function normaliseAssetId(rawId = "") {
  return String(rawId || "asset")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

export function getMedTrakAssetId(collectionName, rawId) {
  return `${getAssetPrefix(collectionName)}-${normaliseAssetId(rawId)}`;
}

export function buildAssetQrPayload(collectionName, assetId) {
  return JSON.stringify({
    type: "medtrak.asset",
    version: 1,
    collection: collectionName,
    assetId,
    medtrakId: getMedTrakAssetId(collectionName, assetId),
  });
}

export function getQrImageUrl(payload, size = 220) {
  const encoded = encodeURIComponent(payload);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&data=${encoded}`;
}

export function daysUntil(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

export function formatLastChecked(latest) {
  if (!latest?.monthKey) return "No check recorded";
  return latest.monthKey;
}

export function calculateAssetReadiness({ asset, latest, results = {} }) {
  const items = Array.isArray(asset?.items) ? asset.items : [];
  let missing = 0;
  let expired = 0;
  let expiringSoon = 0;
  let ok = 0;

  for (const item of items) {
    const row = results?.[item.id] || {};
    const status = String(row.status || "OK").toLowerCase();
    const expiryDays = daysUntil(row.expiry || item.defaultExpiry);

    if (status === "missing") missing += 1;
    else if (status === "expired") expired += 1;
    else if (expiryDays !== null && expiryDays < 0) expired += 1;
    else if (expiryDays !== null && expiryDays <= 30) expiringSoon += 1;
    else ok += 1;
  }

  const lastCheckAgeDays = latest?.createdAt?.toDate
    ? Math.floor((Date.now() - latest.createdAt.toDate().getTime()) / 86400000)
    : null;

  const checkOverdue = lastCheckAgeDays !== null ? lastCheckAgeDays > 35 : !latest?.monthKey;
  const score = Math.max(
    0,
    Math.min(
      100,
      100 - missing * 20 - expired * 25 - expiringSoon * 8 - (checkOverdue ? 12 : 0)
    )
  );

  const status = expired > 0 || missing > 0 ? "critical" : expiringSoon > 0 || checkOverdue ? "action" : "ready";

  return {
    score,
    status,
    itemCount: items.length,
    ok,
    missing,
    expired,
    expiringSoon,
    checkOverdue,
    lastCheckAgeDays,
  };
}

export function openAssetLabelPrintWindow({ asset, collectionName, title = "Clinical Asset" }) {
  if (!asset?.id) return;
  const medtrakId = getMedTrakAssetId(collectionName, asset.id);
  const payload = buildAssetQrPayload(collectionName, asset.id);
  const qrUrl = getQrImageUrl(payload, 260);
  const esc = (v) =>
    String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>MedTrak Asset Label - ${esc(medtrakId)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: Arial, sans-serif; color: #0f172a; background: #fff; }
  .sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
  .label { border: 2px solid #0f766e; border-radius: 18px; padding: 18px; min-height: 285px; page-break-inside: avoid; }
  .brand { display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid #cbd5e1; padding-bottom:10px; margin-bottom:12px; }
  .brand h1 { margin:0; font-size:22px; color:#0f172a; letter-spacing:-0.02em; }
  .pill { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#0f766e; font-weight:700; }
  .body { display:grid; grid-template-columns: 1fr 132px; gap:14px; align-items:center; }
  .name { font-size:18px; font-weight:800; margin:0 0 8px 0; }
  .meta { font-size:12px; line-height:1.65; color:#334155; }
  .asset { margin-top:10px; font-size:18px; font-weight:800; letter-spacing:0.08em; color:#0f766e; }
  img { width:132px; height:132px; object-fit:contain; border:1px solid #cbd5e1; border-radius:12px; padding:4px; }
  .foot { margin-top:12px; padding-top:8px; border-top:1px solid #e2e8f0; font-size:11px; color:#64748b; }
</style>
</head>
<body>
  <div class="sheet">
    <section class="label">
      <div class="brand">
        <h1>MedTrak+</h1>
        <div class="pill">Clinical Asset</div>
      </div>
      <div class="body">
        <div>
          <p class="name">${esc(asset.name || title)}</p>
          <div class="meta">
            <div><strong>Type:</strong> ${esc(title)}</div>
            <div><strong>Location:</strong> ${esc(asset.location || "Unassigned")}</div>
            <div><strong>Site:</strong> ${esc(asset.site || "Main site")}</div>
          </div>
          <div class="asset">${esc(medtrakId)}</div>
        </div>
        <img src="${qrUrl}" alt="QR code for ${esc(medtrakId)}" />
      </div>
      <div class="foot">Scan with MedTrak Mobile to open this asset, verify contents, report faults or view history.</div>
    </section>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) return alert("Popup blocked - please allow popups to print labels.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}
