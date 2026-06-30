"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import ImageLightbox from "@/components/ImageLightbox";
import type { Fabric } from "@/lib/types";

const KAKAO_URL = "https://pf.kakao.com/_xbSuYK"; // 디안 카카오톡 채널

interface ColorVariant {
  id: string;
  name: string;
  color_code: string;
  image_url: string | null;
  price_per_yard: number | null;
}

export default function FabricDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [fabric, setFabric] = useState<Fabric | null>(null);
  const [colorVariants, setColorVariants] = useState<ColorVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLightbox, setShowLightbox] = useState(false);
  const [hoverImage, setHoverImage] = useState<string | null>(null);
  const [hoverColor, setHoverColor] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null); // 현재 선택된 컬러 (페이지 이동 없이 교체)

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
  const pricePerMeter = current.price_per_yard
    ? Math.round(current.price_per_yard * 1.094)
    : null;

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

          {/* 다른 컬러웨이 */}
          {colorVariants.length > 0 && (
            <div className="mt-4">
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
                    className={`relative w-16 h-16 rounded-lg overflow-hidden transition-all ${
                      current.id === c.id ? "ring-2 ring-[#1E2A3A]" : "border border-gray-200 hover:ring-2 hover:ring-[#1E2A3A]"
                    }`}
                  >
                    {c.image_url ? (
                      <Image src={c.image_url} alt={c.color_code} fill className="object-cover" sizes="64px" />
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
        </div>

        {/* 오른쪽: 정보 */}
        <div className="flex flex-col gap-5">
          {/* 제목 */}
          <div>
            <h1 className="text-2xl font-extrabold mb-1">
              {fabric.name}
              {current.color_code && (
                <span className="text-gray-400 font-bold ml-2">#{current.color_code}</span>
              )}
            </h1>
            <p className="text-sm text-gray-500">
              {fabric.fabric_type || "원단"} · {compositionStr}
            </p>
            {/* 태그 */}
            <div className="flex gap-2 flex-wrap mt-3">
              {fabric.fabric_type && (
                <span className="text-xs font-semibold text-[#1E2A3A] bg-[rgba(30,42,58,0.06)] px-3 py-1 rounded-lg">
                  {fabric.fabric_type}
                </span>
              )}
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

          <p className="text-sm text-gray-600">
            {fabric.name} - {compositionStr}
          </p>

          {/* 상세 정보 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <h3 className="font-bold text-[15px] text-[#1E2A3A] mb-4">
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
                  &#8361;{current.price_per_yard!.toLocaleString()}/Y
                </span>
              </div>
            </div>
          )}

          {/* 카카오톡 문의하기 */}
          <a
            href={KAKAO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 font-bold transition-opacity hover:opacity-90"
            style={{ background: "#FEE500", color: "#3C1E1E" }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#3C1E1E" aria-hidden="true">
              <path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/>
            </svg>
            카카오톡으로 문의하기
          </a>

          {/* 가격 계산기/주문 영역은 추후 정식 오픈 시 추가 예정 */}
        </div>
      </div>
    </div>
  );
}
