// site_company：表單抬頭的公司名稱跟著所在專案（工地）切換；舊工地沒有公司欄位時沿用以前的全站設定（見 tests/README.md）
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();let bad=0;const ok=(c,m)=>{console.log(c?'OK ':'NG ',m);if(!c)bad++;};
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(500);
// 舊資料：全站公司名稱＋沒有 company 欄位的舊工地
await p.evaluate(async()=>{localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString());localStorage.setItem('company','舊全站營造');await DB.put('sites',{id:'old1',name:'舊工地'});});
await p.reload();await p.waitForTimeout(500);
const comp=async()=>{await p.goto('http://localhost:8793/index.html#/punch/summary');await p.waitForTimeout(600);return p.$eval('.paper .pcomp',x=>x.textContent).catch(()=>'');};
ok(await comp()==='舊全站營造','舊工地沿用原本的公司名稱');
await p.goto('http://localhost:8793/index.html#/');await p.waitForTimeout(400);
await p.click('#hAdd');ok(await p.inputValue('#sCompany')==='舊全站營造','新增專案時公司預設帶上次的值');
await p.fill('#sName','東門風華二期');await p.fill('#sCompany','甲營造有限公司');await p.click('#sOk');await p.waitForTimeout(500);
await p.click('#hAdd');await p.fill('#sName','羅東宿舍');await p.fill('#sCompany','<b>乙</b>營造');await p.click('#sOk');await p.waitForTimeout(500);
ok(await comp()==='<b>乙</b>營造','新專案用自己的公司名稱（有轉義）');
const id=n=>p.evaluate(n=>sites.find(s=>s.name===n).id,n);
await p.selectOption('#siteSelect',await id('東門風華二期'));await p.waitForTimeout(300);
ok(await comp()==='甲營造有限公司','切換專案後缺失改善表抬頭跟著換');
await p.selectOption('#siteSelect',await id('舊工地'));await p.waitForTimeout(300);
ok(await comp()==='舊全站營造','切回舊工地仍是原本名稱');
// 修改專案：預填該專案自己的公司名稱，改了只影響這個專案
await p.selectOption('#siteSelect',await id('東門風華二期'));await p.goto('http://localhost:8793/index.html#/');await p.waitForTimeout(400);
await p.click('#hEdit');ok(await p.inputValue('#sCompany')==='甲營造有限公司','修改時帶出這個專案的公司名稱');
await p.fill('#sCompany','丙營造');await p.click('#sOk');await p.waitForTimeout(400);
ok(await comp()==='丙營造','修改後抬頭更新');
await p.selectOption('#siteSelect',await id('羅東宿舍'));await p.waitForTimeout(300);
ok(await comp()==='<b>乙</b>營造','其他專案不受影響');
// 結構計算書也跟著專案
await p.goto('http://localhost:8793/index.html#/struct/col/sheet');await p.waitForTimeout(800);
ok(await p.$eval('.paper .pcomp',x=>x.textContent).catch(()=>'')==='<b>乙</b>營造','柱模板計算書抬頭跟著專案');
ok(!e.length,'無錯誤 '+e.join(';'));
await b.close();console.log(bad?`有 ${bad} 項不符`:'全部符合');})();
