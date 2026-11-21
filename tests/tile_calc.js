require('./uidlg');
// tile_calc：磁磚計算（原泥作材料）：多面累積、扣開口、多種磁磚、片數／箱數、存檔／開啟、計算書簽名、方數清單不混入、舊網址轉址、窄螢幕。見 tests/README.md
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();let bad=0;
const chk=(name,ok,info='')=>{if(!ok)bad++;console.log(ok?'OK':'NG',name,info)};
const out=require('path').join(__dirname,'out');require('fs').mkdirSync(out,{recursive:true});
const U='http://localhost:8793/index.html';
for(const [w,h,tag] of [[390,844,'phone'],[320,568,'phone320'],[1280,900,'desktop']]){
const ctx=await b.newContext({viewport:{width:w,height:h},hasTouch:true});const p=await ctx.newPage();await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto(U);await p.waitForTimeout(500);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'甲工程',company:'順風營造'});
 await DB.put('vols',{id:'vl1',siteId:'s1',name:'3F 柱',rows:[{name:'C1',type:'rect',a:'1',b:'1',c:'1',n:'1',op:[]}],cfg:{loss:'5',cap:'6'},created:1,updated:1});
 localStorage.setItem('siteId','s1');localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString())});
// 舊網址 #/calc/mas 轉到磁磚計算
await p.goto(U+'#/calc/mas');await p.reload();await p.waitForTimeout(700);
chk(tag+' 舊網址轉址',(await p.evaluate(()=>location.hash))==='#/calc/tile'&&!!(await p.$('#tlSpecs')));
const chips=await p.$$eval('#view .chips a.chip',x=>x.map(y=>y.textContent));chk(tag+' 分頁名稱',chips.includes('磁磚計算')&&!chips.includes('泥作材料'),chips.join(','));
// 規格 1：二丁掛 22.7×6、縫 5mm、損耗 5%、每箱 72 片
const S=(i,k,v)=>p.fill(`[data-si="${i}"] [data-sk="${k}"]`,v);
await S(0,'name','二丁掛');await p.click('[data-si="0"] [data-sz="0"]');await S(0,'j','5');await S(0,'loss','5');await S(0,'box','72');
await p.click('#tlSpecAdd');await S(1,'name','60×60 石英磚');await p.click('[data-si="1"] [data-sz="2"]');await S(1,'j','3');await S(1,'loss','3');
const R=(i,k,v)=>p.fill(`.vrow[data-i="${i}"] [data-k="${k}"]`,v);
await R(0,'name','北向立面');await R(0,'a','12');await R(0,'b','9');
await p.click('.vrow[data-i="0"] [data-opadd]');await p.fill('.vrow[data-i="0"] .vop[data-j="0"] [data-o="w"]','1.5');await p.fill('.vrow[data-i="0"] .vop[data-j="0"] [data-o="h"]','1.2');await p.fill('.vrow[data-i="0"] .vop[data-j="0"] [data-o="n"]','6');
await p.click('#tlAdd');await R(1,'name','山牆');await R(1,'v','8.5');await R(1,'n','2');
await p.click('#tlAdd');await R(2,'name','騎樓地坪');await R(2,'a','10');await R(2,'b','3');await p.selectOption('.vrow[data-i="2"] select[data-k="s"]','1');
// 期望：北 108−10.8=97.2；山牆 17 → 二丁掛 114.2 m²；每 m² = 1e4/(23.2×6.5)=66.3130；片數 ceil(114.2×66.313×1.05)=7952；箱 ceil(7952/72)=111
//       60×60 縫 3mm：1e4/(60.3²)=2.7502；30 m² ×1.03 → ceil(84.98)=85
const exp1=Math.ceil(114.2*1e4/(23.2*6.5)*1.05-1e-9),exp2=Math.ceil(30*1e4/(60.3*60.3)*1.03-1e-9);
await p.waitForTimeout(200);
const tbl=await p.$$eval('#tlOut table tr',x=>x.map(y=>y.innerText.replace(/\s+/g,' ')));
chk(tag+' 二丁掛合計',tbl.some(t=>t.includes('二丁掛')&&t.includes('114.2')&&t.includes(String(exp1))&&t.includes(String(Math.ceil(exp1/72)))),tbl.join(' / ')+' 期望 '+exp1);
chk(tag+' 石英磚合計',tbl.some(t=>t.includes('石英磚')&&t.includes(' 30 ')&&t.includes(String(exp2))),'期望 '+exp2);
const tot=(await p.innerText('#tlOut')).replace(/\s+/g,' ');chk(tag+' 總面積',tot.includes('144.2 m²'),tot.slice(0,200));
const ex=await p.innerText('[data-tx="0"]');chk(tag+' 計算式',ex.includes('12 × 9 − 開口（1.5×1.2×6）'),ex);
// 開口大於面積警告
await R(1,'v','');await R(1,'a','1');await R(1,'b','1');await p.click('.vrow[data-i="1"] [data-opadd]');await p.fill('.vrow[data-i="1"] .vop[data-j="0"] [data-o="w"]','2');await p.fill('.vrow[data-i="1"] .vop[data-j="0"] [data-o="h"]','2');
chk(tag+' 開口過大警告',(await p.innerText('[data-tx="1"]')).includes('開口面積大於'));
await p.click('.vrow[data-i="1"] [data-opdel="0"]');await R(1,'a','');await R(1,'b','');await R(1,'v','8.5');
// 黏著劑
await p.click('#tlGlue summary');await p.fill('#tlGlue [data-c="glue"]','4');await p.fill('#tlGlue [data-c="bag"]','25');
chk(tag+' 黏著劑',(await p.innerText('#tlOut')).includes('576.8 kg（24 包）'));
// 存檔
await p.fill('[data-c="who"]','王');await p.fill('#tlTitle','外牆磁磚');await p.click('#tlSave');await p.waitForTimeout(400);
let db=await p.evaluate(async()=>(await DB.all('vols')).filter(x=>x.kind==='tile'));
chk(tag+' 存進 vols kind=tile',db.length===1&&db[0].name==='外牆磁磚'&&db[0].rows.length===3&&db[0].cfg.specs.length===2,JSON.stringify(db.map(x=>x.name)));
// 清理器保留所有欄位
const cl=await p.evaluate(async()=>{const x=(await DB.all('vols')).find(x=>x.kind==='tile');const c=CLEAN.vols(JSON.parse(JSON.stringify(x)));const sk=o=>JSON.stringify(o,Object.keys(o).sort());return {same:JSON.stringify(c.rows)===JSON.stringify(x.rows)&&JSON.stringify(c.cfg.specs)===JSON.stringify(x.cfg.specs)&&c.kind==='tile'&&c.cfg.glue==='4'}});
chk(tag+' 清理器保留磁磚欄位',cl.same);
// 方數清單不混入磁磚紀錄
await p.goto(U+'#/calc/vol');await p.waitForTimeout(500);await p.click('#vOpen');await p.waitForTimeout(200);
const vl=await p.$$eval('#vList .vsrow b',x=>x.map(y=>y.textContent));chk(tag+' 方數清單只有方數',vl.length===1&&vl[0]==='3F 柱',vl.join(','));
// 新計算 → 開啟紀錄
await p.goto(U+'#/calc/tile');await p.waitForTimeout(500);await p.click('#tlNew');await p.waitForTimeout(300);
chk(tag+' 新計算沿用規格',(await p.inputValue('[data-si="1"] [data-sk="name"]'))==='60×60 石英磚'&&(await p.inputValue('.vrow[data-i="0"] [data-k="a"]'))==='');
await p.click('#tlOpen');await p.waitForTimeout(200);await p.click('#tlList [data-topen]');await p.waitForTimeout(500);
chk(tag+' 開啟紀錄',(await p.inputValue('.vrow[data-i="1"] [data-k="v"]'))==='8.5'&&(await p.innerText('#tlCurName'))==='外牆磁磚');
if(tag==='phone'||tag==='desktop')await p.screenshot({path:`${out}/tile_${tag}.png`,fullPage:true});
const wide=await p.evaluate(()=>document.documentElement.scrollWidth);chk(tag+' 不橫向捲動',wide<=w,String(wide));
// 計算書＋簽名
await p.goto(U+'#/calc/tile/sheet');await p.waitForTimeout(600);
const paper=(await p.innerText('.paper')).replace(/\s+/g,' ');
chk(tag+' 計算書內容',paper.includes('磁磚數量計算書')&&paper.includes('順風營造')&&paper.includes('甲工程')&&paper.includes('144.2')&&paper.includes(String(exp1))&&paper.includes('111 72 片／箱'),paper.slice(0,160));
await p.click('[data-csg="calc"]');await p.waitForSelector('.sapad canvas');const c=await p.locator('.sapad canvas').boundingBox();
await p.mouse.move(c.x+30,c.y+40);await p.mouse.down();await p.mouse.move(c.x+c.width*.6,c.y+c.height*.5,{steps:8});await p.mouse.up();await p.click('.sapadbar [data-k="ok"]');await p.waitForTimeout(600);
const si=await p.evaluate(()=>({imgs:document.querySelectorAll('.paper .psigs img').length,txt:document.querySelector('.paper .psigs').innerText}));
db=await p.evaluate(async()=>{const x=(await DB.all('vols')).find(x=>x.kind==='tile');return Object.keys(x.cfg.sigs||{}).join(',')});
const pw=await p.evaluate(()=>[...document.querySelectorAll('.paper table')].every(t=>t.getBoundingClientRect().right<=document.querySelector('.paper').getBoundingClientRect().right+1));chk(tag+' 計算書表格不超出紙張',pw);
chk(tag+' 簽名印出並存回紀錄',si.imgs===1&&si.txt.includes('計算人員：王')&&db==='calc',JSON.stringify(si)+' '+db);
if(tag==='phone')await p.screenshot({path:`${out}/tile_sheet_${tag}.png`,fullPage:true});
// 改內容後舊簽名不印
await p.goto(U+'#/calc/tile');await p.waitForTimeout(500);await R(1,'n','3');await p.waitForTimeout(600);
await p.goto(U+'#/calc/tile/sheet');await p.waitForTimeout(600);
chk(tag+' 改內容後舊簽名不印',(await p.$$('.paper .psigs img')).length===0&&!!(await p.$('.csgold')));
// 紅磚
await p.goto(U+'#/calc/tile');await p.waitForTimeout(400);await p.click('#tlBrick summary');await p.fill('#bA','10');
const bo=(await p.innerText('#bOut')).replace(/\s+/g,' ');chk(tag+' 紅磚',bo.includes('每 m² 約 59.5 塊')&&bo.includes('596 塊'),bo);
chk(tag+' 無 JS 錯誤',!e.length,e.join(' | '));await ctx.close();}
console.log(bad?`NG ${bad} 項`:'全部通過');await b.close();})();
