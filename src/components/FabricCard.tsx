import Image from "next/image";
import Link from "next/link";
import type { SearchResult, Fabric } from "@/lib/types";

type Props = {
  fabric: Fabric | SearchResult;
  showSimilarity?: boolean;
  disableLink?: boolean;
  onImageClick?: () => void;
};

export default function FabricCard({ fabric, showSimilarity, disableLink, onImageClick }: Props) {
  const similarity = "similarity" in fabric ? fabric.similarity : null;

  return (
    <div className="block bg-white rounded-2xl overflow-hidden border border-gray-100 card-hover">
      {/* Image — 클릭 시 라이트박스 */}
      <div
        className="relative aspect-square bg-gray-100 cursor-pointer"
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
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-400 text-sm">
            No Image
          </div>
        )}
        {showSimilarity && similarity !== null && (
          <span className="absolute top-3 right-3 bg-gradient-gold text-white text-[11px] font-bold px-3 py-1 rounded-lg">
            {(similarity * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Info — 클릭 시 상세 페이지 */}
      {disableLink ? (
        <div className="p-4">
          <CardInfo fabric={fabric} />
        </div>
      ) : (
        <Link href={`/fabric/${fabric.id}`} className="block p-4 cursor-pointer hover:bg-gray-50 transition-colors">
          <CardInfo fabric={fabric} />
        </Link>
      )}
    </div>
  );
}

function CardInfo({ fabric }: { fabric: Fabric | SearchResult }) {
  return (
    <>
      <div className="text-[15px] font-bold">{fabric.name}</div>
      <div className="text-xs text-gray-400 mb-2.5">Color: {fabric.color_code}</div>
      <div className="flex gap-1.5 flex-wrap">
        {fabric.fabric_type && (
          <span className="text-[10px] font-semibold text-[#8B6914] bg-[linear-gradient(135deg,rgba(139,105,20,0.08),rgba(196,154,108,0.08))] px-2.5 py-1 rounded-md">
            {fabric.fabric_type}
          </span>
        )}
        {fabric.pattern_detail && (
          <span className="text-[10px] font-semibold text-white bg-[#8B6914] px-2.5 py-1 rounded-md">
            {fabric.pattern_detail}
          </span>
        )}
        {fabric.usage_types?.slice(0, 2).map((u) => (
          <span
            key={u}
            className="text-[10px] font-semibold text-[#8B6914] bg-[linear-gradient(135deg,rgba(139,105,20,0.08),rgba(196,154,108,0.08))] px-2.5 py-1 rounded-md"
          >
            {u}
          </span>
        ))}
      </div>
      {fabric.price_per_yard && (
        <div className="text-sm font-extrabold text-gradient mt-3">
          &#8361;{fabric.price_per_yard.toLocaleString()}/Y
        </div>
      )}
    </>
  );
}
