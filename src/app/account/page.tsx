"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

type AccountCustomer = {
  email: string | null;
  name: string | null;
  phone: string | null;
  company_name: string | null;
  position: string | null;
  favorite_fabrics: string | null;
  provider: string | null;
  profile_completed: boolean;
};

export default function AccountPage() {
  const supabase = createCatalogBrowserClient();
  const [customer, setCustomer] = useState<AccountCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        setError("로그인 후 내 정보를 확인할 수 있습니다.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/catalog/customers/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error || "내 정보를 불러오지 못했습니다.");
      setCustomer(json.customer || null);
      setLoading(false);
    });
  }, [supabase.auth]);

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold tracking-[.22em] text-[var(--muted)]">ACCOUNT</p>
        <h1 className="mt-2 text-3xl font-extrabold text-[var(--navy)]">내 정보</h1>
        {loading ? <p className="mt-8 text-sm text-[var(--navy2)]">불러오는 중…</p> : null}
        {error ? <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
        {customer ? (
          <div className="mt-7 space-y-3 text-sm">
            {[
              ["이메일", customer.email || "-"],
              ["성함", customer.name || "-"],
              ["전화번호", customer.phone || "-"],
              ["회사명", customer.company_name || "-"],
              ["직책", customer.position || "-"],
              ["자주 쓰는 원단", customer.favorite_fabrics || "-"],
              ["로그인 방식", customer.provider || "-"],
              ["필수정보", customer.profile_completed ? "완료" : "미완료"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 rounded-2xl bg-[var(--soft)] px-4 py-3">
                <span className="text-[var(--navy2)]">{label}</span>
                <strong className="text-right text-[var(--navy)]">{value}</strong>
              </div>
            ))}
            <Link href="/profile/complete" className="mt-5 inline-flex rounded-2xl bg-[var(--navy)] px-5 py-3 text-sm font-extrabold text-white">
              정보 수정
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
