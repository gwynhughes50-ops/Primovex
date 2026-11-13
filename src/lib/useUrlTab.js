import { useState } from "react";
import { useSearchParams } from "react-router-dom";

// A page's tab, starting on the one named in the address (?tab=requests) when it is one the page has, so a button elsewhere in the app
// (the Dashboard's "Needs you" list) can open the page on the right tab. Falls back to the page's own first tab.
export function useUrlTab(valid, fallback) {
  const [params] = useSearchParams();
  const wanted = params.get("tab");
  return useState(() => (wanted && valid.includes(wanted) ? wanted : fallback));
}
