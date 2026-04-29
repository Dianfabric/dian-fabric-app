/**
 * Supabase에서 다양한 디자인 50개 샘플링 → HTML 카탈로그 생성
 * pattern_detail별로 골고루 뽑아서 텍스쳐/패턴이 다양하도록
 *
 * 사용: node scripts/sample-50-html.mjs
 */

import fs from "fs";

const envContent = fs.readFileSync(".env.local", "utf-8");
const env = {};
envContent.split("\n").forEach((line) => {
  const [key, ...vals] = line.split("=");
  if (key && vals.length) env[key.trim()] = vals.join("=").trim();
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;

// 다양성 위해 패턴별로 분산 샘플링
const PATTERNS = [
  "무지", "부클", "하운드투스", "스트라이프", "체크",
  "헤링본", "추상", "기하학", "자연", "동물",
  "식물", "큰패턴", "다마스크",
];
const PER_PATTERN = 4; // 13 * 4 = 52, 50으로 트림

async function fetchByPattern(pattern, limit) {
  const url = `${SUPABASE_URL}/rest/v1/fabrics?select=id,name,color_code,image_url,fabric_type,pattern_detail,notes&image_url=not.is.null&pattern_detail=eq.${encodeURIComponent(pattern)}&limit=${limit * 10}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) {
    console.error(`${pattern} fetch 실패: ${res.status}`);
    return [];
  }
  const data = await res.json();
  // 무작위 셔플 후 limit개만
  return data.sort(() => Math.random() - 0.5).slice(0, limit);
}

function colorBadge(notes) {
  if (!notes) return "";
  const colorPart = notes.split("|")[0];
  if (!colorPart || colorPart.startsWith("rgb:")) return "";
  return colorPart.split(",").slice(0, 2).join(", ");
}

async function main() {
  console.log("패턴별 샘플 수집 중...\n");
  const samples = [];

  for (const p of PATTERNS) {
    const fabrics = await fetchByPattern(p, PER_PATTERN);
    samples.push(...fabrics);
    console.log(`  ${p.padEnd(8)} ${fabrics.length}개`);
  }

  const final = samples.slice(0, 50);
  console.log(`\n총 ${final.length}개 선택됨`);

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>원단 샘플 50개 — A/B 테스트용</title>
<style>
* { box-sizing: border-box; }
body { font-family: -apple-system, "Segoe UI", sans-serif; padding: 24px; background: #f5f5f7; margin: 0; }
header { max-width: 1400px; margin: 0 auto 20px; }
h1 { font-size: 22px; margin: 0 0 6px; }
.subtitle { font-size: 13px; color: #666; }
.subtitle code { background: #fff; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.grid {
  max-width: 1400px; margin: 0 auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;
}
.card {
  background: white; border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05); transition: transform 0.15s;
}
.card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
.card img { width: 100%; aspect-ratio: 1; object-fit: cover; cursor: pointer; display: block; }
.info { padding: 10px 12px 12px; }
.name { font-weight: 700; font-size: 14px; }
.color { color: #888; font-size: 11px; margin-bottom: 6px; }
.tags { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 8px; }
.tag {
  font-size: 9px; padding: 2px 7px; border-radius: 4px; font-weight: 600;
  background: #f0e9d6; color: #8B6914;
}
.tag.pattern { background: #8B6914; color: white; }
.colors { font-size: 10px; color: #666; margin-bottom: 8px; }
.actions { display: flex; gap: 4px; }
.btn {
  flex: 1; font-size: 10px; padding: 6px 8px;
  border: none; border-radius: 4px; cursor: pointer; font-weight: 600;
}
.btn-copy { background: #4A90E2; color: white; }
.btn-copy:hover { background: #3a7bc8; }
.btn-open { background: #eee; color: #333; }
.btn-open:hover { background: #ddd; }
</style>
</head>
<body>
<header>
  <h1>원단 샘플 ${final.length}개 — A/B 테스트용</h1>
  <p class="subtitle">
    1. <strong>"이미지 저장"</strong> 우클릭 → 다운로드 후 <code>http://localhost:3000/compare</code>에 업로드<br>
    또는 2. <strong>"URL 복사"</strong> → 새 탭에서 이미지 열어 우클릭 저장
  </p>
</header>
<div class="grid">
${final
  .map(
    (f) => `
  <div class="card">
    <img src="${f.image_url}" alt="${f.name}-${f.color_code}" loading="lazy" onclick="window.open(this.src, '_blank')" title="클릭: 새 탭에서 열기">
    <div class="info">
      <div class="name">${f.name}</div>
      <div class="color">Color: ${f.color_code}</div>
      <div class="tags">
        ${f.fabric_type ? `<span class="tag">${f.fabric_type}</span>` : ""}
        ${f.pattern_detail ? `<span class="tag pattern">${f.pattern_detail}</span>` : ""}
      </div>
      ${colorBadge(f.notes) ? `<div class="colors">${colorBadge(f.notes)}</div>` : ""}
      <div class="actions">
        <button class="btn btn-copy" onclick="navigator.clipboard.writeText('${f.image_url}'); this.textContent='복사됨!'; setTimeout(()=>this.textContent='URL 복사', 1200)">URL 복사</button>
        <button class="btn btn-open" onclick="window.open('${f.image_url}', '_blank')">이미지 열기</button>
      </div>
    </div>
  </div>`
  )
  .join("")}
</div>
</body>
</html>`;

  const outPath = "scripts/samples-50.html";
  fs.writeFileSync(outPath, html);
  console.log(`\n✅ ${outPath} 생성 완료`);
  console.log(`   브라우저에서 열기: file:///D:/DIAN FABRIC/dian-fabric-app/${outPath}`);
}

main().catch((e) => {
  console.error("에러:", e);
  process.exit(1);
});
