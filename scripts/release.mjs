// One command to release Primovex. See scripts/release-plan.mjs for the order and `npm run release -- --help` for the options.
//
//   npm run release -- --all --bump --notes "What is new"
//   npm run release -- --web --dry-run
//
// It lists what will be published (the web app, the Android email, the desktop update, rules, functions) and asks before doing it,
// unless --yes is given. Nothing is uploaded to Google Play from here.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { ANDROID_APP_ID, HELP, TESTERS, buildReleasePlan, nothingChosen, parseReleaseArgs, publishing } from "./release-plan.mjs";

const root = process.cwd();
const SITE = "https://medtrak-b1cad.web.app";
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const readJson = (file) => JSON.parse(read(file));
const quote = (arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg);

function run(cmd, args = [], env = {}) {
  const line = [cmd, ...args.map(quote)].join(" ");
  console.log(`\n> ${line}`);
  const result = spawnSync(line, { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`Failed (${result.status}): ${line}`);
}

function find(dir, test) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { const hit = find(full, test); if (hit) return hit; } else if (test(entry.name)) return full;
  }
  return null;
}

const androidOut = path.join(root, "src-tauri", "gen", "android", "app", "build", "outputs");

const steps = {
  bump(word) {
    const bumpOne = (version) => {
      const [major, minor, patch] = version.split(".").map(Number);
      return word === "minor" ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
    };
    const pkgPath = path.join(root, "package.json");
    const current = readJson("package.json").version;
    const next = bumpOne(current);
    fs.writeFileSync(pkgPath, read("package.json").replace(`"version": "${current}"`, `"version": "${next}"`));
    const lockPath = path.join(root, "package-lock.json");
    let seen = 0;
    fs.writeFileSync(lockPath, read("package-lock.json").replace(new RegExp(`"version": "${current.replace(/\./g, "\\.")}"`, "g"), (m) => (++seen <= 2 ? `"version": "${next}"` : m)));
    run("npm", ["run", "version:sync"]); // the desktop and Cargo versions follow package.json straight away
    console.log(`Version ${current} -> ${next}`);
  },

  tests() {
    const scripts = Object.keys(readJson("package.json").scripts).filter((name) => name.startsWith("test:"));
    const failed = [];
    for (const name of scripts) {
      const result = spawnSync(`npm run ${name}`, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      if (result.status !== 0) { failed.push(name); console.error(`FAILED ${name}\n${String(result.stdout || "").split("\n").slice(-12).join("\n")}`); } else process.stdout.write(".");
    }
    const server = spawnSync("node --test \"tests/*.test.js\"", { shell: true, cwd: path.join(root, "functions"), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (server.status !== 0) { failed.push("functions tests"); console.error(String(server.stdout || "").split("\n").slice(-25).join("\n")); }
    console.log(`\n${scripts.length} app test sets and the server tests: ${failed.length ? `${failed.length} FAILED (${failed.join(", ")})` : "all passed"}`);
    if (failed.length) throw new Error("Tests failed, so nothing was released.");
  },

  async checkHosting(step) {
    const built = readJson("dist/version.json").build;
    let live = null;
    for (let attempt = 0; attempt < 5 && live !== built; attempt += 1) {
      if (attempt) await new Promise((r) => setTimeout(r, 4000));
      try { live = (await (await fetch(`${SITE}/version.json?${Date.now()}`)).json()).build; } catch { live = null; }
    }
    if (live !== built) throw new Error(`The live site is not the build just made (live ${live}, built ${built}).`);
    console.log("The live site is the build just made.");
    if (step.desktop) {
      const version = readJson("package.json").version;
      const manifest = await (await fetch(`${SITE}/updates/latest.json?${Date.now()}`)).json();
      if (manifest.version !== version) throw new Error(`The live update says ${manifest.version}, not ${version}.`);
      console.log(`The desktop update address offers ${manifest.version}.`);
    }
  },

  androidBuild() {
    fs.rmSync(path.join(root, "src-tauri", "gen", "android", "app", "build"), { recursive: true, force: true });
    run("npm", ["run", "android:build"]);
  },

  androidSend() {
    const apk = find(path.join(androidOut, "apk"), (name) => name === "app-universal-release.apk");
    if (!apk) throw new Error("The Android build produced no app-universal-release.apk.");
    run("firebase", ["appdistribution:distribute", apk, "--app", ANDROID_APP_ID, "--testers", TESTERS]);
  },

  playBundle() {
    fs.rmSync(path.join(root, "src-tauri", "gen", "android", "app", "build", "outputs", "bundle"), { recursive: true, force: true });
    run("npm", ["run", "tauri", "--", "android", "build", "--aab"]);
    const bundle = find(path.join(androidOut, "bundle"), (name) => name.endsWith(".aab"));
    if (!bundle) throw new Error("No .aab was produced.");
    const out = path.join(root, "release", "play");
    fs.mkdirSync(out, { recursive: true });
    const version = readJson("package.json").version;
    const target = path.join(out, `primovex-${version}.aab`);
    fs.copyFileSync(bundle, target);
    console.log(`\nGoogle Play bundle: ${target}\nUpload it in the Play Console (Testing, Internal testing, Create new release).`);
  },
};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) return console.log(HELP);
  const opts = parseReleaseArgs(argv);
  if (nothingChosen(opts)) { console.log(HELP); process.exitCode = 1; return; }
  const plan = buildReleasePlan(opts);

  console.log("This release will:");
  plan.forEach((step, i) => console.log(`  ${i + 1}. ${step.label}${step.kind === "publish" ? "   <- goes live / is sent" : ""}`));
  if (opts.dryRun) return console.log("\nDry run: nothing was done.");

  const live = publishing(plan);
  if (live.length && !opts.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`\nThis puts ${live.length} thing${live.length === 1 ? "" : "s"} live or sends them to people. Go ahead? (y/N) `)).trim().toLowerCase();
    rl.close();
    if (answer !== "y" && answer !== "yes") return console.log("Stopped. Nothing was published.");
  }

  for (const step of plan) {
    console.log(`\n=== ${step.label} ===`);
    if (step.fn) await steps[step.fn](step.fn === "bump" ? step.arg : step);
    else run(step.cmd, step.args, step.env);
  }
  console.log("\nRelease done.");
}

main().catch((error) => { console.error(`\n${error.message}`); process.exit(1); });
