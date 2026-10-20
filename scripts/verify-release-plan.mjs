import assert from "node:assert/strict";
import { buildReleasePlan, nothingChosen, parseReleaseArgs, publishing } from "./release-plan.mjs";

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };
const ids = (opts) => buildReleasePlan(opts).map((s) => s.id);

t("a full release runs in the order that keeps each step safe", () => {
  assert.deepEqual(ids(parseReleaseArgs(["--all", "--bump", "--rules", "--functions", "--play"])),
    ["bump", "tests", "rules", "functions", "desktop", "hosting", "check-hosting", "android-build", "android-send", "play-bundle"]);
});

t("tests come before anything is built or published, and can only be skipped on purpose", () => {
  const all = ids(parseReleaseArgs(["--all"]));
  assert.equal(all[0], "tests");
  assert.ok(!ids(parseReleaseArgs(["--all", "--skip-tests"])).includes("tests"));
});

t("the desktop installer is built before hosting, so the update files go live with the web app; Android is built after hosting", () => {
  const all = ids(parseReleaseArgs(["--all"]));
  assert.ok(all.indexOf("desktop") < all.indexOf("hosting"));
  assert.ok(all.indexOf("hosting") < all.indexOf("android-build"));
  assert.ok(!all.includes("build"), "the desktop build already makes the web build");
  assert.deepEqual(ids(parseReleaseArgs(["--web"])), ["tests", "build", "hosting", "check-hosting"]);
});

t("Android alone builds the web app first and does not deploy hosting", () => {
  assert.deepEqual(ids(parseReleaseArgs(["--android"])), ["tests", "build", "android-build", "android-send"]);
});

t("the Google Play bundle is built but never uploaded or sent", () => {
  const plan = buildReleasePlan(parseReleaseArgs(["--play"]));
  assert.deepEqual(plan.map((s) => s.id), ["tests", "play-bundle"]);
  assert.equal(publishing(plan).length, 0);
});

t("what goes live or is sent is listed for the one question 'go ahead?'", () => {
  const live = publishing(buildReleasePlan(parseReleaseArgs(["--all", "--rules", "--functions"]))).map((s) => s.id);
  assert.deepEqual(live, ["rules", "functions", "hosting", "android-send"]);
  assert.equal(publishing(buildReleasePlan(parseReleaseArgs(["--desktop", "--dry-run"]))).length, 1);
});

t("deploys target this project, functions get the discovery timeout, and notes reach the desktop build", () => {
  const plan = buildReleasePlan(parseReleaseArgs(["--all", "--functions", "--notes", "Fire test checklist"]));
  const byId = Object.fromEntries(plan.map((s) => [s.id, s]));
  assert.ok(byId.hosting.args.includes("medtrak-b1cad"));
  assert.equal(byId.functions.env.FUNCTIONS_DISCOVERY_TIMEOUT, "60");
  assert.deepEqual(byId.desktop.args, ["scripts/desktop-release.mjs", "--notes", "Fire test checklist"]);
});

t("arguments: nothing chosen is caught, a bad bump is refused, dry run and yes are read", () => {
  assert.ok(nothingChosen(parseReleaseArgs([])));
  assert.ok(nothingChosen(parseReleaseArgs(["--bump", "--yes"])));
  assert.ok(!nothingChosen(parseReleaseArgs(["--rules"])));
  assert.throws(() => parseReleaseArgs(["--web", "--bump", "major"]), /patch or minor/);
  assert.equal(parseReleaseArgs(["--web", "--bump"]).bump, "patch");
  assert.equal(parseReleaseArgs(["--web", "--bump", "minor"]).bump, "minor");
  const o = parseReleaseArgs(["--web", "--dry-run", "--yes"]);
  assert.ok(o.dryRun && o.yes);
});

console.log(`\n${n} passed`);
