import { NextRequest } from "next/server";
import { createCatalogServiceClient } from "@/lib/supabase";
import { isCatalogAdminUser } from "@/lib/catalog-admin-utils";

export async function requireCatalogAdmin(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: Response.json({ error: "로그인이 필요합니다." }, { status: 401 }) };
  }

  const supabase = createCatalogServiceClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: Response.json({ error: "사용자 확인 실패" }, { status: 401 }) };
  }

  if (!isCatalogAdminUser(data.user)) {
    return { error: Response.json({ error: "관리자 권한이 없습니다." }, { status: 403 }) };
  }

  return { supabase, user: data.user, email: data.user.email?.toLowerCase() || null };
}
