"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

type CatalogAdminCustomer = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  company_name: string | null;
  position: string | null;
  favorite_fabrics: string | null;
  provider: "email" | "kakao" | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  customers?: CatalogAdminCustomer[];
  count?: number;
  stats?: { total: number; completed: number; incomplete: number };
  error?: string;
};

const providerLabels: Record<string, string> = {
  all: "전체",
  email: "이메일",
  kakao: "카카오",
};

const completionLabels: Record<string, string> = {
  all: "전체",
  true: "완료",
  false: "미완료",
};

export default function CatalogAdminCustomersPage() {
  const supabase = createCatalogBrowserClient();
  const [customers, setCustomers] = useState<CatalogAdminCustomer[]>([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, incomplete: 0 });
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [completed, setCompleted] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const search = new URLSearchParams({ pageSize: "100" });
    if (query.trim()) search.set("q", query.trim());
    if (provider !== "all") search.set("provider", provider);
    if (completed !== "all") search.set("completed", completed);
    return search;
  }, [query, provider, completed]);

  useEffect(() => {
    let mounted = true;
    async function loadCustomers() {
      setLoading(true);
      setError(null);
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (mounted) {
          setError("관리자 로그인이 필요합니다.");
          setLoading(false);
        }
        return;
      }

      const res = await fetch(`/api/catalog/admin/customers?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!mounted) return;
      if (!res.ok) {
        setError(json.error || "고객 목록을 불러오지 못했습니다.");
        setCustomers([]);
      } else {
        setCustomers(json.customers || []);
        setStats(json.stats || { total: 0, completed: 0, incomplete: 0 });
      }
      setLoading(false);
    }
    loadCustomers();
    return () => {
      mounted = false;
    };
  }, [params, supabase.auth]);

  return (
    <div className="px-4 py-12">
      <div className="mx-auto max-w-[1320px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[.22em] text-[var(--muted)]">CATALOG ADMIN</p>
            <h1 className="mt-2 text-3xl font-extrabold text-[var(--navy)]">회원 관리</h1>
            <p className="mt-2 text-sm text-[var(--navy2)]">catalog_customers 전용 관리자입니다. swatch 고객 DB와 분리됩니다.</p>
          </div>
          <Link href="/fabrics" className="rounded-2xl border border-[var(--line)] bg-white px-5 py-3 text-sm font-bold text-[var(--navy)]">
            원단 컬렉션으로
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            ["전체 회원", stats.total],
            ["필수정보 완료", stats.completed],
            ["필수정보 미완료", stats.incomplete],
          ].map(([label, value]) => (
            <div key={label} className="rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm">
              <p className="text-xs font-bold tracking-[.18em] text-[var(--muted)]">{label}</p>
              <strong className="mt-2 block text-3xl text-[var(--navy)]">{value}</strong>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 rounded-3xl border border-[var(--line)] bg-white p-4 shadow-sm sm:grid-cols-[1fr_160px_160px]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이메일, 성함, 전화번호, 회사명 검색"
            className="rounded-2xl border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--navy)]"
          />
          <select value={provider} onChange={(event) => setProvider(event.target.value)} className="rounded-2xl border border-[var(--line)] px-4 py-3 text-sm">
            {Object.entries(providerLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={completed} onChange={(event) => setCompleted(event.target.value)} className="rounded-2xl border border-[var(--line)] px-4 py-3 text-sm">
            {Object.entries(completionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {error ? (
          <div className="mt-6 rounded-3xl border border-red-100 bg-red-50 p-5 text-sm font-semibold text-red-700">
            {error} <Link href="/login" className="underline">로그인하러 가기</Link>
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-3xl border border-[var(--line)] bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--soft)] text-xs uppercase tracking-[.12em] text-[var(--muted)]">
                <tr>
                  {['가입일', '이메일', '성함', '전화번호', '회사/직책', '자주 쓰는 원단', '방식', '상태'].map((heading) => (
                    <th key={heading} className="px-4 py-3 whitespace-nowrap">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--navy2)]">불러오는 중…</td></tr>
                ) : null}
                {!loading && customers.length === 0 && !error ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[var(--navy2)]">회원이 없습니다.</td></tr>
                ) : null}
                {customers.map((customer) => (
                  <tr key={customer.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-4 text-[var(--navy2)]">{new Date(customer.created_at).toLocaleDateString('ko-KR')}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-[var(--navy)]">{customer.email || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-4">{customer.name || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-4">{customer.phone || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-4">{customer.company_name || '-'}{customer.position ? ` / ${customer.position}` : ''}</td>
                    <td className="min-w-[180px] px-4 py-4">{customer.favorite_fabrics || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-4">{customer.provider === 'kakao' ? '카카오' : '이메일'}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${customer.profile_completed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        {customer.profile_completed ? '완료' : '미완료'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
