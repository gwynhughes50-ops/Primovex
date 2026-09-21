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
  doc, getDoc, setDoc, updateDoc, addDoc, collection, deleteDoc,
} from "firebase/firestore";

const RULES_PATH = fileURLToPath(new URL("../../../firestore.rules", import.meta.url));

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
    projectId: "primovex-pentest",
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
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
    await setDoc(doc(db, "clinflow_workflow_records", "rec-primary"), {
      dataMode: "synthetic", practiceId: "primary", siteId: "SITE-MAIN",
    });
    await setDoc(doc(db, "clinflow_workflow_records", "rec-siteB"), {
      dataMode: "synthetic", practiceId: "site-b", siteId: "SITE-B",
    });
    await setDoc(doc(db, "users", "sitea-uid"), { role: "User", practiceId: "site-a" });
    // compliance checks / cleaning notes
    await setDoc(doc(db, "users", "caretaker-uid"), { role: "Caretaker", displayName: "Caretaker" });
    await setDoc(doc(db, "users", "nurse-uid"), { role: "Nurse", displayName: "Nurse" });
    await setDoc(doc(db, "users", "cleaner-uid"), { role: "Cleaner", displayName: "Cleaner" });
    await setDoc(doc(db, "users", "cleaner2-uid"), { role: "Cleaner", displayName: "Cleaner Two" });
    await setDoc(doc(db, "compliance_assets", "asset-wh1"), { assetCode: "WH-001", label: "Hot tap", assetType: "water_hot", qrPayload: "MEDTRAK:COMPLIANCE:asset-wh1", siteId: "main_branch" });
    for (const id of ["log-c1", "log-c2", "log-c3", "log-c4"]) {
      await setDoc(doc(db, "cleaning_logs", id), { roomId: "room-1", roomName: "Room 1", cleanedBy: "Cleaner", cleanedByUid: "cleaner-uid", method: "nfc-session" });
    }
  });

  const admin = testEnv.authenticatedContext("admin-uid").firestore();
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
  const anon = testEnv.unauthenticatedContext().firestore();

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
  await check("Admin CAN still correct a cleaning log", () =>
    assertSucceeds(updateDoc(doc(admin, "cleaning_logs", "log-c4"), { notes: "Admin correction" })));

  console.log(`\n${pass} passed, ${fail} failed`);
  await testEnv.cleanup();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
