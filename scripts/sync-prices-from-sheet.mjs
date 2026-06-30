/**
 * 2025 TMS 시트 → DB price_per_yard 동기화 (이름 매칭, 균일가 디자인만).
 * per-color(색마다 단가 다른) 디자인은 보호(스킵). 기본 드라이런, 적용: --apply
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const SHEET="https://docs.google.com/spreadsheets/d/1PKx-ycLsyS1wYrvRSCJ2IceMKMoeczb2Fr2VcfNzJWc/export?format=csv&gid=88683325";
function pc(t){const r=[];let row=[],f="",q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===","){row.push(f);f="";}else if(c==="\n"){row.push(f);r.push(row);row=[];f="";}else if(c==="\r"){}else f+=c;}}if(f.length||row.length){row.push(f);r.push(row);}return r;}
const norm=s=>(s||"").trim().toUpperCase();
const csv=await(await fetch(SHEET,{headers:{"User-Agent":"Mozilla/5.0"}})).text();
const rows=pc(csv).slice(1);
const sheetPrice={};
for(const r of rows){const n=norm(r[2]);const p=Number((r[3]||"").replace(/[^0-9]/g,""));if(n&&p)sheetPrice[n]=p;}
let all=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,name,price_per_yard").eq("is_active",true).range(from,from+999);if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
const byName={};for(const f of all){(byName[f.name]=byName[f.name]||[]).push(f);}
let designUpd=0,colUpd=0,skipPerColor=0,nomatch=0; const ids=[]; const perColor=[]; const exup=[];
for(const [name,fs2] of Object.entries(byName)){
  const sp=sheetPrice[norm(name)];
  if(sp==null){nomatch++;continue;}
  const distinct=[...new Set(fs2.map(f=>f.price_per_yard==null?null:Number(f.price_per_yard)))];
  if(distinct.length>1){skipPerColor++;perColor.push(name);continue;} // 색마다 다름 → 보호
  const cur=distinct[0];
  if(cur!==sp){designUpd++;colUpd+=fs2.length;for(const f of fs2)ids.push(f.id);if(exup.length<15)exup.push(`${name}: ${cur??"없음"} → ${sp} (${fs2.length}색)`);}
}
console.log(`시트매칭 디자인 갱신 ${designUpd}종(${colUpd}색) | per-color 보호 ${skipPerColor}종 | 시트없음 ${nomatch}종`);
console.log("\n=== 갱신 예시 ===");exup.forEach(e=>console.log("  "+e));
console.log("\n=== per-color 보호(시트단가로 안 덮음) ===\n  "+perColor.join(", "));
if(!APPLY){console.log("\n드라이런. 적용: --apply");process.exit(0);}
// 적용: id별 시트가로. (색 묶음이 같은 디자인=같은가)
let done=0;
for(const [name,fs2] of Object.entries(byName)){
  const sp=sheetPrice[norm(name)];if(sp==null)continue;
  const distinct=[...new Set(fs2.map(f=>f.price_per_yard==null?null:Number(f.price_per_yard)))];
  if(distinct.length>1||distinct[0]===sp)continue;
  const chunk=fs2.map(f=>f.id);
  for(let i=0;i<chunk.length;i+=100){await sb.from("fabrics").update({price_per_yard:sp}).in("id",chunk.slice(i,i+100));}
  done+=fs2.length;
}
console.log("\n완료:",done,"색 단가 시트값으로 갱신");
