/**
 * 벨벳 재정리: 유지리스트 제외 전부 패브릭. MINERVA→인조가죽, SARA/CASABLANCA→스웨이드.
 * 기본 드라이런. 적용: --apply (적용 시 벨벳 현재상태 백업 CSV 자동 저장)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);

const KEEP=new Set(["SALONI","CRUSH","LD1906P","MARBLE","LD2319Q","IKAT"]);
const TO_LEATHER=new Set(["MINERVA"]);
const TO_SUEDE=new Set(["SARA","CASABLANCA"]);
function replaceTag(ft,from,to){
  let parts=(ft||"").split(",").map(s=>s.trim()).filter(Boolean).map(p=>p===from?to:p);
  const seen=new Set(),out=[];for(const p of parts){if(!seen.has(p)){seen.add(p);out.push(p);}}
  return out.join(",");
}
// 벨벳 포함 전체 로드
let all=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,name,fabric_type").eq("is_active",true).ilike("fabric_type","%벨벳%").range(from,from+999);if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
console.log("벨벳 포함 행:",all.length);

const tally={keep:0,leather:0,suede:0,fabric:0};
const toFabricNames=new Set(), keptNames=new Set();
const updates=[];
for(const f of all){
  const U=(f.name||"").toUpperCase();
  let target=null;
  if(KEEP.has(U)){tally.keep++;keptNames.add(f.name);continue;}
  if(TO_LEATHER.has(U)){target="인조가죽";tally.leather++;}
  else if(TO_SUEDE.has(U)){target="스웨이드";tally.suede++;}
  else {target="패브릭";tally.fabric++;toFabricNames.add(f.name);}
  const nt=replaceTag(f.fabric_type,"벨벳",target);
  if(nt!==(f.fabric_type||"")) updates.push({id:f.id,nt});
}
console.log(`\n유지(벨벳): ${tally.keep}행 [${[...keptNames].join(", ")}]`);
// 유지리스트 매칭 검증
for(const k of KEEP) if(![...keptNames].some(n=>n.toUpperCase()===k)) console.log(`  ⚠️ 유지리스트 '${k}' 벨벳에서 매칭0`);
console.log(`MINERVA→인조가죽: ${tally.leather}행`);
console.log(`SARA/CASABLANCA→스웨이드: ${tally.suede}행`);
console.log(`나머지→패브릭: ${tally.fabric}행 (${toFabricNames.size}종)`);
console.log(`\n패브릭으로 가는 디자인명:\n  ${[...toFabricNames].sort().join(", ")}`);
console.log(`\n변경대상 ${updates.length}행. 적용후 벨벳=${tally.keep}행`);
if(!APPLY){console.log("\n드라이런. 적용: --apply");process.exit(0);}
const stamp=new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
fs.writeFileSync(`D:/벨벳백업_${stamp}.csv`,"id,name,fabric_type\n"+all.map(r=>`"${r.id}","${r.name}","${r.fabric_type}"`).join("\n"),"utf-8");
console.log("벨벳 백업 저장:",`D:/벨벳백업_${stamp}.csv`);
let done=0;for(const u of updates){const{error}=await sb.from("fabrics").update({fabric_type:u.nt}).eq("id",u.id);if(error)console.log("ERR",error.message);if(++done%200===0)console.log("  ",done);}
console.log("완료:",done,"행");
