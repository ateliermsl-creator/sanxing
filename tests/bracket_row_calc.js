require('./uidlg');
// bracket_row_calc：三角架（構架分析、檢核、計算書）與排架（載重、主柱）見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
const G=p.goto.bind(p);p.goto=async u=>{const r=await G(u);await p.waitForTimeout(150);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return r;};
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
const rows=async s=>(await p.$$eval(s+' tr',r=>r.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' / ');
await p.goto(U+'#/calc/brk');await p.waitForSelector('[data-p="X"]');
// 解算器自我驗證：懸臂梁 L=100、P=100、E=2e6、I=1 → 端點撓度 16.667、固定端彎矩 10000
console.log('懸臂驗證:',await p.evaluate(()=>{const g={segs:[{grp:'top',p1:[0,0],p2:[100,0]}],supports:[[0,0]],loads:[[100,0],[50,0]],X:100};const s=bkSolve(g,{top:{A:1,I:1}},2e6,0,[100,0]);return [s.tipDy.toFixed(3),s.reac[0].map(x=>x.toFixed(1)).join(',')];}));
// 兩端固定梁中央集中載重：M端 = PL/8
console.log('固端梁驗證:',await p.evaluate(()=>{const g={segs:[{grp:'top',p1:[0,0],p2:[100,0]}],supports:[[0,0],[100,0]],loads:[[50,0],[50,0]],X:100};const s=bkSolve(g,{top:{A:1,I:1}},2e6,0,[100,0]);return s.reac.map(r=>r.map(x=>x.toFixed(1)).join(',')).join(' | ');}));
console.log('空白:',await t('#bkRes'));
await f('PD1','60');await f('PD2','60');await f('PL1','100');await f('PL2','100');
console.log('型式1:',await rows('#bkChk'));
await p.$$eval('details',d=>d.forEach(x=>x.open=true));console.log('明細:',(await t('#bkRes details')).slice(0,700));
console.log('反力和:',await p.evaluate(()=>{const r=bkCalc(bkLoad());return (r.sol.reac.reduce((a,x)=>a+x[1],0)).toFixed(2)+' vs P+自重 '+(r.P[0]+r.P[1]+1.2*r.sol.els.reduce((a,e)=>a+e.sec.A*0.00785*e.L,0)).toFixed(2);}));
for(const ty of ['2','3','4','5']){await p.selectOption('[data-p="type"]',ty);await p.waitForTimeout(100);console.log('型式'+ty+':',(await rows('#bkChk')).replace(/ 控制組合/g,''));}
await p.selectOption('[data-p="sec.top.kind"]','chs');await f('sec.top.d','48.6');await f('sec.top.t','2.3');console.log('上弦圓管:',await t('[data-sec="top"]'));
await f('sec.top.t','20');console.log('t=20 Fy:',await p.inputValue('[data-p="fy"]'));await f('sec.top.t','2.3');
await f('x1','200');console.log('幾何錯誤:',await t('#bkRes'));await f('x1','40');
await p.$$eval('details',d=>d.forEach(x=>x.open=true));await p.screenshot({path:S+'bracket_tab.png',fullPage:true});
await p.goto(U+'#/calc/brk/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);await p.screenshot({path:S+'bracket_sheet.png',fullPage:true});
console.log('三角架計算書:',(await t('.paper')).slice(0,200));
// 排架
await p.goto(U+'#/calc/row');await p.waitForSelector('[data-p="levels"]');
console.log('排架預設:',await rows('#rfChk'),'||',await rows('#rfCombo'));
await p.$$eval('details',d=>d.forEach(x=>x.open=true));console.log('排架明細:',await t('#rfRes details'));
await f('slab','5');console.log('薄板 最小值:',await rows('#rfCombo'));await f('slab','20');
await p.selectOption('[data-p="eq"]','direct');await f('ch','0.6');console.log('排架地震:',await rows('#rfCombo'),'||',await rows('#rfChk'));
await p.screenshot({path:S+'row_tab.png',fullPage:true});
await p.goto(U+'#/calc/row/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);await p.screenshot({path:S+'row_sheet.png',fullPage:true});
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});for(const h of ['brk','brk/sheet','row','row/sheet']){await p.goto(U+'#/calc/'+h);await p.waitForTimeout(250);console.log(w,h,'橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}}
await p.evaluate(()=>{localStorage.setItem('calcBrkForm','{"type":"9","X":"<img src=x onerror=alert(1)>","sec":{"top":{"kind":"zz"}},"info":{"proj":"<b>x</b>"}}');localStorage.setItem('calcRowForm','{"levels":"<img src=x>","eq":"bad","info":{"proj":"<b>y</b>"}}');});
await p.goto(U+'#/calc/brk');await p.waitForSelector('#bkRes');console.log('三角架壞資料:',await t('#bkRes'),'img',await p.$$eval('#calcBox img',x=>x.length));
await p.goto(U+'#/calc/brk/sheet');await p.waitForSelector('.paper');console.log('壞資料計算書 img',await p.$$eval('.paper img, .paper b',x=>x.length));
await p.goto(U+'#/calc/row');await p.waitForSelector('#rfRes');console.log('排架壞資料:',await t('#rfRes'),'img',await p.$$eval('#calcBox img',x=>x.length));
console.log('錯誤',e);await b.close();})();
