export type Kind='qa'|'case'|'law'|'guide';
export type LawSection={id:string;title:string;start:number;end:number;kind:'article'|'supplement'|'heading';no?:string};
export type RecordItem={id:string;domain:string;kind:Kind;title:string;agency:string;date:string;url:string;attachment?:string;category:string;summary:string;content:string;tags:string[];
 /** 사례: 사건번호·결정유형 */caseNumber?:string;decision?:string;
 question?:string;answer?:string;reference?:string;
 lawSections?:LawSection[];hasBody?:boolean;lawVersion?:string;effectiveDate?:string;promulgationDate?:string;collectedAt?:string;sourceSnapshotUrl?:string;sourceHash?:string;lawOrder?:number;application?:string;lawGroup?:string;lawLevel?:string;lawTarget?:'law'|'admrul';articleCount?:number;annexCount?:number;lastCheckedAt?:string;lastError?:string;revisionType?:string;source?:string;guide?:Guide;warning?:string;edition?:string;page?:number};
export type RunResult={source:string;status:'success'|'error'|'skipped';checked?:number;added?:number;updated?:number;note?:string;error?:string};
export type Run={id:string;domain?:string;startedAt:string;completedAt:string;status:'success'|'partial'|'blocked';results:RunResult[]};
export type Annex={title:string;no?:string;kind?:string;pdf?:string;file?:string};
export type LawBody={id:string;content:string;lawSections:LawSection[];annexes?:Annex[];revisionReason?:string;revisionText?:string};
/** 실무 해설: 수집된 원문을 근거로 작성한 해설. 근거 조문·자료 ID를 함께 저장합니다. */
export type Guide={id:string;domain:string;title:string;category:string;summary:string;sections:{heading:string;body:string}[];basis:{label:string;recordId?:string;url?:string}[];author:string;writtenAt:string;reviewedAgainst?:string};
/** 개정 요약: 변경 감지 후 작성한 해설. */
export type UpdateNote={id:string;domain:string;recordId:string;title:string;lawLevel?:string;effectiveDate?:string;promulgationDate?:string;headline:string;points:string[];practice:string[];changedArticles:string[];author:string;writtenAt:string;sourceUrl?:string};
