import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// A name used but never defined or imported only fails when that line runs: the Inventory page crashed for everyone
// on open ("existingForms is not defined") after a refactor removed the line that defined it, and nothing caught it
// because the build doesn't check names. This parses every file under src and fails on any name that isn't
// declared, imported or a known global.

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const ROOT = fileURLToPath(new URL("../src/", import.meta.url));
const GLOBALS = new Set(`undefined NaN Infinity globalThis window document navigator console location history localStorage sessionStorage indexedDB
  setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame queueMicrotask structuredClone fetch Request Response Headers URL URLSearchParams
  FormData Blob File FileReader Image Audio Event CustomEvent EventTarget MessageChannel MutationObserver ResizeObserver IntersectionObserver AbortController AbortSignal
  Promise Map Set WeakMap WeakSet WeakRef Symbol Proxy Reflect JSON Math Date RegExp Error TypeError RangeError SyntaxError EvalError Object Array String Number Boolean BigInt Function
  Intl parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI escape unescape atob btoa TextEncoder TextDecoder crypto performance Notification
  Uint8Array Int8Array Uint16Array Int16Array Uint32Array Int32Array Float32Array Float64Array ArrayBuffer DataView Buffer process alert confirm prompt print getComputedStyle matchMedia
  HTMLElement HTMLInputElement HTMLCanvasElement HTMLVideoElement Element Node NodeList DOMParser XMLSerializer WebSocket BroadcastChannel Worker SpeechSynthesisUtterance speechSynthesis
  SpeechRecognition webkitSpeechRecognition AudioContext webkitAudioContext OffscreenCanvas createImageBitmap ImageData NDEFReader PublicKeyCredential KeyboardEvent MouseEvent PointerEvent
  TouchEvent StorageEvent ErrorEvent PromiseRejectionEvent DOMException screen scrollTo scrollBy open close focus blur self top parent frames name event
  __APP_VERSION__ __TAURI_INTERNALS__ import arguments require module exports React`.split(/\s+/).filter(Boolean));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(jsx|js)$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}

export function undefinedNames(source) {
  const ast = parse(source, { sourceType: "module", plugins: ["jsx"], errorRecovery: true });
  const found = new Set();
  traverse(ast, {
    ReferencedIdentifier(path) {
      const { name } = path.node;
      if (path.scope.hasBinding(name) || GLOBALS.has(name)) return;
      // a JSX tag name that is lowercase is an HTML element, not a variable
      if (path.isJSXIdentifier() && /^[a-z]/.test(name)) return;
      // typeof x is safe for an undeclared x
      if (path.parentPath?.isUnaryExpression({ operator: "typeof" })) return;
      found.add(name);
    },
  });
  return [...found];
}

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log(`ok  ${name}`); };

t("the check finds a name that is used but never defined, and nothing else", () => {
  assert.deepEqual(undefinedNames("export function A() { return <B items={existingForms} />; }\nimport B from './b';"), ["existingForms"]);
  assert.deepEqual(undefinedNames("import { useMemo } from 'react';\nexport function A({ items }) { const x = useMemo(() => items, [items]); return <div>{x}{typeof maybe === 'undefined' ? 1 : 2}{window.name}</div>; }"), []);
});

t("no file in the app uses a name that isn't defined", () => {
  const found = [];
  for (const path of files(ROOT)) {
    let names = [];
    try { names = undefinedNames(readFileSync(path, "utf8")); } catch (error) { found.push(`${relative(ROOT, path)}: could not be read (${error.message})`); continue; }
    if (names.length) found.push(`${relative(ROOT, path)}: ${names.join(", ")}`);
  }
  assert.deepEqual(found, []);
});

console.log(`\n${n} passed`);
