require('./uidlg');
// punch_marks：缺失照片標記（圖釘＋編號＋說明）見 tests/README.md
const {chromium}=require('playwright');const O=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(O,{recursive:true});(async()=>{const b=await chromium.launch();let bad=0;
const chk=(name,ok,info='')=>{if(!ok)bad++;console.log(ok?'OK':'NG',name,info)};
for(const [w,h,tag] of [[390,844,'phone'],[320,568,'phone320'],[1440,900,'desktop']]){
const p=await (await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,hasTouch:w<768})).newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(500);
await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const g=c.getContext('2d');g.fillStyle='#8a9';g.fillRect(0,0,800,600);g.fillStyle='#555';g.fillRect(150,200,120,80);
 await DB.put('sites',{id:'s1',name:'三星蔥工廠新建工程'});await DB.put('punch',{id:'pu1',siteId:'s1',no:'D-001',location:'3F 北側牆',desc:'牆面蜂窩',trade:'泥作工',status:'open',log:[],thumb:'',created:Date.now(),updated:Date.now()});
 await DB.put('photos',{id:'ph1',recId:'pu1',itemIdx:0,data:c.toDataURL('image/jpeg',0.8),created:1});await DB.put('photos',{id:'ph2',recId:'pu1',itemIdx:0,data:c.toDataURL('image/jpeg',0.8),created:2});
 localStorage.setItem('siteId','s1');localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString())});
await p.goto('http://localhost:8793/index.html#/punch/pu1');await p.reload();await p.waitForTimeout(700);
chk(tag+' 提示顯示',await p.isVisible('#pMarkHint'));
await p.click('[data-pmark="ph1"]');await p.waitForSelector('.pmk');
const box=await p.locator('.pmk-box img').boundingBox();
const tap=async(fx,fy)=>{await p.mouse.click(box.x+box.width*fx,box.y+box.height*fy);await p.waitForTimeout(80)};
await tap(.25,.4);await tap(.7,.6);await tap(.5,.9);
chk(tag+' 放三個圖釘',(await p.locator('.pmk-pins .pmpin').count())===3);
await p.fill('[data-mt="0"]','蜂窩');await p.fill('[data-mt="1"]','露筋');
// 拖曳 2 號到中間
const p2=await p.locator('.pmk-pins .pmpin[data-i="1"]').boundingBox();
await p.mouse.move(p2.x+p2.width/2,p2.y+p2.height/2);await p.mouse.down();await p.mouse.move(box.x+box.width*.5,box.y+box.height*.5,{steps:6});await p.mouse.up();await p.waitForTimeout(100);
chk(tag+' 拖曳不新增',(await p.locator('.pmk-pins .pmpin').count())===3);
await p.click('[data-md="2"]');
const hs=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.querySelector('.pmk').scrollWidth>innerWidth);
chk(tag+' 無橫向捲動',!hs);
await p.screenshot({path:O+`punch_marks_editor_${tag}.png`});
await p.click('.pmk-ok');await p.waitForTimeout(400);
chk(tag+' 關閉',!(await p.$('.pmk')));
// 第二張照片：編號從 3 開始
await p.click('[data-pmark="ph2"]');await p.waitForSelector('.pmk');const b2=await p.locator('.pmk-box img').boundingBox();
await p.mouse.click(b2.x+b2.width*.6,b2.y+b2.height*.3);await p.waitForTimeout(80);
chk(tag+' 第二張編號接續',(await p.textContent('.pmk-pins .pmpin'))==='3');
await p.fill('[data-mt="0"]','裂縫');await p.click('.pmk-ok');await p.waitForTimeout(400);
const it=await p.evaluate(()=>DB.get('punch','pu1'));
const m=it.marks?.ph1||[];
chk(tag+' 存檔',m.length===2&&m[0].t==='蜂窩'&&Math.abs(m[0].x-.25)<.02&&Math.abs(m[0].y-.4)<.02&&Math.abs(m[1].x-.5)<.03&&Math.abs(m[1].y-.5)<.03&&it.marks.ph2?.[0]?.t==='裂縫',JSON.stringify(it.marks));
chk(tag+' 縮圖標籤',(await p.textContent('[data-pmark="ph1"]')).includes('1–2')&&(await p.textContent('[data-pmark="ph2"]')).includes('3'));
await p.screenshot({path:O+`punch_marks_form_${tag}.png`});
// 放大預覽
await p.click('.th img');await p.waitForTimeout(500);chk(tag+' 放大預覽',(await p.getAttribute('#lbImg','src')).startsWith('data:image/jpeg'));
await p.screenshot({path:O+`punch_marks_lightbox_${tag}.png`});await p.click('#lbClose');await p.waitForTimeout(200);
// 通知單
await p.goto('http://localhost:8793/index.html#/punch/report');await p.waitForTimeout(800);
const rep=await p.evaluate(()=>({pins:document.querySelectorAll('#rPaper .pmfig .pmpin').length,figs:document.querySelectorAll('#rPaper .pmfig').length,note:document.querySelector('#rPaper .pmnote')?.textContent||''}));
chk(tag+' 通知單',rep.pins===3&&rep.figs===2&&rep.note.includes('①蜂窩')&&rep.note.includes('②露筋')&&rep.note.includes('③裂縫'),JSON.stringify(rep));
if(tag==='phone')await p.locator('#rPaper').screenshot({path:O+`punch_marks_report.png`});
// 刪除照片時標記一起刪
await p.goto('http://localhost:8793/index.html#/punch/pu1');await p.waitForTimeout(600);await p.click('[data-pdel="ph2"]');await p.waitForTimeout(400);
const it2=await p.evaluate(()=>DB.get('punch','pu1'));chk(tag+' 刪照片清標記',!it2.marks.ph2&&it2.marks.ph1.length===2);
// 清理器：壞資料
const cl=await p.evaluate(()=>CLEAN.punch({id:'a',siteId:'s1',desc:'',location:'',marks:{ph1:[{x:2,y:-1,t:'<b>x</b>'},{x:'z'}],'bad id!':[{x:.1,y:.1}],ph3:'x',ph4:[]}}).marks);
chk(tag+' 清理器',JSON.stringify(cl)==='{"ph1":[{"x":1,"y":0,"t":"<b>x</b>"},{"x":0,"y":0,"t":""}]}',JSON.stringify(cl));
chk(tag+' JS 錯誤',!e.length,JSON.stringify(e));}
console.log(bad?`有 ${bad} 項不符`:'全部通過');await b.close();})();
