// calc_delete_name：刪除開啟中的紀錄後，頁首「目前紀錄」與紀錄名稱欄要清掉、計算書不再印紀錄名稱（方數、磁磚、結構計算）；
// 另測別台手機刪除（直接刪 DB 後重開頁面、或自動存回時發現已刪除）不會殘留名稱、也不會把紀錄存回去。見 tests/README.md
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';let bad=0;const ok=(n,c,v)=>{console.log((c?'OK  ':'NG  ')+n,v===undefined?'':JSON.stringify(v));if(!c)bad++;};
await p.goto(U);await p.waitForTimeout(500);
await p.evaluate(async()=>{await DB.put('sites',{id:'sA',name:'甲工地'});localStorage.setItem('siteId','sA');for(const k of ['calcRows','calcCfg','calcTileRows','calcTileCfg','calcCur'])localStorage.removeItem(k);});await p.reload();await p.waitForTimeout(500);
const T=s=>s.replace(/\s+/g,' ');
for(const [tab,pre,del] of [['vol','v','vdel'],['tile','tl','tdel']]){
  const go=async()=>{await p.goto(U+'#/calc/'+tab);await p.reload();await p.waitForSelector('#'+pre+'Title');await p.waitForTimeout(500);};
  await go();
  await p.fill('.vrow[data-i="0"] [data-k="a"]','2');await p.fill('.vrow[data-i="0"] [data-k="b"]','3');
  await p.fill('#'+pre+'Title','測試紀錄A');await p.click('#'+pre+'Save');await p.waitForTimeout(300);
  ok(tab+' 存檔後頁首',T(await p.innerText('#'+pre+'CurName'))==='測試紀錄A');
  if(await p.$eval('#'+pre+'List',x=>x.hidden))await p.click('#'+pre+'Open');
  await p.click(`.vsrow.on [data-${del}]`);await p.waitForTimeout(400);
  const nm=await p.innerText('#'+pre+'CurName'),iv=await p.inputValue('#'+pre+'Title');
  ok(tab+' 刪除後頁首回到新計算',nm==='新計算',nm);ok(tab+' 刪除後名稱欄清空',iv==='',iv);
  ok(tab+' 刪除後輸入保留',await p.inputValue('.vrow[data-i="0"] [data-k="a"]')==='2');
  await go();ok(tab+' 重開頁面仍是新計算',await p.innerText('#'+pre+'CurName')==='新計算');
  await p.goto(U+'#/calc/'+tab+'/sheet');await p.waitForTimeout(400);ok(tab+' 計算書不印紀錄名稱',!(await p.innerText('.paper')).includes('測試紀錄A'));
  // 別台手機刪除：重開頁面
  await go();await p.fill('#'+pre+'Title','測試紀錄B');await p.click('#'+pre+'Save');await p.waitForTimeout(300);
  await p.evaluate(async()=>{for(const v of await DB.all('vols'))await DB.del('vols',v.id);});
  await go();ok(tab+' 別處刪除後重開',await p.innerText('#'+pre+'CurName')==='新計算'&&await p.inputValue('#'+pre+'Title')==='');
  // 別台手機刪除：畫面開著時改輸入（自動存回）
  await p.fill('#'+pre+'Title','測試紀錄C');await p.click('#'+pre+'Save');await p.waitForTimeout(300);
  await p.evaluate(async()=>{for(const v of await DB.all('vols'))await DB.del('vols',v.id);});
  await p.fill('.vrow[data-i="0"] [data-k="a"]','5');await p.waitForTimeout(900);
  ok(tab+' 自動存回時發現已刪除：不存回',(await p.evaluate(async()=>(await DB.all('vols')).length))===0);
  ok(tab+' 自動存回時發現已刪除：名稱清掉',await p.innerText('#'+pre+'CurName')==='新計算'&&await p.inputValue('#'+pre+'Title')==='');
}
// 結構計算（柱模板）
await p.goto(U+'#/struct/col');await p.waitForSelector('#csBar #csName');await p.waitForTimeout(400);
await p.fill('#csName','柱模C1');await p.click('#csSave');await p.waitForTimeout(400);
ok('struct 存檔後',T(await p.innerText('#csBar .vfname b'))==='柱模C1');
await p.click('#csOpen');await p.click('#csList [data-csdel]');await p.waitForTimeout(400);
ok('struct 刪除後',T(await p.innerText('#csBar .vfname b'))==='未存到專案'&&await p.inputValue('#csName')==='',await p.innerText('#csBar .vfname b'));
await p.fill('#csName','柱模C2');await p.click('#csSave');await p.waitForTimeout(400);
await p.evaluate(async()=>{for(const v of await DB.all('calcs'))await DB.del('calcs',v.id);});
await p.goto(U+'#/struct/wall');await p.waitForTimeout(300);await p.goto(U+'#/struct/col');await p.waitForSelector('#csBar #csName');await p.waitForTimeout(400);
ok('struct 別處刪除後重開',T(await p.innerText('#csBar .vfname b'))==='未存到專案'&&await p.inputValue('#csName')==='');
ok('沒有 JS 錯誤',!e.length,e);console.log(bad?`NG ${bad} 項`:'全部通過');await b.close();})();
