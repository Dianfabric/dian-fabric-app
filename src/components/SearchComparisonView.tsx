"use client";
import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import type { SearchResult } from "@/lib/types";

export type GeminiInfo = {
  location: string;
  patternDetail: string | null;
  fabricType: string;
  colors: { color: string; pct: number }[];
  confidence: number;
};

type Props = {
  preview?: string;
  label: string;
  type: "image" | "text";
  results: SearchResult[];
  activeIndex: number;
  geminiInfo?: GeminiInfo;
  onSelect: (idx: number) => void;
  onDismiss: (fabricId: string) => void;
  onRemoveGroup: () => void;
  onPreviewClick?: () => void;
  onMainImageClick?: () => void;
  enableKeyboard?: boolean;
};

export default function SearchComparisonView({
  preview,
  label,
  type,
  results,
  activeIndex,
  geminiInfo,
  onSelect,
  onDismiss,
  onRemoveGroup,
  onPreviewClick,
  onMainImageClick,
  enableKeyboard = false,
}: Props) {
  const waitlistRef = useRef<HTMLDivElement>(null);
  const active = results[activeIndex];

  // 활성 카드를 시야 안으로 스크롤
  useEffect(() => {
    if (!waitlistRef.current) return;
    const card = waitlistRef.current.querySelector<HTMLElement>(
      `[data-idx="${activeIndex}"]`
    );
    if (card) card.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeIndex]);

  // 키보드 단축키
  useEffect(() => {
    if (!enableKeyboard) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (
        e.key === "Delete" ||
        e.key === "Backspace" ||
        e.key === "x" ||
        e.key === "X"
      ) {
        if (active) {
          e.preventDefault();
          onDismiss(active.id);
        }
        return;
      }
      if (
        (e.key === "ArrowDown" || e.key === "ArrowRight") &&
        activeIndex < results.length - 1
      ) {
        e.preventDefault();
        onSelect(activeIndex + 1);
      } else if (
        (e.key === "ArrowUp" || e.key === "ArrowLeft") &&
        activeIndex > 0
      ) {
        e.preventDefault();
        onSelect(activeIndex - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, results, active, onSelect, onDismiss, enableKeyboard]);

  return (
    <div className="bg-transparent">
      {/* 그룹 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-bold text-white bg-[#8B6914] px-2.5 py-1 rounded">
          {type === "image" ? "이미지" : "텍스트"}
        </span>
        <h2 className="text-lg font-extrabold flex-1 truncate">{label}</h2>
        <button
          onClick={onRemoveGroup}
          className="text-gray-400 hover:text-gray-600 p-2"
          title="검색 결과 전체 제거"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 3열 비교 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_1fr] gap-4">
        {/* 좌: 업로드 원단 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-[#4A90E2]">📤 내가 업로드한 원단</span>
          </div>
          <div
            className="h-[380px] bg-gray-50 cursor-zoom-in relative"
            onClick={onPreviewClick}
          >
            {preview ? (
              type === "image" ? (
                <img
                  src={preview}
                  alt="업로드"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                  <span className="text-2xl font-bold text-gray-400">📝 텍스트 검색</span>
                </div>
              )
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400">
                미리보기 없음
              </div>
            )}
          </div>
          <div className="px-6 py-5">
            <div className="text-xl font-extrabold mb-1">
              {type === "image" ? "업로드 이미지" : label}
            </div>
            <div className="text-sm text-gray-500 mb-4">
              {new Date().toLocaleDateString("ko-KR")} 검색
            </div>

            {geminiInfo && (
              <div className="rounded-xl p-4 bg-gradient-to-br from-[rgba(74,144,226,0.06)] to-[rgba(74,144,226,0.02)]">
                <div className="text-xs font-bold text-[#4A90E2] mb-2 tracking-wider">
                  🤖 AI 분석 (Gemini 3 Flash)
                </div>
                <InfoRow label="위치" value={geminiInfo.location} />
                <InfoRow
                  label="패턴"
                  value={geminiInfo.patternDetail || geminiInfo.fabricType || "-"}
                />
                {geminiInfo.colors.length > 0 && (
                  <InfoRow
                    label="주요 색상"
                    value={geminiInfo.colors[0].color}
                  />
                )}
                <InfoRow label="신뢰도" value={`${geminiInfo.confidence}%`} />
                <div className="h-1.5 bg-[#e0e7f0] rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-[#4A90E2] rounded-full transition-all"
                    style={{ width: `${geminiInfo.confidence}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 중: 활성 매칭 원단 */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-[#8B6914]">✨ 비슷한 원단</span>
            <span className="text-xs font-bold text-white bg-[#8B6914] px-2.5 py-1 rounded">
              {results.length > 0 ? `#${activeIndex + 1} / ${results.length}` : "0개"}
            </span>
          </div>

          {active ? (
            <>
              <div className="h-[380px] bg-gray-50 relative cursor-zoom-in" onClick={onMainImageClick}>
                <img
                  src={active.image_url || ""}
                  alt={active.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(active.id);
                  }}
                  title="이 원단 제외 → 다음 원단 표시"
                  className="absolute top-3.5 left-3.5 w-9 h-9 rounded-full bg-black/50 hover:bg-red-500 text-white flex items-center justify-center transition-all hover:scale-110 backdrop-blur-sm"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <div className="absolute top-3.5 right-3.5 bg-gradient-to-br from-[#8B6914] to-[#C49A6C] text-white px-4 py-2 rounded-lg font-bold text-[15px] shadow-md">
                  {((active.similarity || 0) * 100).toFixed(0)}% 매칭
                </div>
              </div>
              <div className="px-6 py-5">
                <Link href={`/fabric/${active.id}`} className="block hover:opacity-70 transition-opacity">
                  <div className="text-2xl font-extrabold mb-1">{active.name}</div>
                  <div className="text-base text-gray-500 mb-4">Color: {active.color_code}</div>
                </Link>

                <div className="flex gap-2 flex-wrap mb-4">
                  {active.fabric_type && (
                    <span className="text-sm font-semibold text-[#8B6914] bg-[#f0e9d6] px-3 py-1.5 rounded-md">
                      {active.fabric_type}
                    </span>
                  )}
                  {active.pattern_detail && (
                    <span className="text-sm font-semibold text-white bg-[#8B6914] px-3 py-1.5 rounded-md">
                      {active.pattern_detail}
                    </span>
                  )}
                </div>

                <div className="flex justify-between py-2.5 text-base border-b border-gray-100">
                  <span className="text-gray-500">사용처</span>
                  <span className="font-bold">
                    {active.usage_types?.length ? active.usage_types.join(", ") : "-"}
                  </span>
                </div>
                <div className="flex justify-between py-2.5 text-base">
                  <span className="text-gray-500">가격</span>
                  <span className="font-bold text-[#8B6914]">
                    {active.price_per_yard
                      ? `₩${active.price_per_yard.toLocaleString()}/Y`
                      : "-"}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div className="h-[380px] flex flex-col items-center justify-center text-gray-400">
              <div className="text-5xl mb-3">✓</div>
              <div className="text-base font-semibold">모든 원단을 확인했습니다</div>
            </div>
          )}
        </div>

        {/* 우: 대기열 카드 리스트 */}
        <div className="bg-white rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.04)] flex flex-col max-h-[calc(100vh-100px)] min-h-[500px]">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">📋 대기열</span>
            <span className="text-[11px] font-bold text-gray-600 bg-gray-100 px-2.5 py-1 rounded">
              {results.length}개
            </span>
          </div>
          <div className="text-xs text-gray-400 px-5 pt-2">
            클릭하면 가운데로 이동
          </div>
          <div ref={waitlistRef} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
            {results.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <div className="text-3xl mb-2">📭</div>
                <div className="text-sm">대기열이 비었습니다</div>
              </div>
            ) : (
              results.map((f, i) => (
                <div
                  key={f.id}
                  data-idx={i}
                  onClick={() => onSelect(i)}
                  className={`flex gap-3 p-2.5 rounded-xl cursor-pointer border-2 transition-all ${
                    i === activeIndex
                      ? "border-[#8B6914] bg-[#faf6eb]"
                      : "border-transparent bg-gray-50 hover:bg-[#f5f0e0]"
                  }`}
                >
                  <div className="relative flex-shrink-0 w-[110px] h-[110px] rounded-lg overflow-hidden bg-gray-100">
                    {f.image_url && (
                      <Image
                        src={f.image_url}
                        alt={f.name}
                        fill
                        className="object-cover"
                        sizes="110px"
                      />
                    )}
                    <span className="absolute top-1 left-1 bg-black/75 text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
                      #{i + 1}
                    </span>
                    <span className="absolute bottom-1 right-1 bg-gradient-to-br from-[#8B6914] to-[#C49A6C] text-white text-[11px] font-bold px-1.5 py-0.5 rounded">
                      {((f.similarity || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
                    <div className="text-base font-bold leading-tight truncate">{f.name}</div>
                    <div className="text-[13px] text-gray-500">Color: {f.color_code}</div>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {f.fabric_type && (
                        <span className="text-[10px] font-semibold text-[#8B6914] bg-[#f0e9d6] px-1.5 py-0.5 rounded">
                          {f.fabric_type}
                        </span>
                      )}
                      {f.pattern_detail && (
                        <span className="text-[10px] font-semibold text-white bg-[#8B6914] px-1.5 py-0.5 rounded">
                          {f.pattern_detail}
                        </span>
                      )}
                    </div>
                    {f.price_per_yard && (
                      <div className="text-[13px] font-extrabold text-[#8B6914] mt-0.5">
                        ₩{f.price_per_yard.toLocaleString()}/Y
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-base py-1.5">
      <span className="text-gray-600">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
