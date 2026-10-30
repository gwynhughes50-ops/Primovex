import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const indexes = JSON.parse(read("firestore.indexes.json")).indexes;
const key = (i) => `${i.collectionGroup}|${i.fields.map((f) => `${f.fieldPath} ${f.order}`).join(",")}`;
const have = new Set(indexes.map(key));

// Every query that filters on one field and sorts by another needs a composite index on the live database, or it fails with "failed-precondition" and the screen quietly shows nothing.
// The concern history (timeline, learning actions, correspondence) and the significant event history were missing theirs on the live database until 2026-10-30.
t("the indexes that already exist on the live database are all kept, so a deploy never removes one", () => {
  for (const wanted of [
    "temperature_logs|unitId ASCENDING,created_at DESCENDING", "compliance_checks|assetId ASCENDING,createdAt DESCENDING", "stock_items|archived_at ASCENDING,updated_at DESCENDING",
    "stock_movements|item_id ASCENDING,created_at DESCENDING", "audit_events|practiceId ASCENDING,occurredAt DESCENDING", "usage_sessions|practiceId ASCENDING,startedAt DESCENDING",
  ]) assert.ok(have.has(wanted), wanted);
});

t("the concern and significant event histories have the index their queries need", () => {
  assert.ok(have.has("governance_concern_timeline|concernId ASCENDING,createdAt DESCENDING"));
  assert.ok(have.has("governance_concern_learning_actions|concernId ASCENDING,createdAt DESCENDING"));
  assert.ok(have.has("governance_concern_correspondence|concernId ASCENDING,occurredAt DESCENDING"));
  assert.ok(have.has("governance_se_timeline|seId ASCENDING,createdAt DESCENDING"));
});

t("each of those indexes matches a query that is really in the code", () => {
  const service = read("src/modules/governance/services/concernService.js");
  assert.match(service, /CONCERN_TIMELINE_COLLECTION\), where\("concernId", "==", concernId\), orderBy\("createdAt", "desc"\)/);
  assert.match(service, /CONCERN_LEARNING_COLLECTION\), where\("concernId", "==", concernId\), orderBy\("createdAt", "desc"\)/);
  assert.match(service, /CONCERN_CORRESPONDENCE_COLLECTION\), where\("concernId", "==", concernId\), orderBy\("occurredAt", "desc"\)/);
  assert.match(read("src/modules/governance/services/seService.js"), /SE_TIMELINE_COLLECTION\), where\("seId", "==", seId\), orderBy\("createdAt", "desc"\)/);
  assert.match(read("src/modules/governance/services/concernPrint.js"), /CONCERN_TIMELINE_COLLECTION\), where\("concernId", "==", concernId\), orderBy\("createdAt", "desc"\), limit\(1000\)/);
});

t("every index names a collection and has no duplicate", () => {
  assert.equal(have.size, indexes.length, "no index is listed twice");
  for (const index of indexes) assert.ok(index.collectionGroup && index.queryScope === "COLLECTION" && index.fields.length >= 2);
});

console.log(`\n${n} passed`);
