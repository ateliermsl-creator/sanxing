// checklist_notes：內建自主檢查表的紅字解說（note）
// 1. 每張內建範本 id 不重複、每項都有 t；舊範本（layout）前 6 項文字不變（紀錄依順序對應）
// 2. 填表畫面：有解說的項目有 ⓘ，點開才顯示，再點收起
// 3. 預覽：預設不印解說（PDF 也不印）；勾「PDF 附解說」才顯示；偏好會記住
// 4. 窄螢幕 320px 填表與預覽不橫向捲動
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const errs=[];p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>d.accept());
const ok=(c,m)=>console.log((c?'OK    ':'失敗  ')+m);
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(800);
const info=await p.evaluate(async()=>{
  await DB.put('sites',{id:'s9',name:'測試工地'});localStorage.setItem('siteId','s9');localStorage.removeItem('pvNotes');
  const ids=TEMPLATES.map(t=>t.id);const lay=TEMPLATES.find(t=>t.id==='layout');
  await DB.put('records',{id:'r1',siteId:'s9',templateId:'fm_beam',docNo:'',contractor:'',subcontractor:'',date:today(),location:'3F',timing:{},items:{0:{r:'ok'}},sigs:{},updated:1});
  return {n:TEMPLATES.length,dup:ids.length-new Set(ids).size,empty:TEMPLATES.filter(t=>t.items.some(i=>!i.t||typeof i.std!=='string')).map(t=>t.id),
    lay:lay.items.slice(0,6).map(i=>i.t).join('|'),notes:TEMPLATES.reduce((s,t)=>s+t.items.filter(i=>i.note).length,0),
    beamNotes:TEMPLATES.find(t=>t.id==='fm_beam').items.filter(i=>i.note).length};
});
await p.reload();await p.waitForTimeout(600);
ok(info.n>=41,'內建範本數 '+info.n);ok(info.dup===0,'範本 id 不重複');ok(!info.empty.length,'每項都有檢查項目 '+info.empty);
ok(info.lay==='放樣圖是否核對完成|基準雙十字線距離誤差|高程之垂直引點誤差|柱位置及斷面尺寸|牆位置及斷面尺寸|梁位置及斷面尺寸','放樣表前 6 項順序不變');
ok(info.notes>50,'解說總數 '+info.notes);
await p.goto('http://localhost:8793/index.html#/checklist/r1');await p.waitForSelector('.item');
const nb=await p.locator('.tipbtn').count();ok(nb===info.beamNotes,'梁模板 ⓘ 數 '+nb+'/'+info.beamNotes);
ok(!(await p.locator('.tipbox').first().isVisible()),'解說預設收起');
await p.locator('.tipbtn').first().click();ok(await p.locator('.tipbox').first().isVisible(),'點 ⓘ 顯示解說');
ok(await p.locator('.tipbox').first().textContent().then(t=>t.includes('拿圖配合')),'解說內容正確');
await p.locator('.tipbtn').first().click();ok(!(await p.locator('.tipbox').first().isVisible()),'再點收起');
ok(await p.locator('.sym button.on').count()===1,'點 ⓘ 不影響結果標記');
await p.goto('http://localhost:8793/index.html#/checklist/r1/preview');await p.waitForSelector('.paper');await p.waitForTimeout(300);
const vis=()=>p.evaluate(()=>[...document.querySelectorAll('.paper .pnote')].filter(e=>e.offsetParent).length);
ok(await vis()===0,'預覽預設不印解說');
await p.check('#pvNotes');ok(await vis()===info.beamNotes,'勾選後印出解說 '+(await vis()));
await p.reload();await p.waitForSelector('.paper');await p.waitForTimeout(300);ok(await vis()===info.beamNotes&&await p.isChecked('#pvNotes'),'勾選偏好會記住');
await p.uncheck('#pvNotes');ok(await vis()===0,'取消勾選即隱藏');
// 沒有解說的範本不顯示開關
await p.evaluate(async()=>{await DB.put('records',{id:'r2',siteId:'s9',templateId:'mep_embed',docNo:'',contractor:'',subcontractor:'',date:today(),location:'',timing:{},items:{},sigs:{},updated:1})});
await p.goto('http://localhost:8793/index.html#/checklist/r2/preview');await p.waitForSelector('.paper');ok(await p.locator('#pvNotes').count()===0,'無解說的表不顯示開關');
await p.setViewportSize({width:320,height:700});
for(const h of ['#/checklist/r1','#/checklist/r1/preview','#/checklist']){await p.goto('http://localhost:8793/index.html'+h);await p.waitForTimeout(500);
  const w=await p.evaluate(()=>document.documentElement.scrollWidth);ok(w<=320,'320px 無橫向捲動 '+h+' ('+w+')');}
console.log('JS錯誤',errs);await b.close();})();
