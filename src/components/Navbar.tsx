"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createCatalogBrowserClient();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const isFabrics = pathname === "/" || pathname === "/fabrics" || pathname.startsWith("/fabric/");
  const isInquiryCart = pathname === "/inquiry-cart";
  const isAccount = pathname === "/account" || pathname === "/login" || pathname === "/signup" || pathname.startsWith("/profile/");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    return () => listener.subscription.unsubscribe();
  }, [supabase.auth]);

  async function signOut() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="sticky top-0 z-50 border-b"
      style={{
        background: "rgba(255,255,255,.94)",
        backdropFilter: "blur(8px)",
        borderColor: "var(--line)",
      }}
    >
      <div className="max-w-[1320px] mx-auto h-[64px] sm:h-[70px] px-4 sm:px-8 flex items-center justify-between gap-3">
        <Link
          href="/"
          prefetch={false}
          aria-label="dian"
          className="flex items-end gap-[7px] shrink-0"
          onClick={(e) => {
            e.preventDefault();
            try {
              sessionStorage.removeItem("dian-fabrics-state");
              sessionStorage.removeItem("dian-fabrics-scrollY");
            } catch {}
            window.location.href = "/fabrics";
          }}
        >
          <span
            className="leading-none text-[26px] sm:text-[30px] lowercase"
            style={{ fontFamily: "'Jost', sans-serif", fontWeight: 700, letterSpacing: "-.01em", color: "#16181d" }}
          >
            dian
          </span>
          <svg
            viewBox="0 0 46 40"
            className="h-[19px] sm:h-[22px] w-auto mb-[3px]"
            aria-hidden="true"
            fill="#16181d"
          >
            <rect x="2" y="29" width="42" height="7" rx="3.5" />
            <circle cx="38" cy="12" r="5.4" />
          </svg>
        </Link>

        <nav className="flex gap-[14px] sm:gap-[26px] text-[13px] sm:text-[14px] tracking-[.02em]" style={{ color: "var(--navy2)" }}>
          <Link
            href="/fabrics"
            prefetch={false}
            className={`py-2 relative hover:text-[var(--navy)] transition-colors ${
              isFabrics ? "font-semibold text-[var(--navy)]" : ""
            }`}
          >
            원단 컬렉션
            {isFabrics && (
              <span
                className="absolute left-0 right-0 -bottom-px h-[2px]"
                style={{ background: "var(--navy)" }}
              />
            )}
          </Link>
          {isLoggedIn ? (
            <Link
              href="/inquiry-cart"
              prefetch={false}
              className={`py-2 relative hover:text-[var(--navy)] transition-colors ${
                isInquiryCart ? "font-semibold text-[var(--navy)]" : ""
              }`}
            >
              문의바구니
              {isInquiryCart && (
                <span
                  className="absolute left-0 right-0 -bottom-px h-[2px]"
                  style={{ background: "var(--navy)" }}
                />
              )}
            </Link>
          ) : null}
          <Link
            href={isLoggedIn ? "/account" : "/login"}
            prefetch={false}
            className={`py-2 relative hover:text-[var(--navy)] transition-colors ${
              isAccount ? "font-semibold text-[var(--navy)]" : ""
            }`}
          >
            {isLoggedIn ? "내 정보" : "로그인"}
            {isAccount && (
              <span
                className="absolute left-0 right-0 -bottom-px h-[2px]"
                style={{ background: "var(--navy)" }}
              />
            )}
          </Link>
          {isLoggedIn ? (
            <button type="button" onClick={signOut} className="py-2 hover:text-[var(--navy)] transition-colors">
              로그아웃
            </button>
          ) : null}
        </nav>

        <div className="hidden sm:flex gap-5 items-center text-[13px]" style={{ color: "var(--navy2)" }}>
          <a
            href="https://www.diantex.kr/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--navy)] transition-colors"
          >
            diantex.kr
          </a>
        </div>
      </div>
    </header>
  );
}
