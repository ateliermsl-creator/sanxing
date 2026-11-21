// calc_tabs：見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S+'pdfs',{recursive:true});require('fs').mkdirSync(S+'theme',{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html#/calc/lap');await p.waitForSelector('#lM');
await p.fill('#lM','50');await p.fill('#lN','測試組合');console.log('D25長度:',await p.$$eval('#lOut tr',r=>r.filter(x=>x.innerText.startsWith('D25')).map(x=>x.innerText.replace(/\s+/g,' '))[0]));
await p.click('#lSave');await p.waitForTimeout(200);console.log('常用組合:',await p.$$eval('[data-p]',x=>x.map(y=>y.textContent)));
// 原「泥作材料」分頁已改成磁磚計算，見 tile_calc.js
await p.goto('http://localhost:8793/index.html#/calc/sleeve');await p.waitForSelector('#vH');
for(const [k,v] of [['vH','60'],['vL','600'],['vD','18'],['vX','300'],['vS','70']]) await p.fill('#'+k,v);
console.log('套管OK:',(await p.innerText('#vOut')).replace(/\s+/g,' '));
await p.fill('#vX','100');await p.fill('#vD','25');await p.fill('#vS','50');console.log('套管不符:',(await p.innerText('#vOut')).replace(/\s+/g,' '));
await p.screenshot({path:S+'s60.png',fullPage:true});console.log('錯誤',e);await b.close();})();
