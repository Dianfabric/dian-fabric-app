import type { createServiceClient } from "@/lib/supabase";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * 숨김(비활성) 원단 ID 집합.
 * 테이블 쿼리는 .eq("is_active", true)로 거르지만, RPC(search_fabrics / search_fabrics_dino)는
 * is_active를 반환하지 않으므로 RPC 후보를 후처리로 제외할 때 사용한다.
 * 숨김 원단은 소수라 매 요청 1회 조회해도 가볍다.
 */
export async function getHiddenFabricIds(
  supabase: ServiceClient
): Promise<Set<string>> {
  const { data } = await supabase
    .from("fabrics")
    .select("id")
    .eq("is_active", false);
  return new Set((data || []).map((r) => (r as { id: string }).id));
}
