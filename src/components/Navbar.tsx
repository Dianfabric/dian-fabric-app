"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const isFabrics = pathname === "/" || pathname === "/fabrics" || pathname.startsWith("/fabric/");
  const isSearch = pathname === "/search";

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
          aria-label="dian"
          className="flex items-end gap-[7px] shrink-0"
          onClick={(e) => {
            // 로고 = 홈: 저장된 필터/스크롤 전부 해제하고 깨끗한 원단목록으로
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

        <nav className="flex gap-[18px] sm:gap-[30px] text-[13px] sm:text-[14px] tracking-[.02em]" style={{ color: "var(--navy2)" }}>
          <Link
            href="/fabrics"
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
          <Link
            href="/search"
            className={`py-2 relative hover:text-[var(--navy)] transition-colors ${
              isSearch ? "font-semibold text-[var(--navy)]" : ""
            }`}
          >
            AI 대체 원단찾기
            {isSearch && (
              <span
                className="absolute left-0 right-0 -bottom-px h-[2px]"
                style={{ background: "var(--navy)" }}
              />
            )}
          </Link>
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
