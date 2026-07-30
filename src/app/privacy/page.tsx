import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 | DIAN Fabric",
};

const sections = [
  {
    title: "수집하는 개인정보",
    items: [
      "회원가입 및 로그인 정보: 이메일, 이름",
      "추가정보: 이름, 연락처, 회사명, 직책, 관심 원단 정보",
      "상담 및 서비스 이용 기록: 접속 기록, 문의 이력",
    ],
  },
  {
    title: "개인정보 이용 목적",
    items: [
      "회원 식별 및 로그인",
      "원단 상담 및 추천",
      "고객 문의 응대",
      "서비스 개선 및 부정 이용 방지",
    ],
  },
  {
    title: "개인정보 보관 기간",
    items: [
      "회원 정보: 회원 탈퇴 또는 삭제 요청 시까지",
      "상담 및 문의 기록: 관련 법령 또는 내부 운영 기준에 따른 기간",
      "소비자 불만 또는 분쟁 처리 기록: 3년",
    ],
  },
  {
    title: "개인정보 처리 위탁",
    items: [
      "문자 알림: 문자 발송 서비스 제공업체",
      "시스템 운영: Vercel, Supabase 등 클라우드 서비스",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-14 text-[#1E2A3A]">
      <p className="text-xs font-bold tracking-[.22em] text-gray-400">DIAN POLICY</p>
      <h1 className="mt-3 text-3xl font-extrabold">개인정보처리방침</h1>
      <p className="mt-4 text-gray-600 leading-7">
        DIAN Fabric은 고객의 개인정보를 중요하게 생각하며, 관련 법령에 따라 개인정보를 안전하게 관리합니다.
      </p>
      <div className="mt-10 space-y-8 rounded-2xl border border-gray-100 bg-white p-6 leading-8 shadow-sm">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="text-xl font-bold">{section.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
              {section.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
        <div>
          <h2 className="text-xl font-bold">제3자 제공</h2>
          <p className="mt-3 text-gray-700">
            DIAN Fabric은 고객 동의 없이 개인정보를 외부에 제공하지 않습니다. 단, 상담, 배송, 알림 처리에 필요한 범위 내에서 관련 업체에 제공될 수 있습니다.
          </p>
        </div>
        <div>
          <h2 className="text-xl font-bold">고객 권리 및 문의</h2>
          <p className="mt-3 text-gray-700">
            고객은 언제든지 개인정보 열람, 수정, 삭제를 요청할 수 있습니다. 개인정보 관련 문의는 고객센터 1600-1435 또는 help@diantex.co.kr로 연락해 주세요.
          </p>
        </div>
      </div>
      <Link href="/fabrics" className="mt-8 inline-flex text-sm font-bold text-[#1E2A3A] underline">원단 컬렉션으로 돌아가기</Link>
    </section>
  );
}
