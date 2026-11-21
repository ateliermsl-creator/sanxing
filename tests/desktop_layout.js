require('./uidlg');
// desktop_layout：電腦版自動排版（側欄、首頁格狀、計算機左右並排）見 tests/README.md
const {chromium}=require('playwright');const O=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(O,{recursive:true});(async()=>{const b=await chromium.launch();
for(const [w,h,tag] of [[1440,900,'desktop'],[1024,768,'tablet'],[390,844,'phone']]){
const p=await (await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1})).newPage();await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(500);await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'宜蘭三星蔥新建工程'});localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString())});await p.reload();await p.waitForTimeout(500);
for(const [n,hh] of [['home','#/'],['wall','#/calc/wall'],['check','#/checklist'],['vol','#/calc/vol']]){await p.goto('http://localhost:8793/index.html'+hh);await p.waitForTimeout(500);
 if(n==='wall'){const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);await f('info.H','300');await f('info.len','240');await p.click('#wfTierAdd');await p.click('#wfTierAdd');await f('tiers.0.top','100');await f('tiers.1.top','200');for(const i of [0,1,2]) for(const [k,v] of [['H1','20'],['B2','40'],['H3','60'],['B4','80']]) await f(`tiers.${i}.${k}`,v);await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(300);}
 const hs=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);const bar=await p.evaluate(()=>document.getElementById('calcBar').hidden);const sn=await p.evaluate(()=>getComputedStyle(document.getElementById('sideNav')).display!=='none');
 console.log(tag,n,'橫向捲動',hs,'bar hidden',bar,'側欄',sn);
 if(tag!=='phone')await p.screenshot({path:O+`${tag}_${n}.png`});}
console.log(tag,'errs',e);}
await b.close();})();
