// Runs before every hosting deploy (see firebase.json): copies the staged desktop release into dist/updates/ so the web app and
// the update files go live together. Hosting replaces the whole site on each deploy, so without this a web-only deploy would
// remove the update files and installed apps would stop seeing updates.
import fs from "node:fs";
import path from "node:path";

const from = path.join(process.cwd(), "release", "updates");
const to = path.join(process.cwd(), "dist", "updates");
if (!fs.existsSync(path.join(process.cwd(), "dist"))) {
  console.error("There is no dist folder. Run npm run build first.");
  process.exit(1);
}
if (!fs.existsSync(from)) {
  console.log("No desktop release staged (release/updates is empty). Installed apps will see no update.");
  process.exit(0);
}
fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log(`Staged ${fs.readdirSync(to).join(", ")} into dist/updates/`);
