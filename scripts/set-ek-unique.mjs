/** EK UNIQUE 45종(브랜드=EK UNIQUE)의 supplier 를 'EK'→'EK UNIQUE' 로 변경 (구분+featured 용). */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const APPLY=process.argv.includes("--apply");
const env={};fs.readFileSync(".env.local","utf-8").split("\n").forEach(l=>{const[k,...v]=l.split("=");if(k&&v.length)env[k.trim()]=v.join("=").trim();});
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_KEY);
const EKU=["WENGE","WALES","VAPOR","TWEED","TUNDRA","TOPAZ","TENON","TANGLE","SUNDEW","STRIO","ROCKY","RIDGE","RAVINE","PUNCH","PLATED","MEADOW","LODEN","LOAM","LAMBENT","GLAZE","GINKGO","FACET","EXTENT","ECOTONE","EBONY","DUST","DADO","CROSSGRAIN","COVE","COUNTYARD","COPPER","CITRON","CARIO","CALDERA","BLACKWOOD","BEVEL","BEELINE","BEAM","BASALT","BARTON","BACKDROP","ANGULO","AETHER","ACTUATE","ABYSS"];
let all=[],from=0;
for(;;){const{data}=await sb.from("fabrics").select("id,name,supplier").range(from,from+999);if(!data||!data.length)break;all=all.concat(data);from+=1000;if(data.length<1000)break;}
const up=s=>(s||"").trim().toUpperCase();
const targets=all.filter(f=>EKU.includes(up(f.name))&&f.supplier!=="EK UNIQUE");
console.log("대상:",targets.length,"색",APPLY?"[APPLY]":"[드라이런]");
if(!APPLY){console.log("적용: --apply");process.exit(0);}
let done=0;
for(let i=0;i<targets.length;i+=50){const c=targets.slice(i,i+50);await Promise.all(c.map(f=>sb.from("fabrics").update({supplier:"EK UNIQUE"}).eq("id",f.id)));done+=c.length;}
console.log("완료:",done,"색 supplier=EK UNIQUE");
