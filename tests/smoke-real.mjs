// 실제 수집 자료로 빌드한 dist를 띄워 주요 검색이 근거를 찾는지 확인합니다.
import {createRequire} from 'node:module';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'/opt/node-tools/node_modules/playwright');
const shots=process.argv[2]||'.';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((q,s)=>{let p=decodeURIComponent(new URL(q.url,'http://x').pathname);if(p.endsWith('/'))p+='index.html';const f=path.join('dist',p);if(!fs.existsSync(f)){s.writeHead(404);return s.end();}s.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(s);}).listen(0);
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await browser.newPage({viewport:{width:1360,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
let failed=0;const check=(n,c)=>{console.log((c?'PASS ':'FAIL ')+n);if(!c)failed++;};
for(const [domain,q,shot] of [['tax','세금계산서 지연발급 가산세','real-tax-insight'],['tax','경정청구 기한',''],['subcon','하도급대금 지급기한','real-subcon-insight'],['subcon','기술자료 요구 서면','']]){
 await page.goto(url+'#'+domain);await page.waitForSelector('#evidence-question');await page.waitForFunction(()=>!document.querySelector('button[type=submit]').disabled||true);
 await page.fill('#evidence-question',q);await page.click('button[type=submit]');
 await page.waitForFunction(()=>document.querySelector('.result-heading .type')?.textContent==='원문 검색 결과',null,{timeout:60000});
 const counts=await page.$$eval('.evidence-page section[aria-label]',s=>s.map(x=>x.getAttribute('aria-label')+':'+x.querySelectorAll('.evidence-result').length));
 console.log(domain,q,counts.join(' '));
 check(`${domain} "${q}" 법령 근거`,counts[0]&&!counts[0].endsWith(':0'));
 if(shot)await page.screenshot({path:path.join(shots,shot+'.png')});
}
await page.goto(url+'#subcon');await page.click('nav >> text=공정위 의결·판례');await page.waitForSelector('.cards');
check('하도급 의결 목록',(await page.$$('.card')).length===12);
await page.click('.card-title');await page.waitForSelector('dialog[open] .detail pre');await page.waitForTimeout(800);
const len=await page.$eval('dialog[open] .detail pre',e=>e.textContent.length);check('의결서 전체 본문 로드 '+len,len>1000);
await page.screenshot({path:path.join(shots,'real-subcon-case.png')});
await page.keyboard.press('Escape');await page.goto(url+'#tax');await page.click('nav >> text=실무 해설');await page.waitForSelector('.cards');check('세법 실무 해설 8편',(await page.$$('.card')).length===8);
await page.click('.card-title');await page.waitForSelector('.guide-body');await page.screenshot({path:path.join(shots,'real-tax-guide.png')});
await browser.close();server.close();
if(errors.length)console.log('오류',errors);
process.exit(failed||errors.length?1:0);
