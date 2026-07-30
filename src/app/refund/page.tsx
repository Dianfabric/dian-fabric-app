import Link from "next/link";

export const metadata = {
  title: "교환·반품·환불정책 | DIAN Fabric",
};

export default function RefundPage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-14 text-[#1E2A3A]">
      <p className="text-xs font-bold tracking-[.22em] text-gray-400">DIAN POLICY</p>
      <h1 className="mt-3 text-3xl font-extrabold">교환·반품·환불정책</h1>
      <p className="mt-4 text-gray-600 leading-7">
        원단 상품은 재단, 발주, 로트 차이 등 상품 특성에 따라 교환·반품 가능 여부가 달라질 수 있습니다.
      </p>
      <div className="mt-10 space-y-8 rounded-2xl border border-gray-100 bg-white p-6 leading-8 shadow-sm">
        <div>
          <h2 className="text-xl font-bold">교환 및 반품 가능</h2>
          <p className="mt-3 text-gray-700">아래의 경우 상품 수령 후 7일 이내 고객센터로 연락해 주세요.</p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
            <li>주문한 상품과 다른 상품이 배송된 경우</li>
            <li>상품에 명백한 하자 또는 오염이 있는 경우</li>
            <li>배송 중 파손이 발생한 경우</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold">교환 및 반품이 어려운 경우</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
            <li>고객 요청에 따라 재단 또는 발주가 진행된 원단</li>
            <li>해외 발주 특성 상 재고를 보관하지 않아 발주 후 환불이 불가능합니다.</li>
            <li>고객의 사용 또는 보관 부주의로 상품 가치가 훼손된 경우</li>
            <li>상품 수령 후 7일이 지난 경우</li>
            <li>모니터 환경에 따른 색상 차이, 원단 로트 차이 등 상품 특성에 해당하는 경우</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold">문의</h2>
          <p className="mt-3 text-gray-700">교환·반품·환불 문의는 고객센터 1600-1435 또는 help@diantex.co.kr로 연락해 주세요.</p>
        </div>
      </div>
      <Link href="/fabrics" className="mt-8 inline-flex text-sm font-bold text-[#1E2A3A] underline">원단 컬렉션으로 돌아가기</Link>
    </section>
  );
}
