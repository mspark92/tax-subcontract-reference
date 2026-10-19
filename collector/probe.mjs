// 진단용: PROBE 환경변수(JSON 배열)의 요청을 실행하고 응답 앞부분을 data/_debug/probe.json에 저장합니다. OC 값은 지웁니다.
// 항목 형식: ["DRF", "lawSearch.do", {target:"admrul",query:"기본통칙"}] 또는 ["URL", "https://..."]
import fs from 'node:fs';
const OC=process.env.LAW_API_OC;const list=JSON.parse(process.env.PROBE||'[]');const out=[];
const redact=(s)=>s.split(OC).join('***').replace(/OC=[^&"]*/g,'OC=***');
for(const [kind,a,b] of list){
 let url=kind==='DRF'?'https://www.law.go.kr/DRF/'+a+'?'+new URLSearchParams({OC,type:'JSON',...b}):a;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Mozilla/5.0 tax-subcontract-reference'}});const t=await r.text();out.push({req:[kind,a,b],status:r.status,type:r.headers.get('content-type'),length:t.length,body:redact(t.slice(0,Number(process.env.PROBE_MAX||6000)))});}
 catch(e){out.push({req:[kind,a,b],error:String(e),cause:String(e.cause||'')});}
}
fs.mkdirSync('data/_debug',{recursive:true});fs.writeFileSync('data/_debug/probe.json',JSON.stringify(out,null,1));
console.log(out.map(o=>`${o.status||o.error} ${o.length||''} ${JSON.stringify(o.req)}`).join('\n'));
