// cloud_phase2：第二期同步（缺失改善、施工日誌、材料進場、勤前教育、混凝土澆置、點工單、方數）＋結構計算存到專案。需先啟動 wrangler dev（見 tests/README.md）
const { chromium } = require('playwright');
const B = process.env.CLOUD_URL || 'http://localhost:8787';
const api = async (who, path, body) => (await fetch(B + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'x-dev-email': who, 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).json();
const out = []; const ok = (n, c, x) => out.push(`${c ? '✓' : '✗'} ${n}${c ? '' : ' ' + JSON.stringify(x)}`);
const T = Date.now().toString(36), boss = 'boss@test.tw', amy = `amy${T}@test.tw`, view = `view${T}@test.tw`;
const KINDS = ['logs', 'matrecs', 'safety', 'pours', 'workorders', 'vols'];
(async () => {
  const b = await chromium.launch(), errs = [];
  process.on('unhandledRejection', e => { console.log(out.join('\n')); console.log('中斷：', e.message.split('\n')[0], errs); process.exit(1); });
  const phone = async who => {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-dev-email': who } });
    await c.addInitScript(() => localStorage.setItem('cloudDev', '1'));
    const p = await c.newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
    return { c, p };
  };
  const sync = async p => { await p.evaluate(() => cloudSync()); await p.waitForTimeout(200); return p.evaluate(async () => { await cloudSync(); return CLOUD.state; }); };
  for (const [e, n] of [[amy, 'Amy'], [view, '小唯']]) await api(boss, 'users', { email: e, name: n });
  const A = await phone(boss);
  await A.p.goto(B + '/'); await A.p.waitForTimeout(2500);
  await A.p.goto(B + '/#/'); await A.p.waitForTimeout(600);
  await A.p.evaluate(() => openSetup('add')); await A.p.fill('#sName', '二期測試' + T); await A.p.fill('#sCompany', '順風營造'); await A.p.click('#sOk'); await A.p.waitForTimeout(400);
  await sync(A.p);
  const P = await A.p.evaluate(() => siteId);
  await api(boss, `projects/${P}/members`, { email: amy, role: 'member' });
  await api(boss, `projects/${P}/members`, { email: view, role: 'viewer' });

  // Amy 在手機新增缺失（畫面操作）
  const M = await phone(amy);
  await M.p.goto(B + '/'); await M.p.waitForTimeout(2500); await sync(M.p);
  await M.p.evaluate(P => { siteId = P; localStorage.setItem('siteId', P); }, P);
  await M.p.goto(B + '/#/punch'); await M.p.waitForTimeout(700);
  await M.p.click('#pAdd'); await M.p.waitForTimeout(700);
  const PU = M.p.url().split('/').pop();
  await M.p.fill('[data-f="location"]', '5F 樓梯間'); await M.p.fill('[data-f="desc"]', '牆面蜂窩'); await M.p.locator('[data-f="desc"]').blur(); await M.p.waitForTimeout(800);
  await sync(M.p);
  await sync(A.p);
  let pa = await A.p.evaluate(id => DB.get('punch', id), PU);
  ok('缺失改善：另一支手機收到', pa && pa.desc === '牆面蜂窩' && pa.location === '5F 樓梯間', pa);
  await A.p.goto(B + '/#/punch'); await A.p.waitForTimeout(600);
  ok('缺失列表看得到同事新增的', (await A.p.textContent('#view')).includes('牆面蜂窩'));

  // 其他各表：Amy 建一份，管理員收到
  const ids = await M.p.evaluate(async ([P, K]) => {
    const r = {};
    for (const k of K) { const id = k + Date.now().toString(36); r[k] = id; await DB.put(k, { id, siteId: P, date: '2026-11-20', name: '測試' + k, created: Date.now(), updated: Date.now() }); }
    return r;
  }, [P, KINDS]);
  await sync(M.p); await sync(A.p);
  for (const k of KINDS) { const x = await A.p.evaluate(([k, id]) => DB.get(k, id), [k, ids[k]]); ok(`${k}：另一支手機收到`, x && x.siteId === P, x); }

  // 缺失照片標記（marks）跟著缺失同步
  await M.p.evaluate(async id => { const x = await DB.get('punch', id); x.marks = { ph1: [{ x: 0.25, y: 0.5, t: '蜂窩處' }] }; x.updated = Date.now(); await DB.put('punch', x); }, PU);
  await sync(M.p); await sync(A.p);
  const mk = (await A.p.evaluate(id => DB.get('punch', id), PU))?.marks;
  ok('缺失照片標記同步', mk?.ph1?.[0]?.t === '蜂窩處' && mk.ph1[0].x === 0.25, mk);
  // 方數「其他」列（直接填單個體積 v）也同步
  const VO = await M.p.evaluate(async P => { const id = 'vo' + Date.now().toString(36); await DB.put('vols', { id, siteId: P, name: '集水坑', rows: [{ name: '集水坑', type: 'oth', a: '', b: '', c: '', d: '', e: '', v: '0.85', n: '2', op: [] }], cfg: {}, created: Date.now(), updated: Date.now() }); return id; }, P);
  await sync(M.p); await sync(A.p);
  const vo = await A.p.evaluate(id => DB.get('vols', id), VO);
  ok('方數「其他」列與單個體積同步', vo?.rows?.[0]?.type === 'oth' && vo.rows[0].v === '0.85', vo);
  // 管理員改缺失 → Amy 收到；開著的畫面會更新
  await M.p.goto(B + '/#/punch/' + PU); await M.p.waitForTimeout(600);
  await A.p.evaluate(async id => { const x = await DB.get('punch', id); x.trade = '泥作班'; x.updated = Date.now(); await DB.put('punch', x); }, PU);
  await sync(A.p); await sync(M.p); await M.p.waitForTimeout(500);
  ok('雙向：同事收到管理員的修改', (await M.p.evaluate(id => DB.get('punch', id), PU)).trade === '泥作班');
  ok('開著的缺失畫面更新', (await M.p.inputValue('[data-f="trade"]').catch(() => '')) === '泥作班' || (await M.p.textContent('#view')).includes('泥作班'));

  // 刪除同步
  await M.p.evaluate(id => DB.del('logs', id), ids.logs); await sync(M.p); await sync(A.p);
  ok('刪除也同步', !(await A.p.evaluate(id => DB.get('logs', id), ids.logs)));

  // 唯讀者：缺失畫面只能看
  const V = await phone(view);
  await V.p.goto(B + '/'); await V.p.waitForTimeout(2000); await sync(V.p);
  await V.p.goto(B + '/#/punch/' + PU); await V.p.waitForTimeout(900);
  ok('唯讀者缺失畫面只能看', await V.p.isDisabled('[data-f="desc"]') && (await V.p.textContent('.clroBar')).includes('唯讀'));
  ok('唯讀者看不到刪除鈕', !(await V.p.locator('button:visible', { hasText: '刪除' }).count()));
  // 一般同事不能改管理員建立的
  const BID = await A.p.evaluate(async P => { const id = 'pb' + Date.now().toString(36); await DB.put('punch', { id, siteId: P, no: '99', desc: '管理員建的', status: 'open', log: [], created: Date.now(), updated: Date.now() }); return id; }, P);
  await sync(A.p); await sync(M.p);
  await M.p.goto(B + '/#/punch/' + BID); await M.p.waitForTimeout(900);
  ok('一般同事開別人建的缺失只能看', await M.p.isDisabled('[data-f="desc"]') && (await M.p.textContent('.clroBar')).includes(boss));

  // 升級前就在手機上的資料：補上傳一次
  const OLD = await M.p.evaluate(async P => {
    const id = 'old' + Date.now().toString(36);
    await DBraw.put('punch', { id, siteId: P, no: '1', desc: '升級前的缺失', status: 'open', log: [], created: 1, updated: 1 });
    localStorage.setItem('cloudPhase', '1'); return id;
  }, P);
  await sync(M.p); await sync(M.p); await sync(A.p);
  ok('升級前的資料自動補上傳', (await A.p.evaluate(id => DB.get('punch', id), OLD))?.desc === '升級前的缺失');

  // 結構計算存到專案：Amy 存一份柱模 → 管理員開啟；管理員開 Amy 的只能看、不會改到原紀錄
  await M.p.evaluate(P => { localStorage.setItem('siteId', P); }, P);
  await M.p.goto(B + '/#/struct/col'); await M.p.waitForSelector('#csBar'); await M.p.waitForTimeout(400);
  await M.p.fill('[data-p="info.loc"]', '3F C1'); await M.p.locator('[data-p="info.loc"]').blur();
  await M.p.fill('#csName', 'Amy 的柱模'); await M.p.click('#csSave'); await M.p.waitForTimeout(500);
  const KC = await M.p.evaluate(async () => (await DB.all('calcs'))[0]?.id);
  await sync(M.p); await sync(A.p);
  ok('結構計算：另一支手機收到', (await A.p.evaluate(id => DB.get('calcs', id), KC))?.data?.info?.loc === '3F C1');
  await A.p.evaluate(P => { localStorage.setItem('siteId', P); }, P); await A.p.reload(); await A.p.waitForTimeout(1500);
  await A.p.goto(B + '/#/struct/col'); await A.p.waitForSelector('#csBar'); await A.p.waitForTimeout(500);
  await A.p.click('#csOpen'); await A.p.click(`[data-id="${KC}"] [data-csopen]`); await A.p.waitForTimeout(800);
  ok('開啟同事存的計算載入輸入', (await A.p.inputValue('[data-p="info.loc"]')) === '3F C1');
  // Amy 改自己的 → 自動存回並同步
  await M.p.fill('[data-p="info.loc"]', '3F C1-改'); await M.p.locator('[data-p="info.loc"]').blur(); await M.p.waitForTimeout(1200);
  await sync(M.p); await sync(A.p);
  ok('本人修改後自動存回並同步', (await A.p.evaluate(id => DB.get('calcs', id), KC))?.data?.info?.loc === '3F C1-改');
  // 唯讀者開 Amy 的：只能看
  await V.p.evaluate(P => { localStorage.setItem('siteId', P); }, P); await sync(V.p); await V.p.reload(); await V.p.waitForTimeout(1500);
  await V.p.goto(B + '/#/struct/col'); await V.p.waitForSelector('#csBar'); await V.p.waitForTimeout(500);
  await V.p.click('#csOpen'); await V.p.waitForTimeout(200);
  ok('唯讀者看到「只能看」、沒有刪除鈕', (await V.p.textContent(`[data-id="${KC}"]`)).includes('只能看') && !(await V.p.$(`[data-id="${KC}"] [data-csdel]`)));
  await V.p.click(`[data-id="${KC}"] [data-csopen]`); await V.p.waitForTimeout(800);
  await V.p.fill('[data-p="info.loc"]', '唯讀者亂改'); await V.p.locator('[data-p="info.loc"]').blur(); await V.p.waitForTimeout(1200); await sync(V.p);
  ok('唯讀者改輸入不會改到原紀錄', (await api(boss, 'sync', { cursor: 0 })).pull.find(d => d.id === KC)?.data?.data?.info?.loc === '3F C1-改');
  ok('沒有網頁錯誤', !errs.length, errs);
  console.log(out.join('\n')); console.log(out.filter(x => x[0] === '✗').length ? '有失敗' : '全部通過');
  await b.close();
})();
