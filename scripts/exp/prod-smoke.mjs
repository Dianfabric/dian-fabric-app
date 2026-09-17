// Smoke-test the v4 search pipeline against a deployed base URL (production or local dev server).
// Usage: node scripts/exp/prod-smoke.mjs <baseUrl> [label]
//   POST /api/embed (multipart) → POST /api/search-v4 → POST /api/rank-v4 (top 20), twice (cold + warm).
// Prints a markdown table row per step and exits 1 if any step fails.
import fs from "fs";
const base = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const label = process.argv[3] || base;
const S = "scripts/exp/data";
const ID = "0075cba0-5b63-472d-8d9d-53c665a8aab8"; // DOLLAR-20 synthetic phone photo (source fabric is in the DB)
const img = fs.readFileSync(`${S}/synth/${ID}.jpg`);
const rows = []; let failed = false;
const step = async (name, fn) => { const t = Date.now(); try { const r = await fn(); rows.push(`| ${label} | ${name} | ${Date.now() - t} ms | ${r} |`); return true; } catch (e) { failed = true; rows.push(`| ${label} | ${name} | ${Date.now() - t} ms | FAIL: ${String(e.message || e).slice(0, 120)} |`); return false; } };
const post = async (path, body, isForm) => { const res = await fetch(base + path, { method: "POST", body, headers: isForm ? undefined : { "Content-Type": "application/json" }, signal: AbortSignal.timeout(120000) }); const text = await res.text(); let json; try { json = JSON.parse(text); } catch { throw new Error(`http ${res.status} non-json: ${text.slice(0, 80)}`); } if (!res.ok) throw new Error(`http ${res.status} ${json.error || ""}`); return json; };

let features, results;
for (const pass of ["cold", "warm"]) {
  await step(`embed (${pass})`, async () => { const fd = new FormData(); fd.append("image", new Blob([img], { type: "image/jpeg" }), "phone.jpg"); fd.append("variants", "full,crop,scales"); features = await post("/api/embed", fd, true); return `dtype ${features.dtype}, server ${features.ms} ms`; });
  if (!features) break;
  await step(`search-v4 (${pass})`, async () => { const r = await post("/api/search-v4", JSON.stringify({ full: features.full, crop: features.crop, scales: features.scales, color: features.color, matchCount: 100 })); results = r.results; const rank = results.findIndex((x) => x.id === ID) + 1; return `${r.total} candidates, server ${r.ms} ms, source rank ${rank || "not in top 100"}, top1 ${results[0]?.name}-${results[0]?.color_code}`; });
}
if (results) await step("rank-v4 (Gemini, top 20)", async () => { const r = await post("/api/rank-v4", JSON.stringify({ queryImageBase64: img.toString("base64"), candidates: results.slice(0, 20).map((c) => ({ id: c.id, image_url: c.image_url })) })); const top = r.ranked[0]; const src = r.ranked.findIndex((x) => x.id === ID) + 1; return `${r.model}, server ${r.ms} ms, source rank after rerank ${src || "-"}, top score ${top?.score}`; });
console.log("| target | step | wall | detail |\n|---|---|---|---|\n" + rows.join("\n"));
process.exit(failed ? 1 : 0);
