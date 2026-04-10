"use client";
import { useState, useCallback, useEffect } from "react";

type LightboxImage = {
  src: string;
  name: string;
  colorCode?: string;
  similarity?: number;
  patternDetail?: string;
  fabricType?: string;
  price?: number;
};

type Props = {
  images: LightboxImage[];
  currentIndex: number;
  onClose: () => void;
};

export default function ImageLightbox({ images, currentIndex, onClose }: Props) {
  const [index, setIndex] = useState(currentIndex);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const img = images[index];
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const goTo = useCallback((newIndex: number) => {
    setIndex(newIndex);
    resetZoom();
  }, [resetZoom]);

  // 키보드 조작
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) goTo(index - 1);
      if (e.key === "ArrowRight" && hasNext) goTo(index + 1);
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(z + 0.5, 5));
      if (e.key === "-") setZoom((z) => Math.max(z - 0.5, 1));
      if (e.key === "0") resetZoom();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, hasPrev, hasNext, index, goTo, resetZoom]);

  // 스크롤 줌
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.3 : 0.3;
    setZoom((z) => {
      const newZ = Math.max(1, Math.min(z + delta, 5));
      if (newZ === 1) setPosition({ x: 0, y: 0 });
      return newZ;
    });
  }, []);

  // 드래그 이동 (줌 상태일 때)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 더블클릭 줌 토글
  const handleDoubleClick = useCallback(() => {
    if (zoom > 1) {
      resetZoom();
    } else {
      setZoom(3);
    }
  }, [zoom, resetZoom]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* 좌우 화살표 */}
      {hasPrev && (
        <button
          onClick={() => goTo(index - 1)}
          className="absolute left-4 z-10 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}
      {hasNext && (
        <button
          onClick={() => goTo(index + 1)}
          className="absolute right-4 z-10 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* 이미지 */}
      <div
        className="relative max-w-[90vw] max-h-[85vh] overflow-hidden"
        onWheel={handleWheel}
      >
        <img
          src={img.src}
          alt={`${img.name} ${img.colorCode || ""}`}
          className="max-w-[90vw] max-h-[80vh] object-contain select-none"
          style={{
            transform: `scale(${zoom}) translate(${position.x / zoom}px, ${position.y / zoom}px)`,
            cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "zoom-in",
            transition: isDragging ? "none" : "transform 0.2s ease",
          }}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          draggable={false}
        />
      </div>

      {/* 하단 정보 바 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16">
        <div className="max-w-[600px] mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <h3 className="text-white text-lg font-bold">{img.name}</h3>
            {img.colorCode && (
              <span className="text-white/60 text-sm">Color: {img.colorCode}</span>
            )}
            {img.similarity && (
              <span className="text-[#C49A6C] text-sm font-semibold">
                {(img.similarity * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {img.fabricType && (
              <span className="text-xs text-white/80 bg-white/10 px-2 py-0.5 rounded">
                {img.fabricType}
              </span>
            )}
            {img.patternDetail && (
              <span className="text-xs text-white bg-[#8B6914] px-2 py-0.5 rounded">
                {img.patternDetail}
              </span>
            )}
            {img.price && (
              <span className="text-xs text-[#C49A6C]">
                ₩{img.price.toLocaleString()}/Y
              </span>
            )}
          </div>
          {/* 인덱스 + 줌 힌트 */}
          <div className="mt-3 text-white/40 text-xs">
            {index + 1} / {images.length}
            {zoom > 1 ? ` · ${zoom.toFixed(1)}x 확대` : " · 더블클릭 또는 스크롤로 확대"}
          </div>
        </div>
      </div>

      {/* 하단 썸네일 바 */}
      {images.length > 1 && (
        <div className="absolute bottom-28 left-0 right-0 flex justify-center gap-1.5 px-4 overflow-x-auto">
          {images.map((im, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                i === index
                  ? "border-[#C49A6C] opacity-100 scale-110"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
            >
              <img
                src={im.src}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
