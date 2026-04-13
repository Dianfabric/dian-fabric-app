"use client";
import { useState, useEffect, useCallback } from "react";
import FabricCard from "@/components/FabricCard";
import ImageLightbox from "@/components/ImageLightbox";
import type { Fabric } from "@/lib/types";

const FABRIC_TYPES = [
  "전체", "무지", "벨벳", "스웨이드", "인조가죽", "린넨", "면", "울", "자카드", "시어",
];

const PATTERN_DETAILS = [
  "전체", "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴",
];

const USAGE_TYPES = ["전체", "소파", "쿠션", "커튼", "침대헤드", "스툴", "벽패널"];

const COLOR_FILTERS: { label: string; value: string; bg: string; ring: string }[] = [
  { label: "전체", value: "", bg: "bg-gradient-to-br from-gray-200 to-gray-300", ring: "ring-gray-400" },
  { label: "아이보리", value: "아이보리", bg: "bg-[#FFFFF0] border border-gray-200", ring: "ring-yellow-300" },
  { label: "베이지", value: "베이지", bg: "bg-[#D4B896]", ring: "ring-[#C49A6C]" },
  { label: "브라운", value: "브라운", bg: "bg-[#8B4513]", ring: "ring-[#6B3410]" },
  { label: "그레이", value: "그레이", bg: "bg-gray-400", ring: "ring-gray-500" },
  { label: "블랙", value: "블랙", bg: "bg-gray-900", ring: "ring-black" },
  { label: "네이비", value: "네이비", bg: "bg-[#1B2A4A]", ring: "ring-[#1B2A4A]" },
  { label: "블루", value: "블루", bg: "bg-blue-500", ring: "ring-blue-600" },
  { label: "그린", value: "그린", bg: "bg-green-600", ring: "ring-green-700" },
  { label: "레드", value: "레드", bg: "bg-red-500", ring: "ring-red-600" },
  { label: "핑크", value: "핑크", bg: "bg-pink-400", ring: "ring-pink-500" },
  { label: "옐로우", value: "옐로우", bg: "bg-yellow-400", ring: "ring-yellow-500" },
  { label: "오렌지", value: "오렌지", bg: "bg-orange-400", ring: "ring-orange-500" },
  { label: "퍼플", value: "퍼플", bg: "bg-purple-500", ring: "ring-purple-600" },
  { label: "민트", value: "민트", bg: "bg-teal-400", ring: "ring-teal-500" },
];

export default function FabricsPage() {
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedType, setSelectedType] = useState("전체");
  const [selectedSubType, setSelectedSubType] = useState("");
  const [selectedUsage, setSelectedUsage] = useState("전체");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [goToPage, setGoToPage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [lightbox, setLightbox] = useState<{
    images: { src: string; name: string; colorCode?: string; patternDetail?: string; fabricType?: string; price?: number }[];
    index: number;
  } | null>(null);

  const openLightbox = useCallback((fabricIdx: number) => {
    const images = fabrics.map((f) => ({
      src: f.image_url || "",
      name: f.name,
      colorCode: f.color_code,
      patternDetail: f.pattern_detail || undefined,
      fabricType: f.fabric_type || undefined,
      price: f.price_per_yard || undefined,
    }));
    setLightbox({ images, index: fabricIdx });
  }, [fabrics]);

  useEffect(() => {
    fetchFabrics();
  }, [page, selectedType, selectedSubType, selectedUsage, selectedColors, searchQuery]);

  const fetchFabrics = async () => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });
    if (selectedType !== "전체") {
      params.set("type", selectedType);
    }
    if (selectedSubType) {
      params.set("subtype", selectedSubType);
    }
    if (selectedUsage !== "전체") params.set("usage", selectedUsage);
    if (selectedColors.length > 0) params.set("color", selectedColors.join(","));
    if (searchQuery) params.set("search", searchQuery);

    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setFabrics(data.fabrics || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleTypeClick = useCallback((type: string) => {
    setSelectedType(type);
    setSelectedSubType("");
    setPage(1);
  }, []);

  const handleSubTypeClick = useCallback((sub: string) => {
    setSelectedSubType((prev) => (prev === sub ? "" : sub));
    setPage(1);
  }, []);

  const handleSearch = useCallback(() => {
    setSearchQuery(searchInput.trim());
    setPage(1);
  }, [searchInput]);

  const handleClearSearch = useCallback(() => {
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
  }, []);

  const handleGoToPage = useCallback(() => {
    const num = parseInt(goToPage);
    if (num >= 1 && num <= totalPages) {
      setPage(num);
      setGoToPage("");
    }
  }, [goToPage, totalPages]);

  // 페이지 번호 목록 생성
  const getPageNumbers = (): (number | "...")[] => {
    const pages: (number | "...")[] = [];
    const maxVisible = 10;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      // 항상 1페이지
      pages.push(1);

      let start = Math.max(2, page - 3);
      let end = Math.min(totalPages - 1, page + 3);

      // 시작 쪽 여유가 부족하면 끝을 늘림
      if (page <= 4) {
        end = Math.min(totalPages - 1, 8);
      }
      // 끝 쪽 여유가 부족하면 시작을 당김
      if (page >= totalPages - 3) {
        start = Math.max(2, totalPages - 7);
      }

      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push("...");

      // 항상 마지막 페이지
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="pt-24 pb-20 px-6">
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={Math.max(0, lightbox.index)}
          onClose={() => setLightbox(null)}
        />
      )}
      <div className="max-w-[1200px] mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight mb-3">
            원단 <span className="text-gradient">컬렉션</span>
          </h1>
          <p className="text-gray-400 text-[15px]">
            {total}개의 프리미엄 원단을 둘러보세요
          </p>
        </div>

        {/* 검색 */}
        <div className="mb-6">
          <div className="flex gap-3 max-w-[600px] mx-auto">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="원단명 또는 컬러번호 검색 (예: ALPINE, PS3086, 2119)"
                className="w-full h-12 pl-11 pr-10 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-[#C49A6C] transition-colors"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              {searchInput && (
                <button
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={!searchInput.trim()}
              className="px-6 h-12 rounded-2xl bg-gradient-gold text-white text-sm font-semibold disabled:opacity-50 hover:shadow-lg transition-all"
            >
              검색
            </button>
          </div>
          {searchQuery && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <span className="text-sm text-gray-500">
                &quot;{searchQuery}&quot; 검색 결과: {total}개
              </span>
              <button
                onClick={handleClearSearch}
                className="text-xs text-[#8B6914] font-semibold hover:underline"
              >
                검색 초기화
              </button>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl p-5 mb-8 shadow-sm border border-gray-100">
          {/* 원단 종류 (메인) */}
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-500 mb-2">원단 종류</p>
            <div className="flex gap-2 flex-wrap">
              {FABRIC_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => handleTypeClick(t)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    selectedType === t
                      ? "bg-gradient-gold text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 패턴 상세 (항상 표시) */}
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-500 mb-2">패턴 상세</p>
            <div className="flex gap-2 flex-wrap">
              {PATTERN_DETAILS.map((sub) => (
                <button
                  key={sub}
                  onClick={() => {
                    if (sub === "전체") {
                      setSelectedSubType("");
                    } else if (selectedSubType === sub) {
                      setSelectedSubType("");
                    } else {
                      setSelectedSubType(sub);
                    }
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    (sub === "전체" && !selectedSubType) || selectedSubType === sub
                      ? "bg-[#8B6914] text-white"
                      : "bg-[rgba(139,105,20,0.08)] text-[#8B6914] hover:bg-[rgba(139,105,20,0.15)]"
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>

          {/* 사용처 */}
          <div className="mb-4">
            <p className="text-xs font-bold text-gray-500 mb-2">사용처</p>
            <div className="flex gap-2 flex-wrap">
              {USAGE_TYPES.map((u) => (
                <button
                  key={u}
                  onClick={() => {
                    setSelectedUsage(u);
                    setPage(1);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                    selectedUsage === u
                      ? "bg-gradient-gold text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* 색상 */}
          <div>
            <p className="text-xs font-bold text-gray-500 mb-2">색상</p>
            <div className="flex gap-2 flex-wrap">
              {COLOR_FILTERS.map((c) => (
                <button
                  key={c.value || "all"}
                  onClick={() => {
                    if (!c.value) {
                      setSelectedColors([]);
                    } else {
                      setSelectedColors((prev) =>
                        prev.includes(c.value)
                          ? prev.filter((v) => v !== c.value)
                          : [...prev, c.value]
                      );
                    }
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    (!c.value && selectedColors.length === 0) || selectedColors.includes(c.value)
                      ? "ring-2 " + c.ring + " bg-white shadow-sm"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full inline-block ${c.bg}`}
                  />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array.from({ length: 20 }).map((_, i) => (
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
        ) : fabrics.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {fabrics.map((fabric, idx) => (
              <FabricCard
                key={fabric.id}
                fabric={fabric}
                onImageClick={() => openLightbox(idx)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            해당 조건의 원단이 없습니다
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col items-center gap-4 mt-10">
            {/* 페이지 번호 */}
            <div className="flex items-center gap-1 flex-wrap justify-center">
              {/* 이전 */}
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                ←
              </button>

              {/* 번호들 */}
              {getPageNumbers().map((p, i) =>
                p === "..." ? (
                  <span
                    key={`dot-${i}`}
                    className="px-2 py-2 text-sm text-gray-400"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                      page === p
                        ? "bg-gradient-gold text-white"
                        : "text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              {/* 다음 */}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                →
              </button>
            </div>

            {/* 페이지 이동 입력 */}
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={goToPage}
                onChange={(e) => setGoToPage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleGoToPage()}
                placeholder={`${page}`}
                className="w-16 h-9 rounded-lg border border-gray-200 text-center text-sm focus:outline-none focus:border-[#C49A6C]"
              />
              <button
                onClick={handleGoToPage}
                className="px-4 h-9 rounded-lg bg-gray-100 text-sm font-semibold text-gray-600 hover:bg-gray-200 transition-all"
              >
                페이지로 이동
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
