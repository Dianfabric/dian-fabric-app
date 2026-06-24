/**
 * kNN 카테고리 분류 — 기존 14,625개 라벨 상속 (JS 직접 계산)
 * 신규(auto_classified=false)의 embedding_dino vs 기존 분류 원단(auto_classified=true)만 코사인 비교.
 * → 가장 닮은 기존 K개의 fabric_type(베이스)·pattern_detail 다수결(유사도 가중) 상속.
 * fabric_type 소재(린넨/면)는 우리 조성(li/co)으로 보정.
 *
 * 실행: node scripts/knn-classify.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

const K = 15;
const DIM = 768;
const MATERIALS = ["린넨", "면", "울"];

function baseType(ft) {
  if (!ft) return null;
  const parts = ft.split(",").map((s) => s.trim()).filter((t) => t && !MATERIALS.includes(t));
  return parts.join(",") || null;
}
function parseNorm(str) {
  const arr = JSON.parse(str);
  if (!Array.isArray(arr) || arr.length !== DIM) return null;
  const v = new Float32Array(DIM);
  let n = 0; for (let i = 0; i < DIM; i++) { v[i] = arr[i]; n += arr[i] * arr[i]; }
  n = Math.sqrt(n); if (n > 0) for (let i = 0; i < DIM; i++) v[i] /= n;
  return v;
}
function vote(items) {
  const score = new Map();
  for (const { value, sim } of items) { const k = value === null ? "__null__" : value; score.set(k, (score.get(k) || 0) + sim); }
  let best = null, bs = -1; for (const [k, s] of score) if (s > bs) { bs = s; best = k; }
  return best === "__null__" ? null : best;
}

async function loadAll(filter) {
  let out = [], from = 0;
  while (true) {
    let q = sb.from("fabrics").select("id, fabric_type, pattern_detail, co_percent, li_percent, embedding_dino").not("embedding_dino", "is", "null").range(from, from + 999);
    q = filter(q);
    const { data, error } = await q;
    if (error) { console.error(error.message); break; }
    if (!data || !data.length) break;
    out = out.concat(data); if (data.length < 1000) break; from += 1000;
  }
  return out;
}

async function main() {
  console.log("[1/3] 기존 분류 원단 로딩...");
  const cls = await loadAll((q) => q.eq("auto_classified", true));
  const labels = [], vecs = [];
  for (const r of cls) { const v = parseNorm(r.embedding_dino); if (v) { vecs.push(v); labels.push({ base: baseType(r.fabric_type), pat: r.pattern_detail ?? null }); } }
  console.log(`  ✓ 기존 ${vecs.length}개 임베딩 로드`);

  console.log("[2/3] 신규 원단 로딩...");
  const neu = await loadAll((q) => q.eq("auto_classified", false));
  console.log(`  ✓ 신규 ${neu.length}개`);

  console.log("[3/3] kNN 분류...");
  let ok = 0; const start = Date.now(); const M = vecs.length;
  const updates = [];
  for (let idx = 0; idx < neu.length; idx++) {
    const f = neu[idx];
    const qv = parseNorm(f.embedding_dino); if (!qv) continue;
    // top-K by dot product
    const topS = new Array(K).fill(-2), topI = new Array(K).fill(-1);
    for (let j = 0; j < M; j++) {
      const v = vecs[j]; let d = 0;
      for (let k = 0; k < DIM; k++) d += qv[k] * v[k];
      if (d > topS[K - 1]) {
        let p = K - 1; while (p > 0 && topS[p - 1] < d) { topS[p] = topS[p - 1]; topI[p] = topI[p - 1]; p--; }
        topS[p] = d; topI[p] = j;
      }
    }
    const neigh = [];
    for (let t = 0; t < K; t++) if (topI[t] >= 0) neigh.push({ l: labels[topI[t]], sim: topS[t] });
    const base = vote(neigh.map((n) => ({ value: n.l.base, sim: n.sim })));
    const pat = vote(neigh.map((n) => ({ value: n.l.pat, sim: n.sim })));
    const mats = [];
    if ((f.li_percent || 0) > 0) mats.push("린넨");
    if ((f.co_percent || 0) > 0) mats.push("면");
    const fabricType = [base, ...mats].filter(Boolean).join(",") || base;
    updates.push({ id: f.id, fabric_type: fabricType, pattern_detail: pat });
    ok++;
    if (ok % 100 === 0) { const eta = Math.ceil(((Date.now() - start) / 1000 / ok) * (neu.length - ok) / 60); process.stdout.write(`\r  계산 ${ok}/${neu.length} ETA~${eta}분   `); }
  }
  console.log(`\n  계산 완료, DB 업데이트 ${updates.length}개...`);
  let upd = 0;
  for (let i = 0; i < updates.length; i += 15) {
    await Promise.all(updates.slice(i, i + 15).map((u) => sb.from("fabrics").update({ fabric_type: u.fabric_type, pattern_detail: u.pattern_detail }).eq("id", u.id)));
    upd += Math.min(15, updates.length - i);
    if (upd % 300 < 15) process.stdout.write(`\r  업데이트 ${upd}/${updates.length}   `);
  }
  console.log(`\n완료: ${upd}개 분류`);
}
main().catch((e) => { console.error(e); process.exit(1); });
