"use client";
import { useState, useEffect } from "react";
import Link from "next/link";

type Variant = {
  id: string;
  name: string;
  color_code: string;
  image_url: string | null;
  price_per_yard?: number | null;
};

type Fabric = {
  id: string;
  name: string;
  color_code: string;
  image_url: string | null;
  fabric_type?: string | null;
  pattern_detail?: string | null;
  usage_types?: string[] | null;
  price_per_yard?: number | null;
};

type Props = {
  fabric: Fabric | null;
  onClose: () => void;
};

export default function QuickViewPanel({ fabric, onClose }: Props) {
  const [current, setCurrent] = useState<Fabric | null>(fabric);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState<Variant | null>(null); // 컬러 hover 시 상단 이미지 미리보기

  // 초기/변경 시 데이터 로드
  useEffect(() => {
    setHovered(null);
    if (!fabric) {
      setCurrent(null);
      setVariants([]);
      return;
    }
    setCurrent(fabric);
    setLoading(true);
    fetch(`/api/fabrics/${fabric.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.id) setCurrent(d);
        setVariants(d.colorVariants || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [fabric]);

  // 컬러 변형 클릭 → 패널 내용 업데이트
  const selectVariant = async (v: Variant) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/fabrics/${v.id}`);
      const d = await res.json();
      if (d.id) setCurrent(d);
      if (d.colorVariants) setVariants(d.colorVariants);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  // ESC로 닫기
  useEffect(() => {
    if (!fabric) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fabric, onClose]);

  // body 스크롤 잠금
  useEffect(() => {
    if (!fabric) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = orig;
    };
  }, [fabric]);

  if (!fabric) return null;
  const f = current || fabric;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
      />

      {/* Slide-in Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-[480px] bg-white z-50 shadow-[-8px_0_30px_rgba(0,0,0,0.15)] flex flex-col animate-slide-in-right">
        {/* Header (고정) */}
        <div className="flex-none bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
          <span className="text-xs font-bold text-[#1E2A3A] tracking-wider">미리 보기</span>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
            title="닫기 (ESC)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Hero Image (고정) — 컬러 hover 시 해당 컬러 이미지 미리보기 */}
        <div className="flex-none aspect-square bg-gray-50 relative">
          {(hovered?.image_url || f.image_url) ? (
            <img
              src={hovered?.image_url || f.image_url || ""}
              alt={`${f.name}-${hovered?.color_code || f.color_code}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No Image
            </div>
          )}
          {/* 현재 보고 있는 컬러 라벨 */}
          <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs font-bold px-2.5 py-1 rounded-md backdrop-blur-sm">
            {hovered?.color_code || f.color_code}
          </div>
          {loading && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-[#1E2A3A] rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* 스크롤 영역 (정보 + 컬러) */}
        <div className="flex-1 overflow-y-auto">
        {/* Info */}
        <div className="px-6 py-5">
          <div className="text-2xl font-extrabold mb-1">{f.name}</div>
          <div className="text-sm text-gray-500 mb-4">Color: {f.color_code}</div>

          <div className="flex gap-2 flex-wrap mb-4">
            {f.fabric_type && (
              <span className="text-sm font-semibold text-[#1E2A3A] bg-[#EEF1F4] px-3 py-1.5 rounded-md">
                {f.fabric_type}
              </span>
            )}
            {f.pattern_detail && (
              <span className="text-sm font-semibold text-white bg-[#1E2A3A] px-3 py-1.5 rounded-md">
                {f.pattern_detail}
              </span>
            )}
          </div>

          {f.usage_types && f.usage_types.length > 0 && (
            <div className="flex justify-between py-2.5 text-base border-b border-gray-100">
              <span className="text-gray-500">사용처</span>
              <span className="font-bold">{f.usage_types.join(", ")}</span>
            </div>
          )}
          {f.price_per_yard && (
            <div className="flex justify-between py-2.5 text-base">
              <span className="text-gray-500">가격</span>
              <span className="font-bold text-[#1E2A3A]">
                ₩{f.price_per_yard.toLocaleString()}/Y
              </span>
            </div>
          )}
        </div>

        {/* Color Variants */}
        {variants.length > 0 && (
          <div className="px-6 py-5 border-t border-gray-100">
            <div className="text-sm font-bold text-gray-600 mb-3 flex items-center justify-between">
              <span>다른 컬러</span>
              <span className="text-xs text-gray-400 font-normal">{variants.length}개</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => selectVariant(v)}
                  onMouseEnter={() => setHovered(v)}
                  onMouseLeave={() => setHovered(null)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square ${
                    (hovered?.id || f.id) === v.id
                      ? "border-[#1E2A3A] scale-105 shadow-md"
                      : "border-transparent hover:border-[#1E2A3A]"
                  }`}
                  title={v.color_code}
                >
                  {v.image_url && (
                    <img
                      src={v.image_url}
                      alt={v.color_code}
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/65 text-white text-[10px] py-0.5 text-center font-bold tracking-wide">
                    {v.color_code}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {variants.length === 0 && !loading && (
          <div className="px-6 py-4 border-t border-gray-100 text-center text-sm text-gray-400">
            컬러 변형이 없습니다
          </div>
        )}
        </div>
        {/* /스크롤 영역 */}

        {/* Footer Action (고정) */}
        <div className="flex-none px-6 py-5 border-t border-gray-100 bg-white">
          <Link
            href={`/fabric/${f.id}`}
            className="block w-full text-center bg-gradient-to-r from-[#1E2A3A] to-[#1E2A3A] text-white py-3 rounded-xl font-bold hover:shadow-lg transition-shadow"
          >
            상세 페이지로 이동 →
          </Link>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
