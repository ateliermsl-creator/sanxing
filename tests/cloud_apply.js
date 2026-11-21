require('./uidlg');
// cloud_apply：不在名單的同事自行申請加入 → 管理員在「雲端同步」頁核准。需先啟動 wrangler dev（見 tests/README.md）
// SHOTS=資料夾 時另存畫面截圖
const { chromium } = require('playwright');
const B = process.env.CLOUD_URL || 'http://localhost:8787', SHOTS = process.env.SHOTS || '';
const out = []; const ok = (n, c, x) => out.push(`${c ? '✓' : '✗'} ${n}${c ? '' : ' ' + JSON.stringify(x)}`);
const T = Date.now().toString(36), boss = 'boss@test.tw', nb = `new${T}@test.tw`, rj = `rej${T}@test.tw`;
(async () => {
  const b = await chromium.launch(), errs = [];
  const phone = async who => {
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, extraHTTPHeaders: { 'x-dev-email': who } });
    await c.addInitScript(() => localStorage.setItem('cloudDev', '1'));
    const p = await c.newPage(); p.on('pageerror', e => errs.push(who + ': ' + e.message)); p.on('dialog', d => d.accept());
    return p;
  };
  const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png` }); };
  // 還沒登入：只有一個「登入／申請」按鈕，並提醒驗證碼信來自 Cloudflare
  let t;
  const L = await phone('');
  await L.goto(B + '/#/cloud'); await L.waitForTimeout(2500);
  t = await L.textContent('#clState');
  ok('沒登入時一個按鈕「登入／申請」＋收信提醒', (await L.$$('#clState button')).length === 1 && t.includes('登入／申請') && t.includes('Cloudflare') && t.includes('垃圾郵件'), t);
  await shot(L, '申請加入_登入畫面');
  await L.setViewportSize({ width: 320, height: 640 }); await L.waitForTimeout(300);
  ok('登入畫面 320 寬沒有橫向捲動', await L.evaluate(() => document.documentElement.scrollWidth <= 320));
  const N = await phone(nb);
  await N.goto(B + '/#/cloud'); await N.waitForTimeout(2500);
  t = await N.textContent('#clState');
  ok('不在名單：顯示申請表，不是「尚未登入」', (t.includes('還不在公司人員名單') || t.includes('申請帳號')) && !t.includes('尚未登入') && await N.$('#clApply'), t);
  ok('首頁標籤', (await N.evaluate(() => clLabel())) === '☁ 無法同步');
  ok('沒申請過時標題是申請帳號', (await N.textContent('#clState')).includes('申請帳號'));
  await N.click('#clApply'); await N.waitForTimeout(300);
  ok('沒填姓名不送出', !!(await N.$('#clApply')));
  await N.fill('#clAName', '新同事'); await N.fill('#clANote', '○○工地 現場工程師');
  await shot(N, '申請加入_填寫');
  await N.click('#clApply'); await N.waitForTimeout(1200);
  t = await N.textContent('#clState');
  ok('送出後顯示等待核准', t.includes('等管理員核准') && t.includes('新同事'), t);
  ok('標籤顯示等待核准', (await N.evaluate(() => clLabel())) === '☁ 等待核准');
  await shot(N, '申請加入_等待核准');
  await N.reload(); await N.waitForTimeout(2500);
  ok('重新開啟仍是等待核准', (await N.textContent('#clState')).includes('等管理員核准'));
  // 另一人申請，之後不核准
  const R = await phone(rj);
  await R.goto(B + '/#/cloud'); await R.waitForTimeout(2500); await R.fill('#clAName', '路人'); await R.click('#clApply'); await R.waitForTimeout(1200);
  // 管理員
  const A = await phone(boss);
  await A.goto(B + '/#/cloud'); await A.waitForTimeout(3000);
  A.removeAllListeners('dialog'); A.on('dialog', d => d.type() === 'prompt' ? d.accept('老闆' + T) : d.accept());
  await A.click('#clMyName'); await A.waitForTimeout(800);
  ok('本人可以填姓名', (await A.textContent('#clState')).includes('老闆' + T));
  ok('管理員標籤顯示申請數', /人申請加入/.test(await A.evaluate(() => clLabel())), await A.evaluate(() => clLabel()));
  t = await A.textContent('#clReqs');
  ok('管理員看得到兩筆申請', t.includes(nb) && t.includes('○○工地') && t.includes(rj), t);
  await A.$eval('#clReqs', el => el.closest('.panel').scrollIntoView()); await shot(A, '申請加入_管理員核准');
  await A.click(`[data-rok="${nb}"]`); await A.waitForTimeout(1200);
  await A.click(`[data-rno="${rj}"]`); await A.waitForTimeout(1200);
  t = await A.textContent('#clReqs');
  ok('處理後清單清空', !t.includes(nb) && !t.includes(rj), t);
  ok('核准的人進人員名單', (await A.textContent('#clUsers')).includes(nb));
  // 申請人按重新檢查
  await N.click('#clNow'); await N.waitForTimeout(2000);
  t = await N.textContent('#clState');
  ok('核准後可以同步', t.includes(nb) && !t.includes('人員名單'), t);
  ok('有姓名時只顯示一次 Email', t.split(nb).length === 2, t);
  ok('沒有專案時提示洽管理員', (await N.textContent('#view')).includes('管理員還沒有把你加進任何專案'));
  await R.click('#clNow').catch(() => {}); await R.reload(); await R.waitForTimeout(2500);
  t = await R.textContent('#clState');
  ok('不核准的人看到說明、不能再送', t.includes('沒有核准') && !(await R.$('#clApply')), t);
  // 320 寬不得橫向捲動
  await R.setViewportSize({ width: 320, height: 640 }); await R.waitForTimeout(300);
  ok('320 寬沒有橫向捲動', await R.evaluate(() => document.documentElement.scrollWidth <= 320));
  ok('沒有網頁錯誤', !errs.length, errs);
  await b.close();
  console.log(out.join('\n')); console.log(out.some(x => x.startsWith('✗')) ? '有失敗' : '全部通過');
})();
