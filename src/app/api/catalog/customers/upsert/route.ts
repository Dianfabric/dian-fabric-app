import { NextRequest } from "next/server";
import { buildCatalogCustomerPayload, cleanText, mergeCatalogCustomerPayload, missingRequiredCatalogProfileFields } from "@/lib/catalog-profile";
import { createCatalogServiceClient } from "@/lib/supabase";

type CatalogProfileBody = {
  email?: string;
  kakao_email?: string;
  name?: string;
  phone?: string;
  company_name?: string;
  position?: string;
  favorite_fabrics?: string;
};

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const supabase = createCatalogServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return Response.json({ error: "사용자 확인 실패" }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as CatalogProfileBody;
    const incomingPayload = buildCatalogCustomerPayload(body, userData.user);

    const { data: existingCustomer, error: existingError } = await supabase
      .from("catalog_customers")
      .select("email,kakao_email,name,phone,company_name,position,favorite_fabrics,provider,profile_completed")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingCustomer?.email && !cleanText(body.email)) {
      incomingPayload.email = null;
    }

    const payload = mergeCatalogCustomerPayload(incomingPayload, existingCustomer);
    const missing = missingRequiredCatalogProfileFields(payload);

    const { data, error } = await supabase
      .from("catalog_customers")
      .upsert(payload, { onConflict: "auth_user_id" })
      .select("id,auth_user_id,email,kakao_email,name,phone,company_name,position,favorite_fabrics,provider,profile_completed,created_at,updated_at")
      .single();

    if (error) throw error;

    return Response.json({ customer: data, missing });
  } catch (error) {
    console.error("catalog customer upsert error", error);
    return Response.json({ error: "고객 정보 저장 실패" }, { status: 500 });
  }
}
