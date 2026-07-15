/**
 * 브랜드 인식 단가 동기화: DB supplier ↔ Supabase 2025 TMS 브랜드 일치 단가로.
 * 이름 충돌(같은이름 다른브랜드) 안전 처리. per-color 디자인 보호. 기본 드라이런, --apply 적용.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const env = { ...process.env };
for (const file of [".env.local", "/Users/dian/.hermes/profiles/musiki/.env"]) {
  if (!fs.existsSync(file)) continue;
  fs.readFileSync(file, "utf-8").split("\n").forEach(line => {
    const [key, ...value] = line.split("=");
    if (!key || !value.length) return;
    const k = key.trim().replace(/^export\s+/, "");
    if (env[k]) return;
    env[k] = value.join("=").trim().replace(/^["']|["']$/g, "");
  });
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Supabase 환경변수가 설정되지 않았습니다");
const sb = createClient(supabaseUrl, supabaseKey);

const norm = s => (s || "").trim().toUpperCase();
const brandAlias = brand => {
  const b = norm(brand);
  if (b === "KADIAN") return "KAIDAN";
  if (b === "DRANGONSTONE" || b === "DRANGON STONE" || b === "DRAGONSTONE") return "DRAGON STONE";
  return b;
};
const priceNum = value => Number(String(value ?? "").replace(/[^0-9]/g, ""));
const textOrFallback = (primary, fallback) => primary || fallback || "";

const byName = {}; // name → {brand:price}
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from("fabric_knowledge_master")
    .select("product_name,brand,sell_price,raw,source_row")
    .eq("source_tab", "88683325")
    .not("is_active", "is", false)
    .order("source_row", { ascending: true })
    .range(from, from + 999);
  if (error) throw error;
  if (!data || !data.length) break;
  for (const row of data) {
    const raw = row.raw || {};
    const name = norm(textOrFallback(raw["제품명(중)"], row.product_name));
    const brand = brandAlias(textOrFallback(raw["브랜드"], row.brand));
    const price = priceNum(textOrFallback(raw["원단단가/Y"], row.sell_price));
    if (!name || !brand || !price) continue;
    (byName[name] = byName[name] || {})[brand] = price;
  }
  if (data.length < 1000) break;
}

let all = [], from = 0;
for (;;) {
  const { data, error } = await sb
    .from("fabrics")
    .select("id,name,supplier,price_per_yard")
    .eq("is_active", true)
    .range(from, from + 999);
  if (error) throw error;
  if (!data || !data.length) break;
  all = all.concat(data);
  from += 1000;
  if (data.length < 1000) break;
}

const byDesign = {};
for (const f of all) {
  if (!byDesign[f.name]) byDesign[f.name] = { sup: f.supplier, prices: new Set(), rows: [] };
  byDesign[f.name].prices.add(f.price_per_yard == null ? null : Number(f.price_per_yard));
  byDesign[f.name].rows.push(f);
}

let upd = 0, colFix = 0, skipPerColor = 0, noMatch = 0, ambig = 0;
const updates = [];
const colExamples = [];
for (const [name, d] of Object.entries(byDesign)) {
  const bp = byName[norm(name)];
  if (!bp) { noMatch++; continue; }
  const brand = brandAlias(d.sup);
  const brands = Object.keys(bp);
  let target = bp[brand];
  if (target == null) {
    if (brands.length === 1) target = bp[brands[0]];
    else { ambig++; continue; }
  }
  if (d.prices.size > 1) { skipPerColor++; continue; }
  const cur = [...d.prices][0];
  if (cur !== target) {
    const wasCollision = brands.length > 1 && new Set(Object.values(bp)).size > 1;
    if (wasCollision) {
      colFix++;
      if (colExamples.length < 20) colExamples.push(`${name}[${brand}]: ${cur} → ${target} (Supabase ${Object.entries(bp).map(([b,p]) => b + "=" + p).join("/")})`);
    }
    upd++;
    updates.push(...d.rows.map(r => ({ id: r.id, price: target })));
  }
}

console.log(`갱신디자인 ${upd}(색 ${updates.length}) | 그중 브랜드충돌수정 ${colFix} | per-color보호 ${skipPerColor} | 충돌-브랜드불명(건너뜀) ${ambig} | 시트없음 ${noMatch}`);
console.log("\n=== 브랜드충돌 수정 예시 ===");
colExamples.forEach(e => console.log("  " + e));
if (!APPLY) {
  console.log("\n드라이런. 적용: --apply");
  process.exit(0);
}
let done = 0;
for (let i = 0; i < updates.length; i += 100) {
  const chunk = updates.slice(i, i + 100);
  await Promise.all(chunk.map(u => sb.from("fabrics").update({ price_per_yard: u.price }).eq("id", u.id)));
  done += chunk.length;
}
console.log("완료:", done, "색");
