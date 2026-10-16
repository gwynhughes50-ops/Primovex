// Mileage claims: the journeys staff make in their own vehicle for work, and what they are paid for them. Pure (no Firestore, no
// screens) so the page, the phone, the totals for payroll and the tests share it.
//
//   claim: { id, uid, staffName, managerUid, date "YYYY-MM-DD", fromId, fromName, toId, toName, miles (one way), returnTrip,
//            vehicle, purpose, note, status: "submitted" | "approved" | "rejected" }
//   rates: { car: { tiers: [{ upTo: 10000, pence: 45 }, { pence: 25 }] }, ... }  upTo = miles in the tax year; the last tier has none

export const VEHICLES = [{ key: "car", label: "Car or van" }, { key: "motorcycle", label: "Motorcycle" }, { key: "bicycle", label: "Bicycle" }];
export const vehicleLabel = (key) => VEHICLES.find((v) => v.key === key)?.label || key;

// The HMRC approved mileage rates: the most a practice can pay tax-free
export const DEFAULT_RATES = {
  car: { tiers: [{ upTo: 10000, pence: 45 }, { pence: 25 }] },
  motorcycle: { tiers: [{ pence: 24 }] },
  bicycle: { tiers: [{ pence: 20 }] },
};

// Why a journey was made: chosen from a list so nobody types a patient's details into a claim
export const PURPOSES = ["Home visit", "Meeting or training", "Collecting or delivering supplies", "Bank, post or pharmacy", "Other work journey"];

export const STATUS = { submitted: "submitted", approved: "approved", rejected: "rejected" };
export const STATUS_LABEL = { submitted: "Waiting for approval", approved: "Approved", rejected: "Not approved" };

// the places a journey can start or end that are not in the list of sites
export const VISIT_PLACE = { id: "visit", name: "Home visit (patient's home)", kind: "visit" };

export const MAX_ONE_WAY_MILES = 400;

const pad = (n) => String(n).padStart(2, "0");
export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(m[2]) - 1 ? null : date;
}

// The tax year a date falls in: 6 April to 5 April ("2026-27"). The 10,000 mile threshold counts within it.
export function taxYearOf(key) {
  const date = parseKey(key);
  if (!date) return null;
  const startYear = date.getMonth() > 3 || (date.getMonth() === 3 && date.getDate() >= 6) ? date.getFullYear() : date.getFullYear() - 1;
  return { label: `${startYear}-${String(startYear + 1).slice(2)}`, from: `${startYear}-04-06`, to: `${startYear + 1}-04-05` };
}

export const money = (pence) => `£${(Math.round(Number(pence) || 0) / 100).toFixed(2)}`;
export const totalMiles = (claim) => Math.round((Number(claim.miles) || 0) * (claim.returnTrip ? 2 : 1) * 100) / 100;

// the pence paid for `miles` more miles, when `before` have already been claimed this tax year
export function pence(rates, vehicle, before, miles) {
  const tiers = rates?.[vehicle]?.tiers || DEFAULT_RATES[vehicle]?.tiers || [];
  let remaining = miles;
  let done = before;
  let total = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const room = tier.upTo === undefined ? remaining : Math.max(0, tier.upTo - done);
    const used = Math.min(remaining, room);
    total += used * tier.pence;
    remaining -= used;
    done += used;
  }
  return Math.round(total);
}

// What each claim is worth. Claims are priced in date order within each person, vehicle and tax year, so the lower rate
// applies from the claim that takes the person over the threshold. Only claims in `statuses` count (approved by default).
//   returns Map(claimId -> { miles, pence, taxYear })
export function priceClaims(claims, rates = DEFAULT_RATES, statuses = [STATUS.approved]) {
  const out = new Map();
  const groups = new Map();
  for (const c of claims) {
    if (!statuses.includes(c.status)) continue;
    const year = taxYearOf(c.date);
    if (!year) continue;
    const key = `${c.uid}|${c.vehicle}|${year.label}`;
    groups.set(key, [...(groups.get(key) || []), { c, year }]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.c.date.localeCompare(b.c.date) || String(a.c.id).localeCompare(String(b.c.id)));
    let before = 0;
    for (const { c, year } of list) {
      const miles = totalMiles(c);
      out.set(c.id, { miles, pence: pence(rates, c.vehicle, before, miles), taxYear: year.label });
      before += miles;
    }
  }
  return out;
}

// the known distance between two places, either way round (null when there isn't one)
export function routeMiles(routes, fromId, toId) {
  const found = (routes || []).find((r) => (r.fromId === fromId && r.toId === toId) || (r.fromId === toId && r.toId === fromId));
  return found ? Number(found.miles) : null;
}

// the problems with a claim, in words ("" when fine)
export function claimProblem(form, { today = dateKey(new Date()) } = {}) {
  if (!parseKey(form.date)) return "Choose the date of the journey.";
  if (form.date > today) return "A journey can't be in the future.";
  if (!form.fromId || !form.toId) return "Choose where the journey started and where it ended.";
  if (form.fromId === form.toId && form.fromId !== VISIT_PLACE.id) return "The start and the end are the same place.";
  const miles = Number(form.miles);
  if (!Number.isFinite(miles) || miles <= 0) return "Enter the miles for one way.";
  if (miles > MAX_ONE_WAY_MILES) return `Over ${MAX_ONE_WAY_MILES} miles one way? Check the distance, or ask the Practice Manager.`;
  if (!VEHICLES.some((v) => v.key === form.vehicle)) return "Choose the vehicle used.";
  if (!PURPOSES.includes(form.purpose)) return "Choose the reason for the journey.";
  return "";
}

// Totals per person for a run of dates (for payroll): miles and pounds, from approved claims only
export function periodTotals(claims, from, to, rates = DEFAULT_RATES) {
  const priced = priceClaims(claims, rates);
  const people = new Map();
  for (const c of claims) {
    if (c.status !== STATUS.approved || c.date < from || c.date > to) continue;
    const price = priced.get(c.id);
    if (!price) continue;
    const row = people.get(c.uid) || { uid: c.uid, name: c.staffName || "", journeys: 0, miles: 0, pence: 0 };
    row.journeys += 1;
    row.miles = Math.round((row.miles + price.miles) * 100) / 100;
    row.pence += price.pence;
    people.set(c.uid, row);
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// the places someone can choose: the practice's sites, other places set up for mileage, and "home visit"
export function placeOptions({ sites = [], places = [] }) {
  return [
    ...sites.map((s) => ({ id: `site:${s.id}`, name: s.name, kind: "site" })),
    ...places.filter((p) => p.active !== false).map((p) => ({ id: `place:${p.id}`, name: p.name, kind: "place" })),
    VISIT_PLACE,
  ].filter((p) => p.name).sort((a, b) => (a.kind === "visit") - (b.kind === "visit") || a.name.localeCompare(b.name));
}

// A CSV of approved claims for the payroll provider (one row per claim)
export function claimsCsv(claims, rates = DEFAULT_RATES) {
  const priced = priceClaims(claims, rates);
  const cell = (v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const head = ["Date", "Name", "From", "To", "Return trip", "Total miles", "Vehicle", "Reason", "Amount (GBP)", "Tax year"];
  const rows = claims.filter((c) => c.status === STATUS.approved).sort((a, b) => a.date.localeCompare(b.date) || String(a.staffName).localeCompare(String(b.staffName))).map((c) => {
    const price = priced.get(c.id);
    return [c.date, c.staffName, c.fromName, c.toName, c.returnTrip ? "Yes" : "No", price?.miles ?? totalMiles(c), vehicleLabel(c.vehicle), c.purpose, ((price?.pence || 0) / 100).toFixed(2), price?.taxYear || ""];
  });
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
