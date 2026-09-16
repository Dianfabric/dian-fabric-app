import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/**
 * POST /api/rank-v4 — final rerank of the top-N candidates with ONE Gemini Flash call.
 *
 * No grid compositing: the query and every candidate go in as individual 384px images
 * (query at 512px), so the model sees real texture instead of 100px thumbnails.
 *
 * Body: { queryImageBase64, mimeType?, candidates: [{id, image_url}], topN? (default 20) }
 * Returns: { ranked: [{id, score, reason}], model, ms } — ids missing from the model answer keep their input order at the end.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.GEMINI_RERANK_MODEL || "gemini-2.5-flash";
const CAND_SIZE = 384, QUERY_SIZE = 512, DEFAULT_TOP = 20;

const prompt = (n: number) => `당신은 원단 전문가입니다. 이미지 1은 고객이 찍은 원단 사진(쿼리)이고, 이미지 2~${n + 1}은 카탈로그 후보 원단 ${n}개입니다(후보 번호 1~${n}).

쿼리 사진은 조명·각도·확대 배율이 카탈로그와 다를 수 있으니, 조명 색 편향과 원근 왜곡은 무시하고 다음 순서로 판단하세요:
1. 직조/질감 (조직, 표면 결, 광택, 패턴의 종류와 상대적 크기)
2. 색상 (조명 보정 후 원단 본연의 색, 톤)
3. 패턴 배치

후보 ${n}개 전부를 쿼리와 비슷한 순서로 정렬하고 0~100 점수를 주세요 (100=같은 원단, 70+=같은 디자인의 다른 컬러일 가능성, 0=전혀 다름).
마크다운 없이 순수 JSON 배열만 응답: [{"idx":후보번호,"score":정수,"reason":"짧은 근거"},...]`;

async function fetchResized(url: string, size: number): Promise<Buffer | null> {
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(url, { signal: ctrl.signal }); clearTimeout(t);
    if (!res.ok) return null;
    return await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize(size, size, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
  } catch { return null; }
}

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY 미설정" }, { status: 500 });
    const { queryImageBase64, candidates, topN } = await request.json() as { queryImageBase64: string; candidates: { id: string; image_url: string }[]; topN?: number };
    if (!queryImageBase64 || !candidates?.length) return NextResponse.json({ error: "queryImageBase64와 candidates 필수" }, { status: 400 });

    const top = candidates.slice(0, Math.min(topN || DEFAULT_TOP, 30));
    const queryBuf = await sharp(Buffer.from(queryImageBase64.replace(/^data:image\/\w+;base64,/, ""), "base64")).rotate().resize(QUERY_SIZE, QUERY_SIZE, { fit: "inside" }).jpeg({ quality: 85 }).toBuffer();
    const bufs = await Promise.all(top.map((c) => fetchResized(c.image_url, CAND_SIZE)));
    const valid = top.map((c, i) => ({ c, b: bufs[i] })).filter((x) => x.b) as { c: { id: string; image_url: string }; b: Buffer }[];
    if (!valid.length) return NextResponse.json({ ranked: top.map((c) => ({ id: c.id, score: 0, reason: "이미지 로드 실패" })), model: MODEL, ms: Date.now() - t0 });

    const parts: Record<string, unknown>[] = [{ text: "이미지 1 (쿼리):" }, { inline_data: { mime_type: "image/jpeg", data: queryBuf.toString("base64") } }];
    valid.forEach((v, i) => { parts.push({ text: `이미지 ${i + 2} (후보 ${i + 1}):` }); parts.push({ inline_data: { mime_type: "image/jpeg", data: v.b.toString("base64") } }); });
    parts.push({ text: prompt(valid.length) });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      // thinkingBudget 0: Gemini 2.5 Flash's default reasoning tokens count against maxOutputTokens and truncated the JSON
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } }),
    });
    if (!res.ok) { const err = await res.text(); console.error("gemini rerank error", res.status, err.slice(0, 300)); return NextResponse.json({ error: `Gemini ${res.status}` }, { status: 502 }); }
    const data = await res.json();
    const cand = data?.candidates?.[0];
    const text: string = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("").trim() || "[]";
    let parsed: { idx: number; score: number; reason?: string }[] = [];
    try { const j = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "")); parsed = Array.isArray(j) ? j : Array.isArray(j?.rankings) ? j.rankings : Array.isArray(j?.results) ? j.results : []; } catch { parsed = []; }
    if (!parsed.length) console.warn("rank-v4: unparsable Gemini answer", { finishReason: cand?.finishReason, head: text.slice(0, 200) });

    const seen = new Set<string>();
    const ranked: { id: string; score: number; reason: string }[] = [];
    for (const p of parsed.sort((a, b) => b.score - a.score)) {
      const v = valid[p.idx - 1]; if (!v || seen.has(v.c.id)) continue;
      seen.add(v.c.id); ranked.push({ id: v.c.id, score: Math.max(0, Math.min(100, Math.round(p.score))), reason: p.reason || "" });
    }
    for (const c of top) if (!seen.has(c.id)) ranked.push({ id: c.id, score: 0, reason: "" });
    return NextResponse.json({ ranked, model: MODEL, ms: Date.now() - t0 });
  } catch (e) {
    console.error("rank-v4 error", e);
    return NextResponse.json({ error: "재랭킹 실패: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
