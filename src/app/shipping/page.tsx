import Link from "next/link";

export const metadata = {
  title: "배송 안내 | DIAN Fabric",
};

export default function ShippingPage() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-14 text-[#1E2A3A]">
      <p className="text-xs font-bold tracking-[.22em] text-gray-400">DIAN POLICY</p>
      <h1 className="mt-3 text-3xl font-extrabold">배송 안내</h1>
      <p className="mt-4 text-gray-600 leading-7">
        DIAN Fabric에서 상담 후 진행되는 상품은 재고 확인 및 출고 준비 후 발송됩니다.
      </p>
      <div className="mt-10 space-y-8 rounded-2xl border border-gray-100 bg-white p-6 leading-8 shadow-sm">
        <div>
          <h2 className="text-xl font-bold">배송 방법</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
            <li>택배 또는 화물 배송으로 발송됩니다.</li>
            <li>원단 수량, 부피, 지역에 따라 배송 방식이 달라질 수 있습니다.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold">배송비</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
            <li>배송비는 주문 수량, 부피, 지역에 따라 상담 후 확정됩니다.</li>
            <li>도서산간 및 제주 지역은 추가 배송비가 발생할 수 있습니다.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-bold">배송 기간</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-gray-700">
            <li>국내 보유 재고 상품: 재고 확인 후 영업일 기준 1~3일 내 출고</li>
            <li>해외 또는 공급처 확인이 필요한 상품: 재고 확인 후 별도 안내</li>
            <li>주문량, 재고 상황, 택배사 사정에 따라 배송이 지연될 수 있습니다.</li>
          </ul>
        </div>
      </div>
      <Link href="/fabrics" className="mt-8 inline-flex text-sm font-bold text-[#1E2A3A] underline">원단 컬렉션으로 돌아가기</Link>
    </section>
  );
}
