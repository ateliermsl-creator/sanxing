require('./uidlg');
// calc_save：結構計算「存到專案」（calcsave.js）：存、自動存回、開啟、複製、新計算、刪除、換專案、XSS 名稱、320 寬；見 tests/README.md
const { chromium } = require('playwright');
const U = 'http://localhost:8793/index.html';
const out = []; const ok = (n, c, x) => out.push(`${c ? '✓' : '✗'} ${n}${c ? '' : ' ' + JSON.stringify(x)}`);
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 390, height: 844 } }), errs = [];
  await p.addInitScript(() => { try { localStorage.setItem('cfStepAll', '1'); } catch {} });
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(U); await p.waitForTimeout(500);
  await p.evaluate(async () => { await DB.put('sites', { id: 'sA', name: '甲工地' }); await DB.put('sites', { id: 'sB', name: '乙工地' }); localStorage.setItem('siteId', 'sA'); localStorage.removeItem('calcColForm2'); localStorage.removeItem('calcCur'); });
  await p.reload(); await p.waitForTimeout(500);
  const go = async (tab = 'col') => { await p.goto(U + '#/struct/' + tab); await p.waitForSelector('#csBar'); await p.waitForTimeout(400); await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach(d => d.close())); };
  const recs = () => p.evaluate(async () => (await DB.all('calcs')).map(x => ({ s: x.siteId, t: x.tab, n: x.name, loc: x.data?.info?.loc })));
  await go();
  ok('柱模板頁有「存到專案」列', (await p.textContent('#csBar')).includes('未存到專案'));
  await p.fill('[data-p="info.loc"]', '3F C1'); await p.locator('[data-p="info.loc"]').blur(); await p.waitForTimeout(300);
  await p.click('#csSave'); await p.waitForTimeout(300);
  ok('沒填名稱時提醒', (await p.textContent('#csMsg')).includes('紀錄名稱'));
  await p.fill('#csName', '3F 柱模 <img src=x onerror=window.__x=1>'); await p.click('#csSave'); await p.waitForTimeout(500);
  let r = await recs();
  ok('存到專案', r.length === 1 && r[0].s === 'sA' && r[0].t === 'col' && r[0].loc === '3F C1', r);
  ok('顯示已存到專案', (await p.textContent('#csBar')).includes('已存到專案'));
  await p.fill('[data-p="info.loc"]', '3F C2'); await p.locator('[data-p="info.loc"]').blur(); await p.waitForTimeout(1200);
  r = await recs(); ok('修改後自動存回', r[0].loc === '3F C2', r);
  await p.click('#csOpen'); await p.waitForTimeout(200);
  ok('列表有這筆、名稱有轉義', (await p.$$('.vsrow')).length === 1 && !(await p.evaluate(() => window.__x)));
  await p.click('[data-cscopy]'); await p.waitForTimeout(700);
  r = await recs(); ok('複製', r.length === 2 && r.some(x => x.n.endsWith('（複本）')), r);
  await p.click('#csNew'); await p.waitForTimeout(700);
  ok('新計算：輸入清空、未存到專案', (await p.inputValue('[data-p="info.loc"]')) === '' && (await p.textContent('#csBar')).includes('未存到專案'));
  await p.fill('[data-p="info.loc"]', '暫存'); await p.locator('[data-p="info.loc"]').blur(); await p.waitForTimeout(900);
  ok('沒存到專案的輸入不會改到紀錄', (await recs()).every(x => x.loc === '3F C2'));
  if (await p.$eval('#csList', x => x.hidden)) await p.click('#csOpen');
  await p.locator('.vsrow').first().locator('[data-csopen]').click(); await p.waitForTimeout(700);
  ok('開啟紀錄載回輸入', (await p.inputValue('[data-p="info.loc"]')) === '3F C2');
  if (await p.$eval('#csList', x => x.hidden)) await p.click('#csOpen');
  await p.locator('.vsrow').first().locator('[data-csdel]').click(); await p.waitForTimeout(500);
  ok('刪除', (await recs()).length === 1);
  // 換專案：清單只列該專案
  await p.evaluate(() => localStorage.setItem('siteId', 'sB')); await p.reload(); await p.waitForTimeout(500); await go();
  const tb = await p.textContent('#csBar');
  ok('換專案後清單是空的、不再存回原專案的紀錄', !tb.includes('（1）') && tb.includes('未存到專案'), tb);
  // 其他分頁也有
  for (const t of ['wall', 'slab', 'beam', 'scaf', 'brk', 'row', 'anc', 'sec']) { await go(t); ok(`${t} 頁有存到專案列`, !!(await p.$('#csBar #csSave'))); }
  await p.goto(U + '#/struct/col/sheet'); await p.waitForTimeout(500);
  ok('計算書頁沒有這一列', !(await p.$('#csBar')));
  // 320 寬
  await p.setViewportSize({ width: 320, height: 700 }); await go('col');
  ok('320 寬沒有橫向捲動', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  ok('沒有網頁錯誤', !errs.length, errs);
  console.log(out.join('\n')); console.log(out.filter(x => x[0] === '✗').length ? '有失敗' : '全部通過');
  await b.close();
})();
