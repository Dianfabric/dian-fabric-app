/**
 * LAB 색공간 변환 + 색상 클러스터 추출 (브라우저)
 *
 * 1. 이미지에서 픽셀 샘플링
 * 2. RGB → LAB 변환
 * 3. K-means로 5개 주요 클러스터 추출
 * 4. 15차원 벡터로 반환 (5 × L,a,b)
 */

// ─── RGB → XYZ → LAB (D65 illuminant, sRGB) ───
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let R = r / 255, G = g / 255, B = b / 255;
  R = R > 0.04045 ? Math.pow((R + 0.055) / 1.055, 2.4) : R / 12.92;
  G = G > 0.04045 ? Math.pow((G + 0.055) / 1.055, 2.4) : G / 12.92;
  B = B > 0.04045 ? Math.pow((B + 0.055) / 1.055, 2.4) : B / 12.92;
  const X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) * 100;
  const Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) * 100;
  const Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) * 100;
  const Xn = 95.047, Yn = 100, Zn = 108.883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fX = f(X / Xn), fY = f(Y / Yn), fZ = f(Z / Zn);
  return [116 * fY - 16, 500 * (fX - fY), 200 * (fY - fZ)];
}

// ─── 이미지에서 픽셀 샘플링 ───
async function samplePixels(file: File, maxSize = 200): Promise<Array<[number, number, number]>> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });

  // 비율 유지하며 다운샘플 (성능)
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const w = Math.floor(img.width * scale);
  const h = Math.floor(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const pixels: Array<[number, number, number]> = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  URL.revokeObjectURL(img.src);
  return pixels;
}

// ─── K-means 클러스터링 (RGB 공간) ───
function kmeans(
  pixels: Array<[number, number, number]>,
  k = 5,
  maxIter = 20,
): Array<{ centroid: [number, number, number]; count: number }> {
  if (pixels.length === 0) return [];
  const n = pixels.length;

  // 초기 중심: 픽셀 중 무작위 k개
  const centroids: Array<[number, number, number]> = [];
  for (let i = 0; i < k; i++) {
    centroids.push([...pixels[Math.floor(Math.random() * n)]] as [number, number, number]);
  }

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    // 각 픽셀을 가장 가까운 중심에 할당
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let j = 0; j < k; j++) {
        const dr = pixels[i][0] - centroids[j][0];
        const dg = pixels[i][1] - centroids[j][1];
        const db = pixels[i][2] - centroids[j][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minDist) { minDist = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    // 중심 재계산
    const sums: Array<[number, number, number]> = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        centroids[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]];
      }
    }
  }

  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;

  return centroids.map((centroid, i) => ({ centroid, count: counts[i] }));
}

/**
 * 이미지에서 LAB 클러스터 벡터 추출 (15차원)
 * 비율 큰 순서로 5개 클러스터, 각 L,a,b
 */
export async function extractLabClusters(file: File): Promise<{
  labVector: number[];
  clusters: Array<{ lab: [number, number, number]; rgb: [number, number, number]; pct: number }>;
}> {
  const pixels = await samplePixels(file);
  const clusters = kmeans(pixels, 5);

  // 비율 큰 순으로 정렬
  clusters.sort((a, b) => b.count - a.count);
  const total = pixels.length;

  const result = clusters.slice(0, 5).map((c) => {
    const rgb: [number, number, number] = [
      Math.round(c.centroid[0]), Math.round(c.centroid[1]), Math.round(c.centroid[2]),
    ];
    const lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
    const pct = Math.round((c.count / total) * 100);
    return { lab, rgb, pct };
  });

  // 15차원 벡터 (5개 클러스터 × L,a,b)
  const labVector: number[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < result.length) {
      labVector.push(...result[i].lab);
    } else {
      labVector.push(0, 0, 0);
    }
  }

  return { labVector, clusters: result };
}
