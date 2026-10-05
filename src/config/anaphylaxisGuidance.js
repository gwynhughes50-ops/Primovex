// The anaphylaxis guidance shown under the boxes on the Anaphylaxis page: links
// to the source documents, never copies of them (doses and algorithms must be
// read from the issuing body so they can't go out of date here).
//
// Dates are the ones the issuing body shows, with how precise they are
// ("day" | "month" | "year"). GUIDANCE_CHECKED_ON is when somebody last checked
// this list against the sources. Update both when a document changes.
//
// There is no separate NHS Wales clinical anaphylaxis guideline: Welsh practices
// work to the UK-wide Resuscitation Council UK guidance. NICE is England's body,
// and Welsh health boards decide locally whether to adopt its guidance.

export const GUIDANCE_CHECKED_ON = "2026-10-05";

export const ANAPHYLAXIS_GUIDANCE = [
  {
    id: "rcuk-emergency-treatment",
    title: "Emergency treatment of anaphylactic reactions: guidelines for healthcare providers",
    issuer: "Resuscitation Council UK",
    covers: "UK-wide, including Wales",
    summary: "The main UK guideline: recognition, intramuscular adrenaline, repeat doses, fluids and what to do next.",
    published: { date: "2021-05", precision: "month" },
    url: "https://www.resus.org.uk/library/additional-guidance/guidance-anaphylaxis/emergency-treatment-anaphylactic-reactions",
    kind: "Guideline",
  },
  {
    id: "rcuk-algorithm",
    title: "Anaphylaxis algorithm",
    issuer: "Resuscitation Council UK",
    covers: "UK-wide, including Wales",
    summary: "One-page algorithm for the first response. Suitable to print for the box.",
    published: { date: "2021", precision: "year" },
    url: "https://www.resus.org.uk/sites/default/files/2021-04/Anaphylaxis%20algorithm%202021.pdf",
    kind: "Algorithm (PDF)",
  },
  {
    id: "rcuk-refractory-algorithm",
    title: "Refractory anaphylaxis algorithm",
    issuer: "Resuscitation Council UK",
    covers: "UK-wide, including Wales",
    summary: "What to do when there is no improvement after two doses of adrenaline.",
    published: { date: "2021", precision: "year" },
    url: "https://www.resus.org.uk/sites/default/files/2021-04/Refractory%20anaphylaxis%20algorithm%202021.pdf",
    kind: "Algorithm (PDF)",
  },
  {
    id: "rcuk-vaccination",
    title: "Anaphylaxis guidance for vaccination settings",
    issuer: "Resuscitation Council UK",
    covers: "UK-wide, including Wales",
    summary: "Managing the rare anaphylactic reaction in a vaccination clinic.",
    published: { date: "2021-08-10", precision: "day" },
    url: "https://www.resus.org.uk/about-us/news-and-events/anaphylaxis-guidance-vaccination-settings",
    kind: "Guidance",
  },
  {
    id: "nice-ng258",
    title: "Anaphylaxis: assessment and referral after emergency treatment (NG258)",
    issuer: "NICE",
    covers: "England's national guidance; Welsh health boards adopt it locally",
    summary: "After emergency treatment: observation period, tryptase blood samples and referral to a specialist allergy service. Replaces NICE CG134 (2011).",
    published: { date: "2026-05-27", precision: "day" },
    url: "https://www.nice.org.uk/guidance/ng258",
    kind: "Guideline",
  },
  {
    id: "bsaci-aai",
    title: "Adrenaline autoinjector prescription for patients at risk of anaphylaxis",
    issuer: "British Society for Allergy & Clinical Immunology (BSACI)",
    covers: "UK-wide, including Wales",
    summary: "Guidance for primary care on who to prescribe an adrenaline autoinjector for, and the training and action plan to give with it.",
    published: { date: "2024-04", precision: "month" },
    url: "https://www.bsaci.org/wp-content/uploads/2024/04/Adrenaline-autoinjector-prescription-for-patients-at-risk-of-anaphylaxis-160424.pdf",
    kind: "Guidance (PDF)",
  },
  {
    id: "nhs111-wales",
    title: "Anaphylaxis (NHS 111 Wales health A to Z)",
    issuer: "NHS 111 Wales",
    covers: "Wales - patient information",
    summary: "Plain-language information for patients and carers. The page shows no date.",
    published: null,
    url: "https://111.wales.nhs.uk/encyclopaedia/a/article/Anaphylaxis",
    kind: "Patient information",
  },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "27 May 2026", "May 2021", "2021" - as precisely as the source gives it.
export function formatGuidanceDate(published) {
  if (!published?.date) return "No date shown by the publisher";
  const [year, month, day] = String(published.date).split("-");
  if (published.precision === "year" || !month) return year;
  const name = MONTHS[Number(month) - 1];
  if (!name) return year;
  return published.precision === "month" || !day ? `${name} ${year}` : `${Number(day)} ${name} ${year}`;
}

// Newest first; undated last.
export function sortedGuidance(list = ANAPHYLAXIS_GUIDANCE) {
  const key = (row) => {
    if (!row.published?.date) return "0";
    const [year, month = "00", day = "00"] = String(row.published.date).split("-");
    return `${year}${month}${day}`;
  };
  return [...list].sort((a, b) => key(b).localeCompare(key(a)));
}
