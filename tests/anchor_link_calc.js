require('./uidlg');
// anchor_link_calc：錨栓（受力分配、各破壞模式、計算書）與施工架→三角架→錨栓帶入 見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
const G=p.goto.bind(p);p.goto=async u=>{const r=await G(u);await p.waitForTimeout(150);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return r;};
const f=async(k,v)=>p.fill(`[data-p="${k}"]`,v);const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
const rows=async s=>(await p.$$eval(s+' tr',r=>r.map(x=>x.innerText.replace(/\s+/g,' ')))).join(' / ');
await p.goto(U+'#/calc/anc');await p.waitForSelector('[data-p="P"]');
console.log('係數換算:',await p.evaluate(()=>Object.entries(ANC_K).map(([k,v])=>k+' '+v.toFixed(3)).join('、')));
console.log('空白:',await t('#anRes .big'));
// 2×4、M12、hef 10、邊距 20、f'c 280、開裂、分類2、純拉 2000 → 每支 250；φNsa 2497.2；ANc 2520/900、Nb 3740.6、φNcbg 5760.6
await f('P','-2000');console.log('純拉:',await rows('#anChk'));
// 加彎矩 Mx 30000（+Y 受壓）→ 下排受拉較大
await f('Mx','30000');console.log('拉+彎矩 各支:',await rows('#anEach'));
await f('P','');await f('Mx','');await f('Vx','800');await f('Vy','-500');console.log('剪力:',await rows('#anChk'));
await f('cR','8');console.log('近邊 cR 8:',(await rows('#anChk')).split(' / ').filter(x=>x.includes('右側')).join());
await f('cR','20');
await p.selectOption('[data-p="type"]','cast');await f('P','-2000');await f('Vx','');await f('Vy','');console.log('預埋:',await rows('#anChk'));
await p.click('[data-c="uncr"]');console.log('預埋未開裂:',(await rows('#anChk')).split(' / ').slice(1,3).join(' / '));
await p.$$eval('details',d=>d.forEach(x=>x.open=true));await p.screenshot({path:S+'anchor_tab.png',fullPage:true});
await p.goto(U+'#/calc/anc/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);await p.screenshot({path:S+'anchor_sheet.png',fullPage:true});
// 連動：施工架 → 三角架 → 錨栓
await p.evaluate(()=>{localStorage.removeItem('calcBrkForm');localStorage.removeItem('calcAncForm');});
await p.goto(U+'#/calc/scaf');await p.waitForSelector('[data-p="levels"]');
for(const [k,v] of [['q','180'],['tie.sv','3.45'],['tie.sh','5.49'],['tie.d','1.2'],['wp','60'],['wn','80'],['ch','0.5']]) await f(k,v);
await p.click('#scToBk');await p.waitForSelector('[data-p="PD1"]');console.log('帶入三角架:',await p.inputValue('[data-p="PD1"]'),await p.inputValue('[data-p="PL2"]'),'|',await t('#bk1 .cnote'));
await p.click('[data-toanc="1"]');await p.waitForSelector('[data-p="P"]');
console.log('帶入錨栓:',['P','Vx','Vy','Mx','My','Mz'].map(k=>k),await p.$$eval('[data-p="P"],[data-p="Vx"],[data-p="Vy"],[data-p="Mx"],[data-p="My"],[data-p="Mz"]',x=>x.map(y=>y.value)),'|',await t('#an4 .cnote'));
console.log('反力對照:',await p.evaluate(()=>{const r=bkCalc(bkLoad());return r.sol.reac[1].map(x=>x.toFixed(2)).join(',');}));
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});for(const h of ['anc','anc/sheet']){await p.goto(U+'#/calc/'+h);await p.waitForTimeout(250);console.log(w,h,'橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}}
await p.evaluate(()=>localStorage.setItem('calcAncForm','{"type":"zz","nx":"<img src=x onerror=alert(1)>","src":"<img src=x onerror=alert(2)>","info":{"proj":"<b>x</b>"}}'));
await p.goto(U+'#/calc/anc');await p.waitForSelector('#anRes');console.log('壞資料:',await t('#anRes'),'img',await p.$$eval('#calcBox img',x=>x.length));
await p.goto(U+'#/calc/anc/sheet');await p.waitForSelector('.paper');console.log('壞資料計算書 img',await p.$$eval('.paper img, .paper b',x=>x.length));
console.log('錯誤',e);await b.close();})();
