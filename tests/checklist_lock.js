// checklist_lock：自主檢查表「完成檢查」（完成後唯讀）／「修改」與「儲存並返回」
// 1. 填表底部有「💾 儲存並返回」，按了立刻存並回列表
// 2. 「✔ 填寫完畢，鎖定」：未標記／未簽名會提醒；鎖定後欄位、結果、照片、簽名都不能改，列表顯示 🔒 已完成
// 3. 鎖定的紀錄不能直接刪除、不會被當成空白紀錄清掉；備份匯出入保留鎖定
// 4. 「解除鎖定」後可再修改
// 5. 320px 不橫向捲動
const {chromium}=require('playwright');
const SHOT=process.env.SHOT;
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const errs=[],dlg=[];p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>{dlg.push(d.message());d.accept();});
const ok=(c,m)=>console.log((c?'OK    ':'失敗  ')+m);const U='http://localhost:8793/index.html';
await p.goto(U);await p.waitForTimeout(800);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'三星蔥示範工程'});localStorage.setItem('siteId','s1');});
await p.reload();await p.waitForTimeout(600);await p.goto(U+'#/checklist');await p.waitForSelector('#clAdd');await p.click('#clAdd');await p.waitForSelector('[data-new]');
await p.click('[data-new="fm_beam"]');await p.waitForSelector('.item');const id=p.url().split('/').pop();
await p.fill('[data-f="location"]','3F 東側 C3 梁');await p.fill('[data-f="contractor"]','順風營造');
ok(await p.locator('#svDone').count()===1&&await p.locator('#lockBtn').count()===1,'有「儲存並返回」與「完成檢查」');
await p.click('#svDone');await p.waitForSelector('#clAdd');await p.waitForTimeout(500);ok(p.url().endsWith('#/checklist'),'儲存並返回回到列表');
ok((await p.evaluate(async id=>(await DB.get('records',id)).location,id))==='3F 東側 C3 梁','已存入');
await p.goto(U+'#/checklist/'+id);await p.waitForSelector('.item');await p.waitForTimeout(500);
const n=await p.locator('.item').count();
for(let i=0;i<n-1;i++)await p.locator('.item').nth(i).locator('[data-r="ok"]').click();
await p.locator('.item').nth(0).locator('.note').fill('間距 30cm，符合');await p.waitForTimeout(400);
{const c=p.locator('canvas[data-sig=manager]');await c.scrollIntoViewIfNeeded();const bb=await c.boundingBox();await p.mouse.move(bb.x+30,bb.y+40);await p.mouse.down();await p.mouse.move(bb.x+120,bb.y+90,{steps:5});await p.mouse.up();await p.waitForTimeout(600);}
ok(await p.evaluate(async id=>!!(await DB.get('records',id)).sigs.manager,id),'工地主任簽名已存');
if(SHOT){await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(200);await p.screenshot({path:SHOT+'/簽名後_手機底部.png'});}
dlg.length=0;await p.click('#lockBtn');await p.waitForSelector('.cllock');
ok(dlg[0]&&dlg[0].includes('還有 1 項沒有標記')&&dlg[0].includes('檢查人員尚未簽名'),'鎖定前提醒未標記與未簽名');
const r=await p.evaluate(async id=>await DB.get('records',id),id);ok(r.locked>0,'資料存了鎖定時間');
const st=await p.evaluate(()=>({att:getComputedStyle(document.querySelector('#attBox label.phbtn')).display,inp:[...document.querySelectorAll('#view input:not([type=file])')].every(x=>x.disabled),sym:[...document.querySelectorAll('.sym button')].every(x=>x.disabled),cam:document.querySelectorAll('[data-cam],input[data-ph],canvas,[data-clear],#lockBtn,#svDone').length,un:!!document.querySelector('#unlockBtn')}));
ok(st.att==='none'&&st.inp&&st.sym&&st.cam===0&&st.un,'鎖定後全部唯讀、沒有拍照與簽名框 '+JSON.stringify(st));
if(SHOT){await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:SHOT+'/鎖定_手機上方.png'});await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(200);await p.screenshot({path:SHOT+'/鎖定_手機底部.png'});}
dlg.length=0;await p.click('#delBtn');ok(dlg[0]&&dlg[0].includes('請先按「修改」')&&await p.evaluate(async id=>!!await DB.get('records',id),id),'完成後不能直接刪除');
await p.click('#backBtn');await p.waitForSelector('#clAdd');await p.waitForTimeout(500);
ok((await p.locator('a.rec .st').first().textContent())==='🔒 已完成','列表顯示 🔒 已完成');
await p.click('[data-cf="done"]');await p.waitForTimeout(200);ok(await p.locator('a.rec').count()===1,'「已完成」篩選包含鎖定紀錄');
if(SHOT)await p.screenshot({path:SHOT+'/鎖定_列表.png'});
// 空白但鎖定的紀錄不清掉
const blank=await p.evaluate(async()=>{await DB.put('records',{id:'bl',siteId:'s1',templateId:'fm_beam',docNo:'',contractor:'',subcontractor:'',date:'2026-11-01',location:'',timing:{},items:{},sigs:{},updated:1,locked:5});await clPurgeBlank();return !!await DB.get('records','bl');});
ok(blank,'鎖定的空白紀錄不會被清掉');
const cl=await p.evaluate(()=>JSON.stringify(CLEAN.records({id:'a1',siteId:'s1',locked:123})));ok(cl.includes('"locked":123')&&(await p.evaluate(()=>JSON.stringify(CLEAN.records({id:'a1',siteId:'s1',reopened:[5,'x',7]})))).includes('"reopened":[5,7]'),'備份清理保留 locked '+cl);
const cl2=await p.evaluate(()=>JSON.stringify(CLEAN.records({id:'a1',siteId:'s1'})));ok(!cl2.includes('locked'),'沒鎖的不多出 locked');
// 解除鎖定
await p.goto(U+'#/checklist/'+id);await p.waitForSelector('#unlockBtn');await p.waitForTimeout(500);dlg.length=0;await p.click('#unlockBtn');await p.waitForSelector('#lockBtn');
ok(dlg[0].includes('要修改內容嗎'),'修改前確認');const rr=await p.evaluate(async id=>(await DB.get('records',id)).reopened,id);ok(Array.isArray(rr)&&rr.length===1,'記下修改時間');ok(await p.locator('.cllock.reopen').count()===1,'顯示「修改中（曾完成過）」');ok(!(await p.evaluate(async id=>(await DB.get('records',id)).locked,id)),'已解除');
await p.fill('[data-f="location"]','3F 東側 C4 梁');await p.waitForTimeout(500);ok((await p.evaluate(async id=>(await DB.get('records',id)).location,id))==='3F 東側 C4 梁','解除後可修改並自動儲存');
if(SHOT){await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(200);await p.screenshot({path:SHOT+'/修改中_手機上方.png'});}
await p.click('#lockBtn');await p.waitForSelector('.cllock:not(.reopen)');ok((await p.locator('.cllock').textContent()).includes('完成後曾修改'),'完成後顯示曾修改紀錄');
await p.setViewportSize({width:320,height:700});await p.waitForTimeout(300);
ok(await p.evaluate(()=>document.documentElement.scrollWidth)<=320,'320px 無橫向捲動（鎖定頁）');
if(SHOT){await p.evaluate(()=>scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(200);await p.screenshot({path:SHOT+'/鎖定_320.png'});
 await p.setViewportSize({width:1280,height:900});await p.goto(U+'#/checklist/'+id);await p.waitForSelector('.cllock');await p.waitForTimeout(300);await p.screenshot({path:SHOT+'/鎖定_電腦版.png'});}
await p.goto(U+'#/checklist/'+id+'/preview');await p.waitForSelector('.paper');ok((await p.locator('.paper').textContent()).includes('C4'),'預覽照常');
console.log('JS錯誤',errs);await b.close();})();
