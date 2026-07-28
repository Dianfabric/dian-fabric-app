import type { User } from "@supabase/supabase-js";

export const FALLBACK_CATALOG_ADMIN_EMAILS = ["dhjoara@gmail.com", "dhjoara@naver.com", "dodian@naver.com"];
export const FALLBACK_CATALOG_ADMIN_USER_IDS = [
  "25344439-5a09-416c-ae75-b096e0048c2f",
  "400bb4f0-f3da-4edc-9613-ee436dad97b9",
];

export function parseCatalogAdminList(value: string | undefined | null) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function catalogAdminEmails() {
  return Array.from(new Set([
    ...FALLBACK_CATALOG_ADMIN_EMAILS,
    ...parseCatalogAdminList(process.env.CATALOG_ADMIN_EMAILS),
  ]));
}

export function catalogAdminUserIds() {
  return Array.from(new Set([
    ...FALLBACK_CATALOG_ADMIN_USER_IDS,
    ...parseCatalogAdminList(process.env.CATALOG_ADMIN_USER_IDS),
  ]));
}

export function isCatalogAdminUser(
  user: Pick<User, "id" | "email">,
  allowedEmails = catalogAdminEmails(),
  allowedUserIds = catalogAdminUserIds(),
) {
  const email = user.email?.toLowerCase() || "";
  return allowedUserIds.includes(user.id) || (!!email && allowedEmails.includes(email));
}
