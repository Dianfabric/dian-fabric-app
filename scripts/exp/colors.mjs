// Deterministic colour signature from images: centre crop, grey-world white balance, LAB, seeded k-means (k=4).
// Usage: node scripts/exp/colors.mjs <imagesDir> <outName>   e.g. scripts/exp/data/images pool  -> data/colors-pool.json
import fs from "fs";
import sharp from "sharp";
const S = "scripts/exp/data";
const dir = process.argv[2] || `${S}/images`, name = process.argv[3] || "pool";
const out = {};
function rgb2lab(r, g, b) {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = h(x); y = h(y); z = h(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
export function signature(px, k = 4, wb = true) {
  // px: array of [r,g,b]; grey-world white balance (optional), LAB, kmeans++ with fixed seed
  let s = 7; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  if (wb) { const m = [0, 0, 0]; for (const p of px) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; } const g = (m[0] + m[1] + m[2]) / 3; px = px.map((p) => [p[0] * g / m[0], p[1] * g / m[1], p[2] * g / m[2]].map((v) => Math.min(255, v))); }
  const lab = px.map((p) => rgb2lab(...p));
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const C = [lab[Math.floor(rnd() * lab.length)]];
  while (C.length < k) { const ds = lab.map((p) => Math.min(...C.map((c) => d2(p, c)))); const tot = ds.reduce((a, b) => a + b, 0); let r = rnd() * tot, i = 0; while (r > ds[i] && i < ds.length - 1) r -= ds[i++]; C.push(lab[i]); }
  let assign = new Array(lab.length).fill(0);
  for (let it = 0; it < 25; it++) {
    for (let i = 0; i < lab.length; i++) { let b = 0, bd = Infinity; for (let c = 0; c < k; c++) { const d = d2(lab[i], C[c]); if (d < bd) { bd = d; b = c; } } assign[i] = b; }
    const sum = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < lab.length; i++) { const a = sum[assign[i]]; a[0] += lab[i][0]; a[1] += lab[i][1]; a[2] += lab[i][2]; a[3]++; }
    for (let c = 0; c < k; c++) if (sum[c][3]) C[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  const cnt = C.map((_, c) => assign.filter((a) => a === c).length);
  let cl = C.map((c, i) => ({ lab: c.map((v) => +v.toFixed(1)), pct: +(cnt[i] / lab.length * 100).toFixed(1) })).filter((c) => c.pct >= 3);
  // merge near-duplicate clusters (deltaE < 8)
  cl.sort((a, b) => b.pct - a.pct);
  const merged = [];
  for (const c of cl) { const m = merged.find((x) => Math.sqrt(d2(x.lab, c.lab)) < 8); if (m) { m.pct += c.pct; } else merged.push({ ...c }); }
  return merged.map((c) => ({ lab: c.lab, pct: +c.pct.toFixed(1) }));
}
export async function imageSignature(buf) {
  const img = sharp(buf).rotate(); const m = await img.metadata();
  const cw = Math.floor(m.width * 0.6), ch = Math.floor(m.height * 0.6);
  const { data } = await img.extract({ left: Math.floor((m.width - cw) / 2), top: Math.floor((m.height - ch) / 2), width: cw, height: ch }).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = []; for (let i = 0; i < data.length; i += 3) px.push([data[i], data[i + 1], data[i + 2]]);
  return { wb: signature(px, 4, true), raw: signature(px, 4, false) };
}
if (process.argv[1].endsWith("colors.mjs")) {
  const ids = fs.readdirSync(dir).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4));
  let n = 0;
  for (const id of ids) { try { out[id] = await imageSignature(fs.readFileSync(`${dir}/${id}.jpg`)); } catch (e) { console.log("fail", id, e.message); } if (++n % 300 === 0) console.log(n, "/", ids.length); }
  fs.writeFileSync(`${S}/colors-${name}.json`, JSON.stringify(out));
  console.log("colors saved", Object.keys(out).length, "->", `${S}/colors-${name}.json`);
}
