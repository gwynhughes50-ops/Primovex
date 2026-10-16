// Made-up clinical waste collections for Demo and Training mode (no real consignment notes). Dates are worked out from "now".

const pad = (n) => String(n).padStart(2, "0");
const ago = (days) => { const d = new Date(Date.now() - days * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const sharps = (kg, boxes) => ({ wasteCode: "HS", ewc: "180103/09", description: "INFECTIOUS HEALTHCARE SHARPS-INCINERATE", kg, component: "SHARPS / MEDICINES", concentration: "5% / 95%", form: "MIXED", hazard: "HP9", bags: 0, sharpsBoxes: boxes, sealedUnits: 0, wheeledCarts: 0 });
const clinical = (kg, bags) => ({ wasteCode: "HT", ewc: "18 01 03", description: "INFECTIOUS HEALTHCARE FOR ALTERNATE TREATMENT", kg, component: "CLINICAL WASTE", concentration: "100%", form: "MIXED", hazard: "HP9", bags, sharpsBoxes: 0, sealedUnits: 0, wheeledCarts: 0 });

export function demoWaste() {
  return [
    { id: "demo-w1", siteId: "main", siteName: "Main Surgery", consignmentCode: "DEM001/AAAA1", documentRef: "DEMO00001A", customerSite: "0000001-111", premisesCode: "DEM001", collectionDate: ago(12), collectionTime: "09:10", producer: "Demo Surgery", carrier: "Stericycle", lines: [sharps(6, 6), clinical(58.4, 22)], fileName: "demo-note-1.pdf" },
    { id: "demo-w2", siteId: "branch", siteName: "Branch Surgery", consignmentCode: "DEM001/BBBB2", documentRef: "DEMO00002B", customerSite: "0000001-111", premisesCode: "DEM001", collectionDate: ago(40), collectionTime: "08:50", producer: "Demo Surgery", carrier: "Stericycle", lines: [sharps(9.5, 9), clinical(71.2, 27)], fileName: "demo-note-2.pdf" },
    { id: "demo-w3", siteId: "main", siteName: "Main Surgery", consignmentCode: "DEM001/CCCC3", documentRef: "DEMO00003C", customerSite: "0000001-111", premisesCode: "DEM001", collectionDate: ago(69), collectionTime: "09:30", producer: "Demo Surgery", carrier: "Stericycle", lines: [clinical(64.0, 24)], fileName: "demo-note-3.pdf" },
  ];
}

// a made-up quarterly return for the demo: three consignments, one of which has no saved note yet
export function demoWasteReturns() {
  const [a, , c] = demoWaste();
  const row = (note, code) => ({ code, date: note.collectionDate, ewc: "18 01 03", hazard: "HP9", form: "Mixed", kg: note.lines.reduce((n, l) => n + l.kg, 0), disposal: "R03" });
  const year = Number(a.collectionDate.slice(0, 4));
  const quarter = Math.floor((Number(a.collectionDate.slice(5, 7)) - 1) / 3) + 1;
  const rows = [row(a, "DEM001//AAAA1"), row(c, "DEM001//CCCC3"), { code: "DEM001//MISSD", date: a.collectionDate, ewc: "18 01 03", hazard: "HP9", form: "Mixed", kg: 12, disposal: "R03" }];
  return [{ id: "demo-return", siteId: "main", siteName: "Main Surgery", customerSite: "0000001-111", producer: "Demo Surgery", address: "", premisesCode: "DEM001", reportDate: a.collectionDate, year, quarter, totalKg: rows.reduce((n, r) => n + r.kg, 0), rows, fileName: "demo-return.pdf" }];
}
