/** EK UNIQUE 전 컬러를 Gemini로 검사 → 둥근 이미지만 사이트 사각 이미지로 교체. */
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "module";
import fs from "fs";
const require=createRequire(import.meta.url); const sharp=require("sharp");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const BASE="http://en.online.ektextile.com",BUCKET="Fabric-images",KEY=env.GEMINI_API_KEY,MODEL="gemini-2.5-flash";
const up=s=>(s||"").trim().toUpperCase();
async function login(){const r=await fetch(`${BASE}/Login/Index`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({LoginId:"1449",Password:"123456",ReturnUrl:""})});return r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");}
async function list(cookie,s,p){for(let t=0;t<4;t++){try{const r=await fetch(`${BASE}/Product/List`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",Cookie:cookie},body:new URLSearchParams({PageIndex:String(p),PageSize:"30",Search:s})});const x=await r.text();if(!x)throw 0;return JSON.parse(x);}catch(e){if(t===3)return{Total:0,Data:[]};await new Promise(r=>setTimeout(r,800));}}}
async function isRound(url){try{const ir=await fetch(url);const b=Buffer.from(await ir.arrayBuffer());
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:"image/jpeg",data:b.toString("base64")}},{text:'원단이 동그라미/원형으로 잘려있으면(배경 여백 큼) "round", 이미지를 꽉 채운 사각형이면 "rect". JSON {"s":"round"|"rect"}만.'}]}],generationConfig:{temperature:0,maxOutputTokens:40,thinkingConfig:{thinkingBudget:0}}})});
  const j=await r.json();const t=j?.candidates?.[0]?.content?.parts?.[0]?.text||"";return ((t.match(/"s"\s*:\s*"(round|rect)"/)||[])[1])==="round";}catch(e){return false;}}
const cookie=await login();
let all=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,name,color_code,image_path,image_url").eq("supplier","EK UNIQUE").range(from,from+999);if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
const scan=all.filter(f=>!(f.image_url||"").includes("v=ek2")); // 이미 교체된 건 제외
console.log("EK UNIQUE 전체",all.length,"색 / 검사대상",scan.length,"색");
// 둥근 검출
const round=[];
for(let i=0;i<scan.length;i+=8){const c=scan.slice(i,i+8);const res=await Promise.all(c.map(f=>isRound(f.image_url)));c.forEach((f,j)=>{if(res[j])round.push(f);});process.stdout.write(`\r  스캔 ${Math.min(i+8,scan.length)}/${scan.length} | 둥근 ${round.length}`);}
console.log(`\n둥근 이미지: ${round.length}색`);
// 디자인별 사이트맵 캐시 후 교체
const siteCache={};
async function siteMap(name){if(siteCache[name])return siteCache[name];const p1=await list(cookie,name,1);const items=[];for(let pg=1;pg<=(p1.Total||1);pg++){const pd=pg===1?p1:await list(cookie,name,pg);items.push(...(pd.Data||[]));}const m={};for(const it of items){const b=(it.Bianhao||"").trim();const d=b.lastIndexOf("-");if(d===-1)continue;if(up(b.slice(0,d))!==up(name))continue;if(!m[b.slice(d+1)])m[b.slice(d+1)]=it.TupianLujing;}siteCache[name]=m;return m;}
let ok=0,miss=0;
for(const f of round){const m=await siteMap(f.name);const ip=m[f.color_code];if(!ip){console.log(`  ⚠️ ${f.name}-${f.color_code} 사이트없음`);miss++;continue;}
  try{const ir=await fetch(BASE+ip);const buf=Buffer.from(await ir.arrayBuffer());const jpg=await sharp(buf).rotate().jpeg({quality:88}).toBuffer();
    const{error}=await sb.storage.from(BUCKET).upload(f.image_path,jpg,{contentType:"image/jpeg",upsert:true});if(error)throw new Error(error.message);
    await sb.from("fabrics").update({image_url:(f.image_url||"").split("?")[0]+"?v=ek3"}).eq("id",f.id);ok++;
  }catch(e){console.log(`  ❌ ${f.name}-${f.color_code}: ${e.message}`);miss++;}}
console.log(`\n교체 완료 ${ok} | 실패/없음 ${miss}`);
