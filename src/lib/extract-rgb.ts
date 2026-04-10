/**
 * 브라우저에서 이미지 파일의 주요 색상(최대 3개) + 비율 추출
 * K-means 클러스터링으로 색상 분포 분석
 */

export type ColorCluster = { rgb: number[]; pct: number };

function kMeansClusters(pixels: number[][], k = 3, maxIter = 15): ColorCluster[] {
  const n = pixels.length;
  if (n === 0) return [];

  const centers: number[][] = [];
  for (let i = 0; i < k; i++) {
    centers.push([...pixels[Math.floor((i / k) * n)]]);
  }

  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity, best = 0;
      for (let c = 0; c < k; c++) {
        const dr = pixels[i][0] - centers[c][0];
        const dg = pixels[i][1] - centers[c][1];
        const db = pixels[i][2] - centers[c][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) { minDist = dist; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    for (let c = 0; c < k; c++) {
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) {
          sumR += pixels[i][0]; sumG += pixels[i][1]; sumB += pixels[i][2];
          count++;
        }
      }
      if (count > 0) {
        centers[c] = [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)];
      }
    }
  }

  const counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[assignments[i]]++;

  const results: ColorCluster[] = [];
  for (let c = 0; c < k; c++) {
    const pct = Math.round((counts[c] / n) * 100);
    if (pct >= 5) results.push({ rgb: centers[c], pct });
  }

  results.sort((a, b) => b.pct - a.pct);
  const total = results.reduce((s, r) => s + r.pct, 0);
  if (total > 0 && total !== 100) results[0].pct += (100 - total);

  return results;
}

function mergeSimiColors(clusters: ColorCluster[], threshold = 40): ColorCluster[] {
  const merged = clusters.map(c => ({ rgb: [...c.rgb], pct: c.pct }));
  for (let i = 0; i < merged.length; i++) {
    for (let j = i + 1; j < merged.length; j++) {
      const dr = merged[i].rgb[0] - merged[j].rgb[0];
      const dg = merged[i].rgb[1] - merged[j].rgb[1];
      const db = merged[i].rgb[2] - merged[j].rgb[2];
      if (Math.sqrt(dr * dr + dg * dg + db * db) < threshold) {
        const totalPct = merged[i].pct + merged[j].pct;
        const w1 = merged[i].pct / totalPct, w2 = merged[j].pct / totalPct;
        merged[i].rgb = [
          Math.round(merged[i].rgb[0] * w1 + merged[j].rgb[0] * w2),
          Math.round(merged[i].rgb[1] * w1 + merged[j].rgb[1] * w2),
          Math.round(merged[i].rgb[2] * w1 + merged[j].rgb[2] * w2),
        ];
        merged[i].pct = totalPct;
        merged.splice(j, 1);
        j--;
      }
    }
  }
  return merged;
}

export async function extractImageColors(file: File): Promise<ColorCluster[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 50;
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

      const pixels: number[][] = [];
      for (let i = 0; i < data.length; i += 4) {
        pixels.push([data[i], data[i + 1], data[i + 2]]);
      }

      let clusters = kMeansClusters(pixels, 4, 20);
      clusters = mergeSimiColors(clusters, 40);

      URL.revokeObjectURL(img.src);
      resolve(clusters.slice(0, 3));
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(file);
  });
}

/** 하위 호환: 기존 extractImageRGB 대체 (1번째 색상의 RGB 반환) */
export async function extractImageRGB(file: File): Promise<number[]> {
  const clusters = await extractImageColors(file);
  return clusters.length > 0 ? clusters[0].rgb : [128, 128, 128];
}
