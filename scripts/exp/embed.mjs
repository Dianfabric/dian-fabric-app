// Offline embedding experiment: several DINOv2 variants on the local image pool.
// Usage: node embed.mjs <variant>   variant = q8 | fp32 | gray | crop
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { AutoModel, AutoProcessor, RawImage, env as hfenv } from "@huggingface/transformers";
const S = "scripts/exp/data";
const variant = process.argv[2] || "q8";
const meta = JSON.parse(fs.readFileSync(S + "/meta.json", "utf8"));
const rows = meta.rows.filter((r) => fs.existsSync(`${S}/images/${r.id}.jpg`));
console.log("variant", variant, "images", rows.length);
hfenv.cacheDir = "scripts/exp/hf-cache";
const dtype = variant === "fp32" ? "fp32" : "q8";
const processor = await AutoProcessor.from_pretrained("Xenova/dinov2-base");
const model = await AutoModel.from_pretrained("Xenova/dinov2-base", { dtype });
const l2 = (v) => { const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)); return n > 0 ? v.map((x) => x / n) : v; };
const out = {}; // id -> { cls:[], mean:[] }
const done = fs.existsSync(`${S}/emb-${variant}.json`) ? JSON.parse(fs.readFileSync(`${S}/emb-${variant}.json`, "utf8")) : {};
Object.assign(out, done);
let t0 = Date.now(), n = 0;
for (const r of rows) {
  if (out[r.id]) continue;
  try {
    let buf = fs.readFileSync(`${S}/images/${r.id}.jpg`);
    let img = sharp(buf);
    if (variant === "gray") img = img.grayscale().toColourspace("srgb");
    if (variant === "crop") { const m = await img.metadata(); const cw = Math.floor(m.width / 2), ch = Math.floor(m.height / 2); img = img.extract({ left: Math.floor((m.width - cw) / 2), top: Math.floor((m.height - ch) / 2), width: cw, height: ch }); }
    const { data, info } = await img.removeAlpha().resize(448, 448, { fit: "cover" }).raw().toBuffer({ resolveWithObject: true });
    const raw = new RawImage(new Uint8ClampedArray(data), info.width, info.height, info.channels);
    const inputs = await processor(raw);
    const o = await model(inputs);
    const h = o.last_hidden_state; const [_, seq, dim] = h.dims; const d = h.data;
    const cls = Array.from(d.slice(0, dim));
    const mean = new Array(dim).fill(0);
    for (let t = 1; t < seq; t++) for (let k = 0; k < dim; k++) mean[k] += d[t * dim + k];
    for (let k = 0; k < dim; k++) mean[k] /= seq - 1;
    out[r.id] = { cls: l2(cls).map((x) => +x.toFixed(5)), mean: l2(mean).map((x) => +x.toFixed(5)) };
  } catch (e) { console.log("fail", r.id, e.message); }
  n++;
  if (n % 100 === 0) { fs.writeFileSync(`${S}/emb-${variant}.json`, JSON.stringify(out)); const el = (Date.now() - t0) / 1000; console.log(`${n} done, ${(el / n).toFixed(2)}s/img, eta ${((rows.length - n) * el / n / 60).toFixed(0)}min`); }
}
fs.writeFileSync(`${S}/emb-${variant}.json`, JSON.stringify(out));
console.log("saved", Object.keys(out).length);
