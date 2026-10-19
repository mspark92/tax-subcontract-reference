import type {RecordItem} from './types';
export type Filters={tab:string;query:string;category:string;source:string;year:string;sort:string;lawLevel:string;favorites:string[];bodies?:Record<string,string>};
export function inTab(r:RecordItem,tab:string,favorites:string[]){return tab==='all'||tab==='laws'&&r.kind==='law'||tab==='saved'&&favorites.includes(r.id)||tab==='qa'&&r.kind==='qa'||tab==='case'&&r.kind==='case'||tab==='guide'&&r.kind==='guide';}
export function filterRecords(records:RecordItem[],f:Filters){
 const terms=f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
 return records.filter(r=>inTab(r,f.tab,f.favorites)&&(!f.lawLevel||r.lawLevel===f.lawLevel)&&(!f.category||r.category===f.category)&&(!f.source||r.agency===f.source)&&(!f.year||(r.date||'').startsWith(f.year))&&terms.every(t=>[r.title,r.summary,r.question,r.answer,r.content,f.bodies?.[r.id],r.reference,r.category,r.caseNumber,...r.tags].join(' ').toLowerCase().includes(t)))
 .sort((a,b)=>f.tab==='laws'&&f.sort==='recent'?(a.lawOrder??999)-(b.lawOrder??999):f.sort==='title'?a.title.localeCompare(b.title,'ko'):(b.date||'').localeCompare(a.date||'')||a.id.localeCompare(b.id));
}
export function pageSlice<T>(items:T[],page:number){const maxPage=Math.max(1,Math.ceil(items.length/12));const currentPage=Math.min(Math.max(1,page),maxPage);return {maxPage,currentPage,shown:items.slice((currentPage-1)*12,currentPage*12)};}
export function citation(r:RecordItem){return [r.title,`${r.agency} · ${r.edition||r.date}`,r.reference?`번호 · 일자 ${r.reference}`:null,r.url].filter(Boolean).join('\n');}
