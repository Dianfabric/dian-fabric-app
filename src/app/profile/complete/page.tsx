"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

type ProfileForm = {
  email: string;
  name: string;
  phone: string;
  company_name: string;
  position: string;
  favorite_fabrics: string[];
  favorite_fabrics_other: string;
};

const FAVORITE_FABRIC_OPTIONS = ["소파", "침대헤드", "벽판넬", "커튼", "쿠션", "스툴"];

const emptyForm: ProfileForm = {
  email: "",
  name: "",
  phone: "",
  company_name: "",
  position: "",
  favorite_fabrics: [],
  favorite_fabrics_other: "",
};

function splitFavoriteFabrics(value: string | null | undefined) {
  const items = (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const selected = items.filter((item) => FAVORITE_FABRIC_OPTIONS.includes(item));
  const other = items.filter((item) => !FAVORITE_FABRIC_OPTIONS.includes(item)).join(", ");
  return { selected, other };
}

function joinFavoriteFabrics(selected: string[], other: string) {
  return [...selected, other.trim()].filter(Boolean).join(", ");
}

export default function ProfileCompletePage() {
  const router = useRouter();
  const supabase = createCatalogBrowserClient();
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const favoriteFabricsValue = useMemo(
    () => joinFavoriteFabrics(form.favorite_fabrics, form.favorite_fabrics_other),
    [form.favorite_fabrics, form.favorite_fabrics_other],
  );

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFavoriteFabric(option: string) {
    setForm((prev) => ({
      ...prev,
      favorite_fabrics: prev.favorite_fabrics.includes(option)
        ? prev.favorite_fabrics.filter((item) => item !== option)
        : [...prev.favorite_fabrics, option],
    }));
  }

  async function saveProfile(redirectWhenComplete = false) {
    setSaving(true);
    setError(null);
    setMessage(null);
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      setError("로그인 후 정보를 입력할 수 있습니다. 다시 로그인해주세요.");
      setSaving(false);
      return null;
    }

    const res = await fetch("/api/catalog/customers/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({
        email: form.email,
        name: form.name,
        phone: form.phone,
        company_name: form.company_name,
        position: form.position,
        favorite_fabrics: favoriteFabricsValue,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok) {
      setError(json.error || "정보 저장에 실패했습니다.");
      return null;
    }

    setMessage("정보를 저장했습니다.");
    if (redirectWhenComplete) {
      if (json.customer?.profile_completed) {
        router.push("/fabrics");
        router.refresh();
      } else {
        setError("필수 항목을 모두 입력해주세요: 이메일, 성함, 전화번호, 회사명");
      }
    }
    return json;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await saveProfile(true);
  }

  useEffect(() => {
    let mounted = true;
    async function loadProfile() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const user = data.session?.user;
      if (sessionError || !token || !user) {
        if (mounted) {
          setError("로그인 후 추가 정보를 입력할 수 있습니다.");
          setLoading(false);
        }
        return;
      }

      const res = await fetch("/api/catalog/customers/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!mounted) return;
      if (!res.ok) {
        setError(json.error || "내 정보를 불러오지 못했습니다.");
        setLoading(false);
        return;
      }
      const customer = json.customer;
      const isEditMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("edit") === "1";
      if (customer?.profile_completed && !isEditMode) {
        router.replace("/fabrics");
        router.refresh();
        return;
      }
      const favorite = splitFavoriteFabrics(customer?.favorite_fabrics);
      setForm({
        email: customer?.email || "",
        name: customer?.name || (user.user_metadata?.name as string) || (user.user_metadata?.full_name as string) || (user.user_metadata?.nickname as string) || "",
        phone: customer?.phone || (user.user_metadata?.phone as string) || "",
        company_name: customer?.company_name || "",
        position: customer?.position || "",
        favorite_fabrics: favorite.selected,
        favorite_fabrics_other: favorite.other,
      });
      if (customer?.profile_completed) {
        setMessage("필수 정보가 입력되어 있습니다. 수정 후 저장하거나 원단 컬렉션으로 이동하세요.");
      }
      setLoading(false);
    }
    loadProfile();
    return () => {
      mounted = false;
    };
  }, [router, supabase.auth]);

  return (
    <div className="px-4 py-16">
      <form onSubmit={submit} className="mx-auto max-w-2xl rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold tracking-[.22em] text-[var(--muted)]">PROFILE</p>
        <h1 className="mt-2 text-3xl font-extrabold text-[var(--navy)]">추가 정보 입력</h1>
        <p className="mt-2 text-sm text-[var(--navy2)]">카탈로그 상담과 원단 추천을 위해 필요한 정보를 입력해주세요. <span className="font-semibold">(수정 가능)</span></p>

        {loading ? (
          <p className="mt-8 text-sm text-[var(--navy2)]">불러오는 중…</p>
        ) : (
          <div className="mt-7 space-y-4 text-sm">
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
            <label className="block font-bold text-[var(--navy)]">이메일
              <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required className="mt-1 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]" />
              <span className="mt-1 block text-xs font-medium text-[var(--muted)]">카카오 이메일과 별도로 실제 연락 가능한 이메일을 입력해주세요.</span>
            </label>
            <div className="block font-bold text-[var(--navy)]">
              자주 쓰는 원단 <span className="font-medium text-[var(--muted)]">다중선택</span>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {FAVORITE_FABRIC_OPTIONS.map((option) => {
                  const checked = form.favorite_fabrics.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleFavoriteFabric(option)}
                      className={`rounded-2xl border px-4 py-3 text-sm font-extrabold transition ${checked ? "border-[var(--navy)] bg-[var(--navy)] text-white" : "border-[var(--line)] bg-white text-[var(--navy)]"}`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <input
                value={form.favorite_fabrics_other}
                onChange={(e) => update("favorite_fabrics_other", e.target.value)}
                placeholder="기타 입력"
                className="mt-3 w-full rounded-2xl border border-[var(--line)] px-4 py-3 font-medium outline-none focus:border-[var(--navy)]"
              />
            </div>
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
