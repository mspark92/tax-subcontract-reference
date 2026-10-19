// 브라우저 확인: 테스트용 가짜 자료로 dist를 복제해 화면 동작을 점검합니다. 가짜 자료는 배포되지 않습니다.
import {createRequire} from 'node:module';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import os from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node-tools/node_modules/playwright');
const out=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'site-'));
const shots=process.argv[3]||out;
fs.cpSync('dist',out,{recursive:true});
const w=(f,v)=>{fs.mkdirSync(path.dirname(path.join(out,'data',f)),{recursive:true});fs.writeFileSync(path.join(out,'data',f),JSON.stringify(v));};
const laws=JSON.parse(fs.readFileSync('data/tax/laws.json','utf8'));
const vat=laws.find(l=>l.title==='부가가치세법');Object.assign(vat,{hasBody:true,effectiveDate:'2099-01-01',promulgationDate:'2099-01-01',edition:'시행 2099-01-01',collectedAt:'2099-01-01T00:00:00Z',lawVersion:'1'});
const content='제1조(목적) [테스트] 이 문장은 화면 점검용 가짜 조문입니다.\n\n제60조(가산세) [테스트] 세금계산서 지연발급 가짜 조문입니다.\n\n';
w('tax/laws.json',laws);
w(`tax/bodies/${vat.id}.json`,{id:vat.id,content,lawSections:[{id:'article-0',title:'제1조(목적)',start:0,end:40,kind:'article'},{id:'article-1',title:'제60조(가산세)',start:40,end:content.length,kind:'article'}],annexes:[{title:'[테스트] 별표 1',pdf:'https://www.law.go.kr/'}]});
w('tax/catalog.json',[{id:'tax-nts-1',domain:'tax',kind:'qa',title:'[테스트] 세금계산서 지연발급 가산세 질의',agency:'국세청',date:'2099-01-02',url:'https://www.law.go.kr/',category:'부가가치세',summary:'[테스트] 가짜 요약',content:'',question:'[테스트] 세금계산서를 늦게 발급하면?',answer:'[테스트] 가짜 회신 가산세',tags:['국세청 법령해석'],reference:'테스트-1, 2099-01-02',warning:'회신 당시 법령 기준입니다.'},{id:'tax-tt-1',domain:'tax',kind:'case',title:'[테스트] 가산세 부과처분 심판청구',agency:'조세심판원',date:'2099-01-03',url:'https://www.law.go.kr/',category:'조세심판원 심판결정',summary:'[테스트] 가짜 결정 요지',content:'【결정요지】\n[테스트] 세금계산서 가산세 가짜 결정',tags:['조세심판원'],caseNumber:'조심 2099부0001',decision:'기각'}]);
w('tax/guides.json',[{id:'tax-guide-1',domain:'tax',title:'[테스트] 세금계산서 가산세 실무',category:'부가가치세',summary:'[테스트] 가짜 해설',sections:[{heading:'핵심',body:'[테스트] 세금계산서 가산세 설명'}],basis:[{label:'부가가치세법 제60조',recordId:vat.id}],author:'test',writtenAt:'2099-01-04T00:00:00Z'}]);
w('tax/updates.json',[{id:'u1',domain:'tax',recordId:vat.id,title:'부가가치세법',lawLevel:'법률',effectiveDate:'2099-01-01',promulgationDate:'2099-01-01',headline:'[테스트] 가짜 개정 요약',points:['[테스트] 포인트'],practice:['[테스트] 실무'],changedArticles:['제60조(가산세)'],author:'test',writtenAt:'2099-01-05T00:00:00Z'}]);
w('runs.json',[{id:'r1',domain:'tax',startedAt:'2099-01-05T00:00:00Z',completedAt:'2099-01-05T00:01:00Z',status:'success',results:[{source:'[테스트] 세법 법령',status:'success',checked:56,added:0,updated:1,note:'테스트'}]}]);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((q,s)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';const f=path.join(out,p);if(!fs.existsSync(f)){s.writeHead(404);return s.end();}s.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(s);}).listen(0);
const port=server.address().port;const url=`http://127.0.0.1:${port}/`;
const browser=await chromium.launch({executablePath:fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')?'/opt/pw-browsers/chromium-1194/chrome-linux/chrome':undefined});
const errors=[];let passed=0;
const check=(name,cond)=>{if(!cond)throw Error('FAIL '+name);passed++;console.log('PASS '+name);};
for(const [label,vp] of [['desktop',{width:1360,height:900}],['mobile',{width:390,height:844}]]){
 const page=await browser.newPage({viewport:vp});page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(url+'#tax');await page.waitForSelector('.evidence-page');
 check(label+': 세무 인사이트 기본 화면',await page.isVisible('text=세무의 질문에, 근거를 더하다.'));
 await page.screenshot({path:path.join(shots,label+'-insight.png'),fullPage:false});
 await page.fill('#evidence-question','세금계산서 지연발급 가산세');await page.click('button[type=submit]');
 await page.waitForSelector('.evidence-result');await page.waitForTimeout(300);
 const order=await page.$$eval('.evidence-page section[aria-label]',s=>s.map(x=>x.getAttribute('aria-label')));
 check(label+': 결과 순서 법령→심판·판례→질의회신→실무 해설',JSON.stringify(order)===JSON.stringify(['법령','심판·판례','질의회신','실무 해설']));
 check(label+': 법령 본문 조문 매칭',await page.isVisible('.evidence-result >> text=제60조(가산세)'));
 const sw=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);check(label+': 가로 스크롤 없음',sw);
 if(label==='mobile'){await page.click('.mobile-toggle');}
 await page.click('nav >> text=관계 법령');await page.waitForSelector('.cards');
 check(label+': 본문 미수록 표시',await page.isVisible('text=본문 미수록'));
 await page.fill('.searchbox input','지연발급');await page.waitForTimeout(500);
 check(label+': 법령 본문 검색',(await page.textContent('.result-heading h2')).includes('1'));
 await page.click('.card-title');await page.waitForSelector('.law-reader');
 check(label+': 법령 열람기 + 별표',await page.isVisible('text=별표·서식 1건'));
 await page.screenshot({path:path.join(shots,label+'-law-detail.png')});
 await page.click('button[aria-label="상세 닫기"]');
 if(label==='mobile'){await page.click('.mobile-toggle');}
 await page.click('.domain-switch >> text=하도급법');await page.waitForTimeout(400);
 check(label+': 하도급 전환',await page.isVisible('h1 >> text=관계 법령')&&(await page.textContent('.brand')).includes('하도급레퍼런스'));
 check(label+': 해시 갱신',page.url().endsWith('#subcon'));
 await page.screenshot({path:path.join(shots,label+'-subcon-laws.png')});
 if(label==='mobile'){await page.click('.mobile-toggle');}
 await page.click('.domain-switch >> text=세법');await page.waitForTimeout(300);
 if(label==='mobile'){await page.click('.mobile-toggle');}
 await page.click('nav >> text=개정 요약');check(label+': 개정 요약',await page.isVisible('text=[테스트] 가짜 개정 요약'));
 await page.screenshot({path:path.join(shots,label+'-updates.png')});
 await page.close();
}
await browser.close();server.close();
if(errors.length){console.log('브라우저 오류:',errors);process.exit(1);}
console.log(`${passed} checks passed`);
