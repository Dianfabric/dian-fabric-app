"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 w-full z-50 px-4 pt-3">
      <div className="max-w-[1280px] mx-auto bg-white rounded-2xl px-7 h-14 flex items-center justify-between shadow-[0_2px_20px_rgba(0,0,0,0.06)]">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          DIAN <span className="text-gradient">fabric</span>
        </Link>

        <div className="flex gap-7 text-sm font-medium text-gray-500">
          <Link
            href="/search"
            className={`transition-colors hover:text-gray-900 ${
              pathname === "/search" ? "text-gray-900" : ""
            }`}
          >
            원단 찾기
          </Link>
          <Link
            href="/fabrics"
            className={`transition-colors hover:text-gray-900 ${
              pathname === "/fabrics" ? "text-gray-900" : ""
            }`}
          >
            원단 목록
          </Link>
        </div>

        <Link
          href="/search"
          className="bg-gradient-gold text-white border-none px-5 py-2.5 rounded-xl text-[13px] font-semibold hover:shadow-[0_4px_16px_rgba(139,105,20,0.3)] hover:-translate-y-0.5 transition-all"
        >
          무료 시작
        </Link>
      </div>
    </nav>
  );
}
