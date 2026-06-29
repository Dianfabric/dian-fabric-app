"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import FabricCard from "@/components/FabricCard";
import ImageLightbox from "@/components/ImageLightbox";
import type { Fabric } from "@/lib/types";

const FABRICS_STATE_KEY = "dian-fabrics-state";

const FABRIC_TYPES = [
  "패브릭", "벨벳", "린넨", "면", "울", "스웨이드", "인조가죽", "시어", "커튼", "아웃도어",
];

const PATTERN_DETAILS = [
  "무지", "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "기하학", "자연", "동물", "식물", "큰패턴", "다마스크",
];

const USAGE_TYPES = ["소파", "커튼", "침대헤드", "월커버링", "쿠션", "스툴"];

// DB(Gemini 분류) 15색 체계와 일치 — notes 색상명으로 필터됨
const COLOR_SWATCHES: { label: string; value: string; hex: string }[] = [
  { label: "아이보리", value: "아이보리", hex: "#ECE6D8" },
  { label: "베이지", value: "베이지", hex: "#D4B896" },
  { label: "브라운", value: "브라운", hex: "#8B5A2B" },
  { label: "그레이", value: "그레이", hex: "#9A9A95" },
  { label: "차콜", value: "차콜", hex: "#3C3F46" },
  { label: "블랙", value: "블랙", hex: "#1E1E20" },
  { label: "네이비", value: "네이비", hex: "#2B3A55" },
  { label: "블루", value: "블루", hex: "#3A6FB0" },
  { label: "그린", value: "그린", hex: "#4E7A4E" },
  { label: "레드", value: "레드", hex: "#B0413E" },
  { label: "핑크", value: "핑크", hex: "#D98BA6" },
  { label: "옐로우", value: "옐로우", hex: "#D9B43C" },
  { label: "오렌지", value: "오렌지", hex: "#D08440" },
  { label: "퍼플", value: "퍼플", hex: "#7E5A9B" },
  { label: "민트", value: "민트", hex: "#7FBFA8" },
];

const SORT_OPTIONS = [
  { label: "신상품순", value: "newest" },
  { label: "이름순", value: "name" },
  { label: "가격 높은순", value: "price_high" },
  { label: "가격 낮은순", value: "price_low" },
];

function getRestoredState() {
  try {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem(FABRICS_STATE_KEY) : null;
    if (saved) return JSON.parse(saved);
  } catch {}
  return null;
}

export default function FabricsPage() {
  const restored = useRef(getRestoredState());
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(restored.current?.page || 1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedType, setSelectedType] = useState(restored.current?.selectedType || "");
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(
    restored.current?.selectedPatterns ??
    (restored.current?.selectedSubType ? [restored.current.selectedSubType] : [])
  );
  const [selectedUsage, setSelectedUsage] = useState(restored.current?.selectedUsage || "");
  const [selectedColors, setSelectedColors] = useState<string[]>(restored.current?.selectedColors || []);
  const [wideOnly, setWideOnly] = useState<boolean>(restored.current?.wideOnly || false);
  const [sortBy, setSortBy] = useState<string>(restored.current?.sortBy || "newest");
  const [goToPage, setGoToPage] = useState("");
  const [searchQuery, setSearchQuery] = useState(restored.current?.searchQuery || "");
  const [searchInput, setSearchInput] = useState(restored.current?.searchQuery || "");
  const [lightbox, setLightbox] = useState<{
    images: { src: string; name: string; colorCode?: string; patternDetail?: string; fabricType?: string; price?: number }[];
    index: number;
  } | null>(null);
  const [mode, setMode] = useState<"design" | "individual">("design");
  const [colorway, setColorway] = useState<{
    name: string;
    loading: boolean;
    items: { id: string; color_code: string; image_url: string | null; price_per_yard: number | null }[];
  } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(FABRICS_STATE_KEY, JSON.stringify({
        page, selectedType, selectedPatterns, selectedUsage, selectedColors, searchQuery, wideOnly, sortBy,
      }));
    } catch {}
  }, [page, selectedType, selectedPatterns, selectedUsage, selectedColors, searchQuery, wideOnly, sortBy]);

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

  // 대표모드: 디자인 카드 클릭 → 컬러웨이 모달
  const openColorway = useCallback(async (fabric: Fabric) => {
    setColorway({ name: fabric.name, loading: true, items: [] });
    try {
      const res = await fetch(`/api/fabrics/${fabric.id}`);
      const data = await res.json();
      const rep = { id: fabric.id, color_code: data.color_code, image_url: data.image_url, price_per_yard: data.price_per_yard };
      setColorway({ name: fabric.name, loading: false, items: [rep, ...(data.colorVariants || [])] });
    } catch {
      setColorway({ name: fabric.name, loading: false, items: [] });
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setColorway(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    fetchFabrics();
  }, [page, selectedType, selectedPatterns, selectedUsage, selectedColors, searchQuery, wideOnly, sortBy]);

  const fetchFabrics = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (selectedType) params.set("type", selectedType);
    if (selectedPatterns.length === 1) params.set("subtype", selectedPatterns[0]);
    else if (selectedPatterns.length > 1) params.set("subtype", selectedPatterns.join(","));
    if (selectedUsage) params.set("usage", selectedUsage);
    if (selectedColors.length > 0) params.set("color", selectedColors.join(","));
    if (searchQuery) params.set("search", searchQuery);
    if (wideOnly) params.set("wide", "1");
    if (sortBy) params.set("sort", sortBy);

    try {
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setFabrics(data.fabrics || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      setMode(data.mode === "individual" ? "individual" : "design");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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

  const togglePattern = useCallback((p: string) => {
    setSelectedPatterns(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
    setPage(1);
  }, []);

  const toggleColor = useCallback((c: string) => {
    setSelectedColors(prev =>
      prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
    );
    setPage(1);
  }, []);

  const getPageNumbers = (): (number | "...")[] => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 10) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      let start = Math.max(2, page - 3);
      let end = Math.min(totalPages - 1, page + 3);
      if (page <= 4) end = Math.min(totalPages - 1, 8);
      if (page >= totalPages - 3) start = Math.max(2, totalPages - 7);
      if (start > 2) pages.push("...");
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  const hasActiveFilters = selectedType || selectedPatterns.length > 0 || selectedUsage || selectedColors.length > 0 || wideOnly || searchQuery;

  const clearAllFilters = useCallback(() => {
    setSelectedType("");
    setSelectedPatterns([]);
    setSelectedUsage("");
    setSelectedColors([]);
    setWideOnly(false);
    setSearchQuery("");
    setSearchInput("");
    setSortBy("newest");
    setPage(1);
  }, []);

  return (
    <div>
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={Math.max(0, lightbox.index)}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* 컬러웨이 모달 (대표모드 카드 클릭) */}
      {colorway && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={() => setColorway(null)}>
          <div className="bg-white rounded-[6px] max-w-[860px] w-full max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[18px] font-semibold" style={{ color: "var(--navy)" }}>
                {colorway.name}
                {!colorway.loading && (
                  <span className="text-[13px] font-normal ml-2" style={{ color: "var(--muted)" }}>· 컬러 {colorway.items.length}개</span>
                )}
              </h3>
              <button onClick={() => setColorway(null)} className="text-[26px] leading-none" style={{ color: "var(--muted)" }}>&times;</button>
            </div>
            {colorway.loading ? (
              <div className="py-16 text-center text-[14px]" style={{ color: "var(--muted)" }}>불러오는 중…</div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {colorway.items.map((v) => (
                  <Link key={v.id} href={`/fabric/${v.id}`} className="block group">
                    <div className="relative aspect-square rounded-[3px] overflow-hidden" style={{ background: "var(--soft)", border: "1px solid var(--line)" }}>
                      {v.image_url && (
                        <Image src={v.image_url} alt={v.color_code} fill className="object-cover group-hover:scale-105 transition-transform" sizes="20vw" />
                      )}
                    </div>
                    <div className="text-[11px] mt-1 text-center" style={{ color: "var(--muted)" }}>{v.color_code}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-8 pt-9 sm:pt-14 pb-[30px] text-center">
        <div
          className="text-[11px] tracking-[.34em] uppercase font-medium"
          style={{ color: "var(--muted)" }}
        >
          Dian Textile Collection
        </div>
        <h1
          className="font-light text-[30px] sm:text-[44px] mt-[14px] mb-3 tracking-[.04em]"
          style={{ color: "var(--navy)" }}
        >
          원단 컬렉션
        </h1>
        <p className="text-[15px] tracking-[.02em]" style={{ color: "var(--muted)" }}>
          인테리어 디자이너를 위한 프리미엄 원단 컬렉션
        </p>

        {/* Search + AI button */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
          <div
            className="flex items-center gap-[10px] h-12 px-4 w-full sm:w-[400px] rounded-[3px]"
            style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
          >
            <span style={{ color: "var(--muted)" }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="디자인명 또는 컬러번호 검색 (예: HALO, 헤르메스 601)"
              className="flex-1 border-none outline-none bg-transparent text-[14px]"
              style={{ fontFamily: "inherit", color: "var(--ink)" }}
            />
            {searchInput && (
              <button onClick={handleClearSearch} className="p-1" style={{ color: "var(--muted)" }}>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Link
            href="/search"
            className="flex items-center justify-center gap-2 h-12 px-[22px] rounded-[3px] text-[14px] tracking-[.03em] text-white transition-opacity hover:opacity-[.88] shrink-0"
            style={{ background: "var(--navy)" }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 3v18" />
            </svg>
            AI 대체 원단찾기
          </Link>
        </div>

        {/* Search result indicator */}
        {searchQuery && (
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className="text-[13px]" style={{ color: "var(--muted)" }}>
              &ldquo;{searchQuery}&rdquo; 검색 결과: {total}개
            </span>
            <button
              onClick={handleClearSearch}
              className="text-[12px] font-semibold hover:underline"
              style={{ color: "var(--navy)" }}
            >
              검색 초기화
            </button>
          </div>
        )}
      </section>

      {/* Toolbar */}
      <div
        className="max-w-[1320px] mx-auto px-4 sm:px-8 py-5 flex justify-between items-baseline gap-3"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-[13px] tracking-[.03em]" style={{ color: "var(--muted)" }}>
            전체 {total.toLocaleString()}{mode === "design" ? "개 디자인" : "개 컬러웨이"}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-[12px] font-medium hover:underline"
              style={{ color: "var(--navy)" }}
            >
              필터 초기화
            </button>
          )}
        </div>
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
          className="border-none bg-transparent text-[13px] cursor-pointer"
          style={{ fontFamily: "inherit", color: "var(--navy)" }}
        >
          {SORT_OPTIONS.map(s => (
            <option key={s.value} value={s.value}>정렬 — {s.label}</option>
          ))}
        </select>
      </div>

      {/* Main: Sidebar + Grid */}
      <div className="max-w-[1320px] mx-auto px-4 md:px-8 py-[30px] pb-20 grid gap-8 lg:gap-[46px] grid-cols-1 lg:grid-cols-[206px_1fr]">
        {/* Sidebar */}
        <aside>
          {/* 종류 */}
          <FilterGroup title="종류">
            {FABRIC_TYPES.map(t => (
              <FilterRow
                key={t}
                label={t}
                active={selectedType === t}
                onClick={() => { setSelectedType(selectedType === t ? "" : t); setPage(1); }}
              />
            ))}
          </FilterGroup>

          {/* 패턴 (multi-select) */}
          <FilterGroup title="패턴">
            {PATTERN_DETAILS.map(p => (
              <FilterRow
                key={p}
                label={p}
                active={selectedPatterns.includes(p)}
                onClick={() => togglePattern(p)}
              />
            ))}
          </FilterGroup>

          {/* 색상 */}
          <FilterGroup title="색상">
            <div className="flex flex-wrap gap-[9px]">
              {COLOR_SWATCHES.map(c => (
                <button
                  key={c.value}
                  title={c.label}
                  onClick={() => toggleColor(c.value)}
                  className="w-[22px] h-[22px] rounded-full transition-transform hover:scale-[1.12]"
                  style={{
                    background: c.hex,
                    border: selectedColors.includes(c.value)
                      ? "2px solid var(--navy)"
                      : "1px solid rgba(0,0,0,.07)",
                    transform: selectedColors.includes(c.value) ? "scale(1.15)" : undefined,
                  }}
                />
              ))}
            </div>
            {selectedColors.length > 0 && (
              <div className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
                {selectedColors.join(", ")}
              </div>
            )}
          </FilterGroup>

          {/* 용도 */}
          <FilterGroup title="용도">
            {USAGE_TYPES.map(u => (
              <FilterRow
                key={u}
                label={u}
                active={selectedUsage === u}
                onClick={() => { setSelectedUsage(selectedUsage === u ? "" : u); setPage(1); }}
              />
            ))}
          </FilterGroup>

          {/* 폭 */}
          <FilterGroup title="폭">
            <FilterRow
              label="대폭 (200cm 이상)"
              active={wideOnly}
              onClick={() => { setWideOnly(!wideOnly); setPage(1); }}
            />
          </FilterGroup>
        </aside>

        {/* Grid + Pagination */}
        <main>
          {loading ? (
            <div className="grid gap-[28px_22px] grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i}>
                  <div
                    className="aspect-square rounded-[3px] animate-pulse"
                    style={{ background: "var(--soft)", border: "1px solid var(--line)" }}
                  />
                  <div className="pt-3 space-y-2">
                    <div className="h-4 rounded animate-pulse w-2/3" style={{ background: "var(--soft)" }} />
                    <div className="h-3 rounded animate-pulse w-1/3" style={{ background: "var(--soft)" }} />
                    <div className="h-3 rounded animate-pulse w-1/2" style={{ background: "var(--soft)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : fabrics.length > 0 ? (
            <div className="grid gap-[28px_22px] grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {fabrics.map((fabric, idx) => (
                <FabricCard
                  key={fabric.id}
                  fabric={fabric}
                  colorCount={mode === "design" ? (fabric as Fabric & { color_count?: number }).color_count : undefined}
                  onImageClick={() => (mode === "design" ? openColorway(fabric) : openLightbox(idx))}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20" style={{ color: "var(--muted)" }}>
              해당 조건의 원단이 없습니다
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col items-center gap-4 mt-[46px]">
              <div className="flex justify-center gap-[6px]">
                {/* Prev */}
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="min-w-[34px] h-[34px] flex items-center justify-center text-[13px] rounded-[3px] cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: "var(--navy2)", border: "1px solid var(--line)" }}
                >
                  ←
                </button>

                {getPageNumbers().map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`dot-${i}`}
                      className="min-w-[34px] h-[34px] flex items-center justify-center text-[13px]"
                      style={{ color: "var(--navy2)" }}
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className="min-w-[34px] h-[34px] flex items-center justify-center text-[13px] rounded-[3px] cursor-pointer transition-all"
                      style={
                        page === p
                          ? { background: "var(--navy)", color: "#fff", border: "1px solid var(--navy)" }
                          : { color: "var(--navy2)", border: "1px solid var(--line)" }
                      }
                      onMouseEnter={(e) => {
                        if (page !== p) {
                          e.currentTarget.style.borderColor = "var(--navy)";
                          e.currentTarget.style.color = "var(--navy)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (page !== p) {
                          e.currentTarget.style.borderColor = "var(--line)";
                          e.currentTarget.style.color = "var(--navy2)";
                        }
                      }}
                    >
                      {p}
                    </button>
                  )
                )}

                {/* Next */}
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="min-w-[34px] h-[34px] flex items-center justify-center text-[13px] rounded-[3px] cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ color: "var(--navy2)", border: "1px solid var(--line)" }}
                >
                  →
                </button>
              </div>

              {/* Page jump */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={goToPage}
                  onChange={(e) => setGoToPage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGoToPage()}
                  placeholder={`${page}`}
                  className="w-16 h-[34px] rounded-[3px] text-center text-[13px] outline-none"
                  style={{ border: "1px solid var(--line)", fontFamily: "inherit" }}
                />
                <button
                  onClick={handleGoToPage}
                  className="px-4 h-[34px] rounded-[3px] text-[13px] font-medium transition-colors"
                  style={{ color: "var(--navy2)", border: "1px solid var(--line)" }}
                >
                  페이지로 이동
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <div
        className="text-[11px] tracking-[.16em] uppercase font-semibold pb-[10px] mb-[13px]"
        style={{ color: "var(--navy)", borderBottom: "1px solid var(--line)" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function FilterRow({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <div
      className="flex justify-between items-center text-[14px] py-[6px] cursor-pointer transition-colors"
      style={{ color: active ? "var(--navy)" : "var(--navy2)", fontWeight: active ? 600 : 400 }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--navy)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "var(--navy2)"; }}
    >
      <span>{label}</span>
      {count != null && (
        <span className="text-[11px]" style={{ color: "#BCBCB9" }}>{count.toLocaleString()}</span>
      )}
    </div>
  );
}
