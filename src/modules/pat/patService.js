import { collection, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where, limit, orderBy } from "firebase/firestore";
import { addDocResendSafe } from "@/lib/resendSafeWrites";
import { recordAudit } from "@/modules/audit/recordAudit";
import { patAssetEvent, patIntervalsEvent, patTestEvent } from "@/modules/audit/auditEvents";
import { db } from "@/lib/firebase";
import { isSafeSyntheticMode } from "@/config/platformMode";
import { openIncidentForPatFail } from "@/modules/compliance/complianceIncidentService";
import { assetPatchAfterTest, buildPatTest } from "./pat";

// Reading and writing the PAT records. pat_assets is the register of appliances (with, on each, when it was last tested and when
// it is next due); pat_tests is one immutable record per test; pat_settings/main holds the practice's own retest intervals.

export const PAT_ASSETS = "pat_assets";
export const PAT_TESTS = "pat_tests";
export const PAT_SETTINGS = "pat_settings";

const rowOf = (d) => {
  const data = d.data() || {};
  return { id: d.id, ...data, siteId: String(data.siteId || "").trim(), active: data.active !== false, tag: String(data.tag || "").trim(), name: String(data.name || "").trim(), location: String(data.location || "").trim() };
};

// every active appliance, by tag. Demo and training mode show none: they never read or write the live records.
export function subscribePatAssets(onData, onError) {
  if (isSafeSyntheticMode()) { onData([]); return () => {}; }
  return onSnapshot(
    query(collection(db, PAT_ASSETS)),
    (snap) => onData(snap.docs.map(rowOf).filter((a) => a.active).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))),
    onError,
  );
}

// the tests of the last `days` days, newest first
export function subscribePatTests(onData, onError, { days = 400, max = 1000 } = {}) {
  if (isSafeSyntheticMode()) { onData([]); return () => {}; }
  const since = new Date(Date.now() - days * 86400000);
  const key = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  return onSnapshot(
    query(collection(db, PAT_TESTS), where("testedOn", ">=", key), orderBy("testedOn", "desc"), limit(max)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError,
  );
}

export function subscribePatSettings(onData) {
  if (isSafeSyntheticMode()) { onData({}); return () => {}; }
  return onSnapshot(doc(db, PAT_SETTINGS, "main"), (snap) => onData(snap.exists() ? snap.data() : {}), () => onData({}));
}

export async function savePatIntervals(intervals, actor = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(intervals || {})) {
    const months = Number(value);
    if (Number.isFinite(months) && months >= 1 && months <= 120) clean[key] = Math.round(months);
  }
  await setDoc(doc(db, PAT_SETTINGS, "main"), { intervals: clean, updatedAt: serverTimestamp(), updatedByUid: actor.uid || "", updatedByName: actor.displayName || actor.email || "" }, { merge: true });
  recordAudit(patIntervalsEvent(clean));
}

// Record a test of one appliance: the test itself, what it changes on the appliance (last tested, next due, out of use), and,
// for a fail, an incident that tells the caretaker and the practice manager. Throws a sentence when it cannot be recorded.
export async function recordPatTest({ asset, answers, final, actor, settings }) {
  const test = buildPatTest({ asset, answers, final, actor, settings });
  if (isSafeSyntheticMode()) return { id: "demo", ...test };
  const ref = await addDocResendSafe(collection(db, PAT_TESTS), { ...test, createdAt: serverTimestamp() });
  await updateDoc(doc(db, PAT_ASSETS, asset.id), { ...assetPatchAfterTest(test), updatedAt: serverTimestamp() });
  recordAudit(patTestEvent({ asset, test: { ...test, id: ref.id } }));
  if (test.result === "fail") await openIncidentForPatFail({ asset, test: { ...test, id: ref.id }, actor });
  return { id: ref.id, ...test };
}

// A new appliance. Kind and class set how often it is retested and whether it has an earth test.
export async function addPatAsset({ siteId, tag, name, category = "other", cls = "I", location = "", makeModel = "", serialNumber = "", skipAudit = false }) {
  const cleanTag = String(tag || "").trim();
  const cleanName = String(name || "").trim();
  if (!cleanTag) throw new Error("Give it a tag number.");
  if (!cleanName) throw new Error("Say what it is.");
  if (isSafeSyntheticMode()) return { id: "demo" };
  const equipmentId = `EQ-PAT-${Date.now().toString().slice(-7)}`;
  const ref = await addDocResendSafe(collection(db, PAT_ASSETS), {
    siteId: siteId || "main_branch", equipmentId, tag: cleanTag, name: cleanName, category, cls: cls === "II" ? "II" : "I",
    location: String(location).trim(), makeModel: String(makeModel).trim(), serialNumber: String(serialNumber).trim(), active: true, outOfUse: false, createdAt: serverTimestamp(),
  });
  if (!skipAudit) recordAudit(patAssetEvent("created", { asset: { id: ref.id, tag: cleanTag, name: cleanName, category } }));
  return { id: ref.id, equipmentId };
}
