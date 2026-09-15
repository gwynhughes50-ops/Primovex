import assert from "node:assert/strict";
import fs from "node:fs";

const rules = fs.readFileSync("firestore.rules", "utf8");
const functions = fs.readFileSync("functions/index.js", "utf8");
const client = fs.readFileSync("src/core/identity/auditService.js", "utf8");
const panel = fs.readFileSync("src/components/security/AuditLedgerPanel.jsx", "utf8");

assert.match(rules, /match \/audit_events\/\{eventId\}[\s\S]*?allow create: if false;[\s\S]*?allow update, delete: if false;/);
assert.match(rules, /match \/audit_ledger_heads\/\{practiceId\}[\s\S]*?allow read, write: if false;/);
assert.match(rules, /function auditPracticeMatches\(practiceId\)[\s\S]*?practiceId == tenant;/);
assert.match(rules, /match \/stock_movements\/\{docId\}[\s\S]*?affectedKeys\(\)[\s\S]*?reversal_movement_id[\s\S]*?allow delete: if false;/);
assert.match(functions, /exports\.recordGovernedAuditEvent = onCall/);
assert.match(client, /httpsCallable\(functions, "recordGovernedAuditEvent"/);
assert.match(panel, /Evidence JSON/);
assert.doesNotMatch(client, /actorUid:\s*actor/);

console.log("Governed audit verification passed: server authority, tenant isolation, immutable rules, controlled reversal, client gateway and evidence export are present.");
