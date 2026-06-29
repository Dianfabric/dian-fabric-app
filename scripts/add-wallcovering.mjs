/**
 * 성분이 순수 100% 폴리에스터(PL/P/PE/POLY/POLYESTER 100%)인 원단 → usage_types에 '월커버링' 추가(append).
 * 기본 드라이런. 적용: --apply
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
// 순수 폴리 판정: 공백/콜론/쉼표 제거 후 100%+poly토큰 단독
function isPurePoly(c){
  if(!c) return false;
  const s=c.replace(/[，,]/g,"").replace(/\s|:/g,"").toUpperCase();
  const POLY="(PL|PE|POLY|POLYESTER|PES|PET|P)";
  return new RegExp(`^100%?${POLY}$`).test(s) || new RegExp(`^${POLY}100%?$`).test(s);
}
const hasType=(ft,t)=>(ft||"").split(",").map(s=>s.trim()).includes(t);
// 월커버링 부적합: 커튼/시어/인조가죽
const excluded=(f)=>f.is_curtain_eligible===true||hasType(f.fabric_type,"커튼")||hasType(f.fabric_type,"시어")||hasType(f.fabric_type,"인조가죽");
let all=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,name,composition_note,usage_types,fabric_type,is_curtain_eligible").eq("is_active",true).range(from,from+999);if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
const pure=all.filter(f=>isPurePoly(f.composition_note)&&!excluded(f));
const already=pure.filter(f=>(f.usage_types||[]).includes("월커버링")).length;
const toAdd=pure.filter(f=>!(f.usage_types||[]).includes("월커버링"));
// 표기 분포
const forms={};for(const f of pure){const k=(f.composition_note||"").trim();forms[k]=(forms[k]||0)+1;}
console.log("활성:",all.length,"| 순수 폴리:",pure.length,"| 이미 월커버링:",already,"| 추가대상:",toAdd.length);
console.log("\n표기 분포(상위):");Object.entries(forms).sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([k,v])=>console.log(`  ${v.toString().padStart(5)}  "${k}"`));
if(!APPLY){console.log("\n드라이런. 적용: --apply");process.exit(0);}
// 개별 업데이트(.in 배치는 statement timeout 발생) — 50개씩 병렬
let done=0;
for(let i=0;i<toAdd.length;i+=50){
  const chunk=toAdd.slice(i,i+50);
  await Promise.all(chunk.map(f=>{const ut=[...new Set([...(f.usage_types||[]),"월커버링"])];return sb.from("fabrics").update({usage_types:ut}).eq("id",f.id);}));
  done+=chunk.length;console.log("  진행",done);
}
console.log("완료:",done,"행에 월커버링 추가");
