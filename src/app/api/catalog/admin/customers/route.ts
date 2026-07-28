import { NextRequest } from "next/server";
import { requireCatalogAdmin } from "@/lib/catalog-admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireCatalogAdmin(request);
  if ("error" in auth) return auth.error;

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q")?.trim() || "";
  const provider = searchParams.get("provider")?.trim() || "";
  const completed = searchParams.get("completed")?.trim() || "";
  const page = Math.max(Number(searchParams.get("page") || "1"), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || "50"), 1), 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let select = auth.supabase
    .from("catalog_customers")
    .select("id,auth_user_id,email,kakao_email,name,phone,company_name,position,favorite_fabrics,provider,profile_completed,created_at,updated_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false });

  if (query) {
    const escaped = query.replace(/[%,]/g, "");
    select = select.or(`email.ilike.%${escaped}%,kakao_email.ilike.%${escaped}%,name.ilike.%${escaped}%,phone.ilike.%${escaped}%,company_name.ilike.%${escaped}%`);
  }
  if (provider === "email" || provider === "kakao") {
    select = select.eq("provider", provider);
  }
  if (completed === "true" || completed === "false") {
    select = select.eq("profile_completed", completed === "true");
  }

  const { data, error, count } = await select.range(from, to);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const [{ count: totalCount }, { count: completedCount }, { count: incompleteCount }] = await Promise.all([
    auth.supabase.from("catalog_customers").select("id", { count: "exact", head: true }),
    auth.supabase.from("catalog_customers").select("id", { count: "exact", head: true }).eq("profile_completed", true),
    auth.supabase.from("catalog_customers").select("id", { count: "exact", head: true }).eq("profile_completed", false),
  ]);

  return Response.json({
    customers: data || [],
    count: count || 0,
    page,
    pageSize,
    stats: {
      total: totalCount || 0,
      completed: completedCount || 0,
      incomplete: incompleteCount || 0,
    },
  });
}
