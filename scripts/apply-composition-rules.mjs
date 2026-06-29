/**
 * 성분(composition_note) 기반 자동 분류 규칙 — 신규 원단 업로드 후 항상 실행.
 * 멱등(여러 번 돌려도 안전). 기본 드라이런, 적용: --apply
 *
 * 규칙:
 *   1) 면/울/린넨 = 성분에 cotton/wool/linen 포함되면 fabric_type 에 태그 추가(추가 전용, 제거 안 함)
 *      + co_percent/li_percent/wo_percent 재산출.
 *   2) 월커버링 = 성분이 순수 100% 폴리(PL/P/PE/POLY/POLYESTER) 이면 usage_types 에 '월커버링' 추가.
 *      단 커튼(is_curtain_eligible)·시어·인조가죽은 제외(이미 들어있으면 제거).
 *
 * 실행: node scripts/apply-composition-rules.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY = process.argv.includes("--apply");
const env = {};
fs.readFileSync(".env.local", "utf-8").split("\n").forEach((l) => { const [k, ...v] = l.split("="); if (k && v.length) env[k.trim()] = v.join("=").trim(); });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// ── 성분 → 소재 퍼센트 (전각콤마/단일문자/한자/순서무관 통합 파서) ──
const CO = new Set(["co", "c", "cotton", "cot", "棉"]);
const WO = new Set(["w", "wo", "wool", "羊毛", "毛"]);
const LI = new Set(["li", "l", "lin", "linen", "麻"]);
function assign(r, code, v) { if (CO.has(code)) r.co = Math.max(r.co, v); else if (WO.has(code)) r.wo = Math.max(r.wo, v); else if (LI.has(code)) r.li = Math.max(r.li, v); }
function parsePercents(raw) {
  const r = { co: 0, wo: 0, li: 0 };
  if (!raw) return r;
  const s = raw.replace(/，/g, ",");
  const re1 = /(\d+(?:\.\d+)?)\s*%?\s*([A-Za-z]+|[一-鿿]+)/g;
  let m, last = 0, residue = ""; const spans = [];
  while ((m = re1.exec(s))) { assign(r, m[2].toLowerCase(), parseFloat(m[1])); spans.push([m.index, m.index + m[0].length]); }
  for (const [a, b] of spans) { residue += s.slice(last, a) + " ".repeat(b - a); last = b; } residue += s.slice(last);
  const re2 = /([A-Za-z]+|[一-鿿]+)\s*(\d+(?:\.\d+)?)\s*%/g;
  while ((m = re2.exec(residue))) { assign(r, m[1].toLowerCase(), parseFloat(m[2])); }
  return r;
}
function addMaterialTags(ft, p) {
  const parts = (ft || "").split(",").map((x) => x.trim()).filter(Boolean);
  const out = [...parts];
  if (p.co > 0 && !parts.includes("면")) out.push("면");
  if (p.wo > 0 && !parts.includes("울")) out.push("울");
  if (p.li > 0 && !parts.includes("린넨")) out.push("린넨");
  return out.join(",");
}
// 순수 100% 폴리 판정
function isPurePoly(c) {
  if (!c) return false;
  const s = c.replace(/[，,]/g, "").replace(/\s|:/g, "").toUpperCase();
  const POLY = "(PL|PE|POLY|POLYESTER|PES|PET|P)";
  return new RegExp(`^100%?${POLY}$`).test(s) || new RegExp(`^${POLY}100%?$`).test(s);
}
const hasType = (ft, t) => (ft || "").split(",").map((s) => s.trim()).includes(t);
const wcExcluded = (f) => f.is_curtain_eligible === true || hasType(f.fabric_type, "커튼") || hasType(f.fabric_type, "시어") || hasType(f.fabric_type, "인조가죽");

async function main() {
  let all = [], from = 0;
  for (;;) { const { data } = await sb.from("fabrics").select("id,fabric_type,composition_note,co_percent,li_percent,wo_percent,usage_types,is_curtain_eligible").eq("is_active", true).range(from, from + 999); if (!data || !data.length) break; all = all.concat(data); from += 1000; if (data.length < 1000) break; }
  console.log("활성:", all.length, APPLY ? "[APPLY]" : "[드라이런]");

  const updates = []; // {id, patch}
  let matAdd = 0, wcAdd = 0, wcRemove = 0;
  for (const f of all) {
    const patch = {};
    // 1) 소재
    const p = parsePercents(f.composition_note);
    const nt = addMaterialTags(f.fabric_type, p);
    if (nt !== (f.fabric_type || "")) { patch.fabric_type = nt; matAdd++; }
    if (Math.abs((f.co_percent || 0) - p.co) > 0.01) patch.co_percent = p.co;
    if (Math.abs((f.li_percent || 0) - p.li) > 0.01) patch.li_percent = p.li;
    if (Math.abs((f.wo_percent || 0) - p.wo) > 0.01) patch.wo_percent = p.wo;
    // 2) 월커버링 (소재 태그 추가분 반영해 제외판정)
    const ftForWc = patch.fabric_type || f.fabric_type;
    const fForWc = { fabric_type: ftForWc, is_curtain_eligible: f.is_curtain_eligible };
    const ut = f.usage_types || [];
    const hasWc = ut.includes("월커버링");
    const qualifies = isPurePoly(f.composition_note) && !wcExcluded(fForWc);
    if (qualifies && !hasWc) { patch.usage_types = [...new Set([...ut, "월커버링"])]; wcAdd++; }
    else if (hasWc && wcExcluded(fForWc)) { patch.usage_types = ut.filter((u) => u !== "월커버링"); wcRemove++; }
    if (Object.keys(patch).length) updates.push({ id: f.id, patch });
  }
  console.log(`소재태그 추가행 ${matAdd} | 월커버링 추가 ${wcAdd} | 월커버링 제거 ${wcRemove} | 총 업데이트 ${updates.length}`);
  if (!APPLY) { console.log("\n드라이런. 적용: --apply"); return; }

  let done = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50);
    await Promise.all(chunk.map((u) => sb.from("fabrics").update(u.patch).eq("id", u.id)));
    done += chunk.length; if (done % 500 < 50) console.log("  진행", done);
  }
  console.log("완료:", done, "행");
}
main().catch((e) => { console.error(e); process.exit(1); });
