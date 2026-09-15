/**
 * Server-side DINOv2 embedding (v4 search pipeline).
 *
 * ONE pipeline for both the catalogue (DB regeneration) and the query (API route), so the
 * two sides live in the same feature space. The old setup mixed Colab fp32 vectors with
 * browser q8 vectors: cosine between q8 and fp32 CLS of the SAME image is only ~0.42
 * (fp16 = 1.000, q4f16 = 0.95, q8/uint8 = 0.37 — measured 2026-09-15 on 30 catalogue images).
 *
 * Model dtype comes from DINO_DTYPE (default fp16; q4f16 is the 50 MB fallback if the
 * Vercel function size limit bites). Whatever is chosen, regenerate the DB with the same value.
 *
 * Runs in Node only (sharp + onnxruntime-node). Used by src/app/api/embed/route.ts and
 * scripts/regen-embeddings-v4.mjs (via node --experimental-strip-types).
 */
import sharp from "sharp";

export const DINO_MODEL = "Xenova/dinov2-base";
export const DINO_DTYPE = (process.env.DINO_DTYPE || "fp16") as "fp32" | "fp16" | "q4f16" | "q4";
export const DINO_DIM = 768;
/** Working size fed to the HF processor (it resizes to 256 / centre-crops 224 itself). */
const WORK_SIZE = 448;

export type DinoVariant = "full" | "gray" | "crop" | "tiles";
export type DinoEmbedding = {
  cls: number[];            // L2-normalised CLS token (global appearance)
  mean: number[];           // L2-normalised mean of patch tokens (texture)
};
export type DinoFeatures = {
  full: DinoEmbedding;
  gray?: DinoEmbedding;     // grayscale input → texture without colour
  crop?: DinoEmbedding;     // centre 50 % crop (matches legacy embedding_dino_crop)
  tiles?: number[][];       // 2x2 tile CLS vectors (multi-vector matching)
};

type Loaded = { processor: (img: unknown) => Promise<unknown>; model: (inputs: unknown) => Promise<{ last_hidden_state: { dims: number[]; data: Float32Array | Float16Array | number[] } }>; RawImage: new (data: Uint8ClampedArray, w: number, h: number, c: number) => unknown };

const g = globalThis as unknown as { __dinoServer?: Promise<Loaded> };

async function load(): Promise<Loaded> {
  if (!g.__dinoServer) {
    g.__dinoServer = (async () => {
      const { AutoModel, AutoProcessor, RawImage, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      // Vercel functions have a read-only bundle; /tmp is the only writable place for the model cache.
      env.cacheDir = process.env.DINO_CACHE_DIR || (process.env.VERCEL ? "/tmp/hf-cache" : env.cacheDir);
      const [processor, model] = await Promise.all([
        AutoProcessor.from_pretrained(DINO_MODEL),
        AutoModel.from_pretrained(DINO_MODEL, { dtype: DINO_DTYPE }),
      ]);
      return { processor: processor as unknown as Loaded["processor"], model: model as unknown as Loaded["model"], RawImage: RawImage as unknown as Loaded["RawImage"] };
    })().catch((e) => { g.__dinoServer = undefined; throw e; });
  }
  return g.__dinoServer;
}

export const l2 = (v: number[]): number[] => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 0 ? v.map((x) => x / n) : v;
};

async function embedSharp(img: sharp.Sharp): Promise<DinoEmbedding> {
  const { processor, model, RawImage } = await load();
  const { data, info } = await img.removeAlpha().resize(WORK_SIZE, WORK_SIZE, { fit: "cover" }).raw().toBuffer({ resolveWithObject: true });
  const raw = new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels);
  const out = await model(await processor(raw));
  const h = out.last_hidden_state;
  const [, seq, dim] = h.dims;
  const d = h.data as ArrayLike<number>;
  const cls = Array.from({ length: dim }, (_, k) => d[k]);
  const mean = new Array<number>(dim).fill(0);
  for (let t = 1; t < seq; t++) for (let k = 0; k < dim; k++) mean[k] += d[t * dim + k];
  for (let k = 0; k < dim; k++) mean[k] /= seq - 1;
  return { cls: l2(cls), mean: l2(mean) };
}

/**
 * Compute the requested DINOv2 variants for one image buffer. Always returns `full`;
 * pass `variants` to add gray / crop / tiles. EXIF orientation is honoured.
 */
export async function embedImage(buf: Buffer, variants: DinoVariant[] = ["full"]): Promise<DinoFeatures> {
  const base = sharp(buf).rotate();
  const m = await base.metadata();
  const w = m.width ?? 0, h = m.height ?? 0;
  const center = (img: sharp.Sharp, frac: number) => {
    const cw = Math.floor(w * frac), ch = Math.floor(h * frac);
    return img.extract({ left: Math.floor((w - cw) / 2), top: Math.floor((h - ch) / 2), width: cw, height: ch });
  };
  const out: DinoFeatures = { full: await embedSharp(base.clone()) };
  if (variants.includes("gray")) out.gray = await embedSharp(base.clone().grayscale().toColourspace("srgb"));
  if (variants.includes("crop")) out.crop = await embedSharp(center(base.clone(), 0.5));
  if (variants.includes("tiles")) {
    const tw = Math.floor(w / 2), th = Math.floor(h / 2);
    out.tiles = [];
    for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const e = await embedSharp(base.clone().extract({ left: tx * tw, top: ty * th, width: tw, height: th }));
      out.tiles.push(e.cls);
    }
  }
  return out;
}

export const cosine = (a: number[], b: number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Multi-vector score: mean over query tiles of the best-matching catalogue tile. */
export const tileScore = (q: number[][], f: number[][]): number => {
  let s = 0;
  for (const qa of q) { let best = -1; for (const fb of f) { const d = cosine(qa, fb); if (d > best) best = d; } s += best; }
  return s / q.length;
};

/** Serialise for pgvector text input. */
export const toVectorString = (v: number[]): string => `[${v.map((x) => +x.toFixed(6)).join(",")}]`;
