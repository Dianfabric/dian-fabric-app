import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Gemini 2.5 Flash 1:5 고해상도 랭킹 API
 *
 * 100×100 그리드 합성 폐기 → 쿼리 1장 + 후보 5장씩 512px 고해상도 비교
 * 10번 호출(50개 후보) → 각각 1-5 순위
 *
 * Plan B (균형) 기본: Gemini 2.5 Flash 무료 티어
 */

const THUMB_SIZE = 512;
const CANDIDATES_PER_CALL = 5;

const PROMPT = `당신은 원단 전문가입니다. 제공된 6개 이미지를 보세요.

이미지 1: 쿼리 원단 (찾고 있는 원단)
이미지 2-6: 후보 원단 (번호 순서)

다음 기준으로 후보 5개를 쿼리와 가장 비슷한 순서대로 정렬해주세요:
1. 색상 (LAB 색공간 기준, 사람 눈에 보이는 색상)
2. 텍스쳐 (직조 방식, 표면 결, 광택)
3. 패턴 (있다면 패턴의 종류와 크기)

규칙:
- 5개 모두 순위 매기기 (가장 비슷한 게 1번)
- 점수는 0-100 (100=동일, 0=완전 다름)
- JSON 배열로만 응답: [{"idx":1,"score":85,"reason":"..."},...]
- 마크다운, 설명 없이 순수 JSON만

응답 예시:
[{"idx":3,"score":92,"reason":"색상·텍스쳐 매우 유사"},{"idx":1,"score":78,"reason":"색상 비슷"},{"idx":5,"score":65,"reason":"패턴 유사"},{"idx":2,"score":45,"reason":"텍스쳐만 비슷"},{"idx":4,"score":30,"reason":"색상 다름"}]`;

async function fetchAndResize(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await sharp(buf)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function geminiRankBatch(
  apiKey: string,
  queryBase64: string,
  candidates: Array<{ id: string; image_url: string }>,
): Promise<Array<{ id: string; score: number; reason: string }>> {
  // 후보 이미지 다운로드 + 리사이즈 (병렬)
  const candBuffers = await Promise.all(candidates.map((c) => fetchAndResize(c.image_url)));
  const valid = candBuffers
    .map((b, i) => (b ? { buffer: b, candidate: candidates[i] } : null))
    .filter(Boolean) as Array<{ buffer: Buffer; candidate: { id: string; image_url: string } }>;

  if (valid.length === 0) return [];

  // Gemini API에 보낼 inline_data 구성
  const parts: Array<Record<string, unknown>> = [
    { text: "이미지 1 (쿼리):" },
    { inline_data: { mime_type: "image/jpeg", data: queryBase64 } },
  ];
  valid.forEach((v, i) => {
    parts.push({ text: `이미지 ${i + 2} (후보 ${i + 1}):` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: v.buffer.toString("base64") } });
  });
  parts.push({ text: PROMPT });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Gemini API error:", res.status, errText.slice(0, 300));
    // Fallback: 원래 순서 유지
    return valid.map((v, i) => ({ id: v.candidate.id, score: 50 - i, reason: "fallback" }));
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

  // JSON 파싱
  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  type RankItem = { idx: number; score: number; reason?: string };
  let parsed: RankItem[];
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.error("Gemini rank parse error:", cleaned.slice(0, 200));
    return valid.map((v, i) => ({ id: v.candidate.id, score: 50 - i, reason: "parse_error" }));
  }

  // idx → id 매핑 (1-based)
  return parsed
    .filter((p) => p.idx >= 1 && p.idx <= valid.length)
    .map((p) => ({
      id: valid[p.idx - 1].candidate.id,
      score: p.score,
      reason: p.reason || "",
    }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queryImageBase64, candidates } = body as {
      queryImageBase64: string;
      candidates: Array<{ id: string; image_url: string }>;
    };

    if (!queryImageBase64 || !candidates || candidates.length === 0) {
      return NextResponse.json({ error: "queryImageBase64와 candidates 필수" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });
    }

    // 쿼리 이미지 512px 리사이즈
    const queryBuf = Buffer.from(queryImageBase64, "base64");
    const queryResized = await sharp(queryBuf)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside" })
      .jpeg({ quality: 85 })
      .toBuffer();
    const queryB64 = queryResized.toString("base64");

    // 5개씩 배치로 나눠서 병렬 호출
    const batches: Array<typeof candidates> = [];
    for (let i = 0; i < candidates.length; i += CANDIDATES_PER_CALL) {
      batches.push(candidates.slice(i, i + CANDIDATES_PER_CALL));
    }

    const results = await Promise.all(
      batches.map((batch) => geminiRankBatch(apiKey, queryB64, batch))
    );

    // 모든 결과 합쳐서 점수순 정렬
    const allRanked = results.flat().sort((a, b) => b.score - a.score);

    return NextResponse.json({
      ranked: allRanked,
      total: allRanked.length,
      batches: batches.length,
    });
  } catch (err) {
    console.error("Gemini Rank API error:", err);
    return NextResponse.json({ error: "랭킹 서버 오류" }, { status: 500 });
  }
}
