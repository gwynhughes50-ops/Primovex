import qrcode from "qrcode-generator";

// QR codes are generated on the device. This used to be a request to a public
// third-party image API, which meant every asset ID in a label — plus the
// practice's IP address — was sent off-site each time one was shown or printed.
qrcode.stringToBytes = (text) => Array.from(new TextEncoder().encode(text));

const QUIET_ZONE_MODULES = 4;

// Returns a base64 SVG data URL: safe to drop straight into an <img src>
// (in-app or inside a document.write'd print window) without further
// escaping, and crisp at any print size. `size` is the intrinsic pixel size;
// CSS on the <img> still controls the displayed size.
export function getQrImageUrl(payload, size = 220) {
  const qr = qrcode(0, "M");
  qr.addData(String(payload ?? ""));
  qr.make();

  const count = qr.getModuleCount();
  const total = count + QUIET_ZONE_MODULES * 2;
  let path = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE_MODULES} ${row + QUIET_ZONE_MODULES}h1v1h-1z`;
    }
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}
