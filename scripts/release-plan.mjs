// What a release does and in what order. Pure (no spawning, no files), so the order can be tested; scripts/release.mjs runs it.
//
// The order matters:
//   - tests first, so nothing is built from something broken
//   - rules and functions go before the app that depends on them
//   - the desktop build comes before the hosting deploy, because hosting publishes its update files together with the web app
//   - the Android build comes after hosting has finished uploading, because both write the dist folder
//   - the Google Play bundle is built last and never uploaded by this script (that is done in the Play Console)

export const FIREBASE_PROJECT = "medtrak-b1cad";
export const ANDROID_APP_ID = "1:604281618962:android:0502496dd67aa7ddf88ecb";
export const TESTERS = "gwyn.hughes@wales.nhs.uk,gwynhughes30@gmail.com";

export const STEP_KINDS = { local: "local", publish: "publish" };

// opts: { web, android, desktop, rules, functions, play, bump, skipTests, notes }
export function buildReleasePlan(opts = {}) {
  const { web, android, desktop, rules, functions, play, bump, skipTests, notes = "" } = opts;
  const steps = [];
  const add = (id, label, kind, run) => steps.push({ id, label, kind, ...run });

  if (bump) add("bump", `Raise the version number (${bump})`, "local", { fn: "bump", arg: bump });
  if (!skipTests) add("tests", "Run every test", "local", { fn: "tests" });

  if (rules) add("rules", "Deploy Firestore and Storage rules", "publish", { cmd: "firebase", args: ["deploy", "--only", "firestore:rules,storage", "--project", FIREBASE_PROJECT] });
  if (functions) add("functions", "Deploy Cloud Functions", "publish", { cmd: "firebase", args: ["deploy", "--only", "functions", "--project", FIREBASE_PROJECT], env: { FUNCTIONS_DISCOVERY_TIMEOUT: "60" } });

  if (desktop) {
    add("desktop", "Build the signed Windows installer and stage the update", "local", { cmd: "node", args: ["scripts/desktop-release.mjs", ...(notes ? ["--notes", notes] : [])] });
  } else if (web || android) {
    add("build", "Build the web app", "local", { cmd: "npm", args: ["run", "build"] });
  }

  if (web || desktop) {
    add("hosting", "Deploy the web app (and the desktop update files)", "publish", { cmd: "firebase", args: ["deploy", "--only", "hosting", "--project", FIREBASE_PROJECT] });
    add("check-hosting", "Check the live site is the build just made", "local", { fn: "checkHosting", desktop: Boolean(desktop) });
  }

  if (android) {
    add("android-build", "Build the Android app", "local", { fn: "androidBuild" });
    add("android-send", "Send the Android app to the testers", "publish", { fn: "androidSend" });
  }

  if (play) add("play-bundle", "Build the Google Play bundle (to upload in the Play Console)", "local", { fn: "playBundle" });

  return steps;
}

// the steps that put something live or send it to people, for the one question "go ahead?"
export const publishing = (steps) => steps.filter((s) => s.kind === "publish");

export function parseReleaseArgs(argv = []) {
  const has = (name) => argv.includes(name);
  const value = (name) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : ""; };
  const all = has("--all");
  const bumpWord = has("--bump") ? (value("--bump") || "patch") : "";
  if (bumpWord && !["patch", "minor"].includes(bumpWord)) throw new Error(`--bump takes patch or minor, not ${bumpWord}`);
  return {
    web: all || has("--web"),
    android: all || has("--android"),
    desktop: all || has("--desktop"),
    rules: has("--rules"),
    functions: has("--functions"),
    play: has("--play"),
    bump: bumpWord,
    skipTests: has("--skip-tests"),
    yes: has("--yes"),
    dryRun: has("--dry-run"),
    notes: value("--notes"),
  };
}

export const nothingChosen = (opts) => !(opts.web || opts.android || opts.desktop || opts.rules || opts.functions || opts.play);

export const HELP = `Primovex release

  npm run release -- <what> [options]

What to release (any mix):
  --web            the web app and iPhone
  --android        the Android app, sent to the testers by email
  --desktop        the Windows installer, with the in-app update
  --all            web, Android and desktop
  --rules          Firestore and Storage rules
  --functions      Cloud Functions
  --play           also build the Google Play bundle (not uploaded)

Options:
  --bump [patch|minor]   raise the version first (a desktop update needs a higher number)
  --notes "text"         what is new, shown with the desktop update
  --skip-tests           do not run the tests (not recommended)
  --dry-run              show the steps and do nothing
  --yes                  do not ask before publishing

It always lists what will be published and asks first, unless --yes is given.`;
