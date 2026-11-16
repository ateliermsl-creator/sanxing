// checklist_flow：自主檢查表「紀錄列表 → 新增先選表 → 各份獨立存取」
// 1. 入口是已填紀錄列表（只列目前工程）；空白時有說明
// 2. 「＋ 新增檢查表」→ 選表頁 → 填這張 → 開新紀錄；返回回到列表（不是選表頁）
// 3. 什麼都沒填就離開的空白紀錄會清掉；剛輸入就按返回也不會被誤刪
// 4. 同一張表可填多份，各自獨立；「同一張表再填一份」沿用廠商、不沿用位置與結果
// 5. 篩選：狀態、表單／類別、搜尋；舊示範表紀錄仍列出可開
// 6. 320px 不橫向捲動
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const errs=[];p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>d.accept());
const ok=(c,m)=>console.log((c?'OK    ':'失敗  ')+m);const U='http://localhost:8793/index.html';
await p.goto(U);await p.waitForTimeout(800);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'甲工程'});await DB.put('sites',{id:'s2',name:'乙工程'});localStorage.setItem('siteId','s1');
  await DB.put('records',{id:'old1',siteId:'s1',templateId:'rebar',docNo:'',contractor:'',subcontractor:'',date:'2026-10-01',location:'B1',timing:{},items:{0:{r:'ng'}},sigs:{},updated:1});
  await DB.put('records',{id:'oth',siteId:'s2',templateId:'fm_beam',docNo:'',contractor:'',subcontractor:'',date:'2026-10-02',location:'乙棟',timing:{},items:{},sigs:{},updated:1});});
await p.reload();await p.waitForTimeout(600);await p.goto(U+'#/checklist');await p.waitForSelector('#clAdd');
const names=()=>p.$$eval('a.rec b',x=>x.map(e=>e.textContent));
ok((await names()).length===1,'只列目前工程的紀錄 '+(await names()));
ok((await names())[0].includes('鋼筋'),'舊示範表紀錄仍列出');
ok(await p.locator('a.rec .st').first().textContent()==='填寫中'&&(await p.locator('a.rec').first().textContent()).includes('有缺失 1 項'),'狀態與缺失數');
// 新增 → 選表
await p.click('#clAdd');await p.waitForSelector('[data-new]');ok(p.url().endsWith('#/checklist/new'),'進入選表頁');
await p.fill('#pkQ','梁');await p.waitForTimeout(100);const fl=await p.$$eval('[data-new]',x=>x.length);ok(fl>0&&fl<10,'搜尋表名 '+fl+' 張');
await p.fill('#pkQ','');await p.click('[data-new="fm_beam"]');await p.waitForSelector('.item');const id1=p.url().split('/').pop();
await p.click('#backBtn');await p.waitForSelector('#clAdd');ok(p.url().endsWith('#/checklist'),'表單返回直接回列表');
ok((await names()).length===1,'沒填就離開的空白紀錄已清掉');
// 再新增，輸入位置後立刻返回
await p.click('#clAdd');await p.waitForSelector('[data-new]');ok(await p.locator('text=最近用過').count()===0,'只有舊示範表紀錄時不顯示「最近用過」');
await p.click('[data-new="fm_beam"]');await p.waitForSelector('.item');
await p.fill('[data-f="location"]','3F 東側');await p.fill('[data-f="contractor"]','順風營造');await p.click('#backBtn');await p.waitForSelector('#clAdd');await p.waitForTimeout(300);
ok((await names()).length===2,'剛輸入就返回也有存到');
// 同一張表再填一份
await p.click('a.rec:has-text("3F")');await p.waitForSelector('.item');await p.locator('.item').first().locator('[data-r="ok"]').click();await p.waitForTimeout(400);
await p.click('#againBtn');await p.waitForSelector('.item');await p.waitForTimeout(200);
const v=await p.evaluate(()=>({c:document.querySelector('[data-f="contractor"]').value,l:document.querySelector('[data-f="location"]').value,on:document.querySelectorAll('.sym button.on').length}));
ok(v.c==='順風營造'&&v.l===''&&v.on===0,'再填一份：沿用廠商、位置與結果是空的 '+JSON.stringify(v));
await p.fill('[data-f="location"]','4F');await p.waitForTimeout(400);await p.click('#backBtn');await p.waitForSelector('#clAdd');
const recs=await p.evaluate(async()=>(await DB.all('records')).filter(r=>r.siteId==='s1'&&r.templateId==='fm_beam').map(r=>r.location+':'+Object.keys(r.items).length).sort());
ok(recs.join()==='3F 東側:1,4F:0','同一張表兩份各自獨立 '+recs);
// 篩選
await p.click('#clAdd');await p.waitForSelector('[data-new]');ok(await p.locator('text=最近用過').count()===1,'有「最近用過」');await p.click('#backBtn');await p.waitForSelector('#clAdd');
await p.click('[data-cf="ng"]');await p.waitForTimeout(300);ok((await names()).length===1,'篩選有缺失 '+(await names()));
await p.click('[data-cf="all"]');await p.selectOption('#clT','fm_beam');await p.waitForTimeout(200);ok((await names()).length===2,'依表單篩選');
await p.selectOption('#clT','c:'+await p.evaluate(()=>TEMPLATES.find(t=>t.id==='rebar').cat));await p.waitForTimeout(200);ok((await names()).length===1,'依類別篩選');
await p.selectOption('#clT','');await p.fill('#clQ','4F');await p.waitForTimeout(700);ok((await names()).length===1,'搜尋位置');
await p.fill('#clQ','不存在');await p.waitForTimeout(700);await p.click('#clClear');await p.waitForTimeout(300);ok((await names()).length===3,'清除篩選');
// 切換工程
await p.selectOption('#siteSelect','s2');await p.waitForTimeout(500);ok((await names()).join()==='梁模板'||(await names()).length===1,'切換工程只列該工程 '+(await names()));
await p.setViewportSize({width:320,height:700});
for(const h of ['#/checklist','#/checklist/new']){await p.goto(U+h);await p.waitForTimeout(500);const w=await p.evaluate(()=>document.documentElement.scrollWidth);ok(w<=320,'320px 無橫向捲動 '+h+' ('+w+')');}
console.log('JS錯誤',errs);await b.close();})();
