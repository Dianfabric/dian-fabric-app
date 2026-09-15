// 골든셋 원단 + 무작위 2,000개를 로컬(scripts/exp/data)로 내려받아 오프라인 임베딩 실험 준비
// 실행: node scripts/exp/prep.mjs
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
const S = "scripts/exp/data";
fs.mkdirSync(S + "/images", { recursive: true });
const env = {};
for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1"); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const golden = JSON.parse(fs.readFileSync("scripts/golden-set.json", "utf-8"));
const labeled = golden.labels.map((l) => ({ ...l, similar_ids: l.similar_ids.filter((x) => x && x !== "null") })).filter((l) => l.similar_ids.length > 0);
const ids = new Set();
for (const l of labeled) { if (l.query.id) ids.add(l.query.id); l.similar_ids.filter(Boolean).forEach((i) => ids.add(i)); }
let pool = [];
for (let from = 0; from < 20000; from += 1000) {
  const { data, error } = await sb.from("fabrics").select("id").not("embedding_dino", "is", null).not("image_url", "is", null).order("id").range(from, from + 999);
  if (error || !data?.length) break; pool.push(...data.map((r) => r.id)); if (data.length < 1000) break;
}
for (const id of pool.sort(() => Math.random() - 0.5)) { if (ids.size >= 2400) break; ids.add(id); }
const all = [...ids].filter((x) => x && x !== "null"); const rows = [];
for (let i = 0; i < all.length; i += 100) {
  const { data, error } = await sb.from("fabrics").select("id,name,color_code,image_url,fabric_type,pattern_detail,notes,image_width").in("id", all.slice(i, i + 100));
  if (error) { console.log("meta err", error.message); continue; } rows.push(...data);
}
fs.writeFileSync(S + "/meta.json", JSON.stringify({ labeled, rows }));
let ok = 0, fail = 0;
const dl = async (r) => { const out = `${S}/images/${r.id}.jpg`; if (fs.existsSync(out)) { ok++; return; } try { const res = await fetch(r.image_url); if (!res.ok) throw new Error(res.status); fs.writeFileSync(out, Buffer.from(await res.arrayBuffer())); ok++; } catch { fail++; } };
for (let i = 0; i < rows.length; i += 8) { await Promise.all(rows.slice(i, i + 8).map(dl)); if (i % 400 === 0) console.log(`dl ${i}/${rows.length}`); }
console.log("rows", rows.length, "download ok", ok, "fail", fail);
