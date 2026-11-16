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
    try { await sv.flush(); goBack(back); } catch { alert("儲存失敗，可能是手機儲存空間不足。資料還在畫面上，請先清出空間再試一次。"); }
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
