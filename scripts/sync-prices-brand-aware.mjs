/**
 * 브랜드 인식 단가 동기화: DB supplier ↔ 시트 브랜드 일치하는 단가로.
 * 이름 충돌(같은이름 다른브랜드) 안전 처리. per-color 디자인 보호. 기본 드라이런, --apply 적용.
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const SHEET="https://docs.google.com/spreadsheets/d/1PKx-ycLsyS1wYrvRSCJ2IceMKMoeczb2Fr2VcfNzJWc/export?format=csv&gid=88683325";
function pc(t){const r=[];let row=[],f="",q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'&&t[i+1]==='"'){f+='"';i++;}else if(c==='"')q=false;else f+=c;}else{if(c==='"')q=true;else if(c===","){row.push(f);f="";}else if(c==="\n"){row.push(f);r.push(row);row=[];f="";}else if(c==="\r"){}else f+=c;}}if(f.length||row.length){row.push(f);r.push(row);}return r;}
const norm=s=>(s||"").trim().toUpperCase();
const rows=pc(await(await fetch(SHEET,{headers:{"User-Agent":"Mozilla/5.0"}})).text()).slice(1);
const byName={}; // name → {brand:price}
for(const r of rows){const n=norm(r[2]),b=norm(r[1]),p=Number((r[3]||"").replace(/[^0-9]/g,""));if(!n||!b||!p)continue;(byName[n]=byName[n]||{})[b]=p;}
let all=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,name,supplier,price_per_yard").eq("is_active",true).range(from,from+999);if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
const byDesign={};for(const f of all){if(!byDesign[f.name])byDesign[f.name]={sup:f.supplier,prices:new Set(),rows:[]};byDesign[f.name].prices.add(f.price_per_yard==null?null:Number(f.price_per_yard));byDesign[f.name].rows.push(f);}
let upd=0,colFix=0,skipPerColor=0,noMatch=0,ambig=0; const updates=[]; const colExamples=[];
for(const [name,d] of Object.entries(byDesign)){
  const bp=byName[norm(name)];
  if(!bp){noMatch++;continue;}
  const brand=norm(d.sup);
  const brands=Object.keys(bp);
  let target=bp[brand];
  if(target==null){ // 브랜드 매칭 안 됨
    if(brands.length===1) target=bp[brands[0]]; // 단일브랜드면 안전하게 사용
    else { ambig++; continue; } // 충돌인데 브랜드 불명 → 건너뜀
  }
  if(d.prices.size>1){skipPerColor++;continue;} // per-color 보호
  const cur=[...d.prices][0];
  if(cur!==target){
    const wasCollision=brands.length>1&&new Set(Object.values(bp)).size>1;
    if(wasCollision){colFix++;if(colExamples.length<20)colExamples.push(`${name}[${brand}]: ${cur} → ${target} (시트 ${Object.entries(bp).map(([b,p])=>b+"="+p).join("/")})`);}
    upd++; updates.push(...d.rows.map(r=>({id:r.id,price:target})));
  }
}
console.log(`갱신디자인 ${upd}(색 ${updates.length}) | 그중 브랜드충돌수정 ${colFix} | per-color보호 ${skipPerColor} | 충돌-브랜드불명(건너뜀) ${ambig} | 시트없음 ${noMatch}`);
console.log("\n=== 브랜드충돌 수정 예시 ===");colExamples.forEach(e=>console.log("  "+e));
if(!APPLY){console.log("\n드라이런. 적용: --apply");process.exit(0);}
let done=0;for(let i=0;i<updates.length;i+=100){const c=updates.slice(i,i+100);await Promise.all(c.map(u=>sb.from("fabrics").update({price_per_yard:u.price}).eq("id",u.id)));done+=c.length;}
console.log("완료:",done,"색");
