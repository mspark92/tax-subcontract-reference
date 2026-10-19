// 진단: 판례 목록을 다시 받아 본문 조회 성공/실패를 건별로 기록하고, 중앙부처 해석 본문 접근 여부를 확인합니다.
// 결과: data/_debug/diag.json (OC 값은 기록하지 않음)
import fs from 'node:fs';
import {DOMAINS} from './registry.mjs';
const OC=process.env.LAW_API_OC;
const get=async(ep,p)=>{const u='https://www.law.go.kr/DRF/'+ep+'?'+new URLSearchParams({OC,type:'JSON',...p});for(let i=0;i<3;i++){try{const r=await fetch(u,{signal:AbortSignal.timeout(30000)});return {status:r.status,text:await r.text()};}catch(e){if(i===2)return {status:0,text:String(e)};}}};
const out={prec:[],cgm:[]};
for(const [domain,cfg] of Object.entries(DOMAINS)){
 const src=cfg.sources.find(s=>s.target==='prec');if(!src)continue;
 const per=Math.ceil(src.limit/src.queries.length);const seen=new Set();
 for(const q of src.queries){
  for(let page=1;page<=Math.ceil(per/100);page++){
   const r=await get('lawSearch.do',{target:'prec',query:q,display:String(Math.min(100,per)),page:String(page),sort:'ddes'});
   let items=[];try{const j=JSON.parse(r.text);const root=Object.values(j)[0];items=[].concat(root.prec||[]);}catch{}
   for(const it of items){const id=it.판례일련번호;if(!id||seen.has(id))continue;seen.add(id);
    const d=await get('lawService.do',{target:'prec',ID:id});
    let ok=false,reason='';try{const j=JSON.parse(d.text);const body=j.PrecService;ok=Boolean(body&&(body.판례내용||body.판결요지||body.판시사항));reason=ok?'':JSON.stringify(j).slice(0,120);}catch{reason=d.text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,160);}
    out.prec.push({domain,query:q,id,사건번호:it.사건번호,사건명:String(it.사건명||'').slice(0,80),선고일자:it.선고일자,데이터출처명:it.데이터출처명||'',법원명:it.법원명||'',ok,reason});
   }
   if(items.length<Math.min(100,per))break;
  }
 }
}
for(const [target,id] of [['ntsCgmExpc','2953959'],['moefCgmExpc','2899341']]){const d=await get('lawService.do',{target,ID:id});out.cgm.push({target,id,status:d.status,head:d.text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,300).split(OC).join('***')});}
fs.mkdirSync('data/_debug',{recursive:true});fs.writeFileSync('data/_debug/diag.json',JSON.stringify(out,null,1));
const s=(arr)=>arr.reduce((m,x)=>{const k=(x.ok?'성공':'실패')+' · '+(x.데이터출처명||'출처 미표기');m[k]=(m[k]||0)+1;return m;},{});
console.log(JSON.stringify({prec:out.prec.length,breakdown:s(out.prec),cgm:out.cgm.map(c=>c.target+': '+c.head.slice(0,80))},null,1));
