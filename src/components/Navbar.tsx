"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const EXTERNAL_LINKS = [
  {
    href: "https://www.diantex.kr/",
    label: "디안 홈페이지",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    href: "https://www.instagram.com/diantextile/",
    label: "인스타",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
      </svg>
    ),
  },
  {
    href: "http://pf.kakao.com/_xbSuYK",
    label: "카카오 채널",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
      </svg>
    ),
  },
  {
    href: "https://map.naver.com/p/search/%EB%94%94%EC%95%88/place/13272942?c=15.00,0,0,0,dh&placePath=/ticket",
    label: "디안 쇼룸 주소",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    ),
  },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 w-full z-50 bg-white border-b border-gray-100">
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-3">
        {/* 윗줄: 큰 로고 (Designtex 스타일) */}
        <div className="pt-2 pb-3">
          <Link
            href="/"
            className="inline-block text-3xl md:text-4xl font-extrabold tracking-tight"
          >
            DIAN <span className="text-gradient">fabric</span>
          </Link>
        </div>

        {/* 아랫줄: 메뉴(좌) + 외부 링크(우) */}
        <div className="flex items-center justify-between">
          {/* 좌측 메뉴 */}
          <div className="flex gap-7 text-[14px] font-semibold">
            <Link
              href="/fabrics"
              className={`transition-colors hover:text-black ${
                pathname === "/fabrics" ? "text-black" : "text-gray-500"
              }`}
            >
              원단 목록
            </Link>
            <Link
              href="/search"
              className={`transition-colors hover:text-black ${
                pathname === "/search" ? "text-black" : "text-gray-500"
              }`}
            >
              원단 찾기
            </Link>
          </div>

          {/* 우측 외부 링크 4개 */}
          <div className="flex items-center gap-1 sm:gap-2">
            {EXTERNAL_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2 sm:px-3 py-2 text-gray-500 hover:text-black hover:bg-gray-50 rounded-lg transition-all text-[12px] font-semibold"
                title={link.label}
              >
                {link.icon}
                <span className="hidden md:inline">{link.label}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
