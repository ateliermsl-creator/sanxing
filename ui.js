"use strict";
/* 站內對話框與提示（2026-11-22 品牌識別 R5：取代瀏覽器原生 alert／confirm／prompt）
   原生對話框在各手機長得不一樣、標題會出現網址、也不能把「刪除」做成危險樣式。
   uiAlert(訊息)            → Promise，按「知道了」才結束（不用 await 也可以，畫面不會被擋住）
   uiConfirm(訊息, 選項)     → Promise<boolean>，一定要 await；呼叫的函式要是 async
   uiPrompt(訊息, 預設值)    → Promise<string|null>，取消是 null（同原生 prompt）；預設值有換行時顯示成唯讀多行框（給人複製用）
   uiToast(訊息)            → 上方低調小提示，幾秒後自動消失（「已複製」這類不用按的通知）
   選項：ok（確定鈕文字）、cancel、danger（紅色確定鈕）。沒指定時依訊息判斷：含「刪除」→ 確定鈕叫「刪除」且為紅色，「清除」「移出」「停權」同理。
   新功能一律用這組，不要再用 alert／confirm／prompt。 */

const UI_DANGER = ["刪除", "清除", "移出", "停權", "不核准"];

function uiDlg({ msg, ok = "確定", cancel = "", input = null, danger = false }) {
  if (typeof HTMLDialogElement !== "function") {                       // 很舊的瀏覽器：退回原生
    if (input !== null) return Promise.resolve(window.prompt(msg, input));
    return Promise.resolve(cancel ? window.confirm(msg) : (window.alert(msg), true));
  }
  return new Promise(res => {
    const d = document.createElement("dialog");
    d.className = "uidlg";
    d.innerHTML = `<form method="dialog">
      <p class="uimsg">${esc(msg)}</p>
      ${input === null ? "" : input.includes("\n") ? `<textarea class="uiin" rows="6" readonly>${esc(input)}</textarea>` : `<input class="uiin" enterkeyhint="done" value="${esc(input)}" autofocus>`}
      <div class="uibtns">${cancel ? `<button value="0" class="sec"${input === null ? " autofocus" : ""}>${esc(cancel)}</button>` : ""}<button value="1" class="${danger ? "uidz" : ""}"${!cancel ? " autofocus" : ""}>${esc(ok)}</button></div></form>`;
    const inp = d.querySelector(".uiin");
    inp?.addEventListener("keydown", e => { if (e.key === "Enter" && !e.isComposing && inp.tagName === "INPUT") { e.preventDefault(); d.close("1"); } });
    d.addEventListener("keydown", e => e.stopPropagation());              // Esc 只關對話框，不要連後面的簽名框一起關
    d.addEventListener("close", () => {
      const yes = d.returnValue === "1";
      d.remove();
      res(input !== null ? (yes ? inp.value : null) : cancel ? yes : true);
    });
    d.addEventListener("click", e => { if (e.target === d && cancel) d.close("0"); });   // 點對話框外面＝取消（只顯示訊息的不關，避免誤觸沒看到）
    document.body.appendChild(d);
    d.showModal();
    if (inp) { inp.focus(); inp.select(); }
  });
}
function uiAlert(msg) { return uiDlg({ msg: String(msg ?? ""), ok: "知道了" }); }
function uiConfirm(msg, o = {}) {
  msg = String(msg ?? "");
  const w = UI_DANGER.find(x => msg.includes(x));
  return uiDlg({ msg, cancel: o.cancel || "取消", ok: o.ok || w || "確定", danger: o.danger ?? !!w });
}
function uiPrompt(msg, def = "") { return uiDlg({ msg: String(msg ?? ""), cancel: "取消", ok: "確定", input: String(def ?? "") }); }
function uiToast(msg, ms = 3500) {
  let el = document.getElementById("uiToast");
  if (!el) { el = document.createElement("div"); el.id = "uiToast"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite"); document.body.appendChild(el); el.addEventListener("click", () => { el.hidden = true; }); }
  el.textContent = String(msg ?? ""); el.hidden = false;
  clearTimeout(uiToast.t); uiToast.t = setTimeout(() => { el.hidden = true; }, ms);
}
