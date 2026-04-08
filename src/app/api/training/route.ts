import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 레퍼런스 강화 퀴즈 API
 *
 * GET: 아직 검증 안 된 원단 중 무작위 20개 가져오기
 * POST: 사용자의 분류 결과 저장 (manually_verified = true)
 */

// GET: 무작위 미검증 원단 20개
export async function GET() {
  const supabase = createServiceClient();

  // 미검증 + 임베딩 있는 원단 중 무작위 20개
  // Supabase에서 랜덤 정렬은 없으므로, 전체 ID를 가져와서 셔플
  const { data: ids, error: idError } = await supabase
    .from("fabrics")
    .select("id")
    .eq("manually_verified", false)
    .not("embedding", "is", null)
    .not("image_url", "is", null);

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
