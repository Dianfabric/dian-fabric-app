"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

function AuthCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("로그인 인증을 확인하는 중입니다…");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function finishAuth() {
      const supabase = createCatalogBrowserClient();
      const next = params.get("next") || "/profile/complete";
      const code = params.get("code");
      const urlError = params.get("error_description") || params.get("error");

      try {
        if (urlError) throw new Error(urlError);
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        const token = data.session?.access_token;
        if (!token) throw new Error("로그인 세션을 만들지 못했습니다. 다시 로그인해주세요.");

        await fetch("/api/catalog/customers/upsert", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        });

        if (!cancelled) {
          setMessage("로그인 완료. 추가 정보 입력으로 이동합니다…");
          router.replace(next);
          router.refresh();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "인증 처리 실패");
          setMessage("로그인 인증 처리에 문제가 있습니다.");
        }
      }
    }

    finishAuth();
    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-extrabold text-[var(--navy)]">로그인 인증</h1>
        <p className="mt-3 text-sm text-[var(--navy2)]">{message}</p>
        {error && <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700">{error}</p>}
        {error && <Link href="/login" className="mt-5 inline-flex rounded-2xl bg-[var(--navy)] px-5 py-3 text-sm font-extrabold text-white">로그인 다시 하기</Link>}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-[var(--navy2)]">로그인 인증을 확인하는 중입니다…</div>}>
      <AuthCallbackContent />
    </Suspense>
  );
}
