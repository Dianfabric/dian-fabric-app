// Evaluate synthetic phone photos (queries) against the catalogue pool.
// Truth = the source fabric (exact) ; design truth = any pool fabric with the same name (colourway family).
// Uses emb-<v>.json (pool) + synth-<v>.json (queries), colors-pool.json / colors-synth.json when present.
// Usage: node scripts/exp/eval-synth.mjs   -> prints table, writes scripts/exp/results-synth.md
import fs from "fs";
const S = "scripts/exp/data";
const meta = JSON.parse(fs.readFileSync(S + "/meta.json", "utf8"));
const rowsById = Object.fromEntries(meta.rows.map((r) => [r.id, r]));
const manifest = JSON.parse(fs.readFileSync(S + "/synth-manifest.json", "utf8"));
const pool = {}, syn = {};
for (const f of fs.readdirSync(S)) { let m; if ((m = f.match(/^emb-(\w+)\.json$/))) pool[m[1]] = JSON.parse(fs.readFileSync(S + "/" + f)); if ((m = f.match(/^synth-(\w+)\.json$/))) syn[m[1]] = JSON.parse(fs.readFileSync(S + "/" + f)); }
const colP = fs.existsSync(S + "/colors-pool.json") ? JSON.parse(fs.readFileSync(S + "/colors-pool.json")) : null;
const colS = fs.existsSync(S + "/colors-synth.json") ? JSON.parse(fs.readFileSync(S + "/colors-synth.json")) : null;
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const allIds = meta.rows.map((r) => r.id);
const queries = manifest.map((m) => m.id);
const byName = {}; for (const r of meta.rows) (byName[r.name] ||= []).push(r.id);
const lines = [];
// LAB signature similarity: optimal (greedy) matching, order independent
function labSim(q, f) { if (!q?.length || !f?.length) return 0; const pairs = []; for (const a of q) for (const b of f) { const dE = Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]); pairs.push({ a, b, sim: Math.max(0, 1 - dE / 60) }); } pairs.sort((x, y) => y.sim - x.sim); const ua = new Set(), ub = new Set(); let t = 0; for (const p of pairs) { if (ua.has(p.a) || ub.has(p.b)) continue; ua.add(p.a); ub.add(p.b); t += p.sim * Math.min(p.a.pct, p.b.pct) / 100; } return t; }
function run(name, scoreFn, levelFilter) {
  let n = 0, r1 = 0, r15 = 0, d15 = 0, mrr = 0;
  for (const m of manifest) {
    if (levelFilter && m.level !== levelFilter) continue;
    const qid = m.id; let scored;
    try { scored = allIds.map((id) => ({ id, s: scoreFn(qid, id) })); } catch { continue; }
    if (scored.some((x) => x.s == null || Number.isNaN(x.s))) continue;
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 15).map((x) => x.id);
    const design = new Set(byName[rowsById[qid].name] || [qid]);
    if (top[0] === qid) r1++; if (top.includes(qid)) r15++; if (top.some((id) => design.has(id))) d15++;
    const fr = scored.findIndex((x) => x.id === qid); mrr += fr >= 0 ? 1 / (fr + 1) : 0; n++;
  }
  const line = `| ${name.padEnd(36)} | ${(r1 / n * 100).toFixed(1).padStart(5)}% | ${(r15 / n * 100).toFixed(1).padStart(5)}% | ${(d15 / n * 100).toFixed(1).padStart(5)}% | ${(mrr / n).toFixed(3)} | ${n} |`;
  console.log(line); lines.push(line);
}
const emb = (v, key) => (q, id) => { const A = syn[v]?.[q]?.[key], B = pool[v]?.[id]?.[key]; if (!A || !B) throw 0; return dot(A, B); };
const tileMV = (v) => (q, id) => { const A = syn[v]?.[q]?.tiles, B = pool[v]?.[id]?.tiles; if (!A || !B) throw 0; let s = 0; for (const qa of A) { let best = -1; for (const tb of B) { const d = dot(qa, tb); if (d > best) best = d; } s += best; } return s / A.length; };
const lab = (key) => (q, id) => { if (!colP || !colS) throw 0; return labSim(colS[q]?.[key], colP[id]?.[key]); };
const header = `| method | R@1 exact | R@15 exact | R@15 design | MRR | n |\n|---|---|---|---|---|---|`;
console.log("pool", allIds.length, "synth queries", queries.length, "variants", Object.keys(syn).join(","));
console.log(header); lines.push(header);
if (colP && colS) { run("LAB wb only", lab("wb")); run("LAB raw only", lab("raw")); }
for (const v of Object.keys(syn)) {
  if (!pool[v]) continue;
  if (v === "tile") { run("tile multi-vector", tileMV(v)); if (colP && colS) run("tile MV 70 + LAB wb 30", (q, id) => tileMV(v)(q, id) * 0.7 + lab("wb")(q, id) * 0.3); continue; }
  run(`${v} CLS`, emb(v, "cls")); run(`${v} patch-mean`, emb(v, "mean")); run(`${v} CLS+mean`, (q, id) => emb(v, "cls")(q, id) * 0.5 + emb(v, "mean")(q, id) * 0.5);
  if (colP && colS) { run(`${v} CLS 70 + LAB wb 30`, (q, id) => emb(v, "cls")(q, id) * 0.7 + lab("wb")(q, id) * 0.3); run(`${v} mean 70 + LAB wb 30`, (q, id) => emb(v, "mean")(q, id) * 0.7 + lab("wb")(q, id) * 0.3); }
}
if (syn.gray && pool.gray && syn.q8) { run("gray mean 60 + q8 cls 40", (q, id) => emb("gray", "mean")(q, id) * 0.6 + emb("q8", "cls")(q, id) * 0.4); if (colP && colS) run("gray mean 50 + q8 cls 20 + LAB 30", (q, id) => emb("gray", "mean")(q, id) * 0.5 + emb("q8", "cls")(q, id) * 0.2 + lab("wb")(q, id) * 0.3); }
lines.push("", "## by difficulty (q8 CLS / q8 patch-mean)");
for (const lv of ["mild", "medium", "hard"]) { if (syn.q8) { run(`[${lv}] q8 CLS`, emb("q8", "cls"), lv); run(`[${lv}] q8 patch-mean`, emb("q8", "mean"), lv); } }

lines.push("", "## combined candidates");
if (syn.fp32 && pool.fp32 && syn.crop && pool.crop) {
  const fc = emb("fp32", "cls"), cm = emb("crop", "mean"), gcm = syn.graycrop && pool.graycrop ? emb("graycrop", "mean") : null;
  run("COMBO fp32 CLS 50 + crop mean 50", (q, id) => fc(q, id) * 0.5 + cm(q, id) * 0.5);
  run("COMBO fp32 CLS 60 + crop mean 40", (q, id) => fc(q, id) * 0.6 + cm(q, id) * 0.4);
  if (colP && colS) { run("LAB raw only", lab("raw")); run("COMBO fp32 CLS 45 + crop mean 35 + LAB raw 20", (q, id) => fc(q, id) * 0.45 + cm(q, id) * 0.35 + lab("raw")(q, id) * 0.2); run("COMBO fp32 CLS 40 + crop mean 40 + LAB raw 10", (q, id) => fc(q, id) * 0.45 + cm(q, id) * 0.45 + lab("raw")(q, id) * 0.1); run("crop mean 90 + LAB raw 10", (q, id) => cm(q, id) * 0.9 + lab("raw")(q, id) * 0.1); }
  if (gcm) run("COMBO fp32 CLS 50 + graycrop mean 50", (q, id) => fc(q, id) * 0.5 + gcm(q, id) * 0.5);
  if (syn.tile && pool.tile) run("COMBO fp32 CLS 50 + tile MV 50", (q, id) => fc(q, id) * 0.5 + tileMV("tile")(q, id) * 0.5);
  for (const lv of ["mild", "medium", "hard"]) { run(`[${lv}] crop patch-mean`, cm, lv); run(`[${lv}] COMBO fp32 CLS 50 + crop mean 50`, (q, id) => fc(q, id) * 0.5 + cm(q, id) * 0.5, lv); }
}
fs.writeFileSync("scripts/exp/results-synth.md", `# Synthetic phone-photo results (pool ${allIds.length}, queries ${queries.length}, ${new Date().toISOString().slice(0, 10)})\n\n${lines.join("\n")}\n`);
