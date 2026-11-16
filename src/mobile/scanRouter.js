import { parseComplianceQrPayload } from "@/services/compliance/complianceRules";
import { parseAssetQrPayload } from "@/services/assets/assetLabelService";
import { parseLaptopLink } from "@/modules/laptops/laptops";
import { parseComputerLink } from "@/modules/computers/computers";
import { parsePatLink } from "@/modules/pat/pat";

// "Scan anything" on the phone: one camera button for every kind of code Primovex has made. This works out which kind a code is, so the right screen opens; it opens nothing itself (pure, so it
// can be tested). The kinds:
//   laptop      an IT laptop's label (a /sense/open/laptop/<id> link, or MEDTRAK:LAPTOP:<id>)
//   pc          an IT PC's label (a /sense/open/pc/<id> link, or MEDTRAK:PC:<id>)
//   pat         a PAT appliance's label (a /sense/open/pat/<id> link, or MEDTRAK:PAT:<id>): its details, test history and a Retest button
//   fridge      a fridge's QR code (temperature check)
//   coshh       a chemical cupboard's code (what is kept in it)
//   space       a room's tag or code (a /sense/open/space/<id> link)
//   asset       a Sense asset's link (/sense/open/asset/<id>)
//   kit         an emergency kit or anaphylaxis box label
//   compliance  a fire point, water outlet or other checked asset (link, MEDTRAK:COMPLIANCE:<id>, or a plain code such as FP-007)
//   unknown     anything else: tried as a room code, then as a product barcode
// A link is matched by its path, so it works whatever address it carries (the app's own, or a test site).
const LINK = /^\/sense\/open\/(laptop|pc|pat|fridge|coshh|space|asset)\/([^/]+)\/?$/i;

export function classifyScan(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return { kind: "empty", id: "", raw: value };

  try {
    const url = new URL(value, "https://scan.invalid"); // a link without the address ("/sense/open/fridge/x") works too
    const link = url.pathname.match(LINK);
    if (link) {
      const kind = link[1].toLowerCase();
      const id = decodeURIComponent(link[2]);
      return { kind, id, raw: value, route: kind === "space" || kind === "asset" ? null : `/sense/open/${kind}/${encodeURIComponent(id)}` };
    }
  } catch { /* not a link */ }

  const laptop = parseLaptopLink(value);
  if (laptop) return { kind: "laptop", id: laptop.id, raw: value, route: `/sense/open/laptop/${encodeURIComponent(laptop.id)}` };

  const pc = parseComputerLink(value);
  if (pc) return { kind: "pc", id: pc.id, raw: value, route: `/sense/open/pc/${encodeURIComponent(pc.id)}` };

  const pat = parsePatLink(value);
  if (pat) return { kind: "pat", id: pat.id, raw: value, route: `/sense/open/pat/${encodeURIComponent(pat.id)}` };

  const kit = parseAssetQrPayload(value);
  if (kit) return { kind: "kit", id: kit.assetId, raw: value };

  const compliance = parseComplianceQrPayload(value);
  if (compliance) return { kind: "compliance", id: compliance.assetId, raw: value };

  return { kind: "unknown", id: value, raw: value };
}
