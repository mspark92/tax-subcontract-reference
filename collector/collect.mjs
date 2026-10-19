#!/usr/bin/env node
// 국가법령정보센터 Open API(DRF)에서 법령·행정규칙·해석례·결정례를 수집해 data/ 아래 JSON으로 저장합니다.
// 사용: LAW_API_OC=<OC> node collector/collect.mjs [--domain tax|subcon] [--only laws|rules|sources] [--init]
// --init: API 호출 없이 등록 목록만 data/에 반영합니다(본문 미수록 상태).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DOMAINS,lawId,slug} from './registry.mjs';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const DATA=path.join(ROOT,'data');
const args=process.argv.slice(2);
const opt=(k)=>{const i=args.indexOf('--'+k);return i>=0?(args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:true):undefined;};
const OC=process.env.LAW_API_OC;
const INIT=Boolean(opt('init'));
const ONLY=opt('only');
const DOMAIN_FILTER=opt('domain');
const NOW=new Date().toISOString();
const LAW_WARNING='국가법령정보센터 API 조문·부칙 수집본입니다. 조문별 시행일과 별표·서식은 공식 원문을 확인하세요.';
const MAX_TEXT=20000;

const readJson=(f,fallback)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return fallback;}};
const writeJson=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,1)+'\n');};
const arr=(x)=>Array.isArray(x)?x:x==null||x===''?[]:[x];
const sha=(s)=>crypto.createHash('sha256').update(s).digest('hex');
const norm=(s)=>String(s||'').replace(/[\s·ㆍ･]/g,'').toLowerCase();
const date=(x)=>{const s=String(x||'').replace(/\D/g,'');return s.length===8?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`:'';};
const clean=(s)=>String(s??'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const strings=(x)=>typeof x==='string'||typeof x==='number'?[String(x)]:Array.isArray(x)?x.flatMap(strings):[];
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

let calls=0,failures=0,successes=0;
async function api(endpoint,params){
 const url=new URL('https://www.law.go.kr/DRF/'+endpoint);
 url.search=new URLSearchParams({OC,type:'JSON',...params}).toString();
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   calls++;
   const r=await fetch(url,{signal:AbortSignal.timeout(40000),headers:{'User-Agent':'tax-subcontract-reference/1.0'}});
   const t=await r.text();
   if(!r.ok)throw Error('HTTP '+r.status);
   if(/^\s*</.test(t)){const msg=clean(t).slice(0,160);throw Error('JSON 대신 HTML 응답: '+msg);}
   const j=JSON.parse(t);
   if(j?.result&&/실패|검증|없습니다/.test(String(j.result)))throw Error(String(j.result)+' '+String(j.msg||''));
   successes++;return j;
  }catch(e){last=e;await sleep(800*(attempt+1));}
 }
 failures++;
 throw last;
}
async function pool(items,n,fn){const out=[];let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k],k);}}));return out;}

// 검색 결과 JSON에서 항목 배열을 찾습니다. 응답 루트 이름이 대상마다 달라 구조로 판별합니다.
function listItems(j){
 const root=j&&typeof j==='object'?Object.values(j)[0]:null;if(!root||typeof root!=='object')return {items:[],total:0};
 let items=[];
 for(const [k,v] of Object.entries(root)){if(Array.isArray(v)&&v.some(x=>x&&typeof x==='object')){items=v;break;}if(v&&typeof v==='object'&&!Array.isArray(v)&&/일련번호|ID|명/.test(Object.keys(v).join(' '))&&!['키워드'].includes(k)){items=[v];}}
 const total=Number(root.totalCnt||root.TotalCnt||0)||items.length;
 return {items,total};
}
function pick(o,keys){for(const k of keys){const v=o[k];const s=strings(v).join('\n');if(s.trim())return clean(s);}return '';}
function pickBy(o,re,except){for(const [k,v] of Object.entries(o)){if(re.test(k)&&!(except&&except.test(k))){const s=strings(v).join('\n');if(s.trim())return clean(s);}}return '';}
const itemId=(o)=>pickBy(o,/일련번호$/)||pick(o,['ID','행정규칙ID']);

// 상세 응답을 평탄화: {키: 문자열} 모음.
function flatten(j){
 let o=j;while(o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===1&&typeof Object.values(o)[0]==='object')o=Object.values(o)[0];
 const out={};
 const walk=(x,prefix)=>{if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){if(typeof v==='string'||typeof v==='number'){out[k]??=String(v);}else if(Array.isArray(v)&&v.every(e=>typeof e==='string')){out[k]??=v.join('\n');}else walk(v,k);}};
 walk(o,'');return out;
}
const TITLE=['사건명','안건명','제목','해석례명','법령해석례명','결정례명','재결례명','행정규칙명','건명'];
const DATE=['선고일자','의결일자','결정일자','재결일자','해석일자','회신일자','회답일자','의결일','발령일자','시행일자','등록일자','작성일자'];
const NUMBER=['사건번호','안건번호','청구번호','의결번호','사건번호명','해석번호','발령번호'];
const QUESTION=['질의요지','질의내용','질의','쟁점','청구취지'];
const ANSWER=['회답','회신내용','회신','답변','해석내용','판단','주문'];
const SUMMARY=['판시사항','결정요지','판결요지','재결요지','요지','결정요약','질의요지'];
const BODY_ORDER=[...QUESTION,...ANSWER,'이유','판결요지','판시사항','결정요지','재결요지','참조조문','참조판례','관련법령','처분내용','전문','본문','내용'];
function recordFromDetail(domain,src,id,listRow,detail){
 const f={...flatten(listRow),...flatten(detail)};
 const title=pick(f,TITLE)||pickBy(f,/명$/,/법원명|기관명|부처명|종류명/)||'제목 미확인';
 const d=date(pick(f,DATE)||pickBy(f,/일자$/));
 const number=pick(f,NUMBER);
 const question=pick(f,QUESTION);
 const answerParts=[pick(f,ANSWER),f['이유']?'【이유】\n'+clean(f['이유']):''].filter(Boolean);
 const used=new Set();const body=[];
 for(const k of BODY_ORDER){if(f[k]&&!used.has(k)&&clean(f[k]).length>20){used.add(k);body.push(`【${k}】\n${clean(f[k])}`);}}
 for(const [k,v] of Object.entries(f)){if(!used.has(k)&&!/링크|일련번호|코드|^id$|ID$/.test(k)&&clean(v).length>200){used.add(k);body.push(`【${k}】\n${clean(v)}`);}}
 const content=body.join('\n\n').slice(0,MAX_TEXT);
 const summary=(pick(f,SUMMARY)||content).replace(/\s+/g,' ').slice(0,260);
 const agency=pick(f,['법원명','해석기관명','회신기관명','소관부처명','기관명'])||src.name.replace(/ .*/,'');
 const category=src.kind==='case'?src.name:(pick(f,['법령분야','분야','세목','법령명'])||src.name);
 return {id,domain,kind:src.kind,title,agency,date:d,url:publicUrl(src.target,id,f),category:category.slice(0,40),summary,content,question:question||undefined,answer:answerParts.join('\n\n').slice(0,MAX_TEXT)||undefined,reference:[number,d].filter(Boolean).join(', ')||undefined,caseNumber:number||undefined,decision:pick(f,['재결결과','결정유형','판결유형','처분유형','조치유형'])||undefined,tags:[src.name,...(number?[number]:[])],collectedAt:NOW,source:src.id,warning:src.kind==='qa'?'회신 당시 법령 기준입니다. 현재 법령과 대조해 확인하세요.':'개별 사건의 판단입니다. 사실관계가 다르면 결론이 달라질 수 있습니다.'};
}
// 공개 열람 주소. OC(인증키)가 들어가는 DRF 주소는 공개하지 않습니다.
function publicUrl(target,rawId,f){
 const id=String(rawId).split('-').pop();
 if(target==='prec')return 'https://www.law.go.kr/LSW/precInfoP.do?precSeq='+id;
 if(target==='expc')return 'https://www.law.go.kr/LSW/expcInfoP.do?expcSeq='+id;
 if(target==='admrul')return 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq='+id;
 const q=pick(f,NUMBER)||pick(f,TITLE);
 return 'https://www.law.go.kr/LSW/totalSearch.do?query='+encodeURIComponent(q);
}

// 법령 조문 → 본문/구간
function lawText(x){if(!x||typeof x!=='object')return strings(x);if(Array.isArray(x))return x.flatMap(lawText);return ['조문내용','항내용','호내용','목내용','부칙내용'].flatMap(k=>strings(x[k])).concat(['항','호','목'].flatMap(k=>lawText(x[k])));}
function buildLawBody(root){
 let content='';const sections=[];
 for(const [i,u] of arr(root.조문?.조문단위).entries()){const body=clean(lawText(u).join('\n'));if(!body)continue;const start=content.length;content+=body+'\n\n';sections.push({id:'article-'+i,title:body.split('\n')[0].slice(0,120),start,end:content.length,kind:u.조문여부==='전문'?'heading':'article',no:String(u.조문번호||'')+(u.조문가지번호?'의'+u.조문가지번호:'')});}
 for(const [i,u] of arr(root.부칙?.부칙단위).entries()){const body=clean(lawText(u).join('\n'));if(!body)continue;const start=content.length;content+=body+'\n\n';sections.push({id:'supplement-'+i,title:body.split('\n')[0].slice(0,120),start,end:content.length,kind:'supplement'});}
 const annexes=arr(root.별표?.별표단위).map(b=>({title:clean(strings(b.별표제목).join(' ')||'별표'),no:String(b.별표번호||''),kind:String(b.별표구분||''),pdf:b.별표PDF파일링크?'https://www.law.go.kr'+b.별표PDF파일링크:undefined,file:b.별표서식파일링크?'https://www.law.go.kr'+b.별표서식파일링크:undefined})).filter(a=>a.title);
 const reason=clean(strings(root.제개정이유?.제개정이유내용).join('\n'));
 const revision=clean(strings(root.개정문?.개정문내용).join('\n'));
 return {content,sections,annexes,reason,revision};
}
function diffSections(oldBody,newBody){
 if(!oldBody?.content)return {added:[],changed:[],removed:[]};
 const key=(s)=>s.kind==='supplement'?null:(s.title.match(/^제\d+조(의\d+)?/)?.[0]||null);
 const map=(b)=>new Map(b.sections.filter(s=>key(s)).map(s=>[key(s),{title:s.title,text:b.content.slice(s.start,s.end)}]));
 const a=map(oldBody),b=map(newBody);
 const added=[...b.keys()].filter(k=>!a.has(k)).map(k=>b.get(k).title);
 const removed=[...a.keys()].filter(k=>!b.has(k)).map(k=>a.get(k).title);
 const changed=[...b.keys()].filter(k=>a.has(k)&&a.get(k).text!==b.get(k).text).map(k=>b.get(k).title);
 return {added,changed,removed};
}

function domainFiles(domain){const dir=path.join(DATA,domain);return {dir,laws:path.join(dir,'laws.json'),catalog:path.join(dir,'catalog.json'),bodies:path.join(dir,'bodies')};}

async function collectLaws(domain,cfg,state,results,pending){
 const files=domainFiles(domain);
 const prev=new Map(state.laws.map(r=>[r.id,r]));
 const next=[];let checked=0,updated=0,added=0;const errors=[];
 const entries=cfg.laws.map((e,i)=>({...e,order:i}));
 await pool(entries,3,async(e)=>{
  const id=lawId(domain,e.title);const old=prev.get(id);
  const base={id,domain,kind:'law',title:e.title,agency:'법제처 국가법령정보센터',date:old?.date||'',url:'https://www.law.go.kr/법령/'+encodeURIComponent(e.title),category:e.category,summary:e.application,content:'',tags:[e.category,e.lawLevel],lawLevel:e.lawLevel,lawGroup:e.group,lawOrder:e.order,application:e.application,lawTarget:'law'};
  if(INIT||!OC){next.push({...base,...(old||{}),...pickMeta(base)});return;}
  try{
   const s=await api('lawSearch.do',{target:'law',query:e.title,display:'100',nw:'3'});
   const row=listItems(s).items.find(x=>norm(x.법령명한글)===norm(e.title));
   if(!row)throw Error('정확한 법령명을 찾지 못했습니다.');
   checked++;
   const mst=String(row.법령일련번호);
   const bodyFile=path.join(files.bodies,id+'.json');
   if(old?.lawVersion===mst&&old.hasBody&&fs.existsSync(bodyFile)){next.push({...old,...pickMeta(base),lastCheckedAt:NOW});return;}
   const payload=await api('lawService.do',{target:'law',MST:mst});
   const root=payload.법령,b=root?.기본정보;
   if(!b||norm(b.법령명_한글)!==norm(e.title))throw Error('법령명 검증 실패');
   const body=buildLawBody(root);
   if(!body.content||!body.sections.length)throw Error('조문이 비어 있습니다.');
   const oldBody=readJson(bodyFile,null);
   const rec={...base,date:date(b.공포일자),effectiveDate:date(b.시행일자),promulgationDate:date(b.공포일자),lawVersion:mst,edition:'시행 '+date(b.시행일자),promulgationNo:String(b.공포번호||''),revisionType:String(b.제개정구분||''),ministry:pick(b,['소관부처'])||strings(b.소관부처?.content).join(''),collectedAt:NOW,lastCheckedAt:NOW,sourceSnapshotUrl:'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq='+mst,sourceHash:sha(body.content),hasBody:true,articleCount:body.sections.filter(s=>s.kind==='article').length,annexCount:body.annexes.length,warning:LAW_WARNING};
   writeJson(bodyFile,{id,content:body.content,lawSections:body.sections,annexes:body.annexes,revisionReason:body.reason.slice(0,30000),revisionText:body.revision.slice(0,30000)});
   if(old?.hasBody){updated++;if(old.sourceHash!==rec.sourceHash||old.lawVersion!==mst)pending.push({type:'law',domain,id,title:e.title,lawLevel:e.lawLevel,detectedAt:NOW,before:{version:old.lawVersion,effectiveDate:old.effectiveDate,promulgationDate:old.promulgationDate},after:{version:mst,effectiveDate:rec.effectiveDate,promulgationDate:rec.promulgationDate,revisionType:rec.revisionType,promulgationNo:rec.promulgationNo},diff:diffSections(oldBody,{content:body.content,sections:body.sections}),reasonExcerpt:body.reason.slice(0,4000)});}
   else added++;
   next.push(rec);
  }catch(err){errors.push(e.title+': '+(err.message||err));next.push({...base,...(old||{}),...pickMeta(base),lastError:String(err.message||err).slice(0,200)});}
 });
 next.sort((a,b)=>a.lawOrder-b.lawOrder);
 state.laws=[...next,...state.laws.filter(r=>r.lawTarget==='admrul')];
 if(!INIT&&OC)results.push({source:cfg.label+' 법령(국가법령정보센터)',status:errors.length===cfg.laws.length?'error':'success',checked,added,updated,note:errors.length?`확인 실패 ${errors.length}건: ${errors.slice(0,4).join(' / ')}`:'현행 법령 버전 확인',error:errors.length===cfg.laws.length?errors[0]:undefined});
}
// 등록 목록에서 매번 덮어쓸 메타데이터
function pickMeta(b){return {title:b.title,category:b.category,lawLevel:b.lawLevel,lawGroup:b.lawGroup,lawOrder:b.lawOrder,application:b.application,summary:b.summary,tags:b.tags,url:b.url};}

async function collectRules(domain,cfg,state,results,pending){
 if(INIT||!OC)return;
 const files=domainFiles(domain);
 const prev=new Map(state.laws.filter(r=>r.lawTarget==='admrul').map(r=>[r.id,r]));
 const found=new Map();let checked=0,added=0,updated=0;const errors=[];
 await pool(cfg.rules.map((r,i)=>({...r,order:1000+i})),3,async(rule)=>{
  try{
   const s=await api('lawSearch.do',{target:'admrul',query:rule.query,display:'50',nw:'1'});
   const rows=listItems(s).items.filter(x=>norm(x.행정규칙명).includes(norm(rule.query))&&!/폐지/.test(String(x.제개정구분명||'')));
   if(!rows.length)throw Error('검색 결과 없음');
   for(const row of rows.slice(0,3)){
    checked++;
    const name=clean(row.행정규칙명);const seq=String(row.행정규칙일련번호);const id=`${domain}-rule-${slug(name)}`;
    if(found.has(id))continue;
    const old=prev.get(id);
    const base={id,domain,kind:'law',title:name,agency:clean(row.소관부처명||'')||'소관부처',date:date(row.발령일자),url:'https://www.law.go.kr/행정규칙/'+encodeURIComponent(name),category:rule.category,summary:`${clean(row.행정규칙종류||'행정규칙')} · ${clean(row.소관부처명||'')} 발령`,content:'',tags:[rule.category,'행정규칙'],lawLevel:clean(row.행정규칙종류||'행정규칙'),lawGroup:rule.group,lawOrder:rule.order,lawTarget:'admrul'};
    const bodyFile=path.join(files.bodies,id+'.json');
    if(old?.lawVersion===seq&&old.hasBody&&fs.existsSync(bodyFile)){found.set(id,{...old,lastCheckedAt:NOW});continue;}
    const d=await api('lawService.do',{target:'admrul',ID:seq});
    const f=flatten(d);let o=d;while(o&&typeof o==='object'&&Object.keys(o).length===1)o=Object.values(o)[0];
    const articles=arr(o?.조문내용).flatMap(strings).map(clean).filter(Boolean);
    let content='';const sections=[];
    const parts=articles.length?articles:[clean(strings(o?.본문||f.본문||'').join('\n'))].filter(Boolean);
    parts.forEach((t,i)=>{const start=content.length;content+=t+'\n\n';sections.push({id:'article-'+i,title:t.split('\n')[0].slice(0,120),start,end:content.length,kind:'article'});});
    for(const [i,t] of arr(o?.부칙?.부칙내용).flatMap(strings).map(clean).filter(Boolean).entries()){const start=content.length;content+=t+'\n\n';sections.push({id:'supplement-'+i,title:t.split('\n')[0].slice(0,120),start,end:content.length,kind:'supplement'});}
    const annexes=arr(o?.별표?.별표단위).map(b=>({title:clean(strings(b.별표제목).join(' ')),pdf:b.별표PDF파일링크?'https://www.law.go.kr'+b.별표PDF파일링크:undefined,file:b.별표서식파일링크?'https://www.law.go.kr'+b.별표서식파일링크:undefined})).filter(a=>a.title);
    if(!content){found.set(id,{...base,lastError:'본문 없음'});continue;}
    const oldBody=readJson(bodyFile,null);
    writeJson(bodyFile,{id,content,lawSections:sections,annexes});
    const rec={...base,effectiveDate:date(row.시행일자),promulgationDate:date(row.발령일자),edition:'시행 '+date(row.시행일자),lawVersion:seq,collectedAt:NOW,lastCheckedAt:NOW,sourceSnapshotUrl:'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq='+seq,sourceHash:sha(content),hasBody:true,articleCount:sections.filter(s=>s.kind==='article').length,annexCount:annexes.length,warning:'국가법령정보센터 행정규칙 수집본입니다. 별표·서식은 공식 원문을 확인하세요.'};
    if(old?.hasBody){updated++;pending.push({type:'rule',domain,id,title:name,lawLevel:rec.lawLevel,detectedAt:NOW,before:{version:old.lawVersion,effectiveDate:old.effectiveDate},after:{version:seq,effectiveDate:rec.effectiveDate,promulgationDate:rec.promulgationDate},diff:diffSections(oldBody,{content,sections})});}else added++;
    found.set(id,rec);
   }
  }catch(err){errors.push(rule.query+': '+(err.message||err));}
 });
 // 이번에 찾지 못한 기존 규칙은 보존합니다(일시적 오류로 사라지지 않도록).
 for(const [id,r] of prev)if(!found.has(id))found.set(id,r);
 state.laws=[...state.laws.filter(r=>r.lawTarget!=='admrul'),...[...found.values()].sort((a,b)=>a.lawOrder-b.lawOrder||a.title.localeCompare(b.title,'ko'))];
 results.push({source:cfg.label+' 고시·지침·통칙(행정규칙)',status:errors.length===cfg.rules.length?'error':'success',checked,added,updated,note:errors.length?`미확인 ${errors.length}건: ${errors.slice(0,4).join(' / ')}`:'행정규칙 버전 확인',error:errors.length===cfg.rules.length?errors[0]:undefined});
}

async function collectSources(domain,cfg,state,results,pending){
 if(INIT||!OC)return;
 const have=new Map(state.catalog.map(r=>[r.id,r]));
 for(const src of cfg.sources){
  const rows=new Map();const errors=[];
  for(const q of src.queries){
   const per=Math.ceil(src.limit/src.queries.length);
   for(let page=1;rows.size<src.limit&&page<=Math.ceil(per/100);page++){
    try{
     const params={target:src.target,display:String(Math.min(100,per)),page:String(page),sort:'ddes'};if(q)params.query=q;
     const s=await api('lawSearch.do',params);const {items}=listItems(s);
     for(const it of items){const raw=itemId(it);if(raw)rows.set(raw,it);}
     if(items.length<Math.min(100,per))break;
    }catch(err){errors.push((q||'전체')+': '+(err.message||err));break;}
   }
  }
  const fresh=[...rows.entries()].filter(([raw])=>!have.has(`${domain}-${src.id}-${raw}`)).slice(0,src.limit);
  let added=0;const detailErrors=[];
  await pool(fresh,4,async([raw,row])=>{
   try{const d=await api('lawService.do',{target:src.target,ID:raw});const rec=recordFromDetail(domain,src,`${domain}-${src.id}-${raw}`,row,d);if(rec.content||rec.answer){have.set(rec.id,rec);added++;}else detailErrors.push(raw+': 본문 없음');}
   catch(err){detailErrors.push(raw+': '+(err.message||err));}
  });
  if(added&&have.size)pending.push({type:'source',domain,source:src.name,kind:src.kind,added,detectedAt:NOW,ids:[...have.values()].filter(r=>r.source===src.id&&r.collectedAt===NOW).map(r=>r.id).slice(0,30)});
  const status=!rows.size&&errors.length?'error':'success';
  results.push({source:`${cfg.label} ${src.name}`,status,checked:rows.size,added,updated:0,note:[`최신순 ${rows.size}건 확인`,detailErrors.length?`상세 실패 ${detailErrors.length}건`:''].filter(Boolean).join(' · '),error:status==='error'?errors[0]:undefined});
 }
 state.catalog=[...have.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));
}

async function main(){
 if(!OC&&!INIT){console.error('LAW_API_OC 환경변수가 필요합니다. 등록 목록만 반영하려면 --init을 사용하세요.');process.exit(2);}
 const runs=readJson(path.join(DATA,'runs.json'),[]);
 const pending=readJson(path.join(DATA,'pending.json'),[]);
 const newPending=[];
 for(const [domain,cfg] of Object.entries(DOMAINS)){
  if(DOMAIN_FILTER&&DOMAIN_FILTER!==domain)continue;
  const files=domainFiles(domain);
  const state={laws:readJson(files.laws,[]),catalog:readJson(files.catalog,[])};
  const results=[];const startedAt=new Date().toISOString();
  if(!ONLY||ONLY==='laws')await collectLaws(domain,cfg,state,results,newPending);
  if(!ONLY||ONLY==='rules')await collectRules(domain,cfg,state,results,newPending);
  if(!ONLY||ONLY==='sources')await collectSources(domain,cfg,state,results,newPending);
  writeJson(files.laws,state.laws);
  for(const extra of ['guides.json','updates.json'])if(!fs.existsSync(path.join(files.dir,extra)))writeJson(path.join(files.dir,extra),[]);
  writeJson(files.catalog,state.catalog);
  if(results.length){
   const status=(failures&&!successes)?'blocked':results.every(r=>r.status==='success')?'success':'partial';
   runs.unshift({id:crypto.randomUUID(),domain,startedAt,completedAt:new Date().toISOString(),status,results});
  }
 }
 writeJson(path.join(DATA,'runs.json'),runs.slice(0,120));
 writeJson(path.join(DATA,'pending.json'),[...pending,...newPending]);
 const summary=[`API 호출 ${calls}회, 실패 ${failures}회`,`새 변경사항 ${newPending.length}건`,...runs.slice(0,4).flatMap(r=>r.results.map(x=>`- [${x.status}] ${x.source}: ${x.note||x.error||''}`))].join('\n');
 console.log(summary);
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## 자료 수집 결과\n'+summary+'\n');
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`changes=${newPending.length}\n`);
 if(failures&&!successes)process.exitCode=3;
}
main().catch(e=>{console.error(e);process.exit(1);});
