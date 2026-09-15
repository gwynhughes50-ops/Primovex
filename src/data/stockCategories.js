// Fixed Category -> Subcategory taxonomy for stock items, based on how a UK
// GP practice actually organises its stock room (agreed with the practice,
// not just a generic guess). Category/subcategory used to be free text (see
// git history of Inventory.jsx / ManualAddItemDialog.jsx), which meant the
// same real-world category could end up stored a dozen different ways
// ("PPE" vs "ppe" vs "Ppe"). A fixed list is what makes category tabs in
// Inventory.jsx actually narrow things down instead of fragmenting.
export const UNCATEGORISED_CATEGORY = "uncategorised";
export const UNCATEGORISED_SUBCATEGORY = "needs-review";

export const STOCK_CATEGORIES = [
  {
    id: "clinical-consumables",
    label: "Clinical Consumables",
    icon: "🏥",
    subcategories: [
      { id: "dressings", label: "Dressings" },
      { id: "wound-care", label: "Wound Care" },
      { id: "needles-syringes", label: "Needles & Syringes" },
      { id: "blood-collection", label: "Blood Collection" },
      { id: "specimen-collection", label: "Specimen Collection" },
      { id: "injection-supplies", label: "Injection Supplies" },
      { id: "ppe", label: "PPE" },
      { id: "continence", label: "Continence" },
      { id: "womens-health", label: "Women's Health" },
      { id: "respiratory", label: "Respiratory" },
      { id: "diabetes", label: "Diabetes" },
      { id: "minor-surgery", label: "Minor Surgery" },
      { id: "vaccination-supplies", label: "Vaccination Supplies" },
    ],
  },
  {
    id: "medicines",
    label: "Medicines",
    icon: "💊",
    subcategories: [
      { id: "emergency-drugs", label: "Emergency Drugs" },
      { id: "vaccines", label: "Vaccines" },
      { id: "regular-medicines", label: "Regular Medicines" },
      { id: "controlled-drugs", label: "Controlled Drugs" },
      { id: "travel-medicines", label: "Travel Medicines" },
      { id: "topical-medicines", label: "Topical Medicines" },
    ],
  },
  {
    id: "emergency-equipment",
    label: "Emergency Equipment",
    icon: "🚑",
    subcategories: [
      { id: "resuscitation", label: "Resuscitation" },
      { id: "airway-management", label: "Airway Management" },
      { id: "oxygen", label: "Oxygen" },
      { id: "defibrillation", label: "Defibrillation" },
      { id: "anaphylaxis-kit", label: "Anaphylaxis Kit" },
      { id: "emergency-bag", label: "Emergency Bag" },
    ],
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    icon: "🧪",
    subcategories: [
      { id: "urinalysis", label: "Urinalysis" },
      { id: "pregnancy-testing", label: "Pregnancy Testing" },
      { id: "ecg-consumables", label: "ECG Consumables" },
      { id: "spirometry", label: "Spirometry" },
      { id: "point-of-care-testing", label: "Point of Care Testing" },
      { id: "vision-hearing", label: "Vision & Hearing" },
    ],
  },
  {
    id: "laboratory",
    label: "Laboratory",
    icon: "🩸",
    subcategories: [
      { id: "blood-tubes", label: "Blood Tubes" },
      { id: "pathology-supplies", label: "Pathology Supplies" },
      { id: "swabs", label: "Swabs" },
      { id: "sample-bags", label: "Sample Bags" },
      { id: "labels-forms", label: "Labels & Forms" },
    ],
  },
  {
    id: "cleaning-infection-control",
    label: "Cleaning & Infection Control",
    icon: "🧼",
    subcategories: [
      { id: "cleaning-products", label: "Cleaning Products" },
      { id: "disinfectants", label: "Disinfectants" },
      { id: "sharps-disposal", label: "Sharps Disposal" },
      { id: "clinical-waste", label: "Clinical Waste" },
      { id: "hand-hygiene", label: "Hand Hygiene" },
    ],
  },
  {
    id: "office-administration",
    label: "Office & Administration",
    icon: "🏢",
    subcategories: [
      { id: "stationery", label: "Stationery" },
      { id: "printer-supplies", label: "Printer Supplies" },
      { id: "forms", label: "Forms" },
      { id: "labels", label: "Labels" },
      { id: "patient-information", label: "Patient Information" },
    ],
  },
  {
    id: "equipment-assets",
    label: "Equipment & Assets",
    icon: "🛠",
    subcategories: [
      { id: "medical-equipment", label: "Medical Equipment" },
      { id: "it-equipment", label: "IT Equipment" },
      { id: "furniture", label: "Furniture" },
      { id: "batteries", label: "Batteries" },
      { id: "chargers-cables", label: "Chargers & Cables" },
    ],
  },
  {
    id: "cold-chain",
    label: "Cold Chain",
    icon: "❄️",
    subcategories: [
      { id: "fridge-stock", label: "Fridge Stock" },
      { id: "temperature-monitoring", label: "Temperature Monitoring" },
      { id: "cold-chain-accessories", label: "Cold Chain Accessories" },
    ],
  },
  {
    id: "rooms-facilities",
    label: "Rooms & Facilities",
    icon: "🏥",
    subcategories: [
      { id: "consultation-room-stock", label: "Consultation Room Stock" },
      { id: "treatment-room-stock", label: "Treatment Room Stock" },
      { id: "nurse-room-stock", label: "Nurse Room Stock" },
      { id: "reception-supplies", label: "Reception Supplies" },
      { id: "kitchen-supplies", label: "Kitchen Supplies" },
      { id: "maintenance", label: "Maintenance" },
    ],
  },
  {
    id: "general-stores",
    label: "General Stores",
    icon: "📦",
    subcategories: [
      { id: "general-consumables", label: "General Consumables" },
      { id: "packaging", label: "Packaging" },
      { id: "storage-containers", label: "Storage Containers" },
      { id: "miscellaneous", label: "Miscellaneous" },
    ],
  },
  {
    id: UNCATEGORISED_CATEGORY,
    label: "Uncategorised",
    icon: "❔",
    subcategories: [
      { id: UNCATEGORISED_SUBCATEGORY, label: "Needs review" },
    ],
  },
];

export function findCategory(categoryId) {
  return STOCK_CATEGORIES.find((cat) => cat.id === categoryId) || null;
}

export function getSubcategories(categoryId) {
  return findCategory(categoryId)?.subcategories || [];
}

export function categoryLabel(categoryId) {
  return findCategory(categoryId)?.label || categoryId || "Uncategorised";
}

export function subcategoryLabel(categoryId, subcategoryId) {
  if (!subcategoryId) return "";
  const match = getSubcategories(categoryId).find((sub) => sub.id === subcategoryId);
  // No raw-id fallback here on purpose: an id that doesn't resolve under this
  // category (mapping bug, stale data) should disappear from display rather
  // than leak an internal slug like "general-stores" into the UI.
  return match?.label || "";
}

// Legacy category values in the wild (free text typed into the old Inventory
// edit form, plus the old fixed 6-value enum used by ManualAddItemDialog /
// createStockItem's default) get matched here, most-specific rule first, so
// existing items land in a sensible bucket instead of every one landing in
// Uncategorised the moment this taxonomy ships. Anything that doesn't match
// falls through to Uncategorised for manual review, per the "auto-map, then
// review the leftovers" approach.
const LEGACY_MAPPING_RULES = [
  { test: /emergency.?drug/, category: "medicines", subcategory: "emergency-drugs" },
  { test: /controlled.?drug/, category: "medicines", subcategory: "controlled-drugs" },
  { test: /travel.?(medic|vaccin)/, category: "medicines", subcategory: "travel-medicines" },
  { test: /topical/, category: "medicines", subcategory: "topical-medicines" },
  { test: /vaccin/, category: "medicines", subcategory: "vaccines" },
  { test: /^medicinal$|medicine|pharmacy|\bdrug/, category: "medicines", subcategory: "regular-medicines" },

  { test: /resuscitat|resus/, category: "emergency-equipment", subcategory: "resuscitation" },
  { test: /airway/, category: "emergency-equipment", subcategory: "airway-management" },
  { test: /oxygen/, category: "emergency-equipment", subcategory: "oxygen" },
  { test: /defib/, category: "emergency-equipment", subcategory: "defibrillation" },
  { test: /anaphyla/, category: "emergency-equipment", subcategory: "anaphylaxis-kit" },
  { test: /emergency/, category: "emergency-equipment", subcategory: "emergency-bag" },

  { test: /urinal|urine|dipstick/, category: "diagnostics", subcategory: "urinalysis" },
  { test: /pregnancy.?test/, category: "diagnostics", subcategory: "pregnancy-testing" },
  { test: /ecg/, category: "diagnostics", subcategory: "ecg-consumables" },
  { test: /spirometry/, category: "diagnostics", subcategory: "spirometry" },
  { test: /point.?of.?care/, category: "diagnostics", subcategory: "point-of-care-testing" },
  { test: /vision|hearing|audio/, category: "diagnostics", subcategory: "vision-hearing" },
  { test: /diagnostic/, category: "diagnostics", subcategory: "point-of-care-testing" },

  { test: /blood.?(tube|collection)|phlebotomy/, category: "laboratory", subcategory: "blood-tubes" },
  { test: /patholog/, category: "laboratory", subcategory: "pathology-supplies" },
  { test: /swab/, category: "laboratory", subcategory: "swabs" },
  { test: /sample.?bag/, category: "laboratory", subcategory: "sample-bags" },

  { test: /clean/, category: "cleaning-infection-control", subcategory: "cleaning-products" },
  { test: /disinfect/, category: "cleaning-infection-control", subcategory: "disinfectants" },
  { test: /sharps/, category: "cleaning-infection-control", subcategory: "sharps-disposal" },
  { test: /clinical.?waste/, category: "cleaning-infection-control", subcategory: "clinical-waste" },
  { test: /hand.?(hygiene|sanitiser|sanitizer)|infection.?control/, category: "cleaning-infection-control", subcategory: "hand-hygiene" },
  { test: /\bppe\b|glove|apron|mask/, category: "clinical-consumables", subcategory: "ppe" },

  { test: /station|printer.?label|printer/, category: "office-administration", subcategory: "stationery" },
  { test: /admin/, category: "office-administration", subcategory: "forms" },

  { test: /fridge.?stock/, category: "cold-chain", subcategory: "fridge-stock" },
  { test: /temperature.?monitor/, category: "cold-chain", subcategory: "temperature-monitoring" },
  { test: /cold.?chain/, category: "cold-chain", subcategory: "cold-chain-accessories" },

  { test: /it.?equipment|computer|laptop/, category: "equipment-assets", subcategory: "it-equipment" },
  { test: /furniture/, category: "equipment-assets", subcategory: "furniture" },
  { test: /batter/, category: "equipment-assets", subcategory: "batteries" },
  { test: /charger|cable/, category: "equipment-assets", subcategory: "chargers-cables" },
  { test: /^equipment$|equipment/, category: "equipment-assets", subcategory: "medical-equipment" },

  { test: /dressing/, category: "clinical-consumables", subcategory: "dressings" },
  { test: /wound/, category: "clinical-consumables", subcategory: "wound-care" },
  { test: /needle|syringe/, category: "clinical-consumables", subcategory: "needles-syringes" },
  { test: /injection/, category: "clinical-consumables", subcategory: "injection-supplies" },
  { test: /continence/, category: "clinical-consumables", subcategory: "continence" },
  { test: /women/, category: "clinical-consumables", subcategory: "womens-health" },
  { test: /respirator|inhaler|nebul/, category: "clinical-consumables", subcategory: "respiratory" },
  { test: /diabet/, category: "clinical-consumables", subcategory: "diabetes" },
  { test: /minor.?surg|suture/, category: "clinical-consumables", subcategory: "minor-surgery" },
  { test: /clinical.?consumable|consumable/, category: "clinical-consumables", subcategory: "" },

  { test: /non.?medical/, category: "general-stores", subcategory: "general-consumables" },
  { test: /packaging/, category: "general-stores", subcategory: "packaging" },
  { test: /storage.?container/, category: "general-stores", subcategory: "storage-containers" },
];

export function resolveLegacyCategory(rawCategory) {
  const value = String(rawCategory || "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!value) return { category: UNCATEGORISED_CATEGORY, subcategory: UNCATEGORISED_SUBCATEGORY };

  for (const rule of LEGACY_MAPPING_RULES) {
    if (rule.test.test(value)) return { category: rule.category, subcategory: rule.subcategory };
  }
  return { category: UNCATEGORISED_CATEGORY, subcategory: UNCATEGORISED_SUBCATEGORY };
}

// A stock item is considered "on the new taxonomy" once its category id
// resolves to a real entry — items still holding old free-text/enum values
// get resolved on the fly via resolveLegacyCategory() until something writes
// the normalised value back (see normalizeStockItemCategory in stockService.js).
export function isKnownCategory(categoryId) {
  return STOCK_CATEGORIES.some((cat) => cat.id === categoryId);
}
