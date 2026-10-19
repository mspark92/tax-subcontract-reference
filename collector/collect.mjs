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
const DEBUG=Boolean(opt('debug'))||process.env.COLLECT_DEBUG==='1';
const debugSeen=new Set();
function debugDump(tag,j){if(!DEBUG||debugSeen.has(tag))return;debugSeen.add(tag);const redact=JSON.stringify(j).replace(/OC=[^&"]*/g,'OC=***');const shrink=(x,d=0)=>Array.isArray(x)?x.slice(0,2).map(v=>shrink(v,d+1)):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,shrink(v,d+1)])):typeof x==='string'&&x.length>300?x.slice(0,300)+'…':x;writeJson(path.join(DATA,'_debug',tag.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json'),shrink(JSON.parse(redact)));}
const NOW=new Date().toISOString();
const LAW_WARNING='국가법령정보센터 API 조문·부칙 수집본입니다. 조문별 시행일과 별표·서식은 공식 원문을 확인하세요.';
const MAX_TEXT=20000;

const readJson=(f,fallback)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return fallback;}};
const writeJson=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,1)+'\n');};
const arr=(x)=>Array.isArray(x)?x:x==null||x===''?[]:[x];
const sha=(s)=>crypto.createHash('sha256').update(s).digest('hex');
const norm=(s)=>String(s||'').replace(/[\s·ㆍ･]/g,'').toLowerCase();
const date=(x)=>{const t=String(x||'').trim();const m=t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;const s=t.replace(/\D/g,'');return s.length===8?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6)}`:'';};
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
   successes++;debugDump(endpoint.replace('.do','')+'-'+(params.target||'x'),j);return j;
  }catch(e){last=e;await sleep(800*(attempt+1));}
 }
 failures++;
 // 처음부터 계속 실패하면(인증·접속 차단) 오래 재시도하지 않고 바로 중단합니다.
 if(!successes&&failures>=4){const e=Error('국가법령정보센터 접속 실패: '+String(last?.message||last)+(last?.cause?' / '+String(last.cause.code||last.cause.message||last.cause):''));e.fatal=true;throw e;}
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
const NUMBER=['사건번호','안건번호','청구번호','의결번호','해석번호','발령번호'];
const CASE_TEXT=8000;
// 목록 값 위에 상세 값을 덮되, 빈 값으로 덮어쓰지 않습니다.
const merge=(...objs)=>{const out={};for(const o of objs)for(const [k,v] of Object.entries(o))if(String(v??'').trim()||!(k in out))out[k]=v;return out;};
const cut=(t,n)=>t.length>n?t.slice(0,n)+'\n…(원문이 길어 일부만 수록했습니다. 전체는 공식 출처에서 확인하세요.)':t;
const TAX_WORDS=[['부가','부가가치세'],['종부','종합부동산세'],['종합부동산','종합부동산세'],['법인','법인세'],['양도','양도소득세'],['종소','종합소득세'],['원천','원천징수'],['소득','소득세'],['상속','상속세·증여세'],['증여','상속세·증여세'],['상증','상속세·증여세'],['재산세제','상속세·증여세'],['조특','조세특례'],['조세특례','조세특례'],['국조','국제조세'],['국제','국제조세'],['국기','국세기본법'],['기본법','국세기본법'],['징수','국세징수'],['취득','취득세'],['재산','재산세'],['등록','등록면허세'],['지방','지방세'],['개소','개별소비세'],['소비','개별소비세'],['환경','교통·에너지·환경세'],['관세','관세'],['인지','인지세'],['증권','증권거래세'],['교육','교육세'],['농특','농어촌특별세'],['주세','주세']];
export function taxCategory(...texts){for(const t of texts){const s=String(t||'');for(const [k,v] of TAX_WORDS)if(s.includes(k))return v;}return '';}
function decisionOf(text){const t=String(text||'');for(const [re,v] of [[/각하/,'각하'],[/기각/,'기각'],[/취소한다|취소하/,'취소'],[/경정/,'경정'],[/재조사/,'재조사'],[/과징금/,'과징금'],[/시정명령|시정조치|하여서는 아니 된다|행위를 다시/,'시정명령'],[/경고/,'경고'],[/고발/,'고발']])if(re.test(t))return v;return undefined;}
const QA_WARNING='회신 당시 법령 기준입니다. 현재 법령과 대조해 확인하세요.';
const CASE_WARNING='개별 사건의 판단입니다. 사실관계와 적용 법령 시점이 다르면 결론이 달라질 수 있습니다.';
function recordFromDetail(domain,src,id,listRow,detail){
 const f=merge(flatten(listRow),flatten(detail||{}));
 const title=pick(f,TITLE)||'제목 미확인';
 const d=date(pick(f,DATE));
 const number=pick(f,NUMBER);
 const T=(k)=>clean(f[k]||'').replace(/<img[^>]*>(<\/img>)?/g,'');
 const sec=(...keys)=>keys.map(k=>T(k)?`【${k}】\n${T(k)}`:'').filter(Boolean).join('\n\n');
 const base={id,domain,kind:src.kind,title,date:d,tags:[src.name,...(number?[number]:[])],collectedAt:NOW,source:src.id,caseNumber:number||undefined,reference:[number,d].filter(Boolean).join(', ')||undefined,url:publicUrl(src.target,id,f)};
 const cat=(fallback)=>domain==='tax'?(taxCategory(f['세목'],listRow._query,number,title)||fallback):fallback;
 if(!detail){// 본문을 받을 수 없는 해석: 목록 정보만 등록
  return {...base,agency:pick(f,['해석기관명','회신기관명'])||src.name,category:cat(src.name),summary:title,content:'',noBody:true,warning:'회신 원문은 아직 수록되지 않았습니다. 공식 출처에서 원문을 확인하세요.'};
 }
 if(src.target==='expc'||/CgmExpc$/.test(src.target)){
  const question=T('질의요지')||T('질의내용');const answer=[T('회답')||T('회신내용'),T('이유')?'【이유】\n'+T('이유'):''].filter(Boolean).join('\n\n');
  return {...base,agency:pick(f,['해석기관명','회신기관명'])||src.name,category:cat(src.name),summary:(question||answer).replace(/\s+/g,' ').slice(0,260),content:'',question:question||undefined,answer:cut(answer,MAX_TEXT)||undefined,warning:QA_WARNING};
 }
 if(src.target==='ttSpecialDecc'){
  const 세목=T('세목');
  return {...base,agency:'조세심판원',category:cat('조세심판원 결정'),summary:(T('재결요지')||title).replace(/\s+/g,' ').slice(0,260),content:cut((sec('재결요지','주문','관련법령','참조결정')+'\n\n'+sec('이유')).trim(),CASE_TEXT),decision:decisionOf(T('주문')),tags:['조세심판원',...(세목?[세목]:[]),...(number?[number]:[])],warning:CASE_WARNING};
 }
 if(src.target==='ftc'){
  return {...base,agency:'공정거래위원회',category:/이의신청/.test(title)?'이의신청 재결':pick(f,['문서유형'])||'의결서',summary:T('주문').replace(/\s+/g,' ').slice(0,260)||title,content:cut((sec('주문')+'\n\n'+sec('이유')).trim(),CASE_TEXT),decision:decisionOf(T('주문')),warning:CASE_WARNING};
 }
 // 판례
 return {...base,agency:pick(f,['법원명'])||'법원',category:cat('판례'),summary:(T('판시사항')||T('판결요지')||title).replace(/\s+/g,' ').slice(0,260),content:cut((sec('판시사항','판결요지','참조조문','참조판례')+'\n\n'+sec('판례내용')).trim(),CASE_TEXT),decision:pick(f,['판결유형'])||undefined,warning:CASE_WARNING};
}
// 공개 열람 주소. OC(인증키)가 들어가는 DRF 주소는 공개하지 않습니다.
function publicUrl(target,rawId,f){
 const id=String(rawId).split('-').pop();
 const link=pick(f,['법령해석상세링크']);if(/^https:\/\/taxlaw\.nts\.go\.kr/.test(link))return link;
 if(target==='prec')return 'https://www.law.go.kr/LSW/precInfoP.do?precSeq='+id;
 if(target==='expc')return 'https://www.law.go.kr/LSW/expcInfoP.do?expcSeq='+id;
 if(target==='ttSpecialDecc')return 'https://www.law.go.kr/LSW/specialDeccInfoP.do?specialDeccSeq='+id;
 if(target==='ftc')return 'https://www.law.go.kr/LSW/cmtDecInfoP.do?cmtDecSeq='+id+'&tbNm=ftc';
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
  }catch(err){if(err.fatal)throw err;errors.push(e.title+': '+(err.message||err));next.push({...base,...(old||{}),...pickMeta(base),lastError:String(err.message||err).slice(0,200)});}
 });
 next.sort((a,b)=>a.lawOrder-b.lawOrder);
 state.laws=[...next,...state.laws.filter(r=>r.lawTarget==='admrul')];
 if(!INIT&&OC)results.push({source:cfg.label+' 법령(국가법령정보센터)',status:errors.length===cfg.laws.length?'error':'success',checked,added,updated,note:errors.length?`확인 실패 ${errors.length}건: ${errors.slice(0,4).join(' / ')}`:'현행 법령 버전 확인',error:errors.length===cfg.laws.length?errors[0]:undefined});
}
// 등록 목록에서 매번 덮어쓸 메타데이터
function pickMeta(b){return {title:b.title,category:b.category,lawLevel:b.lawLevel,lawGroup:b.lawGroup,lawOrder:b.lawOrder,application:b.application,summary:b.summary,tags:b.tags,url:b.url};}

// 행정규칙 본문: 조문형식이면 조문 배열, 아니면 한 덩어리 지침을 로마숫자 장 단위로 나눕니다.
function ruleBody(o){
 let parts=arr(o?.조문내용).flatMap(strings).map(clean).filter(Boolean);
 if(parts.length===1&&parts[0].length>3000){const t=parts[0];const pieces=t.split(/(?=(?:^|\s)[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{1,4}\s?\.\s?)|(?=제\d+조(?:의\d+)?\s?\()/).map(x=>x.trim()).filter(Boolean);if(pieces.length>1)parts=pieces;}
 let content='';const sections=[];
 parts.forEach((t,i)=>{const start=content.length;content+=t+'\n\n';sections.push({id:'article-'+i,title:t.split('\n')[0].slice(0,80),start,end:content.length,kind:'article'});});
 for(const [i,t] of arr(o?.부칙?.부칙내용).flatMap(strings).map(clean).filter(Boolean).entries()){const start=content.length;content+=t+'\n\n';sections.push({id:'supplement-'+i,title:t.split('\n')[0].slice(0,80),start,end:content.length,kind:'supplement'});}
 const links=arr(o?.첨부파일?.첨부파일링크).flatMap(strings),names=arr(o?.첨부파일?.첨부파일명).flatMap(strings);
 const annexes=[...arr(o?.별표?.별표단위).map(b=>({title:clean(strings(b.별표제목).join(' ')),pdf:b.별표PDF파일링크?'https://www.law.go.kr'+b.별표PDF파일링크:undefined,file:b.별표서식파일링크?'https://www.law.go.kr'+b.별표서식파일링크:undefined})),...links.map((l,i)=>({title:clean(names[i]||'첨부파일 '+(i+1)),file:l.replace(/^http:\/\/(www\.)?law\.go\.kr/,'https://www.law.go.kr')}))].filter(a=>a.title);
 const reason=clean(strings(o?.제개정이유?.제개정이유내용).join('\n'));
 return {content,sections,annexes,reason};
}
async function collectRules(domain,cfg,state,results,pending){
 if(INIT||!OC)return;
 const files=domainFiles(domain);
 const prev=new Map(state.laws.filter(r=>r.lawTarget==='admrul').map(r=>[r.id,r]));
 const found=new Map();let checked=0,added=0,updated=0;const errors=[];
 for(const [order,rule] of cfg.rules.entries()){
  try{
   const s=await api('lawSearch.do',{target:'admrul',query:rule.query,display:'100'});
   const rows=listItems(s).items.filter(x=>(x.현행연혁구분??'현행')==='현행'&&!/폐지/.test(String(x.제개정구분명||''))&&(!rule.ministries||rule.ministries.includes(clean(x.소관부처명||'')))&&(!rule.nameIncludes||rule.nameIncludes.some(k=>norm(x.행정규칙명).includes(norm(k))))&&!(rule.exclude||[]).some(k=>norm(x.행정규칙명).includes(norm(k))));
   if(!rows.length){errors.push(rule.query+': 검색 결과 없음');continue;}
   await pool(rows.slice(0,rule.max||10),3,async(row)=>{
    checked++;
    const name=clean(row.행정규칙명);const seq=String(row.행정규칙일련번호);const id=`${domain}-rule-${slug(name)}`;
    if(found.has(id))return;found.set(id,null);
    const old=prev.get(id);
    const kindName=clean(row.행정규칙종류||'행정규칙');
    const base={id,domain,kind:'law',title:name,agency:clean(row.소관부처명||'')||'소관부처',date:date(row.발령일자),url:'https://www.law.go.kr/행정규칙/'+encodeURIComponent(name),category:rule.category,summary:`${clean(row.소관부처명||'')} ${kindName} 제${clean(row.발령번호||'')}호 · ${rule.note||'관련 행정규칙'}`,content:'',tags:[rule.category,kindName],lawLevel:kindName,lawGroup:rule.group,lawOrder:1000+order,application:rule.note,lawTarget:'admrul'};
    const bodyFile=path.join(files.bodies,id+'.json');
    if(old?.lawVersion===seq&&old.hasBody&&fs.existsSync(bodyFile)){found.set(id,{...old,...pickMeta(base),lastCheckedAt:NOW});return;}
    const d=await api('lawService.do',{target:'admrul',ID:seq});
    let o=d;while(o&&typeof o==='object'&&Object.keys(o).length===1)o=Object.values(o)[0];
    const body=ruleBody(o);
    if(!body.content){found.set(id,{...base,lastError:'본문 없음'});return;}
    const oldBody=readJson(bodyFile,null);
    writeJson(bodyFile,{id,content:body.content,lawSections:body.sections,annexes:body.annexes,revisionReason:body.reason.slice(0,30000)});
    const rec={...base,effectiveDate:date(row.시행일자),promulgationDate:date(row.발령일자),edition:'시행 '+date(row.시행일자),lawVersion:seq,collectedAt:NOW,lastCheckedAt:NOW,sourceSnapshotUrl:'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq='+seq,sourceHash:sha(body.content),hasBody:true,articleCount:body.sections.filter(s=>s.kind==='article').length,annexCount:body.annexes.length,warning:'국가법령정보센터 행정규칙 수집본입니다. 별표·서식·첨부파일은 공식 원문을 확인하세요.'};
    if(old?.hasBody&&old.sourceHash!==rec.sourceHash){updated++;pending.push({type:'rule',domain,id,title:name,lawLevel:kindName,detectedAt:NOW,before:{version:old.lawVersion,effectiveDate:old.effectiveDate},after:{version:seq,effectiveDate:rec.effectiveDate,promulgationDate:rec.promulgationDate},diff:diffSections(oldBody,{content:body.content,sections:body.sections}),reasonExcerpt:body.reason.slice(0,4000)});}else if(!old?.hasBody)added++;
    found.set(id,rec);
   });
  }catch(err){if(err.fatal)throw err;errors.push(rule.query+': '+(err.message||err));}
 }
 // 이번에 찾지 못한 기존 규칙은 보존합니다(일시적 오류로 사라지지 않도록).
 for(const [id,r] of prev)if(!found.get(id))found.set(id,r);
 state.laws=[...state.laws.filter(r=>r.lawTarget!=='admrul'),...[...found.values()].filter(Boolean).sort((a,b)=>a.lawOrder-b.lawOrder||a.title.localeCompare(b.title,'ko'))];
 results.push({source:cfg.label+' 고시·지침·통칙(행정규칙)',status:errors.length===cfg.rules.length?'error':'success',checked,added,updated,note:errors.length?`미확인 ${errors.length}건: ${errors.slice(0,4).join(' / ')}`:'행정규칙 버전 확인',error:errors.length===cfg.rules.length?errors[0]:undefined});
}

async function collectSources(domain,cfg,state,results,pending){
 if(INIT||!OC)return;
 const have=new Map(state.catalog.map(r=>[r.id,r]));
 for(const src of cfg.sources){
  const rows=new Map();const errors=[];
  const per=Math.ceil(src.limit/src.queries.length);
  for(const q of src.queries){
   let got=0;
   for(let page=1;got<per&&page<=Math.ceil(per/100);page++){
    try{
     const params={target:src.target,display:String(Math.min(100,per)),page:String(page),sort:'ddes'};if(q)params.query=q;
     const s=await api('lawSearch.do',params);const {items}=listItems(s);
     for(const it of items){const raw=itemId(it);if(raw&&!rows.has(raw)){rows.set(raw,{...it,_query:q});got++;}}
     if(items.length<Math.min(100,per))break;
    }catch(err){if(err.fatal)throw err;errors.push((q||'전체')+': '+(err.message||err));break;}
   }
  }
  // 새 항목 + 본문이 없던 기존 항목(신청 승인 후 채우기)
  const key=(raw)=>`${domain}-${src.id}-${raw}`;
  const todo=[...rows.entries()].filter(([raw])=>!have.has(key(raw))||have.get(key(raw)).noBody);
  let added=0,filled=0,listed=0,blockedDetail=0;const detailErrors=[];
  await pool(todo,4,async([raw,row])=>{
   const id=key(raw);const existed=have.get(id);
   if(src.detail===false||(blockedDetail>=3&&existed?.noBody)){if(!existed){have.set(id,recordFromDetail(domain,src,id,row,null));listed++;}return;}
   try{
    const d=await api('lawService.do',{target:src.target,ID:raw});
    const rec=recordFromDetail(domain,src,id,row,d);
    if(rec.content||rec.answer){have.set(id,rec);existed?filled++:added++;}
    else if(src.listOnly!==false&&!existed){have.set(id,recordFromDetail(domain,src,id,row,null));listed++;}
   }catch(err){
    if(err.fatal)throw err;
    if(/미신청/.test(String(err.message))){blockedDetail++;if(!existed){have.set(id,recordFromDetail(domain,src,id,row,null));listed++;}}
    else detailErrors.push(raw+': '+String(err.message||err).slice(0,80));
   }
  });
  // 오래된 항목 정리: 출처별 상한을 넘으면 오래된 것부터 제외
  const mine=[...have.values()].filter(r=>r.source===src.id).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  for(const r of mine.slice(src.keep||src.limit*2))have.delete(r.id);
  if(added)pending.push({type:'source',domain,source:src.name,kind:src.kind,added,detectedAt:NOW,ids:mine.filter(r=>r.collectedAt===NOW&&!r.noBody).map(r=>r.id).slice(0,30)});
  const status=!rows.size&&errors.length?'error':'success';
  results.push({source:`${cfg.label} ${src.name}`,status,checked:rows.size,added:added+listed,updated:filled,note:[`최신순 ${rows.size}건 확인`,listed?`목록만 등록 ${listed}건`:'',blockedDetail?'본문 API 미신청':'',detailErrors.length?`상세 실패 ${detailErrors.length}건`:''].filter(Boolean).join(' · '),error:status==='error'?errors[0]:undefined});
 }
 state.catalog=[...have.values()].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));
}

async function main(){
 if(!OC&&!INIT){console.error('LAW_API_OC 환경변수가 필요합니다. 등록 목록만 반영하려면 --init을 사용하세요.');process.exit(2);}
 const runs=readJson(path.join(DATA,'runs.json'),[]);
 const pending=readJson(path.join(DATA,'pending.json'),[]);
 const newPending=[];
 let fatal=null;
 for(const [domain,cfg] of Object.entries(DOMAINS)){
  if(fatal)break;
  if(DOMAIN_FILTER&&DOMAIN_FILTER!==domain)continue;
  const files=domainFiles(domain);
  const state={laws:readJson(files.laws,[]),catalog:readJson(files.catalog,[])};
  const results=[];const startedAt=new Date().toISOString();
  try{
   if(!ONLY||ONLY==='laws')await collectLaws(domain,cfg,state,results,newPending);
   if(!ONLY||ONLY==='rules')await collectRules(domain,cfg,state,results,newPending);
   if(!ONLY||ONLY==='sources')await collectSources(domain,cfg,state,results,newPending);
  }catch(e){if(!e.fatal)throw e;fatal=e;results.push({source:cfg.label+' 국가법령정보센터',status:'error',error:e.message});}
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
process.on('unhandledRejection',e=>{console.error(e);process.exit(1);});
