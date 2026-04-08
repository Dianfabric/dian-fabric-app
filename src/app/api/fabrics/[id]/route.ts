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

  const { embedding, ...fabric } = data;
  return NextResponse.json(fabric);
}
