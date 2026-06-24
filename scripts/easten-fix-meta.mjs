/**
 * EASTEN 업로드 행의 메타 교정
 * meta.csv를 올바른 CSV 파서로 읽어 supplier/단가/폭/조성 컬럼을 id 기준 UPDATE
 * (소재에 쉼표가 있어 컬럼이 밀린 ~147행 복구)
 */
import fs from "fs";
const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });
import { createClient } from "@supabase/supabase-js";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

function parseCsv(t) { const rows = []; let row = [], f = "", q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"' && t[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; } else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c === "\r") {} else f += c; } } if (f.length || row.length) { row.push(f); rows.push(row); } return rows; }
const numOrNull = (v) => { const n = Number(v); return v !== "" && Number.isFinite(n) ? n : null; };

async function main() {
  const text = fs.readFileSync("D:/DIAN FABRIC/easten-upload/meta.csv", "utf-8").replace(/^﻿/, "");
  const rows = parseCsv(text);
  const header = rows[0].map((h) => h.trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const metaByKey = {};
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i]; const name = (c[idx.name] || "").trim(); const cc = (c[idx.color_code] || "").trim();
    metaByKey[`${name}__${cc}`] = {
      supplier: c[idx.supplier]?.trim() || null,
      price_per_yard: numOrNull(c[idx.price_per_yard]?.trim()),
      width_mm: numOrNull(c[idx.width_mm]?.trim()) ?? 1400,
      pl_percent: numOrNull(c[idx.pl_percent]?.trim()) ?? 0,
      co_percent: numOrNull(c[idx.co_percent]?.trim()) ?? 0,
      li_percent: numOrNull(c[idx.li_percent]?.trim()) ?? 0,
      other_percent: numOrNull(c[idx.other_percent]?.trim()) ?? 0,
      composition_note: c[idx.composition_note]?.trim() || null,
    };
  }
  console.log("meta 행:", Object.keys(metaByKey).length);

  // 신규 행(embedding null) id 맵
  const idByKey = {}; let from = 0;
  while (true) {
    const { data } = await sb.from("fabrics").select("id, name, color_code").is("embedding", "null").not("image_url", "is", "null").range(from, from + 999);
    if (!data || !data.length) break;
    data.forEach((r) => { idByKey[`${r.name}__${r.color_code}`] = r.id; });
    if (data.length < 1000) break; from += 1000;
  }

  // EASTEN meta 행만 UPDATE (supplier=EASTEN인 것)
  const targets = Object.entries(metaByKey).filter(([, m]) => m.supplier === "EASTEN");
  console.log("EASTEN 교정 대상:", targets.length);
  let ok = 0, miss = 0;
  for (let i = 0; i < targets.length; i += 15) {
    const batch = targets.slice(i, i + 15);
    await Promise.all(batch.map(async ([key, m]) => {
      const id = idByKey[key];
      if (!id) { miss++; return; }
      const { error } = await sb.from("fabrics").update(m).eq("id", id);
      if (!error) ok++; else console.log("ERR", key, error.message);
    }));
    if (i % 150 < 15) process.stdout.write(`\r교정 ${ok}/${targets.length}   `);
  }
  console.log(`\n완료: ${ok}개 교정, ${miss}개 id 못찾음`);

  const es = await sb.from("fabrics").select("*", { count: "exact", head: true }).eq("supplier", "EASTEN");
  console.log("최종 supplier=EASTEN:", es.count);
}
main().catch((e) => { console.error(e); process.exit(1); });
