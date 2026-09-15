// Offline embedding experiment: several DINOv2 variants on the local image pool.
// Usage: node scripts/exp/embed.mjs <variant> [imagesDir] [outPrefix]
//   variant = q8 | fp32 | fp16 | q4f16 | gray | crop | graycrop | tile   (q4f16 = 50MB model, Vercel-deployable candidate)
//   q8/fp32  : full image, 448 cover resize, CLS + patch-mean
//   gray     : grayscale (texture only), fp32
//   crop     : center 50% crop (matches DB embedding_dino_crop), fp32
//   graycrop : grayscale + center 50% crop, fp32
//   tile     : 2x2 tiles of the full image -> 4 CLS vectors (multi-vector) + their mean, fp32
// imagesDir/outPrefix are optional (used by the synthetic phone-photo set).
import fs from "fs";
import sharp from "sharp";
import { AutoModel, AutoProcessor, RawImage, env as hfenv } from "@huggingface/transformers";
const S = "scripts/exp/data";
const variant = process.argv[2] || "q8";
const imagesDir = process.argv[3] || `${S}/images`;
const outFile = `${S}/${process.argv[4] || "emb"}-${variant}.json`;
const ids = fs.readdirSync(imagesDir).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4));
console.log("variant", variant, "images", ids.length, "->", outFile);
hfenv.cacheDir = "scripts/exp/hf-cache";
const dtype = ["q8", "fp16", "q4f16", "q4"].includes(variant) ? variant : "fp32"; // q8 CLS drifts far from fp32 (cos ~0.42), so every other variant runs fp32
const processor = await AutoProcessor.from_pretrained("Xenova/dinov2-base");
const model = await AutoModel.from_pretrained("Xenova/dinov2-base", { dtype });
const l2 = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return n > 0 ? v.map((x) => x / n) : v; };
const r5 = (v) => v.map((x) => +x.toFixed(5));
async function embedSharp(img) {
  const { data, info } = await img.removeAlpha().resize(448, 448, { fit: "cover" }).raw().toBuffer({ resolveWithObject: true });
  const raw = new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels);
  const o = await model(await processor(raw));
  const h = o.last_hidden_state; const [, seq, dim] = h.dims; const d = h.data;
  const cls = Array.from(d.slice(0, dim));
  const mean = new Array(dim).fill(0);
  for (let t = 1; t < seq; t++) for (let k = 0; k < dim; k++) mean[k] += d[t * dim + k];
  for (let k = 0; k < dim; k++) mean[k] /= seq - 1;
  return { cls: l2(cls), mean: l2(mean) };
}
const out = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : {};
let t0 = Date.now(), n = 0;
for (const id of ids) {
  if (out[id]) continue;
  try {
    const buf = fs.readFileSync(`${imagesDir}/${id}.jpg`);
    const base = sharp(buf).rotate();
    const m = await base.metadata();
    const center = (img, frac) => { const cw = Math.floor(m.width * frac), ch = Math.floor(m.height * frac); return img.extract({ left: Math.floor((m.width - cw) / 2), top: Math.floor((m.height - ch) / 2), width: cw, height: ch }); };
    if (variant === "tile") {
      const tw = Math.floor(m.width / 2), th = Math.floor(m.height / 2);
      const tiles = [];
      for (const [tx, ty] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const e = await embedSharp(base.clone().extract({ left: tx * tw, top: ty * th, width: tw, height: th }));
        tiles.push(e.cls);
      }
      const mean = new Array(tiles[0].length).fill(0);
      for (const t of tiles) for (let k = 0; k < mean.length; k++) mean[k] += t[k] / tiles.length;
      out[id] = { tiles: tiles.map(r5), cls: r5(l2(mean)), mean: r5(l2(mean)) };
    } else {
      let img = base.clone();
      if (variant === "gray" || variant === "graycrop") img = img.grayscale().toColourspace("srgb");
      if (variant === "crop" || variant === "graycrop") img = center(img, 0.5);
      const e = await embedSharp(img);
      out[id] = { cls: r5(e.cls), mean: r5(e.mean) };
    }
  } catch (e) { console.log("fail", id, e.message); }
  n++;
  if (n % 100 === 0) { fs.writeFileSync(outFile, JSON.stringify(out)); const el = (Date.now() - t0) / 1000; console.log(`${n} done, ${(el / n).toFixed(2)}s/img, eta ${((ids.length - n) * el / n / 60).toFixed(0)}min`); }
}
fs.writeFileSync(outFile, JSON.stringify(out));
console.log("saved", Object.keys(out).length, "new", n);
