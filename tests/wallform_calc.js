// wallform_calc：牆模板（三層／四層／單面模、側壓力、斜撐挫曲、圖、計算書、窄螢幕）見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
const G=p.goto.bind(p);p.goto=async u=>{const r=await G(u);await p.waitForTimeout(150);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return r;};   // 首次開啟的工地設定對話框會擋住點擊
await p.goto(U+'#/calc/wall');await p.waitForSelector('[data-p="info.H"]');
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
const rowsTxt=async()=>(await p.$$eval('#wfRes .cfres tr',r=>r.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' / ');
console.log('分頁存在:',await p.$$eval('.chips a',a=>a.map(x=>x.textContent).includes('牆模板')));
// 四層模、內建材料、參考網站側壓力（Wo 2.3、H 300 → 0.414）
await f('info.H','300');await f('info.len','240');
await p.click('#wfTierAdd');await p.click('#wfTierAdd');
await f('tiers.0.top','100');await f('tiers.1.top','200');
for(const i of [0,1,2]) for(const [k,v] of [['H1','20'],['B2','40'],['H3','60'],['B4','80']]) await f(`tiers.${i}.${k}`,v);
console.log('四層模 側壓力圖:',await p.$$eval('#wfPsvg text',x=>x.map(y=>y.textContent).join(' | ')));
console.log('四層模 結果:',await rowsTxt());
console.log('四層模 示意圖:',await p.$$eval('#wfLay svg',s=>s.map(x=>({line:x.querySelectorAll('line').length,rect:x.querySelectorAll('rect').length,dot:x.querySelectorAll('circle').length}))));
// 三層模：第一層大格柵跨距 = H4
await p.selectOption('[data-p="type"]','t3');
for(const i of [0,1,2]) await f(`tiers.${i}.H4`,'60');
console.log('三層模 列:',await p.$$eval('.cftiers th',x=>x.map(y=>y.textContent).join(',')));
console.log('三層模 結果:',await rowsTxt());
await p.click('#wfRes details >> nth=0');console.log('三層模 第一階明細:',(await t('#wfRes details >> nth=0')).slice(0,700));
// 單面模：θ 45°
await p.selectOption('[data-p="type"]','s1');
for(const i of [0,1,2]) await f(`tiers.${i}.ang`,'45');
console.log('單面模 結果:',await rowsTxt());
for(const n of [0,2]){await p.click(`#wfRes details >> nth=${n}`);console.log(`單面模 第${n+1}階斜撐:`,(await t(`#wfRes details >> nth=${n}`)).replace(/.*鋼管斜撐：/,'鋼管斜撐：'));}
console.log('單面模 示意圖:',await p.$$eval('#wfLay svg',s=>s.map(x=>({line:x.querySelectorAll('line').length,dot:x.querySelectorAll('circle').length}))));
await p.check('#wfManual');for(const i of [0,1,2]) await f(`tiers.${i}.Lu`,'150');await f('tiers.0.ang','0');
console.log('手動 L=150、第一階 0°:',await t('#wfRes .cfres tr:last-child'));
// γ × 深度
await p.selectOption('[data-p="pmode"]','lin');await f('gamma','2.4');
console.log('γ×深度 P:',await p.$$eval('.cfres tr:first-child th small',x=>x.map(y=>y.textContent).join(' ')));
await p.goto(U+'#/');await p.goto(U+'#/calc/wall');await p.waitForSelector('[data-p="info.H"]');console.log('重開保留:',await p.inputValue('[data-p="type"]'),await p.inputValue('[data-p="tiers.1.top"]'));
await p.selectOption('[data-p="pmode"]','ref');await f('gamma','2.3');await p.uncheck('#wfManual');await f('tiers.0.ang','45');
await p.$$eval('details',d=>d.forEach(x=>x.open=true));await p.screenshot({path:S+'wallform_tab.png',fullPage:true});
await p.goto(U+'#/calc/wall/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);
console.log('計算書:',(await t('.paper')).slice(0,400),'… 分享鈕',!!await p.$('#pdfShare'));
await p.screenshot({path:S+'wallform_sheet.png',fullPage:true});
// 柱模板的材料庫是否仍正常（共用）
await p.goto(U+'#/calc/col');await p.waitForSelector('[data-p="info.H"]');console.log('柱模板仍可開:',!!await p.$('#cfRes'));
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});for(const ty of ['t3','t4','s1']){await p.goto(U+'#/calc/wall');await p.waitForSelector('[data-p="type"]');await p.selectOption('[data-p="type"]',ty);await p.waitForTimeout(150);await p.$$eval('details',d=>d.forEach(x=>x.open=true));
 const o=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);console.log(w,ty,'橫向捲動',o?'有':'無');}
 await p.goto(U+'#/calc/wall/sheet');await p.waitForTimeout(300);console.log(w,'計算書 橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}
console.log('錯誤',e);await b.close();})();
