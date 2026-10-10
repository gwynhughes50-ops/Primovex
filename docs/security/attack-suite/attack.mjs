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
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, deleteDoc, serverTimestamp, query, where,
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

  console.log(`\n${pass} passed, ${fail} failed`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
