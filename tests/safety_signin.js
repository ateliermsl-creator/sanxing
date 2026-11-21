require('./uidlg');
// safety_signin：見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S+'pdfs',{recursive:true});require('fs').mkdirSync(S+'theme',{recursive:true});const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,permissions:['camera']});const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.click('#hWel');await p.waitForSelector('#setup[open]');await p.fill('#sName','宜蘭三星蔥新建工程');await p.fill('#sCompany','三星蔥營造有限公司');await p.click('#sOk');await p.waitForTimeout(500);
console.log('首頁順序:',(await p.$$eval('a.card b',x=>x.map(y=>y.textContent))).slice(0,3).join(' > '));
await p.goto('http://localhost:8793/index.html#/safety');await p.click('#saAdd');await p.waitForSelector('#saGrid .sasig');
await p.fill('[data-f=place]','3F 樓板');await p.fill('[data-f=host]','王主任');await p.fill('[data-f=content]','柱鋼筋綁紮');
await p.click('[data-risk^="墜落"]');console.log('勾墜落後自動勾',await p.$$eval('[data-haz]:checked',x=>x.map(y=>y.dataset.haz.slice(0,6)).join('、')),'|',await p.innerText('#saAuto'));
await p.click('[data-risk^="吊掛"]');console.log('再勾吊掛後危害告知勾數',await p.$$eval('[data-haz]:checked',x=>x.length));
await p.click('[data-haz="感電"]');await p.click('[data-risk^="吊掛"]');console.log('取消吊掛後勾數（只加不減）',await p.$$eval('[data-haz]:checked',x=>x.length));await p.click('[data-risk^="吊掛"]');
const sign=async(i,name,co)=>{const cell=(await p.$$('.sacell'))[i];await (await cell.$('[data-n=name]')).fill(name);await (await cell.$('[data-n=co]')).fill(co);await (await cell.$('.sasig')).click();await padDraw();await p.click('.sapad [data-k=ok]');await p.waitForTimeout(150);};
const padDraw=async()=>{await p.waitForSelector('.sapad canvas');const bb=await (await p.$('.sapad canvas')).boundingBox();await p.mouse.move(bb.x+30,bb.y+bb.height*.6);await p.mouse.down();await p.mouse.move(bb.x+150,bb.y+bb.height*.3,{steps:6});await p.mouse.move(bb.x+260,bb.y+bb.height*.65,{steps:6});await p.mouse.up();};
// 防誤觸：清單上沒有可畫的畫布；在簽名格上拖曳（模擬捲動）不會產生簽名
console.log('清單上的畫布數',await p.$$eval('#saGrid canvas',x=>x.length));
{const sb=await p.$('.sacell .sasig');await sb.scrollIntoViewIfNeeded();const bb=await sb.boundingBox();const y0=await p.evaluate(()=>scrollY);const cdp=await ctx.newCDPSession(p);
const tx=Math.round(bb.x+bb.width/2),ty=Math.round(bb.y+bb.height/2);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx+i*3,y:ty-i*20}]});await p.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400);
console.log('手指在簽名格上捲動：頁面捲動',(await p.evaluate(()=>scrollY))-y0,'px，開簽名框',!!(await p.$('.sapad')),'已簽',await p.$$eval('.sasig.on',x=>x.length));}
// 取消：畫了但按取消不存
{await p.click('.sacell .sasig');await padDraw();await p.click('.sapad [data-k=cancel]');await p.waitForTimeout(150);console.log('取消後已簽',await p.$$eval('.sasig.on',x=>x.length),'視窗關閉',!(await p.$('.sapad')));}
// 返回鍵＝取消
{await p.click('.sacell .sasig');await padDraw();await p.goBack();await p.waitForTimeout(300);console.log('返回鍵後已簽',await p.$$eval('.sasig.on',x=>x.length),'視窗關閉',!(await p.$('.sapad')),'仍在本頁',/#\/safety\/./.test(p.url()));}
await sign(0,'陳大明','鋼筋班');await sign(1,'林小華','模板班');await sign(2,'張三','水電');
console.log('簽後已簽格',await p.$$eval('.sasig.on img',x=>x.length));
// 已簽者重簽要先確認（拒絕就不開框）
{p.removeAllListeners('dialog');let msg='';p.once('dialog',d=>{msg=d.message();d.dismiss();});await p.click('.sacell .sasig.on');await p.waitForTimeout(200);console.log('重簽詢問:',msg,'｜拒絕後開框',!!(await p.$('.sapad')));p.on('dialog',d=>d.accept());}
await p.click('#saMore');console.log('按加 1 人後格數',await p.$$eval('.sacell',x=>x.length));
{const cs=await p.$$('.sacell');await (await cs[cs.length-1].$('[data-n=name]')).fill('最後一格');await p.waitForTimeout(100);console.log('最後一格填名字後格數',await p.$$eval('.sacell',x=>x.length),'編號',await p.$$eval('[data-no]',x=>x.map(y=>y.textContent).slice(-2).join(',')));}
await p.fill('#saHostName','李主任');console.log('主持人姓名同步到上方',await p.inputValue('[data-f=host]'));await p.fill('[data-f=host]','王主任');console.log('上方同步到簽名旁',await p.inputValue('#saHostName'));
await p.click('#saHostSig');await padDraw();await p.screenshot({path:S+'s59pad.png'});await p.click('.sapad [data-k=ok]');await p.waitForTimeout(150);console.log('主持人已簽',await p.$$eval('#saHostSig img',x=>x.length));
await p.click('#saCam');await p.waitForSelector('#cam:not([hidden])');await p.waitForTimeout(900);await p.click('#camShot');await p.waitForTimeout(500);await p.click('#camDone');await p.waitForTimeout(300);
await p.waitForTimeout(800);console.log('合照數',await p.$$eval('#saTh .th',x=>x.length));await p.screenshot({path:S+'s59a.png',fullPage:true});
await p.click('#saPrint');await p.waitForSelector('.paper');await p.waitForTimeout(600);
console.log('列印:',(await p.innerText('.paper')).replace(/\s+/g,' ').slice(0,420));console.log('簽名圖數',await p.$$eval('.paper .sgc img',x=>x.length),'主持人簽名圖',await p.$$eval('.paper .psigs img',x=>x.length),'合照頁',await p.$$eval('.gallery img',x=>x.length));await p.screenshot({path:S+'s59b.png',fullPage:true});
// 帶入上次名單
await p.goto('http://localhost:8793/index.html#/safety');await p.click('#saAdd');await p.waitForSelector('#saGrid .sasig');await p.click('#saPrev');await p.waitForTimeout(300);
console.log('帶入名單',await p.$$eval('[data-n=name]',x=>x.map(y=>y.value).filter(Boolean).join(',')));console.log('錯誤',e);await b.close();})();
