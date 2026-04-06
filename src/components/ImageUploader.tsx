"use client";
import { useState, useCallback } from "react";

type Props = {
  onUpload: (file: File) => void;
  isLoading?: boolean;
};

export default function ImageUploader({ onUpload, isLoading }: Props) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setPreview(URL.createObjectURL(file));
      onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <label
      className={`block bg-white rounded-3xl p-12 text-center border-2 border-dashed cursor-pointer upload-hover ${
        dragActive
          ? "border-[#C49A6C] bg-[#FFFDF9]"
          : "border-gray-200"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        disabled={isLoading}
      />

      {preview ? (
        <div className="flex flex-col items-center gap-4">
          <img
            src={preview}
            alt="업로드된 이미지"
            className="max-h-48 rounded-xl object-contain"
          />
          {isLoading ? (
            <div className="flex items-center gap-2 text-[#8B6914] text-sm font-semibold">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              AI가 분석 중입니다...
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              다른 이미지를 올려서 다시 검색할 수 있어요
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="w-20 h-20 bg-[linear-gradient(135deg,rgba(139,105,20,0.1),rgba(196,154,108,0.15))] rounded-[20px] flex items-center justify-center mx-auto mb-5">
            <svg
              className="w-8 h-8 text-[#8B6914]"
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
          <h3 className="text-xl font-bold mb-2">이미지를 드래그하거나 클릭</h3>
          <p className="text-sm text-gray-400">
            레퍼런스 이미지, 인테리어 사진, 핀터레스트 이미지 모두 OK
          </p>
          <div className="flex gap-2 justify-center mt-5">
            {["JPG", "PNG", "WEBP", "Max 10MB"].map((f) => (
              <span
                key={f}
                className="text-[11px] font-semibold text-gray-400 bg-gray-100 px-3 py-1 rounded-lg"
              >
                {f}
              </span>
            ))}
          </div>
        </>
      )}
    </label>
  );
}
