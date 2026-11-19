// cloud_api：雲端同步 API（cloud/worker.js）的權限與合併規則。需先啟動 wrangler dev（見 tests/README.md 的 cloud_ 測試說明）
const B = process.env.CLOUD_URL || 'http://localhost:8787';
const call = async (who, path, body) => { const r = await fetch(B + '/api/' + path, { method: body ? 'POST' : 'GET', headers: { 'x-dev-email': who, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }); return { status: r.status, ...(await r.json()) }; };
const out = []; const ok = (name, cond, extra) => out.push(`${cond ? '✓' : '✗'} ${name}${cond ? '' : ' ' + JSON.stringify(extra)}`);
const boss = 'boss@test.tw', lead = 'lead@test.tw', amy = 'amy@test.tw', bob = 'bob@test.tw', view = 'view@test.tw', out_ = 'stranger@test.tw';
const P = 'p' + Date.now().toString(36);
(async () => {
  ok('未登入 401', (await fetch(B + '/api/me')).status === 401);
  ok('不在名單 403', (await call(out_, 'me')).error === 'not_member');
  for (const [e, n] of [[lead, '主管'], [amy, 'Amy'], [bob, 'Bob'], [view, '唯讀']]) await call(boss, 'users', { email: e, name: n });
  let s = await call(amy, 'sync', { cursor: 0, projects: [{ id: P, name: '同事不能建專案' }] });
  ok('一般人不能建專案', s.projResults[0].status === 'denied', s.projResults);
  s = await call(boss, 'sync', { cursor: 0, projects: [{ id: P, name: '測試案', company: '順風營造' }] });
  ok('管理員建專案', s.projResults[0].status === 'ok' && s.projects.some(p => p.id === P));
  await call(boss, `projects/${P}/members`, { email: lead, role: 'lead' });
  let m = await call(lead, `projects/${P}/members`, { email: amy, role: 'member' });
  await call(lead, `projects/${P}/members`, { email: bob, role: 'member' });
  await call(lead, `projects/${P}/members`, { email: view, role: 'viewer' });
  ok('主管加成員', m.members && m.members.length >= 2, m);
  ok('主管不能指派主管', (await call(lead, `projects/${P}/members`, { email: bob, role: 'lead' })).status === 403);
  ok('一般同事不能管成員', (await call(amy, `projects/${P}/members`)).status === 403);
  ok('非成員看不到專案', !(await call(boss, 'users')).error && !(await call(out_, 'me')).projects);
  const rec = { id: 'r' + P, siteId: P, templateId: 'fm_col', location: '2F', items: { 0: { r: 'ok' } }, sigs: {}, timing: {}, updated: 1 };
  s = await call(amy, 'sync', { cursor: 0, push: [{ id: rec.id, kind: 'records', project: P, base: 0, data: rec }] });
  ok('同事新增紀錄', s.results[0].status === 'ok' && s.results[0].version === 1, s.results);
  s = await call(view, 'sync', { cursor: 0, push: [{ id: 'rv' + P, kind: 'records', project: P, base: 0, data: { ...rec, id: 'rv' + P } }] });
  ok('唯讀不能新增', s.results[0].status === 'denied', s.results);
  ok('唯讀拉得到紀錄', s.pull.some(d => d.id === rec.id));
  s = await call(bob, 'sync', { cursor: 0, push: [{ id: rec.id, kind: 'records', project: P, base: 1, data: { ...rec, location: 'Bob改' } }] });
  ok('同事不能改別人的', s.results[0].status === 'denied' && s.results[0].data.location === '2F', s.results);
  // 兩人離線改同一份：Amy 改位置，主管改第 2 項 → 自動合併
  s = await call(lead, 'sync', { cursor: 0, push: [{ id: rec.id, kind: 'records', project: P, base: 1, data: { ...rec, items: { 0: { r: 'ok' }, 1: { r: 'ng' } } } }] });
  ok('主管可改', s.results[0].status === 'ok' && s.results[0].version === 2, s.results);
  s = await call(amy, 'sync', { cursor: 0, push: [{ id: rec.id, kind: 'records', project: P, base: 1, data: { ...rec, location: '2F 東側' } }] });
  const d = s.results[0].data || {};
  ok('不同欄位自動合併', s.results[0].status === 'merged' && d.location === '2F 東側' && d.items[1]?.r === 'ng' && !s.results[0].notes.length, s.results);
  // 同欄位：後上傳為準
  await call(lead, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: 3, data: { ...d, location: '主管版' } }] });
  s = await call(amy, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: 3, data: { ...d, location: 'Amy版' } }] });
  ok('同欄位後上傳為準並記錄', s.results[0].status === 'merged' && s.results[0].data.location === 'Amy版' && s.results[0].notes.length === 1, s.results);
  let v = s.results[0].version, cur = s.results[0].data;
  // 簽名：先簽為準
  await call(lead, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: v, data: { ...cur, sigs: { manager: 'data:image/png;base64,LEAD' } } }] });
  s = await call(amy, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: v, data: { ...cur, sigs: { manager: 'data:image/png;base64,AMY', worker: 'data:image/png;base64,W' } } }] });
  ok('簽名先簽為準、另一欄保留', s.results[0].data.sigs.manager.endsWith('LEAD') && s.results[0].data.sigs.worker.endsWith('W'), s.results);
  v = s.results[0].version; cur = s.results[0].data;
  // 完成後：同事不能修改（解除），主管可以
  s = await call(amy, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: v, data: { ...cur, locked: 111 } }] });
  ok('同事完成自己的', s.results[0].status === 'ok'); v = s.results[0].version; cur = s.results[0].data || { ...cur, locked: 111 };
  s = await call(amy, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: v, data: { ...cur, locked: undefined, reopened: [222] } }] });
  ok('同事不能修改已完成的', s.results[0].status === 'denied', s.results);
  // 雲端已完成、我離線時改 → 衝突副本
  s = await call(lead, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: v - 1, data: { ...cur, location: '離線改', locked: undefined } }] });
  ok('已完成 → 衝突副本', s.results[0].status === 'conflict' && s.results[0].data.locked === 111, s.results);
  s = await call(lead, 'sync', { push: [{ id: rec.id, kind: 'records', project: P, base: v, data: { ...cur, locked: undefined, reopened: [333] } }] });
  ok('主管可以修改已完成的', s.results[0].status === 'ok', s.results); v = s.results[0].version;
  // 明細列依 id 合併（澆置車次之類）
  const rec2 = { id: 'q' + P, siteId: P, trucks: [{ id: 't1', plate: 'A' }], updated: 1 };
  await call(amy, 'sync', { push: [{ id: rec2.id, kind: 'records', project: P, base: 0, data: rec2 }] });
  await call(lead, 'sync', { push: [{ id: rec2.id, kind: 'records', project: P, base: 1, data: { ...rec2, trucks: [...rec2.trucks, { id: 't2', plate: 'B' }] } }] });
  s = await call(amy, 'sync', { push: [{ id: rec2.id, kind: 'records', project: P, base: 1, data: { ...rec2, trucks: [{ id: 't1', plate: 'A1' }, { id: 't3', plate: 'C' }] } }] });
  ok('明細列合併', JSON.stringify(s.results[0].data.trucks.map(t => t.id + t.plate)) === '["t1A1","t2B","t3C"]', s.results);
  // 刪除
  s = await call(bob, 'sync', { push: [{ id: rec2.id, kind: 'records', project: P, base: 3, del: true }] });
  ok('同事不能刪別人的', s.results[0].status === 'denied');
  s = await call(amy, 'sync', { push: [{ id: rec2.id, kind: 'records', project: P, base: 1, del: true }] });
  ok('刪除時別人改過 → 不刪', s.results[0].status === 'merged' && s.results[0].data, s.results);
  s = await call(amy, 'sync', { push: [{ id: rec2.id, kind: 'records', project: P, base: 3, del: true }] });
  ok('刪除自己的', s.results[0].status === 'ok' && s.results[0].gone, s.results);
  s = await call(lead, 'sync', { cursor: 0 });
  ok('拉到刪除標記', s.pull.some(x => x.id === rec2.id && x.deleted));
  // 範本：同事不能發布、主管可以
  const tpl = { id: 'tp' + P, custom: true, name: '自訂', items: [{ t: 'a' }] };
  ok('同事不能發布範本', (await call(amy, 'sync', { push: [{ id: tpl.id, kind: 'templates', base: 0, data: tpl }] })).results[0].status === 'denied');
  ok('主管發布範本', (await call(lead, 'sync', { push: [{ id: tpl.id, kind: 'templates', base: 0, data: tpl }] })).results[0].status === 'ok');
  // 新加入專案的人：整個專案補給他
  const cur0 = (await call(bob, 'sync', { cursor: 0 })).cursor;
  const P2 = P + 'b'; await call(boss, 'sync', { projects: [{ id: P2, name: '第二案' }], push: [{ id: 'z' + P, kind: 'records', project: P2, base: 0, data: { id: 'z' + P, siteId: P2 } }] });
  await call(boss, `projects/${P2}/members`, { email: bob, role: 'member' });
  s = await call(bob, 'sync', { cursor: cur0 + 1, known: [P] });
  ok('新加入的專案補資料', s.pull.some(x => x.id === 'z' + P), s.pull.map(x => x.id));
  // 停權
  await call(boss, 'users', { email: bob, name: 'Bob', disabled: true });
  ok('停權後不能同步', (await call(bob, 'sync', { cursor: 0 })).error === 'disabled');
  ok('不能停權設定裡的管理員', (await call(boss, 'users', { email: boss, disabled: true })).error === 'boot_admin');
  console.log(out.join('\n')); console.log(out.filter(x => x[0] === '✗').length ? '有失敗' : '全部通過');
})();
