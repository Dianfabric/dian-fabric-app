import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
// 디자인 단위(모든 색 동일가)
const DESIGN={LD1117P:30000,LD1118P:30000,LD1507B:28000,LD1906P:26500,LD2004B:30000,LD2005P:33000,LD2084P:28000,LD2090P:25500,LD2101P:26500,LD2113B:30000,LD2240B:30000,LD2256P:30000,LD2259P:30000,LD2273P:30000,LD2286P:38500,LD2300B:28000,LD2305B:38500,LD2313P:25500,LD2318P:30000,LD2329P:38500,LD2335P:30000,LD2491P:30000,NA6001:28000};
// 색상 단위
const COLOR={PS5071:{"1":34500,"2":37000,"3":30000},HALO:{HA006:42000,HA007:42000,HA008:42000,HA009:42000,HA010:42000,HA011:28000,HA012:28000}};
const updates=[]; const miss=[];
for(const [name,price] of Object.entries(DESIGN)){
  const{data}=await sb.from("fabrics").select("id,color_code,price_per_yard").eq("name",name);
  if(!data||!data.length){miss.push(name);continue;}
  for(const r of data) updates.push({id:r.id,label:`${name}-${r.color_code}`,old:r.price_per_yard,price});
}
for(const [name,cmap] of Object.entries(COLOR)){
  const{data}=await sb.from("fabrics").select("id,color_code,price_per_yard").eq("name",name);
  for(const r of (data||[])){ if(cmap[r.color_code]!=null) updates.push({id:r.id,label:`${name}-${r.color_code}`,old:r.price_per_yard,price:cmap[r.color_code]}); }
}
console.log("적용대상:",updates.length,"색",APPLY?"[APPLY]":"[드라이런]");
console.log("미발견 디자인:",miss.join(", ")||"없음");
const overwrite=updates.filter(u=>u.old!=null&&u.old!==u.price);
console.log("\n기존단가 덮어쓰기:",overwrite.length,"건");
overwrite.forEach(u=>console.log(`  ${u.label}: ${u.old} → ${u.price}`));
if(!APPLY){console.log("\n적용: --apply");process.exit(0);}
let done=0;
for(let i=0;i<updates.length;i+=50){const c=updates.slice(i,i+50);await Promise.all(c.map(u=>sb.from("fabrics").update({price_per_yard:u.price}).eq("id",u.id)));done+=c.length;}
console.log("완료:",done,"색 단가 적용");
