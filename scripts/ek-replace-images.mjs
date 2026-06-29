/** EK 사이트에서 디자인별 이미지 받아 기존 Storage 경로에 덮어쓰기(교체) + image_url 캐시버스트. */
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import fs from "fs";
const require=createRequire(import.meta.url); const sharp=require("sharp");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const BASE="http://en.online.ektextile.com", BUCKET="Fabric-images";
const DESIGNS=["ACTUATE","CALDERA","ABYSS","BACKDROP","RIDGE","TENON","LAMBENT","COVE","PLATED","ANGULO","ROCKY","STRIO","RAVINE","CROSSGRAIN","EXTENT","BEVEL","COURTYARD"];
async function login(){const r=await fetch(`${BASE}/Login/Index`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({LoginId:"1449",Password:"123456",ReturnUrl:""})});return r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");}
async function list(cookie,s,p){for(let t=0;t<4;t++){try{const r=await fetch(`${BASE}/Product/List`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Cookie:cookie},body:new URLSearchParams({PageIndex:String(p),PageSize:"30",Search:s})});const x=await r.text();if(!x)throw 0;return JSON.parse(x);}catch(e){if(t===3)return{Total:0,Data:[]};await new Promise(r=>setTimeout(r,800));}}}
const up=s=>(s||"").trim().toUpperCase();
const cookie=await login(); console.log("로그인 OK");
let total=0,fail=0;
for(const name of DESIGNS){
  const p1=await list(cookie,name,1);const items=[];for(let pg=1;pg<=(p1.Total||1);pg++){const pd=pg===1?p1:await list(cookie,name,pg);items.push(...(pd.Data||[]));}
  // 색상→이미지 (해당 디자인만, dedup)
  const map={};
  for(const it of items){const b=(it.Bianhao||"").trim();const d=b.lastIndexOf("-");if(d===-1)continue;const dn=b.slice(0,d),cc=b.slice(d+1);if(up(dn)!==up(name))continue;if(!map[cc])map[cc]=it.TupianLujing;}
  const{data:rows}=await sb.from("fabrics").select("id,color_code,image_path,image_url").eq("name",name);
  let ok=0;
  for(const r of (rows||[])){
    const imgPath=map[r.color_code];
    if(!imgPath){console.log(`  ⚠️ ${name}-${r.color_code} 사이트이미지 없음`);fail++;continue;}
    try{
      const ir=await fetch(BASE+imgPath);const buf=Buffer.from(await ir.arrayBuffer());
      const jpg=await sharp(buf).rotate().jpeg({quality:88}).toBuffer();
      const{error}=await sb.storage.from(BUCKET).upload(r.image_path,jpg,{contentType:"image/jpeg",upsert:true});
      if(error)throw new Error(error.message);
      const newUrl=(r.image_url||"").split("?")[0]+"?v=ek2"; // 캐시버스트
      await sb.from("fabrics").update({image_url:newUrl}).eq("id",r.id);
      ok++;total++;
    }catch(e){console.log(`  ❌ ${name}-${r.color_code}: ${e.message}`);fail++;}
  }
  console.log(`${name}: ${ok}/${(rows||[]).length} 교체`);
}
console.log(`\n총 교체 ${total} | 실패 ${fail}`);
