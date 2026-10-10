import { allGaps, buildSections } from "./inspectionSummary.js";

// The visit sheets. Each lists the areas that visit looks at, in order, and the evidence that lives outside Primovex
// (so the person preparing the pack knows to bring it).

export const VISITS = [
  {
    id: "heiw",
    label: "HEIW visit",
    long: "Health Education and Improvement Wales visit",
    sections: ["fire", "water", "pat", "emergency", "cleaning", "coldchain", "stock", "coshh", "governance"],
    outside: ["Risk assessments (held in Croner)", "Staff training matrix (to be added to Primovex)", "Policies and procedures", "Infection prevention and control audits"],
  },
  {
    id: "hs",
    label: "Health and Safety visit",
    long: "Health and Safety visit",
    sections: ["fire", "water", "pat", "emergency", "cleaning", "coshh"],
    outside: ["Risk assessments (held in Croner)", "Fire and legionella risk assessments", "Staff training records (fire, manual handling)", "Accident book"],
  },
];

// an older link or habit of "hiw" opens the HEIW sheet
export const visitById = (id) => VISITS.find((v) => v.id === (id === "hiw" ? "heiw" : id)) || VISITS[0];

// the report for one visit: its sections (in order), the gaps to put right, and when/how it was prepared
export function buildReport({ visitId, data, preparedBy = "", now = new Date() }) {
  const visit = visitById(visitId);
  const all = buildSections({ ...data, now });
  const sections = visit.sections.map((id) => all[id]).filter(Boolean);
  return { visit, sections, gaps: allGaps(sections), preparedBy, preparedAt: now };
}
