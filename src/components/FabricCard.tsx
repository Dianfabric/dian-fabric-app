import Image from "next/image";
import Link from "next/link";
import type { SearchResult, Fabric } from "@/lib/types";

type Props = {
  fabric: Fabric | SearchResult;
  showSimilarity?: boolean;
  disableLink?: boolean;
  onImageClick?: () => void;
  colorCount?: number; // 대표모드: 이 디자인의 컬러웨이 수 (있으면 배지 + 클릭=모달)
};

export default function FabricCard({ fabric, showSimilarity, disableLink, onImageClick, colorCount }: Props) {
  const similarity = "similarity" in fabric ? fabric.similarity : null;
  const isDesign = colorCount != null; // 대표모드 카드

  const widthLabel = fabric.width_mm
    ? `${(fabric.width_mm / 10).toFixed(0)}cm`
    : null;

  const compositionText = fabric.composition_note || null;

  const card = (
    <div className="cursor-pointer group">
      {/* Thumbnail */}
      <div
        className="relative aspect-square overflow-hidden rounded-[3px]"
        style={{ background: "var(--soft)", border: "1px solid var(--line)" }}
        onClick={(e) => {
          if (onImageClick) {
            e.preventDefault();
            e.stopPropagation();
            onImageClick();
          }
        }}
      >
        {fabric.image_url ? (
          <div className="absolute inset-0 transition-transform duration-500" style={{ transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)" }}>
            <Image
              src={fabric.image_url}
              alt={`${fabric.name}-${fabric.color_code}`}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
              style={{ transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)" }}
              sizes="(max-width: 768px) 50vw, 25vw"
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
            No Image
          </div>
        )}
        {showSimilarity && similarity !== null && (
          <span className="absolute top-3 right-3 bg-[var(--navy)] text-white text-[11px] font-bold px-3 py-1 rounded-[3px]">
            {(similarity * 100).toFixed(1)}%
          </span>
        )}
        {isDesign && colorCount! > 1 && (
          <span className="absolute bottom-2.5 right-2.5 bg-black/55 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm">
            {colorCount}색
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="pt-3 px-[2px]">
        {/* Design name */}
        <div
          className="text-[15px] font-semibold tracking-[.01em] whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ color: "var(--navy)" }}
        >
          {fabric.name}
        </div>
        {/* Color code (개별) 또는 컬러웨이 수 (대표) */}
        <div className="text-[12px] mt-[3px]" style={{ color: "var(--muted)" }}>
          {isDesign ? `컬러 ${colorCount}개` : fabric.color_code}
        </div>
        {/* Composition */}
        {compositionText && (
          <div
            className="text-[11.5px] mt-[9px] tracking-[.01em] whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ color: "#9B9C9E" }}
            title={compositionText}
          >
            {compositionText}
          </div>
        )}
        {/* Width */}
        {widthLabel && (
          <div className="text-[11.5px] mt-[3px]" style={{ color: "#AEAEAB" }}>
            {widthLabel}
          </div>
        )}
        {/* Price */}
        {fabric.price_per_yard != null && fabric.price_per_yard > 0 && (
          <div
            className="text-[14px] font-semibold mt-2 tracking-[.01em]"
            style={{ color: "var(--navy)", fontVariantNumeric: "tabular-nums" }}
          >
            &#8361;{fabric.price_per_yard.toLocaleString()}
            <span className="text-[11px] font-normal ml-[2px]" style={{ color: "var(--muted)" }}>/Y</span>
          </div>
        )}
      </div>
    </div>
  );

  // 대표모드: 카드 전체 클릭 → 컬러웨이 모달 (상세 이동 X)
  if (isDesign) {
    return (
      <div onClick={() => onImageClick?.()} className="block">
        {card}
      </div>
    );
  }

  if (disableLink) return card;

  return (
    <Link href={`/fabric/${fabric.id}`} className="block">
      {card}
    </Link>
  );
}
