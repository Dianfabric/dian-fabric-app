/**
 * EK(ektextile) 사이트 원단 다운로드 → 로컬 폴더 + meta.csv
 * 로그인 → /Product/List (POST, 페이지네이션) → 이미지 다운로드 (사이트순서)
 * 샘플/단종(L.*, (NNNN), 분류·성분 빈칸) 항목은 제외.
 * 실행: node scripts/ek-download.mjs
 */
import fs from "fs";
import path from "path";

const BASE = "http://en.online.ektextile.com";
const ID = "1449", PW = "123456";
const DESIGNS = ["ALCANTA", "CLEANTEX", "WOOLLAM", "LE TEDDY"];
const OUT = "D:/EK신규원단";

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

async function login() {
  const r = await fetch(`${BASE}/Login/Index`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest" },
    body: new URLSearchParams({ LoginId: ID, Password: PW, ReturnUrl: "" }),
  });
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const j = await r.json();
  if (j.status !== "true") throw new Error("로그인 실패: " + JSON.stringify(j));
  return cookie;
}

async function listPage(cookie, search, page) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(`${BASE}/Product/List`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Cookie: cookie },
        body: new URLSearchParams({ PageIndex: String(page), PageSize: "30", Type: "", Series: "", Search: search }),
      });
      const txt = await r.text();
      if (!txt) throw new Error("empty");
      return JSON.parse(txt);
    } catch (e) {
      if (t === 3) { console.log(`  ⚠️ ${search} p${page} 실패: ${e.message}`); return { Total: 0, Data: [] }; }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// 샘플/단종 제외 + 정상 제품만
function isJunk(item) {
  const b = item.Bianhao || "";
  if (/^L\./i.test(b)) return true;             // L. 접두 샘플
  if (/\(\d{3,}\)/.test(b)) return true;         // (2800) 등 접미
  if (!item.Fenlei) return true;                 // 분류 빈칸
  if (!(item.Canshu5 || "").replace(/composition:/i, "").trim()) return true; // 성분 빈칸
  return false;
}
const clean = (s, label) => (s || "").replace(new RegExp(label + "\\s*:", "i"), "").trim();
const widthMm = (c1) => { const m = (c1 || "").match(/(\d+)\s*CM/i); return m ? Number(m[1]) * 10 : ""; };

async function download(cookie, url, dest) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(BASE + url, { headers: { Cookie: cookie } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) throw new Error("too small");
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) { if (t === 3) { console.log(`    ❌ img ${url}: ${e.message}`); return 0; } await new Promise((r) => setTimeout(r, 1000)); }
  }
}

async function main() {
  const cookie = await login();
  console.log("로그인 성공\n");
  const metaRows = [["name", "color_code", "composition_note", "width_mm", "supplier"]];
  let order = 0, total = 0, junk = 0, imgFail = 0;

  for (const design of DESIGNS) {
    const p1 = await listPage(cookie, design, 1);
    const pages = p1.Total || 1;
    const items = [];
    for (let pg = 1; pg <= pages; pg++) {
      const pd = pg === 1 ? p1 : await listPage(cookie, design, pg);
      items.push(...(pd.Data || []));
    }
    let ok = 0;
    for (const it of items) {
      if (isJunk(it)) { junk++; continue; }
      const bianhao = it.Bianhao.trim();
      const dash = bianhao.lastIndexOf("-");
      const name = dash === -1 ? bianhao : bianhao.slice(0, dash).trim();
      const color = dash === -1 ? "1" : bianhao.slice(dash + 1).trim();
      const comp = clean(it.Canshu5, "Composition");
      const w = widthMm(it.Canshu1);
      // 파일명: {name}-{color}.jpg (upload 스크립트 파싱규칙과 일치, 알파벳순=사이트순서)
      const fname = `${name}-${color}.jpg`;
      const size = await download(cookie, it.TupianLujing, path.join(OUT, fname));
      if (!size) { imgFail++; continue; }
      metaRows.push([name, color, comp, String(w), "EK"]);
      order++; ok++;
    }
    console.log(`${design}: ${ok}색 다운로드 (전체 ${items.length}, 샘플제외 포함)`);
    total += ok;
  }

  // meta.csv (파일명엿 접두번호 제거 매칭 위해 name-color 기준)
  const csv = metaRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, "'")}"`).join(",")).join("\n");
  fs.writeFileSync(path.join(OUT, "meta.csv"), csv, "utf-8");
  console.log(`\n총 ${total}색 다운로드 | 샘플제외 ${junk} | 이미지실패 ${imgFail}`);
  console.log(`폴더: ${OUT}  (meta.csv ${metaRows.length - 1}행)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
