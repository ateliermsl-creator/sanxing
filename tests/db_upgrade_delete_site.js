// db_upgrade_delete_site：見 tests/README.md
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();const errs=[];p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'舊資料工地':undefined));
// 先在同源下建立「舊版 v8」資料庫
await p.goto('http://localhost:8793/robots.txt').catch(()=>{});await p.goto('http://localhost:8793/manifest.json');
await p.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('avocado-toolbox',8);r.onupgradeneeded=()=>{for(const n of ['sites','records','templates','photos','workorders','punch','pours','matrecs','matcats','files'])r.result.createObjectStore(n,{keyPath:'id'});};
 r.onsuccess=()=>{const db=r.result,t=db.transaction(['sites','pours','matcats'],'readwrite');t.objectStore('sites').put({id:'s1',name:'舊資料工地'});t.objectStore('pours').put({id:'j1',siteId:'s1',date:'2026-10-20',floor:'2F',part:'樑板',supplier:'',fc:'280',created:1,updated:1,trucks:[{id:'t1',plate:'A',sampled:true,specimen:'A1',disp:'use',names:{},sigs:{}}]});t.objectStore('matcats').put({id:'c_def0',name:'鋼筋',checks:[],order:0,created:0,updated:0});t.oncomplete=()=>{db.close();res()};}}));
await p.evaluate(()=>localStorage.setItem('siteId','s1'));
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(1200);
const r=await p.evaluate(async()=>{const db=await dbp;return {ver:db.version,stores:[...db.objectStoreNames].sort().join(','),site:(await DB.all('sites')).map(s=>s.name).join(),pour:(await DB.all('pours')).length,sel:document.querySelector('#siteSelect').textContent.trim()}});
console.log(JSON.stringify(r));
for(const h of ['#/cure','#/shot','#/safety','#/log','#/pour/j1','#/material']){await p.goto('http://localhost:8793/index.html'+h);await p.waitForTimeout(500);}
console.log('舊資料升級後各頁錯誤:',errs);
// 刪除工地：建立各種資料後刪除，確認全部清空
await p.evaluate(async()=>{siteId='s1';await DB.put('shots',{id:'sh1',siteId:'s1',date:'2026-10-20',item:'x',data:'data:image/jpeg;base64,AA',raw:'',thumb:'',created:1,updated:1});await DB.put('safety',{id:'sf1',siteId:'s1',date:'2026-10-20',time:'07:00',people:[],risks:[],hazards:[],created:1,updated:1});await DB.put('logs',{id:'lg1',siteId:'s1',date:'2026-10-20',items:[],specials:[],mats:[],labor:[],machines:[],techRows:[],created:1,updated:1});
 await DB.put('photos',{id:'pp1',recId:'sf1',itemIdx:0,data:'data:image/jpeg;base64,AA',created:1});await DB.put('files',{id:'ff1',recId:'t1_7',name:'a.pdf',type:'application/pdf',size:1,blob:new Blob(['x']),created:1});await DB.put('files',{id:'ff2',recId:'lg1',name:'b.pdf',type:'application/pdf',size:1,blob:new Blob(['x']),created:1});});
await p.goto('http://localhost:8793/index.html#/punch');await p.waitForSelector('#setBtn');await p.click('#setBtn');await p.click('#sDel');await p.waitForTimeout(200);
await p.waitForTimeout(800);
const left=await p.evaluate(async()=>{const o={};for(const s of ['sites','pours','shots','safety','logs','photos','files'])o[s]=(await DB.all(s)).length;return o});console.log('刪除工地後剩餘:',JSON.stringify(left),errs.length);await b.close();})();
