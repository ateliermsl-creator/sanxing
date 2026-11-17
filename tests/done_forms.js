// done_forms：各表單「✔ 完成…」與「✎ 修改這份紀錄」（savestat.js dnBind）
// 施工日誌、材料進場、勤前教育、混凝土澆置（含單車頁）：完成前提醒、完成後唯讀與不能刪除、列表 🔒、修改後可編輯並記下時間；
// 澆置完成後拆模追蹤仍可勾選；點工單用語改為「完成簽認／修改」；備份清理保留 locked／reopened；320px 不橫向捲動
const {chromium}=require('playwright');
const SHOT=process.env.SHOT;
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const errs=[],dlg=[];p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>{dlg.push(d.message());d.accept();});
const ok=(c,m)=>console.log((c?'OK    ':'失敗  ')+m);const U='http://localhost:8793/index.html';
await p.goto(U);await p.waitForTimeout(800);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'三星蔥示範工程'});localStorage.setItem('siteId','s1');});
await p.reload();await p.waitForTimeout(600);
const ids=await p.evaluate(async()=>{const lg=await lgNew();const m=await matNew({});const sa=await saNew();const po=await pourNew();return {lg,m:m.id,sa,po};});
const forms=[['施工日誌','#/log/'+ids.lg,'logs',ids.lg,'#lgDel','[data-f=other]','#/log','完成日誌'],
  ['材料進場','#/material/'+ids.m,'matrecs',ids.m,'#mDel','[data-f=name]','#/material','完成驗收'],
  ['勤前教育','#/safety/'+ids.sa,'safety',ids.sa,'#saDel','[data-f=place]','#/safety','完成簽到'],
  ['混凝土澆置','#/pour/'+ids.po,'pours',ids.po,'#pjDel','[data-f=part]','#/pour','完成抽驗']];
const get=(st,id)=>p.evaluate(([st,id])=>DB.get(st,id),[st,id]);
for(const [n,h,st,id,del,fld,list,lab] of forms){
  await p.goto(U+h);await p.waitForSelector('#dnDone');await p.waitForTimeout(300);
  ok((await p.textContent('#dnDone')).includes(lab),n+'：有「'+lab+'」按鈕');
  await p.fill(fld,'測試內容 '+n);await p.waitForTimeout(500);
  dlg.length=0;await p.click('#dnDone');await p.waitForSelector('#dnEdit');await p.waitForTimeout(300);
  ok(dlg[0]&&dlg[0].includes('⚠'),n+'：完成前提醒 '+(dlg[0]||'').split('\n')[0]);
  const r=await get(st,id);ok(r.locked>0&&r.updated>0,n+'：存了完成時間');
  const ro=await p.evaluate(()=>{const v=document.getElementById('view');const bad=[...v.querySelectorAll('input:not([type=file]),select,textarea')].filter(x=>!x.disabled&&!x.closest('#cuForms')).map(x=>x.outerHTML.slice(0,60));
    const vis=[...v.querySelectorAll('button')].filter(x=>!x.disabled&&x.offsetParent).map(x=>x.id||x.textContent.trim().slice(0,8));const cv=[...v.querySelectorAll('canvas')].every(c=>getComputedStyle(c).pointerEvents==='none');return {bad,vis,cv,ban:!!v.querySelector('.cllock')};});
  ok(!ro.bad.length&&ro.cv&&ro.ban,n+'：完成後唯讀 '+JSON.stringify(ro.bad));
  console.log('      可按的按鈕：',ro.vis.join('、'));
  if(SHOT){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:`${SHOT}/${n}_完成_上方.png`});await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(200);await p.screenshot({path:`${SHOT}/${n}_完成_底部.png`});}
  dlg.length=0;await p.click(del);await p.waitForTimeout(300);ok(dlg[0]&&dlg[0].includes('不能直接刪除')&&!!(await get(st,id)),n+'：完成後不能直接刪除');
  await p.goto(U+list);await p.waitForTimeout(700);ok((await p.textContent('#view')).includes('🔒'),n+'：列表顯示 🔒');
  await p.goto(U+h);await p.waitForSelector('#dnEdit');await p.waitForTimeout(300);dlg.length=0;await p.click('#dnEdit');await p.waitForSelector('#dnDone');await p.waitForTimeout(300);
  const r2=await get(st,id);ok(!r2.locked&&r2.reopened?.length===1&&dlg[0].includes('要修改內容嗎'),n+'：修改後解除並記下時間');
  ok(await p.locator('.cllock.reopen').count()===1,n+'：顯示修改中');
  await p.fill(fld,'改過 '+n);await p.waitForTimeout(600);ok(Object.values(await get(st,id)).includes('改過 '+n),n+'：修改後可自動儲存');
  await p.click('#dnDone');await p.waitForSelector('#dnEdit');await p.waitForTimeout(300);
  ok((await p.textContent('.cllock')).includes('完成後曾修改'),n+'：再完成後顯示曾修改');
  await p.goto(U+'#/');await p.waitForTimeout(300);ok(!(await p.evaluate(()=>document.getElementById('view').classList.contains('dnlock'))),n+'：換頁後拿掉唯讀樣式');
}
// 澆置：加一車（先修改），再完成，單車頁唯讀；拆模追蹤仍可勾
await p.goto(U+'#/pour/'+ids.po);await p.waitForSelector('#dnEdit');await p.click('#dnEdit');await p.waitForSelector('#pjTruck');await p.click('#pjTruck');await p.waitForSelector('#ptDone');await p.fill('[data-t=plate]','ABC-1234');await p.waitForTimeout(500);
await p.click('#ptDone');await p.waitForSelector('#dnDone');await p.waitForTimeout(500);await p.click('#dnDone');await p.waitForSelector('#dnEdit');await p.waitForTimeout(300);
ok(await p.locator('#pjTruck').isHidden(),'澆置：完成後「新增一車」藏起');
const cf=await p.locator('#cuForms input[type=checkbox]').count();
if(cf){await p.locator('#cuForms input[type=checkbox]').first().check();await p.waitForTimeout(600);ok(Object.keys((await get('pours',ids.po)).forms||{}).length>0,'澆置：完成後拆模追蹤仍可勾選並存檔');}else ok(true,'澆置：（沒有設定拆模模板，略過拆模追蹤）');
await p.click('a.rec:has-text("ABC-1234")');await p.waitForSelector('#ptDone');await p.waitForTimeout(300);
const tr=await p.evaluate(()=>({dis:[...document.querySelectorAll('#view [data-t]')].every(x=>x.disabled),next:!document.getElementById('ptNext').offsetParent,ban:document.querySelector('.cllock')?.textContent||''}));
ok(tr.dis&&tr.next&&tr.ban.includes('回澆置表'),'澆置單車頁跟著唯讀 '+JSON.stringify(tr));
if(SHOT)await p.screenshot({path:`${SHOT}/澆置單車_完成.png`});
dlg.length=0;await p.click('#ptDel');await p.waitForTimeout(300);ok(dlg[0]&&dlg[0].includes('不能直接刪除'),'澆置單車：不能直接刪除');
// 備份清理
const cl=await p.evaluate(()=>['logs','matrecs','pours','safety','records'].map(k=>{const o=CLEAN[k]({id:'a1',siteId:'s1',locked:9,reopened:[3,'x'],trucks:[],people:[]});return o&&o.locked===9&&o.reopened.join()==='3';}));
ok(cl.every(Boolean),'備份清理保留 locked／reopened '+cl);
// 點工單用語
const wo=await p.evaluate(async()=>{const r={id:'w1',siteId:'s1',date:'2026-11-17',vendor:'',trade:'',lines:[],names:{vendor:'',site:''},sigs:{},status:'signed',signedAt:new Date().toISOString(),log:[],updated:1};await DB.put('workorders',r);return 1;});
await p.goto(U+'#/workorder/w1');await p.waitForSelector('#woUnlock');ok((await p.textContent('#woUnlock')).includes('修改這份紀錄')&&!(await p.textContent('#view')).includes('鎖定'),'點工單：用語改為「完成簽認／修改」');
await p.setViewportSize({width:320,height:700});
for(const h of ['#/log/'+ids.lg,'#/material/'+ids.m,'#/safety/'+ids.sa,'#/pour/'+ids.po]){await p.goto(U+h);await p.waitForTimeout(600);const w=await p.evaluate(()=>document.documentElement.scrollWidth);ok(w<=320,'320px 無橫向捲動 '+h+' ('+w+')');}
if(SHOT){await p.setViewportSize({width:1280,height:900});await p.goto(U+'#/safety/'+ids.sa);await p.waitForTimeout(600);await p.screenshot({path:`${SHOT}/勤前教育_完成_電腦版.png`});}
console.log('JS錯誤',errs);await b.close();})();
