// slabform_calc：板模板支撐（載重、襯板、兩層大格柵、鋼管挫曲、圖、計算書、窄螢幕）見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
const G=p.goto.bind(p);p.goto=async u=>{const r=await G(u);await p.waitForTimeout(150);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return r;};
await p.goto(U+'#/calc/slab');await p.waitForSelector('[data-p="info.H"]');
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
const rowsTxt=async()=>(await p.$$eval('#sfRes .cfres tr',r=>r.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' / ');
console.log('分頁存在:',await p.$$eval('.chips a',a=>a.map(x=>x.textContent).includes('板模板')));
// H 350、t 15 → N1 0.0345、N2 0.01725、N3 0.015、N4 0.0015、N 0.06825
await f('info.H','350');await f('info.t','15');await f('gap.L1','30');await f('gap.L2','90');await f('gap.L3','90');
console.log('載重:',await t('#sfLoad'));
console.log('結果:',await rowsTxt());
await p.click('#sfRes details');console.log('明細:',(await t('#sfRes details')).slice(0,1400));
console.log('示意圖:',await p.$$eval('#sfLay svg',s=>s.map(x=>({line:x.querySelectorAll('line').length,rect:x.querySelectorAll('rect').length}))));
await p.selectOption('[data-p="lmode"]','stack');console.log('扣模板高 鋼管:',await t('#sfRes .cfres tr:last-child'));
await p.selectOption('[data-p="lmode"]','man');await f('Lu','180');console.log('手動 L=180 鋼管:',await t('#sfRes .cfres tr:last-child'));
await f('work','250');console.log('作業載重 250 → N:',await t('#sfLoad'));await p.click('#sfLoadDef');console.log('恢復預設 N:',await t('#sfLoad'));
await p.goto(U+'#/');await p.goto(U+'#/calc/slab');await p.waitForSelector('[data-p="info.H"]');console.log('重開保留:',await p.inputValue('[data-p="lmode"]'),await p.inputValue('[data-p="gap.L3"]'));
await p.selectOption('[data-p="lmode"]','net');
await p.$$eval('details',d=>d.forEach(x=>x.open=true));await p.screenshot({path:S+'slabform_tab.png',fullPage:true});
await p.goto(U+'#/calc/slab/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);
console.log('計算書:',(await t('.paper')).slice(0,500),'… 分享鈕',!!await p.$('#pdfShare'));
await p.screenshot({path:S+'slabform_sheet.png',fullPage:true});
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});await p.goto(U+'#/calc/slab');await p.waitForSelector('[data-p="lmode"]');
 for(const m of ['net','man']){await p.selectOption('[data-p="lmode"]',m);await p.waitForTimeout(100);await p.$$eval('details',d=>d.forEach(x=>x.open=true));console.log(w,m,'橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}
 await p.goto(U+'#/calc/slab/sheet');await p.waitForTimeout(300);console.log(w,'計算書 橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}
// 空白輸入不應出錯
await p.evaluate(()=>localStorage.removeItem('calcSlabForm'));await p.goto(U+'#/calc/slab');await p.waitForSelector('#sfRes');console.log('空白:',await t('#sfRes .big'));
console.log('錯誤',e);await b.close();})();
