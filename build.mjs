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
fs.cpSync('data',out+'/data',{recursive:true,filter:s=>!s.endsWith('pending.json')});
fs.writeFileSync(out+'/.nojekyll','');
console.log('built',fs.readdirSync(out));
