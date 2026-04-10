import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Gemini 다중 원단 분석 API
 * 인테리어 사진에서 여러 원단(소파, 벽면, 쿠션 등)을 각각 감지하여
 * 각 원단의 pattern_detail, fabric_type, colors를 배열로 반환
 */

const GEMINI_PROMPT = `You are a world-class interior fabric expert.
Analyze this image and identify ALL DISTINCT fabrics/textiles visible.

For example, in an interior photo you might see:
- A sofa fabric (무지, green)
- Cushion fabric (추상 pattern, green+beige)
- Wall/curtain fabric (무지, different shade)
- Carpet/rug

If this is a close-up of a SINGLE fabric swatch, return just 1 fabric.
If this is an interior/furniture photo, identify each DISTINCT fabric separately (max 4).

For EACH fabric found:

## LOCATION: Where is it? (소파/쿠션/벽면/커튼/카펫/러그/의자/침대/기타)

## BASE TYPE — Choose ONE:
- 무지: Plain/solid, uniform color, no pattern
- 벨벳: Soft plush with sheen and pile
- 스웨이드: Matte, napped/brushed suede-like
- 인조가죽: Smooth/pebbled leather-like
- 자카드: Woven-in pattern with texture variation
- 시어: Sheer, see-through

## PATTERN DETAIL — Choose ONE or null:
- 부클: Curly looped yarn, bumpy 3D texture
- 하운드투스: Broken check with tooth shapes
- 스트라이프: Parallel lines
- 체크: Grid/squares/plaid
- 헤링본: V-shaped zigzag columns
- 추상: Abstract/geometric
- 자연: Nature/landscape/stone
- 동물: Animal print
- 식물: Floral/botanical
- 큰패턴: Large decorative motifs
If plain/solid → null

## COLORS (top 3, sum to 100):
Use ONLY: 아이보리,베이지,브라운,그레이,차콜,블랙,네이비,블루,그린,레드,핑크,옐로우,오렌지,퍼플,민트

## CONFIDENCE (0-100)

Reply ONLY with a JSON array (no markdown):
[{"location":"소파","type":"무지","pattern":null,"colors":[{"color":"그린","pct":80},{"color":"베이지","pct":20}],"confidence":90},{"location":"쿠션","type":"무지","pattern":"추상","colors":[{"color":"그린","pct":60},{"color":"베이지","pct":40}],"confidence":85}]`;

const VALID_PATTERNS = new Set([
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴",
]);
const VALID_TYPES = new Set([
  "무지", "벨벳", "스웨이드", "인조가죽", "자카드", "시어",
]);

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

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

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
          thinkingConfig: { thinkingBudget: 0 },
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
    let parsed = JSON.parse(cleaned);

    // 단일 객체로 올 수도 있으니 배열로 통일
    if (!Array.isArray(parsed)) {
      parsed = [parsed];
    }

    // 검증 + 정리
    const fabrics = parsed.slice(0, 4).map((item: {
      location?: string;
      type?: string;
      pattern?: string;
      colors?: { color: string; pct: number }[];
      confidence?: number;
    }) => {
      const pattern = item.pattern && VALID_PATTERNS.has(item.pattern) ? item.pattern : null;
      const fabricType = pattern ? "패턴" : (VALID_TYPES.has(item.type || "") ? item.type! : "무지");
      const confidence = Math.min(100, Math.max(0, item.confidence || 50));

      return {
        location: item.location || "기타",
        fabric_type: fabricType,
        pattern_detail: pattern,
        colors: item.colors || [],
        confidence,
        raw_type: item.type || "무지",
      };
    });

    return NextResponse.json({ fabrics });
  } catch (err) {
    console.error("Analyze API error:", err);
    return NextResponse.json({ error: "분석 서버 오류" }, { status: 500 });
  }
}
