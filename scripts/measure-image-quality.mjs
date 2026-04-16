/**
 * 이미지 해상도 측정 → image_width 컬럼에 저장
 * 고해상도 이미지를 먼저 보여주기 위한 정렬 기준
 *
 * 사전 조건: Supabase에서 아래 SQL 실행
 * ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS image_width integer DEFAULT 0;
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

function parseImageWidth(buf) {
  // JPEG: SOF0~SOF3 마커에서 해상도 추출
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let offset = 2;
    while (offset < buf.length - 10) {
      if (buf[offset] !== 0xFF) { offset++; continue; }
      const marker = buf[offset + 1];
      if (marker >= 0xC0 && marker <= 0xC3) {
        return buf.readUInt16BE(offset + 7);
      }
      if (marker === 0xD8 || marker === 0xD9) { offset += 2; continue; }
      if (offset + 3 >= buf.length) break;
      const segLen = buf.readUInt16BE(offset + 2);
      offset += 2 + segLen;
    }
  }
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf.length > 20) {
    return buf.readUInt32BE(16);
  }
  // WebP
  if (buf.length > 30 && buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") {
    if (buf.slice(12, 16).toString() === "VP8 ") return buf.readUInt16LE(26) & 0x3FFF;
    if (buf.slice(12, 16).toString() === "VP8L") return ((buf.readUInt32LE(21)) & 0x3FFF) + 1;
  }
  return null;
}

async function getImageWidth(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Range: "bytes=0-65535" },
    });
    clearTimeout(timeout);
    if (!res.ok && res.status !== 206) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return parseImageWidth(buf);
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== 이미지 해상도 측정 시작 ===\n");

  // 1. notes에 이전에 추가된 |w: 정리
  console.log("이전 notes |w: 데이터 정리 중...");
  let cleanPage = 0;
  let cleaned = 0;
  while (true) {
    const from = cleanPage * 1000;
    const { data } = await supabase
      .from("fabrics")
      .select("id, notes")
      .ilike("notes", "%|w:%")
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    for (const f of data) {
      const newNotes = f.notes.replace(/\|w:\d+/g, "");
      if (newNotes !== f.notes) {
        await supabase.from("fabrics").update({ notes: newNotes }).eq("id", f.id);
        cleaned++;
      }
    }
    if (data.length < 1000) break;
    cleanPage++;
  }
  if (cleaned > 0) console.log(`  ${cleaned}개 notes 정리 완료\n`);

  // 2. image_width가 0이거나 null인 원단만 측정
  let allFabrics = [];
  let page = 0;
  while (true) {
    const from = page * 1000;
    const { data, error } = await supabase
      .from("fabrics")
      .select("id, name, image_url, image_width")
      .not("image_url", "is", null)
      .or("image_width.is.null,image_width.eq.0")
      .range(from, from + 999);
    if (error) { console.error("DB 에러:", error.message); break; }
    if (!data || data.length === 0) break;
    allFabrics = allFabrics.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  console.log("측정 대상: " + allFabrics.length + "개\n");

  if (allFabrics.length === 0) {
    console.log("모든 이미지 측정 완료 상태입니다.");
    await showStats();
    return;
  }

  let updated = 0;
  let failed = 0;
  const BATCH = 20;

  for (let i = 0; i < allFabrics.length; i += BATCH) {
    const batch = allFabrics.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (f) => {
        const width = await getImageWidth(f.image_url);
        return { id: f.id, width };
      })
    );

    for (const r of results) {
      const w = r.width || 1; // 측정 실패 시 1 (다시 시도 안 함)
      const { error } = await supabase
        .from("fabrics")
        .update({ image_width: w })
        .eq("id", r.id);
      if (!error) {
        if (r.width) updated++;
        else failed++;
      }
    }

    const total = i + batch.length;
    if (total % 500 === 0 || total === allFabrics.length) {
      console.log(`  [${total}/${allFabrics.length}] 성공:${updated} 실패:${failed}`);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n=== 완료 ===");
  console.log("  측정 성공: " + updated + "개");
  console.log("  측정 실패: " + failed + "개");

  await showStats();
}

async function showStats() {
  const { data: high } = await supabase
    .from("fabrics").select("id", { count: "exact", head: true })
    .gte("image_width", 800);
  const { data: mid } = await supabase
    .from("fabrics").select("id", { count: "exact", head: true })
    .gte("image_width", 400).lt("image_width", 800);
  const { data: low } = await supabase
    .from("fabrics").select("id", { count: "exact", head: true })
    .gt("image_width", 1).lt("image_width", 400);

  console.log("\n=== 해상도 분포 ===");
  // Get min/max
  const { data: maxW } = await supabase
    .from("fabrics").select("image_width")
    .gt("image_width", 1)
    .order("image_width", { ascending: false }).limit(1);
  const { data: minW } = await supabase
    .from("fabrics").select("image_width")
    .gt("image_width", 1)
    .order("image_width", { ascending: true }).limit(1);

  if (maxW?.[0]) console.log("  최대: " + maxW[0].image_width + "px");
  if (minW?.[0]) console.log("  최소: " + minW[0].image_width + "px");
}

main().catch(console.error);
