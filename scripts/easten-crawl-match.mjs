/**
 * Eastern Textile (easterntex.com) 제품 크롤 + 단가표(Easten) 매칭
 * 로그인 → getfabricpagedlist 전체 → 제품/색상/이미지URL 수집
 * 단가표 2025 TMS 브랜드=Easten 과 코드 매칭
 * 결과: scripts/easten-products.json, scripts/easten-match-report.json
 */
import fs from "fs";

const API = "https://api.easterntex.com";
const EMAIL = "nerofu@easterntex.com", PW = "123456";
const SHEET = "https://docs.google.com/spreadsheets/d/1PKx-ycLsyS1wYrvRSCJ2IceMKMoeczb2Fr2VcfNzJWc/export?format=csv&gid=88683325";
const H = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Origin": "https://www.easterntex.com", "Referer": "https://www.easterntex.com/" };

function parseCSV(t){const r=[];let row=[],f="",q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'&&t[i+1]=='"'){f+='"';i++;}else if(c=='"')q=false;else f+=c;}else{if(c=='"')q=true;else if(c==","){row.push(f);f="";}else if(c=="\n"){row.push(f);r.push(row);row=[];f="";}else if(c=="\r"){}else f+=c;}}if(f.length||row.length){row.push(f);r.push(row);}return r;}
const up=s=>(s||"").trim().toUpperCase();
const base=s=>up(s).replace(/-\d+$/,"").replace(/(\d)[A-Z]$/,"$1");

async function main(){
  // 로그인
  const login=await (await fetch(API+"/api/web/user/emaillogin",{method:"POST",headers:H,body:JSON.stringify({email:EMAIL,password:PW})})).json();
  const A={...H,"Authorization":"Bearer "+login.data.accessToken};
  console.log("로그인 OK");

  // 전체 제품 (페이지네이션)
  const list=[]; let total=0;
  for(let page=1;page<=50;page++){
    const r=await (await fetch(API+"/api/web/fabric/getfabricpagedlist",{method:"POST",headers:A,body:JSON.stringify({page,pageSize:20})})).json();
    total=r.data.totalCount;
    const got=r.data.list||[];
    list.push(...got);
    process.stdout.write("\r받는 중 "+list.length+"/"+total+"   ");
    if(got.length===0||list.length>=total)break;
  }
  console.log("\n사이트 제품(totalCount):",total,"| 받은:",list.length);

  const products=list.map(p=>({
    code:up(p.code),
    colors:(p.fabricSubList||[]).map(s=>({code:up(s.code),url:s.planeImg?.filePathUrl||null,file:s.planeImg?.fileName||null})),
  }));
  fs.writeFileSync("scripts/easten-products.json",JSON.stringify(products,null,2));
  const totalColors=products.reduce((s,p)=>s+p.colors.length,0);
  console.log("사이트 제품 "+products.length+"종 / 색상 "+totalColors+"개");

  // 사이트 코드 집합
  const siteColor=new Set(); const siteBase=new Set();
  products.forEach(p=>{siteBase.add(base(p.code));p.colors.forEach(c=>{siteColor.add(up(c.code));siteBase.add(base(c.code));});});

  // 단가표 Easten
  const rows=parseCSV(await (await fetch(SHEET)).text()).slice(1).filter(r=>up(r[1])==="EASTEN");
  const sheetCodes=rows.map(r=>up(r[2])).filter(Boolean);
  const sheetColorSet=new Set(sheetCodes);
  const sheetBaseSet=new Set(sheetCodes.map(base));

  // 색상 단위 매칭
  let mc=0,xc=0; const missColor=[];
  for(const c of sheetColorSet){ if(siteColor.has(c)||siteBase.has(base(c))) mc++; else {xc++;missColor.push(c);} }
  // 제품(base) 단위 매칭
  const matchedBase=[...sheetBaseSet].filter(b=>siteBase.has(b));
  const missBase=[...sheetBaseSet].filter(b=>!siteBase.has(b));
  const siteOnlyBase=[...siteBase].filter(b=>!sheetBaseSet.has(b));

  console.log("\n=== 매칭 결과 ===");
  console.log("단가표 Easten: "+rows.length+"행 (고유 색상코드 "+sheetColorSet.size+", 고유 제품 "+sheetBaseSet.size+")");
  console.log("[색상 단위] 사이트에 있음 "+mc+" / 없음 "+xc);
  console.log("[제품 단위] 일치 "+matchedBase.length+" / 단가표만 "+missBase.length+" / 사이트만 "+siteOnlyBase.length);
  console.log("\n단가표엔 있는데 사이트에 없는 제품("+missBase.length+"): "+missBase.sort().join(", "));

  fs.writeFileSync("scripts/easten-match-report.json",JSON.stringify({
    site_products:products.length,site_colors:totalColors,
    sheet_rows:rows.length,sheet_unique_products:sheetBaseSet.size,
    matched_products:matchedBase.sort(),missing_products:missBase.sort(),site_only_products:siteOnlyBase.sort(),
    missing_colors:missColor.sort(),
  },null,2));
  console.log("\n저장: easten-products.json, easten-match-report.json");
}
main().catch(e=>{console.error(e);process.exit(1);});
