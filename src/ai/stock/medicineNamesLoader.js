import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { setMedicineData, setStockAliases } from "./medicineNames";

// Loads the medicine name list (once, as its own file so it only downloads when the Orb first needs it)
// and starts following the names this practice has taught (settings/orbAliases). The stock tools wait
// for this before matching, so what a person says is compared with the shelf by the same names.

let loading = null;

export function ensureMedicineNames() {
  if (!loading) {
    loading = (async () => {
      try {
        const mod = await import("@/data/medicineNames.json");
        setMedicineData(mod.default || mod);
      } catch (error) {
        console.warn("Medicine name list could not be loaded.", error?.message || error);
      }
      try {
        onSnapshot(doc(db, "settings", "orbAliases"), (snap) => setStockAliases(snap.exists() ? snap.data().aliases || [] : []), () => setStockAliases([]));
      } catch { /* the taught names are optional */ }
    })();
  }
  return loading;
}
