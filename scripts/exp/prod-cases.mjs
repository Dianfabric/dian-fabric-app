// Re-create the two user-reported cases against a deployed base URL:
//   1. purple fabric photo (ELLA-12 catalogue image)            → top results should be purple family
//   2. striped fabric photo (PS3115-1 catalogue image)          → top results should be striped, not 무지
// Prints top-8 of search-v4 (with colour / pattern scores) and of rank-v4 for each case.
// Usage: node scripts/exp/prod-cases.mjs <baseUrl>
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
const base = (process.argv[2] || "https://dian-fabric-app.vercel.app").replace(/\/$/, "");
const env = {}; for (const line of fs.readFileSync(".env.local", "utf-8").split(/\r?\n/)) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, "$1"); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const post = async (path, body, isForm) => { const res = await fetch(base + path, { method: "POST", body, headers: isForm ? undefined : { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000) }); const j = await res.json(); if (!res.ok) throw new Error(`${path} http ${res.status} ${j.error || ""}`); return j; };
const cases = [
  { label: "purple (ELLA-12)", name: "ELLA", color_code: "12", hints: { patternDetail: "무지", colorNames: [{ name: "퍼플", pct: 95 }] } },
  { label: "stripe (PS3115-1)", name: "PS3115", color_code: "1", hints: { patternDetail: "스트라이프,기하학", colorNames: [{ name: "그레이", pct: 95 }] } },
];
for (const c of cases) {
  const { data: rows } = await sb.from("fabrics").select("id,image_url").eq("name", c.name).eq("color_code", c.color_code).limit(1);
  const q = rows?.[0]; if (!q) { console.log(c.label, "not found"); continue; }
  const img = Buffer.from(await (await fetch(q.image_url)).arrayBuffer());
  const fd = new FormData(); fd.append("image", new Blob([img], { type: "image/jpeg" }), "q.jpg"); fd.append("variants", "full,crop");
  const f = await post("/api/embed", fd, true);
  const s = await post("/api/search-v4", JSON.stringify({ full: f.full, crop: f.crop, color: f.color, hints: c.hints, matchCount: 40 }));
  console.log(`\n=== ${c.label}: search-v4 top 8 (colorMode ${s.colorMode}, ${s.total} candidates, ${s.ms} ms)`);
  s.results.slice(0, 8).forEach((r, i) => console.log(`  #${i + 1} ${(r.name + "-" + r.color_code).padEnd(14)} score ${r.similarity.toFixed(3)} colour ${r.s_color.toFixed(2)} bonus ${r.bonus.toFixed(2)} pattern ${r.pattern_detail ?? "-"} | ${(r.notes || "").split("|")[0]}`));
  const r = await post("/api/rank-v4", JSON.stringify({ queryImageBase64: img.toString("base64"), candidates: s.results.slice(0, 20).map((x) => ({ id: x.id, image_url: x.image_url })) }));
  const byId = Object.fromEntries(s.results.map((x) => [x.id, x]));
  console.log(`--- rank-v4 top 8 (${r.model}, ${r.ms} ms)`);
  r.ranked.slice(0, 8).forEach((x, i) => { const m = byId[x.id]; console.log(`  #${i + 1} ${(m.name + "-" + m.color_code).padEnd(14)} ${String(x.score).padStart(3)}  ${x.reason}`); });
}
