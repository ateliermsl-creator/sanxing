// calc_sign：計算書簽名（混凝土方數＋九種結構計算書）：簽名存放、印在計算書含日期、改了內容舊簽名不印、清理器、窄螢幕。見 tests/README.md
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();let bad=0;
const chk=(name,ok,info='')=>{if(!ok)bad++;console.log(ok?'OK':'NG',name,info)};
const out=require('path').join(__dirname,'out');require('fs').mkdirSync(out,{recursive:true});
for(const [w,h,tag] of [[390,844,'phone'],[320,568,'phone320']]){
const p=await (await b.newContext({viewport:{width:w,height:h},hasTouch:true})).newPage();await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
await p.goto(U);await p.waitForTimeout(500);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'甲工程',company:'順風營造'});
 const rows=[{name:'C1',type:'rect',a:'0.6',b:'0.6',c:'3.2',d:'',e:'',v:'',n:'4',op:[]}];
 await DB.put('vols',{id:'vl1',siteId:'s1',name:'3F 柱',rows,cfg:{loss:'5',cap:'6',loc:'3F',who:'王'},created:1,updated:1});
 localStorage.setItem('calcRows',JSON.stringify(rows));localStorage.setItem('calcCfg',JSON.stringify({loss:'5',cap:'6',loc:'3F',who:'王',cur:'vl1',title:'3F 柱'}));
 localStorage.setItem('siteId','s1');localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString())});
const sign=async(k)=>{await p.click(`[data-csg="${k}"]`);await p.waitForSelector('.sapad canvas');const c=await p.locator('.sapad canvas').boundingBox();
 await p.mouse.move(c.x+30,c.y+40);await p.mouse.down();await p.mouse.move(c.x+c.width*.6,c.y+c.height*.5,{steps:8});await p.mouse.up();await p.click('.sapadbar [data-k="ok"]');await p.waitForTimeout(600)};
const st=()=>p.evaluate(()=>({imgs:document.querySelectorAll('.paper .psigs img').length,sig:document.querySelector('.paper .psigs').innerText.replace(/\n/g,' '),old:!!document.querySelector('.csgold'),btn:[...document.querySelectorAll('[data-csg]')].map(x=>x.textContent).join('|'),wide:document.documentElement.scrollWidth}));
// 混凝土方數
await p.goto(U+'#/calc/vol/sheet');await p.reload();await p.waitForTimeout(700);
let r=await st();chk(tag+' 方數未簽',r.imgs===0&&r.btn.includes('計算人員簽名')&&r.wide<=w,JSON.stringify(r));
await sign('calc');await sign('boss');r=await st();
const day=await p.evaluate(()=>today());
chk(tag+' 方數簽名印出含日期',r.imgs===2&&r.sig.includes('計算人員：王　'+day)&&r.sig.includes('工地主任　'+day)&&r.btn.includes('重簽')&&r.wide<=w,JSON.stringify(r));
let db=await p.evaluate(async()=>{const x=await DB.get('vols','vl1');return Object.keys(x.cfg.sigs||{}).join(',')});
chk(tag+' 方數簽名存進該筆紀錄',db==='calc,boss',db);
await p.screenshot({path:`${out}/calc_sign_vol_${tag}.png`,fullPage:true});
await p.emulateMedia({media:'print'});chk(tag+' 列印不顯示簽名按鈕',await p.evaluate(()=>getComputedStyle(document.querySelector('.csgbar')).display==='none'));await p.emulateMedia({media:'screen'});
// 回計算機改標題（自動存回）→ 簽名仍在紀錄裡；但計算書名稱變了 → 舊簽名不印
await p.goto(U+'#/calc/vol');await p.waitForTimeout(700);await p.fill('#vTitle','3F 柱（改）');await p.waitForTimeout(900);
db=await p.evaluate(async()=>{const x=await DB.get('vols','vl1');return x.name+'/'+Object.keys(x.cfg.sigs||{}).join(',')});
chk(tag+' 自動存回保留簽名',db==='3F 柱（改）/calc,boss',db);
await p.goto(U+'#/calc/vol/sheet');await p.waitForTimeout(700);r=await st();
chk(tag+' 改了內容舊簽名不印並提醒',r.imgs===0&&r.old,JSON.stringify(r));
await p.goto(U+'#/calc/vol');await p.waitForTimeout(700);await p.fill('#vTitle','3F 柱');await p.waitForTimeout(900);
await p.goto(U+'#/calc/vol/sheet');await p.waitForTimeout(700);r=await st();
chk(tag+' 改回原內容簽名恢復',r.imgs===2&&!r.old,JSON.stringify(r));
// 清理器（匯入備份）
const cl=await p.evaluate(()=>{const x=CLEAN.vols({id:'a',siteId:'s1',name:'',rows:[],cfg:{sigs:{calc:{img:'data:image/png;base64,AAAA',at:'2026-11-21T00:00:00Z',fp:'abc'},boss:{img:'javascript:alert(1)'},evil:{img:'data:image/png;base64,AAAA'}}}});const y=CLEAN.vols({id:'b',siteId:'s1',cfg:{}});return {a:x.cfg.sigs,b:'sigs' in y.cfg}});
chk(tag+' 清理器',cl.a&&cl.a.calc&&cl.a.calc.fp==='abc'&&!cl.a.boss&&!cl.a.evil&&cl.b===false,JSON.stringify(cl));
// 九種結構計算書
for(const t of ['col','wall','slab','beam','scaf','brk','row','anc','sec']){
 await p.goto(U+`#/struct/${t}/sheet`);await p.waitForTimeout(600);
 await sign('calc');r=await st();
 const ls=await p.evaluate(t=>Object.keys(JSON.parse(localStorage.getItem('calcSigs')||'{}')[t]||{}).join(','),t);
 chk(`${tag} ${t} 計算書簽名`,r.imgs===1&&r.sig.includes(day)&&ls==='calc'&&r.wide<=w,JSON.stringify(r)+ls);
}
await p.screenshot({path:`${out}/calc_sign_sec_${tag}.png`,fullPage:true});
// 柱模改輸入 → 舊簽名不印
await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('calcColForm2')||'{}');s.info=s.info||{};s.info.loc='5F 改';localStorage.setItem('calcColForm2',JSON.stringify(s))});
await p.goto(U+'#/struct/col/sheet');await p.waitForTimeout(600);r=await st();
chk(tag+' 柱模改輸入舊簽名不印',r.imgs===0&&r.old,JSON.stringify(r));
chk(tag+' 沒有錯誤',!e.length,e.join(' | '));
}
await b.close();console.log(bad?`有 ${bad} 項 NG`:'全部 OK');process.exit(bad?1:0)})();
