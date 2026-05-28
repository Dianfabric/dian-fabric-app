import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 검색 v3 API — Soft Scoring + Multi-Scale + LAB
 *
 * Phase 1 개선판:
 * - 캐스케이드 폐기 → 가중치 합산 (Soft Scoring)
 * - DINOv2 글로벌 + DINOv2 크롭 (Multi-Scale)
 * - LAB ΔE 색공간 (사람 눈 기준 색 매칭)
 * - 고확신 시 LLM 스킵
 *
 * POST: { embedding_global, embedding_crop, lab_clusters, matchCount? }
 * 응답: { results: [...], skipped_llm: bool }
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      embedding_global,
      embedding_crop,
      lab_clusters,
      // 사용자 분류 보너스 (Gemini 분석 결과)
      query_patterns,      // string: "부클" 또는 "부클,헤링본"
      query_types,         // string: "패브릭" 또는 "패브릭,면"
      query_colors,        // string: "베이지,아이보리"
      matchCount = 100,
      weight_global,
      weight_crop,
      weight_color,
      bonus_pattern,
      bonus_type,
      bonus_color_name,
    } = body;

    // 검증
    if (!Array.isArray(embedding_global) || embedding_global.length !== 768) {
      return NextResponse.json(
        { error: `embedding_global 768차원 필요 (받음: ${embedding_global?.length})` },
        { status: 400 }
      );
    }
    if (!Array.isArray(embedding_crop) || embedding_crop.length !== 768) {
      return NextResponse.json(
        { error: `embedding_crop 768차원 필요 (받음: ${embedding_crop?.length})` },
        { status: 400 }
      );
    }
    if (!Array.isArray(lab_clusters) || lab_clusters.length !== 15) {
      return NextResponse.json(
        { error: `lab_clusters 15차원 필요 (받음: ${lab_clusters?.length})` },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Soft Scoring RPC 호출 — 색상 최우선 (사용자 피드백 반영)
    const { data, error } = await supabase.rpc("search_fabrics_soft", {
      query_global: `[${embedding_global.join(",")}]`,
      query_crop: `[${embedding_crop.join(",")}]`,
      query_lab: `[${lab_clusters.join(",")}]`,
      query_patterns: query_patterns || null,
      query_types: query_types || null,
      query_colors: query_colors || null,
      weight_global: weight_global ?? 0.20,   // 35 → 20
      weight_crop: weight_crop ?? 0.15,        // 25 → 15
      weight_color: weight_color ?? 0.65,      // 40 → 65 ⭐ 색상 최우선
      bonus_pattern: bonus_pattern ?? 0.08,    // 15 → 8 (보너스 ↓)
      bonus_type: bonus_type ?? 0.03,          // 5 → 3
      bonus_color_name: bonus_color_name ?? 0.10,
      color_scale: 100.0,                       // 200 → 100 (색 거리 더 민감하게)
      match_count: matchCount,
    });

    if (error) {
      console.error("Soft scoring RPC error:", error);
      return NextResponse.json(
        { error: "검색 중 오류: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      results: data || [],
      total: (data || []).length,
      applied_bonuses: {
        patterns: query_patterns || null,
        types: query_types || null,
        colors: query_colors || null,
      },
    });
  } catch (err) {
    console.error("Search v3 API error:", err);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
