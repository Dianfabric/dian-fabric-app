"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Fabric } from "@/lib/types";

export default function FabricDetailPage() {
  const { id } = useParams();
  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/fabrics/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setFabric(data);
      })
      .catch(() => setFabric(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleQuantity = useCallback(
    (delta: number) => {
      setQuantity((prev) => Math.max(1, Math.min(105, prev + delta)));
    },
    []
  );

  if (loading) {
    return (
      <div className="pt-24 pb-16 flex justify-center">
        <div className="w-8 h-8 border-3 border-[#C49A6C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!fabric) {
    return (
      <div className="pt-24 pb-16 text-center">
        <p className="text-gray-500 mb-4">원단을 찾을 수 없습니다</p>
        <Link href="/fabrics" className="text-[#8B6914] underline">
          원단 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  // 조성 문자열 만들기
  const compositions: string[] = [];
  if (fabric.pl_percent > 0) compositions.push(`${fabric.pl_percent}%polyester`);
  if (fabric.co_percent > 0) compositions.push(`${fabric.co_percent}%cotton`);
  if (fabric.li_percent > 0) compositions.push(`${fabric.li_percent}%linen`);
  if (fabric.other_percent > 0) compositions.push(`${fabric.other_percent}%other`);
  const compositionStr =
    fabric.composition_note || compositions.join(" ") || "-";

  const pricePerMeter = fabric.price_per_yard
    ? Math.round(fabric.price_per_yard * 1.094)
    : null;
  const subtotal = pricePerMeter ? pricePerMeter * quantity : null;
  const shipping = 10000;
  const discount = quantity >= 20 ? 0.05 : 0;
  const freeShipping = quantity >= 50;
  const total = subtotal
    ? Math.round(subtotal * (1 - discount)) + (freeShipping ? 0 : shipping)
    : null;

  return (
    <div className="pt-24 pb-16 max-w-5xl mx-auto px-4">
      {/* 뒤로가기 */}
      <Link
        href="/fabrics"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <span>←</span> 원단 목록
      </Link>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* 왼쪽: 이미지 */}
        <div className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden">
          {fabric.image_url ? (
            <Image
              src={fabric.image_url}
              alt={`${fabric.name}-${fabric.color_code}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No Image
            </div>
          )}
        </div>

        {/* 오른쪽: 정보 */}
        <div className="flex flex-col gap-5">
          {/* 제목 */}
          <div>
            <h1 className="text-2xl font-extrabold mb-1">{fabric.name}</h1>
            <p className="text-sm text-gray-500">
              {fabric.fabric_type || "원단"} · {compositionStr}
            </p>
            {/* 태그 */}
            <div className="flex gap-2 flex-wrap mt-3">
              {fabric.fabric_type && (
                <span className="text-xs font-semibold text-[#8B6914] bg-[rgba(139,105,20,0.08)] px-3 py-1 rounded-lg">
                  {fabric.fabric_type}
                </span>
              )}
              {fabric.pattern_detail && (
                <span className="text-xs font-semibold text-white bg-[#8B6914] px-3 py-1 rounded-lg">
                  {fabric.pattern_detail}
                </span>
              )}
              {fabric.usage_types?.map((u) => (
                <span
                  key={u}
                  className="text-xs font-semibold text-[#8B6914] bg-[rgba(139,105,20,0.08)] px-3 py-1 rounded-lg"
                >
                  {u}
                </span>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-600">
            {fabric.name} - {compositionStr}
          </p>

          {/* 상세 정보 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[15px] text-[#8B6914] mb-4">
              상세 정보
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">폭</span>
                <span className="font-medium">
                  {fabric.width_mm ? `${(fabric.width_mm / 10).toFixed(0)}cm` : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">조성</span>
                <span className="font-medium">{compositionStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">용도</span>
                <span className="font-medium">
                  {fabric.usage_types?.join(", ") || "-"}
                </span>
              </div>
              {fabric.is_curtain_eligible && (
                <div className="flex justify-between">
                  <span className="text-gray-500">커튼 가능</span>
                  <span className="font-medium text-green-600">Yes</span>
                </div>
              )}
              {fabric.is_flame_retardant && (
                <div className="flex justify-between">
                  <span className="text-gray-500">방염</span>
                  <span className="font-medium text-green-600">방염 인증</span>
                </div>
              )}
            </div>
          </div>

          {/* 가격 정보 */}
          {pricePerMeter && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex justify-between items-end">
                <span className="text-sm text-gray-500">야드 단가</span>
                <span className="text-xl font-extrabold text-gradient">
                  &#8361;{fabric.price_per_yard!.toLocaleString()}/Y
                </span>
              </div>
            </div>
          )}

          {/* 가격 계산기 */}
          {pricePerMeter && (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h3 className="font-bold text-[15px] mb-4 flex items-center gap-2">
                🧮 가격 계산기
              </h3>
              <p className="text-xs text-gray-500 mb-2">수량 (미터)</p>
              <div className="flex items-center gap-4 mb-2">
                <button
                  onClick={() => handleQuantity(-1)}
                  className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg hover:bg-gray-50 transition-colors"
                >
                  −
                </button>
                <div className="flex-1 text-center">
                  <span className="text-3xl font-extrabold">{quantity}</span>
                  <span className="text-sm text-gray-400 ml-1">m</span>
                </div>
                <button
                  onClick={() => handleQuantity(1)}
                  className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg hover:bg-gray-50 transition-colors"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center mb-5">
                최소 주문: 1m · 재고: 105m
              </p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">단가</span>
                  <span>&#8361;{pricePerMeter.toLocaleString()}/m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8B6914]">소계</span>
                  <span className="font-semibold">
                    &#8361;{subtotal!.toLocaleString()}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>할인 (5%)</span>
                    <span>
                      -&#8361;{Math.round(subtotal! * discount).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">🚛 배송비</span>
                  <span>
                    {freeShipping ? (
                      <span className="text-green-600">무료</span>
                    ) : (
                      `₩${shipping.toLocaleString()}`
                    )}
                  </span>
                </div>
              </div>

              <hr className="my-4 border-gray-100" />
              <div className="flex justify-between items-center">
                <span className="font-bold">총 결제금액</span>
                <span className="text-2xl font-extrabold">
                  &#8361;{total!.toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-gray-400 text-center mt-3">
                20m 이상 주문 시 5% 할인, 50m 이상 무료배송
              </p>

              <button className="w-full mt-5 bg-gradient-to-r from-[#B8956A] to-[#8B6914] text-white py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg transition-all">
                샘플 신청하기 (₩3,000)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
