/**
 * EK 신규 원단 중 "준비중(敬请期待) 플레이스홀더" 이미지를 Gemini 비전으로 검출.
 * 기본=검출만(리스트 출력). 삭제: --delete (DB행 + Storage 이미지 삭제)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const DELETE=process.argv.includes("--delete");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const MODEL="gemini-2.5-flash";
const KEY=env.GEMINI_API_KEY;
const PROMPT=`이 이미지를 판별해줘. 실제 원단 스와치(평평한 천의 색/질감) 사진이면 "real". 아직 준비중을 뜻하는 플레이스홀더(중국어 '敬请期待'/'新近' 같은 글자가 있거나, 원단 색상 대신 샘플 부채/책 더미 사진이거나, 사진 없이 안내문구만 있으면) "placeholder". 반드시 JSON만: {"type":"real"} 또는 {"type":"placeholder"}`;
async function classify(url){
  try{
    const ir=await fetch(url);const buf=Buffer.from(await ir.arrayBuffer());
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{inline_data:{mime_type:"image/jpeg",data:buf.toString("base64")}},{text:PROMPT}]}],generationConfig:{temperature:0,maxOutputTokens:512,thinkingConfig:{thinkingBudget:0}}})});
    const j=await r.json();
    const t=j?.candidates?.[0]?.content?.parts?.[0]?.text||"";
    const m=t.match(/"type"\s*:\s*"(real|placeholder)"/);
    return m?m[1]:"?";
  }catch(e){return "err";}
}
const NAMES=["ALCANTA","CLEANTEX","CLEANTEX(S)","WOOLLAM","LE TEDDY"];
let all=[];
for(const n of NAMES){const{data}=await sb.from("fabrics").select("id,name,color_code,image_url,image_path").eq("name",n);all=all.concat(data||[]);}
console.log("EK 신규 검사 대상:",all.length,"장",DELETE?"[삭제모드]":"[검출만]");
const placeholders=[];
for(let i=0;i<all.length;i+=8){
  const chunk=all.slice(i,i+8);
  const res=await Promise.all(chunk.map(f=>classify(f.image_url)));
  chunk.forEach((f,j)=>{if(res[j]==="placeholder")placeholders.push(f);});
  process.stdout.write(`\r  진행 ${Math.min(i+8,all.length)}/${all.length} | 플레이스홀더 ${placeholders.length}`);
}
console.log("\n\n=== 플레이스홀더 검출:",placeholders.length,"장 ===");
const byName={};for(const f of placeholders){(byName[f.name]=byName[f.name]||[]).push(f.color_code);}
for(const[n,cs]of Object.entries(byName))console.log(`  ${n} (${cs.length}): ${cs.sort().join(", ")}`);
fs.writeFileSync("D:/EK-플레이스홀더.json",JSON.stringify(placeholders.map(f=>({id:f.id,name:f.name,color_code:f.color_code,image_path:f.image_path})),null,2));
if(!DELETE){console.log("\n검출만 완료. 삭제하려면 --delete");process.exit(0);}
// 삭제: Storage 이미지 + DB행
let del=0;
for(const f of placeholders){
  if(f.image_path)await sb.storage.from("Fabric-images").remove([f.image_path]);
  await sb.from("fabrics").delete().eq("id",f.id);
  del++;
}
console.log("삭제 완료:",del,"행");
