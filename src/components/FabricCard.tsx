import Image from "next/image";
import type { SearchResult, Fabric } from "@/lib/types";

type Props = {
  fabric: Fabric | SearchResult;
  showSimilarity?: boolean;
};

export default function FabricCard({ fabric, showSimilarity }: Props) {
  const similarity = "similarity" in fabric ? fabric.similarity : null;

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 card-hover cursor-pointer">
      {/* Image */}
      <div className="relative aspect-square bg-gray-100">
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

      {/* Info */}
      <div className="p-4">
        <div className="text-[15px] font-bold">{fabric.name}</div>
        <div className="text-xs text-gray-400 mb-2.5">Color: {fabric.color_code}</div>
        <div className="flex gap-1.5 flex-wrap">
          {fabric.fabric_type && (
            <span className="text-[10px] font-semibold text-[#8B6914] bg-[linear-gradient(135deg,rgba(139,105,20,0.08),rgba(196,154,108,0.08))] px-2.5 py-1 rounded-md">
              {fabric.fabric_type}
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
      </div>
    </div>
  );
}
