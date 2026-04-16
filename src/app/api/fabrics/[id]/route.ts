import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("fabrics")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "원단을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // 같은 이름의 다른 컬러웨이 조회
  const { data: variants } = await supabase
    .from("fabrics")
    .select("id, name, color_code, image_url, price_per_yard")
    .eq("name", data.name)
    .neq("id", id)
    .order("color_code", { ascending: true })
    .limit(50);

  const { embedding, ...fabric } = data;
  return NextResponse.json({ ...fabric, colorVariants: variants || [] });
}
