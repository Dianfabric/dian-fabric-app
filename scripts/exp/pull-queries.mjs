// Pull captured real query photos from the private "search-queries" bucket and replay them through a deployed API.
// Usage: node scripts/exp/pull-queries.mjs [baseUrl] [expectName-expectCode ...]
//   e.g. node scripts/exp/pull-queries.mjs https://dian-fabric-app.vercel.app ECOTONE-02
// Downloads every capture not yet in scripts/exp/data/queries/, then for the newest N (default 5) prints the top-5
// and — when expectations are given — where each expected fabric ranks (search stage, top 300).
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
const base = (process.argv[2] || "https://dian-fabric-app.vercel.app").replace(/\/$/, "");
const expects = process.argv.slice(3);
const env = {}; for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1"); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const dir = "scripts/exp/data/queries"; fs.mkdirSync(dir, { recursive: true });
const { data: days } = await sb.storage.from("search-queries").list("", { limit: 100 });
const files = [];
for (const d of days || []) { if (!d.name || d.name.startsWith("_")) continue; const { data: fl } = await sb.storage.from("search-queries").list(d.name, { limit: 500, sortBy: { column: "name", order: "asc" } }); for (const f of fl || []) files.push(`${d.name}/${f.name}`); }
let pulled = 0;
for (const p of files) { const local = `${dir}/${p.replace("/", "_")}`; if (fs.existsSync(local)) continue; const { data, error } = await sb.storage.from("search-queries").download(p); if (error) { console.log("download failed", p, error.message); continue; } fs.writeFileSync(local, Buffer.from(await data.arrayBuffer())); pulled++; }
console.log(`captures in bucket: ${files.length}, newly pulled: ${pulled}`);
const post = async (path, body, isForm) => { const res = await fetch(base + path, { method: "POST", body, headers: isForm ? undefined : { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000) }); const j = await res.json(); if (!res.ok) throw new Error(`${path} ${res.status} ${j.error}`); return j; };
const newest = files.slice(-5).reverse();
for (const p of newest) {
  const buf = fs.readFileSync(`${dir}/${p.replace("/", "_")}`);
  const fd = new FormData(); fd.append("image", new Blob([buf], { type: "image/jpeg" }), "q.jpg"); fd.append("variants", "full,crop");
  const f = await post("/api/embed", fd, true);
  const s = await post("/api/search-v4", JSON.stringify({ full: f.full, crop: f.crop, color: f.color, matchCount: 300 }));
  console.log(`\n=== ${p} (${(buf.length / 1024).toFixed(0)} KB) — query colour ${JSON.stringify(f.color.raw.map((c) => c.lab))}`);
  s.results.slice(0, 5).forEach((r, i) => console.log(`  #${i + 1} ${(r.name + "-" + r.color_code).padEnd(14)} score ${r.similarity.toFixed(3)} cls ${r.s_cls.toFixed(2)} crop ${r.s_crop.toFixed(2)} colour ${r.s_color.toFixed(2)} ${r.pattern_detail ?? ""}`));
  for (const e of expects) { const [n, c] = e.split("-"); const i = s.results.findIndex((r) => r.name === n && String(r.color_code) === c); const r = s.results[i]; console.log(`  expect ${e}: ${i >= 0 ? `rank ${i + 1} score ${r.similarity.toFixed(3)} cls ${r.s_cls.toFixed(2)} crop ${r.s_crop.toFixed(2)} colour ${r.s_color.toFixed(2)}` : "NOT in top 300 (candidates " + s.total + ")"}`); }
}
