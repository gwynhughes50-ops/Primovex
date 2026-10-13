import { useEffect, useState } from "react";

// The NHS dm+d name list, downloaded the first time a name field needs it (it is its own file, about 200 KB) and kept.
let cached = null;
let loading = null;

export function loadMedicineList() {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = import("@/data/medicineNames.json")
      .then((mod) => { cached = mod.default || mod; return cached; })
      .catch((error) => { loading = null; console.warn("The dm+d list could not be loaded.", error?.message || error); return null; });
  }
  return loading;
}

// { data: the list or null while it loads or if it could not load }
export default function useMedicineList(enabled = true) {
  const [data, setData] = useState(cached);
  useEffect(() => {
    if (!enabled || cached) { if (cached) setData(cached); return undefined; }
    let live = true;
    loadMedicineList().then((list) => { if (live) setData(list); });
    return () => { live = false; };
  }, [enabled]);
  return data;
}
