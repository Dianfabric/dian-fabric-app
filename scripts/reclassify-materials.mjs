/**
 * 면/울/린넨 소재 재분류 + co/li/wo_percent 재산출 (성분표기 통합 파서)
 * 기본 = 드라이런(읽기만). 실제 적용: node scripts/reclassify-materials.mjs --apply
 * 사전조건(--apply 시): Supabase에 wo_percent 컬럼 존재해야 함
 *   ALTER TABLE fabrics ADD COLUMN IF NOT EXISTS wo_percent numeric DEFAULT 0;
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY = process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);

const CO=new Set(["co","c","cotton","cot","棉"]);
const WO=new Set(["w","wo","wool","羊毛","毛"]);
const LI=new Set(["li","l","lin","linen","麻"]);
function assign(r,code,v){ if(CO.has(code))r.co=Math.max(r.co,v); else if(WO.has(code))r.wo=Math.max(r.wo,v); else if(LI.has(code))r.li=Math.max(r.li,v); }
function parsePercents(raw){
  const r={co:0,wo:0,li:0};
  if(!raw) return r;
  const s=raw.replace(/，/g,",");
  // pass1: 숫자-먼저  "35% CO" "5%cotton" "8%Wool" "100%棉" "20 LI"
  const re1=/(\d+(?:\.\d+)?)\s*%?\s*([A-Za-z]+|[一-鿿]+)/g;
  let m,last=0,residue=""; const spans=[];
  while((m=re1.exec(s))){ assign(r,m[2].toLowerCase(),parseFloat(m[1])); spans.push([m.index,m.index+m[0].length]); }
  for(const[a,b]of spans){ residue+=s.slice(last,a)+" ".repeat(b-a); last=b; } residue+=s.slice(last);
  // pass2: 소재-먼저 (잔여만)  "CO 91%" "Cotton 50%"
  const re2=/([A-Za-z]+|[一-鿿]+)\s*(\d+(?:\.\d+)?)\s*%/g;
  while((m=re2.exec(residue))){ assign(r,m[1].toLowerCase(),parseFloat(m[2])); }
  return r;
}
// 추가 전용: 기존 태그 절대 제거 안 함, 부족한 소재 태그만 덧붙임
function addMaterialTags(ft,p){
  const parts=(ft||"").split(",").map(x=>x.trim()).filter(Boolean);
  const out=[...parts];
  if(p.co>0&&!parts.includes("면"))out.push("면");
  if(p.wo>0&&!parts.includes("울"))out.push("울");
  if(p.li>0&&!parts.includes("린넨"))out.push("린넨");
  return out.join(",");
}

let all=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,fabric_type,composition_note,co_percent,li_percent").eq("is_active",true).range(from,from+999);if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
console.log("로드:",all.length,APPLY?"[APPLY 모드]":"[드라이런]");

let coN=0,liN=0,woN=0, addCo=0,addLi=0,addW=0, rmCo=0,rmLi=0,rmW=0, typeChanged=0;
const updates=[]; const mistag=[];
const has=(t,m)=>(t||"").split(",").map(x=>x.trim()).includes(m);
for(const f of all){
  const p=parsePercents(f.composition_note);
  if(p.co>0)coN++; if(p.li>0)liN++; if(p.wo>0)woN++;
  if(p.co>0&&!has(f.fabric_type,"면"))addCo++;
  if(p.li>0&&!has(f.fabric_type,"린넨"))addLi++;
  if(p.wo>0&&!has(f.fabric_type,"울"))addW++;
  if(p.co===0&&has(f.fabric_type,"면")){rmCo++;mistag.push(["면",f.name,f.color_code,f.composition_note]);}
  if(p.li===0&&has(f.fabric_type,"린넨")){rmLi++;mistag.push(["린넨",f.name,f.color_code,f.composition_note]);}
  if(p.wo===0&&has(f.fabric_type,"울")){rmW++;mistag.push(["울",f.name,f.color_code,f.composition_note]);}
  const nt=addMaterialTags(f.fabric_type,p);
  if(nt!==(f.fabric_type||"")) typeChanged++;
  // 변경된 행만 업데이트 (fabric_type 또는 co/li/wo 수치 변동)
  const changed = nt!==(f.fabric_type||"")
    || Math.abs((f.co_percent||0)-p.co)>0.01
    || Math.abs((f.li_percent||0)-p.li)>0.01
    || p.wo>0; // wo_percent 는 신규 컬럼(기존 0) → 0보다 크면 채움
  if(changed) updates.push({id:f.id,fabric_type:nt,co_percent:p.co,li_percent:p.li,wo_percent:p.wo});
}
// 오분류(성분엔 없는데 태그됨) 검토 리스트 — 제거는 안 하고 CSV만
const csv="tag,name,color_code,composition\n"+mistag.map(r=>`"${r[0]}","${r[1]||""}","${r[2]||""}","${(r[3]||"").replace(/"/g,"'")}"`).join("\n");
fs.writeFileSync("D:/소재-오분류-검토.csv",csv,"utf-8");
console.log("오분류 검토 CSV:",mistag.length,"건 → D:/소재-오분류-검토.csv");
console.log(`\n성분 검출  면(co>0):${coN}  울(wo>0):${woN}  린넨(li>0):${liN}`);
console.log(`태그 추가  면+${addCo}  울+${addW}  린넨+${addLi}`);
console.log(`태그 제거  면-${rmCo}  울-${rmW}  린넨-${rmLi}  (성분에 없는데 태그됨)`);
console.log(`fabric_type 바뀌는 행: ${typeChanged}`);
console.log(`실제 업데이트 대상 행: ${updates.length}`);

if(!APPLY){ console.log("\n드라이런 종료. 적용하려면 --apply (사전 wo_percent 컬럼 필요)"); process.exit(0); }

// APPLY: id 청크 업데이트
let done=0;
for(const u of updates){
  const{error}=await sb.from("fabrics").update({fabric_type:u.fabric_type,co_percent:u.co_percent,li_percent:u.li_percent,wo_percent:u.wo_percent}).eq("id",u.id);
  if(error){console.log("ERR",u.id,error.message);if(error.message.includes("wo_percent")){console.log("→ wo_percent 컬럼이 없습니다. SQL 먼저 실행하세요.");process.exit(1);}}
  if(++done%500===0)console.log("  업데이트",done);
}
console.log("완료:",done,"행 업데이트");
