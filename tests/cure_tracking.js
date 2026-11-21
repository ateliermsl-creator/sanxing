require('./uidlg');
// cure_tracking：見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S+'pdfs',{recursive:true});require('fs').mkdirSync(S+'theme',{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:900}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(800);
await p.evaluate(async()=>{
 const iso=n=>{const d=new Date();d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 await DB.put('sites',{id:'s1',name:'測試工地'});localStorage.setItem('siteId','s1');
 const tr=(id,sp)=>({id,plate:'A',ticket:'',leave:'',arrive:'',volume:'6',slump:'',chloride:'',temp:'',sampled:true,specimen:sp,disp:'use',note:'',names:{},sigs:{},created:1});
 await DB.put('pours',{id:'j1',siteId:'s1',date:iso(27),floor:'3F',part:'頂版',supplier:'',fc:'280',slumpMin:'',slumpMax:'',clMax:'',limitMin:'',created:1,updated:1,trucks:[tr('t1','A1~A3')]});   // 28天:明天到
 await DB.put('pours',{id:'j2',siteId:'s1',date:iso(30),floor:'2F',part:'樑板',supplier:'',fc:'280',slumpMin:'',slumpMax:'',clMax:'',limitMin:'',created:2,updated:1,trucks:[tr('t2','B1~B3')],forms:{'樑底模':{strip:''},'柱側模':{strip:''}}}); // 28天逾期2天;樑底模14天已滿
 await DB.put('matcats',{id:'__cure',ages:[7,28],forms:[{n:'樑底模',d:'14'},{n:'柱側模',d:''}],updated:5});
});
await p.reload();await p.goto('http://localhost:8793/index.html#/cure');await p.waitForSelector('.rec');
console.log((await p.innerText('main, #view')).replace(/\n+/g,' | ').slice(0,700));await p.screenshot({path:S+'s55a.png',fullPage:true});
await p.click('a[href^="#/cure/test/t2/28"]');await p.waitForSelector('#ctVals');
await p.fill('[data-v="0"]','312');await p.fill('[data-v="1"]','305.5');await p.fill('[data-v="2"]','298');await p.fill('#ctNote','XX實驗室 R-001');
console.log('平均:',(await p.innerText('#ctAvg')).replace(/\s+/g,' '));
await p.setInputFiles('#attInput',{name:'報告.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4')});await p.waitForTimeout(500);
await p.click('#ctSave');await p.waitForSelector('.rec, .panel');await p.waitForTimeout(500);
await p.goto('http://localhost:8793/index.html#/cure/ledger');await p.waitForSelector('.paper');
console.log('台帳:',(await p.innerText('.paper')).replace(/\n+/g,' | ').slice(0,500));await p.screenshot({path:S+'s55b.png',fullPage:true});
await p.goto('http://localhost:8793/index.html#/cure');await p.waitForTimeout(600);await p.click('[data-strip]');await p.waitForTimeout(500);
console.log('標記後清單:',(await p.innerText('#view')).replace(/\n+/g,' | ').slice(0,300));
await p.goto('http://localhost:8793/index.html#/pour/j2');await p.waitForSelector('#cuForms');console.log('澆置頁面板:',(await p.innerText('#cuForms')).replace(/\n+/g,' | '));
await p.goto('http://localhost:8793/index.html#/');await p.waitForTimeout(800);console.log('首頁卡片:',(await p.innerText('a[href="#/cure"]')).replace(/\n+/g,' '));
console.log('錯誤',e);await b.close();})();
