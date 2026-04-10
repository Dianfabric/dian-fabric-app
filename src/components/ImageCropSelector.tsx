"use client";
import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

export type CroppedRegion = {
  id: string;
  file: File;
  preview: string; // 크롭된 썸네일 URL
};

type Props = {
  imageUrl: string;       // 원본 이미지 URL (object URL)
  originalFile: File;     // 원본 파일
  onComplete: (regions: CroppedRegion[]) => void;
  onSearchFullImage: () => void;
  onCancel: () => void;
};

function getCroppedCanvas(
  image: HTMLImageElement,
  crop: PixelCrop,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width * scaleX;
  canvas.height = crop.height * scaleY;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(new File([blob!], name, { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  });
}

export default function ImageCropSelector({
  imageUrl,
  originalFile,
  onComplete,
  onSearchFullImage,
  onCancel,
}: Props) {
  const [crop, setCrop] = useState<Crop>();
  const [regions, setRegions] = useState<CroppedRegion[]>([]);
  const imgRef = useRef<HTMLImageElement>(null);

  const addRegion = useCallback(async () => {
    if (!crop || !imgRef.current) return;
    if (!crop.width || !crop.height) return;

    const pixelCrop: PixelCrop = {
      x: crop.unit === "%" ? (crop.x / 100) * imgRef.current.width : crop.x,
      y: crop.unit === "%" ? (crop.y / 100) * imgRef.current.height : crop.y,
      width: crop.unit === "%" ? (crop.width / 100) * imgRef.current.width : crop.width,
      height: crop.unit === "%" ? (crop.height / 100) * imgRef.current.height : crop.height,
      unit: "px",
    };

    const canvas = getCroppedCanvas(imgRef.current, pixelCrop);
    const preview = canvas.toDataURL("image/jpeg", 0.8);
    const idx = regions.length + 1;
    const file = await canvasToFile(canvas, `${originalFile.name}-crop-${idx}.jpg`);

    setRegions((prev) => [
      ...prev,
      {
        id: `crop-${Date.now()}-${idx}`,
        file,
        preview,
      },
    ]);
    setCrop(undefined);
  }, [crop, regions.length, originalFile.name]);

  const removeRegion = useCallback((id: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSearch = useCallback(() => {
    if (regions.length === 0) return;
    onComplete(regions);
  }, [regions, onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-[900px] w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-extrabold">원단 영역 선택</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              검색할 원단 부분을 드래그하여 선택하세요
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 크롭 영역 */}
        <div className="p-6">
          <div className="relative bg-gray-50 rounded-2xl overflow-hidden flex items-center justify-center">
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              className="max-h-[50vh]"
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="원본 이미지"
                style={{ maxHeight: "50vh", width: "auto" }}
                crossOrigin="anonymous"
              />
            </ReactCrop>
          </div>

          {/* 영역 추가 버튼 */}
          <div className="flex justify-center mt-4">
            <button
              onClick={addRegion}
              disabled={!crop || !crop.width || !crop.height}
              className="px-6 py-2.5 rounded-xl bg-[#8B6914] text-white text-sm font-semibold disabled:opacity-30 hover:bg-[#7A5C10] transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              선택 영역 추가
            </button>
          </div>
        </div>

        {/* 선택된 영역들 */}
        {regions.length > 0 && (
          <div className="px-6 pb-4">
            <p className="text-sm font-semibold text-gray-600 mb-3">
              선택된 영역 ({regions.length}개)
            </p>
            <div className="flex gap-3 flex-wrap">
              {regions.map((region, idx) => (
                <div key={region.id} className="relative group">
                  <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-[#C49A6C] shadow-sm">
                    <img
                      src={region.preview}
                      alt={`영역 ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {/* 번호 */}
                  <div className="absolute -top-2 -left-2 w-6 h-6 bg-[#8B6914] text-white rounded-full flex items-center justify-center text-xs font-bold shadow">
                    {idx + 1}
                  </div>
                  {/* 삭제 */}
                  <button
                    onClick={() => removeRegion(region.id)}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 하단 버튼 */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-3xl">
          <button
            onClick={onSearchFullImage}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            전체 이미지로 검색
          </button>
          <button
            onClick={handleSearch}
            disabled={regions.length === 0}
            className="px-8 py-2.5 rounded-xl bg-gradient-gold text-white text-sm font-bold disabled:opacity-30 hover:shadow-lg transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {regions.length}개 영역 검색
          </button>
        </div>
      </div>
    </div>
  );
}
