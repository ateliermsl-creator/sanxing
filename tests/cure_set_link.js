// cure_set_link：澆置頁拆模追蹤「未設定天數」連到設定頁，填完回來顯示可拆日（見 tests/README.md）
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(800);
await p.evaluate(async()=>{
 await DB.put('sites',{id:'s1',name:'東門風華二期'});localStorage.setItem('siteId','s1');
 await DB.put('pours',{id:'j9',siteId:'s1',date:'2026-11-15',floor:'5F',part:'梁板',supplier:'',fc:'280',slumpMin:'',slumpMax:'',clMax:'',limitMin:'90',created:1,updated:1,trucks:[],forms:{'柱側模':{strip:''},'牆側模':{strip:''},'樑側模':{strip:''}}});
 await DB.put('matcats',{id:'__cure',ages:[7,28],forms:[{n:'柱側模',d:'3'},{n:'牆側模',d:'7'},{n:'樑側模',d:'14'},{n:'版底模',d:''},{n:'樑底模',d:''},{n:'懸臂版底模',d:''}],updated:5});
});
await p.reload();await p.goto('http://localhost:8793/index.html#/pour');await p.waitForTimeout(300);
await p.goto('http://localhost:8793/index.html#/pour/j9');await p.waitForSelector('#cuForms');
await p.$eval('#cuForms',el=>el.scrollIntoView());await p.waitForTimeout(200);
await p.screenshot({path:S+'cure_link_1.png'});
console.log('前:',(await p.innerText('#cuForms')).replace(/\n+/g,' | '));
// 點「樑底模」的未設定天數
await p.click('[data-cfset="樑底模"]');await p.waitForSelector('#csForms');await p.waitForTimeout(300);
console.log('網址:',await p.evaluate(()=>location.hash),'聚焦欄位:',await p.evaluate(()=>document.activeElement?.dataset?.d));
console.log('勾選框未被切換:',await p.evaluate(async()=>!(await DB.get('pours','j9')).forms['樑底模']));
await p.fill('[data-d="3"]','10');await p.fill('[data-d="4"]','21');await p.fill('[data-d="5"]','28');
await p.screenshot({path:S+'cure_link_2.png'});
await p.click('#csBack');await p.waitForSelector('#cuForms');await p.waitForTimeout(500);
console.log('回到:',await p.evaluate(()=>location.hash),'捲動:',await p.evaluate(()=>Math.round(document.querySelector('#cuForms').getBoundingClientRect().top)));
await p.check('[data-cf="樑底模"]');await p.waitForTimeout(500);
await p.screenshot({path:S+'cure_link_3.png'});
console.log('後:',(await p.innerText('#cuForms')).replace(/\n+/g,' | '));
// 頂部返回鍵（parentHash）從設定頁直接開啟時回澆置
await p.goto('http://localhost:8793/index.html#/cure/set/pour/j9');await p.waitForSelector('#csForms');await p.click('#backBtn');await p.waitForTimeout(600);
console.log('返回鍵:',await p.evaluate(()=>location.hash));
// 320 寬沒有橫向捲動
await p.setViewportSize({width:320,height:700});await p.goto('http://localhost:8793/index.html#/pour/j9');await p.waitForSelector('#cuForms');
console.log('320 溢出:',await p.evaluate(()=>document.documentElement.scrollWidth>320));
console.log('錯誤',e);await b.close();})();
