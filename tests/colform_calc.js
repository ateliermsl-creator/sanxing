// colform_calc：柱模板（三步驟、材料庫、分階檢核、圖、計算書）見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
await p.goto(U+'#/calc/col');await p.waitForSelector('[data-p="info.H"]');
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
await f('info.H','300');await f('info.bx','60');
// 材料庫：襯板、角材、螺桿
const addMat=async(kind,vals)=>{await p.$eval('.cflibbox',d=>d.open=true);await p.click(`[data-ladd="${kind}"]`);const id=await p.$$eval('[data-card]',c=>c[c.length-1].dataset.card);for(const [k,v] of Object.entries(vals)) await p.fill(`[data-l="${id}"][data-lk="${k}"]`,v);return id;};
const ply=await addMat('ply',{n:'測試板 1.8',t:'1.8',fb:'100',fv:'10',E:'70000'});
const bm=await addMat('beam',{n:'測試角材',b:'4.5',h:'3.6',fb:'100',fv:'10',E:'70000'});
const tie=await addMat('tie',{n:'測試螺桿',ta:'4000'});
await p.selectOption('[data-p="sel.ply"]',ply);for(const k of ['stud','w1','w2']) await p.selectOption(`[data-p="sel.${k}"]`,bm);await p.selectOption('[data-p="sel.tie"]',tie);
await f('defP.n','360');await f('defB.n','360');
await p.click('#cfTierAdd');await p.click('#cfTierAdd');
for(const i of [0,1,2]) for(const [k,v] of [['H1','20'],['B2','40'],['H3','60'],['B4','80']]) await f(`tiers.${i}.${k}`,v);
await f('tiers.0.top','100');await f('tiers.1.top','200');
console.log('選單:',await p.$$eval('[data-p="sel.stud"] option',o=>o.map(x=>x.textContent)));
console.log('結果表:',await t('#cfRes .cfres'));
console.log('總結:',await t('#cfRes .big'));
await p.click('#cfRes details >> nth=0');console.log('第一階明細:',(await t('#cfRes details >> nth=0')).slice(0,400));
console.log('側壓力圖:',await p.$$eval('#cfPsvg text',x=>x.map(y=>y.textContent).join(' | ')));
console.log('示意圖:',await p.$$eval('#cfLay svg',s=>s.map(x=>({line:x.querySelectorAll('line').length,rect:x.querySelectorAll('rect').length,dot:x.querySelectorAll('circle').length}))));
await p.selectOption('[data-p="sel.ply"]','p_ply15');await p.selectOption('[data-p="sel.stud"]','p_b3645');await p.selectOption('#cfDefP','a3');
console.log('內建（針葉樹III類、襯板1.5、角材3.6×4.5）第一階:',(await p.$$eval('#cfRes .cfres tr',r=>r.slice(1,7).map(x=>x.innerText.replace(/\s+/g,' ')))).join(' / '));
await p.$eval('.cflibbox',d=>d.open=true);console.log('參考表:',await p.$$eval('.cfref tr',r=>r.map(x=>x.innerText.replace(/\s+/g,' ')).join(' | ')));
await p.selectOption('[data-p="sel.stud"]','p_s7045_23');await p.selectOption('[data-p="sel.tie"]','p_t25');await f('tieFt','1000');
console.log('鋼角材小格柵 fb 第一階:',await t('#cfRes .cfres tr:nth-child(5)'),'| 螺桿(2.5分,Ft1000):',await t('#cfRes .cfres tr:last-child'));
await f('tiers.0.top','400');console.log('高度錯誤:',await t('#cfRes'));await f('tiers.0.top','100');
await p.goto(U+'#/');await p.goto(U+'#/calc/col');await p.waitForSelector('[data-p="info.H"]');console.log('重開保留:',await p.inputValue('[data-p="tiers.1.top"]'),await p.inputValue('[data-p="sel.ply"]')==='p_ply15');
await p.setViewportSize({width:390,height:844});await p.$$eval('details',d=>d.forEach(x=>x.open=true));await p.screenshot({path:S+'colform_tab.png',fullPage:true});
await p.goto(U+'#/calc/col/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);
console.log('計算書:',(await t('.paper')).slice(0,300),'… 分享鈕',!!await p.$('#pdfShare'));
await p.screenshot({path:S+'colform_sheet.png',fullPage:true});
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});for(const h of ['#/calc/col','#/calc/col/sheet']){await p.goto(U+h);await p.waitForTimeout(300);await p.$$eval('details',d=>d.forEach(x=>x.open=true));
 const o=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);console.log(w,h,'橫向捲動',o?'有':'無');}}
console.log('錯誤',e);await b.close();})();
