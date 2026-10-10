import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StockItemEditDialog, { formFromItem } from "../src/components/stock/StockItemEditDialog.jsx";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const render = (item, items = []) => renderToStaticMarkup(React.createElement(StockItemEditDialog, { item, items, onClose: () => {} }));

const hydrocortisone = { id: "hc", name: "Hydrocortisone", strength: "100mg", form: "Injection", brand: "Solu-Cortef", barcode: "5000453122040", batch_number: "B77", expiry_date: "2027-05-31", site: "Main Surgery", location: "Emergency Trolley", category: "medicines", subcategory: "regular-medicines", min_stock: 4, units_per_box: 10, order_quantity: 2, lead_time_days: 3, supplier_sku: "SKU-1" };
const noSite = { id: "mv", name: "Multivitamins", site: "", location: "" };

t("the form starts from the item's own details", () => {
  const form = formFromItem(hydrocortisone);
  assert.deepEqual([form.name, form.strength, form.form, form.site, form.location, form.min_stock, form.order_quantity], ["Hydrocortisone", "100mg", "Injection", "Main Surgery", "Emergency Trolley", 4, 2]);
  assert.equal(form.hasBatches, false);
  const bare = formFromItem({});
  assert.deepEqual([bare.name, bare.min_stock, bare.order_quantity, bare.lead_time_days], ["", 0, 1, 0]);
});

t("the window opens showing the item, with its site and location picked from the lists", () => {
  const html = render(hydrocortisone, [hydrocortisone]);
  assert.match(html, /Edit item/);
  assert.match(html, /value="Hydrocortisone"/);
  assert.match(html, /value="100mg"/);
  assert.match(html, /value="5000453122040"/);
  assert.match(html, /<option value="Main Surgery" selected="">Main Surgery<\/option>/);
  assert.match(html, /<option value="Emergency Trolley" selected="">Emergency Trolley<\/option>/);
  assert.match(html, /Save changes/);
  assert.match(html, /Cancel/);
});

t("an item with no site or location opens ready to be fixed, and can't be saved until both are chosen", () => {
  const html = render(noSite, [noSite]);
  assert.match(html, /value="Multivitamins"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Save changes<\/button>/, "Save is off until a site and location are chosen");
});

t("an item that has batches lists them instead of a single batch and expiry box", () => {
  const batched = { ...hydrocortisone, current_stock: 8, batches: [{ batch_number: "A1", expiry_date: "2027-01-31", quantity: 5 }, { batch_number: "B2", expiry_date: "2028-02-29", quantity: 3 }] };
  const html = render(batched, [batched]);
  assert.match(html, /A1/);
  assert.match(html, /B2/);
});

t("with nothing to edit, nothing is drawn", () => {
  assert.equal(render(null), "");
});

console.log(`\n${n} passed`);
