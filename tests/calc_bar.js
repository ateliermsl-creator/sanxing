// calc_bar：計算機結果摘要列（calcbar.js）見 tests/README.md
const {chromium}=require('playwright');const O=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(O,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
const go=async u=>{await p.goto(u);await p.waitForTimeout(300);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));};
const bar=async()=>p.evaluate(()=>{const b=document.getElementById('calcBar');return (b.hidden?'[hidden] ':'['+b.className+'] ')+b.innerText.replace(/\s+/g,' ')});
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);
await go(U+'#/calc/wall');await p.waitForSelector('[data-p="info.H"]');await p.waitForTimeout(300);console.log('空白',await bar());
await p.screenshot({path:O+'bar_empty.png'});
await f('info.H','300');await f('info.len','240');await p.click('#wfTierAdd');await p.click('#wfTierAdd');await f('tiers.0.top','100');await f('tiers.1.top','200');
for(const i of [0,1,2]) for(const [k,v] of [['H1','20'],['B2','40'],['H3','60'],['B4','80']]) await f(`tiers.${i}.${k}`,v);
await p.waitForTimeout(200);console.log('牆 NG',await bar());await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(200);await p.screenshot({path:O+'bar_ng.png'});
await p.click('#calcBar');await p.waitForTimeout(900);console.log('點後',await bar(),'scrollY',await p.evaluate(()=>scrollY));await p.screenshot({path:O+'bar_ng_results.png'});
await go(U+'#/calc/slab');await p.waitForSelector('[data-p]');
for(const [k,v] of [['info.H','350'],['info.t','15'],['gap.L1','30'],['gap.L2','90'],['gap.L3','90']]) { const el=await p.$(`[data-p="${k}"]`); if(el) await el.fill(v); else console.log('no',k);}
await p.waitForTimeout(200);console.log('板',await bar());await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(200);await p.screenshot({path:O+'bar_ok.png'});
await go(U+'#/calc/beam');await p.waitForTimeout(300);console.log('梁空白',await bar());
await go(U+'#/calc/scaf');await p.waitForTimeout(300);console.log('施工架',await bar());
await go(U+'#/calc/col/sheet');await p.waitForTimeout(300);console.log('計算書',await bar());
await go(U+'#/calc/vol');await p.waitForTimeout(300);console.log('混凝土',await bar());
await go(U+'#/');await p.waitForTimeout(300);console.log('首頁',await bar());
console.log('errs',e);await b.close();})();
