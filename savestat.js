"use strict";
/* ---------- 表單儲存狀態（全站共用） ----------
   各表單本來就是「改了就存」到手機的 IndexedDB，但狀態字只在頁首、捲下去就看不到，「暫存」兩字也容易誤會成沒存。
   這裡統一：
   1. 右下角低調小標籤：儲存中… → ✓ 已自動儲存 hh:mm；存失敗顯示 ⚠（多半是手機空間不足）。
   2. 換頁、切到別的 App、關閉網頁時，立刻寫入還在等待的修改（不必等 0.3 秒的延遲）。
   3. 表單最下方「💾 儲存並返回」：給習慣按儲存的人一個確定的動作。
   用法：const sv = svAuto(() => DB.put("logs", r));  改了欄位就 sv.save()，要立刻寫入就 await sv.flush()。
   必須在 app.js 之前載入：換頁時先寫入，列表頁讀到的才會是最新內容（IndexedDB 依交易建立順序執行）。 */
let svCur = null;   // 目前頁面上的表單
const svTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
function svTip() {
  let el = document.getElementById("saveTip");
  if (!el) { el = document.createElement("div"); el.id = "saveTip"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); el.hidden = true; document.body.appendChild(el); }
  return el;
}
// state：ready（剛開啟）、saving、saved、error、unsaved（方數尚未存檔）、kept（計算機輸入已保留）
function svShow(state, text) {
  const el = svTip();
  el.hidden = false; el.className = "sv-" + state;
  el.textContent = text || { ready: "✓ 已儲存在這支手機", saving: "儲存中…", saved: `✓ 已自動儲存 ${svTime()}`, error: "⚠ 儲存失敗，請檢查手機空間", unsaved: "尚未存檔", kept: `✓ 輸入已自動保留 ${svTime()}` }[state] || "";
  document.body.classList.add("svon");
}
function svHide() { const el = document.getElementById("saveTip"); if (el) el.hidden = true; document.body.classList.remove("svon"); }

function svAuto(write, delay = 300) {
  let timer = null, chain = Promise.resolve();
  const api = {
    pending: false,
    save() { api.pending = true; if (svCur === api) svShow("saving"); clearTimeout(timer); timer = setTimeout(() => api.flush().catch(() => {}), delay); },
    flush() {
      clearTimeout(timer); timer = null; api.pending = false;
      chain = chain.catch(() => {}).then(async () => {   // 依序寫入，不會讓舊內容蓋掉新內容
        try { await write(); if (svCur === api) svShow("saved"); }
        catch (e) { if (svCur === api) svShow("error"); throw e; }
      });
      return chain;
    }
  };
  if (svCur?.pending) svCur.flush().catch(() => {});   // 同一頁重畫（例如新增一列）時，先寫入上一份
  svCur = api; svShow("ready");
  return api;
}
// 表單底部「儲存並返回」：立刻寫入，成功後回列表；寫入失敗就留在原頁
function svDoneRow(id = "svDone") { return `<div class="row"><button id="${id}">💾 儲存並返回</button></div>`; }
function svBindDone(sv, back, id = "svDone") {
  const b = document.getElementById(id); if (!b) return;
  b.onclick = async () => {
    b.disabled = true;
    try { await sv.flush(); goBack(back); } catch { uiAlert("儲存失敗，可能是手機儲存空間不足。資料還在畫面上，請先清出空間再試一次。"); }
    finally { b.disabled = false; }
  };
}
// 計算機：輸入存在 localStorage，存下時顯示「輸入已自動保留」
function svKept() { svCur = null; svShow("kept"); }

// 換頁：先寫入上一頁還沒寫的修改，再藏起提示（新頁面若是表單會再叫出來）
window.addEventListener("hashchange", () => { const c = svCur; svCur = null; if (c?.pending) c.flush().catch(() => {}); svHide(); });
const svLeave = () => { if (svCur?.pending) svCur.flush().catch(() => {}); };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") svLeave(); });
window.addEventListener("pagehide", svLeave);
window.addEventListener("beforeunload", e => { if (svCur?.pending) { svLeave(); e.preventDefault(); e.returnValue = ""; } });

/* ---------- 完成／修改（全站共用） ----------
   2026-11-17 使用者選定用語：「✔ 完成…」與「✎ 修改這份紀錄」（不叫鎖定／解除鎖定）。
   完成：r.locked = 完成時間，整份唯讀（欄位、勾選、照片、附件、簽名都不能改，不能直接刪除），預覽／列印照常。
   修改：確認後解除，時間記進 r.reopened，畫面顯示「完成後曾修改」（單據不印）。
   用法：const sv = dnSv(r, svAuto(...))；頁首放 dnBanner(r)；底部放 dnRow(r, 儲存鈕 id)；最後 dnBind(r, sv, {label, del, rerender, check})。
   自主檢查表（app.js renderForm）是最早的版本，用自己的寫法，資料欄位相同。 */
const dnStamp = ms => { const d = new Date(ms), z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
const dnReo = r => Array.isArray(r.reopened) ? r.reopened : [];
function dnSv(r, sv) { if (r.locked) sv.save = () => {}; return sv; }   // 已完成：畫面上的自動帶入等不寫回
function dnBanner(r, hint = "要改請按最下方「✎ 修改這份紀錄」。") {
  const reo = dnReo(r);
  if (r.locked) return `<div class="cllock">✔ 已完成・${esc(dnStamp(r.locked))}<small>內容只能查看、預覽與列印；${esc(hint)}${reo.length ? `<br>完成後曾修改：${reo.map(x => esc(dnStamp(x))).join("、")}` : ""}</small></div>`;
  return reo.length ? `<div class="cllock reopen">✎ 修改中（這份曾完成過）<small>${esc(dnStamp(reo[reo.length - 1]))} 開啟修改，改好請再按一次最下方的完成按鈕。</small></div>` : "";
}
function dnRow(r, doneId = "svDone", label = "✔ 完成") {
  return r.locked ? `<div class="row"><button class="sec" id="dnEdit">✎ 修改這份紀錄</button></div>`
    : `<div class="row"><button class="sec" id="${doneId}">💾 儲存並返回</button><button id="dnDone">${esc(label)}</button></div>`;
}
function dnBind(r, sv, o = {}) {
  const root = document.getElementById("view");
  root.classList.toggle("dnlock", !!r.locked);
  if (r.locked) {
    const keep = ["#dnEdit", o.del, o.keep, ".tipbtn", "[data-a=open]", "[data-a=share]", ".dn-keep *"].filter(Boolean).join(",");
    root.querySelectorAll("input, select, textarea, button").forEach(el => {
      if (el.matches(keep)) return;
      el.disabled = true;
      if (el.tagName === "BUTTON" && !el.matches(".sym button, .chip, .sasig")) el.style.display = "none";   // 新增、清除、✕ 這類按鈕直接藏起
    });
    root.querySelectorAll("label.phbtn, [data-dnhide]").forEach(el => { el.style.display = "none"; });
    if (o.del) root.querySelector(o.del)?.setAttribute("data-dndel", "");
  }
  const done = document.getElementById("dnDone");
  if (done) done.onclick = async () => {
    const warn = (o.check ? o.check() : []).filter(Boolean), label = (o.label || "完成").replace(/^✔\s*/, "");
    if (!(await uiConfirm(`${warn.length ? "⚠ " + warn.join("；") + "。\n\n" : ""}確定${label}？\n完成後內容只能查看與列印，要改時可以按「修改」。`))) return;
    r.locked = Date.now();
    try { await sv.flush(); } catch { delete r.locked; uiAlert("儲存失敗，可能是手機儲存空間不足，還沒有完成。"); return; }
    o.rerender();
  };
  const edit = document.getElementById("dnEdit");
  if (edit) edit.onclick = async () => {
    if (!(await uiConfirm("這份已完成。要修改內容嗎？\n簽名會保留，並記下修改時間；改好請再按一次「完成」。"))) return;
    delete r.locked; r.reopened = [...dnReo(r), Date.now()].slice(-20);
    try { await sv.flush(); } catch { r.locked = Date.now(); uiAlert("儲存失敗，可能是手機儲存空間不足。"); return; }
    o.rerender();
  };
}
// 已完成的紀錄按「刪除」：先攔下（捕獲階段，比各表單自己的刪除先執行）
document.addEventListener("click", e => {
  const b = e.target.closest?.("[data-dndel]");
  if (!b || !document.getElementById("view")?.classList.contains("dnlock")) return;
  e.preventDefault(); e.stopImmediatePropagation();
  uiAlert("已完成的紀錄不能直接刪除，請先按「✎ 修改這份紀錄」。");
}, true);
// 換頁時拿掉唯讀樣式（#view 是共用的容器）
window.addEventListener("hashchange", () => document.getElementById("view")?.classList.remove("dnlock"));
