import {searchLawSections} from './law-text';
import type {RecordItem,LawBody} from './types';
const normalize=(s:string)=>s.toLowerCase().replace(/[ㆍ·･]/g,'').replace(/[^가-힣a-z0-9]/g,'');
const stop=new Set(['알려줘','알려주세요','설명해줘','설명해주세요','궁금해','궁금합니다','해주세요','해줘','어떻게','어떤','무엇','뭐야','뭔가요','있나요','있어','있을까','인가요','되나요','되나','돼','가능한가요','가능해','가능할까','가능한지','해야해','해야하나요','하나요','할까요','합니다','대한','관련','대해','법적으로','기준','기준은','현재','최신','수','할','및','어떻게하나요','해야','있습니까','가능합니까','가능한가','되는지','할수있나요','할수있는지','얼마나','경우','경우에','때','언제까지','언제','누가','받아야','하는','되는','방법']);
export const SYNONYMS:Record<string,string[][]>={
 tax:[['부가세','부가가치세'],['법인세','법인세'],['종소세','종합소득세'],['양도세','양도소득세'],['상증세','상속세','증여세'],['종부세','종합부동산세'],['조특법','조세특례제한법'],['국기법','국세기본법'],['세금계산서','계산서'],['원천세','원천징수'],['가산세','가산세'],['경정청구','경정 청구'],['손금','손금산입'],['익금','익금산입'],['감가상각','상각'],['접대비','기업업무추진비'],['업무추진비','기업업무추진비'],['연말정산','근로소득'],['중소기업','중소기업 특별세액감면'],['간이과세','간이과세자'],['영세율','영세율'],['면세','면세사업']],
 subcon:[['하도급법','하도급거래 공정화에 관한 법률','하도급거래'],['원사업자','원사업자'],['수급사업자','수급사업자'],['대금','하도급대금'],['서면','계약서','서면발급'],['감액','부당감액'],['기술유용','기술자료'],['부당특약','특약'],['연동제','납품대금 연동','하도급대금 연동'],['직불','직접지급'],['지급보증','하도급대금 지급보증'],['재하도급','재하도급'],['상생법','상생협력'],['위탁취소','부당한 위탁취소'],['반품','부당반품'],['공정위','공정거래위원회'],['과징금','과징금'],['벌점','벌점'],['선급금','선급금'],['설계변경','설계변경'],['지연이자','지연이자']],
};
export function termsFor(question:string){const raw=question.toLowerCase().replace(/[^가-힣a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);return [...new Set(raw.map(t=>{if(stop.has(t))return '';return t.replace(/(에서는|으로는|에게는|까지는|에서|으로|에게|이랑|하고|에대한|와|과|은|는|을|를|이|가|의|에|도|만|인지|인가요|하나요|해야|할때)$/,'');}).filter(t=>t.length>=2&&!stop.has(t)))].slice(0,12);}
function variants(term:string,domain:string){const normalized=normalize(term);const set=new Set([normalized]);for(const group of SYNONYMS[domain]||[]){if(group.map(normalize).includes(normalized))for(const s of group)set.add(normalize(s));}return [...set];}
export type EvidenceHit={record:RecordItem;score:number;matched:string[];coverage:number;section?:{title:string;text:string}};
export function findEvidence(records:RecordItem[],question:string,domain:string,bodies:Record<string,LawBody>={}){
 const terms=termsFor(question);const empty={terms,laws:[] as EvidenceHit[],cases:[] as EvidenceHit[],qa:[] as EvidenceHit[],guides:[] as EvidenceHit[]};
 if(!terms.length)return {...empty,status:'empty' as const};
 const variantsList=terms.map(t=>variants(t,domain));const hits:EvidenceHit[]=[];
 for(const r of records){const title=normalize(r.title);const questionText=normalize(r.question||'');const body=normalize((r.answer||'')+' '+(r.content||'')+' '+(bodies[r.id]?.content||''));const labels=normalize(r.tags.join(' ')+' '+r.summary+' '+r.category);const matched:string[]=[];let score=0;variantsList.forEach((v,i)=>{const exact=normalize(terms[i]);if(title.includes(exact)){score+=12;matched.push(terms[i]);}else if(v.some(x=>title.includes(x))){score+=8;matched.push(terms[i]);}else if(v.some(x=>questionText.includes(x))){score+=5;matched.push(terms[i]);}else if(body.includes(exact)){score+=4;matched.push(terms[i]);}else if(v.some(x=>body.includes(x))){score+=2;matched.push(terms[i]);}else if(v.some(x=>labels.includes(x))){score+=1;matched.push(terms[i]);}});if(!matched.length)continue;const coverage=matched.length/terms.length;hits.push({record:r,score:score*coverage,matched,coverage});}
 const ranked=hits.sort((a,b)=>b.score-a.score||a.record.id.localeCompare(b.record.id));
 const laws=ranked.filter(h=>h.record.kind==='law'&&h.coverage>=.66).map(h=>{const best=searchLawSections(h.record,bodies[h.record.id],terms)[0];return {...h,score:h.score+(best?.score||0),section:best?{title:best.section.title,text:best.text}:undefined};}).sort((a,b)=>b.score-a.score).slice(0,6);
 const cases=ranked.filter(h=>h.record.kind==='case'&&h.coverage>=.66&&h.score>=4).slice(0,5);
 const qa=ranked.filter(h=>h.record.kind==='qa'&&Boolean(h.record.answer||h.record.content)&&h.coverage>=.66&&h.score>=4).slice(0,5);
 const guides=ranked.filter(h=>h.record.kind==='guide'&&h.coverage>=.5).slice(0,3);
 return {terms,laws,cases,qa,guides,status:(laws.length||cases.length||qa.length||guides.length)?'found' as const:'insufficient' as const};
}
