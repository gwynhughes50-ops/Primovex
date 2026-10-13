// Finding a medicine by typing a few letters, from the NHS dm+d list (src/data/medicineNames.json: the substance names and the
// brand names that lead to them). Used wherever a stock item is named, so a name is picked from the official list or typed in
// by hand. The list holds names only (not strengths or forms), so those are still chosen separately. Pure, so it can be tested.

const TITLE_SMALL = new Set(["and", "with", "of", "in", "for", "to"]);

// "chlorphenamine" -> "Chlorphenamine", "articaine + adrenaline" -> "Articaine + Adrenaline"
export function titleCase(text) {
  return String(text || "")
    .split(" ")
    .map((word, index) => (word === "+" || (index > 0 && TITLE_SMALL.has(word)) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

const norm = (text) => String(text || "").toLowerCase().replace(/\s+/g, " ").trim();

// data: { generics: [name], brands: { brand: genericIndex | genericName } }
// Returns up to `limit` suggestions: { name, brand, label, kind } where name is the substance and brand is set when a brand was typed.
export function searchMedicines(data, query, { limit = 8 } = {}) {
  const q = norm(query);
  if (!data || q.length < 2) return [];
  const generics = data.generics || [];
  const results = [];
  const seen = new Set();
  const push = (entry, rank) => {
    const key = `${entry.name}|${entry.brand}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ ...entry, rank });
  };

  generics.forEach((generic) => {
    const g = norm(generic);
    if (g === q) push({ name: titleCase(g), brand: "", label: titleCase(g), kind: "generic" }, 0);
    else if (g.startsWith(q)) push({ name: titleCase(g), brand: "", label: titleCase(g), kind: "generic" }, 2);
  });
  for (const [brand, target] of Object.entries(data.brands || {})) {
    const b = norm(brand);
    const generic = typeof target === "number" ? generics[target] : target;
    if (!generic) continue;
    if (b === q) push({ name: titleCase(norm(generic)), brand: titleCase(b), label: `${titleCase(b)} (${titleCase(norm(generic))})`, kind: "brand" }, 1);
    else if (b.startsWith(q)) push({ name: titleCase(norm(generic)), brand: titleCase(b), label: `${titleCase(b)} (${titleCase(norm(generic))})`, kind: "brand" }, 3);
  }
  // a word inside a substance name ("acid" in "tranexamic acid") only when there is room left
  if (results.length < limit) {
    generics.forEach((generic) => {
      const g = norm(generic);
      if (!g.startsWith(q) && g.includes(q)) push({ name: titleCase(g), brand: "", label: titleCase(g), kind: "generic" }, 4);
    });
  }
  return results
    .sort((a, b) => a.rank - b.rank || a.label.length - b.label.length || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map(({ rank, ...rest }) => rest);
}
