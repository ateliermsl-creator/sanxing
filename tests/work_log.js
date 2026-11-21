require('./uidlg');
// work_log：見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S+'pdfs',{recursive:true});require('fs').mkdirSync(S+'theme',{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push(x.stack.split('\n').slice(0,2).join('|')));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.click('#hWel');await p.waitForSelector('#setup[open]');await p.fill('#sName','宜蘭三星蔥新建工程');await p.fill('#sCompany','三星蔥營造有限公司');await p.click('#sOk');await p.waitForTimeout(400);
const iso=n=>{const d=new Date();d.setDate(d.getDate()-n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const td=iso(0);
await p.evaluate(async td=>{const sid=localStorage.getItem('siteId');
 await DB.put('matrecs',{id:'m1',siteId:sid,date:td,time:'09:00',catId:'x',catName:'竹節鋼筋',name:'D19',spec:'SD420W',qty:'5',unit:'噸',vendor:'甲',ticket:'',lot:'',location:'',docs:[],checks:[],disp:'accept',note:'',names:{},sigs:{},created:1,updated:1});
 await DB.put('pours',{id:'j1',siteId:sid,date:td,floor:'3F',part:'頂版',supplier:'大發',fc:'280',slumpMin:'',slumpMax:'',clMax:'',limitMin:'',created:1,updated:1,trucks:[{id:'t1',plate:'A',ticket:'',leave:'',arrive:'',volume:'6',slump:'15',chloride:'0.1',temp:'',sampled:true,specimen:'A1~A3',disp:'use',note:'',names:{},sigs:{},created:1}]});
 await DB.put('safety',{id:'sa1',siteId:sid,date:td,time:'07:30',place:'',host:'',content:'',risks:[],hazards:[],extra:'',hostSig:'',people:[{id:'p1',name:'甲',co:'',sig:'data:image/png;base64,AAAA'}],created:1,updated:1});},td);
await p.goto('http://localhost:8793/index.html#/log');await p.click('#lgAdd');await p.waitForSelector('#lgSaved');
await p.fill('[data-f=wxAm]','晴');await p.fill('[data-f=wxPm]','陣雨');await p.fill('[data-f=approved]','600');await p.fill('[data-f=start]',iso(9));await p.fill('[data-f=planPct]','12.5');await p.fill('[data-f=actualPct]','11');
console.log('工期:',(await p.innerText('#lgDur')).replace(/\s+/g,' '));
await p.fill('#lg_items [data-k=name]','3F 柱鋼筋綁紮');await p.fill('#lg_items [data-k=unit]','噸');await p.fill('#lg_items [data-k=contract]','120');await p.fill('#lg_items [data-k=today]','5');await p.fill('#lg_items [data-k=prev]','30');
await p.click('#lgMat');await p.click('#lgSamp');await p.click('#lgImp').catch(()=>{});
await p.fill('#lg_labor [data-k=name]','鋼筋工');await p.fill('#lg_labor [data-k=today]','8');await p.fill('#lg_labor [data-k=prev]','40');await p.fill('#lg_machines [data-k=name]','吊車');await p.fill('#lg_machines [data-k=today]','1');
await p.check('input[name=tech][value=yes]');await p.click('[data-add=techRows]');await p.fill('#lg_techRows [data-k=kind]','鋼筋綁紮');await p.fill('#lg_techRows [data-k=name]','王大明');
const c=await p.$('canvas[data-sig=boss]');await c.scrollIntoViewIfNeeded();const bb=await c.boundingBox();await p.mouse.move(bb.x+20,bb.y+30);await p.mouse.down();await p.mouse.move(bb.x+120,bb.y+60,{steps:5});await p.mouse.up();
console.log('勤前教育提示:',await p.innerText('#lgPreHint'),'| 前累計 chip:',await p.innerText('#lg_items .lgcum'));
await p.screenshot({path:S+'s66a.png',fullPage:true});await p.waitForTimeout(500);
await p.click('#lgPrint');await p.waitForSelector('.lgpaper');await p.waitForTimeout(500);console.log('列印:',(await p.innerText('.lgpaper')).replace(/\s+/g,' ').slice(0,900));await p.screenshot({path:S+'s66b.png',fullPage:true});
// 隔天新增：帶入上一張
await p.evaluate(async()=>{const l=(await DB.all('logs'))[0];l.date='2020-01-01';await DB.put('logs',l);});
await p.goto('http://localhost:8793/index.html#/log');await p.click('#lgAdd');await p.waitForSelector('#lgSaved');console.log('新日誌帶入: 工期',await p.inputValue('[data-f=approved]'),'項目',await p.inputValue('#lg_items [data-k=name]'),'前累計',await p.inputValue('#lg_items [data-k=prev]'),'人數前累計',await p.inputValue('#lg_labor [data-k=prev]'));
console.log('錯誤',e);await b.close();})();
