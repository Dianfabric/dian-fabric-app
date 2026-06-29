import fs from "fs";
const BASE="http://en.online.ektextile.com";
const DESIGNS=["ALCANTA","ENWOOL","CLEANTEX","WOOLLAM","ORIENT","SLENA","LE TEDDY","CARABU"];
// 로그인
const lr=await fetch(`${BASE}/Login/Index`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","X-Requested-With":"XMLHttpRequest"},body:new URLSearchParams({LoginId:"1449",Password:"123456",ReturnUrl:""}),redirect:"manual"});
const setc=lr.headers.getSetCookie?lr.headers.getSetCookie():[lr.headers.get("set-cookie")];
const cookie=setc.filter(Boolean).map(c=>c.split(";")[0]).join("; ");
console.log("로그인:",(await lr.json()).status, "| 쿠키:",cookie.slice(0,30)+"...");
async function list(search,page){
  const r=await fetch(`${BASE}/Product/List`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded","X-Requested-With":"XMLHttpRequest","Cookie":cookie},body:new URLSearchParams({PageIndex:String(page),PageSize:"30",Type:"",Series:"",Search:search})});
  return r.json();
}
console.log("\n디자인        페이지  총색상  분류(사이트)  성분샘플");
for(const d of DESIGNS){
  const p1=await list(d,1);
  const pages=p1.Total||0;
  let total=(p1.Data||[]).length;
  // 마지막 페이지까지 안 세고 추정: (pages-1)*30 + lastpage. 정확히는 합산
  let allcodes=(p1.Data||[]).map(x=>x.Bianhao);
  for(let pg=2;pg<=pages;pg++){const pd=await list(d,pg);allcodes=allcodes.concat((pd.Data||[]).map(x=>x.Bianhao));}
  const ex=(p1.Data||[])[0]||{};
  console.log(`${d.padEnd(12)} ${String(pages).padStart(4)} ${String(allcodes.length).padStart(6)}   ${(ex.Fenlei||"-").padEnd(8)} ${(ex.Canshu5||"").replace("Composition:","").trim()}`);
}
// 이미지 다운로드 테스트
const p=await list("ALCANTA",1); const img=p.Data[0].TupianLujing;
const ir=await fetch(BASE+img,{headers:{Cookie:cookie}});
const buf=Buffer.from(await ir.arrayBuffer());
console.log(`\n이미지 테스트 ${img}: HTTP ${ir.status}, ${buf.length} bytes`);
