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
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const handleUpload = async (file: File) => {
    setIsLoading(true);
    setSearched(true);
    setResults([]);
    setErrorMessage("");

    try {
      // Step 1: 브라우저에서 CLIP 임베딩 생성
      setStatusMessage("AI 모델 준비 중...");

      const { getClipEmbedding } = await import("@/lib/clip-client");

      const embedding = await getClipEmbedding(file, (status) => {
        if (status.status === "loading") {
          setStatusMessage(status.message);
        } else if (status.status === "error") {
          setErrorMessage(status.message);
        }
      });

      setStatusMessage("유사 원단 검색 중...");

      // Step 2: 임베딩 벡터를 서버로 전송 → pgvector 검색
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embedding,
          matchThreshold: 1.5,
          matchCount: 20,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "검색 실패");
      }

      if (data.results) {
        setResults(data.results);
        setTotalFabrics(data.total);
      }

      setStatusMessage("");
    } catch (err) {
      console.error("검색 오류:", err);
      const msg =
        err instanceof Error ? err.message : "검색 중 오류가 발생했습니다";
      setErrorMessage(msg);
      setStatusMessage("");
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
          <ImageUploader
            onUpload={handleUpload}
            isLoading={isLoading}
            statusMessage={statusMessage}
          />

          {/* 에러 메시지 표시 */}
          {errorMessage && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <p className="font-semibold mb-1">오류 발생</p>
              <p>{errorMessage}</p>
            </div>
          )}
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
                  <div
                    key={i}
                    className="bg-white rounded-2xl overflow-hidden border border-gray-100"
                  >
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
            ) : !errorMessage ? (
              <div className="text-center py-20 text-gray-400">
                <p className="text-lg">검색 결과가 없습니다</p>
                <p className="text-sm mt-2">다른 이미지로 시도해보세요</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
