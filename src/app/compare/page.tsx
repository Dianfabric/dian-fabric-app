"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import FabricCard from "@/components/FabricCard";
import type { SearchResult } from "@/lib/types";

const VISIBLE_COUNT = 15;
const FETCH_COUNT = 100;

type SideResult = {
  results: SearchResult[];
  loading: boolean;
  error?: string;
  elapsedMs?: number;
};

const emptySide = (): SideResult => ({ results: [], loading: false });

export default function ComparePage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [clipSide, setClipSide] = useState<SideResult>(emptySide);
  const [dinoSide, setDinoSide] = useState<SideResult>(emptySide);
  const [dinoWeight, setDinoWeight] = useState(60); // 0-100, default 60%
  const [skipGptRanking, setSkipGptRanking] = useState(false);
  const [statusClip, setStatusClip] = useState("");
  const [statusDino, setStatusDino] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Gemini 분석
  const analyzeWithGemini = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/analyze-image", { method: "POST", body: formData });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.fabrics)
        ? data.fabrics.map((f: { location?: string; fabric_type?: string; pattern_detail?: string | null; colors?: { color: string; pct: number }[]; confidence?: number }) => ({
            location: f.location || "기타",
            fabricType: f.fabric_type || "무지",
            patternDetail: f.pattern_detail || null,
            colors: f.colors || [],
            confidence: f.confidence || 50,
          }))
        : [];
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

  // GPT-4o 최종 랭킹 (양쪽 동일하게 적용)
  const rankWithGpt = async (
    queryBase64: string,
    queryMimeType: string,
    candidates: SearchResult[],
  ): Promise<SearchResult[]> => {
    if (candidates.length <= VISIBLE_COUNT) return candidates;
    try {
      const res = await fetch("/api/rank-fabrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryImageBase64: queryBase64,
          queryMimeType,
          candidateUrls: candidates.map((c) => c.image_url || ""),
          candidateIds: candidates.map((c) => c.id),
        }),
      });
      if (!res.ok) return candidates;
      const data = await res.json();
      const rankedIds: string[] = data.rankedIds || [];
      if (rankedIds.length === 0) return candidates;
      const idMap = new Map(candidates.map((c) => [c.id, c]));
      const ranked: SearchResult[] = [];
      for (const id of rankedIds) {
        const fabric = idMap.get(id);
        if (fabric) ranked.push(fabric);
      }
      for (const c of candidates) {
        if (!rankedIds.includes(c.id)) ranked.push(c);
      }
      return ranked;
    } catch {
      return candidates;
    }
  };

  // CLIP 검색 (현재 파이프라인)
  const runClipSearch = useCallback(
    async (
      file: File,
      gemini: { fabricType: string; patternDetail: string | null; colors: { color: string; pct: number }[]; confidence: number },
      imageColors: { rgb: number[]; pct: number }[] | undefined,
      queryBase64: string,
    ) => {
      const start = performance.now();
      try {
        setStatusClip("CLIP 임베딩 생성 중...");
        const { getClipEmbedding } = await import("@/lib/clip-client");
        const embedding = await getClipEmbedding(file, (s) => {
          if (s.status === "loading") setStatusClip(s.message);
        });

        setStatusClip("CLIP 후보 검색 중...");
        const useFilter = gemini.confidence >= 60;
        const colorNames = gemini.colors.length > 0
          ? gemini.colors.map((c) => ({ name: c.color, pct: c.pct }))
          : undefined;

        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embedding,
            matchThreshold: 1.5,
            matchCount: FETCH_COUNT,
            fabricType: useFilter ? gemini.fabricType : undefined,
            patternDetail: useFilter ? gemini.patternDetail : undefined,
            rgb: imageColors,
            colorNames,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "CLIP 검색 실패");
        let results: SearchResult[] = data.results || [];

        if (!skipGptRanking) {
          setStatusClip("GPT-4o 최종 랭킹 중...");
          results = await rankWithGpt(queryBase64, file.type || "image/jpeg", results);
        }

        const elapsedMs = performance.now() - start;
        setClipSide({ results: results.slice(0, VISIBLE_COUNT), loading: false, elapsedMs });
        setStatusClip("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "CLIP 검색 실패";
        setClipSide({ results: [], loading: false, error: msg });
        setStatusClip("");
      }
    },
    [skipGptRanking],
  );

  // DINOv2 검색 (신규 + 가중치 슬라이더)
  const runDinoSearch = useCallback(
    async (
      file: File,
      gemini: { fabricType: string; patternDetail: string | null; colors: { color: string; pct: number }[]; confidence: number },
      imageColors: { rgb: number[]; pct: number }[] | undefined,
      queryBase64: string,
      weightPct: number,
    ) => {
      const start = performance.now();
      try {
        setStatusDino("DINOv2 임베딩 생성 중...");
        const { getDinoEmbedding } = await import("@/lib/dino-client");
        const embedding = await getDinoEmbedding(file, (s) => {
          if (s.status === "loading") setStatusDino(s.message);
        });

        setStatusDino("DINOv2 후보 검색 중...");
        const useFilter = gemini.confidence >= 60;
        const colorNames = gemini.colors.length > 0
          ? gemini.colors.map((c) => ({ name: c.color, pct: c.pct }))
          : undefined;

        const res = await fetch("/api/search-dino", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            embedding,
            matchThreshold: 1.5,
            matchCount: FETCH_COUNT,
            fabricType: useFilter ? gemini.fabricType : undefined,
            patternDetail: useFilter ? gemini.patternDetail : undefined,
            rgb: imageColors,
            colorNames,
            embeddingWeight: weightPct / 100,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "DINOv2 검색 실패");
        let results: SearchResult[] = data.results || [];

        if (!skipGptRanking) {
          setStatusDino("GPT-4o 최종 랭킹 중...");
          results = await rankWithGpt(queryBase64, file.type || "image/jpeg", results);
        }

        const elapsedMs = performance.now() - start;
        setDinoSide({ results: results.slice(0, VISIBLE_COUNT), loading: false, elapsedMs });
        setStatusDino("");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "DINOv2 검색 실패";
        setDinoSide({ results: [], loading: false, error: msg });
        setStatusDino("");
      }
    },
    [skipGptRanking],
  );

  // 메인 핸들러: 한 번에 양쪽 검색
  const handleFile = useCallback(
    async (file: File) => {
      setLastFile(file);
      const url = URL.createObjectURL(file);
      setPreview(url);
      setClipSide({ results: [], loading: true });
      setDinoSide({ results: [], loading: true });

      // 공통 분석 (Gemini + RGB + base64) — 한 번만
      const [gemini, imageColors, queryBase64] = await Promise.all([
        analyzeWithGemini(file),
        import("@/lib/extract-rgb").then(({ extractImageColors }) => extractImageColors(file)).catch(() => undefined),
        fileToBase64(file),
      ]);

      const fab = gemini[0] || {
        location: "원단",
        fabricType: "",
        patternDetail: null,
        colors: [],
        confidence: 0,
      };

      // 양쪽 동시 실행
      runClipSearch(file, fab, imageColors, queryBase64);
      runDinoSearch(file, fab, imageColors, queryBase64, dinoWeight);
    },
    [runClipSearch, runDinoSearch, dinoWeight],
  );

  // 슬라이더 변경 시 → DINOv2만 재검색 (CLIP은 그대로)
  const handleWeightChange = useCallback(
    async (newWeight: number) => {
      setDinoWeight(newWeight);
      if (!lastFile) return;
      setDinoSide({ results: [], loading: true });
      const [gemini, imageColors, queryBase64] = await Promise.all([
        analyzeWithGemini(lastFile),
        import("@/lib/extract-rgb").then(({ extractImageColors }) => extractImageColors(lastFile)).catch(() => undefined),
        fileToBase64(lastFile),
      ]);
      const fab = gemini[0] || { location: "원단", fabricType: "", patternDetail: null, colors: [], confidence: 0 };
      runDinoSearch(lastFile, fab, imageColors, queryBase64, newWeight);
    },
    [lastFile, runDinoSearch],
  );

  // 드래그 & 페이스트
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFile]);

  return (
    <main className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-[1400px] mx-auto px-4">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight">A/B 비교 — CLIP vs DINOv2</h1>
          <p className="text-sm text-gray-500 mt-1">
            동일 파이프라인 + 임베딩만 교체. 어느 쪽이 텍스쳐를 더 잘 잡는지 확인하세요.
          </p>
        </div>

        {/* 업로드 영역 */}
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith("image/")) handleFile(file);
          }}
          onClick={() => inputRef.current?.click()}
          className={`bg-white rounded-2xl border-2 border-dashed p-8 mb-6 cursor-pointer transition-all ${
            dragActive ? "border-[#8B6914] bg-[rgba(139,105,20,0.04)]" : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
          {preview ? (
            <div className="flex items-center gap-4">
              <img src={preview} alt="업로드" className="w-24 h-24 object-cover rounded-xl" />
              <div className="text-sm text-gray-600">
                다른 이미지로 비교하려면 클릭, 드래그, 또는 Ctrl+V
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500">
              <div className="text-base font-semibold mb-1">이미지 업로드</div>
              <div className="text-sm">클릭 / 드래그 / Ctrl+V 붙여넣기</div>
            </div>
          )}
        </div>

        {/* 슬라이더 + 옵션 */}
        <div className="bg-white rounded-2xl p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold">DINOv2 가중치</label>
              <span className="text-sm font-bold text-[#8B6914]">
                {dinoWeight}% DINOv2 / {100 - dinoWeight}% RGB
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={dinoWeight}
              onChange={(e) => handleWeightChange(parseInt(e.target.value))}
              className="w-full"
              disabled={!lastFile || dinoSide.loading}
            />
            <div className="flex justify-between text-[10px] text-gray-400 mt-1">
              <span>RGB 색상만 (0%)</span>
              <span>균형 (50%)</span>
              <span>텍스쳐만 (100%)</span>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={skipGptRanking}
                onChange={(e) => setSkipGptRanking(e.target.checked)}
                className="w-4 h-4"
              />
              GPT-4o 최종 랭킹 건너뛰기 (빠른 비교)
            </label>
          </div>
        </div>

        {/* 결과 — 좌우 2열 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 좌: CLIP */}
          <SidePanel
            title="CLIP (현재 운영)"
            subtitle="CLIP 60% + RGB 40% + GPT-4o 랭킹"
            color="#4A90E2"
            side={clipSide}
            status={statusClip}
          />

          {/* 우: DINOv2 */}
          <SidePanel
            title="DINOv2 (신규)"
            subtitle={`DINOv2 ${dinoWeight}% + RGB ${100 - dinoWeight}%${skipGptRanking ? "" : " + GPT-4o 랭킹"}`}
            color="#8B6914"
            side={dinoSide}
            status={statusDino}
          />
        </div>
      </div>
    </main>
  );
}

function SidePanel({
  title,
  subtitle,
  color,
  side,
  status,
}: {
  title: string;
  subtitle: string;
  color: string;
  side: SideResult;
  status: string;
}) {
  return (
    <div className="bg-white rounded-2xl p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-extrabold" style={{ color }}>
          {title}
        </h2>
        {side.elapsedMs && !side.loading && (
          <span className="text-xs text-gray-400">{(side.elapsedMs / 1000).toFixed(1)}초</span>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-4">{subtitle}</p>

      {side.loading && (
        <div className="text-center py-12 text-sm text-gray-500">
          <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mb-2"></div>
          <div>{status || "검색 중..."}</div>
        </div>
      )}

      {side.error && (
        <div className="text-sm text-red-500 py-4 px-3 bg-red-50 rounded-lg">{side.error}</div>
      )}

      {!side.loading && !side.error && side.results.length === 0 && (
        <div className="text-center py-12 text-sm text-gray-400">이미지를 업로드하세요</div>
      )}

      {!side.loading && side.results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {side.results.map((fabric, idx) => (
            <div key={fabric.id} className="relative">
              <span
                className="absolute top-2 left-2 z-10 text-[11px] font-bold text-white px-2 py-0.5 rounded"
                style={{ background: color }}
              >
                #{idx + 1}
              </span>
              <FabricCard fabric={fabric} showSimilarity disableLink />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
