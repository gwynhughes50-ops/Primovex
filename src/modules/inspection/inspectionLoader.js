import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getExpirySettings, summariseStockAlerts } from "@/lib/stockAlerts";
import { normalizeStockItemCategory } from "@/services/stockService";
import { CONCERNS_COLLECTION } from "@/modules/governance/services/concernService";
import { SAR_COLLECTION } from "@/modules/governance/services/sarService";
import { SE_COLLECTION } from "@/modules/governance/seModel";
import { normaliseSubstance } from "@/modules/coshh/coshh";
import { normaliseCertificate } from "@/modules/certificates/certificates";
import { normaliseConsignment } from "@/modules/waste/waste";
import { COURSES as TRAINING_COURSES, PEOPLE as TRAINING_PEOPLE, RECORDS as TRAINING_RECORDS } from "@/modules/training/trainingService";

// Reads what the inspection summary needs, once, with the signed-in person's own permissions. A collection this
// person may not read is recorded as not available (the sheet then says "Not shown", rather than pretending
// nothing is there). Nothing here writes anything.

const rows = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

async function read(label, build, available, key) {
  try {
    const list = rows(await getDocs(build()));
    if (key) available[key] = true;
    return list;
  } catch (error) {
    console.warn(`Inspection summary: ${label} not readable`, error?.code || error);
    return [];
  }
}

export async function loadInspectionData(now = new Date()) {
  const available = {};
  const monthAgo = dayKey(new Date(now.getTime() - 31 * 86400000));

  const [checks, fireWeekly, waterRounds, patSessions, patAssets, patTests, cleaningLogs, tempUnits, tempLogs, tempIncidents, stockDocs, coshhDocs, certDocs, concerns, sars, events, trainingPeople, trainingCourses, trainingRecords, wasteDocs] = await Promise.all([
    read("compliance checks", () => query(collection(db, "compliance_checks"), orderBy("createdAt", "desc"), limit(3000)), available, "fire"),
    read("fire records", () => query(collection(db, "fire_weekly_checks"), orderBy("createdAt", "desc"), limit(300))),
    read("water rounds", () => query(collection(db, "water_temp_rounds"), orderBy("createdAt", "desc"), limit(300))),
    read("PAT sessions", () => query(collection(db, "pat_test_sessions"), orderBy("createdAt", "desc"), limit(300)), available, "pat"),
    read("PAT appliances", () => collection(db, "pat_assets")),
    read("PAT tests", () => query(collection(db, "pat_tests"), orderBy("testedOn", "desc"), limit(1000))),
    read("cleaning logs", () => collection(db, "cleaning_logs"), available, "cleaning"),
    read("fridges", () => collection(db, "temperature_units"), available, "temperature"),
    read("temperature readings", () => query(collection(db, "temperature_logs"), where("dateKey", ">=", monthAgo))),
    read("temperature incidents", () => collection(db, "temperature_incidents")),
    read("stock", () => collection(db, "stock_items"), available, "stock"),
    read("COSHH register", () => collection(db, "coshh_substances"), available, "coshh"),
    read("certificates", () => collection(db, "compliance_certificates"), available, "certs"),
    read("concerns", () => collection(db, CONCERNS_COLLECTION), available, "concerns"),
    read("SARs", () => collection(db, SAR_COLLECTION), available, "sars"),
    read("significant events", () => collection(db, SE_COLLECTION), available, "events"),
    read("training people", () => collection(db, TRAINING_PEOPLE), available, "training"),
    read("training courses", () => collection(db, TRAINING_COURSES)),
    read("training records", () => collection(db, TRAINING_RECORDS)),
    read("clinical waste", () => collection(db, "waste_consignments"), available, "waste"),
  ]);
  // water uses the same compliance checks as fire
  available.water = available.fire;

  const stock = stockDocs.filter((item) => !item.archived_at);
  const stockAlerts = available.stock
    ? summariseStockAlerts(stock, { categoryOf: (item) => normalizeStockItemCategory(item).category, settings: getExpirySettings(), now, resolved: {} }).alerts
    : [];

  return {
    checks, fireWeekly, waterRounds, patSessions, patAssets, patTests, cleaningLogs, tempUnits, tempLogs, tempIncidents,
    stockAlerts, stockCount: stock.length, coshh: coshhDocs.map((d) => normaliseSubstance(d.id, d)), certificates: certDocs.map((d) => normaliseCertificate(d.id, d)), concerns, sars, events, waste: wasteDocs.map((d) => normaliseConsignment(d.id, d)), training: { people: trainingPeople, courses: trainingCourses, records: trainingRecords }, available,
  };
}
