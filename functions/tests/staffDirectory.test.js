const test = require("node:test");
const assert = require("node:assert/strict");
const { staffDirectoryEntries, staffLabel } = require("../services/staffDirectoryService");

const users = [
  { id: "liz", displayName: "Liz Howard", email: "liz@example.nhs.uk", role: "Practice Manager", extra: "ignored" },
  { id: "craig", displayName: "Craig", email: "craig@example.nhs.uk", role: "Medical Secretary" },
  { id: "noname", email: "noname@example.nhs.uk", role: "Nurse" },
  { id: "left", displayName: "Left Practice", role: "Nurse", active: false },
  { id: "ben", displayName: "ben partner", role: "Partner", active: true },
];

test("everyone active is listed, including the line manager, sorted by name ignoring case", () => {
  const list = staffDirectoryEntries(users);
  assert.deepEqual(list.map((u) => u.id), ["ben", "craig", "liz", "noname"]);
  assert.ok(list.some((u) => u.id === "liz" && u.label === "Liz Howard"));
});

test("deactivated accounts are left out", () => {
  assert.ok(!staffDirectoryEntries(users).some((u) => u.id === "left"));
});

test("only an id, a label and the role are returned - no email or other profile fields", () => {
  const entry = staffDirectoryEntries(users).find((u) => u.id === "liz");
  assert.deepEqual(Object.keys(entry).sort(), ["id", "label", "role"]);
  assert.ok(!JSON.stringify(staffDirectoryEntries(users)).includes("liz@example.nhs.uk"), "Liz's address is not sent");
  // the address is used as a label only for someone with no name
  assert.equal(staffDirectoryEntries(users).find((u) => u.id === "noname").label, "noname@example.nhs.uk");
  assert.equal(staffDirectoryEntries(users).find((u) => u.id === "liz").label.includes("@"), false);
});

test("a person with neither name nor email still gets a usable label; junk rows are skipped", () => {
  assert.equal(staffLabel({}), "Unnamed user");
  assert.deepEqual(staffDirectoryEntries([null, {}, { displayName: "No id" }]), []);
  assert.deepEqual(staffDirectoryEntries(undefined), []);
});
