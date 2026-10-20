import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import MobileCompliance from "./MobileCompliance";

// Where a compliance tag's own address lands (a fire point, water outlet or other asset whose QR label or NFC tag was
// read by the phone's camera or by an NFC tap, with Primovex not yet open): straight into that asset's check. The tag
// names the asset, so nobody picks it from a list. It opens the same Compliance screen as the app's own scanner, with
// the check already open, so the result, the failed-check list and "what is due" are all there afterwards.
export default function ComplianceLanding({ assetId }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { can } = useAuth();
  const method = params.get("m") === "nfc" ? "nfc" : "qr";
  // one object for the life of the page, so the check opens once
  const scan = useMemo(() => ({ value: `MEDTRAK:COMPLIANCE:${assetId}`, method }), [assetId, method]);
  const home = () => navigate("/", { replace: true });

  if (!can("compliance.recordChecks")) {
    return (
      <main className="pvx-mobile-page pvx-mobile-stack">
        <section className="pvx-mobile-card text-center">
          <p className="font-bold">You can't record this check</p>
          <p className="mt-1 text-sm text-[var(--medtrak-muted)]">Fire and water checks are done by the caretaker and the staff who cover for them. Ask the Practice Manager if you should be able to.</p>
          <button type="button" onClick={home} className="mt-4 min-h-12 rounded-2xl bg-[var(--medtrak-accent)] px-5 font-bold text-white">Back home</button>
        </section>
      </main>
    );
  }
  return <MobileCompliance pendingNfcScan={scan} onConsumeNfcScan={() => {}} />;
}
