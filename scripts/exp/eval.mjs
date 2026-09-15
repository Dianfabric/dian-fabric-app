// Evaluate embedding variants (and combos) against golden set. Usage: node eval.mjs
import fs from "fs";
import path from "path";
const S = "scripts/exp/data";
const meta = JSON.parse(fs.readFileSync(S + "/meta.json", "utf8"));
const rowsById = Object.fromEntries(meta.rows.map((r) => [r.id, r]));
const variants = {};
for (const f of fs.readdirSync(S)) { const m = f.match(/^emb-(\w+)\.json$/); if (m) variants[m[1]] = JSON.parse(fs.readFileSync(S + "/" + f, "utf8")); }
function parseRGB(notes) { const p = notes?.match(/\|rgb:([^|]*)/)?.[1]; if (!p) return null; const cs = []; for (const seg of p.split(";")) { const m = seg.match(/(\d+),(\d+),(\d+):(\d+)/); if (m) cs.push({ rgb: [+m[1], +m[2], +m[3]], pct: +m[4] }); } if (!cs.length) { const m = p.match(/(\d+),(\d+),(\d+)/); if (m) cs.push({ rgb: [+m[1], +m[2], +m[3]], pct: 100 }); } return cs.length ? cs : null; }
function rgbSim(q, f) { if (!q || !f) return 0; let t = 0; for (const qc of q) { let b = 0; for (const fc of f) { const d = Math.hypot(qc.rgb[0] - fc.rgb[0], qc.rgb[1] - fc.rgb[1], qc.rgb[2] - fc.rgb[2]) / 441.67; const m = Math.max(0, 1 - d * 2.5) * 0.7 + (1 - Math.abs(qc.pct - fc.pct) / 100) * 0.3; if (m > b) b = m; } t += b * qc.pct / 100; } return t; }
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const labeled = meta.labeled.map((l) => ({ ...l, similar_ids: l.similar_ids.filter((x) => x && x !== "null") })).filter((l) => l.similar_ids.length > 0);
const allIds = meta.rows.map((r) => r.id);
function run(name, scoreFn) {
  let R = 0, P = 0, M = 0, hits = 0, tot = 0, nq = 0;
  for (const l of labeled) {
    const qid = l.query.id; const truth = new Set(l.similar_ids);
    let scored; try { scored = allIds.filter((id) => id !== qid).map((id) => ({ id, s: scoreFn(qid, id) })); } catch { continue; }
    if (scored.some((x) => x.s == null || Number.isNaN(x.s))) continue;
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, 15).map((x) => x.id);
    const h = top.filter((id) => truth.has(id)).length;
    R += h / truth.size; hits += h; tot += truth.size;
    P += top.slice(0, 5).filter((id) => truth.has(id)).length / 5;
    const fr = scored.findIndex((x) => truth.has(x.id)); M += fr >= 0 ? 1 / (fr + 1) : 0; nq++;
  }
  console.log(`${name.padEnd(34)} | R@15 ${(R / nq * 100).toFixed(1).padStart(5)}% | P@5 ${(P / nq * 100).toFixed(1).padStart(5)}% | MRR ${(M / nq).toFixed(3)} | ${hits}/${tot} (${nq}q)`);
}
const emb = (v, key) => (a, b) => { const A = variants[v]?.[a]?.[key], B = variants[v]?.[b]?.[key]; if (!A || !B) throw 0; return dot(A, B); };
const rgb = (a, b) => rgbSim(parseRGB(rowsById[a]?.notes), parseRGB(rowsById[b]?.notes));
console.log("pool size", allIds.length, "variants", Object.keys(variants).join(","));
run("rgb only", rgb);
for (const v of Object.keys(variants)) {
  run(`${v} CLS`, emb(v, "cls"));
  run(`${v} patch-mean`, emb(v, "mean"));
  run(`${v} CLS+mean`, (a, b) => emb(v, "cls")(a, b) * 0.5 + emb(v, "mean")(a, b) * 0.5);
  run(`${v} CLS 60 + rgb 40`, (a, b) => emb(v, "cls")(a, b) * 0.6 + rgb(a, b) * 0.4);
  run(`${v} mean 60 + rgb 40`, (a, b) => emb(v, "mean")(a, b) * 0.6 + rgb(a, b) * 0.4);
}
if (variants.gray && variants.q8) run("gray mean 50 + q8 cls 20 + rgb 30", (a, b) => emb("gray", "mean")(a, b) * 0.5 + emb("q8", "cls")(a, b) * 0.2 + rgb(a, b) * 0.3);
if (variants.crop && variants.q8) run("q8 mean 40 + crop mean 30 + rgb 30", (a, b) => emb("q8", "mean")(a, b) * 0.4 + emb("crop", "mean")(a, b) * 0.3 + rgb(a, b) * 0.3);
