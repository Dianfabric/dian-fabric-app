"use client";
import { useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import FabricCard from "@/components/FabricCard";
import type { SearchResult } from "@/lib/types";

export default function SearchPage() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalFabrics, setTotalFabrics] = useState(0);
  const [searched, setSearched] = useState(false);

  const handleUpload = async (file: File) => {
    setIsLoading(true);
    setSearched(true);
    try {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/search", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.results) {
        setResults(data.results);
        setTotalFabrics(data.total);
      }
    } catch (err) {
      console.error("검색 오류:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight mb-3">
            <span className="text-gradient">AI</span> 원단 검색
          </h1>
          <p className="text-gray-400 text-[15px]">
            이미지를 업로드하면 가장 유사한 원단을 찾아드립니다
          </p>
        </div>

        {/* Upload */}
        <div className="max-w-[680px] mx-auto mb-12">
          <ImageUploader onUpload={handleUpload} isLoading={isLoading} />
        </div>

        {/* Results */}
        {searched && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-extrabold">
                {isLoading ? "검색 중..." : "검색 결과"}
              </h2>
              {!isLoading && results.length > 0 && (
                <span className="bg-[linear-gradient(135deg,rgba(139,105,20,0.1),rgba(196,154,108,0.1))] text-[#8B6914] text-xs font-bold px-3.5 py-1.5 rounded-lg">
                  Top {results.length} / {totalFabrics}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                    <div className="aspect-square bg-gray-100 animate-pulse" />
                    <div className="p-4 space-y-2">
                      <div className="h-4 bg-gray-100 rounded animate-pulse w-2/3" />
                      <div className="h-3 bg-gray-100 rounded animate-pulse w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {results.map((fabric) => (
                  <FabricCard
                    key={fabric.id}
                    fabric={fabric}
                    showSimilarity
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-gray-400">
                <p className="text-lg">검색 결과가 없습니다</p>
                <p className="text-sm mt-2">다른 이미지로 시도해보세요</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
