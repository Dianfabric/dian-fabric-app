"use client";
import { useState, useCallback } from "react";
import FabricCard from "@/components/FabricCard";
import type { SearchResult } from "@/lib/types";

interface SearchGroup {
  id: string;
  type: "image" | "text";
  label: string;
  preview?: string;
  results: SearchResult[];
  loading: boolean;
  error?: string;
}

export default function SearchPage() {
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
  const [textQuery, setTextQuery] = useState("");
  const [isTextSearching, setIsTextSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const searchWithEmbedding = async (embedding: number[]): Promise<SearchResult[]> => {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding,
        matchThreshold: 1.5,
        matchCount: 10,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "검색 실패");
    return data.results || [];
  };

  const handleImageSearch = useCallback(async (file: File, groupId: string) => {
    try {
      const { getClipEmbedding } = await import("@/lib/clip-client");
      const embedding = await getClipEmbedding(file, (status) => {
        if (status.status === "loading") setStatusMessage(status.message);
      });
      const results = await searchWithEmbedding(embedding);
      setSearchGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, results, loading: false } : g
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "검색 실패";
      setSearchGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, error: msg, loading: false } : g
        )
      );
    }
    setStatusMessage("");
  }, []);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (imageFiles.length === 0) return;

      const newGroups: SearchGroup[] = imageFiles.map((file) => ({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type: "image" as const,
        label: file.name,
        preview: URL.createObjectURL(file),
        results: [],
        loading: true,
      }));

      setSearchGroups((prev) => [...prev, ...newGroups]);

      // 각 이미지 병렬 검색
      newGroups.forEach((group, i) => {
        handleImageSearch(imageFiles[i], group.id);
      });
    },
    [handleImageSearch]
  );

  const handleTextSearch = useCallback(async () => {
    if (!textQuery.trim()) return;
    setIsTextSearching(true);

    const groupId = `txt-${Date.now()}`;
    const newGroup: SearchGroup = {
      id: groupId,
      type: "text",
      label: textQuery.trim(),
      results: [],
      loading: true,
    };
    setSearchGroups((prev) => [...prev, newGroup]);
    setTextQuery("");

    try {
      setStatusMessage("텍스트 AI 모델 준비 중...");
      const { getClipTextEmbedding } = await import("@/lib/clip-client");
      const embedding = await getClipTextEmbedding(newGroup.label, (status) => {
        if (status.status === "loading") setStatusMessage(status.message);
      });

      setStatusMessage("유사 원단 검색 중...");
      const results = await searchWithEmbedding(embedding);

      setSearchGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, results, loading: false } : g
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "검색 실패";
      setSearchGroups((prev) =>
        prev.map((g) =>
          g.id === groupId ? { ...g, error: msg, loading: false } : g
        )
      );
    }
    setStatusMessage("");
    setIsTextSearching(false);
  }, [textQuery]);

  const removeGroup = useCallback((id: string) => {
    setSearchGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const hasResults = searchGroups.length > 0;

  return (
    <div className="pt-24 pb-20 px-6">
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight mb-3">
            <span className="text-gradient">AI</span> 원단 검색
          </h1>
          <p className="text-gray-400 text-[15px]">
            이미지를 업로드하거나 텍스트로 검색하세요
          </p>
        </div>

        {/* 검색 입력 영역 */}
        <div className="max-w-[680px] mx-auto mb-12 space-y-4">
          {/* 텍스트 검색 */}
          <div className="flex gap-3">
            <input
              type="text"
              value={textQuery}
              onChange={(e) => setTextQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTextSearch()}
              placeholder="예: 노란색 하운드투스 패턴, 파란 벨벳 무지..."
              disabled={isTextSearching}
              className="flex-1 h-12 px-5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C49A6C] transition-colors"
            />
            <button
              onClick={handleTextSearch}
              disabled={!textQuery.trim() || isTextSearching}
              className="px-6 h-12 rounded-2xl bg-gradient-gold text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg transition-all"
            >
              검색
            </button>
          </div>

          {/* 이미지 업로드 (드래그앤드롭 + 클릭) */}
          <label
            className={`block bg-white rounded-3xl p-8 text-center border-2 border-dashed cursor-pointer upload-hover ${
              dragActive
                ? "border-[#C49A6C] bg-[#FFFDF9]"
                : "border-gray-200"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="w-14 h-14 bg-[linear-gradient(135deg,rgba(139,105,20,0.1),rgba(196,154,108,0.15))] rounded-[16px] flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6 text-[#8B6914]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-1">
              이미지를 드래그하거나 클릭하여 업로드
            </h3>
            <p className="text-sm text-gray-400 mb-3">
              여러 장을 한번에 업로드할 수 있습니다
            </p>
            <div className="flex gap-2 justify-center">
              {["JPG", "PNG", "WEBP", "여러 장 가능"].map((f) => (
                <span
                  key={f}
                  className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-lg"
                >
                  {f}
                </span>
              ))}
            </div>
          </label>

          {/* 상태 메시지 */}
          {statusMessage && (
            <div className="flex items-center justify-center gap-2 text-[#8B6914] text-sm font-semibold">
              <svg
                className="w-5 h-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {statusMessage}
            </div>
          )}
        </div>

        {/* 검색 결과들 */}
        {hasResults && (
          <div className="space-y-12">
            {searchGroups.map((group) => (
              <div key={group.id}>
                {/* 그룹 헤더 */}
                <div className="flex items-center gap-4 mb-5">
                  {group.type === "image" && group.preview && (
                    <img
                      src={group.preview}
                      alt={group.label}
                      className="w-16 h-16 rounded-xl object-cover border border-gray-100"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white bg-[#8B6914] px-2 py-0.5 rounded">
                        {group.type === "image" ? "이미지" : "텍스트"}
                      </span>
                      <h2 className="text-lg font-extrabold">{group.label}</h2>
                    </div>
                    {!group.loading && !group.error && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        {group.results.length}개 유사 원단 발견
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeGroup(group.id)}
                    className="text-gray-400 hover:text-gray-600 p-2"
                    title="결과 제거"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* 결과 그리드 */}
                {group.loading ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {Array.from({ length: 5 }).map((_, i) => (
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
                ) : group.error ? (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {group.error}
                  </div>
                ) : group.results.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {group.results.map((fabric) => (
                      <FabricCard
                        key={fabric.id}
                        fabric={fabric}
                        showSimilarity
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-10 text-gray-400">
                    검색 결과가 없습니다
                  </div>
                )}

                <hr className="mt-8 border-gray-100" />
              </div>
            ))}
          </div>
        )}

        {/* 초기 안내 */}
        {!hasResults && (
          <div className="text-center py-10 text-gray-400 text-sm">
            이미지를 업로드하거나 텍스트로 원단을 검색해보세요
          </div>
        )}
      </div>
    </div>
  );
}
