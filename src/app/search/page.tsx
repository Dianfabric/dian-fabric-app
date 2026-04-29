"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import ImageLightbox from "@/components/ImageLightbox";
import ImageCropSelector, { type CroppedRegion } from "@/components/ImageCropSelector";
import SearchComparisonView, { type GeminiInfo } from "@/components/SearchComparisonView";
import type { SearchResult } from "@/lib/types";

const FETCH_COUNT = 50;   // 텍스트 검색용
const IMAGE_FETCH_COUNT = 100; // 이미지 검색: 후보 100개 → Gemini 랭킹
const CACHE_KEY = "dian-search-cache";

interface SearchGroup {
  id: string;
  type: "image" | "text";
  label: string;
  preview?: string;
  results: SearchResult[];        // 모든 매칭 결과 (정렬됨)
  activeIndex: number;            // 현재 가운데 표시 중인 인덱스
  geminiInfo?: GeminiInfo;        // 좌측 AI 분석 박스용
  loading: boolean;
  error?: string;
}

function loadCachedGroups(): SearchGroup[] {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (!cached) return [];
    // 이전 캐시(visible/waitlist) 호환 처리
    const groups = JSON.parse(cached) as Array<SearchGroup & { visible?: SearchResult[]; waitlist?: SearchResult[] }>;
    return groups.map(g => {
      if (Array.isArray(g.results)) return { ...g, loading: false } as SearchGroup;
      const merged = [...(g.visible || []), ...(g.waitlist || [])];
      return { ...g, results: merged, activeIndex: 0, loading: false } as SearchGroup;
    });
  } catch { return []; }
}

export default function SearchPage() {
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>(() => {
    if (typeof window !== "undefined") return loadCachedGroups();
    return [];
  });
  const isInitial = useRef(true);

  // 검색 결과 변경 시 sessionStorage에 저장
  useEffect(() => {
    if (isInitial.current) { isInitial.current = false; return; }
    const toCache = searchGroups.filter(g => !g.loading && !g.error && g.results.length > 0);
    if (toCache.length > 0) {
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(toCache)); } catch {}
    } else {
      sessionStorage.removeItem(CACHE_KEY);
    }
  }, [searchGroups]);
  const [textQuery, setTextQuery] = useState("");
  const [isTextSearching, setIsTextSearching] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: { src: string; name: string; colorCode?: string; similarity?: number; patternDetail?: string; fabricType?: string; price?: number }[];
    index: number;
  } | null>(null);
  const [cropModal, setCropModal] = useState<{
    imageUrl: string;
    file: File;
  } | null>(null);

  // 라이트박스 열기 (group의 모든 결과 + 업로드 원본을 묶어서 큐로)
  const openLightbox = useCallback((group: SearchGroup, fabricIndex: number) => {
    const images: { src: string; name: string; colorCode?: string; similarity?: number; patternDetail?: string; fabricType?: string; price?: number }[] = [];

    if (group.preview) {
      images.push({ src: group.preview, name: "업로드 원본" });
    }

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

  // X 버튼 / Delete 키: 해당 원단을 results에서 제거 → 다음 원단 자동 활성화
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

  // 대기열 카드 클릭 → 활성 인덱스 변경
  const setActiveIndex = useCallback((groupId: string, idx: number) => {
    setSearchGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, activeIndex: idx } : g))
    );
  }, []);

  // CLIP 검색 — 텍스트 검색 전용 (DINOv2는 텍스트 인코더 없음)
  const searchWithEmbedding = async (
    embedding: number[],
    fabricType?: string,
    patternDetail?: string,
    dominantColor?: string,
    rgb?: number[] | { rgb: number[]; pct: number }[],
    matchCount?: number,
    colorNames?: { name: string; pct: number }[],
  ): Promise<{ results: SearchResult[]; detectedCategory?: string; filteredCount?: number }> => {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding,
        matchThreshold: 1.5,
        colorNames,
        matchCount: matchCount || FETCH_COUNT,
        fabricType,
        patternDetail,
        dominantColor,
        rgb,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "검색 실패");
    return { results: data.results || [], detectedCategory: data.detectedCategory, filteredCount: data.filteredCount };
  };

  // DINOv2 검색 — 이미지 검색 전용 (텍스쳐 매칭 정확도 ↑)
  const searchWithDinoEmbedding = async (
    embedding: number[],
    fabricType?: string,
    patternDetail?: string,
    dominantColor?: string,
    rgb?: number[] | { rgb: number[]; pct: number }[],
    matchCount?: number,
    colorNames?: { name: string; pct: number }[],
  ): Promise<{ results: SearchResult[]; detectedCategory?: string; filteredCount?: number }> => {
    const res = await fetch("/api/search-dino", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding,
        matchThreshold: 1.5,
        colorNames,
        matchCount: matchCount || FETCH_COUNT,
        fabricType,
        patternDetail,
        dominantColor,
        rgb,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "검색 실패");
    return { results: data.results || [], detectedCategory: data.detectedCategory, filteredCount: data.filteredCount };
  };

  // Gemini 다중 원단 분석
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
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });
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

  // 파일을 base64로 변환
  const fileToBase64 = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // data:...;base64, 제거
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Gemini 최종 랭킹 호출
  const rankWithGemini = async (
    queryBase64: string,
    queryMimeType: string,
    candidates: SearchResult[],
  ): Promise<SearchResult[]> => {
    try {
      const candidateUrls = candidates.map((c) => c.image_url || "");
      const candidateIds = candidates.map((c) => c.id);

      const res = await fetch("/api/rank-fabrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryImageBase64: queryBase64,
          queryMimeType,
          candidateUrls,
          candidateIds,
        }),
      });

      if (!res.ok) return candidates; // fallback: 기존 순서

      const data = await res.json();
      const rankedIds: string[] = data.rankedIds || [];

      if (rankedIds.length === 0) return candidates;

      // ID 기반으로 재정렬
      const idMap = new Map(candidates.map((c) => [c.id, c]));
      const ranked: SearchResult[] = [];
      for (const id of rankedIds) {
        const fabric = idMap.get(id);
        if (fabric) ranked.push(fabric);
      }
      // Gemini가 빠뜨린 것들은 뒤에 추가
      for (const c of candidates) {
        if (!rankedIds.includes(c.id)) ranked.push(c);
      }
      return ranked;
    } catch {
      return candidates; // 에러 시 기존 순서 유지
    }
  };

  const handleImageSearch = useCallback(async (file: File, groupIds: string[]) => {
    try {
      setStatusMessage("AI 분석 + 임베딩 처리 중...");

      const [embedding, geminiFabrics, imageColors, queryBase64] = await Promise.all([
        import("@/lib/dino-client").then(({ getDinoEmbedding }) =>
          getDinoEmbedding(file, (status) => {
            if (status.status === "loading") setStatusMessage(status.message);
          })
        ),
        analyzeWithGemini(file),
        import("@/lib/extract-rgb").then(({ extractImageColors }) => extractImageColors(file)).catch(() => undefined),
        fileToBase64(file),
      ]);

      // Gemini가 여러 원단을 감지한 경우 → 각각 별도 검색 그룹 생성
      // Gemini 실패 시 RGB 색상만으로도 검색 (fallback)
      const geminiOk = geminiFabrics.length > 0;
      const fabricsToSearch = geminiOk
        ? geminiFabrics
        : [{ location: "원단", fabricType: "", patternDetail: null as string | null, colors: [] as { color: string; pct: number }[], confidence: 0 }];
      const preview = URL.createObjectURL(file);

      // 기존 placeholder 그룹 제거
      setSearchGroups((prev) => prev.filter((g) => !groupIds.includes(g.id)));

      // 각 감지된 원단별로 그룹 생성 + 검색
      const newGroups: SearchGroup[] = [];
      for (let i = 0; i < fabricsToSearch.length; i++) {
        const fab = fabricsToSearch[i];
        const useFilter = fab.confidence >= 60;

        const detectedParts: string[] = [fab.location];
        if (fab.patternDetail) detectedParts.push(fab.patternDetail);
        else if (fab.fabricType) detectedParts.push(fab.fabricType);
        if (fab.colors.length > 0) detectedParts.push(fab.colors[0].color);
        const label = geminiOk
          ? `${detectedParts.join(" · ")} (${fab.confidence}%)`
          : "RGB 색상 기반 검색";

        // STEP 1: DINOv2+RGB로 100개 후보 추출
        setStatusMessage(`${fab.location} 원단 후보 추출 중... (${i + 1}/${fabricsToSearch.length})`);

        // Gemini 색상명 비율을 검색에 전달
        const geminiColorNames = fab.colors.length > 0
          ? fab.colors.map(c => ({ name: c.color, pct: c.pct }))
          : undefined;

        const { results: dinoResults } = await searchWithDinoEmbedding(
          embedding,
          useFilter ? fab.fabricType : undefined,       // Gemini → 패턴만
          useFilter ? fab.patternDetail || undefined : undefined,
          undefined,                                     // 색상은 RGB가 담당
          imageColors,                                   // RGB 클러스터로 색상 필터+정렬
          IMAGE_FETCH_COUNT, // 100개
          geminiColorNames,                              // Gemini 색상명 비율 매칭
        );

        // STEP 2: Gemini 최종 랭킹 (15개 초과면 GPT-4o 그리드 랭킹)
        let finalResults: SearchResult[];
        if (dinoResults.length > 15) {
          setStatusMessage(`${fab.location} AI 최종 비교 중... (${i + 1}/${fabricsToSearch.length})`);
          finalResults = await rankWithGemini(queryBase64, file.type || "image/jpeg", dinoResults);
        } else {
          finalResults = dinoResults;
        }

        newGroups.push({
          id: `img-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          type: "image",
          label,
          preview: i === 0 ? preview : preview,
          results: finalResults,
          activeIndex: 0,
          geminiInfo: geminiOk ? {
            location: fab.location,
            patternDetail: fab.patternDetail,
            fabricType: fab.fabricType,
            colors: fab.colors,
            confidence: fab.confidence,
          } : undefined,
          loading: false,
        });
      }

      setSearchGroups((prev) => [...newGroups, ...prev]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "검색 실패";
      setSearchGroups((prev) =>
        prev.map((g) =>
          groupIds.includes(g.id) ? { ...g, error: msg, loading: false } : g
        )
      );
    }
    setStatusMessage("");
  }, []);

  // 크롭 영역 선택 완료 → 각 영역별로 검색 시작
  const handleCropComplete = useCallback(
    (regions: CroppedRegion[]) => {
      setCropModal(null);
      regions.forEach((region) => {
        const placeholderId = `img-ph-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  // 전체 이미지로 검색 (크롭 없이)
  const handleSearchFullImage = useCallback(() => {
    if (!cropModal) return;
    const file = cropModal.file;
    setCropModal(null);

    const placeholderId = `img-ph-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (imageFiles.length === 0) return;

      // 첫 번째 이미지 → 크롭 모달 열기
      const file = imageFiles[0];
      setCropModal({
        imageUrl: URL.createObjectURL(file),
        file,
      });
    },
    []
  );

  // Ctrl+V 클립보드 이미지 붙여넣기
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

  const handleTextSearch = useCallback(async () => {
    if (!textQuery.trim()) return;
    setIsTextSearching(true);

    const groupId = `txt-${Date.now()}`;
    const query = textQuery.trim();

    // 텍스트에서 색상/패턴/타입 파싱
    const COLOR_MAP: Record<string, string> = {
      "파란": "블루", "파랑": "블루", "파란색": "블루", "블루": "블루", "청": "블루",
      "빨간": "레드", "빨강": "레드", "빨간색": "레드", "레드": "레드",
      "노란": "옐로우", "노랑": "옐로우", "노란색": "옐로우", "옐로우": "옐로우",
      "초록": "그린", "초록색": "그린", "녹색": "그린", "그린": "그린",
      "분홍": "핑크", "분홍색": "핑크", "핑크": "핑크",
      "보라": "퍼플", "보라색": "퍼플", "퍼플": "퍼플",
      "주황": "오렌지", "주황색": "오렌지", "오렌지": "오렌지",
      "하늘": "블루", "하늘색": "블루",
      "검정": "블랙", "검은": "블랙", "검정색": "블랙", "블랙": "블랙",
      "흰": "아이보리", "흰색": "아이보리", "화이트": "아이보리", "아이보리": "아이보리",
      "베이지": "베이지", "크림": "베이지",
      "갈색": "브라운", "브라운": "브라운",
      "회색": "그레이", "그레이": "그레이", "회": "그레이",
      "차콜": "차콜", "진회색": "차콜",
      "네이비": "네이비", "남색": "네이비",
      "민트": "민트", "민트색": "민트",
    };
    const PATTERN_MAP: Record<string, string> = {
      "하운드투스": "하운드투스", "체크": "체크", "스트라이프": "스트라이프",
      "헤링본": "헤링본", "부클": "부클", "추상": "추상",
      "식물": "식물", "동물": "동물", "자연": "자연", "큰패턴": "큰패턴",
      "줄무늬": "스트라이프", "격자": "체크", "꽃": "식물", "플로럴": "식물",
    };
    const TYPE_MAP: Record<string, string> = {
      "무지": "무지", "벨벳": "벨벳", "스웨이드": "스웨이드",
      "인조가죽": "인조가죽", "가죽": "인조가죽", "자카드": "자카드",
      "린넨": "린넨", "면": "면", "울": "울", "시어": "시어",
    };

    let detectedColor: string | undefined;
    let detectedPattern: string | undefined;
    let detectedType: string | undefined;

    for (const [keyword, value] of Object.entries(COLOR_MAP)) {
      if (query.includes(keyword)) { detectedColor = value; break; }
    }
    for (const [keyword, value] of Object.entries(PATTERN_MAP)) {
      if (query.includes(keyword)) { detectedPattern = value; break; }
    }
    for (const [keyword, value] of Object.entries(TYPE_MAP)) {
      if (query.includes(keyword)) { detectedType = value; break; }
    }

    const newGroup: SearchGroup = {
      id: groupId,
      type: "text",
      label: query,
      results: [],
      activeIndex: 0,
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
      const { results: allResults } = await searchWithEmbedding(
        embedding,
        detectedPattern ? undefined : detectedType,
        detectedPattern || undefined,
        detectedColor,
      );

      setSearchGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                results: allResults,
                activeIndex: 0,
                loading: false,
              }
            : g
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
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          currentIndex={Math.max(0, lightbox.index)}
          onClose={() => setLightbox(null)}
        />
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

          {/* 이미지 업로드 */}
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
              {["JPG", "PNG", "WEBP", "Ctrl+V 붙여넣기"].map((f) => (
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

        {/* 검색 결과들 — 3열 비교 뷰 */}
        {hasResults && (
          <div className="space-y-10 max-w-[1700px] mx-auto">
            {searchGroups.map((group, groupIdx) => (
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
                  <SearchComparisonView
                    preview={group.preview}
                    label={group.label}
                    type={group.type}
                    results={group.results}
                    activeIndex={group.activeIndex}
                    geminiInfo={group.geminiInfo}
                    onSelect={(idx) => setActiveIndex(group.id, idx)}
                    onDismiss={(fabricId) => dismissFabric(group.id, fabricId)}
                    onRemoveGroup={() => removeGroup(group.id)}
                    onPreviewClick={() => openLightbox(group, -1)}
                    onMainImageClick={() => openLightbox(group, group.activeIndex)}
                    enableKeyboard={groupIdx === 0}
                  />
                )}
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
