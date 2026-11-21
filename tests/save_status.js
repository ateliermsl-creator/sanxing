require('./uidlg');
// save_status：各表單右下角儲存狀態、換頁立刻寫入、「儲存並返回」、結構計算「輸入已自動保留」（見 tests/README.md）
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push(x.stack.split('\n').slice(0,2).join('|')));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';const tip=async()=>(await p.$eval('#saveTip',x=>x.hidden?'(隱藏)':x.className+' '+x.textContent).catch(()=>'(無)'));
await p.goto(U);await p.click('#hWel');await p.waitForSelector('#setup[open]');await p.fill('#sName','宜蘭三星蔥新建工程');await p.click('#sOk');await p.waitForTimeout(400);
const forms=[['施工日誌','#/log','#lgAdd','[data-f=other]','logs','other','#/log'],['材料進場','#/material','#mAdd','[data-f=vendor]','matrecs','vendor','#/material'],
 ['澆置','#/pour','#pjAdd','[data-f=supplier]','pours','supplier','#/pour'],['缺失','#/punch','#pAdd','[data-f=desc]','punch','desc','#/punch'],
 ['點工單','#/workorder','#woAdd','[data-f=vendor]','workorders','vendor','#/workorder'],['勤前教育','#/safety','#saAdd','[data-f=place]','safety','place','#/safety']];
let fail=0;
for(const [n,list,add,sel,store,key] of forms){
  await p.goto(U+list);await p.waitForTimeout(300);await p.click(add);await p.waitForSelector(sel);await p.waitForTimeout(200);
  const t0=await tip();await p.fill(sel,n+'甲');const t1=await tip();await p.waitForTimeout(600);const t2=await tip();
  // 立刻換頁（不到 0.3 秒）：列表讀到的要是新內容
  await p.fill(sel,n+'乙');await p.evaluate(l=>location.hash=l,list);await p.waitForTimeout(400);
  const v=await p.evaluate(([s,k])=>DB.all(s).then(a=>a.map(x=>x[k]).join(',')),[store,key]);const t3=await tip();
  const ok=t0.includes('已儲存在這支手機')&&t1.includes('儲存中')&&t2.includes('已自動儲存')&&v.includes(n+'乙')&&t3==='(隱藏)';if(!ok)fail++;
  console.log(ok?'OK ':'NG ',n,'|',t0,'|',t1,'|',t2,'| 換頁後資料:',v,'| 換頁後提示:',t3);
}
// 儲存並返回
await p.goto(U+'#/log');await p.waitForTimeout(300);await p.click('.rec');await p.waitForSelector('#svDone');await p.fill('[data-f=notify]','通知甲');await p.click('#svDone');await p.waitForTimeout(500);
const back=await p.evaluate(()=>location.hash),nv=await p.evaluate(()=>DB.all('logs').then(a=>a[0].notify));console.log((back==='#/log'&&nv==='通知甲')?'OK ':'NG ','儲存並返回:',back,nv);if(!(back==='#/log'&&nv==='通知甲'))fail++;
// 存檔失敗顯示
await p.click('.rec');await p.waitForSelector('#svDone');await p.evaluate(()=>{window.__put=DB.put;DB.put=()=>Promise.reject(new Error('QuotaExceeded'));});
await p.fill('[data-f=notify]','x');await p.waitForTimeout(600);const te=await tip();console.log(te.includes('儲存失敗')?'OK ':'NG ','存檔失敗:',te);if(!te.includes('儲存失敗'))fail++;
await p.click('#svDone');await p.waitForTimeout(300);const stay=await p.evaluate(()=>location.hash);console.log(stay.startsWith('#/log/')?'OK ':'NG ','失敗時留在原頁:',stay);if(!stay.startsWith('#/log/'))fail++;
await p.evaluate(()=>{DB.put=window.__put;});
// 設定頁
for(const [n,h,sel] of [['勤前教育設定','#/safety/set','#ssSt'],['材料類別設定','#/material/cfg','#cDocs']]){await p.goto(U+h);await p.waitForSelector(sel);await p.fill(sel,'測試');await p.waitForTimeout(700);const t=await tip();console.log(t.includes('已自動儲存')?'OK ':'NG ',n,t);if(!t.includes('已自動儲存'))fail++;}
// 結構計算
await p.goto(U+'#/struct/col');await p.waitForTimeout(500);const inp=await p.$('#calcBox input[inputmode]');await inp.fill('3');await inp.dispatchEvent('input');await p.waitForTimeout(300);const tk=await tip();console.log(tk.includes('輸入已自動保留')?'OK ':'NG ','柱模板:',tk);if(!tk.includes('輸入已自動保留'))fail++;
// 截圖
await p.goto(U+'#/punch');await p.waitForTimeout(300);await p.click('.rec');await p.waitForSelector('[data-f=desc]');await p.fill('[data-f=location]','3F A 軸');await p.waitForTimeout(600);await p.screenshot({path:S+'save_punch.png'});
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(200);await p.screenshot({path:S+'save_punch_bottom.png'});
await p.goto(U+'#/calc/vol');await p.waitForTimeout(500);await p.screenshot({path:S+'save_vol.png'});
await p.setViewportSize({width:320,height:640});await p.goto(U+'#/log');await p.waitForTimeout(300);await p.click('.rec');await p.waitForSelector('#svDone');await p.fill('[data-f=other]','窄螢幕');await p.waitForTimeout(600);await p.screenshot({path:S+'save_log320.png'});
const ov=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);console.log(ov?'NG ':'OK ','320px 無橫向捲動');if(ov)fail++;
console.log('失敗',fail,'錯誤',e);await b.close();})();
