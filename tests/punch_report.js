// punch_report：缺失改善通知單有沒有產出資料（全部結案、只拍照的缺失、切換專案）見 tests/README.md
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();let bad=0;
const chk=(name,ok,info='')=>{if(!ok)bad++;console.log(ok?'OK':'NG',name,info)};
for(const [w,h,tag] of [[390,844,'phone'],[320,568,'phone320']]){
const p=await (await b.newContext({viewport:{width:w,height:h},hasTouch:true})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept('王'));
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(500);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'甲工程'});await DB.put('sites',{id:'s2',name:'乙工程'});
 await DB.put('punch',{id:'other',siteId:'s2',no:'X-1',location:'乙棟',desc:'乙的缺失',trade:'',status:'open',log:[],thumb:'',created:1,updated:1});
 localStorage.setItem('siteId','s1');localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString())});
await p.goto('http://localhost:8793/index.html#/punch');await p.reload();await p.waitForTimeout(600);
// 用畫面登記一筆
await p.click('#pAdd');await p.waitForTimeout(600);
await p.fill('[data-f="location"]','3F 北側');await p.fill('[data-f="desc"]','蜂窩');await p.fill('[data-f="trade"]','泥作工');
await p.click('#pDone');await p.waitForTimeout(600);
const rep=()=>p.evaluate(()=>({rows:[...document.querySelectorAll('#rPaper tr')].length-document.querySelectorAll('#rPaper .paper').length,text:document.querySelector('#rPaper').innerText,auto:!!document.querySelector('#rAuto'),closed:document.querySelector('[data-rs="closed"]').checked}));
await p.goto('http://localhost:8793/index.html#/punch/report');await p.waitForTimeout(700);
let r=await rep();chk(tag+' 剛登記有列出',r.rows===1&&r.text.includes('蜂窩')&&!r.text.includes('乙的缺失'),JSON.stringify(r));
// 回報改善、結案
const id=await p.evaluate(async()=>(await DB.all('punch')).find(x=>x.siteId==='s1').id);
await p.goto('http://localhost:8793/index.html#/punch/'+id);await p.waitForTimeout(600);
await p.click('details.pfix summary');await p.click('#pFix');await p.waitForTimeout(500);await p.click('#pPass');await p.waitForTimeout(500);
await p.goto('http://localhost:8793/index.html#/punch/report');await p.waitForTimeout(700);
r=await rep();chk(tag+' 全部結案自動列出',r.rows===1&&r.auto&&r.closed&&r.text.includes('已結案'),JSON.stringify(r));
await p.screenshot({path:require('path').join(__dirname,'out')+`/punch_report_closed_${tag}.png`,fullPage:true});
await p.uncheck('[data-rs="closed"]');await p.waitForTimeout(500);
r=await rep();chk(tag+' 手動取消已結案',r.rows===0&&!r.auto&&!r.closed&&r.text.includes('沒有符合條件'),JSON.stringify(r));
// 只拍照、沒寫文字的缺失
await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=80;c.height=60;const d=c.toDataURL('image/jpeg');
 await DB.put('punch',{id:'ph',siteId:'s1',no:'P-1',location:'',desc:'',trade:'鋼筋工',status:'open',log:[],thumb:d,created:5,updated:5});
 await DB.put('photos',{id:'f1',recId:'ph',itemIdx:0,data:d,created:5})});
await p.goto('http://localhost:8793/index.html#/punch');await p.waitForTimeout(600);
chk(tag+' 只拍照的在列表',await p.evaluate(()=>DB.get('punch','ph').then(x=>!!x)));
await p.goto('http://localhost:8793/index.html#/punch/report');await p.waitForTimeout(700);
r=await rep();chk(tag+' 只拍照的在通知單',r.text.includes('P-1')&&r.text.includes('見照片'),JSON.stringify(r));
await p.goto('http://localhost:8793/index.html#/punch/summary');await p.waitForTimeout(700);
chk(tag+' 只拍照的在總表',(await p.textContent('.psum')).includes('P-1'));
// 切到乙工程
await p.selectOption('#siteSelect','s2');await p.goto('http://localhost:8793/index.html#/punch/report');await p.waitForTimeout(700);
r=await rep();chk(tag+' 切換專案',r.text.includes('乙的缺失')&&!r.text.includes('P-1'),JSON.stringify(r));
const hs=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth);chk(tag+' 無橫向捲動',!hs);
chk(tag+' JS 錯誤',!e.length,JSON.stringify(e));}
console.log(bad?`有 ${bad} 項不符`:'全部通過');await b.close();})();
