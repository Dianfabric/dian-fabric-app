import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// 서버 사이드용 (API Routes에서 사용)
export function createServiceClient() {
  return createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_KEY || supabaseAnonKey,
    { auth: { persistSession: false } },
  )
}

// catalog.diantex.kr 회원/관리자 전용. 같은 Supabase 안에서도 catalog_* 테이블만 사용한다.
export function createCatalogServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_CATALOG_SUPABASE_URL || supabaseUrl,
    process.env.CATALOG_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || supabaseAnonKey,
    { auth: { persistSession: false } },
  )
}
