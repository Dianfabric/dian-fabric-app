"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import ImageLightbox from "@/components/ImageLightbox";
import {
  addInquiryCartItem,
  formatKrw,
  type CatalogInquiryItemType,
} from "@/lib/catalog-inquiry-cart";
import { createCatalogBrowserClient } from "@/lib/supabase-browser";
import type { Fabric } from "@/lib/types";

interface ColorVariant {
  id: string;
  name: string;
  color_code: string;
  image_url: string | null;
  price_per_yard: number | null;
}

export default function FabricDetailPage() {
  const supabase = createCatalogBrowserClient();
  const { id } = useParams();
  const router = useRouter();
  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLightbox, setShowLightbox] = useState(false);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null); // 현재 선택된 컬러 (페이지 이동 없이 교체)
  const [orderMode, setOrderMode] = useState<CatalogInquiryItemType>("fabric_yard");
  const [quantityInput, setQuantityInput] = useState("1");
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/fabrics/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        const { colorVariants: variants, ...fabricData } = data;
        setFabric(fabricData);
        setColorVariants(variants || []);
      })
      .catch(() => setFabric(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="pt-14 pb-16 flex justify-center">
        <div className="w-8 h-8 border-3 border-[#1E2A3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!fabric) {
    return (
      <div className="pt-14 pb-16 text-center">
        <p className="text-gray-500 mb-4">원단을 찾을 수 없습니다</p>
        <Link href="/fabrics" className="text-[#1E2A3A] underline">
          원단 목록으로 돌아가기
        </Link>
      </div>
    );
  }

  // 조성 문자열 만들기
  const activeFabric = fabric as Fabric;
  const compositions: string[] = [];
  if (fabric.pl_percent > 0) compositions.push(`${fabric.pl_percent}%polyester`);
  if (fabric.co_percent > 0) compositions.push(`${fabric.co_percent}%cotton`);
  if (fabric.li_percent > 0) compositions.push(`${fabric.li_percent}%linen`);
  if (fabric.other_percent > 0) compositions.push(`${fabric.other_percent}%other`);
  const compositionStr =
    fabric.composition_note || compositions.join(" ") || "-";

  // 같은 디자인의 전체 컬러 (자기 + 변형). 컬러 클릭 시 페이지 이동 없이 이걸로 교체.
  const allColors = [
    { id: fabric.id, color_code: fabric.color_code, image_url: fabric.image_url, price_per_yard: fabric.price_per_yard },
    ...colorVariants.map((v) => ({ id: v.id, color_code: v.color_code, image_url: v.image_url, price_per_yard: v.price_per_yard })),
  ];
  const current = allColors.find((c) => c.id === selId) || allColors[0];
  // 표시 이미지/색번호: hover(임시 미리보기) 우선, 없으면 선택된 컬러
  const dispImage = hoverImage || current.image_url;
  const dispColor = hoverColor || current.color_code;
  const unitPriceKrw = current.price_per_yard || 0;
  const parsedQuantity = Math.max(1, Number(quantityInput) || 1);
  const activeUnit = orderMode === "fabric_yard" ? "Y" : "개";
  const activeTotal = unitPriceKrw * parsedQuantity;

  async function addToInquiryCart() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = typeof window !== "undefined" ? window.location.pathname : "/fabrics";
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    addInquiryCartItem({
      fabricId: current.id,
      itemType: orderMode,
      fabricName: activeFabric.name,
      colorCode: current.color_code,
      supplier: activeFabric.supplier || null,
      imageUrl: current.image_url,
      quantity: parsedQuantity,
      unitPriceKrw,
      detailUrl: typeof window !== "undefined" ? `${window.location.origin}/fabric/${current.id}` : `/fabric/${current.id}`,
    });
    setCartMessage(`${activeFabric.name} #${current.color_code} ${parsedQuantity}${activeUnit} 장바구니에 담았습니다.`);
  }

  return (
    <div className="pt-14 pb-16 max-w-5xl mx-auto px-4">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <span>←</span> 원단 목록
      </button>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* 라이트박스 */}
        {showLightbox && current.image_url && (
          <ImageLightbox
            images={[{
              src: current.image_url,
              name: fabric.name,
              colorCode: current.color_code,
              patternDetail: fabric.pattern_detail || undefined,
              fabricType: fabric.fabric_type || undefined,
              price: current.price_per_yard || undefined,
            }]}
            currentIndex={0}
            onClose={() => setShowLightbox(false)}
          />
        )}

        {/* 왼쪽: 이미지 + 컬러웨이 */}
        <div>
          <div
            className="relative aspect-square bg-gray-100 rounded-2xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setShowLightbox(true)}
          >
            {dispImage ? (
              <Image
                src={dispImage}
                alt={`${fabric.name}-${dispColor}`}
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
            {dispColor && (
              <span className="absolute top-3 left-3 bg-black/70 text-white text-xs font-semibold px-3 py-1 rounded-lg">
                {dispColor}
              </span>
            )}
          </div>

        </div>

        {/* 오른쪽: 정보 */}
        <div className="flex flex-col gap-5">
          {/* 제목 */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-extrabold mb-1">
                {fabric.name}
                {current.color_code && (
                  <span className="text-gray-400 font-bold ml-2">#{current.color_code}</span>
                )}
              </h1>
              {unitPriceKrw > 0 && (
                <span className="shrink-0 text-xl font-extrabold text-[#1E2A3A] tabular-nums">
                  &#8361;{unitPriceKrw.toLocaleString()}/Y
                </span>
              )}
            </div>
            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <p><span className="font-semibold text-[#1E2A3A]">성분</span> {compositionStr}</p>
              <p><span className="font-semibold text-[#1E2A3A]">폭</span> {fabric.width_mm ? `${(fabric.width_mm / 10).toFixed(0)}cm` : "-"}</p>
            </div>
            {/* 태그 */}
            <div className="flex gap-2 flex-wrap mt-3">
              {fabric.pattern_detail && (
                <span className="text-xs font-semibold text-white bg-[#1E2A3A] px-3 py-1 rounded-lg">
                  {fabric.pattern_detail}
                </span>
              )}
              {fabric.usage_types?.map((u) => (
                <span
                  key={u}
                  className="text-xs font-semibold text-[#1E2A3A] bg-[rgba(30,42,58,0.06)] px-3 py-1 rounded-lg"
                >
                  {u}
                </span>
              ))}
            </div>
          </div>

          {/* 다른 컬러웨이 — 제목 바로 아래 */}
          {colorVariants.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">
                다른 컬러 ({colorVariants.length + 1}개)
              </p>
              <div className="flex gap-2 flex-wrap">
                {/* 같은 디자인 컬러 — 클릭 시 페이지 이동 없이 이미지/번호/단가 교체 */}
                {allColors.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelId(c.id)}
                    onMouseEnter={() => { setHoverImage(c.image_url); setHoverColor(c.color_code); }}
                    onMouseLeave={() => { setHoverImage(null); setHoverColor(null); }}
                    className={`relative w-14 h-14 rounded-lg overflow-hidden transition-all ${
                      current.id === c.id ? "ring-2 ring-[#1E2A3A]" : "border border-gray-200 hover:ring-2 hover:ring-[#1E2A3A]"
                    }`}
                  >
                    {c.image_url ? (
                      <Image src={c.image_url} alt={c.color_code} fill className="object-cover" sizes="56px" />
                    ) : (
                      <div className="w-full h-full bg-gray-200" />
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 leading-tight">
                      {c.color_code}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 장바구니 담기 */}
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold tracking-[.18em] text-gray-400">CART</p>
            <h2 className="mt-1 text-lg font-extrabold text-[#1E2A3A]">재고 체크 · 구매 문의</h2>
            <p className="mt-1 text-sm text-gray-500">로그인 후 원단/스와치를 담아 챗봇 상담으로 연결합니다.</p>

            <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
              {[
                ["fabric_yard", "원단"],
                ["swatch", "스와치"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOrderMode(value as CatalogInquiryItemType)}
                  className={`rounded-xl px-4 py-3 text-sm font-extrabold transition ${
                    orderMode === value ? "bg-[#1E2A3A] text-white shadow-sm" : "text-[#1E2A3A]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-sm font-bold text-[#1E2A3A]">
              수량
              <div className="mt-1 flex overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <input
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value.replace(/[^0-9.]/g, ""))}
                  onBlur={() => setQuantityInput(String(parsedQuantity))}
                  onFocus={(event) => event.currentTarget.select()}
                  inputMode="decimal"
                  className="min-w-0 flex-1 px-4 py-3 text-base font-bold outline-none"
                />
                <span className="flex items-center px-4 text-sm font-extrabold text-gray-500">{activeUnit}</span>
              </div>
            </label>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-[rgba(30,42,58,0.04)] px-4 py-3 text-sm">
              <span className="font-bold text-gray-500">예상 금액</span>
              <strong className="text-lg text-[#1E2A3A]">{formatKrw(activeTotal)}</strong>
            </div>

            <button
              type="button"
              onClick={addToInquiryCart}
              className="mt-4 w-full rounded-2xl bg-[#1E2A3A] px-5 py-4 text-sm font-extrabold text-white transition hover:opacity-90"
            >
              장바구니 담기
            </button>
            <Link
              href="/cart"
              className="mt-3 flex w-full items-center justify-center rounded-2xl border border-gray-200 px-5 py-3 text-sm font-extrabold text-[#1E2A3A]"
            >
              장바구니 보기
            </Link>
            {cartMessage && <p className="mt-3 rounded-2xl bg-green-50 px-4 py-3 text-sm font-bold text-green-700">{cartMessage}</p>}
          </div>

          {/* 가격 계산기/주문 영역은 추후 정식 오픈 시 추가 예정 */}
        </div>
      </div>
    </div>
  );
}
