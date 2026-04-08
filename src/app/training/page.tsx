"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

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

export default function TrainingPage() {
  const [fabrics, setFabrics] = useState<QuizFabric[]>([]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [stats, setStats] = useState({ correct: 0, corrected: 0 });

  // 수정 모드
  const [editingPattern, setEditingPattern] = useState(false);
  const [editingColor, setEditingColor] = useState(false);
  const [selectedPattern, setSelectedPattern] = useState("");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  const loadQuiz = useCallback(async () => {
    setLoading(true);
    setDone(false);
    setCurrent(0);
    setAnswers([]);
    setStats({ correct: 0, corrected: 0 });
    try {
      const res = await fetch("/api/training");
      const data = await res.json();
      setFabrics(data.fabrics || []);
      setRemaining(data.remaining || 0);
    } catch {
      setFabrics([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  const fabric = fabrics[current];
  const aiPattern = fabric?.pattern_detail || fabric?.fabric_type || "무지";
  const aiColors = fabric?.notes?.split(",") || [];

  const handleCorrect = useCallback(() => {
    // AI 맞음
    const answer: Answer = {
      id: fabric.id,
      fabric_type: fabric.fabric_type || "무지",
      pattern_detail: fabric.pattern_detail,
      colors: aiColors,
      confirmed: true,
    };
    setAnswers((prev) => [...prev, answer]);
    setStats((prev) => ({ ...prev, correct: prev.correct + 1 }));
    setEditingPattern(false);
    setEditingColor(false);

    if (current + 1 < fabrics.length) {
      setCurrent(current + 1);
    } else {
      submitAnswers([...answers, answer]);
    }
  }, [fabric, current, fabrics.length, answers, aiColors]);

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
    const SUB_PATTERNS = [
      "부클", "하운드투스", "스트라이프", "체크", "헤링본",
      "추상", "자연", "동물", "식물", "큰패턴", "자카드", "린넨", "시어",
    ];
    const isSubPattern = SUB_PATTERNS.includes(selectedPattern);
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
    setStats((prev) => ({ ...prev, corrected: prev.corrected + 1 }));
    setEditingPattern(false);
    setEditingColor(false);

    if (current + 1 < fabrics.length) {
      setCurrent(current + 1);
    } else {
      submitAnswers([...answers, answer]);
    }
  }, [fabric, selectedPattern, selectedColors, current, fabrics.length, answers]);

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
    setDone(true);
  };

  if (loading) {
    return (
      <div className="pt-24 pb-16 flex justify-center">
        <div className="w-8 h-8 border-3 border-[#C49A6C] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (fabrics.length === 0) {
    return (
      <div className="pt-24 pb-16 text-center">
        <h1 className="text-2xl font-extrabold mb-4">
          모든 원단이 검증되었습니다! 🎉
        </h1>
        <p className="text-gray-500">더 이상 검증할 원단이 없습니다</p>
      </div>
    );
  }

  if (done) {
    const total = stats.correct + stats.corrected;
    const accuracy = total > 0 ? ((stats.correct / total) * 100).toFixed(0) : 0;
    return (
      <div className="pt-24 pb-16 max-w-lg mx-auto px-4 text-center">
        <h1 className="text-3xl font-extrabold mb-6">
          퀴즈 완료! 🎉
        </h1>
        <div className="bg-white rounded-2xl border border-gray-100 p-8 mb-6">
          <div className="text-5xl font-extrabold text-gradient mb-2">
            {accuracy}%
          </div>
          <p className="text-sm text-gray-500 mb-6">AI 정확도</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-green-50 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-green-600">
                {stats.correct}
              </div>
              <p className="text-green-600">AI 맞음 ✅</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-4">
              <div className="text-2xl font-extrabold text-orange-600">
                {stats.corrected}
              </div>
              <p className="text-orange-600">수정함 ✏️</p>
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          남은 미검증 원단: {Math.max(0, remaining - total)}개
        </p>
        <button
          onClick={loadQuiz}
          className="px-8 py-3 bg-gradient-gold text-white rounded-xl font-semibold hover:shadow-lg transition-all"
        >
          20개 더 하기
        </button>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-16 max-w-2xl mx-auto px-4">
      {/* 헤더 */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-extrabold mb-1">
          레퍼런스 <span className="text-gradient">강화</span>
        </h1>
        <p className="text-sm text-gray-400">
          AI 분류를 확인하고 수정해주세요 — 할수록 똑똑해집니다
        </p>
      </div>

      {/* 진행률 */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{current + 1} / {fabrics.length}</span>
          <span>✅ {stats.correct} &nbsp; ✏️ {stats.corrected}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-gold rounded-full transition-all duration-300"
            style={{ width: `${((current) / fabrics.length) * 100}%` }}
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
                  맞아 ✅
                </button>
                <button
                  onClick={handleStartEdit}
                  className="flex-1 py-3.5 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 transition-all"
                >
                  아니야 ✏️
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
                패턴: {selectedPattern} ✓
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
