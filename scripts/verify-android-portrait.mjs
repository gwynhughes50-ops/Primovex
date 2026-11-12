// The phone app stays upright: the Android main screen is locked to portrait (it was only the barcode scanner before), and the web app's manifest asks for portrait too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("the Android main screen and the barcode scanner are locked to portrait", () => {
  const manifest = read("src-tauri/gen/android/app/src/main/AndroidManifest.xml");
  const activity = (name) => manifest.slice(manifest.lastIndexOf("<activity", manifest.indexOf(`android:name=".${name}"`)), manifest.indexOf(">", manifest.indexOf(`android:name=".${name}"`)));
  assert.match(activity("MainActivity"), /android:screenOrientation="portrait"/);
  assert.match(activity("BarcodeScannerActivity"), /android:screenOrientation="portrait"/);
});

t("the web app (iPhone home screen) asks for portrait in its manifest", () => {
  assert.equal(JSON.parse(read("public/manifest.webmanifest")).orientation, "portrait");
});

console.log(`\n${n} passed`);
