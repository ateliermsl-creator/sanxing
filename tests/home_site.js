require('./uidlg');
// home_site：首頁標題下方「目前工地」切換／新增（見 tests/README.md）
const {chromium}=require('playwright');const O=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(O,{recursive:true});(async()=>{const b=await chromium.launch();let bad=0;const ok=(c,m)=>{console.log(c?'OK ':'NG ',m);if(!c)bad++;};
for(const [w,h,tag] of [[1440,900,'desktop'],[320,640,'phone320'],[390,844,'phone']]){
const p=await (await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:tag==='phone'?2:1})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(500);
await p.evaluate(()=>{localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString())});
// 沒有工地：首頁顯示新增按鈕（先關掉第一次使用的視窗）
await p.reload();await p.waitForTimeout(500);await p.evaluate(()=>document.getElementById('setup').open&&document.getElementById('setup').close());
ok(await p.isVisible('#hAdd')&&!(await p.$('#hSite')),tag+' 無工地顯示新增按鈕');
if(tag==='phone')await p.screenshot({path:O+'home_site_empty.png',clip:{x:0,y:0,width:w,height:520}});
await p.click('#hAdd');ok(await p.evaluate(()=>document.getElementById('setup').open),tag+' 按新增開啟工地視窗');
await p.fill('#sName','宜蘭三星蔥新建工程');await p.click('#sOk');await p.waitForTimeout(500);
ok(await p.$eval('#hSite',s=>s.selectedOptions[0].textContent)==='宜蘭三星蔥新建工程',tag+' 新增後首頁顯示該工地');
await p.click('#hAdd');await p.fill('#sName','<img src=x onerror=alert(1)>羅東宿舍');await p.click('#sOk');await p.waitForTimeout(500);
ok(await p.$eval('#hSite',s=>s.options.length)===2&&!(await p.$('.hsite img')),tag+' 兩個工地、名稱有轉義');
const first=await p.$eval('#hSite',s=>[...s.options].find(o=>o.textContent.startsWith('宜蘭')).value);await p.selectOption('#hSite',first);ok(await p.$eval('#hName',x=>x.textContent)==='宜蘭三星蔥新建工程',tag+' 切換後名牌名稱更新');
ok(await p.evaluate(()=>localStorage.getItem('siteId'))===JSON.stringify(first)||await p.evaluate(()=>siteId)===first,tag+' 切換工地寫回目前工地');
await p.goto('http://localhost:8793/index.html#/checklist');await p.waitForTimeout(400);ok(await p.$eval('#siteSelect',s=>s.value)===first,tag+' 內頁工地選單同步');
await p.goto('http://localhost:8793/index.html#/');await p.waitForTimeout(500);
ok(!(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),tag+' 沒有橫向捲動');
await p.screenshot({path:O+`home_site_${tag}.png`,clip:{x:0,y:0,width:w,height:Math.min(h,tag==='desktop'?700:640)}});
ok(!e.length,tag+' 無錯誤 '+e.join(';'));}
await b.close();console.log(bad?`有 ${bad} 項不符`:'全部符合');})();
