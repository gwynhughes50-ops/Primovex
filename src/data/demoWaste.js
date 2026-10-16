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
