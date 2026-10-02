// Renaming a floor or zone in the Space Registry (Spaces > Current hierarchy).
// Pure: takes the registry state ({ floors, zones, spaces, ... }) and returns
// the next one, so it can be tested. Ids never change - only the display name
// - so every space, tag, check and history entry that points at the floor or
// zone keeps working. Spaces also carry a copy of the name ("floor",
// "floorName", "zone", "zoneName") that other screens fall back on, so those
// are kept in step too.
//
// Sites are not renamed here: a linked site takes its name from Practice Admin
// (see siteLink.js).

const COLLECTIONS = {
  floors: { idKey: "floorId", nameKeys: ["floor", "floorName"], label: "floor" },
  zones: { idKey: "zoneId", nameKeys: ["zone", "zoneName"], label: "zone" },
};

const norm = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Returns { ok: true, state } or { ok: false, error } - the error is plain
// English, ready to show next to the field.
export function renameHierarchyItem(state, collection, itemId, newName) {
  const spec = COLLECTIONS[collection];
  if (!spec) return { ok: false, error: "That can't be renamed here." };

  const item = (state[collection] || []).find((entry) => entry.id === itemId);
  if (!item) return { ok: false, error: `That ${spec.label} no longer exists.` };

  const name = String(newName ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: `Enter a name for the ${spec.label}.` };
  if (name === item.name) return { ok: true, state };

  const clash = (state[collection] || []).some(
    (entry) => entry.id !== itemId && entry.siteId === item.siteId && norm(entry.name) === norm(name)
  );
  if (clash) {
    return { ok: false, error: `This site already has a ${spec.label} called "${name}". Choose a different name.` };
  }

  const now = new Date().toISOString();
  return {
    ok: true,
    state: {
      ...state,
      [collection]: state[collection].map((entry) => (entry.id === itemId ? { ...entry, name } : entry)),
      spaces: (state.spaces || []).map((space) => {
        if (space[spec.idKey] !== itemId) return space;
        const next = { ...space, updatedAt: now };
        for (const key of spec.nameKeys) next[key] = name;
        return next;
      }),
    },
  };
}
