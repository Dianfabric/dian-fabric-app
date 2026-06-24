/**
 * Eastern 업로드 준비: easten-images/{제품}/*.jpg → easten-upload/ 펼침 + meta.csv (supplier=EASTEN)
 */
import fs from "fs";
import path from "path";

const SRC = "D:/DIAN FABRIC/easten-images";
const OUT = "D:/DIAN FABRIC/easten-upload";
const SHEET = "https://docs.google.com/spreadsheets/d/1PKx-ycLsyS1wYrvRSCJ2IceMKMoeczb2Fr2VcfNzJWc/export?format=csv&gid=88683325";

function parseCSV(t){const r=[];let row=[],f="",q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'&&t[i+1]=='"'){f+='"';i++;}else if(c=='"')q=false;else f+=c;}else{if(c=='"')q=true;else if(c==","){row.push(f);f="";}else if(c=="\n"){row.push(f);r.push(row);row=[];f="";}else if(c=="\r"){}else f+=c;}}if(f.length||row.length){row.push(f);r.push(row);}return r;}
const up=s=>(s||"").trim().toUpperCase();
const base=s=>up(s).replace(/-\d+$/,"").replace(/(\d)[A-Z]$/,"$1");
function normalizeWidthMm(v){const n=Number(String(v).replace(/[^0-9.]/g,""));if(!Number.isFinite(n)||n<=0)return "";let cm=n,i=0;while(cm<100&&i++<6)cm*=10;i=0;while(cm>1000&&i++<6)cm/=10;const mm=Math.round(cm)*10,c=mm/10;return c>=100&&c<=330?mm:Math.round(n);}
function parseComp(raw){const pct={pl:0,co:0,li:0,other:0};if(!raw)return pct;const re=/(\d+(?:\.\d+)?)\s*%?\s*([A-Za-z가-힣]+)/g;let m;while((m=re.exec(raw))){const n=Math.round(parseFloat(m[1]));const mat=m[2].toUpperCase();if(mat==="P"||mat.startsWith("PL")||mat.startsWith("POLY")||mat.startsWith("폴리"))pct.pl+=n;else if(mat==="C"||mat.startsWith("CO")||mat.startsWith("COTTON")||mat.startsWith("면"))pct.co+=n;else if(mat==="L"||mat.startsWith("LI")||mat.startsWith("LINEN")||mat.startsWith("린넨"))pct.li+=n;else pct.other+=n;}return pct;}
const cell=s=>{s=String(s??"");return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};

async function main(){
  const rows=parseCSV(await (await fetch(SHEET)).text()).slice(1).filter(r=>up(r[1])==="EASTEN");
  const meta={};rows.forEach(r=>{const b=base(r[2]);if(!meta[b])meta[b]={price:(r[3]||"").replace(/[^0-9]/g,""),mat:(r[4]||"").trim(),width:normalizeWidthMm(r[5])};});
  fs.mkdirSync(OUT,{recursive:true});
  const codes=fs.readdirSync(SRC).filter(d=>fs.statSync(path.join(SRC,d)).isDirectory());
  const lines=["name,color_code,price_per_yard,width_mm,pl_percent,co_percent,li_percent,other_percent,composition_note,supplier"];
  let copied=0,noPrice=0;
  for(const code of codes){
    const m=meta[base(code)]||{price:"",mat:"",width:""};
    if(!m.price)noPrice++;
    const comp=parseComp(m.mat);
    for(const f of fs.readdirSync(path.join(SRC,code)).filter(f=>f.toLowerCase().endsWith(".jpg"))){
      fs.copyFileSync(path.join(SRC,code,f),path.join(OUT,f));copied++;
      const stem=f.replace(/\.jpg$/i,"");const dash=stem.lastIndexOf("-");
      const name=dash>0?stem.slice(0,dash):stem;const cc=dash>0?stem.slice(dash+1):"1";
      lines.push([name,cc,m.price,m.width,comp.pl,comp.co,comp.li,comp.other,m.mat,"EASTEN"].map(cell).join(","));
    }
  }
  fs.writeFileSync(path.join(OUT,"meta.csv"),"﻿"+lines.join("\n"));
  console.log(`이미지 ${copied}장 펼침 → ${OUT}`);
  console.log(`meta.csv ${lines.length-1}행 (supplier=EASTEN), 단가없는 제품 ${noPrice}종`);
}
main().catch(e=>{console.error(e);process.exit(1);});
