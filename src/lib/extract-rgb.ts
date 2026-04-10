/**
 * 브라우저에서 이미지 파일의 평균 RGB 추출
 * 중앙 70% 영역만 사용 (테두리/배경 제거)
 */
export async function extractImageRGB(file: File): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 100; // 리사이즈 크기
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }

      // 중앙 70% 크롭
      const srcW = img.width * 0.7;
      const srcH = img.height * 0.7;
      const srcX = (img.width - srcW) / 2;
      const srcY = (img.height - srcH) / 2;

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;

      let totalR = 0, totalG = 0, totalB = 0;
      const pixels = size * size;

      for (let i = 0; i < data.length; i += 4) {
        totalR += data[i];
        totalG += data[i + 1];
        totalB += data[i + 2];
      }

      resolve([
        Math.round(totalR / pixels),
        Math.round(totalG / pixels),
        Math.round(totalB / pixels),
      ]);

      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(file);
  });
}
