"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import ImageLightbox from "@/components/ImageLightbox";
import ImageCropSelector, { type CroppedRegion } from "@/components/ImageCropSelector";
import SearchComparisonView, { type GeminiInfo } from "@/components/SearchComparisonView";
import { mmrRerank, fabricNameSim } from "@/lib/mmr";
import type { SearchResult } from "@/lib/types";

const FETCH_COUNT = 100;    // Soft Scoring 후보 수
const RANK_TOP = 50;        // Gemini Flash 랭킹 대상
const VISIBLE_COUNT = 15;   // 최종 표시 수
const SKIP_LLM_THRESHOLD = 0.92; // 고확신 시 LLM 스킵
const CACHE_KEY = "dian-search-v3-cache";

interface SearchGroup {
  id: string;
  type: "image" | "text";
  label: string;
  preview?: string;
  results: SearchResult[];
  activeIndex: number;
  geminiInfo?: GeminiInfo;
  loading: boolean;
  error?: string;
  skippedLLM?: boolean;
}

function loadCachedGroups(): SearchGroup[] {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return [];
    const groups = JSON.parse(cached) as SearchGroup[];
    return groups.map((g) => ({ ...g, loading: false }));
  } catch {
    return [];
  }
}

export default function SearchV3Page() {
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>(() => {
    if (typeof window !== "undefined") return loadCachedGroups();
    return [];
  });
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    const toCache = searchGroups.filter((g) => !g.loading && !g.error && g.results.length > 0);
    if (toCache.length > 0) {
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(toCache)); } catch {}
    } else {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }, [searchGroups]);

  const [statusMessage, setStatusMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: { src: string; name: string; colorCode?: string; similarity?: number; patternDetail?: string; fabricType?: string; price?: number }[];
    index: number;
  } | null>(null);
  const [cropModal, setCropModal] = useState<{ imageUrl: string; file: File } | null>(null);

  const openLightbox = useCallback((group: SearchGroup, fabricIndex: number) => {
    const images: { src: string; name: string; colorCode?: string; similarity?: number; patternDetail?: string; fabricType?: string; price?: number }[] = [];
    if (group.preview) images.push({ src: group.preview, name: "업로드 원본" });
    group.results.forEach((fabric) => {
      images.push({
        src: fabric.image_url || "",
        name: fabric.name,
        colorCode: fabric.color_code,
        similarity: fabric.similarity,
        patternDetail: fabric.pattern_detail || undefined,
        fabricType: fabric.fabric_type || undefined,
        price: fabric.price_per_yard || undefined,
      });
    });
    const actualIndex = group.preview ? fabricIndex + 1 : fabricIndex;
    setLightbox({ images, index: actualIndex });
  }, []);

  const dismissFabric = useCallback((groupId: string, fabricId: string) => {
    setSearchGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const idx = g.results.findIndex((f) => f.id === fabricId);
        if (idx === -1) return g;
        const newResults = g.results.filter((_, i) => i !== idx);
        let newActive = g.activeIndex;
        if (idx < g.activeIndex) newActive = g.activeIndex - 1;
        else if (idx === g.activeIndex) newActive = Math.min(g.activeIndex, newResults.length - 1);
        if (newActive < 0) newActive = 0;
        return { ...g, results: newResults, activeIndex: newActive };
      })
    );
  }, []);

  const setActiveIndex = useCallback((groupId: string, idx: number) => {
    setSearchGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, activeIndex: idx } : g)));
  }, []);

  const removeGroup = useCallback((id: string) => {
    setSearchGroups((prev) => prev.filter((g) => g.id !== id));
  }, []);

  // ─── Gemini 분석 ───
  type GeminiFabric = {
    location: string;
    fabricType: string;
    patternDetail: string | null;
    colors: { color: string; pct: number }[];
    confidence: number;
  };

  const analyzeWithGemini = async (file: File): Promise<GeminiFabric[]> => {
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/analyze-image", { method: "POST", body: formData });
      if (!res.ok) return [];
      const data = await res.json();
      if (data.fabrics && Array.isArray(data.fabrics)) {
        return data.fabrics.map((f: { location?: string; fabric_type?: string; pattern_detail?: string | null; colors?: { color: string; pct: number }[]; confidence?: number }) => ({
          location: f.location || "기타",
          fabricType: f.fabric_type || "무지",
          patternDetail: f.pattern_detail || null,
          colors: f.colors || [],
          confidence: f.confidence || 50,
        }));
      }
      return [];
    } catch {
      return [];
    }
  };

  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // ─── Soft Scoring 검색 (/api/search-v3) ───
  const searchSoftScoring = async (
    embeddingGlobal: number[],
    embeddingCrop: number[],
    labClusters: number[],
    geminiFab?: GeminiFabric,  // 사용자 분류 보너스용
  ): Promise<SearchResult[]> => {
    // Gemini 분석 결과를 보너스 파라미터로 전달
    const queryPatterns = geminiFab?.patternDetail || undefined;
    const queryTypes = geminiFab?.fabricType || undefined;
    const queryColors = geminiFab?.colors?.length
      ? geminiFab.colors.filter((c) => c.pct >= 15).map((c) => c.color).join(",")
      : undefined;

    const res = await fetch("/api/search-v3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding_global: embeddingGlobal,
        embedding_crop: embeddingCrop,
        lab_clusters: labClusters,
        query_patterns: queryPatterns,
        query_types: queryTypes,
        query_colors: queryColors,
        matchCount: FETCH_COUNT,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "검색 실패");
    return data.results || [];
  };

  // ─── Gemini Flash 1:5 랭킹 ───
  const rankWithGeminiFlash = async (
    queryBase64: string,
    candidates: SearchResult[],
  ): Promise<SearchResult[]> => {
    try {
      const res = await fetch("/api/rank-gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryImageBase64: queryBase64,
          candidates: candidates.slice(0, RANK_TOP).map((c) => ({
            id: c.id,
            image_url: c.image_url || "",
          })),
        }),
      });
      if (!res.ok) return candidates;
      const data = await res.json();
      const ranked: { id: string; score: number; reason: string }[] = data.ranked || [];
      if (ranked.length === 0) return candidates;

      const idMap = new Map(candidates.map((c) => [c.id, c]));
      const reordered: SearchResult[] = [];
      const usedIds = new Set<string>();
      for (const r of ranked) {
        const fab = idMap.get(r.id);
        if (fab) {
          // Gemini 점수로 similarity 덮어쓰기 (선택)
          reordered.push({ ...fab, similarity: r.score / 100 });
          usedIds.add(r.id);
        }
      }
      // 빠진 후보들 뒤에 추가
      for (const c of candidates) {
        if (!usedIds.has(c.id)) reordered.push(c);
      }
      return reordered;
    } catch {
      return candidates;
    }
  };

  // ─── 메인 이미지 검색 ───
  const handleImageSearch = useCallback(async (file: File, groupIds: string[]) => {
    try {
      setStatusMessage("AI 모델 로딩 + 임베딩 생성 중...");

      // STEP 0: 병렬 전처리 (5가지)
      const [embeddingGlobal, embeddingCrop, labResult, geminiFabrics, queryBase64] = await Promise.all([
        import("@/lib/dino-client").then(({ getDinoEmbedding }) =>
          getDinoEmbedding(file, (s) => { if (s.status === "loading") setStatusMessage(s.message); })
        ),
        import("@/lib/dino-client").then(({ getDinoCropEmbedding }) =>
          getDinoCropEmbedding(file, (s) => { if (s.status === "loading") setStatusMessage(s.message); })
        ),
        import("@/lib/lab-color").then(({ extractLabClusters }) => extractLabClusters(file)),
        analyzeWithGemini(file),
        fileToBase64(file),
      ]);

      const preview = URL.createObjectURL(file);
      setSearchGroups((prev) => prev.filter((g) => !groupIds.includes(g.id)));

      // 다중 원단 감지 (Gemini)
      const geminiOk = geminiFabrics.length > 0;
      const fabricsToShow = geminiOk
        ? geminiFabrics
        : [{ location: "원단", fabricType: "", patternDetail: null, colors: [], confidence: 0 } as GeminiFabric];

      const newGroups: SearchGroup[] = [];
      for (let i = 0; i < fabricsToShow.length; i++) {
        const fab = fabricsToShow[i];

        const parts: string[] = [fab.location];
        if (fab.patternDetail) parts.push(fab.patternDetail);
        else if (fab.fabricType) parts.push(fab.fabricType);
        if (fab.colors.length > 0) parts.push(fab.colors[0].color);
        const label = geminiOk ? `${parts.join(" · ")} (${fab.confidence}%)` : "v3 검색";

        // STEP 1: Soft Scoring 후보 100개 (사용자 분류 보너스 포함)
        setStatusMessage(`Soft Scoring 검색 중... (${i + 1}/${fabricsToShow.length})`);
        const softResults = await searchSoftScoring(
          embeddingGlobal, embeddingCrop, labResult.labVector,
          geminiOk ? fab : undefined,
        );

        // STEP 2: 고확신 시 LLM 스킵
        const topSim = softResults[0]?.similarity || 0;
        const skipLLM = topSim > SKIP_LLM_THRESHOLD;
        let ranked: SearchResult[];

        if (skipLLM) {
          setStatusMessage(`고확신 매칭 (${(topSim * 100).toFixed(0)}%) — LLM 스킵`);
          ranked = softResults;
        } else {
          // STEP 3: Gemini Flash 1:5 랭킹
          setStatusMessage(`Gemini Flash 정밀 랭킹 중... (${i + 1}/${fabricsToShow.length})`);
          ranked = await rankWithGeminiFlash(queryBase64, softResults);
        }

        // STEP 4: MMR 다양성 → top 15
        const diverse = mmrRerank(ranked, fabricNameSim, VISIBLE_COUNT, 0.7);

        newGroups.push({
          id: `v3-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          type: "image",
          label,
          preview,
          results: diverse,
          activeIndex: 0,
          geminiInfo: geminiOk ? {
            location: fab.location,
            patternDetail: fab.patternDetail,
            fabricType: fab.fabricType,
            colors: fab.colors,
            confidence: fab.confidence,
          } : undefined,
          loading: false,
          skippedLLM: skipLLM,
        });
      }

      setSearchGroups((prev) => [...newGroups, ...prev]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "검색 실패";
      setSearchGroups((prev) => prev.map((g) => (groupIds.includes(g.id) ? { ...g, error: msg, loading: false } : g)));
    }
    setStatusMessage("");
  }, []);

  const handleCropComplete = useCallback(
    (regions: CroppedRegion[]) => {
      setCropModal(null);
      regions.forEach((region) => {
        const placeholderId = `v3-ph-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setSearchGroups((prev) => [{
          id: placeholderId,
          type: "image" as const,
          label: `영역 선택 — 분석 중...`,
          preview: region.preview,
          results: [],
          activeIndex: 0,
          loading: true,
        }, ...prev]);
        handleImageSearch(region.file, [placeholderId]);
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [handleImageSearch]
  );

  const handleSearchFullImage = useCallback(() => {
    if (!cropModal) return;
    const file = cropModal.file;
    setCropModal(null);
    const placeholderId = `v3-ph-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setSearchGroups((prev) => [{
      id: placeholderId,
      type: "image" as const,
      label: file.name + " — 분석 중...",
      preview: URL.createObjectURL(file),
      results: [],
      activeIndex: 0,
      loading: true,
    }, ...prev]);
    window.scrollTo({ top: 0, behavior: "smooth" });
    handleImageSearch(file, [placeholderId]);
  }, [cropModal, handleImageSearch]);

  const handleFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    const file = imageFiles[0];
    setCropModal({ imageUrl: URL.createObjectURL(file), file });
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        handleFiles(imageFiles);
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [handleFiles]);

  const hasResults = searchGroups.length > 0;

  return (
    <div className="pt-24 pb-20 px-6">
      {lightbox && (
        <ImageLightbox images={lightbox.images} currentIndex={Math.max(0, lightbox.index)} onClose={() => setLightbox(null)} />
      )}
      {cropModal && (
        <ImageCropSelector
          imageUrl={cropModal.imageUrl}
          originalFile={cropModal.file}
          onComplete={handleCropComplete}
          onSearchFullImage={handleSearchFullImage}
          onCancel={() => setCropModal(null)}
        />
      )}
      <div className="max-w-[1700px] mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full text-xs font-bold text-purple-700">
            ✨ v3 BETA — Soft Scoring + Multi-Scale + LAB
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-3">
            <span className="text-gradient">AI</span> 원단 검색 v3
          </h1>
          <p className="text-gray-400 text-[15px]">
            DINOv2 글로벌+크롭 + LAB 색공간 + Gemini Flash 정밀 랭킹
          </p>
        </div>

        {/* 업로드 */}
        <div className="max-w-[680px] mx-auto mb-12">
          <label
            className={`block bg-white rounded-3xl p-8 text-center border-2 border-dashed cursor-pointer transition-all ${
              dragActive ? "border-[#C49A6C] bg-[#FFFDF9]" : "border-gray-200 hover:border-gray-300"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
          >
            <input
              type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
            />
            <div className="w-14 h-14 bg-[linear-gradient(135deg,rgba(139,105,20,0.1),rgba(196,154,108,0.15))] rounded-[16px] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#8B6914]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3 className="text-lg font-bold mb-1">이미지를 드래그하거나 클릭하여 업로드</h3>
            <p className="text-sm text-gray-400 mb-3">JPG / PNG / WEBP / Ctrl+V</p>
          </label>

          {statusMessage && (
            <div className="flex items-center justify-center gap-2 mt-4 text-[#8B6914] text-sm font-semibold">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {statusMessage}
            </div>
          )}
        </div>

        {/* 결과 */}
        {hasResults && (
          <div className="space-y-10">
            {searchGroups.map((group, idx) => (
              <div key={group.id}>
                {group.loading ? (
                  <div className="bg-white rounded-2xl p-12 text-center text-gray-500">
                    <div className="inline-block w-8 h-8 border-2 border-gray-200 border-t-[#8B6914] rounded-full animate-spin mb-3"></div>
                    <div className="text-sm font-semibold">{group.label}</div>
                  </div>
                ) : group.error ? (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    {group.error}
                  </div>
                ) : (
                  <>
                    {group.skippedLLM && (
                      <div className="mb-3 text-xs text-purple-600 font-semibold flex items-center gap-2">
                        ⚡ 고확신 매칭 — Gemini 랭킹 스킵 (비용 절감)
                      </div>
                    )}
                    <SearchComparisonView
                      preview={group.preview}
                      label={group.label}
                      type={group.type}
                      results={group.results}
                      activeIndex={group.activeIndex}
                      geminiInfo={group.geminiInfo}
                      onSelect={(i) => setActiveIndex(group.id, i)}
                      onDismiss={(fid) => dismissFabric(group.id, fid)}
                      onRemoveGroup={() => removeGroup(group.id)}
                      onPreviewClick={() => openLightbox(group, -1)}
                      onMainImageClick={() => openLightbox(group, group.activeIndex)}
                      enableKeyboard={idx === 0}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!hasResults && (
          <div className="text-center py-10 text-gray-400 text-sm">
            이미지를 업로드해서 v3 검색을 테스트하세요
          </div>
        )}
      </div>
    </div>
  );
}
