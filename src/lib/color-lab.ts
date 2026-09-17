/**
 * Deterministic colour signature (v4 search pipeline).
 *
 * - centre 60 % of the image only (phone photos have table / hands at the edges)
 * - grey-world white balance (phone lighting casts) — the raw variant is kept too
 * - CIE-LAB k-means++ with a FIXED seed (k = 4), near-duplicate clusters merged (ΔE < 8)
 * - similarity = greedy optimal cluster matching, independent of cluster order
 *
 * Shared by the server embed route, the DB regeneration script and the offline
 * experiments (scripts/exp/colors.mjs is the .mjs twin — keep them in sync).
 */
import sharp from "sharp";

export type LabCluster = { lab: number[]; pct: number };
export type ColorSignature = { wb: LabCluster[]; raw: LabCluster[] };

export function rgb2lab(r: number, g: number, b: number): number[] {
  const f = (c: number) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = h(x); y = h(y); z = h(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const d2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Seeded k-means++ on LAB pixels. `px` = array of [r,g,b]. */
export function signature(pxIn: number[][], k = 4, whiteBalance = true): LabCluster[] {
  let s = 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  let px = pxIn;
  if (whiteBalance) {
    const m = [0, 0, 0];
    for (const p of px) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
    const g = (m[0] + m[1] + m[2]) / 3;
    px = px.map((p) => [p[0] * g / m[0], p[1] * g / m[1], p[2] * g / m[2]].map((v) => Math.min(255, v)));
  }
  const lab = px.map((p) => rgb2lab(p[0], p[1], p[2]));
  const C: number[][] = [lab[Math.floor(rnd() * lab.length)]];
  while (C.length < k) {
    const ds = lab.map((p) => Math.min(...C.map((c) => d2(p, c))));
    const tot = ds.reduce((a, b) => a + b, 0);
    let r = rnd() * tot, i = 0;
    while (r > ds[i] && i < ds.length - 1) r -= ds[i++];
    C.push(lab[i]);
  }
  const assign = new Array<number>(lab.length).fill(0);
  for (let it = 0; it < 25; it++) {
    for (let i = 0; i < lab.length; i++) {
      let b = 0, bd = Infinity;
      for (let c = 0; c < k; c++) { const d = d2(lab[i], C[c]); if (d < bd) { bd = d; b = c; } }
      assign[i] = b;
    }
    const sum = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < lab.length; i++) { const a = sum[assign[i]]; a[0] += lab[i][0]; a[1] += lab[i][1]; a[2] += lab[i][2]; a[3]++; }
    for (let c = 0; c < k; c++) if (sum[c][3]) C[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  const cnt = C.map((_, c) => assign.filter((a) => a === c).length);
  const cl = C.map((c, i) => ({ lab: c.map((v) => +v.toFixed(1)), pct: +(cnt[i] / lab.length * 100).toFixed(1) }))
    .filter((c) => c.pct >= 3)
    .sort((a, b) => b.pct - a.pct);
  const merged: LabCluster[] = [];
  for (const c of cl) {
    const m = merged.find((x) => Math.sqrt(d2(x.lab, c.lab)) < 8);
    if (m) m.pct += c.pct; else merged.push({ ...c });
  }
  return merged.map((c) => ({ lab: c.lab, pct: +c.pct.toFixed(1) }));
}

/** Colour signature of an image buffer (jpeg/png/webp/heic-as-jpeg). */
export async function imageSignature(buf: Buffer): Promise<ColorSignature> {
  const img = sharp(buf).rotate();
  const m = await img.metadata();
  const w = m.width ?? 0, h = m.height ?? 0;
  const cw = Math.floor(w * 0.6), ch = Math.floor(h * 0.6);
  const { data } = await img
    .extract({ left: Math.floor((w - cw) / 2), top: Math.floor((h - ch) / 2), width: cw, height: ch })
    .resize(64, 64, { fit: "fill" })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px: number[][] = [];
  for (let i = 0; i < data.length; i += 3) px.push([data[i], data[i + 1], data[i + 2]]);
  return { wb: signature(px, 4, true), raw: signature(px, 4, false) };
}

/**
 * CIE94-style colour difference (graphic-arts weights, kL = 2): lightness counts half, chroma and hue count fully.
 * A purple (54,7,-12) vs a grey (54,1,-4) of the same lightness is ΔE94 ≈ 8.7, while a phone-lit shot of the
 * same fabric (L +8, small a/b drift) is ≈ 5 — so hue/chroma differences separate colours while lighting does not.
 */
export function deltaE94(l1: number[], l2: number[]): number {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const dL = L1 - L2, dC = C1 - C2, da = a1 - a2, db = b1 - b2;
  const dH2 = Math.max(0, da * da + db * db - dC * dC);
  const sL = dL / 2, sC = dC / (1 + 0.045 * C1), sH = Math.sqrt(dH2) / (1 + 0.015 * C1);
  return Math.sqrt(sL * sL + sC * sC + sH * sH);
}

/**
 * 0..1 similarity between two signatures; order independent (greedy best-pair matching, weighted by shared %).
 * Steep by design: ΔE94 20 (a clearly different colour) → 0; ΔE94 5 (same fabric, different lighting) → 0.75.
 */
export function signatureSimilarity(q: LabCluster[] | null | undefined, f: LabCluster[] | null | undefined, maxDeltaE = 20): number {
  if (!q?.length || !f?.length) return 0;
  const pairs: { a: LabCluster; b: LabCluster; sim: number }[] = [];
  const chroma = (lab: number[]) => Math.hypot(lab[1], lab[2]);
  for (const a of q) for (const b of f) {
    const dE = deltaE94(a.lab, b.lab);
    let sim = Math.max(0, 1 - dE / maxDeltaE);
    // a clearly coloured cluster against a neutral one (or vice versa) is a different colour family even when
    // ΔE is modest (muted purple vs grey): halve the pair similarity
    const ca = chroma(a.lab), cb = chroma(b.lab);
    if ((ca > 8 && cb < 5) || (ca < 5 && cb > 8)) sim *= 0.5;
    pairs.push({ a, b, sim });
  }
  pairs.sort((x, y) => y.sim - x.sim);
  const ua = new Set<LabCluster>(), ub = new Set<LabCluster>();
  let t = 0;
  for (const p of pairs) {
    if (ua.has(p.a) || ub.has(p.b)) continue;
    ua.add(p.a); ub.add(p.b);
    t += p.sim * Math.min(p.a.pct, p.b.pct) / 100;
  }
  return t;
}
