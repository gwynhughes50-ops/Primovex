import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import MobileFridgeCheckSheet from "./MobileFridgeCheckSheet";
import { normaliseUnit, unitAsAsset } from "./fridgeCheck";

// Where a fridge's own NFC tag or QR code lands: straight into that fridge's temperature check. The tag holds
// the fridge's id, so nobody has to pick it from a list (which is how the check proves they were at the fridge).
export default function FridgeCheckLanding({ unitId }) {
  const navigate = useNavigate();
  const { can } = useAuth();
  const [unit, setUnit] = useState(undefined); // undefined while loading, null if there is no such fridge

  useEffect(() => {
    let live = true;
    getDoc(doc(db, "temperature_units", unitId))
      .then((snap) => { if (live) setUnit(snap.exists() ? normaliseUnit(snap.id, snap.data()) : null); })
      .catch(() => { if (live) setUnit(null); });
    return () => { live = false; };
  }, [unitId]);

  const home = () => navigate("/", { replace: true });
  const message = (title, text) => (
    <main className="pvx-mobile-page pvx-mobile-stack">
      <section className="pvx-mobile-card text-center">
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-sm text-[var(--medtrak-muted)]">{text}</p>
        <button type="button" onClick={home} className="mt-4 min-h-12 rounded-2xl bg-[var(--medtrak-accent)] px-5 font-bold text-white">Back home</button>
      </section>
    </main>
  );

  if (unit === undefined) return <main className="pvx-mobile-page"><p className="text-center text-sm text-[var(--medtrak-muted)]">Opening the fridge check…</p></main>;
  if (!unit) return message("This fridge isn't set up", "The tag points at a fridge that is no longer in the list. Tell the Practice Manager.");
  if (!can("temperature.write")) return message("You can't record temperatures", "Your role isn't set up to record fridge temperatures. Ask the Practice Manager if you should be.");
  return (
    <main className="pvx-mobile-page">
      <MobileFridgeCheckSheet asset={unitAsAsset(unit)} onClose={home} />
    </main>
  );
}
