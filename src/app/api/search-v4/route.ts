import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getHiddenFabricIds } from "@/lib/visibility";
import { toVectorString } from "@/lib/dino-server";
import { signatureSimilarity, photoColorSimilarity, type ColorSignature, type LabCluster } from "@/lib/color-lab";
import { colorByName } from "@/lib/color-names";

/**
 * POST /api/search-v4 — photo similarity search, v4 pipeline.
 *
 *   1. candidates = kNN on emb_v4 (full CLS) ∪ kNN on emb_v4_crop (centre-crop patch mean), both similarities
 *      computed in Postgres (RPC search_fabrics_v4_pair, supabase/v4-search-rpc-v2.sql) — no colour / pattern hard filter
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
const BONUS = { pattern: 0.05, colorName: 0.02 };
// pattern mismatch penalties (user feedback 2026-09-17: a striped photo returned solids at the top)
// kept small: catalogue pattern labels are noisy (e.g. a striped 1720 is labelled "추상"), and a full-DB test with
// the query's own label as a perfect hint showed that larger penalties cost golden-set recall (64 % → 56 %)
const PENALTY = { solidForPatterned: 0.08, patternMismatch: 0.03 };
const DEFAULT_CANDIDATES = 500;
/**
 * Colour policy (user requirement 2026-09-17: "colour must match"). "strict" (default) raises the colour weight and
 * demotes every candidate whose LAB colour similarity is below `gateMin` by `gatePenalty` — a demotion, not a filter,
 * so a badly lit phone photo still gets results. "normal" keeps the experiment weights. Override per request with
 * body.colorMode, or globally with SEARCH_V4_COLOR_MODE.
 */
// Measured on the full DB (scripts/exp/results-db-colour.md): colour 40 % gives the best golden-set scores
// (R@15 57.1 %, R@1 40 %, MRR 0.513 vs 52.4 / 30.7 / 0.432 at 20 %) at the cost of some recall on colour-cast
// phone photos (synthetic R@15 80 % vs 88 %). Hard gates scored worse on both sets, so the gate is off by default.
const COLOR_POLICY = {
  strict: { weights: { cls: 0.32, crop: 0.23, color: 0.45 }, gateMin: 0, gatePenalty: 0.30, softPenalty: 0.10 },
  normal: { weights: W, gateMin: 0, gatePenalty: 0, softPenalty: 0 },
} as const;

type Vec = number[];
type Candidate = {
  id: string; name: string; color_code: string | null; supplier: string | null; image_url: string; image_path: string | null;
  fabric_type: string | null; pattern_detail: string | null; notes: string | null;
  color_sig: ColorSignature | null; s_cls: number; s_crop: number;
};

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
    const colorMode: keyof typeof COLOR_POLICY = body.colorMode === "normal" || (process.env.SEARCH_V4_COLOR_MODE === "normal" && !body.colorMode) ? "normal" : "strict";
    const policy = COLOR_POLICY[colorMode];
    const w = { ...policy.weights, ...(body.weights || {}) };
    const patternHint: string | undefined = hints.patternDetail || hints.fabricType;
    const colorNames: { name: string; pct: number }[] = Array.isArray(hints.colorNames) ? hints.colorNames : [];
    // colour chosen by the user in the UI (2026-09-17): trusted over the photo's own colour, and used as a
    // candidate channel (rows whose notes carry that colour name, ranked by texture) — see supabase/v4-color-channel.sql
    const userColor = colorByName(typeof hints.userColor === "string" ? hints.userColor : null);

    const supabase = createServiceClient();
    const hiddenP = getHiddenFabricIds(supabase);
    // Zoom invariance: besides the query itself, search with its 2x2 / 3x3 mosaic embeddings (see dino-server "scales")
    // and keep, per candidate, the best similarity over the scales. Phone close-ups magnify the weave 2-3x compared
    // with the catalogue photo; without this a 30 % close-up of FIZE-11 scores 0.40 against its own catalogue row.
    const scales: { scale: number; full: { cls: Vec }; crop: { mean: Vec } }[] = Array.isArray(body.scales) ? body.scales : [];
    const queries = [{ cls: qCls, crop: qCrop }, ...scales.filter((s) => Array.isArray(s.full?.cls)).map((s) => ({ cls: s.full.cls, crop: s.crop?.mean }))];
    const callRpc = async (q: { cls: Vec; crop?: Vec }) => {
      const args = { q_cls: toVectorString(q.cls), q_crop: q.crop ? toVectorString(q.crop) : null, match_count: candidateCount };
      // a cold page cache can make the first scan exceed the statement timeout; the retry runs warm
      let r = await supabase.rpc("search_fabrics_v4_pair", args);
      if (r.error && /timeout/i.test(r.error.message)) r = await supabase.rpc("search_fabrics_v4_pair", args);
      return r;
    };
    const callColorRpc = async (q: { cls: Vec; crop?: Vec }) => {
      const args = { q_cls: toVectorString(q.cls), q_crop: q.crop ? toVectorString(q.crop) : null, color_like: userColor!.name, match_count: candidateCount };
      let r = await supabase.rpc("search_fabrics_v4_color", args);
      if (r.error && /timeout/i.test(r.error.message)) r = await supabase.rpc("search_fabrics_v4_color", args);
      if (r.error) console.warn("colour channel unavailable:", r.error.message); // e.g. SQL not applied yet — degrade gracefully
      return r;
    };
    const lists = await Promise.all([...queries.map(callRpc), ...(userColor ? queries.map(callColorRpc) : [])]);
    const hidden = await hiddenP;
    const firstError = lists.find((r) => r.error)?.error;
    if (lists.every((r) => r.error)) return NextResponse.json({ error: "후보 검색 실패: " + firstError!.message }, { status: 500 });
    const merged = new Map<string, Candidate>();
    for (const r of lists) for (const c of (r.data || []) as Candidate[]) {
      if (hidden.has(c.id)) continue;
      const prev = merged.get(c.id);
      if (!prev) merged.set(c.id, { ...c }); else { prev.s_cls = Math.max(prev.s_cls ?? 0, c.s_cls ?? 0); prev.s_crop = Math.max(prev.s_crop ?? 0, c.s_crop ?? 0); }
    }
    const cands = [...merged.values()];

    // 2. soft scoring
    const scored = cands.map((c) => {
      const sCls = c.s_cls ?? 0, sCrop = qCrop ? c.s_crop ?? 0 : 0;
      // colour: user-chosen colour beats the photo (camera casts); otherwise chroma-adaptive photo comparison
      let sColor: number;
      if (userColor) {
        const nameMatch = !!c.notes && c.notes.includes(userColor.name);
        const ref: LabCluster[] = [{ lab: userColor.lab, pct: 100 }];
        const labToRef = c.color_sig?.raw ? signatureSimilarity(ref, c.color_sig.raw, 30) : 0;
        sColor = Math.min(1, 0.6 * (nameMatch ? 1 : 0) + 0.4 * labToRef);
      } else {
        sColor = qColor ? photoColorSimilarity(qColor, c.color_sig) : 0;
      }
      let bonus = 0;
      if (patternHint && c.pattern_detail) {
        // pattern hint from Gemini (e.g. "스트라이프,기하학"): reward a match, penalise a clear mismatch — a solid
        // ("무지") catalogue row for a patterned query is the worst case and is pushed down hardest
        const parts = patternHint.split(",").map((p) => p.trim()).filter(Boolean);
        const matches = parts.some((p) => c.pattern_detail!.includes(p));
        const querySolid = parts.length === 1 && parts[0] === "무지";
        const candSolid = c.pattern_detail.trim() === "무지";
        if (matches) bonus += BONUS.pattern;
        else if (!querySolid && candSolid) bonus -= PENALTY.solidForPatterned;
        else if (querySolid !== candSolid || !matches) bonus -= PENALTY.patternMismatch;
      }
      if (colorNames.length && c.notes && colorNames.filter((n) => n.pct >= 20).some((n) => c.notes!.includes(n.name))) bonus += BONUS.colorName;
      const embScore = qCrop ? (w.cls * sCls + w.crop * sCrop) / (w.cls + w.crop) : sCls;
      // colour gate: candidates whose colour is clearly different are pushed below every colour-consistent one
      const gated = qColor?.raw && policy.gateMin > 0 && sColor < policy.gateMin;
      // graded (continuous) colour penalty: nothing above 0.5, up to -softPenalty at 0 — no hard threshold
      const soft = qColor?.raw ? policy.softPenalty * Math.max(0, 0.5 - sColor) / 0.5 : 0;
      const score = w.cls * sCls + w.crop * sCrop + w.color * sColor + bonus - (gated ? policy.gatePenalty : 0) - soft;
      return { ...c, similarity: score, s_cls: sCls, s_crop: sCrop, s_color: sColor, s_emb: embScore, bonus, color_gated: !!gated };
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

    return NextResponse.json({ results, total: scored.length, mode, colorMode, userColor: userColor?.name ?? null, weights: w, gated: scored.filter((s) => s.color_gated).length, ms: Date.now() - t0 });
  } catch (e) {
    console.error("search-v4 error", e);
    return NextResponse.json({ error: "검색 실패: " + (e instanceof Error ? e.message : String(e)) }, { status: 500 });
  }
}
