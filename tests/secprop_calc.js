// secprop_calc：斷面性質（多邊形斷面、孔洞、常用斷面產生器、帶入材料庫、計算書）見 tests/README.md
const {chromium}=require('playwright');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S,{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
const G=p.goto.bind(p);p.goto=async u=>{const r=await G(u);await p.waitForTimeout(150);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));return r;};
const t=async s=>(await p.innerText(s)).replace(/\s+/g,' ');
const res=async()=>(await p.$$eval('#spRes .big b, #spRes .secres td:nth-child(2)',x=>x.map(y=>y.innerText.replace(/\s+/g,' ')))).join(' | ');
const set=async(outer,holes=[])=>{await p.evaluate(([o,h])=>{const s=JSON.parse(localStorage.getItem('calcSecForm')||'{}');s.outer=o;s.holes=h;s.unit='mm';s.sig='8';localStorage.setItem('calcSecForm',JSON.stringify(s));},[outer,holes]);await p.goto(U+'#/calc/vol');await p.goto(U+'#/calc/sec');await p.waitForSelector('#spRes');};
await p.goto(U+'#/calc/sec');await p.waitForSelector('#spRes');
console.log('預設（中空矩形 200×120×20）:',await res());
console.log('摘要列:',await p.evaluate(()=>{const b=document.getElementById('calcBar');return (b.hidden?'[hidden] ':'['+b.className+'] ')+b.innerText.replace(/\s+/g,' ')}));
// 參考網站範例座標
await set('0, 80\n120, 0\n0, 0');console.log('三角形（順時針輸入）:',await res());
await set('0, 0\n120, 0\n120, 20\n30, 20\n30, 100\n0, 100');console.log('L 型:',await res());
await set('-120, -80\n140, -80\n160, 40\n80, 110\n-120, 100',['-85, -40\n-85, 40\n-30, 40\n-30, -40','20, -30\n100, -20\n75, 55\n10, 35']);console.log('多孔洞:',await res());
await p.screenshot({path:S+'secprop_holes.png',fullPage:true});
// 產生器：H300×200×10×15、C200×75×6×9
const gen=async(k,d)=>{await p.selectOption('#spShape',k);await p.waitForSelector('[data-d]');for(const [a,v] of Object.entries(d))await p.fill(`[data-d="${a}"]`,v);await p.click('#spGen');await p.waitForTimeout(150);return res();};
console.log('產生 H:',await gen('H',{H:'300',B:'200',tw:'10',tf:'15'}));
console.log('產生 C:',await gen('C',{H:'200',B:'75',tw:'6',tf:'9'}));
console.log('產生 圓管 D48.6 t2.4（72 邊形）:',await gen('pipe',{D:'48.6',t:'2.4'}),'真實圓管 I',(Math.PI/64*(48.6**4-43.8**4)).toFixed(0),'A',(Math.PI/4*(48.6**2-43.8**2)).toFixed(1));
console.log('厚度太大:',await gen('box',{B:'50',H:'50',t:'30'}),await t('#spGenMsg'));
// 錯誤
await set('0, 0\n100, 100\n100, 0\n0, 100');console.log('自我交叉:',await t('#spRes .big'));
await set('0, 0\n100, 0\n100, 100',['50, 50\n150, 50\n150, 60']);console.log('孔洞超出:',await t('#spRes .big'));
await set('0, 0\n100, 0\nabc');console.log('格式錯:',await t('#spRes .big'));
await set('0, 0\n100, 0\n100, 100\n0, 100',['10, 10\n60, 10\n60, 60\n10, 60','40, 40\n90, 40\n90, 90\n40, 90']);console.log('孔洞重疊:',await t('#spRes .big'));
// 帶入材料庫：□50×50×2.3（mm）→ cm
await p.evaluate(()=>localStorage.removeItem('calcColLib'));
await set('0, 0\n100, 0\n100, 50\n0, 50');
console.log('換算 cm:',await t('#spRes .cnote:nth-last-of-type(3)'));
await gen('box',{B:'50',H:'50',t:'2.3'});await p.fill('#spName','測試方管');await p.click('#spLib');console.log('存入:',await t('#spLibMsg'));
console.log('材料庫:',await p.evaluate(()=>localStorage.getItem('calcColLib')));
await p.selectOption('#spRes [data-p="axis"]','y');
// 柱模板自訂卡片一鍵帶入
await p.goto(U+'#/calc/col');await p.waitForSelector('.cflibbox');await p.evaluate(()=>document.querySelector('.cflibbox').open=true);
console.log('柱模板下拉含:',await p.$$eval('select[data-kind="beam"] option',o=>o.map(x=>x.textContent).filter(x=>/測試/.test(x)).join(',')));
await p.click('[data-ladd="beam"]');const id=await p.evaluate(()=>[...document.querySelectorAll('[data-card]')].pop().dataset.card);
await p.selectOption(`[data-l="${id}"][data-lk="sect"]`,'custom');await p.evaluate(()=>document.querySelector('.cflibbox').open=true);
await p.click(`[data-card="${id}"] [data-lsec]`);console.log('帶入按鈕:',await t(`[data-card="${id}"] [data-lsec]`));
console.log('卡片值:',await p.$$eval(`[data-card="${id}"] input`,x=>x.map(y=>y.dataset.lk+'='+y.value).join(' ')));
console.log('已存:',await p.evaluate(id=>JSON.parse(localStorage.getItem('calcColLib')).find(x=>x.id===id),id));
await p.goto(U+'#/calc/sec/sheet');await p.waitForSelector('.paper');await p.waitForTimeout(300);await p.screenshot({path:S+'secprop_sheet.png',fullPage:true});
console.log('計算書:',(await t('.paper')).slice(0,300));
await p.goto(U+'#/calc/sec');await p.waitForSelector('#spRes');await p.screenshot({path:S+'secprop_phone.png',fullPage:true});
for(const w of [360,320]){await p.setViewportSize({width:w,height:800});for(const h of ['sec','sec/sheet']){await p.goto(U+'#/calc/'+h);await p.waitForTimeout(250);console.log(w,h,'橫向捲動',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth)?'有':'無');}}
await p.setViewportSize({width:1440,height:900});await p.goto(U+'#/calc/sec');await p.waitForTimeout(300);await p.screenshot({path:S+'secprop_desktop.png'});
console.log('電腦版：結果在右欄',await p.evaluate(()=>getComputedStyle(document.getElementById('sp3')).gridColumnStart),'側欄',await p.evaluate(()=>getComputedStyle(document.getElementById('sideNav')).display!=='none'),'bar hidden',await p.evaluate(()=>document.getElementById('calcBar').hidden));
await p.setViewportSize({width:390,height:844});
// 壞資料
await p.evaluate(()=>localStorage.setItem('calcSecForm',JSON.stringify({info:{proj:'<img src=x onerror=window.xss=1>',no:'<b>x</b>'},unit:'<img>',sig:'99',outer:'<img src=x onerror=window.xss=1>, 1',holes:['"><img src=x onerror=window.xss=1>'],dims:{B:'<img>','__proto__':'1'},shape:'zz'})));
await p.goto(U+'#/calc/vol');await p.goto(U+'#/calc/sec');await p.waitForSelector('#spRes');console.log('壞資料:',await t('#spRes .big'),'img',await p.$$eval('#calcBox img',x=>x.length));
await p.goto(U+'#/calc/sec/sheet');await p.waitForSelector('.paper');console.log('壞資料計算書 img',await p.$$eval('.paper img, .paper b',x=>x.length),'xss',await p.evaluate(()=>window.xss));
console.log('errs',e);await b.close();})();
