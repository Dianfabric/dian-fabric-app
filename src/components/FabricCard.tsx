import Image from "next/image";
import Link from "next/link";
import type { SearchResult, Fabric } from "@/lib/types";

type Props = {
  fabric: Fabric | SearchResult;
  showSimilarity?: boolean;
  disableLink?: boolean;
  onImageClick?: () => void;       // (구) 이미지 클릭 시 라이트박스 등
  onQuickView?: () => void;        // 데스크탑 hover 퀵뷰 버튼 → 우측 패널
  onOpenDetail?: () => void;       // 상세 이동 직전 (스크롤 위치 저장용)
  colorCount?: number;             // 대표모드: 이 디자인의 컬러웨이 수 ("N색" 배지)
};

export default function FabricCard({
  fabric, showSimilarity, disableLink, onImageClick, onQuickView, onOpenDetail, colorCount,
}: Props) {
  const similarity = "similarity" in fabric ? fabric.similarity : null;
  const isDesign = colorCount != null;

  const widthLabel = fabric.width_mm ? `${(fabric.width_mm / 10).toFixed(0)}cm` : null;
  const compositionText = fabric.composition_note || null;

  const inner = (
    <>
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
          <Image
            src={fabric.image_url}
            alt={`${fabric.name}-${fabric.color_code}`}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            style={{ transitionTimingFunction: "cubic-bezier(.2,.7,.2,1)" }}
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: "var(--muted)" }}>
            No Image
          </div>
        )}

        {/* Quick View — 데스크탑 hover 전용 */}
        {onQuickView && (
          <div className="hidden lg:flex absolute inset-x-0 bottom-0 justify-center pb-3 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuickView(); }}
              className="px-4 py-2 text-[11.5px] font-semibold tracking-[.08em] text-white rounded-[3px] backdrop-blur-sm hover:bg-black/90 transition-colors"
              style={{ background: "rgba(30,33,40,.82)" }}
            >
              QUICK VIEW
            </button>
          </div>
        )}

        {showSimilarity && similarity !== null && (
          <span className="absolute top-3 right-3 bg-[var(--navy)] text-white text-[11px] font-bold px-3 py-1 rounded-[3px]">
            {(similarity * 100).toFixed(1)}%
          </span>
        )}
        {isDesign && colorCount! > 1 && (
          <span className="absolute bottom-2.5 right-2.5 bg-black/55 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur-sm lg:group-hover:opacity-0 transition-opacity">
            {colorCount}색
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="pt-3 px-[2px]">
        <div
          className="text-[15px] font-semibold tracking-[.01em] whitespace-nowrap overflow-hidden text-ellipsis"
          style={{ color: "var(--navy)" }}
        >
          {fabric.name}
        </div>
        <div className="text-[12px] mt-[3px]" style={{ color: "var(--muted)" }}>
          {isDesign ? `컬러 ${colorCount}개` : fabric.color_code}
        </div>
        {compositionText && (
          <div
            className="text-[11.5px] mt-[9px] tracking-[.01em] whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ color: "#9B9C9E" }}
            title={compositionText}
          >
            {compositionText}
          </div>
        )}
        {widthLabel && (
          <div className="text-[11.5px] mt-[3px]" style={{ color: "#AEAEAB" }}>
            {widthLabel}
          </div>
        )}
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
    </>
  );

  // 링크 비활성(예: 비교 페이지) → 정적 카드
  if (disableLink) {
    return <div className="group">{inner}</div>;
  }

  // 카드 전체 = 상세페이지 링크 (모바일 탭/데스크탑 클릭 동일). 퀵뷰 버튼만 별도.
  return (
    <Link href={`/fabric/${fabric.id}`} onClick={() => onOpenDetail?.()} className="block group cursor-pointer">
      {inner}
    </Link>
  );
}
