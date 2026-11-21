require('./uidlg');
// cfstep_tabs：計算機分步驟分頁（cfstep.js）見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out');require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch();
for(const [w,h,tag] of [[390,844,'p390'],[320,640,'p320'],[1440,900,'desk']]){
const p=await (await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:w>1000?1:2})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(400);await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'宜蘭三星蔥新建工程'});localStorage.setItem('siteId','s1');localStorage.setItem('lastBackup',new Date().toISOString())});await p.reload();await p.waitForTimeout(400);
for(const h of ['#/struct/col','#/struct/wall','#/struct/slab','#/struct/beam','#/struct/scaf','#/struct/brk','#/struct/row','#/struct/anc','#/struct/sec','#/calc/vol','#/calc/tile']){await p.goto('http://localhost:8793/index.html'+h);await p.waitForTimeout(400);
 const r=await p.evaluate(()=>{const vis=[...document.querySelectorAll('#calcBox > *')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.id||x.className.split(' ')[0]);return vis.join(',')+' hs='+(document.documentElement.scrollWidth>innerWidth)});
 // click next
 const nx=await p.$('.cfnav button[data-go]:not(.sec)'); if(nx){await nx.click();await p.waitForTimeout(150);}
 const r2=await p.evaluate(()=>[...document.querySelectorAll('#calcBox > *')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.id||x.className.split(' ')[0]).join(','));
 console.log(tag,h,'|',r,'| next→',r2);
 if(h==='#/struct/beam'){await p.goto('http://localhost:8793/index.html#/struct/beam');await p.waitForTimeout(300);await p.click('.cfnav button[data-go]');await p.waitForTimeout(300);await p.screenshot({path:`${S}/${tag}_wall_step.png`});}
}
// calcBar reveal on phone
if(tag!=='desk'){await p.goto('http://localhost:8793/index.html#/struct/col');await p.waitForTimeout(400);await p.click('#calcBar');await p.waitForTimeout(500);console.log(tag,'看結果後顯示',await p.evaluate(()=>getComputedStyle(document.getElementById('cf4')).display!=='none'&&document.querySelector('.cfsteps a.on').textContent));}
// redraw keeps step: wall add tier
await p.goto('http://localhost:8793/index.html#/struct/col');await p.waitForTimeout(300);await p.click('.cfsteps a[href="#cf3"]');await p.waitForTimeout(100);if(await p.$('#cfTierAdd'))await p.click('#cfTierAdd');await p.waitForTimeout(200);console.log(tag,'重畫後仍在',await p.evaluate(()=>document.querySelector('.cfsteps a.on')?.textContent));
await p.click('.cfallbtn');await p.waitForTimeout(100);console.log(tag,'全部顯示 hidden count',await p.evaluate(()=>document.querySelectorAll('#calcBox .cfoff').length));await p.click('.cfallbtn');
console.log(tag,'errs',e);}
await b.close()})();
