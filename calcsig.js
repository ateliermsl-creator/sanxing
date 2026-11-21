"use strict";
/* ---------- 計算書簽名（2026-11-21 使用者要求：混凝土方數與所有結構計算書都能在手機手寫簽名） ----------
   計算書下方（不列印）有「✍ 計算人員簽名」「✍ 工地主任簽名」，用勤前教育的大簽名框 saSigPad（safety.js）。
   簽名印在計算書原本的簽名欄，名字後面加簽名日期。
   每個簽名記下簽名當時計算書內容的指紋 fp（整張 .paper 的文字，扣掉簽名欄與「今天日期」）：
   之後改了任何輸入、結果或名稱，指紋不同，舊簽名就不印，畫面提醒重簽（改回原數字會再出現）。
   簽名資料：{ calc: { img, at, fp }, boss: { img, at, fp } }（at 為 ISO 時間），清理規則是 safe.js 的 ccsg。
   存放：混凝土方數在 calcCfg.sigs 與該筆方數紀錄 vols.cfg.sigs（volume.js）；
         結構計算在 localStorage「calcSigs」，依分頁 { col: {...}, wall: {...} }（輸入本來就只存在 localStorage）。
   結構計算書由 calc.js 的 renderStruct 畫完後統一套上，各計算機不用改。 */
const CSG_ROLES = [["calc", "計算人員"], ["boss", "工地主任"]];
const csgHash = s => { let h = 5381, g = 52711; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h = (h * 33) ^ c; g = (g * 31) ^ c; } return (h >>> 0).toString(36) + (g >>> 0).toString(36) + s.length.toString(36); };
function csgFp(paper) {
  const c = paper.cloneNode(true);
  c.querySelectorAll(".psigs").forEach(x => x.remove());
  return csgHash(c.textContent.split(today()).join("").split(rocYmd(today())).join("").replace(/\s+/g, " ").trim());
}
const csgDay = iso => { const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ""; const p = n => String(n).padStart(2, "0"); return `${d.getFullYear() - 1911}/${p(d.getMonth() + 1)}/${p(d.getDate())}`; };   // 本地日期、民國年

// 結構計算：localStorage「calcSigs」
const csgAll = () => { try { const o = JSON.parse(localStorage.getItem("calcSigs") || "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } };
const csgLs = tab => ({
  get: () => ccsg(csgAll()[tab]),
  set: v => {
    const o = csgAll(); if (Object.keys(v).length) o[tab] = v; else delete o[tab];
    try { localStorage.setItem("calcSigs", JSON.stringify(o)); } catch { alert("簽名沒有存成功（這支手機的瀏覽器儲存空間不足）。"); }
  }
});

// 畫完計算書後呼叫：store = { get() → 簽名資料, set(新資料)（可 async） }，redraw = 重畫計算書
function csgBind(store, redraw) {
  const paper = $(".paper", view), ps = paper && $(".psigs", paper); if (!ps) return;
  const labels = [...ps.children].map(d => d.textContent.trim());
  const fp = csgFp(paper), all = store.get() || {};
  const ok = k => (all[k] && all[k].img && all[k].fp === fp ? all[k] : null);
  const any = CSG_ROLES.some(([k]) => ok(k)), stale = CSG_ROLES.filter(([k]) => all[k] && !ok(k)).map(([, l]) => l);
  ps.classList.toggle("signed", any);
  ps.innerHTML = CSG_ROLES.map(([k], i) => { const s = ok(k);
    return `<div>${any ? `<span class="psl">${s ? `<img src="${safeImg(s.img)}" alt="">` : ""}</span>` : "<br><br>"}${esc(labels[i] || "")}${s ? "　" + esc(csgDay(s.at)) : ""}</div>`; }).join("");
  paper.insertAdjacentHTML("afterend", `<div class="noprint csgbar">
    ${stale.length ? `<p class="cnote csgold">⚠ ${esc(stale.join("、"))}簽名後計算內容有修改，舊簽名不會印出，請重新簽名。</p>` : ""}
    <div class="row prsign">${CSG_ROLES.map(([k, l]) => `<button class="sec" data-csg="${k}">✍ ${ok(k) ? l + "重簽" : l + "簽名"}</button>`).join("")}</div></div>`);
  view.querySelectorAll("[data-csg]").forEach(b => b.onclick = () => {
    const k = b.dataset.csg, l = CSG_ROLES.find(r => r[0] === k)[1];
    if (ok(k) && !confirm(`${l}已經簽過了，要重新簽名嗎？`)) return;
    saSigPad(l, ok(k)?.img || "", async sig => {
      const n = { ...(store.get() || {}) };
      if (sig) n[k] = { img: sig, at: new Date().toISOString(), fp }; else delete n[k];
      await store.set(n); redraw();
    });
  });
}
