import { PRIMOVEX_APP_ORIGIN } from "@/modules/sense/services/nfcService";
import { buildComplianceLink } from "./complianceRules";

// The link a label's QR code or an NFC tag holds for an asset, at this app's own address. Kept apart from the rules so
// those stay free of anything that needs the browser's environment.
export const complianceLink = (asset, method = "") => buildComplianceLink(asset, { method, origin: PRIMOVEX_APP_ORIGIN });
