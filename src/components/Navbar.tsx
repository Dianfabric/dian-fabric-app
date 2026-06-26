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
      <div className="max-w-[1320px] mx-auto h-[70px] px-8 flex items-center justify-between">
        <Link
          href="/"
          className="font-semibold text-[27px] tracking-[.2em]"
          style={{ fontFamily: "'Cormorant Garamond', serif", color: "var(--navy)" }}
        >
          DIAN
        </Link>

        <nav className="flex gap-[30px] text-[14px] tracking-[.02em]" style={{ color: "var(--navy2)" }}>
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

        <div className="flex gap-5 items-center text-[13px]" style={{ color: "var(--navy2)" }}>
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
