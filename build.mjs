// 정적 사이트 빌드: dist/에 index.html, app.js, app.css, data/를 만듭니다.
import {build} from 'esbuild';
import fs from 'node:fs';
const out='dist';
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
await build({entryPoints:{app:'src/main.tsx'},bundle:true,minify:true,format:'esm',target:'es2020',outdir:out,jsx:'automatic',loader:{'.css':'css'},define:{'process.env.NODE_ENV':'"production"'},legalComments:'none'});
const v=Date.now().toString(36);
fs.writeFileSync(out+'/index.html',`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>세법·하도급법 레퍼런스</title>
<meta name="description" content="국가법령정보센터 공식 자료로 찾는 세법·하도급법 실무 근거. 법령, 심판·판례, 공정위 의결, 질의회신, 실무 해설.">
<link rel="icon" href="favicon.svg"><link rel="stylesheet" href="app.css?v=${v}">
</head><body><div id="root"></div><noscript>이 사이트는 자바스크립트가 필요합니다.</noscript><script type="module" src="app.js?v=${v}"></script></body></html>
`);
fs.writeFileSync(out+'/favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#117565"/><path d="M9 11h14M16 8v16M11 24h10M10 11l-3 7h6zM22 11l-3 7h6z" stroke="#fff" stroke-width="1.8" fill="none" stroke-linejoin="round"/></svg>');
fs.cpSync('data',out+'/data',{recursive:true,filter:s=>!s.endsWith('pending.json')&&!s.includes('_debug')});
// 목록 파일을 가볍게: 긴 본문은 앞부분만 남기고 전체는 texts/<id>.json으로 분리해 열 때 불러옵니다.
const LIMIT=1000;
for(const d of fs.readdirSync('data',{withFileTypes:true}).filter(x=>x.isDirectory()&&!x.name.startsWith('_')).map(x=>x.name)){
 const file=`data/${d}/catalog.json`;if(!fs.existsSync(file))continue;
 const items=JSON.parse(fs.readFileSync(file,'utf8'));fs.mkdirSync(`${out}/data/${d}/texts`,{recursive:true});
 let split=0;
 const slim=items.map(r=>{const long=(r.content||'').length>LIMIT||(r.answer||'').length>LIMIT;if(!long)return r;split++;fs.writeFileSync(`${out}/data/${d}/texts/${r.id}.json`,JSON.stringify({content:r.content,answer:r.answer,question:r.question}));return {...r,content:(r.content||'').slice(0,LIMIT),answer:r.answer?.slice(0,LIMIT),truncated:true};});
 fs.writeFileSync(`${out}/data/${d}/catalog.json`,JSON.stringify(slim));
 console.log(d,'catalog',items.length,'split',split,(fs.statSync(`${out}/data/${d}/catalog.json`).size/1e6).toFixed(1)+'MB');
}
fs.writeFileSync(out+'/.nojekyll','');
console.log('built',fs.readdirSync(out));
