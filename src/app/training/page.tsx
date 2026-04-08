"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";

/* ───────────────────── 상수 ───────────────────── */

const PATTERN_OPTIONS = [
  "무지", "벨벳", "스웨이드", "인조가죽",
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴", "자카드", "린넨", "시어",
];

const COLOR_OPTIONS = [
  "화이트", "아이보리", "베이지", "브라운", "그레이", "차콜", "블랙",
  "네이비", "블루", "그린", "레드", "핑크", "옐로우", "오렌지", "퍼플", "민트",
];

const COLOR_DOTS: Record<string, string> = {
  "화이트": "bg-white border border-gray-300",
  "아이보리": "bg-[#FFFFF0]",
  "베이지": "bg-[#D4B896]",
  "브라운": "bg-[#8B4513]",
  "그레이": "bg-gray-400",
  "차콜": "bg-gray-700",
  "블랙": "bg-gray-900",
  "네이비": "bg-[#1B2A4A]",
  "블루": "bg-blue-500",
  "그린": "bg-green-600",
  "레드": "bg-red-500",
  "핑크": "bg-pink-400",
  "옐로우": "bg-yellow-400",
  "오렌지": "bg-orange-400",
  "퍼플": "bg-purple-500",
  "민트": "bg-teal-400",
};

// 카테고리 선택 화면용
const MAIN_CATEGORIES = [
  "전체 (무작위)", "무지", "벨벳", "패턴", "스웨이드",
  "인조가죽", "린넨", "면", "울", "자카드", "시어",
];

const SUB_PATTERNS = [
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴",
];

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
  confirmed: boolean; // true = AI 맞음, false = 수정함
}

type Phase = "category-select" | "quiz" | "done";

/* ───────────────────── 컴포넌트 ───────────────────── */

export default function TrainingPage() {
  // 단계 관리
  const [phase, setPhase] = useState<Phase>("category-select");

  // 카테고리 선택
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);
  const [showSubPatterns, setShowSubPatterns] = useState(false);

  // 퀴즈 상태
  const [fabrics, setFabrics] = useState<QuizFabric[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [stats, setStats] = useState({ correct: 0, corrected: 0 });
  const [loadingMore, setLoadingMore] = useState(false);
  const [noMoreFabrics, setNoMoreFabrics] = useState(false);

  // 수정 모드
  const [editingPattern, setEditingPattern] = useState(false);
  const [editingColor, setEditingColor] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState("");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  // 누적 답변 (배치간 유지)
  const allAnswersRef = useRef<Answer[]>([]);

  /* ───────── 카테고리별 라벨 ───────── */

  const trainingLabel = selectedSubtype
    ? `${selectedSubtype} 집중학습 중`
    : selectedCategory && selectedCategory !== "전체 (무작위)"
    ? `${selectedCategory} 집중학습 중`
    : "전체 무작위 학습 중";

  /* ───────── 퀴즈 로드 ───────── */

  const loadBatch = useCallback(
    async (isFirstBatch: boolean) => {
      if (isFirstBatch) {
        setLoading(true);
        setCurrent(0);
        setFabrics([]);
        setAnswers([]);
        setStats({ correct: 0, corrected: 0 });
        setNoMoreFabrics(false);
        allAnswersRef.current = [];
      } else {
        setLoadingMore(true);
      }

      try {
        const params = new URLSearchParams();
        if (selectedSubtype) {
          params.set("subtype", selectedSubtype);
        } else if (selectedCategory && selectedCategory !== "전체 (무작위)") {
          params.set("category", selectedCategory);
        }
        const qs = params.toString();
        const res = await fetch(`/api/training${qs ? `?${qs}` : ""}`);
        const data = await res.json();
        const newFabrics: QuizFabric[] = data.fabrics || [];
        setRemaining(data.remaining || 0);

        if (newFabrics.length === 0) {
          setNoMoreFabrics(true);
          if (isFirstBatch) {
            // 아예 원단이 없음
            setFabrics([]);
          } else {
            // 더 이상 없음 → 완료 처리
            await submitAnswers(allAnswersRef.current);
          }
        } else {
          if (isFirstBatch) {
            setFabrics(newFabrics);
            setCurrent(0);
          } else {
            // 기존 배열 뒤에 추가, current 유지
            setFabrics((prev) => [...prev, ...newFabrics]);
          }
        }
      } catch {
        if (isFirstBatch) setFabrics([]);
      }

      setLoading(false);
      setLoadingMore(false);
    },
    [selectedCategory, selectedSubtype]
  );

  /* ───────── 카테고리 선택 핸들러 ───────── */

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

  /* ───────── 퀴즈 시작시 로드 ───────── */

  useEffect(() => {
    if (phase === "quiz") {
      loadBatch(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, selectedCategory, selectedSubtype]);

  /* ───────── 현재 원단 ───────── */

  const fabric = fabrics[current];
  const aiPattern = fabric?.pattern_detail || fabric?.fabric_type || "무지";
  const aiColors = fabric?.notes?.split(",") || [];

  /* ───────── 다음으로 이동 (무한모드) ───────── */

  const advanceToNext = useCallback(
    (cur: number) => {
      const nextIdx = cur + 1;
      if (nextIdx < fabrics.length) {
        setCurrent(nextIdx);
      } else {
        // 현재 배치 끝 → 다음 배치 로드
        loadBatch(false);
      }
    },
    [fabrics.length, loadBatch]
  );

  /* ───────── 맞아 ✅ ───────── */

  const handleCorrect = useCallback(() => {
    if (!fabric) return;
    const answer: Answer = {
      id: fabric.id,
      fabric_type: fabric.fabric_type || "무지",
      pattern_detail: fabric.pattern_detail,
      colors: aiColors,
      confirmed: true,
    };
    setAnswers((prev) => [...prev, answer]);
    allAnswersRef.current = [...allAnswersRef.current, answer];
    setStats((prev) => ({ ...prev, correct: prev.correct + 1 }));
    setEditingPattern(false);
    setEditingColor(false);
    advanceToNext(current);
  }, [fabric, current, aiColors, advanceToNext]);

  /* ───────── 아니야 → 수정 모드 ───────── */

  const handleStartEdit = useCallback(() => {
    setEditingPattern(true);
    setEditingColor(false);
    setSelectedPattern(aiPattern);
    setSelectedColors([...aiColors]);
  }, [aiPattern, aiColors]);

  const handlePatternSelect = useCallback((p: string) => {
    setSelectedPattern(p);
    setEditingPattern(false);
    setEditingColor(true);
  }, []);

  const handleColorToggle = useCallback((color: string) => {
    setSelectedColors((prev) =>
      prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
    );
  }, []);

  const handleColorDone = useCallback(() => {
    if (!fabric) return;
    const SUB = [
      "부클", "하운드투스", "스트라이프", "체크", "헤링본",
      "추상", "자연", "동물", "식물", "큰패턴", "자카드", "린넨", "시어",
    ];
    const isSubPattern = SUB.includes(selectedPattern);
    const fabricType = isSubPattern ? "패턴" : selectedPattern;
    const patternDetail = isSubPattern ? selectedPattern : null;

    const answer: Answer = {
      id: fabric.id,
      fabric_type: fabricType,
      pattern_detail: patternDetail,
      colors: selectedColors,
      confirmed: false,
    };
    setAnswers((prev) => [...prev, answer]);
    allAnswersRef.current = [...allAnswersRef.current, answer];
    setStats((prev) => ({ ...prev, corrected: prev.corrected + 1 }));
    setEditingPattern(false);
    setEditingColor(false);
    advanceToNext(current);
  }, [fabric, selectedPattern, selectedColors, current, advanceToNext]);

  /* ───────── 그만하기 ───────── */

  const handleStop = useCallback(async () => {
    if (allAnswersRef.current.length > 0) {
      await submitAnswers(allAnswersRef.current);
    } else {
      setPhase("done");
    }
  }, []);

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

  /* ───────── 재분류 실행 (placeholder) ───────── */

  const handleReclassify = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/training/reclassify", { method: "POST" });
    } catch {
      // endpoint 미구현 — 나중에 추가
    }
    setSubmitting(false);
    setPhase("category-select");
  };

  /* ───────── 카테고리 선택으로 돌아가기 ───────── */

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
      <div className="pt-24 pb-16 flex justify-center">
        <div className="w-8 h-8 border-3 border-[#C49A6C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  /* ───────── 1. 카테고리 선택 화면 ───────── */
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

        {/* 메인 카테고리 그리드 */}
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

        {/* 서브패턴 (패턴 클릭 시 표시) */}
        {showSubPatterns && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <p className="text-xs font-bold text-[#8B6914] mb-3">
              패턴 세부 유형
            </p>
            <div className="grid grid-cols-3 gap-2">
              {/* 패턴 전체 버튼 */}
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

  /* ───────── 2. 완료 화면 ───────── */
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
              <div className="text-2xl font-extrabold text-green-600">
                {stats.correct}
              </div>
              <p className="text-green-600">AI 맞음</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-orange-600">
                {stats.corrected}
              </div>
              <p className="text-orange-600">수정함</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-blue-600">
                {total}
              </div>
              <p className="text-blue-600">총 학습</p>
            </div>
          </div>
        </div>

        {noMoreFabrics && (
          <p className="text-sm text-gray-400 mb-4">
            이 카테고리의 미검증 원단을 모두 학습했습니다
          </p>
        )}
        {!noMoreFabrics && (
          <p className="text-sm text-gray-400 mb-4">
            남은 미검증 원단: {Math.max(0, remaining - total)}개
          </p>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={handleReclassify}
            className="w-full py-3.5 bg-gradient-gold text-white rounded-xl font-semibold hover:shadow-lg transition-all"
          >
            재분류 실행
          </button>
          <button
            onClick={handleBackToSelect}
            className="w-full py-3.5 bg-white text-[#8B6914] border-2 border-[#C49A6C] rounded-xl font-semibold hover:bg-[rgba(139,105,20,0.04)] transition-all"
          >
            저장만 하고 돌아가기
          </button>
        </div>
      </div>
    );
  }

  /* ───────── 3. 퀴즈 화면 (무한 모드) ───────── */

  // 원단이 없는 경우
  if (!loading && fabrics.length === 0) {
    return (
      <div className="pt-24 pb-16 text-center">
        <h1 className="text-2xl font-extrabold mb-4">
          검증할 원단이 없습니다
        </h1>
        <p className="text-gray-500 mb-6">
          {trainingLabel} — 미검증 원단이 없습니다
        </p>
        <button
          onClick={handleBackToSelect}
          className="px-8 py-3 bg-gradient-gold text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          카테고리 선택으로
        </button>
      </div>
    );
  }

  // 다음 배치 로딩 중
  if (loadingMore && !fabric) {
    return (
      <div className="pt-24 pb-16 flex justify-center">
        <div className="w-8 h-8 border-3 border-[#C49A6C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!fabric) return null;

  return (
    <div className="pt-24 pb-16 max-w-2xl mx-auto px-4">
      {/* 헤더 */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-extrabold mb-1">
          레퍼런스 <span className="text-gradient">강화</span>
        </h1>
        <p className="text-sm text-[#8B6914] font-semibold">
          {trainingLabel}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          AI 분류를 확인하고 수정해주세요 — 할수록 똑똑해집니다
        </p>
      </div>

      {/* 진행 정보 */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>현재 {current + 1}번째</span>
          <span>맞음 {stats.correct} / 수정 {stats.corrected}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-gold rounded-full transition-all duration-300"
            style={{
              width: `${fabrics.length > 0 ? (current / fabrics.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* 카드 */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        {/* 이미지 */}
        <div className="relative aspect-square max-h-[400px] bg-gray-100">
          {fabric.image_url && (
            <Image
              src={fabric.image_url}
              alt={fabric.name}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
          )}
        </div>

        <div className="p-6">
          {/* 원단 정보 */}
          <div className="mb-4">
            <h2 className="text-lg font-bold">{fabric.name}</h2>
            <p className="text-xs text-gray-400">Color: {fabric.color_code}</p>
          </div>

          {/* AI 추천 (기본 상태) */}
          {!editingPattern && !editingColor && (
            <>
              <div className="mb-4">
                <p className="text-xs font-bold text-gray-500 mb-2">
                  AI 패턴 분류
                </p>
                <span className="inline-block text-sm font-semibold text-[#8B6914] bg-[rgba(139,105,20,0.08)] px-4 py-2 rounded-lg">
                  {aiPattern}
                </span>
              </div>
              <div className="mb-6">
                <p className="text-xs font-bold text-gray-500 mb-2">
                  AI 색상 분류
                </p>
                <div className="flex gap-2 flex-wrap">
                  {aiColors.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg"
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full ${COLOR_DOTS[c] || "bg-gray-300"}`}
                      />
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex gap-3">
                <button
                  onClick={handleCorrect}
                  className="flex-1 py-3.5 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition-all"
                >
                  맞아
                </button>
                <button
                  onClick={handleStartEdit}
                  className="flex-1 py-3.5 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition-all"
                >
                  아니야
                </button>
              </div>
            </>
          )}

          {/* 패턴 수정 모드 */}
          {editingPattern && (
            <div>
              <p className="text-xs font-bold text-gray-500 mb-3">
                올바른 패턴을 선택하세요
              </p>
              <div className="flex gap-2 flex-wrap">
                {PATTERN_OPTIONS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePatternSelect(p)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                      selectedPattern === p
                        ? "bg-[#8B6914] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 색상 수정 모드 */}
          {editingColor && (
            <div>
              <p className="text-xs font-bold text-[#8B6914] mb-1">
                패턴: {selectedPattern}
              </p>
              <p className="text-xs font-bold text-gray-500 mb-3 mt-3">
                색상을 선택하세요 (여러 개 가능)
              </p>
              <div className="flex gap-2 flex-wrap mb-5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleColorToggle(c)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                      selectedColors.includes(c)
                        ? "ring-2 ring-[#8B6914] bg-white shadow-sm"
                        : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full ${COLOR_DOTS[c] || "bg-gray-300"}`}
                    />
                    {c}
                  </button>
                ))}
              </div>
              <button
                onClick={handleColorDone}
                disabled={selectedColors.length === 0}
                className="w-full py-3.5 bg-gradient-gold text-white rounded-xl font-semibold text-sm disabled:opacity-40 hover:shadow-lg transition-all"
              >
                확인 ({selectedColors.join(", ") || "색상 선택"})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 플로팅 그만하기 버튼 */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={handleStop}
          className="px-8 py-3 bg-white text-[#8B6914] border-2 border-[#C49A6C] rounded-full font-semibold text-sm shadow-lg hover:shadow-xl hover:bg-[rgba(139,105,20,0.04)] transition-all"
        >
          그만하기
        </button>
      </div>

      {/* 다음 배치 로딩 오버레이 */}
      {loadingMore && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-3 border-[#C49A6C] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="font-semibold text-sm">다음 원단 불러오는 중...</p>
          </div>
        </div>
      )}

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
