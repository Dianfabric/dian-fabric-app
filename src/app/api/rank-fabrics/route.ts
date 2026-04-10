import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Gemini 최종 랭킹 API
 *
 * CLIP+RGB로 추린 후보 100개 → Gemini가 시각적으로 비교 → 유사도순 정렬
 *
 * 방식: 후보 이미지들을 작은 썸네일로 리사이즈 → 10x10 그리드 합성
 *       → 쿼리 이미지 + 그리드 이미지를 Gemini에 전송
 *       → Gemini가 번호로 랭킹 반환
 */

const THUMB_SIZE = 100; // 각 썸네일 크기
const GRID_COLS = 10;   // 그리드 열 수

function buildRankPrompt(count: number): string {
  return `You are a world-class fabric matching expert.

IMAGE 1 (left): The QUERY fabric — this is what the customer is looking for.
IMAGE 2 (right): A grid of ${count} CANDIDATE fabrics, numbered 1-${count} (left to right, top to bottom). Each cell has its number overlaid.

Your task: Rank the candidates by overall visual similarity to the query fabric.

Consider these factors in order of importance:
1. COLOR — similar hue, shade, and tone (most important, 50% weight)
2. PATTERN — same type of pattern: solid, stripes, checks, herringbone, etc. (30% weight)
3. TEXTURE — similar surface texture and material appearance (20% weight)

Return ONLY a JSON array of candidate numbers ranked from MOST similar to LEAST.
Include the top 20-30 best matches. Do NOT include candidates that look very different.

Example: [42,15,67,3,88,21,...]

RULES:
- Return ONLY the JSON array — no markdown, no explanation, no commentary
- Numbers are 1-based (top-left = 1, next = 2, ...)
- Focus on COLOR first — a solid blue fabric should match other blues, not greens`;
}

async function fetchAndResizeImage(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await sharp(buf)
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover" })
      .jpeg({ quality: 70 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function createNumberOverlay(num: number): Promise<Buffer> {
  const text = String(num);
  const fontSize = num >= 100 ? 14 : 16;
  const svg = `<svg width="${THUMB_SIZE}" height="${THUMB_SIZE}">
    <rect x="2" y="2" width="24" height="18" rx="3" fill="rgba(0,0,0,0.7)"/>
    <text x="14" y="16" font-size="${fontSize}" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial">${text}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function buildGridImage(thumbs: (Buffer | null)[], count: number): Promise<Buffer> {
  const rows = Math.ceil(count / GRID_COLS);
  const width = GRID_COLS * THUMB_SIZE;
  const height = rows * THUMB_SIZE;

  // 번호 오버레이가 합성된 썸네일 생성
  const composites: { input: Buffer; left: number; top: number }[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const left = col * THUMB_SIZE;
    const top = row * THUMB_SIZE;

    if (thumbs[i]) {
      composites.push({ input: thumbs[i]!, left, top });
    }
    // 번호 오버레이
    const numOverlay = await createNumberOverlay(i + 1);
    composites.push({ input: numOverlay, left, top });
  }

  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .composite(composites)
    .jpeg({ quality: 80 })
    .toBuffer();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queryImageBase64, queryMimeType, candidateUrls, candidateIds } = body as {
      queryImageBase64: string;
      queryMimeType?: string;
      candidateUrls: string[];
      candidateIds: string[];
    };

    if (!queryImageBase64 || !candidateUrls || !candidateIds) {
      return NextResponse.json(
        { error: "필수 파라미터가 없습니다" },
        { status: 400 }
      );
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API 키 미설정" }, { status: 500 });
    }

    const count = Math.min(candidateUrls.length, 100);

    // 1. 후보 이미지들 다운로드 + 리사이즈 (병렬)
    const thumbPromises = candidateUrls.slice(0, count).map((url) => fetchAndResizeImage(url));
    const thumbs = await Promise.all(thumbPromises);

    // 유효한 썸네일이 너무 적으면 fallback
    const validCount = thumbs.filter(Boolean).length;
    if (validCount < 5) {
      return NextResponse.json({
        rankedIds: candidateIds.slice(0, 30),
        fallback: true,
        reason: "too_few_images",
      });
    }

    // 2. 그리드 이미지 합성
    const gridImage = await buildGridImage(thumbs, count);
    const gridBase64 = gridImage.toString("base64");

    // 3. 쿼리 이미지 리사이즈 (토큰 절약)
    const queryBuf = Buffer.from(queryImageBase64, "base64");
    const queryResized = await sharp(queryBuf)
      .resize(400, 400, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toBuffer();
    const queryBase64Resized = queryResized.toString("base64");

    // 4. Gemini API 호출
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: queryMimeType || "image/jpeg",
                data: queryBase64Resized,
              },
            },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: gridBase64,
              },
            },
            { text: buildRankPrompt(count) },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini rank error:", errText.slice(0, 300));
      return NextResponse.json({
        rankedIds: candidateIds.slice(0, 30),
        fallback: true,
        reason: "gemini_error",
      });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return NextResponse.json({
        rankedIds: candidateIds.slice(0, 30),
        fallback: true,
        reason: "empty_response",
      });
    }

    // 5. 파싱
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let ranking: number[];
    try {
      ranking = JSON.parse(cleaned);
    } catch {
      console.error("Gemini rank parse error:", cleaned.slice(0, 200));
      return NextResponse.json({
        rankedIds: candidateIds.slice(0, 30),
        fallback: true,
        reason: "parse_error",
      });
    }

    // 6. 1-based index → fabric ID 매핑
    const rankedIds = ranking
      .filter((idx) => idx >= 1 && idx <= count)
      .map((idx) => candidateIds[idx - 1])
      .filter((id, i, arr) => arr.indexOf(id) === i); // 중복 제거

    return NextResponse.json({
      rankedIds,
      fallback: false,
      usage: data.usageMetadata || {},
    });
  } catch (err) {
    console.error("Rank API error:", err);
    return NextResponse.json(
      { error: "랭킹 서버 오류" },
      { status: 500 }
    );
  }
}
