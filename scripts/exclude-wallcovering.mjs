/**
 * 월커버링 usage 에서 커튼(is_curtain_eligible)/시어/인조가죽 원단 제외(usage_types에서 '월커버링' 제거).
 * 기본 드라이런. 적용: --apply
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const hasType=(ft,t)=>(ft||"").split(",").map(s=>s.trim()).includes(t);
let raw=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,fabric_type,usage_types,is_curtain_eligible").eq("is_active",true).range(from,from+999);if(!data||!data.length)break;raw=raw.concat(data);from+=1000;if(data.length<1000)break;}
const all=raw.filter(f=>(f.usage_types||[]).includes("월커버링"));
console.log("활성 전체:",raw.length,"| 월커버링 가진 원단:",all.length);
const exclude=all.filter(f=>f.is_curtain_eligible===true||hasType(f.fabric_type,"커튼")||hasType(f.fabric_type,"시어")||hasType(f.fabric_type,"인조가죽"));
const byReason={커튼:0,시어:0,인조가죽:0};
for(const f of exclude){if(f.is_curtain_eligible||hasType(f.fabric_type,"커튼"))byReason.커튼++;else if(hasType(f.fabric_type,"시어"))byReason.시어++;else if(hasType(f.fabric_type,"인조가죽"))byReason.인조가죽++;}
console.log("제외 대상:",exclude.length,"| 커튼",byReason.커튼,"시어",byReason.시어,"인조가죽",byReason.인조가죽);
if(!APPLY){console.log("\n드라이런. 적용: --apply");process.exit(0);}
let done=0;
for(let i=0;i<exclude.length;i+=200){
  // 각자 usage_types에서 월커버링만 제거 → 값이 달라 개별처리 필요하지만 대부분 동일. 안전하게 개별.
  const chunk=exclude.slice(i,i+200);
  await Promise.all(chunk.map(f=>{const ut=(f.usage_types||[]).filter(u=>u!=="월커버링");return sb.from("fabrics").update({usage_types:ut}).eq("id",f.id);}));
  done+=chunk.length;console.log("  진행",done);
}
console.log("완료:",done,"행에서 월커버링 제거");
