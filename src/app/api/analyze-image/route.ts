import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Gemini 다중 원단 분석 API
 * 인테리어 사진에서 여러 원단(소파, 벽면, 쿠션 등)을 각각 감지하여
 * 각 원단의 pattern_detail, fabric_type, colors를 배열로 반환
 */

const GEMINI_PROMPT = `You are a world-class interior fabric expert for a B2B fabric distributor.
Analyze this image and identify ALL DISTINCT fabrics/textiles visible.

If this is a close-up of a SINGLE fabric swatch, return just 1 fabric.
If this is an interior/furniture photo, identify each DISTINCT fabric separately (max 4).

For EACH fabric found, classify TWO things independently:

## LOCATION: Where is it? (소파/쿠션/벽면/커튼/카펫/러그/의자/침대/기타)

## FABRIC TYPE (원단 종류) — Choose ONE:
- 패브릭: DEFAULT. Regular woven/knit textile with visible thread/yarn/weave.
- 벨벳: Soft plush surface (shiny OR matte). Includes suede-like velvet.
- 인조가죽: ⚠️ COMMONLY MISSED! No visible thread/weave, smooth/rubbery/waxy/plastic surface, visible pores or leather grain. No thread visible → 인조가죽 NOT 패브릭.
- 시어: Transparent/semi-transparent lightweight fabric.

## PATTERN (패턴 상세) — Choose ONE or TWO as array, or ["무지"]:
- 무지: NO pattern. Single uniform color. Most common.
- 부클: ONLY clearly visible curly looped yarn with bumpy 3D texture.
- 하운드투스: Jagged check with pointed tooth shapes.
- 스트라이프: Clear parallel lines.
- 체크: ONLY clearly visible crossing lines with contrasting colors. Subtle woven grid is NOT check → 무지.
- 헤링본: V-shaped zigzag columns.
- 추상: Abstract/irregular artistic design, OR non-woven random textures (fur-like, brushstrokes, marbled). NOT geometric → use 기하학.
- 기하학: Regular repeating geometric shapes — circles, triangles, hexagons, diamonds, lattice, grid, trellis, tessellations.
- 자연: Landscape, water, stone patterns.
- 동물: ONLY actual animal prints (leopard, zebra, snake). Abstract organic textures → 추상.
- 식물: Flowers, leaves, botanical.
- 큰패턴: Large-scale decorative motifs.
- 다마스크: Symmetrical floral/scroll ornamental woven pattern.

## COLORS (top 3, sum to 100):
Use ONLY: 아이보리,베이지,브라운,그레이,차콜,블랙,네이비,블루,그린,레드,핑크,옐로우,오렌지,퍼플,민트

## CONFIDENCE (0-100)

Reply ONLY with a JSON array (no markdown):
[{"location":"소파","type":"패브릭","pattern":["무지"],"colors":[{"color":"그린","pct":80},{"color":"베이지","pct":20}],"confidence":90}]`;

const VALID_PATTERNS = new Set([
  "무지", "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "기하학", "자연", "동물", "식물", "큰패턴", "다마스크",
]);
const VALID_TYPES = new Set([
  "패브릭", "벨벳", "인조가죽", "시어",
]);
const TYPE_REMAP: Record<string, string> = { "스웨이드": "벨벳", "무지": "패브릭", "자카드": "패브릭", "린넨": "패브릭", "커튼": "패브릭" };

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json({ error: "이미지가 필요합니다" }, { status: 400 });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "Gemini API 키 미설정" }, { status: 500 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const mimeType = file.type || "image/jpeg";

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: GEMINI_PROMPT },
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
      console.error("Gemini API error:", errText.slice(0, 200));
      return NextResponse.json({ error: "Gemini 분석 실패" }, { status: 500 });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Gemini 응답 없음" }, { status: 500 });
    }

    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // JSON 파싱 실패 시 JSON 부분만 추출 시도
      const jsonMatch = cleaned.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("Gemini JSON parse failed:", cleaned.slice(0, 200));
        return NextResponse.json({ error: "Gemini 응답 파싱 실패" }, { status: 500 });
      }
      parsed = JSON.parse(jsonMatch[0]);
    }

    // 단일 객체로 올 수도 있으니 배열로 통일
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    // 검증 + 정리
    const fabrics = parsed.slice(0, 4).map((item: {
      location?: string;
      type?: string;
      pattern?: string | string[];
      colors?: { color: string; pct: number }[];
      confidence?: number;
    }) => {
      // 패턴 배열 처리
      let patterns: string[] = [];
      if (Array.isArray(item.pattern)) {
        patterns = item.pattern.filter(p => VALID_PATTERNS.has(p));
      } else if (item.pattern && VALID_PATTERNS.has(item.pattern)) {
        patterns = [item.pattern];
      }
      if (patterns.length === 0) patterns = ["무지"];

      const isPlain = patterns.length === 1 && patterns[0] === "무지";
      if (!isPlain) patterns = patterns.filter(p => p !== "무지");
      const patternDetail = patterns.join(","); // 무지도 "무지"로 전달

      // 타입 리맵 (스웨이드→벨벳 등)
      let rawType = item.type || "패브릭";
      rawType = TYPE_REMAP[rawType] || rawType;
      const fabricType = VALID_TYPES.has(rawType) ? rawType : "패브릭";

      const confidence = Math.min(100, Math.max(0, item.confidence || 50));

      return {
        location: item.location || "기타",
        fabric_type: fabricType,
        pattern_detail: patternDetail,
        colors: item.colors || [],
        confidence,
        raw_type: rawType,
      };
    });

    return NextResponse.json({ fabrics });
  } catch (err) {
    console.error("Analyze API error:", err);
    return NextResponse.json({ error: "분석 서버 오류" }, { status: 500 });
  }
}
