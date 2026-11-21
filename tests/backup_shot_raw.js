require('./uidlg');
// backup_shot_raw：見 tests/README.md
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const errs=[];
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>d.accept());return p};
const A=await mk();await A.goto('http://localhost:8793/index.html');await A.waitForTimeout(700);
await A.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'測試'});localStorage.setItem('siteId','s1');
 const mkimg=(c)=>{const k=document.createElement('canvas');k.width=1600;k.height=1200;const g=k.getContext('2d');for(let i=0;i<400;i++){g.fillStyle=`hsl(${(i*37)%360},70%,50%)`;g.fillRect((i*53)%1600,(i*91)%1200,200,150)}return k.toDataURL('image/jpeg',.8)};
 for(let i=0;i<3;i++){const d=mkimg(),r=mkimg();await DB.put('shots',{id:'p'+i,siteId:'s1',date:'2026-10-28',time:'10:00',item:'鋼筋',part:'3F',spec:'',vendor:'',note:'',data:d,raw:r,thumb:d.slice(0,2000)+'AAAA',created:i,updated:i});}});
await A.reload();await A.waitForTimeout(600);await A.goto('http://localhost:8793/index.html#/backup');await A.waitForSelector('#bkRaw');
console.log('提示:',(await A.innerText('#bkRawBox')).replace(/\s+/g,' ').slice(0,90));
const exp=async(raw)=>{if(raw)await A.check('#bkRaw');else await A.uncheck('#bkRaw');const [dl]=await Promise.all([A.waitForEvent('download'),A.click('#expBtn')]);const f=require('os').tmpdir()+'/b'+(raw?1:0)+'.json';fs.copyFileSync(await dl.path(),f);return fs.statSync(f).size};
const s0=await exp(false),s1=await exp(true);console.log('備份大小 不含原圖',Math.round(s0/1024)+'KB','含原圖',Math.round(s1/1024)+'KB');
const B=await mk();await B.goto('http://localhost:8793/index.html#/backup');await B.waitForSelector('#impFile',{state:'attached'});await B.setInputFiles('#impFile',require('os').tmpdir()+'/b0.json');await B.waitForTimeout(2500);
const r=await B.evaluate(async()=>(await DB.all('shots')).map(x=>({raw:!!x.raw,thumb:!!x.thumb&&x.thumb.startsWith('data:image/jpeg')&&x.thumb.length>500})));console.log('匯入(不含原圖):',JSON.stringify(r[0]),r.length);
await B.goto('http://localhost:8793/index.html#/shot/p0');await B.waitForSelector('#sdImg');console.log('詳情頁提示:',(await B.innerText('#view')).includes('沒有保留原始照片'),'更新鈕可見',await B.isVisible('#sdUpd'));
const C=await mk();await C.goto('http://localhost:8793/index.html#/backup');await C.waitForSelector('#impFile',{state:'attached'});await C.setInputFiles('#impFile',require('os').tmpdir()+'/b1.json');await C.waitForTimeout(2500);
console.log('匯入(含原圖) raw:',(await C.evaluate(async()=>(await DB.all('shots')).every(x=>!!x.raw))),'錯誤',errs);await b.close();})();
