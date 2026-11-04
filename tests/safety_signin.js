// safety_signin：見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S+'pdfs',{recursive:true});require('fs').mkdirSync(S+'theme',{recursive:true});const fs=require('fs');
(async()=>{const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});const ctx=await b.newContext({viewport:{width:390,height:844},permissions:['camera']});const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForSelector('#setup[open]');await p.fill('#sName','宜蘭三星蔥新建工程');await p.fill('#sCompany','三星蔥營造有限公司');await p.click('#sOk');await p.waitForTimeout(500);
console.log('首頁順序:',(await p.$$eval('a.card b',x=>x.map(y=>y.textContent))).slice(0,3).join(' > '));
await p.goto('http://localhost:8793/index.html#/safety');await p.click('#saAdd');await p.waitForSelector('#saGrid canvas');
await p.fill('[data-f=place]','3F 樓板');await p.fill('[data-f=host]','王主任');await p.fill('[data-f=content]','柱鋼筋綁紮');
await p.click('[data-risk^="墜落"]');await p.click('[data-risk^="吊掛"]');await p.click('[data-haz="墜落、滾落"]');await p.click('[data-haz="感電"]');
const sign=async(i,name,co)=>{const cell=(await p.$$('.sacell'))[i];await (await cell.$('[data-n=name]')).fill(name);await (await cell.$('[data-n=co]')).fill(co);const c=await cell.$('canvas');await c.scrollIntoViewIfNeeded();const bb=await c.boundingBox();await p.mouse.move(bb.x+10,bb.y+20);await p.mouse.down();await p.mouse.move(bb.x+50,bb.y+50,{steps:5});await p.mouse.move(bb.x+80,bb.y+25,{steps:5});await p.mouse.up();};
await sign(0,'陳大明','鋼筋班');await sign(1,'林小華','模板班');await sign(2,'張三','水電');
await p.click('#saMore');console.log('格數',await p.$$eval('.sacell',x=>x.length));
const hc=await p.$('canvas[data-sig=host]');await hc.scrollIntoViewIfNeeded();const hb=await hc.boundingBox();await p.mouse.move(hb.x+20,hb.y+30);await p.mouse.down();await p.mouse.move(hb.x+120,hb.y+60,{steps:5});await p.mouse.up();
await p.click('#saCam');await p.waitForSelector('#cam:not([hidden])');await p.waitForTimeout(900);await p.click('#camShot');await p.waitForTimeout(500);await p.click('#camDone');await p.waitForTimeout(300);
await p.waitForTimeout(800);console.log('合照數',await p.$$eval('#saTh .th',x=>x.length));await p.screenshot({path:S+'s59a.png',fullPage:true});
await p.click('#saPrint');await p.waitForSelector('.paper');await p.waitForTimeout(600);
console.log('列印:',(await p.innerText('.paper')).replace(/\s+/g,' ').slice(0,420));console.log('簽名圖數',await p.$$eval('.paper .sgc img',x=>x.length),'合照頁',await p.$$eval('.gallery img',x=>x.length));await p.screenshot({path:S+'s59b.png',fullPage:true});
// 帶入上次名單
await p.goto('http://localhost:8793/index.html#/safety');await p.click('#saAdd');await p.waitForSelector('#saGrid canvas');await p.click('#saPrev');await p.waitForTimeout(300);
console.log('帶入名單',await p.$$eval('[data-n=name]',x=>x.map(y=>y.value).filter(Boolean).join(',')));console.log('錯誤',e);await b.close();})();
