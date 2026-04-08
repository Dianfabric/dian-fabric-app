import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 레퍼런스 강화 퀴즈 API
 *
 * GET: 미검증 원단 가져오기 (카테고리/서브타입 필터 지원)
 *   - ?category=패턴  → fabric_type = '패턴' 인 원단
 *   - ?subtype=헤링본  → pattern_detail = '헤링본' 인 원단
 *   - 둘 다 없으면 전체 무작위
 * POST: 사용자의 분류 결과 저장 (manually_verified = true)
 */

// GET: 미검증 원단 20개 (카테고리/서브타입 필터)
export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const subtype = searchParams.get("subtype");

  // 기본 쿼리: 미검증 + 이미지 있는 원단
  let query = supabase
    .from("fabrics")
    .select("id")
    .eq("manually_verified", false)
    .not("embedding", "is", null)
    .not("image_url", "is", null);

  // 카테고리 필터
  if (subtype) {
    // 서브패턴 필터 (e.g. 헤링본, 부클 등)
    query = query.eq("pattern_detail", subtype);
  } else if (category && category !== "전체 (무작위)") {
    // 메인 카테고리 필터
    query = query.eq("fabric_type", category);
  }

  const { data: ids, error: idError } = await query;

  if (idError) {
    return NextResponse.json({ error: idError.message }, { status: 500 });
  }

  if (!ids || ids.length === 0) {
    return NextResponse.json({ fabrics: [], remaining: 0 });
  }

  // 셔플 후 20개 선택
  const shuffled = ids.sort(() => Math.random() - 0.5).slice(0, 20);
  const selectedIds = shuffled.map((r) => r.id);

  const { data: fabrics, error } = await supabase
    .from("fabrics")
    .select("id, name, color_code, image_url, fabric_type, pattern_detail, notes")
    .in("id", selectedIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 응답 셔플 (순서 랜덤)
  const shuffledFabrics = (fabrics || []).sort(() => Math.random() - 0.5);

  return NextResponse.json({
    fabrics: shuffledFabrics,
    remaining: ids.length,
  });
}

// POST: 사용자 분류 결과 저장
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const body = await request.json();
  const { answers } = body;

  // answers: [{ id, fabric_type, pattern_detail, colors }]
  if (!answers || !Array.isArray(answers)) {
    return NextResponse.json({ error: "answers 배열 필요" }, { status: 400 });
  }

  let updated = 0;
  let errors = 0;

  for (const answer of answers) {
    const updateData: Record<string, unknown> = {
      manually_verified: true,
    };

    // 패턴 수정
    if (answer.fabric_type) updateData.fabric_type = answer.fabric_type;
    if (answer.pattern_detail !== undefined) updateData.pattern_detail = answer.pattern_detail;

    // 색상 수정
    if (answer.colors) {
      updateData.notes = Array.isArray(answer.colors)
        ? answer.colors.join(",")
        : answer.colors;
    }

    const { error } = await supabase
      .from("fabrics")
      .update(updateData)
      .eq("id", answer.id);

    if (error) {
      console.error(`Training update error for ${answer.id}:`, error.message);
      errors++;
    } else {
      updated++;
    }
  }

  return NextResponse.json({ updated, errors });
}
