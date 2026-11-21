require('./uidlg');
// struct_nav：結構計算獨立區塊（首頁分區、四類、舊網址轉向、側欄、一鍵帶入）見 tests/README.md
const {chromium}=require('playwright');const O=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(O,{recursive:true});
(async()=>{const b=await chromium.launch();const U='http://localhost:8793/index.html';
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto(U);await p.waitForTimeout(400);await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'測試工地'});localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString());localStorage.setItem('calcScafForm','{"keep":"舊資料"}')});
await p.goto(U+'#/');await p.reload();await p.waitForTimeout(500);
console.log('首頁分區:',await p.$$eval('#view .hsec',x=>x.map(y=>y.textContent.trim())));
console.log('結構卡片:',await p.$$eval('#view a.card[href^="#/struct"]',x=>x.map(y=>y.getAttribute('href')+' '+y.innerText.replace(/\s+/g,' '))));
console.log('計算機卡片:',(await p.innerText('#view a.card[href="#/calc"]')).replace(/\s+/g,' '));
await p.goto(U+'#/calc');await p.waitForTimeout(300);console.log('計算機分頁:',await p.$$eval('#view .chips a',x=>x.map(y=>y.textContent).join(',')));
console.log('舊資料保留:',await p.evaluate(()=>localStorage.getItem('calcScafForm')));
await p.evaluate(()=>localStorage.removeItem('calcScafForm'));
// 舊網址轉向
let bad=[];for(const k of ['col','wall','slab','beam','scaf','brk','row','anc','sec']) for(const s of ['','/sheet']){await p.goto(U+'#/calc/'+k+s);await p.waitForTimeout(350);const h=await p.evaluate(()=>location.hash);const ok=h==='#/struct/'+k+s&&await p.$('#view '+(s?'.paper':'#calcBox > *'));if(!ok)bad.push(k+s+'→'+h);}
console.log('舊網址轉向失敗:',bad);
await p.goto(U+'#/calc/vol');await p.waitForTimeout(300);console.log('混凝土方數留在計算機:',await p.evaluate(()=>location.hash),!!(await p.$('#calcBox > *')));
// 總覽與分類切換
await p.goto(U+'#/struct');await p.waitForTimeout(300);console.log('總覽:',await p.$$eval('.stcat',x=>x.map(y=>y.innerText.replace(/\s+/g,' '))));
await p.goto(U+'#/struct/wall');await p.waitForTimeout(300);console.log('牆模 分類列:',await p.$$eval('.stcrumb a',x=>x.map(y=>(y.classList.contains('on')?'*':'')+y.textContent).join(',')),'分頁:',await p.$$eval('#view .chips a',x=>x.map(y=>(y.classList.contains('on')?'*':'')+y.textContent).join(',')));
await p.goto(U+'#/struct/anc');await p.waitForTimeout(300);console.log('錨栓 有無分頁 chips:',!!(await p.$('#view > .chips')));
// 返回鍵
await p.goto(U+'#/struct/col/sheet');await p.waitForTimeout(300);console.log('計算書上一層:',await p.evaluate(()=>parentHash()));await p.goto(U+'#/struct/col');await p.waitForTimeout(200);console.log('分頁上一層:',await p.evaluate(()=>parentHash()));
// 一鍵帶入：施工架→三角架→錨栓
await p.goto(U+'#/struct/scaf');await p.waitForTimeout(400);const sc=await p.$('#scToBk');console.log('施工架帶入按鈕:',!!sc);
if(sc){await sc.click();await p.waitForTimeout(400);console.log('帶入後網址:',await p.evaluate(()=>location.hash),'PD1',await p.evaluate(()=>JSON.parse(localStorage.getItem('calcBrkForm')||'{}').PD1));}
const bk=await p.$('[data-toanc]');console.log('三角架帶入按鈕:',!!bk);if(bk){await bk.click();await p.waitForTimeout(400);console.log('帶入後網址:',await p.evaluate(()=>location.hash));}
// 窄螢幕
const q=await (await b.newContext({viewport:{width:320,height:700}})).newPage();await q.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});q.on('pageerror',x=>e.push(x.message));let ov=[];
for(const h of ['#/','#/struct','#/struct/col','#/struct/scaf','#/struct/anc','#/struct/sec','#/calc']){await q.goto(U+h);await q.waitForTimeout(400);if(await q.evaluate(()=>document.documentElement.scrollWidth>innerWidth))ov.push(h);}
console.log('320px 橫向捲動:',ov);
// 電腦版側欄
const d=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();await d.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});d.on('pageerror',x=>e.push(x.message));
for(const h of ['#/','#/struct/beam','#/struct/sec','#/calc']){await d.goto(U+h);await d.waitForTimeout(400);
 const sn=await d.evaluate(()=>getComputedStyle(document.getElementById('sideNav')).display!=='none');
 const on=await d.$$eval('#sideNav a.on, #sideNav a.open',x=>x.map(y=>(y.classList.contains('on')?'on:':'open:')+y.textContent.trim()));
 const vis=await d.$$eval('#sideNav a.snSub',x=>x.filter(y=>!y.hidden).map(y=>y.textContent));
 console.log('電腦版',h,'側欄',sn,on,'展開',vis);}
await d.goto(U+'#/');await d.waitForTimeout(400);await d.screenshot({path:O+'struct_home_desktop.png',fullPage:true});
await d.goto(U+'#/struct/beam');await d.waitForTimeout(400);await d.screenshot({path:O+'struct_beam_desktop.png'});
await p.goto(U+'#/');await p.waitForTimeout(400);await p.screenshot({path:O+'struct_home_phone.png',fullPage:true});
await p.goto(U+'#/struct');await p.waitForTimeout(400);await p.screenshot({path:O+'struct_index_phone.png',fullPage:true});
await p.goto(U+'#/struct/slab');await p.waitForTimeout(400);await p.screenshot({path:O+'struct_slab_phone.png'});
console.log('錯誤',e);await b.close();})();
