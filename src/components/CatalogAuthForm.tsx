"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

type AuthMode = "login" | "signup";

type CatalogFormState = {
  email: string;
  password: string;
  name: string;
  phone: string;
  company_name: string;
  position: string;
  favorite_fabrics: string;
};

const initialForm: CatalogFormState = {
  email: "",
  password: "",
  name: "",
  phone: "",
  company_name: "",
  position: "",
  favorite_fabrics: "",
};

export default function CatalogAuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const supabase = createCatalogBrowserClient();
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CatalogFormState>(key: K, value: CatalogFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function upsertProfile(accessToken: string) {
    const res = await fetch("/api/catalog/customers/upsert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email: form.email,
        name: form.name,
        phone: form.phone,
        company_name: form.company_name,
        position: form.position,
        favorite_fabrics: form.favorite_fabrics,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "고객 정보 저장 실패");
    return json;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const redirectTo = typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback?next=/profile/complete`
      : undefined;

    try {
      const result = mode === "signup"
        ? await supabase.auth.signUp({
            email: form.email,
            password: form.password,
            options: {
              data: {
                name: form.name,
                phone: form.phone,
                company_name: form.company_name,
                position: form.position,
                favorite_fabrics: form.favorite_fabrics,
              },
              emailRedirectTo: redirectTo,
            },
          })
        : await supabase.auth.signInWithPassword({ email: form.email, password: form.password });

      if (result.error) throw result.error;

      if (result.data.session) {
        if (mode === "signup") {
          await upsertProfile(result.data.session.access_token);
        }
        router.push(mode === "signup" ? "/fabrics" : "/profile/complete");
        router.refresh();
        return;
      }

      setMessage("회원가입을 확인했습니다. 이메일 인증 후 로그인해주세요.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "처리 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-xl rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6">
        <p className="text-xs font-bold tracking-[.22em] text-[var(--muted)]">DIAN CATALOG</p>
        <h1 className="mt-2 text-3xl font-extrabold text-[var(--navy)]">{mode === "login" ? "로그인" : "회원가입"}</h1>
        <p className="mt-2 text-sm text-[var(--navy2)]">
          {mode === "login" ? "DIAN 원단 카탈로그 계정으로 로그인합니다." : "카탈로그 이용과 상담을 위한 기본 정보를 입력해주세요."}
        </p>
      </div>

      <div className="space-y-4 text-sm">
        <label className="block font-bold text-[var(--navy)]">
          이메일
          <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
        </label>
        <label className="block font-bold text-[var(--navy)]">
          비밀번호
          <input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} required minLength={6} className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
        </label>

        {mode === "signup" && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold text-[var(--navy)]">
                성함
                <input value={form.name} onChange={(e) => update("name", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
              <label className="block font-bold text-[var(--navy)]">
                전화번호
                <input value={form.phone} onChange={(e) => update("phone", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block font-bold text-[var(--navy)]">
                회사명
                <input value={form.company_name} onChange={(e) => update("company_name", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
              <label className="block font-bold text-[var(--navy)]">
                직책 <span className="font-medium text-[var(--muted)]">선택</span>
                <input value={form.position} onChange={(e) => update("position", e.target.value)} className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              </label>
            </div>
            <label className="block font-bold text-[var(--navy)]">
              자주 쓰는 원단 <span className="font-medium text-[var(--muted)]">선택</span>
              <textarea value={form.favorite_fabrics} onChange={(e) => update("favorite_fabrics", e.target.value)} rows={3} placeholder="예: 부클, 린넨, 소파용 방염 원단" className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
            </label>
          </>
        )}
      </div>

      {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {message && <p className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700">{message}</p>}

      <button disabled={loading} className="mt-6 w-full rounded-2xl bg-[var(--navy)] px-5 py-4 text-sm font-extrabold text-white disabled:opacity-50">
        {loading ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
      </button>

      <p className="mt-5 text-center text-sm text-[var(--navy2)]">
        {mode === "login" ? (
          <>계정이 없나요? <Link href="/signup" className="font-extrabold text-[var(--navy)] underline">회원가입</Link></>
        ) : (
          <>이미 계정이 있나요? <Link href="/login" className="font-extrabold text-[var(--navy)] underline">로그인</Link></>
        )}
      </p>
    </form>
  );
}
