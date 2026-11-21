// beamform_calc：梁模板（載重、側模、螺桿、底模、鋼管挫曲、圖、計算書、窄螢幕）見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
const G=p.goto.bind(p);p.goto=async u=>{const r=await G(u);await p.waitForTimeout(150);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return r;};
await p.goto(U+'#/calc/beam');await p.waitForSelector('[data-p="info.Hb"]');
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
const rowsTxt=async()=>(await p.$$eval('#bfRes .cfres tr',r=>r.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' / ');
console.log('分頁存在:',await p.$$eval('.chips a',a=>a.map(x=>x.textContent).includes('梁模板')));
console.log('空白:',await t('#bfRes .big'));
// Bb 45、Hb 70、H 300 → N1 0.161、N2 0.0805、N3 0.015、N4 0.0015、N 0.258
await f('info.Bb','45');await f('info.Hb','70');await f('info.H','300');
await p.selectOption('[data-p="n1"]','3');await f('L1.0','25');await f('L1.1','20');await f('L1.2','15');await f('L2','60');
await p.selectOption('[data-p="nt"]','2');await f('H4.0','20');await f('H4.1','30');
await p.selectOption('[data-p="nb"]','3');await p.selectOption('[data-p="np"]','2');await f('L4','90');
console.log('載重:',await t('#bfLoad'),'B4',await p.inputValue('#bfB4'),'L3',await p.inputValue('#bfL3'),'邊距',await p.inputValue('#bfEdge'));
console.log('結果:',await rowsTxt());
await p.$eval('#bfRes details',d=>d.open=true);console.log('明細:',(await t('#bfRes details')).slice(0,2600));
console.log('示意圖:',await p.$$eval('#bfLay svg',s=>s.map(x=>({line:x.querySelectorAll('line').length,rect:x.querySelectorAll('rect').length,circle:x.querySelectorAll('circle').length}))));
await f('H4.1','60');console.log('螺桿超過梁頂:',await t('#bfRes .big'),'| 圖',await t('#bfLay'));await f('H4.1','30');
await p.selectOption('[data-p="lmode"]','man');await f('Lu','180');console.log('手動 L=180 鋼管:',await t('#bfRes .cfres tr:last-child'));
await p.goto(U+'#/');await p.goto(U+'#/calc/beam');await p.waitForSelector('[data-p="info.Hb"]');console.log('重開保留:',await p.inputValue('[data-p="lmode"]'),await p.inputValue('[data-p="H4.1"]'),await p.inputValue('[data-p="n1"]'));
await p.selectOption('[data-p="lmode"]','net');
await p.$$eval('details',d=>d.forEach(x=>x.open=true));await p.screenshot({path:S+'beamform_tab.png',fullPage:true});
await p.goto(U+'#/calc/beam/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);
console.log('計算書:',(await t('.paper')).slice(0,600),'… 分享鈕',!!await p.$('#pdfShare'));
await p.screenshot({path:S+'beamform_sheet.png',fullPage:true});
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});await p.goto(U+'#/calc/beam');await p.waitForSelector('[data-p="lmode"]');
 for(const m of ['net','man']){await p.selectOption('[data-p="lmode"]',m);await p.waitForTimeout(100);await p.$$eval('details',d=>d.forEach(x=>x.open=true));console.log(w,m,'橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}
 await p.goto(U+'#/calc/beam/sheet');await p.waitForTimeout(300);console.log(w,'計算書 橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}
await p.evaluate(()=>localStorage.setItem('calcBeamForm','{"n1":"9","L1":"x","sel":5}'));await p.goto(U+'#/calc/beam');await p.waitForSelector('#bfRes');console.log('壞資料:',await p.inputValue('[data-p="n1"]'),await t('#bfRes .big'));
console.log('錯誤',e);await b.close();})();
