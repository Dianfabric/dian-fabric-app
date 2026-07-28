export type CatalogProvider = "email" | "kakao";

export type CatalogProfileInput = {
  email?: unknown;
  name?: unknown;
  phone?: unknown;
  company_name?: unknown;
  position?: unknown;
  favorite_fabrics?: unknown;
  kakao_email?: unknown;
};

type AuthUserLike = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type CatalogCustomerPayload = {
  auth_user_id: string;
  email: string | null;
  kakao_email: string | null;
  name: string | null;
  phone: string | null;
  company_name: string | null;
  position: string | null;
  favorite_fabrics: string | null;
  provider: CatalogProvider;
  profile_completed: boolean;
};

export const REQUIRED_CATALOG_PROFILE_FIELDS = ["email", "name", "phone", "company_name"] as const;

export function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function providerFromUser(user: AuthUserLike): CatalogProvider {
  const providers = user.app_metadata?.providers;
  const provider = Array.isArray(providers) ? providers[0] : user.app_metadata?.provider;
  return provider === "kakao" ? "kakao" : "email";
}

export function missingRequiredCatalogProfileFields(payload: Partial<CatalogCustomerPayload>) {
  return REQUIRED_CATALOG_PROFILE_FIELDS.filter((field) => !cleanText(payload[field]));
}

export function mergeCatalogCustomerPayload(
  incoming: CatalogCustomerPayload,
  existing?: Partial<CatalogCustomerPayload> | null,
): CatalogCustomerPayload {
  const merged: CatalogCustomerPayload = {
    ...incoming,
    email: incoming.email || cleanText(existing?.email) || null,
    kakao_email: incoming.kakao_email || cleanText(existing?.kakao_email) || null,
    name: incoming.name || cleanText(existing?.name) || null,
    phone: incoming.phone || cleanText(existing?.phone) || null,
    company_name: incoming.company_name || cleanText(existing?.company_name) || null,
    position: incoming.position || cleanText(existing?.position) || null,
    favorite_fabrics: incoming.favorite_fabrics || cleanText(existing?.favorite_fabrics) || null,
    provider: incoming.provider || existing?.provider || "email",
  };
  merged.profile_completed = missingRequiredCatalogProfileFields(merged).length === 0;
  return merged;
}

export function buildCatalogCustomerPayload(input: CatalogProfileInput, user: AuthUserLike): CatalogCustomerPayload {
  const metadata = user.user_metadata || {};
  const provider = providerFromUser(user);
  const providerEmail = cleanText(user.email) || cleanText(metadata.email);
  const email = cleanText(input.email) || providerEmail;
  const name = cleanText(input.name) || cleanText(metadata.name) || cleanText(metadata.full_name) || cleanText(metadata.nickname) || cleanText(metadata.user_name);
  const phone = cleanText(input.phone) || cleanText(metadata.phone);
  const companyName = cleanText(input.company_name);
  const position = cleanText(input.position);
  const favoriteFabrics = cleanText(input.favorite_fabrics);

  const payload: CatalogCustomerPayload = {
    auth_user_id: user.id,
    email,
    kakao_email: provider === "kakao" ? cleanText(input.kakao_email) || providerEmail : null,
    name,
    phone,
    company_name: companyName,
    position,
    favorite_fabrics: favoriteFabrics,
    provider,
    profile_completed: false,
  };
  payload.profile_completed = missingRequiredCatalogProfileFields(payload).length === 0;
  return payload;
}
