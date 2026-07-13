/**
 * One-time backfill for Aurora Stock Control
 * Creates/repairs barcode index docs:
 *   stock_barcodes/{barcodeKey} -> { barcode, item_id, created_at, updated_at }
 *
 * Usage:
 *   node scripts/backfillBarcodes.mjs --dry-run
 *   node scripts/backfillBarcodes.mjs
 *
 * Optional:
 *   --force  Overwrite existing barcode docs pointing to another item (NOT recommended)
 */

import admin from "firebase-admin";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");

// ---- CONFIG ----
const STOCK_ITEMS_COL = "stock_items";
const STOCK_BARCODES_COL = "stock_barcodes";

// Normalize barcodes the same way the app does
function normalizeBarcode(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function main() {   
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    const keyPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.resolve(__dirname, "keys", "serviceAccount.json");
    
    if (!fs.existsSync(keyPath)) {
      throw new Error(
        `Service account JSON not found. Expected at:\n- ${keyPath}\n\n` +
          `Put your key at: scripts/keys/serviceAccount.json`
      );
    }
    
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId:
          serviceAccount.project_id ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.GCLOUD_PROJECT,
      });
    }
    

  const db = admin.firestore();

  console.log("\n=== Barcode Backfill ===");
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`FORCE:   ${FORCE}\n`);

  const snap = await db.collection(STOCK_ITEMS_COL).get();
  console.log(`Found ${snap.size} stock items`);

  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Build barcode -> items map
  const byBarcode = new Map();

  for (const it of items) {
    const raw = it.barcode;
    const key = normalizeBarcode(raw);
    if (!key) continue;

    const list = byBarcode.get(key) || [];
    list.push({
      id: it.id,
      name: it.name || "",
      barcode: raw,
    });
    byBarcode.set(key, list);
  }

  // Detect duplicates in source data
  const duplicates = Array.from(byBarcode.entries()).filter(
    ([, arr]) => arr.length > 1
  );

  if (duplicates.length) {
    console.log("\n⚠️ Duplicate barcodes found in stock_items:");
    for (const [key, arr] of duplicates) {
      console.log(`- "${key}" used by:`);
      for (const it of arr) {
        console.log(`   • ${it.id}  "${it.name}" (${it.barcode})`);
      }
    }
    console.log(
      "\nResolve these duplicates before relying on barcode scanning.\n"
    );
  } else {
    console.log("✅ No duplicate barcodes found in stock_items.\n");
  }

  const entries = Array.from(byBarcode.entries()).map(([barcodeKey, arr]) => ({
    barcodeKey,
    item: arr[0], // first wins unless --force
  }));

  console.log(`Preparing ${entries.length} barcode index records`);

  const batches = chunkArray(entries, 400);

  let created = 0;
  let skipped = 0;
  let conflicts = 0;
  let overwritten = 0;

  for (let bi = 0; bi < batches.length; bi++) {
    const batchItems = batches[bi];

    const refs = batchItems.map((x) =>
      db.collection(STOCK_BARCODES_COL).doc(x.barcodeKey)
    );

    const existing = await db.getAll(...refs);

    const batch = db.batch();
    let ops = 0;

    for (let i = 0; i < batchItems.length; i++) {
      const { barcodeKey, item } = batchItems[i];
      const ref = refs[i];
      const snap = existing[i];

      const payload = {
        barcode: item.barcode,
        item_id: item.id,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      };

      if (!snap.exists) {
        if (!DRY_RUN) {
          batch.set(ref, {
            ...payload,
            created_at: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
        created++;
        ops++;
        continue;
      }

      const current = snap.data();
      if (current.item_id === item.id) {
        skipped++;
        continue;
      }

      conflicts++;

      if (FORCE) {
        if (!DRY_RUN) {
          batch.set(ref, payload, { merge: true });
        }
        overwritten++;
        ops++;
      } else {
        console.log(
          `⚠️ Conflict: barcode "${barcodeKey}" points to "${current.item_id}", expected "${item.id}"`
        );
      }
    }

    if (!DRY_RUN && ops > 0) {
      await batch.commit();
      console.log(`Committed batch ${bi + 1}/${batches.length} (${ops} writes)`);
    } else {
      console.log(`Dry-run batch ${bi + 1}/${batches.length} (${ops} writes)`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Created:     ${created}`);
  console.log(`Skipped:     ${skipped}`);
  console.log(`Conflicts:   ${conflicts}`);
  console.log(`Overwritten: ${overwritten}`);
  console.log("================\n");

  if (duplicates.length) {
    console.log(
      "❗ Fix duplicate barcodes in stock_items, then re-run this script.\n"
    );
  } else if (conflicts && !FORCE) {
    console.log(
      "❗ Resolve barcode conflicts or re-run with --force if you are certain.\n"
    );
  } else {
    console.log("✅ Barcode index backfill complete.\n");
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
