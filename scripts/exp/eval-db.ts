/**
 * Final evaluation against the REAL database (all ~16.7k rows) through the v4 RPC, scoring exactly like /api/search-v4.
 *
 *   DINO_DTYPE=fp32 DINO_CACHE_DIR=scripts/exp/hf-cache node --experimental-strip-types scripts/exp/eval-db.ts [golden|synth|both]
 *
 * golden : query = each golden-set fabric's own stored v4 vectors (DB→DB, comparable with the desktop's 50.2 % baseline)
 * synth  : query = synthetic phone photos embedded with the server pipeline (src/lib/dino-server.ts), truth = source fabric
 * Writes scripts/exp/results-db.md. Read-only on the DB.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { embedImage, cosine, toVectorString } from "../../src/lib/dino-server.ts";
import { imageSignature, signatureSimilarity, type ColorSignature } from "../../src/lib/color-lab.ts";

const mode = process.argv[2] || "both";
const S = "scripts/exp/data";
const env: Record<string, string> = {};
for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1"); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const W = { cls: 0.45, crop: 0.35, color: 0.20 };
const CAND = 500;

type Row = { id: string; name: string; notes: string | null; color_sig: ColorSignature | null; emb_v4: string | number[] | null; emb_v4_crop: string | number[] | null; similarity: number };
const vec = (v: string | number[] | null) => (v == null ? null : typeof v === "string" ? (JSON.parse(v) as number[]) : v);
const parseRGB = (notes: string | null) => { const p = notes?.match(/\|rgb:([^|]*)/)?.[1]; if (!p) return null; const cs: { rgb: number[]; pct: number }[] = []; for (const seg of p.split(";")) { const m = seg.match(/(\d+),(\d+),(\d+):(\d+)/); if (m) cs.push({ rgb: [+m[1], +m[2], +m[3]], pct: +m[4] }); } if (!cs.length) { const m = p.match(/(\d+),(\d+),(\d+)/); if (m) cs.push({ rgb: [+m[1], +m[2], +m[3]], pct: 100 }); } return cs.length ? cs : null; };
const rgbSim = (q: ReturnType<typeof parseRGB>, f: ReturnType<typeof parseRGB>) => { if (!q || !f) return 0; let t = 0; for (const qc of q) { let b = 0; for (const fc of f) { const d = Math.hypot(qc.rgb[0] - fc.rgb[0], qc.rgb[1] - fc.rgb[1], qc.rgb[2] - fc.rgb[2]) / 441.67; const m = Math.max(0, 1 - d * 2.5) * 0.7 + (1 - Math.abs(qc.pct - fc.pct) / 100) * 0.3; if (m > b) b = m; } t += b * qc.pct / 100; } return t; };

async function candidates(qCls: number[], qCrop: number[] | null, excludeId?: string): Promise<Map<string, Row>> {
  const calls = [sb.rpc("search_fabrics_v4", { query_embedding: toVectorString(qCls), which: "cls", match_count: CAND })];
  if (qCrop) calls.push(sb.rpc("search_fabrics_v4", { query_embedding: toVectorString(qCrop), which: "crop", match_count: CAND }));
  const out = new Map<string, Row>();
  for (const { data, error } of await Promise.all(calls)) { if (error) throw new Error(error.message); for (const r of (data || []) as Row[]) if (r.id !== excludeId && !out.has(r.id)) out.set(r.id, r); }
  return out;
}
type Scorer = (r: Row, sCls: number, sCrop: number, sColor: number, sRgb: number) => number;
const scorers: Record<string, Scorer> = {
  "v4 full (cls45 crop35 lab20)": (_r, c, k, l) => W.cls * c + W.crop * k + W.color * l,
  "cls only": (_r, c) => c,
  "crop mean only": (_r, _c, k) => k,
  "cls50 crop50": (_r, c, k) => 0.5 * c + 0.5 * k,
  "cls45 crop35 lab10 rgb10": (_r, c, k, l, g) => 0.45 * c + 0.35 * k + 0.1 * l + 0.1 * g,
};
const lines: string[] = [];
function rank(cands: Map<string, Row>, qCls: number[], qCrop: number[] | null, qColor: ColorSignature | null, qRgb: ReturnType<typeof parseRGB>) {
  const feats = [...cands.values()].map((r) => { const f = vec(r.emb_v4), c = vec(r.emb_v4_crop); return { r, sCls: f ? cosine(qCls, f) : 0, sCrop: qCrop && c ? cosine(qCrop, c) : 0, sColor: qColor?.raw && r.color_sig?.raw ? signatureSimilarity(qColor.raw, r.color_sig.raw) : 0, sRgb: rgbSim(qRgb, parseRGB(r.notes)) }; });
  const out: Record<string, string[]> = {};
  for (const [name, fn] of Object.entries(scorers)) out[name] = feats.map((x) => ({ id: x.r.id, s: fn(x.r, x.sCls, x.sCrop, x.sColor, x.sRgb) })).sort((a, b) => b.s - a.s).map((x) => x.id);
  return out;
}

if (mode === "golden" || mode === "both") {
  const golden = JSON.parse(fs.readFileSync("scripts/golden-set.json", "utf8"));
  const labeled = golden.labels.map((l: { query: { id: string }; similar_ids: (string | null)[] }) => ({ ...l, similar_ids: l.similar_ids.filter((x) => x && x !== "null") as string[] })).filter((l: { similar_ids: string[] }) => l.similar_ids.length > 0);
  const agg: Record<string, { R: number; P: number; M: number; R1: number; n: number }> = {};
  for (const l of labeled) {
    const { data: q } = await sb.from("fabrics").select("id,emb_v4,emb_v4_crop,color_sig,notes").eq("id", l.query.id).single();
    const qCls = vec(q?.emb_v4 ?? null), qCrop = vec(q?.emb_v4_crop ?? null);
    if (!qCls) { console.log("skip (no v4 yet)", l.query.id); continue; }
    const truth = new Set<string>(l.similar_ids);
    const ranked = rank(await candidates(qCls, qCrop, l.query.id), qCls, qCrop, q!.color_sig, parseRGB(q!.notes));
    for (const [name, ids] of Object.entries(ranked)) {
      const a = (agg[name] ||= { R: 0, P: 0, M: 0, R1: 0, n: 0 });
      const top = ids.slice(0, 15); const h = top.filter((id) => truth.has(id)).length;
      a.R += h / truth.size; a.P += top.slice(0, 5).filter((id) => truth.has(id)).length / 5; if (truth.has(top[0])) a.R1++;
      const fr = ids.findIndex((id) => truth.has(id)); a.M += fr >= 0 ? 1 / (fr + 1) : 0; a.n++;
    }
  }
  lines.push(`## Golden set vs FULL DB (${Object.values(agg)[0]?.n ?? 0} queries, candidates ${CAND}∪${CAND}) — desktop baseline: R@15 50.2 % / P@5 13.6 % / MRR 0.335`, "", "| method | R@15 | P@5 | MRR | R@1 |", "|---|---|---|---|---|");
  for (const [name, a] of Object.entries(agg)) lines.push(`| ${name} | ${(a.R / a.n * 100).toFixed(1)}% | ${(a.P / a.n * 100).toFixed(1)}% | ${(a.M / a.n).toFixed(3)} | ${(a.R1 / a.n * 100).toFixed(1)}% |`);
}

if (mode === "synth" || mode === "both") {
  const manifest = JSON.parse(fs.readFileSync(S + "/synth-manifest.json", "utf8")) as { id: string; level: string }[];
  const meta = JSON.parse(fs.readFileSync(S + "/meta.json", "utf8"));
  const nameById: Record<string, string> = Object.fromEntries(meta.rows.map((r: { id: string; name: string }) => [r.id, r.name]));
  const agg: Record<string, { r1: number; r15: number; d15: number; M: number; n: number }> = {};
  let i = 0;
  for (const m of manifest) {
    const buf = fs.readFileSync(`${S}/synth/${m.id}.jpg`);
    const [f, color] = await Promise.all([embedImage(buf, ["full", "crop"]), imageSignature(buf)]);
    const qCls = f.full.cls, qCrop = f.crop!.mean;
    const cands = await candidates(qCls, qCrop);
    const ranked = rank(cands, qCls, qCrop, color, null);
    const design = new Set([...cands.values()].filter((r) => r.name === nameById[m.id]).map((r) => r.id));
    for (const [name, ids] of Object.entries(ranked)) {
      for (const key of [name, `${name} [${m.level}]`]) {
        const a = (agg[key] ||= { r1: 0, r15: 0, d15: 0, M: 0, n: 0 });
        const top = ids.slice(0, 15);
        if (top[0] === m.id) a.r1++; if (top.includes(m.id)) a.r15++; if (top.some((id) => id === m.id || design.has(id))) a.d15++;
        const fr = ids.indexOf(m.id); a.M += fr >= 0 ? 1 / (fr + 1) : 0; a.n++;
      }
    }
    if (++i % 50 === 0) console.log("synth", i, "/", manifest.length);
  }
  lines.push("", `## Synthetic phone photos vs FULL DB (${manifest.length} queries)`, "", "| method | R@1 exact | R@15 exact | R@15 design | MRR | n |", "|---|---|---|---|---|---|");
  for (const [name, a] of Object.entries(agg)) lines.push(`| ${name} | ${(a.r1 / a.n * 100).toFixed(1)}% | ${(a.r15 / a.n * 100).toFixed(1)}% | ${(a.d15 / a.n * 100).toFixed(1)}% | ${(a.M / a.n).toFixed(3)} | ${a.n} |`);
}
const md = `# v4 results against the full DB (${new Date().toISOString().slice(0, 10)})\n\n${lines.join("\n")}\n`;
fs.writeFileSync("scripts/exp/results-db.md", md);
console.log(md);
