// One-off: traces the Primovex P mark (public/branding/primovex-mark-only.png) into vector paths, so the orb can draw the real logo at any size and in any colour.
// Writes src/components/pulse/pMarkPaths.js. Run: node scripts/trace-p-mark.mjs
import fs from "node:fs";
import { decode } from "fast-png";

const png = decode(fs.readFileSync("public/branding/primovex-mark-only.png"));
const { width: W, height: H, data, channels } = png;
const alpha = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * channels + (channels - 1)]);
const solid = (x, y) => alpha(x, y) >= 128;

// connected components of the solid pixels
const label = new Int32Array(W * H).fill(-1);
const comps = [];
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  if (!solid(x, y) || label[y * W + x] >= 0) continue;
  const id = comps.length; const stack = [[x, y]]; label[y * W + x] = id; let n = 0, minX = x, maxX = x, minY = y, maxY = y;
  while (stack.length) {
    const [cx, cy] = stack.pop(); n += 1; minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = cx + dx, ny = cy + dy; if (solid(nx, ny) && label[ny * W + nx] < 0) { label[ny * W + nx] = id; stack.push([nx, ny]); } }
  }
  comps.push({ id, n, minX, maxX, minY, maxY });
}
const real = comps.filter((c) => c.n > 400).sort((a, b) => b.n - a.n);
console.log("components", real.map((c) => ({ n: c.n, box: [c.minX, c.minY, c.maxX, c.maxY] })));

// boundary of one component as an ordered loop of pixel-corner points (Moore-neighbour style on the edge grid)
function outline(compId) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === compId;
  // directed edges around pixels so the inside is on the left
  const edges = new Map();
  const add = (x1, y1, x2, y2) => { const k = `${x1},${y1}`; if (!edges.has(k)) edges.set(k, []); edges.get(k).push([x2, y2]); };
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    if (!inside(x, y)) continue;
    if (!inside(x, y - 1)) add(x, y, x + 1, y);
    if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!inside(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops = [];
  while (edges.size) {
    const [startKey] = edges.keys(); const [sx, sy] = startKey.split(",").map(Number);
    const loop = [[sx, sy]]; let [cx, cy] = [sx, sy];
    for (;;) {
      const k = `${cx},${cy}`; const outs = edges.get(k); if (!outs) break;
      const next = outs.pop(); if (!outs.length) edges.delete(k);
      [cx, cy] = next; if (cx === sx && cy === sy) break; loop.push([cx, cy]);
    }
    if (loop.length > 8) loops.push(loop);
  }
  return loops;
}

const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;

// light smoothing of the pixel staircase, then Douglas-Peucker
function smooth(pts, rounds = 3) {
  let p = pts;
  for (let r = 0; r < rounds; r += 1) p = p.map((pt, i) => { const a = p[(i - 1 + p.length) % p.length], b = p[(i + 1) % p.length]; return [(a[0] + 2 * pt[0] + b[0]) / 4, (a[1] + 2 * pt[1] + b[1]) / 4]; });
  return p;
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]]; let max = 0, at = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i += 1) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len; if (d > max) { max = d; at = i; } }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}
function closedRdp(pts, eps) {
  // split the loop at its two most distant points so the simplifier has fixed ends
  let best = 0, bi = 0; for (let i = 1; i < pts.length; i += 1) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > best) { best = d; bi = i; } }
  const a = pts.slice(0, bi + 1), b = [...pts.slice(bi), pts[0]];
  return [...rdp(a, eps).slice(0, -1), ...rdp(b, eps).slice(0, -1)];
}
const r1 = (n) => Math.round(n * 10) / 10;
function toPath(pts) {
  // quadratic curves between edge midpoints: smooth outline that passes close to every simplified point
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = `M${r1(mid(pts[pts.length - 1], pts[0])[0])} ${r1(mid(pts[pts.length - 1], pts[0])[1])}`;
  for (let i = 0; i < pts.length; i += 1) { const m = mid(pts[i], pts[(i + 1) % pts.length]); d += `Q${r1(pts[i][0])} ${r1(pts[i][1])} ${r1(m[0])} ${r1(m[1])}`; }
  return `${d}Z`;
}

const out = {};
// Two pieces are traced: the bowl, and the stem (the swoosh), which in the artwork runs into the cross. The cross is drawn as two clean rounded bars measured from the
// artwork instead, so it can be lit on its own; the pixels it covers (plus a small gap) are taken out of the stem first.
const [bowl, stem] = real.sort((a, b) => b.n - a.n);
const CROSS = { cx: 129, cy: 143.5, vx0: 112, vx1: 147, vy0: 91, vy1: 196, hx0: 77, hx1: 179, hy0: 126, hy1: 162, r: 9 };
const GAP = 4;
for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
  if (label[y * W + x] !== stem.id) continue;
  const inV = x >= CROSS.vx0 - GAP && x < CROSS.vx1 + GAP && y >= CROSS.vy0 - GAP && y < CROSS.vy1 + GAP;
  const inH = x >= CROSS.hx0 - GAP && x < CROSS.hx1 + GAP && y >= CROSS.hy0 - GAP && y < CROSS.hy1 + GAP;
  if (inV || inH) label[y * W + x] = -2;
}
for (const [key, comp] of [["bowl", bowl], ["stem", stem]]) {
  const loops = outline(comp.id).filter((l) => Math.abs(area(l)) > 40);
  const parts = loops.map((l) => closedRdp(smooth(l), 0.45));
  out[key] = parts.map((p) => toPath(p)).join("");
  console.log(key, "loops", loops.length, "points", parts.map((p) => p.length));
}
const rr = (x0, y0, x1, y1, r) => `M${x0 + r} ${y0}H${x1 - r}Q${x1} ${y0} ${x1} ${y0 + r}V${y1 - r}Q${x1} ${y1} ${x1 - r} ${y1}H${x0 + r}Q${x0} ${y1} ${x0} ${y1 - r}V${y0 + r}Q${x0} ${y0} ${x0 + r} ${y0}Z`;
out.plus = rr(CROSS.vx0, CROSS.vy0, CROSS.vx1, CROSS.vy1, CROSS.r) + rr(CROSS.hx0, CROSS.hy0, CROSS.hx1, CROSS.hy1, CROSS.r);
const ns = 100 / Math.max(W, H);
const scale = (path) => path.replace(/-?\d+(\.\d+)?/g, (m) => r1(Number(m) * ns));
const body = `// The Primovex P mark traced from public/branding/primovex-mark-only.png (scripts/trace-p-mark.mjs), in a 0 0 ${Math.round(W * ns)} ${Math.round(H * ns)} box.\n// bowl and stem are the two body pieces; plus is the cross in the middle. Drawn by components/pulse/PulseOrbFace.jsx in whatever colours the theme calls for.\nexport const P_VIEW = [${Math.round(W * ns)}, ${Math.round(H * ns)}];\nexport const P_BOWL = "${scale(out.bowl)}";\nexport const P_STEM = "${scale(out.stem)}";\nexport const P_PLUS = "${scale(out.plus)}";\n`;
fs.writeFileSync("src/components/pulse/pMarkPaths.js", body);
console.log("wrote src/components/pulse/pMarkPaths.js", body.length, "bytes");

// sample colours for the gradients: where the body is, bottom-left and top-right
const sample = (x, y) => { const i = (y * W + x) * channels; return `#${[0, 1, 2].map((c) => data[i + c].toString(16).padStart(2, "0")).join("")}`; };
const probe = (comp, name) => { const pts = []; for (let y = comp.minY; y <= comp.maxY; y += 1) for (let x = comp.minX; x <= comp.maxX; x += 1) if (label[y * W + x] === comp.id) pts.push([x, y]); pts.sort((a, b) => (a[0] - a[1]) - (b[0] - b[1])); console.log(name, "bottom-left", sample(...pts[0]), "middle", sample(...pts[Math.floor(pts.length / 2)]), "top-right", sample(...pts[pts.length - 1])); };
probe(bowl, "bowl"); probe(stem, "stem");
