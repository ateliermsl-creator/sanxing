require('./uidlg');
// cloud_e2e：雲端版手機畫面（cloud.js）兩人同步、離線合併、唯讀、舊資料上傳。需先啟動 wrangler dev（見 tests/README.md）
const { chromium } = require('playwright');
const B = process.env.CLOUD_URL || 'http://localhost:8787';
const api = async (who, path, body) => (await fetch(B + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'x-dev-email': who, 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
let M_; const out = []; const ok = (n, c, x) => out.push(`${c ? '✓' : '✗'} ${n}${c ? '' : ' ' + JSON.stringify(x)}`);
const T = Date.now().toString(36), OS = 'oldsite' + T, OR = 'oldrec' + T, boss = 'boss@test.tw', amy = `amy${T}@test.tw`, view = `view${T}@test.tw`, bob = `bob${T}@test.tw`;
(async () => {
  const b = await chromium.launch(), errs = [];
  process.on('unhandledRejection', async e => { console.log(out.join('\n')); try { console.log('VIEW', M_.p.url(), (await M_.p.textContent('#view')).slice(0, 400)); } catch {} console.log('中斷：', e.message.split('\n')[0], errs); process.exit(1); });
  const phone = async who => {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-dev-email': who }, acceptDownloads: true });
    await c.addInitScript(() => localStorage.setItem('cloudDev', '1'));
    const p = await c.newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept(d.type() === 'prompt' ? '' : undefined));
    return { c, p };
  };
  const sync = p => p.evaluate(async () => { await cloudSync(); return { state: CLOUD.state, msg: CLOUD.msg }; });
  for (const [e, n] of [[amy, 'Amy'], [view, '小唯'], [bob, 'Bob']]) await api(boss, 'users', { email: e, name: n });
  // 管理員第一次開：先到雲端頁，登入後新增專案
  const A = await phone(boss);
  await A.p.goto(B + '/'); await A.p.waitForTimeout(2500);
  ok('沒登入資料時先到雲端頁', A.p.url().endsWith('#/cloud'), A.p.url());
  ok('管理員已登入', (await A.p.textContent('#clState')).includes(boss));
  await A.p.goto(B + '/#/'); await A.p.waitForTimeout(800);
  await A.p.evaluate(() => openSetup('add')); await A.p.fill('#sName', '雲端測試案' + T); await A.p.fill('#sCompany', '順風營造'); await A.p.click('#sOk'); await A.p.waitForTimeout(400);
  const st = await sync(A.p);
  const P = await A.p.evaluate(() => siteId);
  ok('管理員新增的工地成為雲端專案', st.state === 'idle' && (await api(boss, 'me')).projects.some(p => p.id === P), st);
  await api(boss, `projects/${P}/members`, { email: amy, role: 'member' });
  await api(boss, `projects/${P}/members`, { email: view, role: 'viewer' });
  // Amy 開啟：自動下載專案，新增檢查表
  const M = await phone(amy); M_ = M;
  await M.p.goto(B + '/'); await M.p.waitForTimeout(2500); await sync(M.p);
  await M.p.goto(B + '/#/'); await M.p.waitForTimeout(800);
  ok('同事看得到被加入的專案', (await M.p.evaluate(() => sites.map(s => s.name))).includes('雲端測試案' + T));
  ok('首頁有雲端小標籤', /已同步|待上傳/.test(await M.p.textContent('#hCloud')), await M.p.textContent('#hCloud'));
  await M.p.evaluate(P => { siteId = P; }, P);
  await M.p.goto(B + '/#/checklist/new'); await M.p.waitForTimeout(600);
  await M.p.click('[data-new="fm_col"]'); await M.p.waitForTimeout(600);
  const R = M.p.url().split('/').pop();
  await M.p.fill('[data-f="location"]', '3F 北側'); await M.p.waitForTimeout(600); await sync(M.p);
  await sync(A.p);
  let rb = await A.p.evaluate(id => DB.get('records', id), R);
  ok('管理員手機收到同事填的表', rb && rb.location === '3F 北側', rb);
  // 離線：Amy 改位置，管理員改第 1 項 → 上線後自動合併
  await M.c.setOffline(true);
  await M.p.fill('[data-f="location"]', '3F 北側 B 區'); await M.p.waitForTimeout(700);
  ok('離線時顯示待上傳', (await M.p.evaluate(() => { cloudSync(); return clLabel(); })).includes('離線'));
  await A.p.goto(B + '/#/checklist/' + R); await A.p.waitForTimeout(700);
  await A.p.click('.item[data-i="0"] [data-r="ng"]'); await A.p.waitForTimeout(700); await sync(A.p);
  await M.c.setOffline(false); await M.p.evaluate(() => window.dispatchEvent(new Event('online'))); await sync(M.p); await M.p.waitForTimeout(300); await sync(M.p);
  const rm = await M.p.evaluate(id => DB.get('records', id), R);
  ok('兩人離線改不同欄位自動合併（同事手機）', rm.location === '3F 北側 B 區' && rm.items[0]?.r === 'ng', rm);
  await sync(A.p); rb = await A.p.evaluate(id => DB.get('records', id), R);
  ok('兩人離線改不同欄位自動合併（管理員手機）', rb.location === '3F 北側 B 區' && rb.items[0]?.r === 'ng', rb);
  // 唯讀
  const V = await phone(view);
  await V.p.goto(B + '/'); await V.p.waitForTimeout(2000); await sync(V.p);
  await V.p.goto(B + '/#/checklist/' + R); await V.p.waitForTimeout(800);
  ok('唯讀者表單不能改', await V.p.isDisabled('[data-f="location"]') && !(await V.p.$('#delBtn')) && (await V.p.textContent('.cllock')).includes('唯讀'));
  // 一般同事完成後不能按修改
  await M.p.goto(B + '/#/checklist/' + R); await M.p.waitForTimeout(600);
  await M.p.click('#lockBtn'); await M.p.waitForTimeout(800); await sync(M.p);
  await M.p.goto(B + '/#/checklist'); await M.p.goto(B + '/#/checklist/' + R); await M.p.waitForTimeout(600);
  const lk = await M.p.textContent('.cllock'); ok('一般同事完成後沒有「修改」鈕', !(await M.p.$('#unlockBtn')) && lk.includes('工程主管'), lk);
  await sync(A.p); await A.p.goto(B + '/#/checklist'); await A.p.goto(B + '/#/checklist/' + R); await A.p.waitForTimeout(600);
  ok('管理員可以修改已完成的', !!(await A.p.$('#unlockBtn')));
  // 舊資料上傳：Bob 手機原本就有工地與紀錄（單機版時期）
  const Bo = await phone(bob);
  await Bo.p.goto(B + '/manifest.json');
  await Bo.p.goto(B + '/#/backup'); await Bo.p.waitForTimeout(600);
  await Bo.p.evaluate(async () => { CLOUD.on = false; });   // 假裝是單機版時建的資料
  await Bo.p.evaluate(async ([OS, OR]) => { await DB.put('sites', { id: OS, name: '舊工地', company: '' }); await DB.put('records', { id: OR, siteId: OS, templateId: 'fm_col', docNo: '', contractor: '', subcontractor: '', date: '2026-11-01', location: '舊紀錄 1F', timing: {}, items: { 0: { r: 'ok' } }, sigs: {}, updated: 1 }); }, [OS, OR]);
  await api(boss, `projects/${P}/members`, { email: bob, role: 'member' });
  await Bo.p.reload(); await Bo.p.waitForTimeout(2500);
  await Bo.p.goto(B + '/#/cloud'); await Bo.p.waitForTimeout(1500);
  ok('舊工地列在「上傳舊資料」', !!(await Bo.p.$(`[data-impgo="${OS}"]`)));
  ok('舊紀錄還沒上傳', !(await api(boss, 'sync', { cursor: 0 })).pull.some(d => d.id === OR));
  await Bo.p.selectOption(`[data-imp="${OS}"]`, P);
  const dl = Bo.p.waitForEvent('download'); await Bo.p.click(`[data-impgo="${OS}"]`); const f = await dl;
  ok('上傳前先下載備份', !!f);
  await Bo.p.waitForTimeout(1500);
  const pulled = (await api(boss, 'sync', { cursor: 0 })).pull.find(d => d.id === OR);
  ok('舊紀錄併入雲端專案', pulled && pulled.project === P, pulled);
  ok('舊工地從手機移除、改掛專案', await Bo.p.evaluate(async ([P, OS, OR]) => !(await DB.get('sites', OS)) && (await DB.get('records', OR)).siteId === P, [P, OS, OR]));
  // 不能刪雲端專案
  await M.p.goto(B + '/#/checklist'); await M.p.waitForTimeout(400);
  const blk = await M.p.evaluate(P => cloudSiteBlock(P, 'del'), P);
  ok('手機上不能刪雲端專案', blk.includes('不能在手機上刪除'));
  // 停權
  await api(boss, 'users', { email: amy, name: 'Amy', disabled: true });
  const s2 = await sync(M.p);
  ok('停權後顯示無法同步', s2.state === 'denied' && s2.msg.includes('停權'), s2);
  ok('沒有網頁錯誤', !errs.length, errs);
  console.log(out.join('\n')); console.log(out.filter(x => x[0] === '✗').length ? '有失敗' : '全部通過');
  await b.close();
})();
