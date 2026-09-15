// Build a synthetic "phone photo" test set from catalog images (step 2).
// Each source fabric -> one augmented photo: random crop, perspective warp, colour cast,
// brightness, shadow gradient, blur, sensor noise, jpeg. Params are logged to synth-manifest.json.
// Usage: node scripts/exp/synth.mjs [count=300] [seed=42]
import fs from "fs";
import sharp from "sharp";
const S = "scripts/exp/data";
const N = +(process.argv[2] || 300), seed = +(process.argv[3] || 42);
let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const meta = JSON.parse(fs.readFileSync(S + "/meta.json", "utf8"));
const have = new Set(fs.readdirSync(S + "/images").map((f) => f.slice(0, -4)));
const golden = [...new Set(meta.labeled.map((l) => l.query.id))].filter((id) => have.has(id));
const rest = meta.rows.map((r) => r.id).filter((id) => have.has(id) && !golden.includes(id)).sort(() => rnd() - 0.5);
const picks = [...golden, ...rest].slice(0, N);
fs.mkdirSync(S + "/synth", { recursive: true });
// homography: unit square -> 4 points (x0,y0)...(x3,y3), returns 3x3
function homography(p) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1; const g = (dx3 * dy2 - dx2 * dy3) / den, h = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
}
function invert3(m) { const [a, b, c, d, e, f, g, h, i] = m; const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C; return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((x) => x / det); }
function warpAndNoise(data, W, H, ch, corners, noiseSigma) {
  // corners: where the 4 image corners land in output (normalized 0..1). Output same size.
  const Hm = homography(corners), inv = invert3(Hm);
  const out = Buffer.alloc(W * H * ch);
  let ns = 0;
  const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const X = x / W, Y = y / H; const w = inv[6] * X + inv[7] * Y + inv[8];
    const u = (inv[0] * X + inv[1] * Y + inv[2]) / w, v = (inv[3] * X + inv[4] * Y + inv[5]) / w;
    const sx = u * (W - 1), sy = v * (H - 1); const o = (y * W + x) * ch;
    if (sx < 0 || sy < 0 || sx > W - 1 || sy > H - 1) { for (let c = 0; c < ch; c++) out[o + c] = 235; continue; } // outside -> light table background
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < ch; c++) {
      const p = data[(y0 * W + x0) * ch + c] * (1 - fx) * (1 - fy) + data[(y0 * W + x1) * ch + c] * fx * (1 - fy) + data[(y1 * W + x0) * ch + c] * (1 - fx) * fy + data[(y1 * W + x1) * ch + c] * fx * fy;
      const n = noiseSigma ? gauss() * noiseSigma : 0; out[o + c] = Math.max(0, Math.min(255, Math.round(p + n)));
    }
  }
  return out;
}
const manifest = [];
let i = 0;
for (const id of picks) {
  const level = rnd() < 0.3 ? "mild" : rnd() < 0.6 ? "medium" : "hard";
  const k = level === "mild" ? 0.4 : level === "medium" ? 0.7 : 1.0;
  const p = {
    id, level,
    cropFrac: rr(1 - 0.5 * k, 0.95), cropDx: rr(-0.5, 0.5), cropDy: rr(-0.5, 0.5),
    persp: rr(0.02, 0.12 * k), castR: rr(1 - 0.12 * k, 1 + 0.12 * k), castB: rr(1 - 0.12 * k, 1 + 0.12 * k), bright: rr(1 - 0.25 * k, 1 + 0.15 * k),
    shadow: rr(0.05, 0.45 * k), shadowAngle: rr(0, 360), blur: rnd() < 0.7 ? rr(0.3, 1.8 * k) : 0, noise: rr(2, 10 * k), jpeg: Math.round(rr(60, 88)),
  };
  try {
    const base = sharp(fs.readFileSync(`${S}/images/${id}.jpg`)).rotate();
    const m = await base.metadata();
    const cw = Math.floor(m.width * p.cropFrac), chh = Math.floor(m.height * p.cropFrac);
    const left = Math.floor((m.width - cw) * (0.5 + p.cropDx * 0.5)), top = Math.floor((m.height - chh) * (0.5 + p.cropDy * 0.5));
    let img = base.extract({ left, top, width: cw, height: chh }).resize({ width: 900, height: 900, fit: "inside" });
    img = img.linear([p.castR * p.bright, p.bright, p.castB * p.bright], [0, 0, 0]);
    const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const j = () => rr(-p.persp, p.persp);
    const corners = [[0 + Math.abs(j()), 0 + Math.abs(j())], [1 - Math.abs(j()), 0 + Math.abs(j())], [1 - Math.abs(j()), 1 - Math.abs(j())], [0 + Math.abs(j()), 1 - Math.abs(j())]];
    const warped = warpAndNoise(data, info.width, info.height, info.channels, corners, p.noise);
    const a = p.shadowAngle * Math.PI / 180; const x2 = 50 + 50 * Math.cos(a), y2 = 50 + 50 * Math.sin(a);
    const svg = `<svg width="${info.width}" height="${info.height}"><defs><linearGradient id="g" x1="${100 - x2}%" y1="${100 - y2}%" x2="${x2}%" y2="${y2}%"><stop offset="0" stop-color="black" stop-opacity="0"/><stop offset="1" stop-color="black" stop-opacity="${p.shadow.toFixed(2)}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
    let outImg = sharp(warped, { raw: { width: info.width, height: info.height, channels: info.channels } }).composite([{ input: Buffer.from(svg), blend: "over" }]);
    if (p.blur > 0.3) outImg = sharp(await outImg.png().toBuffer()).blur(p.blur);
    await outImg.jpeg({ quality: p.jpeg }).toFile(`${S}/synth/${id}.jpg`);
    manifest.push(p);
  } catch (e) { console.log("fail", id, e.message); }
  if (++i % 50 === 0) console.log(i, "/", picks.length);
}
fs.writeFileSync(S + "/synth-manifest.json", JSON.stringify(manifest, null, 1));
console.log("synth done", manifest.length, "golden queries included", golden.length, "levels", ["mild", "medium", "hard"].map((l) => `${l}:${manifest.filter((m) => m.level === l).length}`).join(" "));
