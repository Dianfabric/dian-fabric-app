/**
 * 분류 스냅샷 백업 — fabric_type/pattern/소재%/커튼/용도 를 CSV로 덤프.
 * 대량 재분류·필터변경 전에 실행. 복구는 이 CSV로 id별 UPDATE.
 * 실행: node scripts/backup-classification.mjs
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
let all=[],from=0;
for(;;){const{data,error}=await sb.from("fabrics").select("id,name,color_code,fabric_type,pattern_detail,co_percent,li_percent,wo_percent,other_percent,pl_percent,is_curtain_eligible,usage_types,is_active").range(from,from+999);if(error){console.error(error);break;}if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
const q=(v)=>`"${String(v??"").replace(/"/g,"'")}"`;
const cols=["id","name","color_code","fabric_type","pattern_detail","co_percent","li_percent","wo_percent","other_percent","pl_percent","is_curtain_eligible","usage_types","is_active"];
const csv=cols.join(",")+"\n"+all.map(r=>cols.map(c=>q(Array.isArray(r[c])?r[c].join("|"):r[c])).join(",")).join("\n");
const stamp=new Date().toISOString().slice(0,10);
const path=`D:/분류백업_${stamp}.csv`;
fs.writeFileSync(path,csv,"utf-8");
console.log("백업 완료:",all.length,"행 →",path);
