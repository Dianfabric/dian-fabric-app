"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

/* ───────────────────── 상수 ───────────────────── */

const MAIN_CATEGORIES = [
  "전체 (무작위)", "무지", "벨벳", "패턴", "스웨이드",
  "인조가죽", "린넨", "면", "울", "자카드", "시어",
];

const SUB_PATTERNS = [
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴",
];

const BATCH_SIZE = 12;

/* ───────────────────── 타입 ───────────────────── */

interface QuizFabric {
  id: string;
  name: string;
  color_code: string;
  image_url: string;
  fabric_type: string | null;
  pattern_detail: string | null;
  notes: string | null;
}

interface Answer {
  id: string;
  fabric_type: string;
  pattern_detail: string | null;
  colors: string[];
  confirmed: boolean;
}

type Phase = "category-select" | "quiz" | "done";

/* ───────────────────── 컴포넌트 ───────────────────── */

export default function TrainingPage() {
  const [phase, setPhase] = useState<Phase>("category-select");

  // 카테고리
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [showSubPatterns, setShowSubPatterns] = useState(false);

  // 퀴즈
  const [fabrics, setFabrics] = useState<QuizFabric[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [stats, setStats] = useState({ correct: 0, corrected: 0 });
  const [noMoreFabrics, setNoMoreFabrics] = useState(false);

  // 그리드 선택 상태: id → true(맞아) / false(아니야)
  const [selections, setSelections] = useState<Record<string, boolean>>({});

  // 누적 답변 + 틀린 원단 ID 추적
  const allAnswersRef = useRef<Answer[]>([]);
  const rejectedIdsRef = useRef<string[]>([]);
  const [reclassifyDone, setReclassifyDone] = useState(false);

  /* ───────── 라벨 ───────── */

  const focusLabel = selectedSubtype || (selectedCategory !== "전체 (무작위)" ? selectedCategory : null);
  const trainingLabel = focusLabel ? `${focusLabel} 집중학습` : "전체 무작위 학습";

  /* ───────── 배치 로드 ───────── */

  const loadBatch = useCallback(
    async (isFirst: boolean) => {
      setLoading(true);
      if (isFirst) {
        setFabrics([]);
        setStats({ correct: 0, corrected: 0 });
        setNoMoreFabrics(false);
        allAnswersRef.current = [];
        rejectedIdsRef.current = [];
        setReclassifyDone(false);
      }

      try {
        const params = new URLSearchParams();
        if (selectedSubtype) {
          params.set("subtype", selectedSubtype);
        } else if (selectedCategory && selectedCategory !== "전체 (무작위)") {
          params.set("category", selectedCategory);
        }
        params.set("limit", String(BATCH_SIZE));
        const qs = params.toString();
        const res = await fetch(`/api/training${qs ? `?${qs}` : ""}`);
        const data = await res.json();
        const newFabrics: QuizFabric[] = data.fabrics || [];
        setRemaining(data.remaining || 0);

        if (newFabrics.length === 0) {
          setNoMoreFabrics(true);
          setFabrics([]);
          if (!isFirst && allAnswersRef.current.length > 0) {
            await submitAnswers(allAnswersRef.current);
          } else if (!isFirst) {
            setPhase("done");
          }
        } else {
          setFabrics(newFabrics);
          // 기본: 모두 ✅ (맞아)로 시작
          const defaultSel: Record<string, boolean> = {};
          newFabrics.forEach((f) => { defaultSel[f.id] = true; });
          setSelections(defaultSel);
        }
      } catch {
        setFabrics([]);
      }
      setLoading(false);
    },
    [selectedCategory, selectedSubtype]
  );

  /* ───────── 카테고리 선택 ───────── */

  const handleCategoryClick = (cat: string) => {
    if (cat === "패턴") {
      setShowSubPatterns((prev) => !prev);
      return;
    }
    setSelectedCategory(cat);
    setSelectedSubtype(null);
    setShowSubPatterns(false);
    setPhase("quiz");
  };

  const handleSubPatternClick = (sub: string) => {
    setSelectedCategory("패턴");
    setSelectedSubtype(sub);
    setShowSubPatterns(false);
    setPhase("quiz");
  };

  /* ───────── 퀴즈 시작 ───────── */

  useEffect(() => {
    if (phase === "quiz") {
      loadBatch(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedCategory, selectedSubtype]);

  /* ───────── 그리드 토글 ───────── */

  const toggleSelection = (id: string) => {
    setSelections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /* ───────── "다음 배치" 클릭 ───────── */

  const handleNextBatch = () => {
    const confirmed = fabrics.filter((f) => selections[f.id]);
    const rejected = fabrics.filter((f) => !selections[f.id]);

    // 맞은 것들 답변 저장
    for (const fab of confirmed) {
      const answer: Answer = {
        id: fab.id,
        fabric_type: fab.fabric_type || "무지",
        pattern_detail: fab.pattern_detail,
        colors: fab.notes?.split(",") || [],
        confirmed: true,
      };
      allAnswersRef.current.push(answer);
    }
    setStats((prev) => ({ ...prev, correct: prev.correct + confirmed.length }));

    // 틀린 것들도 "틀림"으로 저장 + ID 추적
    for (const fab of rejected) {
      const answer: Answer = {
        id: fab.id,
        fabric_type: fab.fabric_type || "무지",
        pattern_detail: fab.pattern_detail,
        colors: fab.notes?.split(",") || [],
        confirmed: false,
      };
      allAnswersRef.current.push(answer);
      rejectedIdsRef.current.push(fab.id);
    }
    setStats((prev) => ({ ...prev, corrected: prev.corrected + rejected.length }));

    // 바로 다음 배치
    loadBatch(false);
  };


  /* ───────── 그만하기 ───────── */

  const handleStop = async () => {
    if (allAnswersRef.current.length > 0) {
      await submitAnswers(allAnswersRef.current);
    } else {
      setPhase("done");
    }
  };

  /* ───────── 답변 저장 ───────── */

  const submitAnswers = async (allAnswers: Answer[]) => {
    setSubmitting(true);
    try {
      await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: allAnswers }),
      });
    } catch {
      // ignore
    }
    setSubmitting(false);
    setPhase("done");
  };

  /* ───────── 돌아가기 ───────── */

  const handleBackToSelect = () => {
    setSelectedCategory(null);
    setSelectedSubtype(null);
    setShowSubPatterns(false);
    setPhase("category-select");
  };

  /* ═══════════════════════════════════════════════
     렌더링
     ═══════════════════════════════════════════════ */

  /* ───────── 로딩 ───────── */
  if (loading) {
    return (
      <div className="pt-24 pb-16 flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-[#C49A6C] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">원단 불러오는 중...</p>
      </div>
    );
  }

  /* ───────── 1. 카테고리 선택 ───────── */
  if (phase === "category-select") {
    return (
      <div className="pt-24 pb-16 max-w-lg mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-extrabold mb-1">
            레퍼런스 <span className="text-gradient">강화</span>
          </h1>
          <p className="text-sm text-gray-400">
            학습할 카테고리를 선택하세요
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {MAIN_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              className={`relative py-4 px-2 rounded-2xl text-sm font-semibold transition-all border ${
                cat === "패턴" && showSubPatterns
                  ? "bg-[#8B6914] text-white border-[#8B6914] shadow-lg"
                  : cat === "전체 (무작위)"
                  ? "bg-gradient-gold text-white border-transparent shadow-md hover:shadow-lg"
                  : "bg-white text-gray-700 border-gray-200 hover:border-[#C49A6C] hover:text-[#8B6914] hover:shadow-md"
              }`}
            >
              {cat}
              {cat === "패턴" && (
                <span className="block text-[10px] mt-0.5 opacity-70">
                  {showSubPatterns ? "접기 ▲" : "세부 ▼"}
                </span>
              )}
            </button>
          ))}
        </div>

        {showSubPatterns && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-[#8B6914] mb-3">패턴 세부 유형</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  setSelectedCategory("패턴");
                  setSelectedSubtype(null);
                  setShowSubPatterns(false);
                  setPhase("quiz");
                }}
                className="py-3 px-2 rounded-xl text-xs font-semibold bg-gradient-gold text-white hover:shadow-md transition-all"
              >
                패턴 전체
              </button>
              {SUB_PATTERNS.map((sub) => (
                <button
                  key={sub}
                  onClick={() => handleSubPatternClick(sub)}
                  className="py-3 px-2 rounded-xl text-xs font-semibold bg-gray-50 text-gray-700 hover:bg-[rgba(139,105,20,0.08)] hover:text-[#8B6914] border border-gray-100 hover:border-[#C49A6C] transition-all"
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }


  /* ───────── 재분류 실행 ───────── */

  const [reclassifyResult, setReclassifyResult] = useState<{
    classified: number;
    referenceCount: number;
    error?: string;
  } | null>(null);

  const handleReclassify = async () => {
    setSubmitting(true);
    setReclassifyResult(null);
    try {
      const res = await fetch("/api/training/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedCategory,
          subtype: selectedSubtype,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setReclassifyResult({ classified: 0, referenceCount: 0, error: data.error });
      } else {
        setReclassifyResult({
          classified: data.classified,
          referenceCount: data.referenceCount,
        });
      }
      setReclassifyDone(true);
    } catch {
      setReclassifyResult({ classified: 0, referenceCount: 0, error: "서버 오류" });
    }
    setSubmitting(false);
  };

  /* ───────── 3. 완료 화면 ───────── */
  if (phase === "done") {
    const total = stats.correct + stats.corrected;
    const accuracy = total > 0 ? ((stats.correct / total) * 100).toFixed(0) : "0";
    return (
      <div className="pt-24 pb-16 max-w-lg mx-auto px-4 text-center">
        <h1 className="text-3xl font-extrabold mb-2">학습 완료!</h1>
        <p className="text-sm text-gray-400 mb-6">{trainingLabel}</p>

        <div className="bg-white rounded-2xl border border-gray-100 p-8 mb-6">
          <div className="text-5xl font-extrabold text-gradient mb-2">
            {accuracy}%
          </div>
          <p className="text-sm text-gray-500 mb-6">AI 정확도</p>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="bg-green-50 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-green-600">{stats.correct}</div>
              <p className="text-green-600">AI 맞음</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-orange-600">{stats.corrected}</div>
              <p className="text-orange-600">수정함</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-blue-600">{total}</div>
              <p className="text-blue-600">총 학습</p>
            </div>
          </div>
        </div>

        {noMoreFabrics ? (
          <p className="text-sm text-gray-400 mb-4">
            이 카테고리의 미검증 원단을 모두 학습했습니다
          </p>
        ) : (
          <p className="text-sm text-gray-400 mb-4">
            남은 미검증 원단: {Math.max(0, remaining - total)}개
          </p>
        )}

        {/* 재분류 결과 */}
        {reclassifyResult && (
          <div className={`rounded-2xl p-4 mb-4 text-sm ${
            reclassifyResult.error ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
          }`}>
            {reclassifyResult.error ? (
              <p>{reclassifyResult.error}</p>
            ) : (
              <p>
                레퍼런스 {reclassifyResult.referenceCount}개 기준으로{" "}
                <strong>{reclassifyResult.classified}개</strong> 원단을 자동 재분류했습니다!
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {/* 재분류 버튼: 카테고리 집중학습일 때만 표시 */}
          {focusLabel && stats.correct >= 3 && !reclassifyDone && (
            <button
              onClick={handleReclassify}
              disabled={submitting}
              className="w-full py-3.5 bg-[#8B6914] text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
            >
              {submitting ? "재분류 중..." : `"${focusLabel}" 기준으로 전체 재분류`}
            </button>
          )}
          {focusLabel && stats.correct < 3 && !reclassifyDone && (
            <p className="text-xs text-gray-400 mb-2">
              재분류하려면 최소 3개 이상 "맞음"으로 확인해야 합니다
            </p>
          )}

          <button
            onClick={handleBackToSelect}
            className="w-full py-3.5 bg-gradient-gold text-white rounded-xl font-semibold hover:shadow-lg transition-all"
          >
            다른 카테고리 학습하기
          </button>
          <button
            onClick={handleBackToSelect}
            className="w-full py-3.5 bg-white text-[#8B6914] border-2 border-[#C49A6C] rounded-xl font-semibold hover:bg-[rgba(139,105,20,0.04)] transition-all"
          >
            저장 완료, 돌아가기
          </button>
        </div>
      </div>
    );
  }

  /* ───────── 4. 그리드 퀴즈 화면 ───────── */

  if (fabrics.length === 0) {
    return (
      <div className="pt-24 pb-16 text-center">
        <h1 className="text-2xl font-extrabold mb-4">검증할 원단이 없습니다</h1>
        <p className="text-gray-500 mb-6">{trainingLabel} — 미검증 원단이 없습니다</p>
        <button
          onClick={handleBackToSelect}
          className="px-8 py-3 bg-gradient-gold text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          카테고리 선택으로
        </button>
      </div>
    );
  }

  const selectedCount = fabrics.filter((f) => selections[f.id]).length;
  const rejectedCount = fabrics.length - selectedCount;

  return (
    <div className="pt-24 pb-32 max-w-4xl mx-auto px-4">
      {/* 헤더 */}
      <div className="text-center mb-5">
        <h1 className="text-xl font-extrabold mb-1">
          <span className="text-gradient">{focusLabel || "전체"}</span> 학습
        </h1>
        <p className="text-xs text-gray-400">
          {focusLabel
            ? `${focusLabel}이(가) 맞는 원단은 그대로, 아닌 원단은 탭해서 해제하세요`
            : "분류가 맞는 원단은 그대로, 아닌 원단은 탭해서 해제하세요"}
        </p>
      </div>

      {/* 진행 정보 */}
      <div className="flex justify-between items-center text-xs text-gray-500 mb-4">
        <span>
          <span className="text-green-600 font-bold">맞음 {stats.correct}</span>
          {" / "}
          <span className="text-orange-600 font-bold">수정 {stats.corrected}</span>
        </span>
        <span>남은 원단: {remaining}개</span>
      </div>

      {/* 그리드 */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
        {fabrics.map((fab) => {
          const isSelected = selections[fab.id];
          return (
            <button
              key={fab.id}
              onClick={() => toggleSelection(fab.id)}
              className={`relative aspect-square rounded-2xl overflow-hidden transition-all duration-200 ${
                isSelected
                  ? "ring-3 ring-green-400 shadow-md"
                  : "ring-3 ring-red-400 opacity-60"
              }`}
            >
              {fab.image_url && (
                <Image
                  src={fab.image_url}
                  alt={fab.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 33vw, 25vw"
                />
              )}
              {/* 오버레이 뱃지 */}
              <div
                className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md ${
                  isSelected ? "bg-green-500" : "bg-red-500"
                }`}
              >
                {isSelected ? "✓" : "✗"}
              </div>
              {/* 하단 라벨 */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                <p className="text-[10px] text-white font-semibold truncate">
                  {fab.name}
                </p>
                <p className="text-[9px] text-white/70">
                  {fab.pattern_detail || fab.fabric_type || "미분류"}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 하단 요약 + 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] z-40">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-green-600 font-bold">{selectedCount}개 맞음</span>
            {rejectedCount > 0 && (
              <span className="text-red-500 font-bold ml-2">{rejectedCount}개 틀림</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleStop}
              className="px-5 py-2.5 bg-gray-100 text-gray-600 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all"
            >
              그만하기
            </button>
            <button
              onClick={handleNextBatch}
              className="px-6 py-2.5 bg-gradient-gold text-white rounded-xl font-semibold text-sm hover:shadow-lg transition-all"
            >
              다음 {BATCH_SIZE}개 →
            </button>
          </div>
        </div>
      </div>

      {/* 저장 중 오버레이 */}
      {submitting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-3 border-[#C49A6C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-semibold">저장 중...</p>
          </div>
        </div>
      )}
    </div>
  );
}
