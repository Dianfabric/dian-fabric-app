"use client";
import { useState, useCallback } from "react";
import FabricCard from "@/components/FabricCard";
import ImageLightbox from "@/components/ImageLightbox";
import ImageCropSelector, { type CroppedRegion } from "@/components/ImageCropSelector";
import type { SearchResult } from "@/lib/types";

const VISIBLE_COUNT = 15; // 화면에 보이는 원단 수
const FETCH_COUNT = 50;   // 텍스트 검색용
const IMAGE_FETCH_COUNT = 100; // 이미지 검색: CLIP+RGB 후보 100개 → Gemini 랭킹

interface SearchGroup {
  id: string;
  type: "image" | "text";
  label: string;
  preview?: string;
  visible: SearchResult[];   // 화면에 보이는 15개
  waitlist: SearchResult[];  // 대기열 (X 누르면 여기서 보충)
  loading: boolean;
  error?: string;
}

export default function SearchPage() {
  const [searchGroups, setSearchGroups] = useState<SearchGroup[]>([]);
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

  // 라이트박스 열기
  const openLightbox = useCallback((group: SearchGroup, fabricIndex: number) => {
    const images: { src: string; name: string; colorCode?: string; similarity?: number; patternDetail?: string; fabricType?: string; price?: number }[] = [];

    if (group.preview) {
      images.push({ src: group.preview, name: "업로드 원본" });
    }

    group.visible.forEach((fabric) => {
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

  // 카드 X 버튼: 해당 원단 제거 → 대기열에서 보충
  const dismissFabric = useCallback((groupId: string, fabricId: string) => {
    setSearchGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        const newVisible = g.visible.filter((f) => f.id !== fabricId);
        const toAdd = g.waitlist.slice(0, VISIBLE_COUNT - newVisible.length);
        const newWaitlist = g.waitlist.slice(toAdd.length);
        return {
          ...g,
          visible: [...newVisible, ...toAdd],
          waitlist: newWaitlist,
        };
      })
    );
  }, []);

  const searchWithEmbedding = async (
    embedding: number[],
    fabricType?: string,
    patternDetail?: string,
    dominantColor?: string,
    rgb?: number[] | { rgb: number[]; pct: number }[],
    matchCount?: number,
  ): Promise<{ results: SearchResult[]; detectedCategory?: string; filteredCount?: number }> => {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding,
        matchThreshold: 1.5,
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
        import("@/lib/clip-client").then(({ getClipEmbedding }) =>
          getClipEmbedding(file, (status) => {
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

        // STEP 1: CLIP+RGB로 100개 후보 추출
        setStatusMessage(`${fab.location} 원단 후보 추출 중... (${i + 1}/${fabricsToSearch.length})`);

        const { results: clipResults } = await searchWithEmbedding(
          embedding,
          useFilter ? fab.fabricType : undefined,
          useFilter ? fab.patternDetail || undefined : undefined,
          useFilter ? fab.colors[0]?.color : undefined,
          imageColors,
          IMAGE_FETCH_COUNT, // 100개
        );

        // STEP 2: Gemini 최종 랭킹 (100개 → 순위 정렬)
        let finalResults: SearchResult[];
        if (clipResults.length > VISIBLE_COUNT) {
          setStatusMessage(`${fab.location} AI 최종 비교 중... (${i + 1}/${fabricsToSearch.length})`);
          finalResults = await rankWithGemini(queryBase64, file.type || "image/jpeg", clipResults);
        } else {
          finalResults = clipResults;
        }

        newGroups.push({
          id: `img-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          type: "image",
          label,
          preview: i === 0 ? preview : preview,
          visible: finalResults.slice(0, VISIBLE_COUNT),
          waitlist: finalResults.slice(VISIBLE_COUNT),
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
          visible: [],
          waitlist: [],
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
      visible: [],
      waitlist: [],
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
      visible: [],
      waitlist: [],
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
                visible: allResults.slice(0, VISIBLE_COUNT),
                waitlist: allResults.slice(VISIBLE_COUNT),
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
                      className="w-16 h-16 rounded-xl object-cover border border-gray-100 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => openLightbox(group, -1)}
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
                        {group.visible.length}개 표시 · {group.waitlist.length}개 대기 중
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeGroup(group.id)}
                    className="text-gray-400 hover:text-gray-600 p-2"
                    title="검색 결과 전체 제거"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* 결과 그리드 */}
                {group.loading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
                ) : group.visible.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {group.visible.map((fabric, fabricIdx) => (
                      <div
                        key={fabric.id}
                        className="relative group/card"
                      >
                        {/* X 버튼 — 호버 시 표시 */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissFabric(group.id, fabric.id);
                          }}
                          className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/50 hover:bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover/card:opacity-100 transition-all"
                          title="이 원단 제외 → 다음 대기 원단 표시"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                        <FabricCard
                          fabric={fabric}
                          onImageClick={() => openLightbox(group, fabricIdx)}
                        />
                      </div>
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
