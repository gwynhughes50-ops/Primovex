// Active security test against Primovex's REAL firestore.rules, run against
// the local Firestore emulator (no production data touched). Simulates
// low-privilege / malicious auth contexts and attempts privilege escalation,
// IDOR and tenant-isolation bypasses.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, deleteDoc, serverTimestamp, query, where, writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

const RULES_PATH = fileURLToPath(new URL("../../../firestore.rules", import.meta.url));
const STORAGE_RULES_PATH = fileURLToPath(new URL("../../../storage.rules", import.meta.url));

// Storage Security Rules' firestore.get()/exists() cross-service calls are
// bound by the local emulator to whichever project the emulator suite was
// actually started under (the repo's default, from .firebaserc) - NOT
// whatever arbitrary project id a test declares. Using anything else here
// makes every storage.rules check fail with a "Null value error" that has
// nothing to do with the rules themselves; see section 10 below.
const PROJECT_ID = "medtrak-b1cad";

let testEnv;
let pass = 0;
let fail = 0;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    pass++;
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (e) {
    fail++;
    results.push({ name, ok: false, error: e.message });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${e.message.split("\n")[0]}`);
  }
}

async function seed(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore());
  });
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync(STORAGE_RULES_PATH, "utf8"), host: "127.0.0.1", port: 9199 },
  });
  // Start from an empty database so the suite can be re-run against the same
  // emulator (some checks write fixed-id, append-only records).
  await testEnv.clearFirestore();

  // ---- Seed baseline users/roles ----
  await seed(async (db) => {
    await setDoc(doc(db, "users", "admin-uid"), { role: "System Admin", displayName: "Admin" });
    await setDoc(doc(db, "users", "pm-uid"), { role: "Practice Manager", displayName: "PM" });
    await setDoc(doc(db, "users", "user-uid"), { role: "User", displayName: "User" });
    await setDoc(doc(db, "users", "readonly-uid"), { role: "ReadOnly", displayName: "RO" });
    await setDoc(doc(db, "users", "partner-uid"), { role: "Partner", displayName: "Partner" });
    await setDoc(doc(db, "users", "reception-uid"), { role: "Reception", displayName: "Reception" });
    await setDoc(doc(db, "users", "craig-uid"), { role: "Medical Secretary", displayName: "Craig" });
    await setDoc(doc(db, "users", "it-uid"), { role: "IT", displayName: "IT" });
    await setDoc(doc(db, "roles", "Medical Secretary"), {
      name: "Medical Secretary", capabilities: ["governance.manageSars", "governance.read", "dashboard.read"], builtIn: false,
    });
    await setDoc(doc(db, "roles", "IT"), {
      name: "IT", capabilities: ["admin.access", "practiceAdmin.read"], builtIn: false,
    });
    await setDoc(doc(db, "governance_sars", "sar-1"), {
      assignedToUid: "craig-uid", managerUid: "pm-uid", createdByUid: "craig-uid", subject: "test",
    });
    await setDoc(doc(db, "governance_concerns", "concern-1"), {
      involvedUserIds: ["user-uid"], source: "patient", summary: "test concern",
    });
    await setDoc(doc(db, "stock_items", "item-1"), { name: "Bandages", current_stock: 10 });
    // permanent-delete permission (inventory.purge), held by a custom role only
    await setDoc(doc(db, "roles", "Stock Controller"), { name: "Stock Controller", capabilities: ["inventory.read", "inventory.purge"], builtIn: false });
    await setDoc(doc(db, "users", "stockctl-uid"), { role: "Stock Controller", displayName: "Stock Controller" });
    for (const id of ["purge-admin", "purge-ctl", "purge-pm", "purge-nurse", "purge-ro", "purge-anon", "purge-ctl-edit"]) {
      await setDoc(doc(db, "stock_items", id), { name: "Item " + id, current_stock: 3, barcode: "bc-" + id });
    }
    await setDoc(doc(db, "stock_barcodes", "bc-purge-ctl"), { item_id: "purge-ctl", barcode: "bc-purge-ctl" });
    await setDoc(doc(db, "stock_barcodes", "bc-purge-nurse"), { item_id: "purge-nurse", barcode: "bc-purge-nurse" });
    // sign-in/activity report: readable by admins and audit readers only, written by the server only
    await setDoc(doc(db, "roles", "Auditor"), { name: "Auditor", capabilities: ["audit.read"], builtIn: false });
    await setDoc(doc(db, "users", "auditor-uid"), { role: "Auditor", displayName: "Auditor" });
    await setDoc(doc(db, "usage_sessions", "user-uid_sess-00000001"), { uid: "user-uid", practiceId: "primary", displayName: "User", role: "User", pages: [], activeSeconds: 10 });
    await setDoc(doc(db, "usage_sessions", "other-uid_sess-00000002"), { uid: "other-uid", practiceId: "site-b", displayName: "Other", role: "User", pages: [], activeSeconds: 10 });
    await setDoc(doc(db, "orb_ai_usage", "all_20261006"), { count: 3, kind: "day", day: "20261006" });
    await setDoc(doc(db, "settings", "orb"), { aiRouting: false });
    // ClinFlow is off unless deliberately turned on; the tenant checks below run with it on, section 17 tests the switch
    await setDoc(doc(db, "practice_config", "main"), { moduleToggles: { clinflow: { disabled: false, allowUids: [] } } });
    await setDoc(doc(db, "clinflow_workflow_records", "rec-primary"), {
      dataMode: "synthetic", practiceId: "primary", siteId: "SITE-MAIN",
    });
    await setDoc(doc(db, "clinflow_workflow_records", "rec-siteB"), {
      dataMode: "synthetic", practiceId: "site-b", siteId: "SITE-B",
    });
    // significant events
    await setDoc(doc(db, "users", "lead-uid"), { role: "Nurse", displayName: "Lead" });
    await setDoc(doc(db, "users", "reviewer-uid"), { role: "Nurse", displayName: "Reviewer" });
    await setDoc(doc(db, "users", "reporter-uid"), { role: "HCA", displayName: "Reporter" });
    await setDoc(doc(db, "users", "bystander-uid"), { role: "HCA", displayName: "Bystander" });
    await setDoc(doc(db, "governance_significant_events", "se-1"), {
      reference: "SE-1", status: "investigating", investigation: "required", title: "Test", reportedByUid: "reporter-uid",
      leadUid: "lead-uid", reviewerUids: ["reviewer-uid"], involvedUserIds: [], harm: "low",
    });
    await setDoc(doc(db, "governance_se_reviews", "se-1_reviewer-uid"), { seId: "se-1", reviewerUid: "reviewer-uid", status: "requested", summary: "" });
    await setDoc(doc(db, "governance_se_reviews", "se-1_other-uid"), { seId: "se-1", reviewerUid: "other-uid", status: "requested", summary: "" });
    await setDoc(doc(db, "governance_se_meetings", "meet-1"), { title: "M", attendeeUids: ["reviewer-uid"], eventIds: ["se-1"], status: "planned" });
    await setDoc(doc(db, "governance_se_actions", "act-1"), { seId: "se-1", title: "Do it", ownerUid: "reviewer-uid", status: "open" });
    await setDoc(doc(db, "governance_se_actions", "act-2"), { seId: "se-1", title: "Other", ownerUid: "lead-uid", status: "open" });
    await setDoc(doc(db, "users", "sitea-uid"), { role: "User", practiceId: "site-a" });
    // compliance checks / cleaning notes
    await setDoc(doc(db, "users", "caretaker-uid"), { role: "Caretaker", displayName: "Caretaker" });
    await setDoc(doc(db, "users", "nurse-uid"), { role: "Nurse", displayName: "Nurse" });
    await setDoc(doc(db, "users", "cleaner-uid"), { role: "Cleaner", displayName: "Cleaner" });
    await setDoc(doc(db, "users", "cleaner2-uid"), { role: "Cleaner", displayName: "Cleaner Two" });
    await setDoc(doc(db, "compliance_assets", "asset-wh1"), { assetCode: "WH-001", label: "Hot tap", assetType: "water_hot", qrPayload: "MEDTRAK:COMPLIANCE:asset-wh1", siteId: "main_branch" });
    // fridges: a custom "Nurse Manager" role that can resolve incidents; an incident and a unit to work on
    await setDoc(doc(db, "roles", "Nurse Manager"), { name: "Nurse Manager", capabilities: ["temperature.read", "temperature.write", "temperature.resolveIncident", "dashboard.read"], builtIn: false });
    await setDoc(doc(db, "users", "nursemgr-uid"), { role: "Nurse Manager", displayName: "Nurse Manager" });
    await setDoc(doc(db, "temperature_units", "unit-1"), { unitName: "Vaccine fridge", unitType: "fridge", rangeMin: 2, rangeMax: 8, active: true });
    await setDoc(doc(db, "temperature_incidents", "inc-1"), { unitId: "unit-1", unitName: "Vaccine fridge", status: "open", openedByUid: "reporter-uid" });
    for (const id of ["log-c1", "log-c2", "log-c3", "log-c4"]) {
      await setDoc(doc(db, "cleaning_logs", id), { roomId: "room-1", roomName: "Room 1", cleanedBy: "Cleaner", cleanedByUid: "cleaner-uid", method: "nfc-session" });
    }
  });

  const admin = testEnv.authenticatedContext("admin-uid").firestore();
  const stockctl = testEnv.authenticatedContext("stockctl-uid").firestore();
  const pm = testEnv.authenticatedContext("pm-uid").firestore();
  const user = testEnv.authenticatedContext("user-uid").firestore();
  const readonly = testEnv.authenticatedContext("readonly-uid").firestore();
  const partner = testEnv.authenticatedContext("partner-uid").firestore();
  const reception = testEnv.authenticatedContext("reception-uid").firestore();
  const craig = testEnv.authenticatedContext("craig-uid").firestore();
  const sitea = testEnv.authenticatedContext("sitea-uid").firestore();
  const caretaker = testEnv.authenticatedContext("caretaker-uid").firestore();
  const nurse = testEnv.authenticatedContext("nurse-uid").firestore();
  const cleaner = testEnv.authenticatedContext("cleaner-uid").firestore();
  const cleaner2 = testEnv.authenticatedContext("cleaner2-uid").firestore();
  const lead = testEnv.authenticatedContext("lead-uid").firestore();
  const reviewer = testEnv.authenticatedContext("reviewer-uid").firestore();
  const reporter = testEnv.authenticatedContext("reporter-uid").firestore();
  const bystander = testEnv.authenticatedContext("bystander-uid").firestore();
  const nursemgr = testEnv.authenticatedContext("nursemgr-uid").firestore();
  const anon = testEnv.unauthenticatedContext().firestore();
  const auditor = testEnv.authenticatedContext("auditor-uid").firestore();

  console.log("\n=== 1. Today's fix: custom-role SAR access (Craig) ===");
  await check("Craig (Medical Secretary, has governance.manageSars) CAN create a SAR", () =>
    assertSucceeds(setDoc(doc(craig, "governance_sars", "sar-craig-1"), {
      assignedToUid: "craig-uid", createdByUid: "craig-uid", subject: "new sar",
    })));
  await check("ReadOnly (no governance.manageSars) CANNOT create a SAR", () =>
    assertFails(setDoc(doc(readonly, "governance_sars", "sar-ro-1"), {
      assignedToUid: "readonly-uid", createdByUid: "readonly-uid", subject: "nope",
    })));
  await check("User with no relationship to sar-1 CANNOT read it", () =>
    assertFails(getDoc(doc(user, "governance_sars", "sar-1"))));
  await check("Craig (assignedToUid on sar-1) CAN read sar-1", () =>
    assertSucceeds(getDoc(doc(craig, "governance_sars", "sar-1"))));

  console.log("\n=== 1b. SAR edit / delete permissions ===");
  await seed(async (db) => {
    for (const id of ["sar-del-a", "sar-del-b", "sar-del-c"]) await setDoc(doc(db, "governance_sars", id), { assignedToUid: "craig-uid", createdByUid: "craig-uid", reference: id });
  });
  const plainUser = testEnv.authenticatedContext("user-uid").firestore();
  await check("SAR team member (Craig) CAN edit a SAR incl. the new requester-name field", () =>
    assertSucceeds(updateDoc(doc(craig, "governance_sars", "sar-del-a"), { notes: "edited", requestedBy: "other", requestedByOther: "Acme Ltd" })));
  await check("ReadOnly user CANNOT edit a SAR", () => assertFails(updateDoc(doc(readonly, "governance_sars", "sar-del-a"), { notes: "tampered" })));
  await check("Partner (read-only oversight) CANNOT edit a SAR", () => assertFails(updateDoc(doc(partner, "governance_sars", "sar-del-a"), { notes: "tampered" })));
  await check("ReadOnly user CANNOT delete a SAR", () => assertFails(deleteDoc(doc(readonly, "governance_sars", "sar-del-a"))));
  await check("Partner CANNOT delete a SAR", () => assertFails(deleteDoc(doc(partner, "governance_sars", "sar-del-b"))));
  await check("Plain User (no manageSars) CANNOT delete a SAR", () => assertFails(deleteDoc(doc(plainUser, "governance_sars", "sar-del-b"))));
  await check("Anonymous CANNOT delete a SAR", () => assertFails(deleteDoc(doc(anon, "governance_sars", "sar-del-b"))));
  await check("SAR team member (Craig) CAN delete a SAR", () => assertSucceeds(deleteDoc(doc(craig, "governance_sars", "sar-del-a"))));
  await check("Craig can then write the trailing deleted-activity entry", () => assertSucceeds(setDoc(doc(craig, "governance_sar_activity", "act-del-a"), { sarId: "sar-del-a", type: "deleted", title: "SAR deleted" })));
  await check("...and activity entries stay append-only (cannot be deleted)", () => assertFails(deleteDoc(doc(craig, "governance_sar_activity", "act-del-a"))));
  await check("Admin CAN still delete a SAR", () => assertSucceeds(deleteDoc(doc(admin, "governance_sars", "sar-del-c"))));

  console.log("\n=== 1c. SAR year folders ===");
  const yearDoc = (uid, year, extra = {}) => ({ year, createdByUid: uid, createdByName: "x", createdAt: 1, ...extra });
  await check("SAR team member (Craig) CAN create a year folder", () => assertSucceeds(setDoc(doc(craig, "governance_sar_years", "2027"), yearDoc("craig-uid", 2027))));
  await check("ReadOnly user CANNOT create a year folder", () => assertFails(setDoc(doc(readonly, "governance_sar_years", "2028"), yearDoc("readonly-uid", 2028))));
  await check("Partner (read-only oversight) CANNOT create a year folder", () => assertFails(setDoc(doc(partner, "governance_sar_years", "2028"), yearDoc("partner-uid", 2028))));
  await check("Anonymous CANNOT create a year folder", () => assertFails(setDoc(doc(anon, "governance_sar_years", "2028"), yearDoc("x", 2028))));
  await check("Year folder must be created as yourself (createdByUid spoof refused)", () => assertFails(setDoc(doc(craig, "governance_sar_years", "2029"), yearDoc("someone-else", 2029))));
  await check("Year folder id must be a real year (\"abcd\" refused)", () => assertFails(setDoc(doc(craig, "governance_sar_years", "abcd"), yearDoc("craig-uid", 2029))));
  await check("Year folder id and year field must agree (id 2030, year 2031 refused)", () => assertFails(setDoc(doc(craig, "governance_sar_years", "2030"), yearDoc("craig-uid", 2031))));
  await check("Year folder cannot carry extra fields", () => assertFails(setDoc(doc(craig, "governance_sar_years", "2032"), yearDoc("craig-uid", 2032, { sneaky: true }))));
  await check("Year folders are never edited (update refused, even for the SAR team)", () => assertFails(updateDoc(doc(craig, "governance_sar_years", "2027"), { year: 2027, createdByName: "changed" })));
  await check("SAR team can READ year folders", () => assertSucceeds(getDoc(doc(craig, "governance_sar_years", "2027"))));
  await check("Partner can READ year folders (oversight)", () => assertSucceeds(getDoc(doc(partner, "governance_sar_years", "2027"))));
  await check("ReadOnly user CANNOT read year folders", () => assertFails(getDoc(doc(readonly, "governance_sar_years", "2027"))));
  await check("ReadOnly user CANNOT delete a year folder", () => assertFails(deleteDoc(doc(readonly, "governance_sar_years", "2027"))));
  await check("SAR team member CAN delete a year folder", () => assertSucceeds(deleteDoc(doc(craig, "governance_sar_years", "2027"))));

  console.log("\n=== 2. Self privilege-escalation via users/{uid}.permissions ===");
  await check("Partner (no inventory.write) is denied a stock_items write BEFORE self-escalation attempt", () =>
    assertFails(setDoc(doc(partner, "stock_items", "item-1"), { current_stock: 999 }, { merge: true })));
  await check("Partner CAN set permissions:['*'] on their OWN profile (role unchanged)", () =>
    assertSucceeds(updateDoc(doc(partner, "users", "partner-uid"), { permissions: ["*"] })));
  await check("...but that self-set permissions field grants NOTHING (stock_items write still denied)", () =>
    assertFails(setDoc(doc(partner, "stock_items", "item-1"), { current_stock: 999 }, { merge: true })));
  await check("Partner CANNOT change their own role field", () =>
    assertFails(updateDoc(doc(partner, "users", "partner-uid"), { role: "System Admin" })));
  await check("Partner CANNOT remove or change the Orb limit an administrator set on them (orbScope)", () =>
    assertFails(updateDoc(doc(partner, "users", "partner-uid"), { orbScope: null })));
  await check("Partner CAN still update other things on their own profile (e.g. department)", () =>
    assertSucceeds(updateDoc(doc(partner, "users", "partner-uid"), { department: "Clinical" })));

  console.log("\n=== 3. IDOR on governance_concerns ===");
  await check("Uninvolved ReadOnly user CANNOT read concern-1", () =>
    assertFails(getDoc(doc(readonly, "governance_concerns", "concern-1"))));
  await check("Involved user (in involvedUserIds) CAN read concern-1", () =>
    assertSucceeds(getDoc(doc(user, "governance_concerns", "concern-1"))));
  await check("Involved user CANNOT update concern-1 directly (not concerns team)", () =>
    assertFails(updateDoc(doc(user, "governance_concerns", "concern-1"), { summary: "tampered" })));
  await check("Reception (concernsTeam capability) CAN update concern-1", () =>
    assertSucceeds(updateDoc(doc(reception, "governance_concerns", "concern-1"), { summary: "reviewed" })));
  await check("Partner (partnerAccess, read-only) CANNOT update concern-1", () =>
    assertFails(updateDoc(doc(partner, "governance_concerns", "concern-1"), { summary: "tampered" })));

  console.log("\n=== 3b. Concern face-to-face meetings ===");
  const meeting = (extra = {}) => ({ concernId: "concern-1", requestedDate: "2026-09-21", requestedBy: "Patient (AB)", bookedDate: "2026-10-02", bookedTime: "14:30", attendees: "Dr J", outcome: "", furtherRequests: [], ...extra });
  await seed(async (db) => { await setDoc(doc(db, "governance_concern_meetings", "m-seed"), meeting()); });
  await check("Concerns team (Reception) CAN create a meeting", () => assertSucceeds(setDoc(doc(reception, "governance_concern_meetings", "m-new"), meeting())));
  await check("Concerns team CAN update a meeting (record the outcome)", () => assertSucceeds(updateDoc(doc(reception, "governance_concern_meetings", "m-seed"), { outcome: "Agreed summary to be sent", furtherRequests: ["summary"] })));
  await check("Person involved in the case CAN read its meetings", () => assertSucceeds(getDoc(doc(user, "governance_concern_meetings", "m-seed"))));
  await check("Person involved in the case CANNOT create a meeting", () => assertFails(setDoc(doc(user, "governance_concern_meetings", "m-x"), meeting())));
  await check("Person involved in the case CANNOT edit a meeting", () => assertFails(updateDoc(doc(user, "governance_concern_meetings", "m-seed"), { outcome: "tampered" })));
  await check("Partner (oversight) CAN read meetings", () => assertSucceeds(getDoc(doc(partner, "governance_concern_meetings", "m-seed"))));
  await check("Partner CANNOT create or edit a meeting", () => assertFails(setDoc(doc(partner, "governance_concern_meetings", "m-y"), meeting())));
  await check("Uninvolved ReadOnly user CANNOT read a meeting", () => assertFails(getDoc(doc(readonly, "governance_concern_meetings", "m-seed"))));
  await check("Uninvolved ReadOnly user CANNOT create a meeting", () => assertFails(setDoc(doc(readonly, "governance_concern_meetings", "m-z"), meeting())));
  await check("Anonymous CANNOT read a meeting", () => assertFails(getDoc(doc(anon, "governance_concern_meetings", "m-seed"))));
  await check("Concerns team CANNOT delete a meeting (admin only)", () => assertFails(deleteDoc(doc(reception, "governance_concern_meetings", "m-new"))));
  await check("Admin CAN delete a meeting", () => assertSucceeds(deleteDoc(doc(admin, "governance_concern_meetings", "m-new"))));

  console.log("\n=== 4. Custom role 'admin.access' does NOT grant roles/{} writes ===");
  await check("IT custom role (has admin.access) is DENIED writing to roles/{} (System Admin only, by design)", () =>
    assertFails(setDoc(doc(testEnv.authenticatedContext("it-uid").firestore(), "roles", "NewRole"), {
      name: "NewRole", capabilities: ["*"],
    })));

  console.log("\n=== 5. Unauthenticated access ===");
  await check("Anonymous user CANNOT read stock_items", () =>
    assertFails(getDoc(doc(anon, "stock_items", "item-1"))));
  await check("Anonymous user CANNOT read governance_sars", () =>
    assertFails(getDoc(doc(anon, "governance_sars", "sar-1"))));
  await check("Anonymous user CANNOT list roles", () =>
    assertFails(getDoc(doc(anon, "roles", "IT"))));

  console.log("\n=== 6. ClinFlow tenant isolation ('primary' wildcard) ===");
  await check("User at site-a CAN read a record tagged practiceId:'primary' (documented wildcard)", () =>
    assertSucceeds(getDoc(doc(sitea, "clinflow_workflow_records", "rec-primary"))));
  await check("User at site-a CANNOT read a record tagged practiceId:'site-b' (real tenant isolation holds)", () =>
    assertFails(getDoc(doc(sitea, "clinflow_workflow_records", "rec-siteB"))));

  console.log("\n=== 7. Admin-only user management ===");
  await check("Non-admin (User role) CANNOT delete another user's profile", () =>
    assertFails(deleteDoc(doc(user, "users", "readonly-uid"))));
  await check("Non-admin CANNOT self-register with role Practice Manager", () =>
    assertFails(setDoc(doc(testEnv.authenticatedContext("newbie-uid").firestore(), "users", "newbie-uid"), {
      role: "Practice Manager",
    })));
  await check("Stranger with a fresh Auth account CANNOT self-create a User profile (self-signup closed)", () =>
    assertFails(setDoc(doc(testEnv.authenticatedContext("newbie2-uid").firestore(), "users", "newbie2-uid"), {
      role: "User",
    })));

  console.log("\n=== 8. Invites (legacy self-registration) ===");
  await seed(async (db) => {
    await setDoc(doc(db, "invites", "invite-1"), {
      email: "target@example.com", role: "User", displayName: "Target Person",
      createdBy: "admin-uid", createdAt: 1, expiresAt: new Date(Date.now() + 3600_000), used: false,
    });
  });
  await check("Unauthenticated user CANNOT read an invite (legacy flow locked)", () =>
    assertFails(getDoc(doc(anon, "invites", "invite-1"))));
  const inviteSnap = await getDoc(doc(admin, "invites", "invite-1"));
  const inviteExpiresAt = inviteSnap.data().expiresAt;
  await check("Signed-in user with a different email CANNOT claim an invite", () =>
    assertFails(updateDoc(doc(user, "invites", "invite-1"), {
      used: true, usedByUid: "user-uid", email: "target@example.com", role: "User",
      displayName: "Target Person", createdBy: "admin-uid", createdAt: 1,
      expiresAt: inviteExpiresAt,
    })));
  const targetCtx = testEnv.authenticatedContext("target-uid", { email: "target@example.com" }).firestore();
  await check("Even the matching-email invitee CANNOT redeem an invite (legacy flow removed)", () =>
    assertFails(updateDoc(doc(targetCtx, "invites", "invite-1"), {
      used: true, usedByUid: "target-uid", email: "target@example.com", role: "User",
      displayName: "Target Person", createdBy: "admin-uid", createdAt: 1,
      expiresAt: inviteExpiresAt,
    })));

  await check("Admin CAN still create a user profile", () =>
    assertSucceeds(setDoc(doc(admin, "users", "made-by-admin"), { role: "Nurse" })));

  console.log("\n=== 9. Compliance checks (fire, water) and cleaning notes ===");
  const aCheck = (uid, id) => ({ assetId: "asset-wh1", assetCode: "WH-001", result: "pass", actor: { uid, displayName: id }, notes: "" });
  await check("Caretaker CAN record a check as themselves", () =>
    assertSucceeds(setDoc(doc(caretaker, "compliance_checks", "chk-1"), aCheck("caretaker-uid", "Caretaker"))));
  await check("Staff covering the caretaker (Nurse, can record checks) CAN record a check as themselves", () =>
    assertSucceeds(setDoc(doc(nurse, "compliance_checks", "chk-2"), aCheck("nurse-uid", "Nurse"))));
  await check("Caretaker CANNOT record a check in someone else's name", () =>
    assertFails(setDoc(doc(caretaker, "compliance_checks", "chk-3"), aCheck("nurse-uid", "Nurse"))));
  await check("Cleaner CANNOT record a fire or water check (cleaning only)", () =>
    assertFails(setDoc(doc(cleaner, "compliance_checks", "chk-4"), aCheck("cleaner-uid", "Cleaner"))));
  await check("ReadOnly (can view compliance, no check role) CANNOT record a check", () =>
    assertFails(setDoc(doc(readonly, "compliance_checks", "chk-5"), aCheck("readonly-uid", "RO"))));
  await check("Anonymous CANNOT record a check", () =>
    assertFails(setDoc(doc(anon, "compliance_checks", "chk-6"), aCheck("x", "x"))));
  await check("A recorded check cannot be edited afterwards (audit record)", () =>
    assertFails(updateDoc(doc(caretaker, "compliance_checks", "chk-1"), { result: "fail" })));
  await check("Staff who can record checks CAN stamp the asset's last-checked fields", () =>
    assertSucceeds(updateDoc(doc(nurse, "compliance_assets", "asset-wh1"), { lastCheckAt: 1, lastCheckResult: "pass", lastCheckedByUid: "nurse-uid", lastCheckedByName: "Nurse", updatedAt: 1 })));
  await check("...but CANNOT edit the asset itself (label, tag)", () =>
    assertFails(updateDoc(doc(nurse, "compliance_assets", "asset-wh1"), { label: "Renamed", qrPayload: "MEDTRAK:COMPLIANCE:other" })));
  await check("...and CANNOT mix a real edit in with the last-checked fields", () =>
    assertFails(updateDoc(doc(nurse, "compliance_assets", "asset-wh1"), { lastCheckAt: 2, label: "Renamed" })));
  await check("Cleaner CANNOT touch a compliance asset", () =>
    assertFails(updateDoc(doc(cleaner, "compliance_assets", "asset-wh1"), { lastCheckAt: 3 })));
  await check("Caretaker CAN edit a compliance asset", () =>
    assertSucceeds(updateDoc(doc(caretaker, "compliance_assets", "asset-wh1"), { location: "Boiler room" })));
  await check("Cleaner CAN add a note to their own cleaning log", () =>
    assertSucceeds(updateDoc(doc(cleaner, "cleaning_logs", "log-c1"), { notes: "Sink blocked", issueReported: true, notedAt: 1 })));
  await check("...but only once (a second note is refused)", () =>
    assertFails(updateDoc(doc(cleaner, "cleaning_logs", "log-c1"), { notes: "Changed my mind", issueReported: false, notedAt: 2 })));
  await check("Cleaner CANNOT change other parts of their log (who, when, room)", () =>
    assertFails(updateDoc(doc(cleaner, "cleaning_logs", "log-c2"), { notes: "x", roomName: "Other room", cleanedBy: "Someone else" })));
  await check("A different cleaner CANNOT add a note to someone else's log", () =>
    assertFails(updateDoc(doc(cleaner2, "cleaning_logs", "log-c3"), { notes: "x", issueReported: false, notedAt: 1 })));
  await check("Cleaner CANNOT delete a cleaning log", () =>
    assertFails(deleteDoc(doc(cleaner, "cleaning_logs", "log-c4"))));
  await check("Caretaker (not admin) CANNOT delete a cleaning log", () =>
    assertFails(deleteDoc(doc(caretaker, "cleaning_logs", "log-c4"))));
  await check("Admin CAN still correct a cleaning log", () =>
    assertSucceeds(updateDoc(doc(admin, "cleaning_logs", "log-c4"), { notes: "Admin correction" })));
  await check("Admin CAN delete a cleaning log", () =>
    assertSucceeds(deleteDoc(doc(admin, "cleaning_logs", "log-c4"))));

  console.log("\n=== 9b. Emergency kit and anaphylaxis box checks ===");
  const kitCheck = (uid, extra = {}) => ({ results: {}, notes: "", createdAt: serverTimestamp(), createdBy: { uid, name: uid }, ...extra });
  for (const coll of ["emergency_assets", "anaphylaxis_boxes"]) {
    await check(`[${coll}] Nurse (inventory.verify) CAN record a check as themselves`, () =>
      assertSucceeds(setDoc(doc(nurse, coll, "kit-1", "checks", "c-nurse"), kitCheck("nurse-uid"))));
    await check(`[${coll}] Practice Manager CAN record a check`, () =>
      assertSucceeds(setDoc(doc(pm, coll, "kit-1", "checks", "c-pm"), kitCheck("pm-uid"))));
    await check(`[${coll}] Admin CAN record a check`, () =>
      assertSucceeds(setDoc(doc(admin, coll, "kit-1", "checks", "c-admin"), kitCheck("admin-uid"))));
    await check(`[${coll}] ReadOnly (no inventory.verify) CANNOT record a check`, () =>
      assertFails(setDoc(doc(readonly, coll, "kit-1", "checks", "c-ro"), kitCheck("readonly-uid"))));
    await check(`[${coll}] Reception CANNOT record a check`, () =>
      assertFails(setDoc(doc(reception, coll, "kit-1", "checks", "c-rec"), kitCheck("reception-uid"))));
    await check(`[${coll}] Partner CANNOT record a check`, () =>
      assertFails(setDoc(doc(partner, coll, "kit-1", "checks", "c-par"), kitCheck("partner-uid"))));
    await check(`[${coll}] Anonymous CANNOT record a check`, () =>
      assertFails(setDoc(doc(anon, coll, "kit-1", "checks", "c-anon"), kitCheck("anon"))));
    await check(`[${coll}] A check CANNOT be signed in someone else's name`, () =>
      assertFails(setDoc(doc(nurse, coll, "kit-1", "checks", "c-forge"), kitCheck("admin-uid"))));
    await check(`[${coll}] A check CANNOT be back-dated (createdAt must be the server's time)`, () =>
      assertFails(setDoc(doc(nurse, coll, "kit-1", "checks", "c-old"), kitCheck("nurse-uid", { createdAt: new Date("2020-01-01") }))));
    await check(`[${coll}] A recorded check CANNOT be edited, even by an admin`, () =>
      assertFails(updateDoc(doc(admin, coll, "kit-1", "checks", "c-nurse"), { notes: "changed" })));
    await check(`[${coll}] A recorded check CANNOT be deleted, even by an admin`, () =>
      assertFails(deleteDoc(doc(admin, coll, "kit-1", "checks", "c-nurse"))));
    await check(`[${coll}] ReadOnly CAN still read the checks`, () =>
      assertSucceeds(getDoc(doc(readonly, coll, "kit-1", "checks", "c-nurse"))));
    await check(`[${coll}] Nurse CANNOT create or edit the kit itself (needs inventory.delete)`, () =>
      assertFails(setDoc(doc(nurse, coll, "kit-2"), { name: "Sneaky kit", items: [] })));
    await check(`[${coll}] ReadOnly CANNOT create the kit`, () =>
      assertFails(setDoc(doc(readonly, coll, "kit-2"), { name: "Sneaky kit", items: [] })));
    await check(`[${coll}] Practice Manager CAN create the kit`, () =>
      assertSucceeds(setDoc(doc(pm, coll, "kit-pm"), { name: "PM kit", items: [] })));
    await check(`[${coll}] Practice Manager CAN edit the kit`, () =>
      assertSucceeds(updateDoc(doc(pm, coll, "kit-pm"), { name: "PM kit renamed" })));
    await check(`[${coll}] Nurse CANNOT delete the kit`, () =>
      assertFails(deleteDoc(doc(nurse, coll, "kit-pm"))));
    await check(`[${coll}] Practice Manager CAN delete the kit`, () =>
      assertSucceeds(deleteDoc(doc(pm, coll, "kit-pm"))));
    await check(`[${coll}] Admin CAN create the kit`, () =>
      assertSucceeds(setDoc(doc(admin, coll, "kit-admin"), { name: "Admin kit", items: [] })));
  }

  console.log("\n=== 9c. Permanently deleting stock items (inventory.purge) ===");
  await check("Admin CAN permanently delete a stock item", () =>
    assertSucceeds(deleteDoc(doc(admin, "stock_items", "purge-admin"))));
  await check("A custom role granted inventory.purge CAN permanently delete a stock item", () =>
    assertSucceeds(deleteDoc(doc(stockctl, "stock_items", "purge-ctl"))));
  await check("...and CAN release that item's barcode entry as part of it", () =>
    assertSucceeds(deleteDoc(doc(stockctl, "stock_barcodes", "bc-purge-ctl"))));
  await check("...but that purge-only role CANNOT edit stock (the permission is delete-only)", () =>
    assertFails(updateDoc(doc(stockctl, "stock_items", "purge-ctl-edit"), { current_stock: 99 })));
  await check("Practice Manager (can archive, no inventory.purge) CANNOT permanently delete", () =>
    assertFails(deleteDoc(doc(pm, "stock_items", "purge-pm"))));
  await check("Nurse (can edit stock, no inventory.purge) CANNOT permanently delete", () =>
    assertFails(deleteDoc(doc(nurse, "stock_items", "purge-nurse"))));
  await check("ReadOnly CANNOT permanently delete", () =>
    assertFails(deleteDoc(doc(readonly, "stock_items", "purge-ro"))));
  await check("Anonymous CANNOT permanently delete", () =>
    assertFails(deleteDoc(doc(anon, "stock_items", "purge-anon"))));
  await check("Archiving still works for Practice Manager (inventory.write), unaffected by the new permission", () =>
    assertSucceeds(updateDoc(doc(pm, "stock_items", "purge-pm"), { archived_at: 1 })));
  await check("A role without inventory.purge or inventory.write cannot delete a barcode entry", () =>
    assertFails(deleteDoc(doc(readonly, "stock_barcodes", "bc-purge-nurse"))));

  console.log("\n=== 10. Storage: stock item photos (storage.rules) ===");
  // storage.rules ports firestore.rules' capability check directly, so this
  // proves that port actually works against the real Storage emulator - a
  // syntax slip there wouldn't show up in any Firestore check above.
  const adminStorage = testEnv.authenticatedContext("admin-uid").storage();
  const nurseStorage = testEnv.authenticatedContext("nurse-uid").storage();
  const readonlyStorage = testEnv.authenticatedContext("readonly-uid").storage();
  const anonStorage = testEnv.unauthenticatedContext().storage();
  const stockctlStorage = testEnv.authenticatedContext("stockctl-uid").storage();
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const tooBig = new Uint8Array(9 * 1024 * 1024);

  await check("Nurse (inventory.write) CAN upload a stock photo", () =>
    assertSucceeds(uploadBytes(ref(nurseStorage, "stock_photos/item-1/a.jpg"), jpeg, { contentType: "image/jpeg" })));
  await check("Admin CAN upload a stock photo", () =>
    assertSucceeds(uploadBytes(ref(adminStorage, "stock_photos/item-2/a.jpg"), jpeg, { contentType: "image/jpeg" })));
  await check("ReadOnly (no inventory.write) CANNOT upload a stock photo", () =>
    assertFails(uploadBytes(ref(readonlyStorage, "stock_photos/item-3/a.jpg"), jpeg, { contentType: "image/jpeg" })));
  await check("Anonymous CANNOT upload a stock photo", () =>
    assertFails(uploadBytes(ref(anonStorage, "stock_photos/item-4/a.jpg"), jpeg, { contentType: "image/jpeg" })));
  await check("Upload over the 8MB cap is refused, even for an allowed role", () =>
    assertFails(uploadBytes(ref(nurseStorage, "stock_photos/item-5/a.jpg"), tooBig, { contentType: "image/jpeg" })));
  await check("A non-image file is refused, even for an allowed role", () =>
    assertFails(uploadBytes(ref(nurseStorage, "stock_photos/item-6/a.txt"), new TextEncoder().encode("not a photo"), { contentType: "text/plain" })));
  await check("ReadOnly CAN read a stock photo that already exists", () =>
    assertSucceeds(getBytes(ref(readonlyStorage, "stock_photos/item-1/a.jpg"))));
  await check("Anonymous CANNOT read a stock photo", () =>
    assertFails(getBytes(ref(anonStorage, "stock_photos/item-1/a.jpg"))));
  await check("ReadOnly CANNOT delete a stock photo", () =>
    assertFails(deleteObject(ref(readonlyStorage, "stock_photos/item-1/a.jpg"))));
  await check("Nurse CAN delete (replace) a stock photo", () =>
    assertSucceeds(deleteObject(ref(nurseStorage, "stock_photos/item-1/a.jpg"))));
  await check("A custom role granted inventory.purge CAN delete a stock photo (when removing the item)", async () => {
    await assertSucceeds(uploadBytes(ref(nurseStorage, "stock_photos/item-9/a.jpg"), jpeg, { contentType: "image/jpeg" }));
    await assertSucceeds(deleteObject(ref(stockctlStorage, "stock_photos/item-9/a.jpg")));
  });
  await check("...but that role CANNOT upload a photo", () =>
    assertFails(uploadBytes(ref(stockctlStorage, "stock_photos/item-10/a.jpg"), jpeg, { contentType: "image/jpeg" })));
  await check("Everywhere outside stock_photos/ is closed, even to an admin", () =>
    assertFails(uploadBytes(ref(adminStorage, "some_other_path/a.jpg"), jpeg, { contentType: "image/jpeg" })));

  console.log("\n=== 12. Sign-in and activity report (usage_sessions) ===");
  await check("Admin CAN read a sign-in session", () => assertSucceeds(getDoc(doc(admin, "usage_sessions", "user-uid_sess-00000001"))));
  await check("An audit reader CAN read a sign-in session", () => assertSucceeds(getDoc(doc(auditor, "usage_sessions", "user-uid_sess-00000001"))));
  await check("...but not another practice's session", () => assertFails(getDoc(doc(auditor, "usage_sessions", "other-uid_sess-00000002"))));
  await check("A normal user CANNOT read their own session record", () => assertFails(getDoc(doc(user, "usage_sessions", "user-uid_sess-00000001"))));
  await check("Practice Manager (holds audit.read, like the audit ledger) CAN read sessions", () => assertSucceeds(getDoc(doc(pm, "usage_sessions", "user-uid_sess-00000001"))));
  await check("A nurse (no audit.read) CANNOT read sessions", () => assertFails(getDoc(doc(nurse, "usage_sessions", "user-uid_sess-00000001"))));
  await check("Anonymous CANNOT read sessions", () => assertFails(getDoc(doc(anon, "usage_sessions", "user-uid_sess-00000001"))));
  await check("A user CANNOT write a session record (the server does)", () =>
    assertFails(setDoc(doc(user, "usage_sessions", "user-uid_sess-00000003"), { uid: "user-uid", practiceId: "primary", activeSeconds: 999999 })));
  await check("A user CANNOT edit or erase their own session record", async () => {
    await assertFails(updateDoc(doc(user, "usage_sessions", "user-uid_sess-00000001"), { activeSeconds: 0 }));
    await assertFails(deleteDoc(doc(user, "usage_sessions", "user-uid_sess-00000001")));
  });
  await check("Not even an admin or audit reader can write or erase a session record", async () => {
    await assertFails(setDoc(doc(admin, "usage_sessions", "admin-uid_sess-00000004"), { uid: "admin-uid", practiceId: "primary" }));
    await assertFails(updateDoc(doc(auditor, "usage_sessions", "user-uid_sess-00000001"), { activeSeconds: 0 }));
    await assertFails(deleteDoc(doc(admin, "usage_sessions", "user-uid_sess-00000001")));
  });

  console.log("\n=== 13. Orb language assistant (settings/orb, orb_ai_usage) ===");
  await check("Admin CAN read the Orb's usage counters", () => assertSucceeds(getDoc(doc(admin, "orb_ai_usage", "all_20261006"))));
  await check("A normal user CANNOT read usage counters", () => assertFails(getDoc(doc(user, "orb_ai_usage", "all_20261006"))));
  await check("Nobody can write the usage counters (the server does)", async () => {
    await assertFails(setDoc(doc(user, "orb_ai_usage", "all_20261006"), { count: 0 }));
    await assertFails(setDoc(doc(admin, "orb_ai_usage", "all_20261006"), { count: 0 }));
    await assertFails(deleteDoc(doc(admin, "orb_ai_usage", "all_20261006")));
  });
  await check("Admin CAN turn the language assistant on", () => assertSucceeds(setDoc(doc(admin, "settings", "orb"), { aiRouting: true }, { merge: true })));
  await check("A normal user CANNOT turn it on", () => assertFails(setDoc(doc(user, "settings", "orb"), { aiRouting: true }, { merge: true })));
  await check("Practice Manager (not System Admin) CANNOT turn it on", () => assertFails(setDoc(doc(pm, "settings", "orb"), { aiRouting: true }, { merge: true })));

  console.log("\n=== 14. Significant events ===");
  const newEvent = (uid, extra = {}) => ({
    reference: "SE-NEW", status: "reported", investigation: "pending", title: "T", description: "d", eventDate: "2026-10-01",
    category: "other", harm: "none", patientInvolved: false, reportedByUid: uid, reportedByName: "X", ...extra,
  });
  await check("Anyone signed in can report an event as themselves", () =>
    assertSucceeds(setDoc(doc(bystander, "governance_significant_events", "se-new-1"), newEvent("bystander-uid"))));
  await check("...but not as someone else", () =>
    assertFails(setDoc(doc(bystander, "governance_significant_events", "se-new-2"), newEvent("reporter-uid"))));
  await check("...not already at a later stage", () =>
    assertFails(setDoc(doc(bystander, "governance_significant_events", "se-new-3"), newEvent("bystander-uid", { status: "closed" }))));
  await check("...not giving themselves a lead", () =>
    assertFails(setDoc(doc(bystander, "governance_significant_events", "se-new-4"), newEvent("bystander-uid", { leadUid: "bystander-uid" }))));
  await check("...not with reviewers or other fields the form does not have", () =>
    assertFails(setDoc(doc(bystander, "governance_significant_events", "se-new-5"), newEvent("bystander-uid", { reviewerUids: ["bystander-uid"] }))));
  await check("Signed-out people cannot report", () =>
    assertFails(setDoc(doc(anon, "governance_significant_events", "se-new-6"), newEvent("anon"))));
  await check("The reporter can read their own event", () =>
    assertSucceeds(getDoc(doc(reporter, "governance_significant_events", "se-1"))));
  await check("A bystander cannot read someone else's event", () =>
    assertFails(getDoc(doc(bystander, "governance_significant_events", "se-1"))));
  await check("A bystander can list only their own (query by reporter)", () =>
    assertSucceeds(getDocs(query(collection(bystander, "governance_significant_events"), where("reportedByUid", "==", "bystander-uid")))));
  await check("A bystander cannot list everything", () =>
    assertFails(getDocs(collection(bystander, "governance_significant_events"))));
  await check("The investigation lead and a named reviewer can read it", async () => {
    await assertSucceeds(getDoc(doc(lead, "governance_significant_events", "se-1")));
    await assertSucceeds(getDoc(doc(reviewer, "governance_significant_events", "se-1")));
  });
  await check("Practice Manager (SE team) and a partner (oversight) can read it", async () => {
    await assertSucceeds(getDoc(doc(pm, "governance_significant_events", "se-1")));
    await assertSucceeds(getDoc(doc(partner, "governance_significant_events", "se-1")));
  });
  await check("The reporter cannot change the event after reporting", () =>
    assertFails(updateDoc(doc(reporter, "governance_significant_events", "se-1"), { harm: "none" })));
  await check("A reviewer cannot change the event", () =>
    assertFails(updateDoc(doc(reviewer, "governance_significant_events", "se-1"), { status: "closed" })));
  await check("The lead cannot jump to closed or re-assign the lead", async () => {
    await assertFails(updateDoc(doc(lead, "governance_significant_events", "se-1"), { status: "closed" }));
    await assertFails(updateDoc(doc(lead, "governance_significant_events", "se-1"), { leadUid: "bystander-uid" }));
  });
  await check("The lead can record findings and finish the investigation", () =>
    assertSucceeds(updateDoc(doc(lead, "governance_significant_events", "se-1"), { findings: { cause: "x" }, status: "in_review" })));
  await check("The SE team can move it on", () =>
    assertSucceeds(updateDoc(doc(pm, "governance_significant_events", "se-1"), { status: "awaiting_meeting" })));
  await check("Only an administrator can delete an event", async () => {
    await assertFails(deleteDoc(doc(pm, "governance_significant_events", "se-1")));
    await assertSucceeds(deleteDoc(doc(admin, "governance_significant_events", "se-new-1")));
  });

  await check("A reviewer can read and complete their own review, but not anyone else's", async () => {
    await assertSucceeds(getDoc(doc(reviewer, "governance_se_reviews", "se-1_reviewer-uid")));
    await assertFails(getDoc(doc(reviewer, "governance_se_reviews", "se-1_other-uid")));
    await assertSucceeds(updateDoc(doc(reviewer, "governance_se_reviews", "se-1_reviewer-uid"), { summary: "My view", status: "submitted" }));
    await assertFails(updateDoc(doc(reviewer, "governance_se_reviews", "se-1_other-uid"), { summary: "Not mine", status: "submitted" }));
  });
  await check("A reviewer cannot change who the review is for", () =>
    assertFails(updateDoc(doc(reviewer, "governance_se_reviews", "se-1_reviewer-uid"), { reviewerUid: "other-uid" })));
  await check("Only the SE team can ask for reviews", async () => {
    await assertFails(setDoc(doc(bystander, "governance_se_reviews", "se-1_bystander-uid"), { seId: "se-1", reviewerUid: "bystander-uid", status: "requested" }));
    await assertSucceeds(setDoc(doc(pm, "governance_se_reviews", "se-1_lead-uid"), { seId: "se-1", reviewerUid: "lead-uid", status: "requested" }));
  });

  await check("Meeting minutes: team and attendees can read them; others cannot", async () => {
    await assertSucceeds(getDoc(doc(pm, "governance_se_meetings", "meet-1")));
    await assertSucceeds(getDoc(doc(reviewer, "governance_se_meetings", "meet-1")));
    await assertFails(getDoc(doc(bystander, "governance_se_meetings", "meet-1")));
  });
  await check("Only the SE team can write minutes", async () => {
    await assertFails(updateDoc(doc(reviewer, "governance_se_meetings", "meet-1"), { minutes: "edited" }));
    await assertSucceeds(updateDoc(doc(pm, "governance_se_meetings", "meet-1"), { minutes: "Agreed." }));
  });

  await check("An action's owner can mark it done, and only that", async () => {
    await assertSucceeds(updateDoc(doc(reviewer, "governance_se_actions", "act-1"), { status: "done", completedByName: "Reviewer" }));
    await assertFails(updateDoc(doc(reviewer, "governance_se_actions", "act-1"), { ownerUid: "bystander-uid" }));
    await assertFails(updateDoc(doc(reviewer, "governance_se_actions", "act-2"), { status: "done" }));
  });
  await check("Others cannot read or create actions", async () => {
    await assertFails(getDoc(doc(bystander, "governance_se_actions", "act-1")));
    await assertFails(setDoc(doc(bystander, "governance_se_actions", "act-x"), { title: "x", ownerUid: "bystander-uid" }));
    await assertSucceeds(setDoc(doc(pm, "governance_se_actions", "act-y"), { seId: "se-1", title: "y", ownerUid: "lead-uid", status: "open" }));
  });

  await check("Timeline: the reporter can add a note to their own event; a bystander cannot; no forged stage changes", async () => {
    await assertSucceeds(addDoc(collection(reporter, "governance_se_timeline"), { seId: "se-1", type: "note", title: "Note", message: "more detail" }));
    await assertFails(addDoc(collection(bystander, "governance_se_timeline"), { seId: "se-1", type: "note", title: "Note", message: "x" }));
    await assertFails(addDoc(collection(reporter, "governance_se_timeline"), { seId: "se-1", type: "stage", title: "Forged stage change" }));
  });
  await check("Timeline entries can never be edited or removed", async () => {
    await seed(async (db) => setDoc(doc(db, "governance_se_timeline", "tl-1"), { seId: "se-1", type: "note" }));
    await assertFails(updateDoc(doc(pm, "governance_se_timeline", "tl-1"), { message: "changed" }));
    await assertFails(deleteDoc(doc(admin, "governance_se_timeline", "tl-1")));
  });

  await check("Stock review: anyone who can see stock reads it, nobody writes it; people who verify stock set its thresholds", async () => {
    await seed(async (db) => setDoc(doc(db, "stock_reviews", "latest"), { dormant: [], overstocked: [], understocked: [] }));
    await assertSucceeds(getDoc(doc(nurse, "stock_reviews", "latest")));
    await assertFails(getDoc(doc(caretaker, "stock_reviews", "latest")));
    await assertFails(setDoc(doc(pm, "stock_reviews", "latest"), { dormant: [] }));
    await assertFails(setDoc(doc(admin, "stock_reviews", "latest"), { dormant: [] }));
    await assertSucceeds(setDoc(doc(pm, "settings", "stockReview"), { dormantDays: 120 }));
    await assertFails(setDoc(doc(reception, "settings", "stockReview"), { dormantDays: 1 }));
  });
  await check("Names taught to the Orb: people who verify stock can set them, others cannot", async () => {
    await assertSucceeds(setDoc(doc(pm, "settings", "orbAliases"), { aliases: [{ say: "emergency injector", means: "adrenaline" }] }));
    await assertFails(setDoc(doc(reception, "settings", "orbAliases"), { aliases: [] }));
    await assertSucceeds(getDoc(doc(reception, "settings", "orbAliases")));
  });
  await check("The SE team can set the default reviewer roles; an ordinary user cannot; the team cannot touch other settings", async () => {
    await assertSucceeds(setDoc(doc(pm, "settings", "significantEvents"), { reviewerRoles: ["Practice Manager"] }));
    await assertFails(setDoc(doc(bystander, "settings", "significantEvents"), { reviewerRoles: [] }));
    await assertFails(setDoc(doc(pm, "settings", "orb"), { aiRouting: true }));
  });

  await check("Fridges: the Practice Manager and admins set them up; a nurse lead only once the role is ticked for fridge alerts; others never", async () => {
    await assertSucceeds(setDoc(doc(pm, "temperature_units", "unit-pm"), { unitName: "Medicine fridge", rangeMin: 2, rangeMax: 8 }));
    await assertSucceeds(setDoc(doc(admin, "temperature_units", "unit-admin"), { unitName: "Freezer", rangeMin: -25, rangeMax: -15 }));
    await assertFails(setDoc(doc(reception, "temperature_units", "unit-rec"), { unitName: "x" }));
    await assertFails(setDoc(doc(reporter, "temperature_units", "unit-hca"), { unitName: "x" }));
    // before the setting exists, or while the role is not ticked, the nurse lead cannot
    await assertFails(setDoc(doc(nursemgr, "temperature_units", "unit-nm"), { unitName: "x" }));
    await assertSucceeds(setDoc(doc(pm, "settings", "fridgeAlerts"), { roles: ["Practice Manager"] }));
    await assertFails(setDoc(doc(nursemgr, "temperature_units", "unit-nm"), { unitName: "x" }));
    await assertSucceeds(setDoc(doc(pm, "settings", "fridgeAlerts"), { roles: ["Practice Manager", "Nurse Manager"] }));
    await assertSucceeds(setDoc(doc(nursemgr, "temperature_units", "unit-nm"), { unitName: "Nurse fridge", rangeMin: 2, rangeMax: 8 }));
    await assertSucceeds(updateDoc(doc(nursemgr, "temperature_units", "unit-nm"), { rangeMax: 7 }));
    await assertFails(setDoc(doc(nurse, "temperature_units", "unit-n"), { unitName: "x" }));
    await assertFails(deleteDoc(doc(pm, "temperature_units", "unit-pm")));
    await assertSucceeds(deleteDoc(doc(admin, "temperature_units", "unit-admin")));
  });
  await check("Who is told about fridge incidents: everyone can read it, only the Practice Manager and admins set it (not the nurse lead who is ticked)", async () => {
    await assertSucceeds(getDoc(doc(reporter, "settings", "fridgeAlerts")));
    await assertSucceeds(setDoc(doc(admin, "settings", "fridgeAlerts"), { roles: ["Practice Manager"] }));
    await assertFails(setDoc(doc(nursemgr, "settings", "fridgeAlerts"), { roles: ["Nurse Manager", "HCA"] }));
    await assertFails(setDoc(doc(reception, "settings", "fridgeAlerts"), { roles: [] }));
  });
  await check("Fridge incidents: anyone who records temperatures can raise one; only those who can resolve them take action on it", async () => {
    await assertSucceeds(setDoc(doc(reporter, "temperature_incidents", "inc-hca"), { unitId: "unit-1", unitName: "Vaccine fridge", status: "open", openedByUid: "reporter-uid" }));
    await assertFails(setDoc(doc(reception, "temperature_incidents", "inc-rec"), { unitId: "unit-1", status: "open" }));
    await assertFails(updateDoc(doc(reporter, "temperature_incidents", "inc-1"), { status: "resolved" }));
    await assertFails(updateDoc(doc(reporter, "temperature_incidents", "inc-1"), { quarantined: false }));
    await assertSucceeds(updateDoc(doc(nursemgr, "temperature_incidents", "inc-1"), { quarantined: true, quarantinedBy: "Nurse Manager" }));
    await assertSucceeds(updateDoc(doc(pm, "temperature_incidents", "inc-1"), { status: "resolved", resolvedBy: "PM" }));
    await assertFails(deleteDoc(doc(nursemgr, "temperature_incidents", "inc-1")));
  });

  console.log("\n=== 18. Failed compliance checks (compliance_incidents) ===");
  const incidentDoc = (uid, extra = {}) => ({ assetId: "asset-wh1", assetCode: "WH-001", assetLabel: "Hot tap", status: "open", openedByUid: uid, openedBy: "X", actions: [], ...extra });
  await check("Caretaker and a nurse (who can record checks) CAN open an incident as themselves", async () => {
    await assertSucceeds(setDoc(doc(caretaker, "compliance_incidents", "ci-1"), incidentDoc("caretaker-uid")));
    await assertSucceeds(setDoc(doc(nurse, "compliance_incidents", "ci-2"), incidentDoc("nurse-uid")));
  });
  await check("...but not in someone else's name, already closed, or with actions already filled in", async () => {
    await assertFails(setDoc(doc(nurse, "compliance_incidents", "ci-x1"), incidentDoc("caretaker-uid")));
    await assertFails(setDoc(doc(nurse, "compliance_incidents", "ci-x2"), incidentDoc("nurse-uid", { status: "resolved" })));
    await assertFails(setDoc(doc(nurse, "compliance_incidents", "ci-x3"), incidentDoc("nurse-uid", { actions: [{ key: "repaired" }] })));
  });
  await check("An HCA, a cleaner, a partner and anonymous cannot open one", async () => {
    await assertFails(setDoc(doc(reporter, "compliance_incidents", "ci-x4"), incidentDoc("reporter-uid")));
    await assertFails(setDoc(doc(cleaner, "compliance_incidents", "ci-x5"), incidentDoc("cleaner-uid")));
    await assertFails(setDoc(doc(partner, "compliance_incidents", "ci-x6"), incidentDoc("partner-uid")));
    await assertFails(setDoc(doc(anon, "compliance_incidents", "ci-x7"), incidentDoc("x")));
  });
  await check("Caretaker, practice manager and a nurse can read them; a cleaner, a partner and anonymous cannot", async () => {
    for (const who of [caretaker, pm, nurse]) await assertSucceeds(getDoc(doc(who, "compliance_incidents", "ci-1")));
    for (const who of [cleaner, partner, anon]) await assertFails(getDoc(doc(who, "compliance_incidents", "ci-1")));
  });
  await check("Caretaker and practice manager CAN record actions and close it; a nurse cannot", async () => {
    await assertSucceeds(updateDoc(doc(caretaker, "compliance_incidents", "ci-1"), { actions: [{ key: "flushed", by: "Caretaker" }] }));
    await assertSucceeds(updateDoc(doc(pm, "compliance_incidents", "ci-1"), { status: "resolved", resolvedBy: "PM" }));
    await assertFails(updateDoc(doc(nurse, "compliance_incidents", "ci-2"), { status: "resolved" }));
    await assertFails(updateDoc(doc(nurse, "compliance_incidents", "ci-2"), { actions: [{ key: "other" }] }));
  });
  await check("Nobody except an administrator deletes an incident", async () => {
    await assertFails(deleteDoc(doc(pm, "compliance_incidents", "ci-1")));
    await assertFails(deleteDoc(doc(caretaker, "compliance_incidents", "ci-2")));
    await assertSucceeds(deleteDoc(doc(admin, "compliance_incidents", "ci-2")));
  });

  console.log("\n=== 19. Maintenance issues (maintenance_issues) ===");
  const issueDoc = (uid, extra = {}) => ({ title: "Hand dryer not working", roomName: "Staff toilet", priority: "medium", status: "open", reportedByUid: uid, reportedBy: "X", updates: [], ...extra });
  await check("Anyone signed in with a role CAN report an issue as themselves", async () => {
    await assertSucceeds(setDoc(doc(cleaner, "maintenance_issues", "mi-1"), issueDoc("cleaner-uid")));
    await assertSucceeds(setDoc(doc(reception, "maintenance_issues", "mi-2"), issueDoc("reception-uid")));
    await assertSucceeds(setDoc(doc(nurse, "maintenance_issues", "mi-3"), issueDoc("nurse-uid")));
    await assertSucceeds(setDoc(doc(reporter, "maintenance_issues", "mi-4"), issueDoc("reporter-uid")));
  });
  await check("...but not as someone else, already closed, with no description, or an essay", async () => {
    await assertFails(setDoc(doc(nurse, "maintenance_issues", "mi-x1"), issueDoc("cleaner-uid")));
    await assertFails(setDoc(doc(nurse, "maintenance_issues", "mi-x2"), issueDoc("nurse-uid", { status: "closed" })));
    await assertFails(setDoc(doc(nurse, "maintenance_issues", "mi-x3"), issueDoc("nurse-uid", { title: "" })));
    await assertFails(setDoc(doc(nurse, "maintenance_issues", "mi-x4"), issueDoc("nurse-uid", { title: "x".repeat(401) })));
    await assertFails(setDoc(doc(anon, "maintenance_issues", "mi-x5"), issueDoc("x")));
  });
  await check("Cleaner, reception, nurse, caretaker and practice manager can read the list; a partner and anonymous cannot", async () => {
    for (const who of [cleaner, reception, nurse, caretaker, pm]) await assertSucceeds(getDoc(doc(who, "maintenance_issues", "mi-1")));
    for (const who of [partner, anon]) await assertFails(getDoc(doc(who, "maintenance_issues", "mi-1")));
  });
  await check("Only the caretaker and practice manager work an issue; the person who raised it, a cleaner and a nurse cannot change it", async () => {
    await assertSucceeds(updateDoc(doc(caretaker, "maintenance_issues", "mi-1"), { status: "in_progress", startedBy: "Caretaker" }));
    await assertSucceeds(updateDoc(doc(pm, "maintenance_issues", "mi-1"), { status: "closed", closedBy: "PM" }));
    await assertFails(updateDoc(doc(cleaner, "maintenance_issues", "mi-2"), { status: "closed" }));
    await assertFails(updateDoc(doc(reception, "maintenance_issues", "mi-2"), { status: "closed" }));
    await assertFails(updateDoc(doc(nurse, "maintenance_issues", "mi-3"), { status: "closed" }));
  });
  await check("Nobody except an administrator deletes an issue", async () => {
    await assertFails(deleteDoc(doc(pm, "maintenance_issues", "mi-1")));
    await assertFails(deleteDoc(doc(caretaker, "maintenance_issues", "mi-1")));
    await assertSucceeds(deleteDoc(doc(admin, "maintenance_issues", "mi-1")));
  });

  console.log("\n=== 20. Certificates and servicing register (compliance_certificates and compliance_certs files) ===");
  const certDoc = (extra = {}) => ({ type: "gas_safety", site: "Main Surgery", provider: "Gas Safe Ltd", completedOn: "2026-03-01", expiryDate: "2027-03-01", certUrl: "", active: true, previous: [], ...extra });
  await check("Caretaker and practice manager CAN add a certificate", async () => {
    await assertSucceeds(setDoc(doc(caretaker, "compliance_certificates", "cert-1"), certDoc()));
    await assertSucceeds(setDoc(doc(pm, "compliance_certificates", "cert-2"), certDoc({ type: "eicr" })));
  });
  await check("A nurse, a cleaner, a partner, reception and anonymous cannot add or change one", async () => {
    for (const who of [nurse, cleaner, partner, reception, anon]) {
      await assertFails(setDoc(doc(who, "compliance_certificates", "cert-x"), certDoc()));
    }
    await assertFails(updateDoc(doc(nurse, "compliance_certificates", "cert-1"), { expiryDate: "2099-01-01" }));
  });
  await check("A certificate must have a type, an expiry date and a history list", async () => {
    await assertFails(setDoc(doc(caretaker, "compliance_certificates", "cert-b1"), certDoc({ type: 5 })));
    await assertFails(setDoc(doc(caretaker, "compliance_certificates", "cert-b2"), certDoc({ expiryDate: null })));
    await assertFails(setDoc(doc(caretaker, "compliance_certificates", "cert-b3"), certDoc({ previous: "none" })));
  });
  await check("Anyone with compliance access (caretaker, practice manager, nurse) can read the register; a cleaner, a partner and anonymous cannot", async () => {
    for (const who of [caretaker, pm, nurse]) await assertSucceeds(getDoc(doc(who, "compliance_certificates", "cert-1")));
    for (const who of [cleaner, partner, anon]) await assertFails(getDoc(doc(who, "compliance_certificates", "cert-1")));
  });
  await check("The caretaker records a renewal; nobody except an administrator deletes a certificate", async () => {
    await assertSucceeds(updateDoc(doc(caretaker, "compliance_certificates", "cert-1"), { expiryDate: "2028-03-01", previous: [{ expiryDate: "2027-03-01" }] }));
    await assertFails(deleteDoc(doc(pm, "compliance_certificates", "cert-1")));
    await assertFails(deleteDoc(doc(caretaker, "compliance_certificates", "cert-1")));
    await assertSucceeds(deleteDoc(doc(admin, "compliance_certificates", "cert-2")));
  });
  const certCaretaker = testEnv.authenticatedContext("caretaker-uid").storage();
  const certPm = testEnv.authenticatedContext("pm-uid").storage();
  const certCleaner = testEnv.authenticatedContext("cleaner-uid").storage();
  const certPartner = testEnv.authenticatedContext("partner-uid").storage();
  const certPdf = new TextEncoder().encode("%PDF-1.4 certificate");
  await check("Caretaker and practice manager CAN upload a certificate PDF; others cannot, and only PDFs under 15MB", async () => {
    await assertSucceeds(uploadBytes(ref(certCaretaker, "compliance_certs/cert-1/a.pdf"), certPdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(certPm, "compliance_certs/cert-1/b.pdf"), certPdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(nurseStorage, "compliance_certs/cert-1/c.pdf"), certPdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(certCleaner, "compliance_certs/cert-1/c.pdf"), certPdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(certCaretaker, "compliance_certs/cert-1/d.png"), new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(certCaretaker, "compliance_certs/cert-1/e.pdf"), new Uint8Array(16 * 1024 * 1024), { contentType: "application/pdf" }));
  });
  await check("Compliance readers can open a certificate PDF; a cleaner, a partner and anonymous cannot", async () => {
    for (const who of [certCaretaker, certPm, nurseStorage]) await assertSucceeds(getBytes(ref(who, "compliance_certs/cert-1/a.pdf")));
    for (const who of [certCleaner, certPartner, anonStorage]) await assertFails(getBytes(ref(who, "compliance_certs/cert-1/a.pdf")));
  });
  await check("Only the people who manage certificates can delete a certificate PDF", async () => {
    await assertFails(deleteObject(ref(nurseStorage, "compliance_certs/cert-1/a.pdf")));
    await assertSucceeds(deleteObject(ref(certCaretaker, "compliance_certs/cert-1/a.pdf")));
  });

  console.log("\n=== 17. ClinFlow switch (practice_config.moduleToggles.clinflow) ===");
  const setClinflow = (value) => seed(async (db) => (value === undefined ? deleteDoc(doc(db, "practice_config", "main")) : setDoc(doc(db, "practice_config", "main"), { moduleToggles: { clinflow: value } })));
  const readRecord = (who) => getDoc(doc(who, "clinflow_workflow_records", "rec-primary"));
  await check("Switched off for everyone except the developer: staff cannot read ClinFlow records, the developer can", async () => {
    await setClinflow({ disabled: true, allowUids: ["admin-uid"] });
    for (const who of [nurse, pm, user, reception, sitea, partner, readonly]) await assertFails(readRecord(who));
    await assertSucceeds(readRecord(admin));
  });
  await check("Switched off: staff cannot write ClinFlow records either", async () => {
    const rec = { dataMode: "synthetic", practiceId: "primary", siteId: "SITE-MAIN", status: "new", createdByUid: "nurse-uid", archived: false, schemaVersion: 1 };
    await assertFails(setDoc(doc(nurse, "clinflow_workflow_records", "rec-new-n"), rec));
    await assertFails(setDoc(doc(pm, "clinflow_workflow_records", "rec-new-p"), { ...rec, createdByUid: "pm-uid" }));
  });
  await check("Switched off: even another System Admin who is not on the allow-list cannot read it", async () => {
    await seed(async (db) => setDoc(doc(db, "users", "admin2-uid"), { role: "System Admin", displayName: "Admin Two" }));
    await assertFails(readRecord(testEnv.authenticatedContext("admin2-uid").firestore()));
  });
  await check("Never set (a practice that has not touched it): ClinFlow is off for everyone", async () => {
    await setClinflow(undefined);
    for (const who of [nurse, pm, admin]) await assertFails(readRecord(who));
    await setClinflow({});
    await assertFails(readRecord(pm));
  });
  await check("Deliberately switched on for everyone: staff with ClinFlow access can read it again, others still cannot", async () => {
    await setClinflow({ disabled: false, allowUids: [] });
    await assertSucceeds(readRecord(nurse));
    await assertSucceeds(readRecord(pm));
    await assertFails(readRecord(cleaner));
    await assertFails(readRecord(anon));
  });
  await check("A malformed allow-list allows no one", async () => {
    await setClinflow({ disabled: true, allowUids: "nurse-uid" });
    await assertFails(readRecord(nurse));
    await setClinflow({ disabled: false, allowUids: [] });
  });

  console.log("\n=== 16. Stock take (stock_takes with places, counts, additions) ===");
  const takeDoc = (uid, extra = {}) => ({ title: "October stock take", mode: "requested", status: "open", audience: { type: "everyone" }, placeCount: 2, createdByUid: uid, createdByName: "X", ...extra });
  const placeDoc = (id, extra = {}) => ({ id, key: `store:${id}`, kind: "store", name: `Place ${id}`, status: "free", claimedByUid: null, claimedByName: null, ...extra });
  await check("Practice Manager CAN request a stock take with its places", async () => {
    await assertSucceeds(setDoc(doc(pm, "stock_takes", "st-1"), takeDoc("pm-uid")));
    await assertSucceeds(setDoc(doc(pm, "stock_takes", "st-1", "places", "p1"), placeDoc("p1")));
    await assertSucceeds(setDoc(doc(pm, "stock_takes", "st-1", "places", "p2"), placeDoc("p2")));
  });
  await check("A nurse CANNOT request a stock take for the team, or start one in someone else's name", async () => {
    await assertFails(setDoc(doc(nurse, "stock_takes", "st-x1"), takeDoc("nurse-uid")));
    await assertFails(setDoc(doc(nurse, "stock_takes", "st-x2"), takeDoc("pm-uid", { mode: "self" })));
  });
  await check("Cleaner, partner, read-only and anonymous can neither read nor start a stock take", async () => {
    for (const who of [cleaner, partner, readonly, anon]) {
      await assertFails(getDoc(doc(who, "stock_takes", "st-1")));
      await assertFails(setDoc(doc(who, "stock_takes", "st-bad"), takeDoc("x", { mode: "self" })));
    }
  });
  await check("A nurse CAN start a stock take of their own, with its places created together", async () => {
    const batch = writeBatch(nurse);
    batch.set(doc(nurse, "stock_takes", "st-self"), takeDoc("nurse-uid", { mode: "self", audience: { type: "people", uids: ["nurse-uid"] } }));
    batch.set(doc(nurse, "stock_takes", "st-self", "places", "p1"), placeDoc("p1"));
    await assertSucceeds(batch.commit());
  });
  await check("...but not add places to a stock take someone else started", () =>
    assertFails(setDoc(doc(nurse, "stock_takes", "st-1", "places", "p9"), placeDoc("p9"))));

  await check("A nurse CAN claim a free place for themselves", () =>
    assertSucceeds(updateDoc(doc(nurse, "stock_takes", "st-1", "places", "p1"), { status: "claimed", claimedByUid: "nurse-uid", claimedByName: "Nurse", claimedAt: serverTimestamp() })));
  await check("Nobody else can take a place that is already claimed, or claim in someone else's name", async () => {
    await assertFails(updateDoc(doc(reporter, "stock_takes", "st-1", "places", "p1"), { status: "claimed", claimedByUid: "reporter-uid", claimedByName: "HCA", claimedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(reporter, "stock_takes", "st-1", "places", "p2"), { status: "claimed", claimedByUid: "nurse-uid", claimedByName: "Nurse", claimedAt: serverTimestamp() }));
  });
  await check("A claimer cannot rename a place or hand it to someone else", async () => {
    await assertFails(updateDoc(doc(nurse, "stock_takes", "st-1", "places", "p1"), { name: "Renamed" }));
    await assertFails(updateDoc(doc(nurse, "stock_takes", "st-1", "places", "p1"), { claimedByUid: "reporter-uid" }));
  });
  await check("Counts: only the person who claimed the place can write them, as themselves, and never as already applied", async () => {
    const count = (uid, extra = {}) => ({ placeId: "p1", itemId: "i1", itemLabel: "Gloves", counted: 12, expected: 10, unexpected: false, countedByUid: uid, countedByName: "X", applied: false, ...extra });
    await assertSucceeds(setDoc(doc(nurse, "stock_takes", "st-1", "counts", "p1_i1"), count("nurse-uid")));
    await assertSucceeds(setDoc(doc(nurse, "stock_takes", "st-1", "counts", "p1_i1"), count("nurse-uid", { counted: 11 })));
    await assertFails(setDoc(doc(reporter, "stock_takes", "st-1", "counts", "p1_i2"), count("reporter-uid", { itemId: "i2" })));
    await assertFails(setDoc(doc(nurse, "stock_takes", "st-1", "counts", "p1_i3"), count("reporter-uid", { itemId: "i3" })));
    await assertFails(setDoc(doc(nurse, "stock_takes", "st-1", "counts", "p1_i4"), count("nurse-uid", { itemId: "i4", applied: true })));
    await assertFails(setDoc(doc(nurse, "stock_takes", "st-1", "counts", "p2_i1"), count("nurse-uid", { placeId: "p2" })));
    await assertFails(deleteDoc(doc(reporter, "stock_takes", "st-1", "counts", "p1_i1")));
  });
  await check("Only a manager can mark a count as applied", async () => {
    await assertFails(updateDoc(doc(nurse, "stock_takes", "st-1", "counts", "p1_i1"), { applied: true }));
    await assertSucceeds(updateDoc(doc(pm, "stock_takes", "st-1", "counts", "p1_i1"), { applied: true, appliedByName: "PM" }));
  });
  await check("Items found that are not in the system: the claimer can add them as new; only a manager can handle them", async () => {
    const addition = (uid, extra = {}) => ({ placeId: "p1", placeName: "Place p1", name: "Spare thermometer", quantity: 2, status: "new", addedByUid: uid, addedByName: "X", ...extra });
    await assertSucceeds(addDoc(collection(nurse, "stock_takes", "st-1", "additions"), addition("nurse-uid")));
    await assertFails(addDoc(collection(reporter, "stock_takes", "st-1", "additions"), addition("reporter-uid")));
    await assertFails(addDoc(collection(nurse, "stock_takes", "st-1", "additions"), addition("nurse-uid", { status: "created" })));
    await assertFails(addDoc(collection(nurse, "stock_takes", "st-1", "additions"), addition("reporter-uid")));
  });
  await check("A claimer can finish their own place and no one else's; a manager can free a stuck one", async () => {
    await assertFails(updateDoc(doc(reporter, "stock_takes", "st-1", "places", "p1"), { status: "done", doneAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(nurse, "stock_takes", "st-1", "places", "p1"), { status: "done", doneAt: serverTimestamp() }));
    await assertFails(setDoc(doc(nurse, "stock_takes", "st-1", "counts", "p1_i9"), { placeId: "p1", itemId: "i9", counted: 1, expected: 1, countedByUid: "nurse-uid", applied: false }));
    await assertSucceeds(updateDoc(doc(nurse, "stock_takes", "st-1", "places", "p1"), { status: "claimed" }));
    await assertSucceeds(updateDoc(doc(pm, "stock_takes", "st-1", "places", "p1"), { status: "free", claimedByUid: null, claimedByName: null }));
  });
  await check("Whoever started a take can send it for review, nothing else; managers can change anything; only an admin deletes", async () => {
    await assertSucceeds(updateDoc(doc(nurse, "stock_takes", "st-self"), { status: "review", reviewRequestedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(nurse, "stock_takes", "st-self"), { title: "Renamed" }));
    await assertFails(updateDoc(doc(nurse, "stock_takes", "st-self"), { status: "closed" }));
    await assertFails(updateDoc(doc(reporter, "stock_takes", "st-self"), { status: "open" }));
    await assertSucceeds(updateDoc(doc(pm, "stock_takes", "st-self"), { status: "closed" }));
    await assertFails(deleteDoc(doc(pm, "stock_takes", "st-self")));
    await assertSucceeds(deleteDoc(doc(admin, "stock_takes", "st-self")));
  });
  await check("Once a take is in review nobody can claim places or count", async () => {
    await assertSucceeds(updateDoc(doc(pm, "stock_takes", "st-1"), { status: "review" }));
    await assertFails(updateDoc(doc(reporter, "stock_takes", "st-1", "places", "p2"), { status: "claimed", claimedByUid: "reporter-uid", claimedByName: "HCA", claimedAt: serverTimestamp() }));
  });

  console.log("\n=== 15. COSHH register (coshh_substances and coshh_sds safety data sheets) ===");
  const substance = (extra = {}) => ({ name: "Domestos", supplier: "Bunzl", hazards: ["corrosive"], ppe: ["gloves"], firstAid: ["skin"], site: "Main Surgery", location: "Cleaners cupboard", reviewDate: "2027-01-01", active: true, ...extra });
  await check("Caretaker CAN add a substance", () => assertSucceeds(setDoc(doc(caretaker, "coshh_substances", "s-care"), substance())));
  await check("Practice Manager CAN add a substance", () => assertSucceeds(setDoc(doc(pm, "coshh_substances", "s-pm"), substance({ name: "Zoflora" }))));
  await check("Cleaner CANNOT add or change a substance (read-only)", async () => {
    await assertFails(setDoc(doc(cleaner, "coshh_substances", "s-clean"), substance()));
    await assertFails(updateDoc(doc(cleaner, "coshh_substances", "s-care"), { ppe: ["none"] }));
  });
  await check("Partner CANNOT add or change a substance (read-only oversight)", async () => {
    await assertFails(setDoc(doc(partner, "coshh_substances", "s-part"), substance()));
    await assertFails(updateDoc(doc(partner, "coshh_substances", "s-care"), { reviewDate: "2099-01-01" }));
  });
  await check("Nurse and reception CANNOT read or write the register", async () => {
    await assertFails(getDoc(doc(nurse, "coshh_substances", "s-care")));
    await assertFails(setDoc(doc(nurse, "coshh_substances", "s-nurse"), substance()));
    await assertFails(getDoc(doc(reception, "coshh_substances", "s-care")));
  });
  await check("Cleaner, partner, caretaker and practice manager CAN read the register", async () => {
    for (const who of [cleaner, partner, caretaker, pm]) await assertSucceeds(getDoc(doc(who, "coshh_substances", "s-care")));
    await assertSucceeds(getDocs(collection(cleaner, "coshh_substances")));
  });
  await check("Anonymous CANNOT read or write the register", async () => {
    await assertFails(getDoc(doc(anon, "coshh_substances", "s-care")));
    await assertFails(setDoc(doc(anon, "coshh_substances", "s-anon"), substance()));
  });
  await check("A substance must have a name and real lists (no junk records)", async () => {
    await assertFails(setDoc(doc(caretaker, "coshh_substances", "s-bad1"), substance({ name: "" })));
    await assertFails(setDoc(doc(caretaker, "coshh_substances", "s-bad2"), substance({ hazards: "corrosive" })));
    await assertFails(updateDoc(doc(caretaker, "coshh_substances", "s-care"), { name: "" }));
  });
  await check("Caretaker can mark a review done and archive a product, but nobody except an admin deletes one", async () => {
    await assertSucceeds(updateDoc(doc(caretaker, "coshh_substances", "s-care"), { reviewDate: "2027-10-10", lastReviewedAt: "2026-10-10" }));
    await assertSucceeds(updateDoc(doc(pm, "coshh_substances", "s-pm"), { active: false }));
    await assertFails(deleteDoc(doc(caretaker, "coshh_substances", "s-care")));
    await assertFails(deleteDoc(doc(pm, "coshh_substances", "s-pm")));
    await assertSucceeds(deleteDoc(doc(admin, "coshh_substances", "s-pm")));
  });

  const caretakerStorage = testEnv.authenticatedContext("caretaker-uid").storage();
  const cleanerStorage = testEnv.authenticatedContext("cleaner-uid").storage();
  const partnerStorage = testEnv.authenticatedContext("partner-uid").storage();
  const pmStorage = testEnv.authenticatedContext("pm-uid").storage();
  const pdf = new TextEncoder().encode("%PDF-1.4 test");
  await check("Caretaker and Practice Manager CAN upload a safety data sheet (PDF)", async () => {
    await assertSucceeds(uploadBytes(ref(caretakerStorage, "coshh_sds/s-care/a.pdf"), pdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(pmStorage, "coshh_sds/s-care/b.pdf"), pdf, { contentType: "application/pdf" }));
  });
  await check("Cleaner, partner and nurse CANNOT upload a safety data sheet", async () => {
    await assertFails(uploadBytes(ref(cleanerStorage, "coshh_sds/s-care/c.pdf"), pdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(partnerStorage, "coshh_sds/s-care/c.pdf"), pdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(nurseStorage, "coshh_sds/s-care/c.pdf"), pdf, { contentType: "application/pdf" }));
  });
  await check("Only PDFs, and not over 15MB, even for the caretaker", async () => {
    await assertFails(uploadBytes(ref(caretakerStorage, "coshh_sds/s-care/d.png"), new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(caretakerStorage, "coshh_sds/s-care/e.pdf"), new Uint8Array(16 * 1024 * 1024), { contentType: "application/pdf" }));
  });
  await check("Cleaner, partner, caretaker and practice manager CAN read a safety data sheet; nurse and anonymous cannot", async () => {
    for (const who of [cleanerStorage, partnerStorage, caretakerStorage, pmStorage]) await assertSucceeds(getBytes(ref(who, "coshh_sds/s-care/a.pdf")));
    await assertFails(getBytes(ref(nurseStorage, "coshh_sds/s-care/a.pdf")));
    await assertFails(getBytes(ref(anonStorage, "coshh_sds/s-care/a.pdf")));
  });
  await check("Cleaner and partner CANNOT delete a safety data sheet; the caretaker can", async () => {
    await assertFails(deleteObject(ref(cleanerStorage, "coshh_sds/s-care/a.pdf")));
    await assertFails(deleteObject(ref(partnerStorage, "coshh_sds/s-care/a.pdf")));
    await assertSucceeds(deleteObject(ref(caretakerStorage, "coshh_sds/s-care/a.pdf")));
  });

  console.log("\n=== 21. Primovex's own sensors (sensor_config readable by Connect; sensor_keys and every write are server only) ===");
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "sensor_config", "sensor-1"), { name: "Room 68", min: 2, max: 8 });
    await setDoc(doc(context.firestore(), "sensor_keys", "sensor-1"), { keyHash: "abc" });
  });
  await check("Nobody can read a sensor's key from the app, not even an administrator or the practice manager", async () => {
    for (const who of [admin, pm, caretaker, nurse, anon]) await assertFails(getDoc(doc(who, "sensor_keys", "sensor-1")));
  });
  await check("Nobody can write a sensor's key or settings from the app, so a reading cannot be faked by changing the key", async () => {
    for (const who of [admin, pm, caretaker, nurse, anon]) {
      await assertFails(setDoc(doc(who, "sensor_keys", "sensor-x"), { keyHash: "mine" }));
      await assertFails(setDoc(doc(who, "sensor_config", "sensor-x"), { name: "x", min: 2, max: 8 }));
      await assertFails(updateDoc(doc(who, "sensor_config", "sensor-1"), { min: -50, max: 50 }));
      await assertFails(deleteDoc(doc(who, "sensor_config", "sensor-1")));
    }
  });
  await check("An administrator can read sensor settings; anonymous cannot", async () => {
    await assertSucceeds(getDoc(doc(admin, "sensor_config", "sensor-1")));
    await assertFails(getDoc(doc(anon, "sensor_config", "sensor-1")));
  });

  console.log("\n=== 22. Contact details of whoever raised a concern (governance_concern_contacts) ===");
  const contact = (extra = {}) => ({ concernId: "concern-1", phone: "07123 456789", email: "jo@example.com", preferred: "either", ...extra });
  await seed(async (db) => {
    await setDoc(doc(db, "governance_concerns", "concern-owned"), { reference: "CN-OWNED", ownerUid: "nurse-uid", ownerName: "Nina", involvedUserIds: [], summary: "x", status: "received" });
    await setDoc(doc(db, "governance_concern_contacts", "concern-1"), contact());
    await setDoc(doc(db, "governance_concern_contacts", "concern-owned"), contact({ concernId: "concern-owned" }));
  });
  await check("The concerns team (Reception) and an administrator CAN read and save contact details", async () => {
    await assertSucceeds(getDoc(doc(reception, "governance_concern_contacts", "concern-1")));
    await assertSucceeds(getDoc(doc(admin, "governance_concern_contacts", "concern-1")));
    await assertSucceeds(setDoc(doc(reception, "governance_concern_contacts", "concern-1"), contact({ phone: "01234 567890" })));
  });
  await check("The owner of the case CAN read its contact details but CANNOT change them", async () => {
    await assertSucceeds(getDoc(doc(nurse, "governance_concern_contacts", "concern-owned")));
    await assertFails(setDoc(doc(nurse, "governance_concern_contacts", "concern-owned"), contact({ concernId: "concern-owned", phone: "0" })));
  });
  await check("Someone merely involved in the case CANNOT read the contact details, nor the owner's other cases", async () => {
    await assertFails(getDoc(doc(user, "governance_concern_contacts", "concern-1")));
    await assertFails(getDoc(doc(nurse, "governance_concern_contacts", "concern-1")));
  });
  await check("A partner, a read-only user, a caretaker and anonymous CANNOT read contact details", async () => {
    for (const who of [partner, readonly, caretaker, anon]) await assertFails(getDoc(doc(who, "governance_concern_contacts", "concern-1")));
  });
  await check("Nobody can list every contact record, even the concerns team", async () => {
    await assertFails(getDocs(collection(reception, "governance_concern_contacts")));
    await assertFails(getDocs(collection(admin, "governance_concern_contacts")));
  });
  await check("Only the concerns team can create or remove contact details", async () => {
    for (const who of [partner, readonly, user, anon]) await assertFails(setDoc(doc(who, "governance_concern_contacts", "concern-x"), contact({ concernId: "concern-x" })));
    await assertFails(deleteDoc(doc(partner, "governance_concern_contacts", "concern-1")));
    await assertSucceeds(deleteDoc(doc(reception, "governance_concern_contacts", "concern-owned")));
  });

  console.log("\n=== 23. Phone alerts (users/{uid}/push_tokens) ===");
  const pushDoc = (extra = {}) => ({ token: "tok-123", platform: "ios-web", installed: true, createdAt: serverTimestamp(), ...extra });
  await check("Someone can register and remove their own phone for alerts", async () => {
    await assertSucceeds(setDoc(doc(nurse, "users", "nurse-uid", "push_tokens", "t1"), pushDoc()));
    await assertSucceeds(deleteDoc(doc(nurse, "users", "nurse-uid", "push_tokens", "t1")));
  });
  await check("Nobody can add a phone to someone else's account, so alerts can't be redirected", async () => {
    for (const who of [pm, caretaker, partner, anon, admin]) await assertFails(setDoc(doc(who, "users", "nurse-uid", "push_tokens", "t2"), pushDoc()));
  });
  await check("Nobody can read phone tokens from the app, not even their own or an administrator's", async () => {
    await seed(async (db) => { await setDoc(doc(db, "users", "nurse-uid", "push_tokens", "t3"), pushDoc({ createdAt: new Date() })); });
    for (const who of [nurse, admin, pm, anon]) await assertFails(getDoc(doc(who, "users", "nurse-uid", "push_tokens", "t3")));
  });
  await check("A phone record holds only the expected fields and a sensible token", async () => {
    await assertFails(setDoc(doc(nurse, "users", "nurse-uid", "push_tokens", "t4"), pushDoc({ extra: "x" })));
    await assertFails(setDoc(doc(nurse, "users", "nurse-uid", "push_tokens", "t5"), pushDoc({ token: "x".repeat(700) })));
    await assertFails(setDoc(doc(nurse, "users", "nurse-uid", "push_tokens", "t6"), pushDoc({ token: 5 })));
  });

  console.log("\n=== 24. Staff training matrix (training_courses, training_people, training_records) ===");
  const nm = testEnv.authenticatedContext("nursemgr-uid").firestore(); // a "Nurse Manager": clinical training only
  const ma = testEnv.authenticatedContext("assistant-uid").firestore(); // a "Management Assistant": all training
  await seed(async (db) => {
    await setDoc(doc(db, "users", "nursemgr-uid"), { role: "Nurse Manager", displayName: "NM" });
    await setDoc(doc(db, "users", "assistant-uid"), { role: "Management Assistant", displayName: "MA" });
    await setDoc(doc(db, "roles", "Nurse Manager"), { name: "Nurse Manager", capabilities: ["training.manageClinical", "inventory.read"], builtIn: false });
    await setDoc(doc(db, "roles", "Management Assistant"), { name: "Management Assistant", capabilities: ["training.manage", "dashboard.read"], builtIn: false });
    await setDoc(doc(db, "training_people", "p-clin"), { name: "Clin Person", group: "clinical", uid: "nurse-uid", jobRole: "Nurse", active: true });
    await setDoc(doc(db, "training_people", "p-admin"), { name: "Admin Person", group: "admin", uid: "reception-uid", jobRole: "Admin", active: true });
    await setDoc(doc(db, "training_records", "p-clin_c1"), { personId: "p-clin", courseId: "c1", group: "clinical", ownerUid: "nurse-uid", completedOn: "2026-01-01", dueOn: "2028-01-01" });
    await setDoc(doc(db, "training_records", "p-admin_c1"), { personId: "p-admin", courseId: "c1", group: "admin", ownerUid: "reception-uid", completedOn: "2026-01-01", dueOn: "2028-01-01" });
    await setDoc(doc(db, "training_courses", "c1"), { name: "Fire safety", intervalMonths: 24, active: true });
  });
  await check("The practice manager and a management assistant CAN read and update everyone's training", async () => {
    for (const who of [pm, ma, admin]) {
      await assertSucceeds(getDoc(doc(who, "training_people", "p-admin")));
      await assertSucceeds(getDoc(doc(who, "training_records", "p-clin_c1")));
    }
    await assertSucceeds(setDoc(doc(ma, "training_records", "p-admin_c2"), { personId: "p-admin", courseId: "c2", group: "admin", ownerUid: "reception-uid", completedOn: "2026-02-01", dueOn: "" }));
    await assertSucceeds(updateDoc(doc(pm, "training_records", "p-clin_c1"), { completedOn: "2026-03-01" }));
  });
  await check("A nurse manager CAN read and update the clinical team's training but NOT the admin team's", async () => {
    await assertSucceeds(getDoc(doc(nm, "training_people", "p-clin")));
    await assertSucceeds(updateDoc(doc(nm, "training_records", "p-clin_c1"), { completedOn: "2026-04-01" }));
    await assertSucceeds(setDoc(doc(nm, "training_records", "p-clin_c3"), { personId: "p-clin", courseId: "c3", group: "clinical", ownerUid: "nurse-uid", completedOn: "2026-02-01", dueOn: "" }));
    await assertFails(getDoc(doc(nm, "training_people", "p-admin")));
    await assertFails(getDoc(doc(nm, "training_records", "p-admin_c1")));
    await assertFails(updateDoc(doc(nm, "training_records", "p-admin_c1"), { completedOn: "2026-04-01" }));
    await assertFails(setDoc(doc(nm, "training_records", "p-admin_c4"), { personId: "p-admin", courseId: "c4", group: "admin", ownerUid: "reception-uid", completedOn: "2026-02-01" }));
  });
  await check("A nurse manager cannot move a person into the admin group to get at their record, or change course settings", async () => {
    await assertFails(updateDoc(doc(nm, "training_people", "p-clin"), { group: "admin" }));
    await assertFails(setDoc(doc(nm, "training_courses", "c9"), { name: "x", intervalMonths: 12 }));
  });
  await check("Everyone else reads only their own record: a nurse sees theirs, not a colleague's or anyone's list", async () => {
    await assertSucceeds(getDoc(doc(nurse, "training_people", "p-clin")));
    await assertSucceeds(getDoc(doc(nurse, "training_records", "p-clin_c1")));
    await assertFails(getDoc(doc(nurse, "training_people", "p-admin")));
    await assertFails(getDoc(doc(nurse, "training_records", "p-admin_c1")));
    await assertSucceeds(getDocs(query(collection(nurse, "training_records"), where("ownerUid", "==", "nurse-uid"))));
    await assertFails(getDocs(collection(nurse, "training_records")));
    await assertFails(getDocs(collection(nurse, "training_people")));
  });
  await check("Nobody can change their own training record or link themselves to another person's", async () => {
    await assertFails(updateDoc(doc(nurse, "training_records", "p-clin_c1"), { completedOn: "2030-01-01", dueOn: "2040-01-01" }));
    await assertFails(updateDoc(doc(nurse, "training_people", "p-clin"), { jobRole: "Partner" }));
    await assertFails(setDoc(doc(nurse, "training_people", "p-new"), { name: "Me", group: "clinical", uid: "nurse-uid" }));
    await assertFails(deleteDoc(doc(nurse, "training_records", "p-clin_c1")));
  });
  await check("A partner, a caretaker, a read-only user and anonymous see no one's training", async () => {
    for (const who of [partner, caretaker, readonly, anon]) {
      await assertFails(getDoc(doc(who, "training_people", "p-clin")));
      await assertFails(getDoc(doc(who, "training_records", "p-clin_c1")));
    }
  });
  await check("Anyone signed in can read the course list; only managers can change it", async () => {
    await assertSucceeds(getDoc(doc(nurse, "training_courses", "c1")));
    await assertFails(getDoc(doc(anon, "training_courses", "c1")));
    await assertSucceeds(setDoc(doc(pm, "training_courses", "c2"), { name: "Manual handling", intervalMonths: 24 }));
    await assertFails(setDoc(doc(nurse, "training_courses", "c8"), { name: "x", intervalMonths: 12 }));
    await assertFails(deleteDoc(doc(nurse, "training_courses", "c1")));
  });

  console.log("\n=== 25. Clinical waste consignment notes (waste_consignments and waste_notes files) ===");
  const keeper = testEnv.authenticatedContext("wastekeeper-uid").firestore(); // a custom role with waste.manage (the member of staff who keeps the notes)
  const wreader = testEnv.authenticatedContext("wastereader-uid").firestore(); // a custom role with waste.read only
  const keeperStorage = testEnv.authenticatedContext("wastekeeper-uid").storage();
  const readerStorage = testEnv.authenticatedContext("wastereader-uid").storage();
  const wPmStorage = testEnv.authenticatedContext("pm-uid").storage();
  const wAdminStorage = testEnv.authenticatedContext("admin-uid").storage();
  const noteDoc = (extra = {}) => ({ consignmentCode: "ABC123/9XY8Z", collectionDate: "2026-03-24", collectionTime: "08:46", lines: [{ ewc: "18 01 03", kg: 10 }], totalKg: 10, voided: false, ...extra });
  await seed(async (db) => {
    await setDoc(doc(db, "roles", "Clinical Waste Keeper"), { name: "Clinical Waste Keeper", capabilities: ["waste.manage", "dashboard.read"], builtIn: false });
    await setDoc(doc(db, "roles", "Waste Reader"), { name: "Waste Reader", capabilities: ["waste.read", "dashboard.read"], builtIn: false });
    await setDoc(doc(db, "users", "wastekeeper-uid"), { role: "Clinical Waste Keeper", displayName: "Keeper" });
    await setDoc(doc(db, "users", "wastereader-uid"), { role: "Waste Reader", displayName: "Reader" });
    await setDoc(doc(db, "waste_consignments", "cn-seed"), noteDoc({ consignmentCode: "SEED01/AAAA1" }));
  });
  await check("The practice manager, the member of staff who keeps the notes and an administrator CAN add a note", async () => {
    await assertSucceeds(setDoc(doc(pm, "waste_consignments", "cn-pm"), noteDoc({ consignmentCode: "PM0001/AAAA1" })));
    await assertSucceeds(setDoc(doc(keeper, "waste_consignments", "cn-keeper"), noteDoc({ consignmentCode: "KP0001/AAAA1" })));
    await assertSucceeds(setDoc(doc(admin, "waste_consignments", "cn-admin"), noteDoc({ consignmentCode: "AD0001/AAAA1" })));
  });
  await check("A nurse, an HCA-type user, reception, a cleaner, a read-only waste role and anonymous cannot add or change one", async () => {
    for (const who of [nurse, user, reception, cleaner, wreader, anon]) {
      await assertFails(setDoc(doc(who, "waste_consignments", "cn-x"), noteDoc({ consignmentCode: "X00001/AAAA1" })));
    }
    for (const who of [nurse, wreader]) await assertFails(updateDoc(doc(who, "waste_consignments", "cn-seed"), { totalKg: 1 }));
  });
  await check("A note must have a code, a collection date and a list of lines", async () => {
    await assertFails(setDoc(doc(keeper, "waste_consignments", "cn-b1"), noteDoc({ consignmentCode: "" })));
    await assertFails(setDoc(doc(keeper, "waste_consignments", "cn-b2"), noteDoc({ consignmentCode: 5 })));
    await assertFails(setDoc(doc(keeper, "waste_consignments", "cn-b3"), noteDoc({ collectionDate: null })));
    await assertFails(setDoc(doc(keeper, "waste_consignments", "cn-b4"), noteDoc({ lines: "ten kilos" })));
  });
  await check("The practice manager, the keeper, a read-only waste role and an administrator CAN read the notes; a nurse, a cleaner, a partner and anonymous cannot", async () => {
    for (const who of [pm, keeper, wreader, admin]) await assertSucceeds(getDoc(doc(who, "waste_consignments", "cn-seed")));
    for (const who of [nurse, cleaner, partner, reception, anon]) await assertFails(getDoc(doc(who, "waste_consignments", "cn-seed")));
  });
  await check("The keeper can correct a note and mark one as entered in error; nobody except an administrator deletes one", async () => {
    await assertSucceeds(updateDoc(doc(keeper, "waste_consignments", "cn-keeper"), { totalKg: 12, voided: true, voidReason: "Entered in error" }));
    await assertFails(deleteDoc(doc(keeper, "waste_consignments", "cn-keeper")));
    await assertFails(deleteDoc(doc(pm, "waste_consignments", "cn-pm")));
    await assertSucceeds(deleteDoc(doc(admin, "waste_consignments", "cn-admin")));
  });
  const wastePdf = new TextEncoder().encode("%PDF-1.4 consignment note");
  await check("The practice manager and the keeper CAN upload a consignment note PDF; others cannot, and only PDFs under 15MB", async () => {
    await assertSucceeds(uploadBytes(ref(keeperStorage, "waste_notes/cn-keeper/a.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(wPmStorage, "waste_notes/cn-pm/b.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(nurseStorage, "waste_notes/cn-x/c.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(readerStorage, "waste_notes/cn-x/c.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(anonStorage, "waste_notes/cn-x/c.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(keeperStorage, "waste_notes/cn-keeper/d.png"), new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
    await assertFails(uploadBytes(ref(keeperStorage, "waste_notes/cn-keeper/e.pdf"), new Uint8Array(16 * 1024 * 1024), { contentType: "application/pdf" }));
  });
  await check("The site-number mapping is read by whoever sees the waste records and set only by whoever keeps the notes", async () => {
    await assertSucceeds(setDoc(doc(keeper, "waste_settings", "sites"), { bySiteNumber: { "9015865-111": "main" } }, { merge: true }));
    await assertSucceeds(setDoc(doc(pm, "waste_settings", "sites"), { bySiteNumber: { "9015865-112": "branch" } }, { merge: true }));
    for (const who of [keeper, wreader, pm, admin]) await assertSucceeds(getDoc(doc(who, "waste_settings", "sites")));
    for (const who of [nurse, cleaner, anon]) await assertFails(getDoc(doc(who, "waste_settings", "sites")));
    for (const who of [wreader, nurse, cleaner, anon]) await assertFails(setDoc(doc(who, "waste_settings", "sites"), { bySiteNumber: { "9015865-111": "x" } }, { merge: true }));
    await assertFails(deleteDoc(doc(keeper, "waste_settings", "sites")));
  });
  const retDoc = (extra = {}) => ({ siteId: "branch", siteName: "Branch Surgery", customerSite: "9015865-108", producer: "Park View", year: 2026, quarter: 2, rows: [{ code: "CAJ236//7LO21", date: "2026-04-08", kg: 10 }], totalKg: 10, ...extra });
  await check("The keeper and the practice manager CAN save a quarterly return; a read-only waste role, a nurse and anonymous cannot, and it must be a real quarter with a list of rows", async () => {
    await assertSucceeds(setDoc(doc(keeper, "waste_returns", "wr-1"), retDoc()));
    await assertSucceeds(setDoc(doc(pm, "waste_returns", "wr-2"), retDoc({ quarter: 1 })));
    for (const who of [wreader, nurse, cleaner, anon]) await assertFails(setDoc(doc(who, "waste_returns", "wr-x"), retDoc()));
    await assertFails(setDoc(doc(keeper, "waste_returns", "wr-b1"), retDoc({ quarter: 5 })));
    await assertFails(setDoc(doc(keeper, "waste_returns", "wr-b2"), retDoc({ rows: "none" })));
    await assertFails(setDoc(doc(keeper, "waste_returns", "wr-b3"), retDoc({ year: "2026" })));
    await assertFails(setDoc(doc(keeper, "waste_returns", "wr-b4"), retDoc({ customerSite: 5 })));
  });
  await check("Quarterly returns are read by whoever sees the waste records and nobody else; only an administrator deletes one", async () => {
    for (const who of [keeper, wreader, pm, admin]) await assertSucceeds(getDoc(doc(who, "waste_returns", "wr-1")));
    for (const who of [nurse, cleaner, partner, anon]) await assertFails(getDoc(doc(who, "waste_returns", "wr-1")));
    await assertFails(deleteDoc(doc(keeper, "waste_returns", "wr-1")));
    await assertFails(deleteDoc(doc(pm, "waste_returns", "wr-1")));
    await assertSucceeds(deleteDoc(doc(admin, "waste_returns", "wr-2")));
  });
  await check("The quarterly return PDF: the keeper and practice manager upload it, readers open it, a nurse and anonymous cannot, only an administrator deletes it", async () => {
    await assertSucceeds(uploadBytes(ref(keeperStorage, "waste_returns/wr-1/a.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(wPmStorage, "waste_returns/wr-1/b.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(readerStorage, "waste_returns/wr-1/c.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(nurseStorage, "waste_returns/wr-1/c.pdf"), wastePdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(keeperStorage, "waste_returns/wr-1/d.png"), new Uint8Array([1, 2]), { contentType: "image/png" }));
    for (const who of [keeperStorage, readerStorage, wPmStorage, wAdminStorage]) await assertSucceeds(getBytes(ref(who, "waste_returns/wr-1/a.pdf")));
    for (const who of [nurseStorage, anonStorage]) await assertFails(getBytes(ref(who, "waste_returns/wr-1/a.pdf")));
    await assertFails(deleteObject(ref(keeperStorage, "waste_returns/wr-1/a.pdf")));
    await assertSucceeds(deleteObject(ref(wAdminStorage, "waste_returns/wr-1/a.pdf")));
  });
  await check("Whoever sees the waste records can open the PDF; a nurse and anonymous cannot", async () => {
    for (const who of [keeperStorage, readerStorage, wPmStorage, wAdminStorage]) await assertSucceeds(getBytes(ref(who, "waste_notes/cn-keeper/a.pdf")));
    for (const who of [nurseStorage, anonStorage]) await assertFails(getBytes(ref(who, "waste_notes/cn-keeper/a.pdf")));
  });
  await check("Only an administrator deletes a consignment note PDF", async () => {
    await assertFails(deleteObject(ref(keeperStorage, "waste_notes/cn-keeper/a.pdf")));
    await assertFails(deleteObject(ref(wPmStorage, "waste_notes/cn-keeper/a.pdf")));
    await assertSucceeds(deleteObject(ref(wAdminStorage, "waste_notes/cn-keeper/a.pdf")));
  });

  console.log("\n=== 26. Timesheets staff register (timesheet_staff) ===");
  const tsAdmin = testEnv.authenticatedContext("tsadmin-uid").firestore(); // a custom role with timesheets.manage (a management assistant)
  await seed(async (db) => {
    await setDoc(doc(db, "roles", "Timesheet Admin"), { name: "Timesheet Admin", capabilities: ["timesheets.manage", "dashboard.read"], builtIn: false });
    await setDoc(doc(db, "users", "tsadmin-uid"), { role: "Timesheet Admin", displayName: "TS Admin" });
    await setDoc(doc(db, "timesheet_staff", "ts-nurse"), { name: "Nurse Person", uid: "nurse-uid", patterns: [], active: true });
    await setDoc(doc(db, "timesheet_staff", "ts-other"), { name: "Other Person", uid: "reception-uid", patterns: [], active: true });
  });
  await check("The practice manager, a timesheet administrator and an administrator CAN read and set up everyone's pattern", async () => {
    for (const who of [pm, tsAdmin, admin]) await assertSucceeds(getDoc(doc(who, "timesheet_staff", "ts-other")));
    await assertSucceeds(setDoc(doc(tsAdmin, "timesheet_staff", "ts-new"), { name: "New Person", uid: null, patterns: [{ from: "2026-01-05", mode: "zero-hours", weeks: [] }], active: true }));
    await assertSucceeds(updateDoc(doc(pm, "timesheet_staff", "ts-other"), { managerId: "ts-nurse" }));
  });
  await check("A member of staff reads only their own record: not a colleague's, not the whole list", async () => {
    await assertSucceeds(getDoc(doc(nurse, "timesheet_staff", "ts-nurse")));
    await assertFails(getDoc(doc(nurse, "timesheet_staff", "ts-other")));
    await assertSucceeds(getDocs(query(collection(nurse, "timesheet_staff"), where("uid", "==", "nurse-uid"))));
    await assertFails(getDocs(collection(nurse, "timesheet_staff")));
  });
  await check("Nobody else can read it: a cleaner, a partner, reception looking at another person's, a caretaker and anonymous", async () => {
    for (const who of [cleaner, partner, anon, caretaker]) await assertFails(getDoc(doc(who, "timesheet_staff", "ts-nurse")));
    await assertFails(getDoc(doc(reception, "timesheet_staff", "ts-nurse")));
  });
  await check("A member of staff cannot change their own pattern or leave figures, or add or remove anyone", async () => {
    await assertFails(updateDoc(doc(nurse, "timesheet_staff", "ts-nurse"), { patterns: [{ from: "2026-01-05", mode: "zero-hours", weeks: [] }] }));
    await assertFails(setDoc(doc(nurse, "timesheet_staff", "ts-nurse"), { name: "Nurse Person", leave: { remaining: 9999 } }, { merge: true }));
    await assertFails(setDoc(doc(nurse, "timesheet_staff", "ts-fake"), { name: "Fake", uid: "nurse-uid" }));
    await assertFails(deleteDoc(doc(nurse, "timesheet_staff", "ts-nurse")));
  });
  await check("A record must have a name", async () => {
    await assertFails(setDoc(doc(tsAdmin, "timesheet_staff", "ts-noname"), { name: "", patterns: [] }));
    await assertFails(setDoc(doc(tsAdmin, "timesheet_staff", "ts-noname2"), { name: 5, patterns: [] }));
  });
  await check("Whoever manages timesheets can remove a mistaken person; others cannot", async () => {
    await assertFails(deleteDoc(doc(cleaner, "timesheet_staff", "ts-new")));
    await assertSucceeds(deleteDoc(doc(tsAdmin, "timesheet_staff", "ts-new")));
  });

  console.log("\n=== 27. Mileage claims (mileage_claims, mileage_places, mileage_routes, mileage_settings) ===");
  await seed(async (db) => {
    // the nurse is claiming; her line manager is reception (uid reception-uid); the cleaner has no line manager set
    await setDoc(doc(db, "timesheet_staff", "ts-m-nurse"), { name: "Nurse Claimant", uid: "nurse-uid", managerUid: "reception-uid", managerId: "ts-other", patterns: [], active: true });
    await setDoc(doc(db, "timesheet_staff", "ts-m-cleaner"), { name: "Cleaner Claimant", uid: "cleaner-uid", managerUid: null, patterns: [], active: true });
    await setDoc(doc(db, "timesheet_staff", "ts-m-nouid"), { name: "No Account", patterns: [], active: true });
  });
  const mile = (extra = {}) => ({ uid: "nurse-uid", staffId: "ts-m-nurse", staffName: "Nurse Claimant", managerUid: "reception-uid", date: "2026-10-01", fromId: "site:a", fromName: "Surgery", toId: "site:b", toName: "Branch", miles: 7.4, returnTrip: true, vehicle: "car", purpose: "Meeting or training", note: "", status: "submitted", ...extra });
  await check("A member of staff CAN add their own mileage claim, naming their real line manager", async () => {
    await assertSucceeds(setDoc(doc(nurse, "mileage_claims", "m-1"), mile()));
    await assertSucceeds(setDoc(doc(testEnv.authenticatedContext("cleaner-uid").firestore(), "mileage_claims", "m-c1"), mile({ uid: "cleaner-uid", staffId: "ts-m-cleaner", staffName: "Cleaner Claimant", managerUid: null })));
  });
  await check("A claim cannot be made for someone else, with a made-up manager, as already approved, or with silly miles or a vehicle", async () => {
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x1"), mile({ uid: "reception-uid" })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x2"), mile({ managerUid: "cleaner-uid" })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x3"), mile({ managerUid: null })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x4"), mile({ staffId: "ts-m-cleaner", staffName: "Cleaner Claimant" })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x5"), mile({ staffId: "ts-m-nouid", staffName: "No Account" })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x6"), mile({ status: "approved" })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x7"), mile({ miles: 0 })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x8"), mile({ miles: 900 })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x9"), mile({ vehicle: "tank" })));
    await assertFails(setDoc(doc(nurse, "mileage_claims", "m-x10"), mile({ staffName: "Someone Else" })));
    await assertFails(setDoc(doc(anon, "mileage_claims", "m-x11"), mile()));
  });
  await check("A claim can be read by the person, their line manager, the practice manager, a timesheet administrator and an administrator, and nobody else", async () => {
    for (const who of [nurse, reception, pm, tsAdmin, admin]) await assertSucceeds(getDoc(doc(who, "mileage_claims", "m-1")));
    for (const who of [cleaner, partner, caretaker, anon]) await assertFails(getDoc(doc(who, "mileage_claims", "m-1")));
    await assertSucceeds(getDocs(query(collection(nurse, "mileage_claims"), where("uid", "==", "nurse-uid"))));
    await assertSucceeds(getDocs(query(collection(reception, "mileage_claims"), where("managerUid", "==", "reception-uid"))));
    await assertFails(getDocs(collection(cleaner, "mileage_claims")));
  });
  await check("The person can correct their own waiting claim, but not who approves it, its status, or whose it is", async () => {
    await assertSucceeds(updateDoc(doc(nurse, "mileage_claims", "m-1"), { miles: 8, note: "Longer way round" }));
    await assertFails(updateDoc(doc(nurse, "mileage_claims", "m-1"), { managerUid: "nurse-uid" }));
    await assertFails(updateDoc(doc(nurse, "mileage_claims", "m-1"), { status: "approved" }));
    await assertFails(updateDoc(doc(nurse, "mileage_claims", "m-1"), { uid: "reception-uid" }));
    await assertFails(updateDoc(doc(cleaner, "mileage_claims", "m-1"), { miles: 1 }));
  });
  await check("The line manager approves a waiting claim, changing nothing else; the person can't approve their own; a stranger can't", async () => {
    await assertFails(updateDoc(doc(nurse, "mileage_claims", "m-1"), { status: "approved", decidedByName: "Me" }));
    await assertFails(updateDoc(doc(cleaner, "mileage_claims", "m-1"), { status: "approved", decidedByName: "Cleaner" }));
    await assertFails(updateDoc(doc(reception, "mileage_claims", "m-1"), { status: "approved", decidedByName: "Manager", miles: 400 }));
    await assertSucceeds(updateDoc(doc(reception, "mileage_claims", "m-1"), { status: "approved", decidedByName: "Manager", decisionNote: "" }));
  });
  await check("Once decided the person can't change the claim, the line manager can't reverse it, and the practice manager can put it right", async () => {
    await assertFails(updateDoc(doc(nurse, "mileage_claims", "m-1"), { miles: 1 }));
    await assertFails(updateDoc(doc(reception, "mileage_claims", "m-1"), { status: "rejected", decidedByName: "Manager" }));
    await assertSucceeds(updateDoc(doc(pm, "mileage_claims", "m-1"), { status: "rejected", decidedByName: "PM", decisionNote: "Duplicate" }));
  });
  await check("The person can withdraw a waiting claim but not a decided one; only an administrator deletes that", async () => {
    await assertSucceeds(setDoc(doc(nurse, "mileage_claims", "m-2"), mile()));
    await assertSucceeds(deleteDoc(doc(nurse, "mileage_claims", "m-2")));
    await assertFails(deleteDoc(doc(nurse, "mileage_claims", "m-1")));
    await assertFails(deleteDoc(doc(pm, "mileage_claims", "m-1")));
    await assertSucceeds(deleteDoc(doc(admin, "mileage_claims", "m-1")));
  });
  await check("Everyone signed in can read the places, routes and rates; only whoever manages timesheets can change them", async () => {
    await assertSucceeds(setDoc(doc(tsAdmin, "mileage_places", "p-1"), { name: "Hospital", active: true }));
    await assertSucceeds(setDoc(doc(pm, "mileage_routes", "r-1"), { fromId: "site:a", toId: "place:p-1", miles: 12.4 }));
    await assertSucceeds(setDoc(doc(pm, "mileage_settings", "rates"), { car: { tiers: [{ upTo: 10000, pence: 45 }, { pence: 25 }] } }));
    for (const who of [nurse, cleaner]) {
      await assertSucceeds(getDoc(doc(who, "mileage_places", "p-1")));
      await assertSucceeds(getDoc(doc(who, "mileage_routes", "r-1")));
      await assertSucceeds(getDoc(doc(who, "mileage_settings", "rates")));
    }
    await assertFails(getDoc(doc(anon, "mileage_settings", "rates")));
    await assertFails(setDoc(doc(nurse, "mileage_places", "p-2"), { name: "Fake place" }));
    await assertFails(setDoc(doc(nurse, "mileage_routes", "r-2"), { fromId: "a", toId: "b", miles: 1 }));
    await assertFails(setDoc(doc(nurse, "mileage_settings", "rates"), { car: { tiers: [{ pence: 9999 }] } }));
    await assertFails(setDoc(doc(pm, "mileage_routes", "r-3"), { fromId: "a", toId: "b", miles: 0 }));
    await assertFails(deleteDoc(doc(nurse, "mileage_routes", "r-1")));
    await assertSucceeds(deleteDoc(doc(tsAdmin, "mileage_routes", "r-1")));
  });

  console.log("\n=== 28. Timesheets per pay period (timesheet_periods, timesheets, timesheet_audit) ===");
  const payroll = testEnv.authenticatedContext("payroll-uid").firestore(); // a custom role with timesheets.payroll: the payroll team
  await seed(async (db) => {
    await setDoc(doc(db, "roles", "Payroll Team"), { name: "Payroll Team", capabilities: ["timesheets.payroll", "dashboard.read"], builtIn: false });
    await setDoc(doc(db, "users", "payroll-uid"), { role: "Payroll Team", displayName: "Payroll" });
    await setDoc(doc(db, "mileage_claims", "m-pay"), { uid: "nurse-uid", managerUid: "reception-uid", status: "approved", miles: 5, vehicle: "car", date: "2026-10-01" });
    await setDoc(doc(db, "timesheet_audit", "a-1"), { timesheetId: "p28_ts-m-nurse", staffUid: "nurse-uid", managerUid: "reception-uid", action: "created and submitted", actorUid: "nurse-uid" });
  });
  const per = (extra = {}) => ({ name: "October payroll", from: "2026-08-31", to: "2026-10-04", due: "2026-10-05", ...extra });
  const sheet = (extra = {}) => ({ periodId: "p28", staffId: "ts-m-nurse", uid: "nurse-uid", staffName: "Nurse Claimant", payrollNo: "12", managerUid: "reception-uid", state: "submitted", kind: "no-change", expected: { hours: 150, days: [] }, lines: [], totals: {}, declaration: { text: "I confirm", confirmedAt: "2026-10-05T09:00:00Z", confirmedByName: "Nurse Claimant" }, submissions: 1, lastActorUid: "nurse-uid", lastActorName: "Nurse Claimant", ...extra });
  const decide = (who, id, state, byUid, reason) => updateDoc(doc(who, "timesheets", id), { state, decision: { outcome: state, byUid, by: "X", at: "2026-10-06T09:00:00Z", reason: reason || "" }, lastActorUid: byUid, lastActorName: "X" });
  const dispatch = (who, id, state, byUid, reason) => updateDoc(doc(who, "timesheets", id), { state, payroll: { outcome: state, byUid, by: "P", at: "2026-10-07T09:00:00Z", reference: "OCT", reason: reason || "" }, lastActorUid: byUid, lastActorName: "P" });

  await check("Whoever manages timesheets sets up the pay periods; everyone signed in reads them; a member of staff cannot", async () => {
    await assertSucceeds(setDoc(doc(pm, "timesheet_periods", "p28"), per()));
    await assertSucceeds(setDoc(doc(tsAdmin, "timesheet_periods", "p28b"), per({ name: "November payroll", from: "2026-10-05", to: "2026-11-01", due: "2026-11-02" })));
    await assertSucceeds(getDoc(doc(nurse, "timesheet_periods", "p28")));
    await assertFails(getDoc(doc(anon, "timesheet_periods", "p28")));
    await assertFails(setDoc(doc(nurse, "timesheet_periods", "px"), per()));
    await assertFails(deleteDoc(doc(nurse, "timesheet_periods", "p28b")));
  });
  await check("A member of staff CAN send their own timesheet with the declaration, naming their real line manager", async () => {
    await assertSucceeds(setDoc(doc(nurse, "timesheets", "p28_ts-m-nurse"), sheet()));
  });
  await check("A timesheet cannot be made for someone else, with a made-up manager, as already signed off, without a declaration, or for a period that doesn't exist", async () => {
    await assertFails(setDoc(doc(nurse, "timesheets", "p28b_ts-m-nurse"), sheet({ periodId: "p28b", uid: "reception-uid" })));
    await assertFails(setDoc(doc(nurse, "timesheets", "p28b_ts-m-nurse"), sheet({ periodId: "p28b", managerUid: "cleaner-uid" })));
    await assertFails(setDoc(doc(nurse, "timesheets", "p28b_ts-m-nurse"), sheet({ periodId: "p28b", managerUid: null })));
    await assertFails(setDoc(doc(nurse, "timesheets", "p28b_ts-m-nurse"), sheet({ periodId: "p28b", state: "approved" })));
    await assertFails(setDoc(doc(nurse, "timesheets", "p28b_ts-m-nurse"), sheet({ periodId: "p28b", declaration: null })));
    await assertFails(setDoc(doc(nurse, "timesheets", "pnone_ts-m-nurse"), sheet({ periodId: "pnone" })));
    await assertFails(setDoc(doc(nurse, "timesheets", "wrong-id"), sheet({ periodId: "p28b" })));
    await assertFails(setDoc(doc(nurse, "timesheets", "p28b_ts-m-cleaner"), sheet({ periodId: "p28b", staffId: "ts-m-cleaner", staffName: "Cleaner Claimant" })));
    await assertFails(setDoc(doc(nurse, "timesheets", "p28b_ts-m-nurse"), sheet({ periodId: "p28b", lastActorUid: "reception-uid" })));
    await assertFails(setDoc(doc(anon, "timesheets", "p28b_ts-m-nurse"), sheet({ periodId: "p28b" })));
  });
  await check("A timesheet is read by the person, their line manager, whoever manages timesheets; payroll only once it is signed off; nobody else", async () => {
    for (const who of [nurse, reception, pm, tsAdmin]) await assertSucceeds(getDoc(doc(who, "timesheets", "p28_ts-m-nurse")));
    for (const who of [payroll, cleaner, partner, caretaker, anon]) await assertFails(getDoc(doc(who, "timesheets", "p28_ts-m-nurse")));
    await assertSucceeds(getDocs(query(collection(reception, "timesheets"), where("managerUid", "==", "reception-uid"))));
    await assertFails(getDocs(collection(cleaner, "timesheets")));
  });
  await check("The line manager cannot decline without a reason, cannot sign in someone else's name, and cannot change the hours; a stranger and the person themselves cannot decide", async () => {
    await assertFails(decide(reception, "p28_ts-m-nurse", "declined", "reception-uid", ""));
    await assertFails(decide(reception, "p28_ts-m-nurse", "declined", "reception-uid", "no"));
    await assertFails(decide(reception, "p28_ts-m-nurse", "declined", "pm-uid", "Not agreed"));
    await assertFails(updateDoc(doc(reception, "timesheets", "p28_ts-m-nurse"), { state: "approved", decision: { outcome: "approved", byUid: "reception-uid" }, lastActorUid: "reception-uid", lastActorName: "X", lines: [{ date: "2026-09-10", code: "B", hours: 20, comment: "" }] }));
    await assertFails(decide(nurse, "p28_ts-m-nurse", "approved", "nurse-uid"));
    await assertFails(decide(cleaner, "p28_ts-m-nurse", "approved", "cleaner-uid"));
    await assertFails(decide(payroll, "p28_ts-m-nurse", "approved", "payroll-uid"));
  });
  await check("The line manager declines with a reason; the person then corrects and sends it again, but cannot change who approves it or the decision", async () => {
    await assertSucceeds(decide(reception, "p28_ts-m-nurse", "declined", "reception-uid", "Overtime on the 12th was not agreed"));
    await assertFails(updateDoc(doc(nurse, "timesheets", "p28_ts-m-nurse"), { managerUid: "nurse-uid", lastActorUid: "nurse-uid", lastActorName: "N" }));
    await assertFails(updateDoc(doc(nurse, "timesheets", "p28_ts-m-nurse"), { state: "approved", lastActorUid: "nurse-uid", lastActorName: "N" }));
    await assertFails(updateDoc(doc(nurse, "timesheets", "p28_ts-m-nurse"), { state: "submitted", decision: { outcome: "approved", byUid: "nurse-uid" }, lastActorUid: "nurse-uid", lastActorName: "N" }));
    await assertSucceeds(updateDoc(doc(nurse, "timesheets", "p28_ts-m-nurse"), { state: "submitted", kind: "changes", lines: [{ date: "2026-09-10", code: "B", hours: 1, comment: "" }], totals: { B: 1 }, submissions: 2, lastActorUid: "nurse-uid", lastActorName: "N" }));
  });
  await check("Once it is with the manager the person cannot change it; the manager signs it off", async () => {
    await assertFails(updateDoc(doc(nurse, "timesheets", "p28_ts-m-nurse"), { lines: [], lastActorUid: "nurse-uid", lastActorName: "N" }));
    await assertSucceeds(decide(reception, "p28_ts-m-nurse", "approved", "reception-uid"));
    await assertFails(decide(reception, "p28_ts-m-nurse", "declined", "reception-uid", "Changed my mind"));
    await assertFails(updateDoc(doc(nurse, "timesheets", "p28_ts-m-nurse"), { state: "draft", lastActorUid: "nurse-uid", lastActorName: "N" }));
  });
  await check("Payroll sees a timesheet only once it is signed off; can send it on, but cannot return one without a reason; the manager cannot touch it after sign-off", async () => {
    await assertSucceeds(getDoc(doc(payroll, "timesheets", "p28_ts-m-nurse")));
    await assertSucceeds(getDocs(query(collection(payroll, "timesheets"), where("state", "in", ["approved", "sent", "returned"]))));
    await assertFails(getDocs(collection(payroll, "timesheets")));
    await assertFails(dispatch(reception, "p28_ts-m-nurse", "sent", "reception-uid"));
    await assertFails(dispatch(payroll, "p28_ts-m-nurse", "returned", "payroll-uid", ""));
    await assertFails(dispatch(payroll, "p28_ts-m-nurse", "sent", "pm-uid"));
    await assertFails(updateDoc(doc(payroll, "timesheets", "p28_ts-m-nurse"), { state: "sent", payroll: { outcome: "sent", byUid: "payroll-uid" }, lastActorUid: "payroll-uid", lastActorName: "P", lines: [] }));
    await assertSucceeds(dispatch(payroll, "p28_ts-m-nurse", "sent", "payroll-uid"));
    await assertFails(dispatch(payroll, "p28_ts-m-nurse", "returned", "payroll-uid", "Too late now"));
  });
  await check("With no line manager set, whoever manages timesheets signs it off; payroll can return it with a reason and the person can send it again", async () => {
    const cleanerSheet = (extra = {}) => sheet({ periodId: "p28", staffId: "ts-m-cleaner", uid: "cleaner-uid", staffName: "Cleaner Claimant", managerUid: null, lastActorUid: "cleaner-uid", lastActorName: "C", ...extra });
    await assertSucceeds(setDoc(doc(cleaner, "timesheets", "p28_ts-m-cleaner"), cleanerSheet()));
    await assertFails(decide(reception, "p28_ts-m-cleaner", "approved", "reception-uid"));
    await assertSucceeds(decide(tsAdmin, "p28_ts-m-cleaner", "approved", "tsadmin-uid"));
    await assertSucceeds(dispatch(payroll, "p28_ts-m-cleaner", "returned", "payroll-uid", "Payroll number is wrong"));
    await assertSucceeds(updateDoc(doc(cleaner, "timesheets", "p28_ts-m-cleaner"), { state: "submitted", submissions: 2, lastActorUid: "cleaner-uid", lastActorName: "C" }));
  });
  await check("Nobody can delete a timesheet, an administrator included", async () => {
    for (const who of [nurse, reception, pm, tsAdmin, payroll, admin]) await assertFails(deleteDoc(doc(who, "timesheets", "p28_ts-m-nurse")));
  });
  await check("The audit trail is read by the person, their manager, the payroll team and whoever manages timesheets, and nobody can write, change or delete it", async () => {
    for (const who of [nurse, reception, payroll, pm, tsAdmin]) await assertSucceeds(getDoc(doc(who, "timesheet_audit", "a-1")));
    for (const who of [cleaner, partner, anon]) await assertFails(getDoc(doc(who, "timesheet_audit", "a-1")));
    for (const who of [nurse, reception, payroll, pm, tsAdmin, admin]) {
      await assertFails(setDoc(doc(who, "timesheet_audit", "forged"), { timesheetId: "x", staffUid: "nurse-uid", action: "signed off" }));
      await assertFails(updateDoc(doc(who, "timesheet_audit", "a-1"), { action: "nothing happened" }));
      await assertFails(deleteDoc(doc(who, "timesheet_audit", "a-1")));
    }
  });
  await check("The payroll team can read approved mileage claims to put beside the timesheets; a nurse cannot read someone else's", async () => {
    await assertSucceeds(getDoc(doc(payroll, "mileage_claims", "m-pay")));
    await assertFails(getDoc(doc(cleaner, "mileage_claims", "m-pay")));
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
