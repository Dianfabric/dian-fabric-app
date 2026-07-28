"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

type ProfileForm = {
  email: string;
  name: string;
  phone: string;
  company_name: string;
  position: string;
  favorite_fabrics: string;
};

const emptyForm: ProfileForm = {
  email: "",
  name: "",
  phone: "",
  company_name: "",
  position: "",
  favorite_fabrics: "",
};

export default function ProfileCompletePage() {
  const router = useRouter();
  const supabase = createCatalogBrowserClient();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveProfile(redirectWhenComplete = false) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setError("로그인 후 정보를 입력할 수 있습니다.");
      setSaving(false);
      return null;
    }

    const res = await fetch("/api/catalog/customers/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(json.error || "정보 저장에 실패했습니다.");
      return null;
    }

    setMessage("정보를 저장했습니다.");
    if (redirectWhenComplete && json.customer?.profile_completed) {
      router.push("/fabrics");
      router.refresh();
    }
    return json;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveProfile(true);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      const user = data.session?.user;
      if (!token || !user) {
        setError("로그인 후 추가 정보를 입력할 수 있습니다.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/catalog/customers/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      const customer = json.customer;
      setForm({
        email: customer?.email || user.email || "",
        name: customer?.name || (user.user_metadata?.name as string) || "",
        phone: customer?.phone || (user.user_metadata?.phone as string) || "",
        company_name: customer?.company_name || "",
        position: customer?.position || "",
        favorite_fabrics: customer?.favorite_fabrics || "",
      });
      if (customer?.profile_completed) {
        setMessage("필수 정보가 입력되어 있습니다. 수정 후 저장하거나 원단 컬렉션으로 이동하세요.");
      }
      setLoading(false);
    });
  }, [supabase.auth]);

  return (
    <div className="px-4 py-16">
      <form onSubmit={submit} className="mx-auto max-w-2xl rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold tracking-[.22em] text-[var(--muted)]">PROFILE</p>
        <h1 className="mt-2 text-3xl font-extrabold text-[var(--navy)]">추가 정보 입력</h1>
        <p className="mt-2 text-sm text-[var(--navy2)]">카탈로그 상담과 원단 추천을 위해 필요한 정보를 입력해주세요.</p>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--navy2)]">불러오는 중…</p>
        ) : (
          <div className="mt-7 space-y-4 text-sm">
            <label className="block font-bold text-[var(--navy)]">이메일
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold text-[var(--navy)]">성함
                <input value={form.name} onChange={(e) => update("name", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
              <label className="block font-bold text-[var(--navy)]">전화번호
                <input value={form.phone} onChange={(e) => update("phone", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold text-[var(--navy)]">회사명
                <input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
              <label className="block font-bold text-[var(--navy)]">직책 <span className="font-medium text-[var(--muted)]">선택</span>
                <input value={form.position} onChange={(e) => update("position", e.target.value)} className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
            </div>
            <label className="block font-bold text-[var(--navy)]">자주 쓰는 원단 <span className="font-medium text-[var(--muted)]">선택</span>
              <textarea value={form.favorite_fabrics} onChange={(e) => update("favorite_fabrics", e.target.value)} rows={4} className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
            </label>
          </div>
        )}

        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
        {message && <p className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</p>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button disabled={loading || saving} className="flex-1 rounded-2xl bg-[var(--navy)] px-5 py-4 text-sm font-extrabold text-white disabled:opacity-50">
            {saving ? "저장 중…" : "저장하고 원단 보기"}
          </button>
          <button type="button" onClick={() => router.push("/fabrics")} className="rounded-2xl border border-[var(--line)] px-5 py-4 text-sm font-extrabold text-[var(--navy)]">
            원단 컬렉션으로
          </button>
        </div>
      </form>
    </div>
  );
}
