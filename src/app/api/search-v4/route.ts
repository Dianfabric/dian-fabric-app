import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getHiddenFabricIds } from "@/lib/visibility";
import { cosine, toVectorString } from "@/lib/dino-server";
import { signatureSimilarity, type ColorSignature } from "@/lib/color-lab";

/**
 * POST /api/search-v4 — photo similarity search, v4 pipeline.
 *
 *   1. candidates = kNN on emb_v4 (full CLS) ∪ kNN on emb_v4_crop (centre-crop patch mean)   — no colour / pattern hard filter
 *   2. score      = 0.45·cos(full CLS) + 0.35·cos(crop mean) + 0.20·LAB(colour sig, raw)
 *                   + small bonuses when Gemini's pattern / colour-name hints agree (never a filter)
 *   3. mode "colorway" (default): rank individual fabrics.
 *      mode "design": group by fabric name, rank designs by embedding score, pick the colourway by colour.
 *   4. returns top `matchCount` (default 100) → client sends the top 20 to /api/rank-v4 for the Gemini rerank.
 *
 * Weights come from scripts/exp (2026-09-15): golden R@15 80.1 % / synthetic phone-photo R@15 94.3 %.
 *
 * Body: { full:{cls,mean}, crop?:{cls,mean}, color?:{wb,raw}, matchCount?, candidateCount?, mode?,
 *         hints?: { patternDetail?, fabricType?, colorNames?: [{name,pct}] }, weights? (override for experiments) }
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const W = { cls: 0.45, crop: 0.35, color: 0.20 };
const BONUS = { pattern: 0.03, colorName: 0.02 };
const DEFAULT_CANDIDATES = 500;

type Vec = number[];
type Candidate = {
  id: string; name: string; color_code: string | null; supplier: string | null; image_url: string; image_path: string | null;
  fabric_type: string | null; pattern_detail: string | null; notes: string | null;
  color_sig: ColorSignature | null; emb_v4: string | Vec | null; emb_v4_crop: string | Vec | null; similarity: number;
};

const parseVec = (v: string | Vec | null): Vec | null => (v == null ? null : typeof v === "string" ? (JSON.parse(v) as Vec) : v);

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  try {
    const body = await request.json();
    const qCls: Vec | undefined = body.full?.cls;
    const qCrop: Vec | undefined = body.crop?.mean;
    const qColor: ColorSignature | undefined = body.color;
    if (!Array.isArray(qCls) || qCls.length !== 768) return NextResponse.json({ error: "full.cls (768차원) 이 필요합니다" }, { status: 400 });
    const matchCount = Math.min(+body.matchCount || 100, 300);
    const candidateCount = Math.min(+body.candidateCount || DEFAULT_CANDIDATES, 1000);
    const mode: "colorway" | "design" = body.mode === "design" ? "design" : "colorway";
    const hints = body.hints || {};
    const w = { ...W, ...(body.weights || {}) };
    const patternHint: string | undefined = hints.patternDetail || hints.fabricType;
    const colorNames: { name: string; pct: number }[] = Array.isArray(hints.colorNames) ? hints.colorNames : [];

    const supabase = createServiceClient();
    const hidden = await getHiddenFabricIds(supabase);

    // 1. candidate retrieval — union of the two kNN lists
    const calls = [supabase.rpc("search_fabrics_v4", { query_embedding: toVectorString(qCls), which: "cls", match_count: candidateCount })];
    if (qCrop) calls.push(supabase.rpc("search_fabrics_v4", { query_embedding: toVectorString(qCrop), which: "crop", match_count: candidateCount }));
    const lists = await Promise.all(calls);
    const cands = new Map<string, Candidate>();
    for (const { data, error } of lists) {
      if (error) return NextResponse.json({ error: "후보 검색 실패: " + error.message }, { status: 500 });
      for (const r of (data || []) as Candidate[]) if (!hidden.has(r.id) && !cands.has(r.id)) cands.set(r.id, r);
    }

    // 2. soft scoring (every component recomputed from the returned vectors, so both lists score identically)
    const scored = [...cands.values()].map((c) => {
      const full = parseVec(c.emb_v4), crop = parseVec(c.emb_v4_crop);
      const sCls = full ? cosine(qCls, full) : 0;
      const sCrop = qCrop && crop ? cosine(qCrop, crop) : 0;
      const sColor = qColor?.raw && c.color_sig?.raw ? signatureSimilarity(qColor.raw, c.color_sig.raw) : 0;
      let bonus = 0;
      if (patternHint && c.pattern_detail && patternHint.split(",").some((p) => c.pattern_detail!.includes(p.trim()))) bonus += BONUS.pattern;
      if (colorNames.length && c.notes && colorNames.filter((n) => n.pct >= 20).some((n) => c.notes!.includes(n.name))) bonus += BONUS.colorName;
      const embScore = qCrop ? (w.cls * sCls + w.crop * sCrop) / (w.cls + w.crop) : sCls;
      const score = w.cls * sCls + w.crop * sCrop + w.color * sColor + bonus;
      const rest = { ...c }; delete (rest as Partial<Candidate>).emb_v4; delete (rest as Partial<Candidate>).emb_v4_crop;
      return { ...rest, similarity: score, s_cls: sCls, s_crop: sCrop, s_color: sColor, s_emb: embScore, bonus };
    });

    let results;
    if (mode === "design") {
      // design = fabric name; design score = best embedding score in the group; colourway chosen by colour
      const groups = new Map<string, typeof scored>();
      for (const s of scored) { const k = s.name || s.id; if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
      results = [...groups.values()].map((g) => {
        const design = Math.max(...g.map((x) => x.s_emb + x.bonus));
        const best = g.slice().sort((a, b) => (b.s_color - a.s_color) || (b.similarity - a.similarity))[0];
        return { ...best, similarity: design * 0.8 + best.s_color * 0.2, colorways: g.length };
      }).sort((a, b) => b.similarity - a.similarity).slice(0, matchCount);
    } else {
      results = scored.sort((a, b) => b.similarity - a.similarity).slice(0, matchCount);
    }

    return NextResponse.json({ results, total: scored.length, mode, weights: w, ms: Date.now() - t0 });
  } catch (e) {
    console.error("search-v4 error", e);
    return NextResponse.json({ error: "검색 실패: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
