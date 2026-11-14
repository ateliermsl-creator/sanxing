// colform_calc：柱模板分頁的數值與計算書（見 tests/README.md）
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.type()==='prompt'?d.accept('測試板'):d.accept());
const U='http://localhost:8793/index.html';
await p.goto(U+'#/calc/col');await p.waitForSelector('[data-p="info.H"]');
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);
await f('info.H','300');for(const [k,v] of [['H1','20'],['B2','40'],['H3','60'],['B4','80'],['H4','60']]) await f('gaps.'+k,v);
await p.click('details[data-m="ply"] summary');await f('m.ply.h','1.8');await f('m.ply.fb','100');await f('m.ply.fv','10');await f('m.ply.E','70000');await f('m.ply.defN','360');
await p.click('details[data-m="tie"] summary');await f('tie.ta','4000');
const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
console.log('側壓力:',await t('#cfP'));
console.log('襯板:',await t('[data-out="ply"]'));
console.log('螺桿:',await t('[data-out="tie"]'));
await p.click('[data-savemat="ply"]');await p.waitForTimeout(200);console.log('常用材料:',await p.$$eval('[data-mat="stud"] option',o=>o.map(x=>x.textContent)));
await f('m.ply.fb','50');console.log('改 fb=50:',await t('[data-sum="ply"]'),'|',await t('#cfAll'));
await p.goto(U+'#/');await p.goto(U+'#/calc/col');await p.waitForSelector('[data-p="info.H"]');console.log('重開保留 H:',await p.inputValue('[data-p="info.H"]'));
await p.goto(U+'#/calc/col/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);
console.log('計算書:',(await t('.paper')).slice(0,260),'… 分享鈕',!!await p.$('#pdfShare'));
await p.screenshot({path:S+'colform_sheet.png',fullPage:true});
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});for(const h of ['#/calc/col','#/calc/col/sheet']){await p.goto(U+h);await p.waitForTimeout(300);await p.$$eval('details',d=>d.forEach(x=>x.open=true));
 const o=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);console.log(w,h,'橫向捲動',o?'有':'無');}}
await p.setViewportSize({width:390,height:844});await p.goto(U+'#/calc/col');await p.waitForTimeout(300);await p.$$eval('details',d=>d.forEach(x=>x.open=true));await p.screenshot({path:S+'colform_tab.png',fullPage:true});
console.log('錯誤',e);await b.close();})();
