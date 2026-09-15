// Evaluate embedding variants (and combos) against the golden set on the local pool.
// Usage: node scripts/exp/eval.mjs            -> prints table, writes scripts/exp/results-golden.md
import fs from "fs";
const S = "scripts/exp/data";
const meta = JSON.parse(fs.readFileSync(S + "/meta.json", "utf8"));
const rowsById = Object.fromEntries(meta.rows.map((r) => [r.id, r]));
const variants = {};
for (const f of fs.readdirSync(S)) { const m = f.match(/^emb-(\w+)\.json$/); if (m) variants[m[1]] = JSON.parse(fs.readFileSync(S + "/" + f, "utf8")); }
export function parseRGB(notes) { const p = notes?.match(/\|rgb:([^|]*)/)?.[1]; if (!p) return null; const cs = []; for (const seg of p.split(";")) { const m = seg.match(/(\d+),(\d+),(\d+):(\d+)/); if (m) cs.push({ rgb: [+m[1], +m[2], +m[3]], pct: +m[4] }); } if (!cs.length) { const m = p.match(/(\d+),(\d+),(\d+)/); if (m) cs.push({ rgb: [+m[1], +m[2], +m[3]], pct: 100 }); } return cs.length ? cs : null; }
export function rgbSim(q, f) { if (!q || !f) return 0; let t = 0; for (const qc of q) { let b = 0; for (const fc of f) { const d = Math.hypot(qc.rgb[0] - fc.rgb[0], qc.rgb[1] - fc.rgb[1], qc.rgb[2] - fc.rgb[2]) / 441.67; const m = Math.max(0, 1 - d * 2.5) * 0.7 + (1 - Math.abs(qc.pct - fc.pct) / 100) * 0.3; if (m > b) b = m; } t += b * qc.pct / 100; } return t; }
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const labeled = meta.labeled.map((l) => ({ ...l, similar_ids: l.similar_ids.filter((x) => x && x !== "null") })).filter((l) => l.similar_ids.length > 0);
const allIds = meta.rows.map((r) => r.id);
const lines = [];
function run(name, scoreFn, ids = allIds, queries = labeled) {
  let R = 0, P = 0, M = 0, R1 = 0, hits = 0, tot = 0, nq = 0;
  for (const l of queries) {
    const qid = l.query.id; const truth = new Set(l.similar_ids);
    let scored; try { scored = ids.filter((id) => id !== qid).map((id) => ({ id, s: scoreFn(qid, id) })); } catch { continue; }
    if (scored.some((x) => x.s == null || Number.isNaN(x.s))) continue;
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 15).map((x) => x.id);
    const h = top.filter((id) => truth.has(id)).length;
    R += h / truth.size; hits += h; tot += truth.size;
    P += top.slice(0, 5).filter((id) => truth.has(id)).length / 5;
    if (truth.has(top[0])) R1++;
    const fr = scored.findIndex((x) => truth.has(x.id)); M += fr >= 0 ? 1 / (fr + 1) : 0; nq++;
  }
  if (!nq) { console.log(`| ${name.padEnd(36)} | n/a |`); return null; }
  const line = `| ${name.padEnd(36)} | ${(R / nq * 100).toFixed(1).padStart(5)}% | ${(P / nq * 100).toFixed(1).padStart(5)}% | ${(M / nq).toFixed(3)} | ${(R1 / nq * 100).toFixed(1).padStart(5)}% | ${hits}/${tot} (${nq}q) |`;
  console.log(line); lines.push(line);
  return { name, R15: R / nq, P5: P / nq, MRR: M / nq };
}
const emb = (v, key) => (a, b) => { const A = variants[v]?.[a]?.[key], B = variants[v]?.[b]?.[key]; if (!A || !B) throw 0; return dot(A, B); };
// multi-vector: for each query tile, best matching db tile; average over query tiles
const tileMV = (v) => (a, b) => { const A = variants[v]?.[a]?.tiles, B = variants[v]?.[b]?.tiles; if (!A || !B) throw 0; let s = 0; for (const qa of A) { let best = -1; for (const tb of B) { const d = dot(qa, tb); if (d > best) best = d; } s += best; } return s / A.length; };
const rgb = (a, b) => rgbSim(parseRGB(rowsById[a]?.notes), parseRGB(rowsById[b]?.notes));
// LAB colour signatures computed from the images (scripts/exp/colors.mjs) — order-independent greedy matching
const colP = fs.existsSync(S + "/colors-pool.json") ? JSON.parse(fs.readFileSync(S + "/colors-pool.json", "utf8")) : null;
function labSim(q, f) { if (!q?.length || !f?.length) return 0; const pairs = []; for (const a of q) for (const b of f) { const dE = Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]); pairs.push({ a, b, sim: Math.max(0, 1 - dE / 60) }); } pairs.sort((x, y) => y.sim - x.sim); const ua = new Set(), ub = new Set(); let t = 0; for (const p of pairs) { if (ua.has(p.a) || ub.has(p.b)) continue; ua.add(p.a); ub.add(p.b); t += p.sim * Math.min(p.a.pct, p.b.pct) / 100; } return t; }
const lab = (key) => (a, b) => { if (!colP) throw 0; return labSim(colP[a]?.[key], colP[b]?.[key]); };
const header = `| method | R@15 | P@5 | MRR | R@1 | hits |\n|---|---|---|---|---|---|`;
console.log("pool size", allIds.length, "variants", Object.keys(variants).join(","), "queries", labeled.length);
console.log(header); lines.push(header);
run("rgb only (notes)", rgb);
if (colP) { run("LAB wb only (image)", lab("wb")); run("LAB raw only (image)", lab("raw")); }
for (const v of Object.keys(variants)) {
  if (v === "tile") { run("tile multi-vector (max)", tileMV(v)); run("tile mean-of-4", emb(v, "cls")); run("tile MV 60 + rgb 40", (a, b) => tileMV(v)(a, b) * 0.6 + rgb(a, b) * 0.4); continue; }
  run(`${v} CLS`, emb(v, "cls"));
  run(`${v} patch-mean`, emb(v, "mean"));
  run(`${v} CLS+mean`, (a, b) => emb(v, "cls")(a, b) * 0.5 + emb(v, "mean")(a, b) * 0.5);
  run(`${v} CLS 60 + rgb 40`, (a, b) => emb(v, "cls")(a, b) * 0.6 + rgb(a, b) * 0.4);
  run(`${v} mean 60 + rgb 40`, (a, b) => emb(v, "mean")(a, b) * 0.6 + rgb(a, b) * 0.4);
  run(`${v} CLS+mean 60 + rgb 40`, (a, b) => (emb(v, "cls")(a, b) + emb(v, "mean")(a, b)) * 0.3 + rgb(a, b) * 0.4);
}
if (colP) for (const v of ["fp32", "db", "gray"]) if (variants[v]) { run(`${v} CLS 70 + LAB wb 30`, (a, b) => emb(v, "cls")(a, b) * 0.7 + lab("wb")(a, b) * 0.3); run(`${v} CLS 60 + LAB wb 20 + rgb 20`, (a, b) => emb(v, "cls")(a, b) * 0.6 + lab("wb")(a, b) * 0.2 + rgb(a, b) * 0.2); }
if (colP && variants.gray && variants.fp32) run("gray CLS 40 + fp32 CLS 30 + LAB wb 30", (a, b) => emb("gray", "cls")(a, b) * 0.4 + emb("fp32", "cls")(a, b) * 0.3 + lab("wb")(a, b) * 0.3);
if (variants.gray && variants.q8) { run("gray mean 50 + q8 cls 20 + rgb 30", (a, b) => emb("gray", "mean")(a, b) * 0.5 + emb("q8", "cls")(a, b) * 0.2 + rgb(a, b) * 0.3); run("gray CLS+mean 60 + rgb 40", (a, b) => (emb("gray", "cls")(a, b) + emb("gray", "mean")(a, b)) * 0.3 + rgb(a, b) * 0.4); }
if (variants.crop && variants.q8) run("q8 mean 40 + crop mean 30 + rgb 30", (a, b) => emb("q8", "mean")(a, b) * 0.4 + emb("crop", "mean")(a, b) * 0.3 + rgb(a, b) * 0.3);
// drift: mean cosine between the same image's vector under two pipelines
const drift = (a, b, key = "cls") => { const ids = allIds.filter((id) => variants[a]?.[id]?.[key] && variants[b]?.[id]?.[key]); const m = ids.reduce((s, id) => s + dot(variants[a][id][key], variants[b][id][key]), 0) / ids.length; const line = `| drift ${a} vs ${b} (${key}): mean cos ${m.toFixed(4)} over ${ids.length} imgs |`; console.log(line); lines.push(line); };
for (const [a, b] of [["q8", "fp32"], ["q4f16", "fp32"], ["db", "fp32"], ["db", "q8"], ["dbcrop", "crop"], ["gray", "fp32"]]) if (variants[a] && variants[b]) drift(a, b);
for (const q of ["q8", "fp32", "crop"]) if (variants[q] && variants.db) run(`cross: ${q} query vs db CLS`, (a, b) => { const A = variants[q][a]?.cls, B = variants.db[b]?.cls; if (!A || !B) throw 0; return dot(A, B); });
if (variants.q4f16 && variants.fp32) run("cross: q4f16 query vs fp32 db (CLS)", (a, b) => { const A = variants.q4f16[a]?.cls, B = variants.fp32[b]?.cls; if (!A || !B) throw 0; return dot(A, B); });
if (variants.q8 && variants.fp32) run("cross: q8 query vs fp32 db (CLS)", (a, b) => { const A = variants.q8[a]?.cls, B = variants.fp32[b]?.cls; if (!A || !B) throw 0; return dot(A, B); });
if (variants.tile && variants.q8) run("tile MV 40 + q8 mean 30 + rgb 30", (a, b) => tileMV("tile")(a, b) * 0.4 + emb("q8", "mean")(a, b) * 0.3 + rgb(a, b) * 0.3);

// ── combined candidates (golden-best full CLS + synth-best crop patch-mean), colour as raw LAB (no WB) ──
if (variants.fp32 && variants.crop) {
  const fc = emb("fp32", "cls"), cm = emb("crop", "mean"), gcm = variants.graycrop ? emb("graycrop", "mean") : null;
  run("COMBO fp32 CLS 50 + crop mean 50", (a, b) => fc(a, b) * 0.5 + cm(a, b) * 0.5);
  run("COMBO fp32 CLS 60 + crop mean 40", (a, b) => fc(a, b) * 0.6 + cm(a, b) * 0.4);
  run("COMBO fp32 CLS 45 + crop mean 35 + rgb 20", (a, b) => fc(a, b) * 0.45 + cm(a, b) * 0.35 + rgb(a, b) * 0.2);
  if (colP) { run("COMBO fp32 CLS 45 + crop mean 35 + LAB raw 20", (a, b) => fc(a, b) * 0.45 + cm(a, b) * 0.35 + lab("raw")(a, b) * 0.2); run("COMBO fp32 CLS 40 + crop mean 40 + LAB raw 10 + rgb 10", (a, b) => fc(a, b) * 0.4 + cm(a, b) * 0.4 + lab("raw")(a, b) * 0.1 + rgb(a, b) * 0.1); run("fp32 CLS 80 + LAB raw 20", (a, b) => fc(a, b) * 0.8 + lab("raw")(a, b) * 0.2); }
  if (gcm) run("COMBO fp32 CLS 50 + graycrop mean 30 + rgb 20", (a, b) => fc(a, b) * 0.5 + gcm(a, b) * 0.3 + rgb(a, b) * 0.2);
  if (variants.tile) run("COMBO fp32 CLS 50 + tile MV 50", (a, b) => fc(a, b) * 0.5 + tileMV("tile")(a, b) * 0.5);
}
fs.writeFileSync("scripts/exp/results-golden.md", `# Golden set results (pool ${allIds.length}, queries ${labeled.length}, ${new Date().toISOString().slice(0, 10)})\n\n${lines.join("\n")}\n`);
