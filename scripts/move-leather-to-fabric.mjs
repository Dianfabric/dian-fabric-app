/**
 * 지정 디자인의 fabric_type 에서 '인조가죽' → '패브릭' 교체 (소재태그 유지).
 * 기본 드라이런. 적용: node scripts/move-leather-to-fabric.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const NAMES=["W6604","R708","R706","R707","R1936","Q7205","G8838","G1912","G1775","G1751","G1705","1843","1808","NUBE"];
function newType(ft){
  let parts=(ft||"").split(",").map(s=>s.trim()).filter(Boolean);
  parts=parts.map(p=>p==="인조가죽"?"패브릭":p);
  const seen=new Set(),out=[];for(const p of parts){if(!seen.has(p)){seen.add(p);out.push(p);}}
  return out.join(",");
}
let totalRows=0; const toUpdate=[];
for(const name of NAMES){
  const{data}=await sb.from("fabrics").select("id,fabric_type").eq("name",name).eq("is_active",true);
  const rows=data||[];
  const types=[...new Set(rows.map(r=>r.fabric_type||"(빈)"))];
  const hasLeather=rows.some(r=>(r.fabric_type||"").split(",").map(s=>s.trim()).includes("인조가죽"));
  console.log(`${name.padEnd(8)} ${String(rows.length).padStart(3)}행 | 현재=[${types.join(" / ")}] ${hasLeather?"":"⚠️인조가죽아님"} ${rows.length===0?"⚠️매칭0":""}`);
  for(const r of rows){const nt=newType(r.fabric_type);if(nt!==(r.fabric_type||"")){toUpdate.push({id:r.id,nt});}}
  totalRows+=rows.length;
}
console.log(`\n총 매칭 ${totalRows}행, 변경대상 ${toUpdate.length}행`);
if(!APPLY){console.log("드라이런. 적용: --apply");process.exit(0);}
let done=0;for(const u of toUpdate){const{error}=await sb.from("fabrics").update({fabric_type:u.nt}).eq("id",u.id);if(error)console.log("ERR",u.id,error.message);if(++done%200===0)console.log("  ",done);}
console.log("완료:",done,"행 업데이트");
