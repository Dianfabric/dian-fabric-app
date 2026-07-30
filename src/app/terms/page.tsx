import Link from "next/link";

export const metadata = {
  title: "이용약관 | DIAN Fabric",
};

const terms = [
  ["제1조 목적", "본 약관은 DIAN Fabric이 제공하는 온라인 원단 카탈로그 및 상담 서비스의 이용 조건과 절차, 회사와 이용자의 권리와 의무를 정하는 것을 목적으로 합니다."],
  ["제2조 서비스 내용", "DIAN Fabric은 원단 상품 정보 제공, 회원가입 및 로그인, 원단 검색, 상세 정보 확인, 상담 문의 연결 서비스를 제공합니다."],
  ["제3조 회원가입", "이용자는 이메일 또는 소셜 로그인 방식으로 회원가입할 수 있습니다. 회원은 정확한 정보를 제공해야 하며, 허위 정보로 인해 발생한 문제는 회원 본인의 책임입니다."],
  ["제4조 상품 정보", "원단 상품은 촬영 환경, 모니터 설정, 생산 로트에 따라 실제 색상과 질감이 다르게 보일 수 있습니다. 정확한 확인이 필요한 경우 스와치 확인 또는 상담을 권장합니다."],
  ["제5조 상담 및 주문", "카탈로그에서 확인한 원단은 상담을 통해 재고, 납기, 주문 가능 여부를 최종 확인합니다."],
  ["제6조 배송", "배송 방법, 배송비, 배송 기간은 배송 안내 페이지를 따릅니다."],
  ["제7조 교환·반품·환불", "교환, 반품, 환불은 교환·반품·환불정책 페이지를 따릅니다."],
  ["제8조 개인정보 보호", "회사는 개인정보처리방침에 따라 이용자의 개인정보를 보호합니다."],
  ["제9조 책임 제한", "천재지변, 배송사 사정, 공급처 재고 변동 등 회사의 합리적 통제를 벗어난 사유로 발생한 지연에 대해 회사의 책임이 제한될 수 있습니다."],
  ["제10조 문의", "서비스 이용 관련 문의는 고객센터 1600-1435 또는 help@diantex.co.kr로 연락해 주세요."],
];

export default function TermsPage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-14 text-[#1E2A3A]">
      <p className="text-xs font-bold tracking-[.22em] text-gray-400">DIAN POLICY</p>
      <h1 className="mt-3 text-3xl font-extrabold">이용약관</h1>
      <div className="mt-10 space-y-7 rounded-2xl border border-gray-100 bg-white p-6 leading-8 shadow-sm">
        {terms.map(([title, body]) => (
          <div key={title}>
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="mt-3 text-gray-700">{body}</p>
          </div>
        ))}
      </div>
      <Link href="/fabrics" className="mt-8 inline-flex text-sm font-bold text-[#1E2A3A] underline">원단 컬렉션으로 돌아가기</Link>
    </section>
  );
}
