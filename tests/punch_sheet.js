// punch_sheet：「回報已改善」浮出面板位置——手機貼底部；平板／電腦在畫面中央、整個面板看得到 見 tests/README.md
const {chromium}=require('playwright');const O=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(O,{recursive:true});(async()=>{const b=await chromium.launch();let bad=0;
for(const [w,h,tag] of [[1440,900,'desktop'],[1920,1000,'wide'],[1024,768,'tablet'],[390,844,'phone'],[320,568,'phone320']]){
const p=await (await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(500);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'三星蔥工廠新建工程'});await DB.put('punch',{id:'pu1',siteId:'s1',no:'D-001',location:'3F',desc:'蜂窩',trade:'泥作',status:'open',log:[],created:Date.now(),updated:Date.now()});localStorage.setItem('siteId','s1');localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString())});
await p.goto('http://localhost:8793/index.html#/punch');await p.reload();await p.waitForTimeout(700);
await p.locator('button:has-text("回報改善")').first().click();await p.waitForTimeout(400);
const r=await p.evaluate(()=>{const q=document.querySelector('.psheet-in').getBoundingClientRect();const v=document.querySelector('#view').getBoundingClientRect();return {top:Math.round(q.top),bottom:Math.round(q.bottom),cx:Math.round(q.left+q.width/2),vcx:Math.round(v.left+v.width/2),vw:innerWidth,vh:innerHeight,hs:document.documentElement.scrollWidth>innerWidth}});
let ok;if(w>=768){ok=r.top>0&&r.bottom<r.vh&&Math.abs((r.top+r.bottom)/2-r.vh/2)<4&&Math.abs(r.cx-r.vcx)<4;}else{ok=r.bottom===r.vh&&!r.hs;}
if(!ok||e.length)bad++;console.log(tag,ok?'OK':'NG',JSON.stringify(r),'errs',e);
await p.screenshot({path:O+`punch_sheet_${tag}.png`});}
console.log(bad?`有 ${bad} 項不符`:'全部通過');await b.close();})();
