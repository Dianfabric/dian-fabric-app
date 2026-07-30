import Link from "next/link";

const policyLinks = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/shipping", label: "배송 안내" },
  { href: "/refund", label: "교환·반품·환불정책" },
];

export default function Footer() {
  return (
    <footer
      className="mt-[60px] px-5 py-10 text-[12px]"
      style={{ borderTop: "1px solid var(--line)", color: "var(--muted)" }}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-semibold tracking-[.08em] text-[#1E2A3A]">
          {policyLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </div>

        <div className="space-y-2 text-center leading-6">
          <p className="font-semibold tracking-[.12em] text-[#1E2A3A]">DIAN TEXTILE · NO.1 INTERIOR TEXTILE BRAND</p>
          <p>상호 디안 · 대표 한태원 · 사업자등록번호 211-08-78685 · 통신판매업 신고번호 제2017-서울강남-03328호</p>
          <p>주소 [공장] 충남 공주시 유구읍 유구외곽로 162 · [서울지점] 서울 강남구 학동로 224 삼환아르누보3 3F</p>
          <p>고객센터 1600-1435 · 02-6447-1221 · 운영시간 평일 10:00 - 17:00 · 주말 및 공휴일 휴무</p>
          <p>이메일 help@diantex.co.kr · 개인정보취급책임자 한태원</p>
          <p className="pt-2 text-[11px] tracking-[.08em]">Copyright © 2026 DIAN. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
