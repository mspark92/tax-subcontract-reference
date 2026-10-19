import type {RecordItem,LawBody,Guide,UpdateNote,Run} from './lib/types';
const base=()=>new URL('./data/',document.baseURI).href;
async function json<T>(path:string,fallback:T):Promise<T>{try{const r=await fetch(base()+path,{cache:'no-cache'});if(!r.ok)return fallback;return await r.json() as T;}catch{return fallback;}}
export type DomainData={records:RecordItem[];updates:UpdateNote[];guides:Guide[]};
export async function loadDomain(domain:string):Promise<DomainData>{
 const [laws,catalog,guides,updates]=await Promise.all([json<RecordItem[]>(domain+'/laws.json',[]),json<RecordItem[]>(domain+'/catalog.json',[]),json<Guide[]>(domain+'/guides.json',[]),json<UpdateNote[]>(domain+'/updates.json',[])]);
 const guideRecords:RecordItem[]=guides.map(g=>({id:g.id,domain,kind:'guide',title:g.title,agency:'실무 해설',date:g.writtenAt.slice(0,10),url:'',category:g.category,summary:g.summary,content:g.sections.map(s=>s.heading+'\n'+s.body).join('\n\n'),tags:[g.category,'실무 해설'],guide:g,warning:'공식 원문을 근거로 정리한 해설입니다. 법적 판단은 근거 조문과 최신 법령을 확인하세요.'}));
 return {records:[...laws.filter(l=>l.lawTarget!=='admrul'||l.hasBody),...catalog,...guideRecords],updates:updates.sort((a,b)=>b.writtenAt.localeCompare(a.writtenAt)),guides};
}
export const loadRuns=()=>json<Run[]>('runs.json',[]);
const bodyCache=new Map<string,Promise<LawBody|null>>();
export function loadBody(r:RecordItem){if(!r.hasBody)return Promise.resolve(null);if(!bodyCache.has(r.id))bodyCache.set(r.id,json<LawBody|null>(`${r.domain}/bodies/${r.id}.json`,null));return bodyCache.get(r.id)!;}
export async function loadBodies(records:RecordItem[]){const laws=records.filter(r=>r.kind==='law'&&r.hasBody);const out:Record<string,LawBody>={};await Promise.all(laws.map(async r=>{const b=await loadBody(r);if(b)out[r.id]=b;}));return out;}
const KEY='reference-prefs-v1';
export type Prefs={favorites:string[];notes:Record<string,string>};
export function readPrefs():Prefs{try{const v=JSON.parse(localStorage.getItem(KEY)||'');if(Array.isArray(v.favorites))return {favorites:v.favorites,notes:v.notes||{}};}catch{}return {favorites:[],notes:{}};}
export function writePrefs(p:Prefs){try{localStorage.setItem(KEY,JSON.stringify(p));return true;}catch{return false;}}
const textCache=new Map<string,Promise<RecordItem>>();
/** 목록에서 잘린 본문을 전체로 채웁니다. */
export function loadFull(r:RecordItem):Promise<RecordItem>{if(!r.truncated)return Promise.resolve(r);if(!textCache.has(r.id))textCache.set(r.id,json<Partial<RecordItem>|null>(`${r.domain}/texts/${r.id}.json`,null).then(t=>t?{...r,...t,truncated:false}:r));return textCache.get(r.id)!;}
