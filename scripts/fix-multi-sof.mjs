/**
 * 다중 SOF 마커 JPEG 수정 스크립트
 *
 * 문제: 일부 JPEG에 SOF 마커가 여러개 → 첫 번째(작은 썸네일)를 브라우저가 메인으로 인식
 * 해결: sharp로 re-encode → 깨끗한 단일 SOF JPEG 생성 → Supabase 재업로드
 *
 * 사용법: node scripts/fix-multi-sof.mjs
 */

import sharp from "sharp";

const envContent = fs.readFileSync(".env.local", "utf-8");
const envVars = {};
envContent.split("\n").forEach((line) => { const [k, ...v] = line.split("="); if (k && v.length) envVars[k.trim()] = v.join("=").trim(); });
const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_KEY;
const BATCH_SIZE = 20;

// JPEG 파일에서 모든 SOF 마커의 해상도를 추출
function findAllSOF(buf) {
  const sofs = [];
  for (let i = 0; i < buf.length - 10; i++) {
    if (buf[i] === 0xff && (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc2)) {
      const h = (buf[i + 5] << 8) | buf[i + 6];
      const w = (buf[i + 7] << 8) | buf[i + 8];
      sofs.push({ offset: i, w, h });
    }
  }
  return sofs;
}

// 이 JPEG이 다중 SOF 문제가 있는지 판단
// 조건: SOF가 2개 이상 && 첫 번째 SOF의 해상도 < 마지막 SOF 해상도
function hasMultiSOFIssue(buf) {
  const sofs = findAllSOF(buf);
  if (sofs.length < 2) return null;

  const first = sofs[0];
  const last = sofs[sofs.length - 1];
  const firstMin = Math.min(first.w, first.h);
  const lastMin = Math.min(last.w, last.h);

  if (firstMin < lastMin) {
    return { sofs, firstRes: `${first.w}x${first.h}`, actualRes: `${last.w}x${last.h}` };
  }
  return null;
}

async function fetchAllFabrics() {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/fabrics?select=id,name,color_code,image_url&image_url=not.is.null&limit=1000&offset=${offset}&order=name`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    offset += 1000;
  }
  return all;
}

async function checkAndFix(fabric) {
  try {
    const res = await fetch(fabric.image_url);
    if (!res.ok) return { status: "fetch_error", code: res.status };

    const buf = Buffer.from(await res.arrayBuffer());
    const issue = hasMultiSOFIssue(buf);
    if (!issue) return { status: "ok" };

    // sharp로 re-encode (실제 본문 이미지만 깨끗하게 추출)
    const fixed = await sharp(buf)
      .jpeg({ quality: 90 })
      .toBuffer();

    // 수정된 이미지 검증
    const fixedSOFs = findAllSOF(fixed);
    if (fixedSOFs.length !== 1) {
      return { status: "fix_failed", reason: `still ${fixedSOFs.length} SOFs` };
    }

    const fixedRes = `${fixedSOFs[0].w}x${fixedSOFs[0].h}`;

    // Supabase에 재업로드
    const storagePath = fabric.image_url.split("/Fabric-images/")[1];
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/Fabric-images/${storagePath}`;
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "true",
      },
      body: fixed,
    });

    if (uploadRes.status === 200 || uploadRes.status === 201) {
      return {
        status: "fixed",
        before: issue.firstRes,
        actual: issue.actualRes,
        after: fixedRes,
        sizeBefore: `${(buf.length / 1024).toFixed(0)}KB`,
        sizeAfter: `${(fixed.length / 1024).toFixed(0)}KB`,
      };
    } else {
      return { status: "upload_error", code: uploadRes.status };
    }
  } catch (e) {
    return { status: "error", message: e.message };
  }
}

async function main() {
  console.log("=== 다중 SOF JPEG 수정 스크립트 ===\n");

  console.log("1. 전체 원단 목록 가져오는 중...");
  const fabrics = await fetchAllFabrics();
  console.log(`   총 ${fabrics.length}개\n`);

  console.log("2. 다중 SOF 이미지 검출 + 수정 시작...\n");

  let checked = 0;
  let fixed = 0;
  let errors = 0;
  const fixedList = [];
  const errorList = [];
  const start = Date.now();

  for (let i = 0; i < fabrics.length; i += BATCH_SIZE) {
    const batch = fabrics.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((fab, idx) => checkAndFix(fab).then((r) => ({ fab, result: r, idx: i + idx })))
    );

    for (const { fab, result } of results) {
      checked++;
      if (result.status === "fixed") {
        fixed++;
        fixedList.push(`${fab.name}-${fab.color_code}: ${result.before} → ${result.after} (${result.sizeBefore} → ${result.sizeAfter})`);
        console.log(`  ✅ ${fab.name}-${fab.color_code} | ${result.before} → ${result.after} | ${result.sizeBefore} → ${result.sizeAfter}`);
      } else if (result.status !== "ok") {
        errors++;
        errorList.push(`${fab.name}-${fab.color_code}: ${result.status} ${result.message || result.reason || ""}`);
      }
    }

    if (checked % 200 === 0 || checked === fabrics.length) {
      const elapsed = ((Date.now() - start) / 60000).toFixed(1);
      const remaining = (((Date.now() - start) / checked) * (fabrics.length - checked) / 60000).toFixed(0);
      console.log(`  [${checked}/${fabrics.length}] ${elapsed}분 경과, ~${remaining}분 남음 | 수정: ${fixed} | 에러: ${errors}`);
    }
  }

  console.log("\n=== 완료 ===");
  console.log(`총 체크: ${checked}개`);
  console.log(`수정됨:  ${fixed}개`);
  console.log(`에러:    ${errors}개`);
  console.log(`시간:    ${((Date.now() - start) / 60000).toFixed(1)}분`);

  if (fixedList.length > 0) {
    console.log("\n--- 수정된 이미지 ---");
    fixedList.forEach((l) => console.log("  " + l));
  }
  if (errorList.length > 0) {
    console.log("\n--- 에러 ---");
    errorList.forEach((l) => console.log("  " + l));
  }
}

main().catch(console.error);
