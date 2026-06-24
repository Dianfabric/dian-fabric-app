/**
 * Eastern Textile 이미지 전체 다운로드
 * easten-products.json(193종/747색)의 filePathUrl을 받아
 * D:/DIAN FABRIC/easten-images/{제품코드}/{색상코드}.jpg 로 저장
 * 매니페스트: scripts/easten-download-manifest.json
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const API = "https://api.easterntex.com";
const EMAIL = "nerofu@easterntex.com", PW = "123456";
const OUT = "D:/DIAN FABRIC/easten-images";
const H = { "User-Agent": "Mozilla/5.0", "Origin": "https://www.easterntex.com", "Referer": "https://www.easterntex.com/" };
const CONC = 8;

let token = "";
async function login() {
  const r = await (await fetch(API + "/api/web/user/emaillogin", { method: "POST", headers: { ...H, "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PW }) })).json();
  token = r.data.accessToken;
}
async function getBuf(url, retry = true) {
  const res = await fetch(url, { headers: { ...H, "Authorization": "Bearer " + token } });
  if (res.status === 401 && retry) { await login(); return getBuf(url, false); }
  if (!res.ok) throw new Error("fetch " + res.status);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  await login();
  console.log("로그인 OK");
  const products = JSON.parse(fs.readFileSync("scripts/easten-products.json", "utf-8"));
  fs.mkdirSync(OUT, { recursive: true });

  const manifest = []; let totalImg = 0, totalErr = 0; let lowres = [];
  for (const p of products) {
    const dir = path.join(OUT, p.code);
    fs.mkdirSync(dir, { recursive: true });
    const files = [];
    const cols = p.colors.filter((c) => c.url);
    for (let i = 0; i < cols.length; i += CONC) {
      const batch = cols.slice(i, i + CONC);
      await Promise.all(batch.map(async (c) => {
        const name = (c.code || `${p.code}-?`) + ".jpg";
        try {
          const buf = await getBuf(c.url);
          const meta = await sharp(buf).metadata();
          const jpg = await sharp(buf).jpeg({ quality: 90 }).toBuffer();
          fs.writeFileSync(path.join(dir, name), jpg);
          files.push({ file: name, w: meta.width, h: meta.height });
          if (Math.min(meta.width, meta.height) < 600) lowres.push(c.code);
        } catch (e) { totalErr++; files.push({ file: name, error: e.message }); }
      }));
    }
    const ok = files.filter((f) => !f.error).length;
    totalImg += ok;
    manifest.push({ code: p.code, colors: ok, files });
    process.stdout.write(`\r다운로드 ${manifest.length}/${products.length}종, ${totalImg}색   `);
  }
  fs.writeFileSync("scripts/easten-download-manifest.json", JSON.stringify(manifest, null, 2));
  console.log(`\n\n=== 완료: ${manifest.length}종 / ${totalImg}색 (에러 ${totalErr}) ===`);
  console.log(`저장: ${OUT}`);
  if (lowres.length) console.log(`⚠️ 저해상도(<600px) ${lowres.length}색: ${[...new Set(lowres)].slice(0,20).join(", ")}${lowres.length>20?" …":""}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
