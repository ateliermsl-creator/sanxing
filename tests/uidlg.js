// 測試用：把 App 的站內對話框（ui.js 的 uiAlert／uiConfirm／uiPrompt）轉成 Playwright 的 'dialog' 事件
// 2026-11-22 原生 alert／confirm／prompt 改成站內對話框後，舊測試的 p.on('dialog', d => d.accept()) 照樣可用：
//   d.type()（alert／confirm／prompt）、d.message()、d.defaultValue()、d.accept(文字)、d.dismiss()
// 真的去按對話框上的按鈕（會經過畫面），沒有人接的對話框會自動取消（同 Playwright 原生行為）。
// 用法：測試檔最上面 require('./uidlg');
const pw = require('playwright');
const HOOK = () => {
  const seen = new WeakSet();
  const scan = () => document.querySelectorAll('dialog.uidlg[open]').forEach(async d => {
    if (seen.has(d)) return; seen.add(d);
    const inp = d.querySelector('.uiin'), btns = d.querySelectorAll('.uibtns button');
    const type = inp ? 'prompt' : btns.length > 1 ? 'confirm' : 'alert';
    const r = await window.__uiDlgBridge({ type, message: d.querySelector('.uimsg').textContent, def: inp ? inp.value : '' });
    if (!d.open) return;
    if (inp && r.ok && r.value !== undefined && !inp.readOnly) inp.value = r.value;
    (r.ok ? btns[btns.length - 1] : (btns.length > 1 ? btns[0] : btns[0])).click();
  });
  new MutationObserver(scan).observe(document, { childList: true, subtree: true });
};
const wire = async ctx => {
  if (ctx.__uiWired) return; ctx.__uiWired = true;
  await ctx.exposeBinding('__uiDlgBridge', ({ page }, info) => new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    const dlg = { type: () => info.type, message: () => info.message, defaultValue: () => info.def,
      accept: async v => fin({ ok: true, value: v }), dismiss: async () => fin({ ok: false }) };
    if (page.listenerCount('dialog')) page.emit('dialog', dlg); else fin({ ok: false });
  }));
  await ctx.addInitScript(HOOK);
};
const origLaunch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await origLaunch(...a);
  const nc = b.newContext.bind(b);
  b.newContext = async (...o) => { const c = await nc(...o); await wire(c); return c; };
  b.newPage = async (...o) => { const c = await b.newContext(...o); const p = await c.newPage(); p.close = (orig => async (...x) => { await orig(...x); await c.close(); })(p.close.bind(p)); return p; };
  return b;
};
