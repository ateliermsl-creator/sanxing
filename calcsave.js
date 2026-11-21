"use strict";
/* ---------- 結構計算「存到專案」（2026-11-20 使用者要求計算資料也能雲端同步） ----------
   各結構計算的輸入原本只存在這支手機的 localStorage（calcColForm2 等，一個分頁一份）。
   這裡在每個結構計算頁上方加一列：「💾 存到專案」把目前輸入存成 IndexedDB「calcs」一筆紀錄（依專案，可多筆），
   「📂 計算紀錄」開啟／複製／刪除。開啟中的紀錄在輸入改變時自動存回（包住 ls.set）。
   紀錄：{ id, siteId, tab, name, data（該分頁輸入整份）, lib（自訂材料庫，開啟時補進對方手機）, created, updated }
   雲端版由 cloud.js 同步；同事建立的紀錄只能看：開啟後載入自己的計算機，不會改到原紀錄，要保留請另存。
   必須在各結構計算檔之後載入（包住 renderStruct）；ls 要等 app.js 載入後才包。 */
const CS_KEYS = { col: "calcColForm2", wall: "calcWallForm", slab: "calcSlabForm", beam: "calcBeamForm", scaf: "calcScafForm", brk: "calcBrkForm", row: "calcRowForm", anc: "calcAncForm", sec: "calcSecForm" };
const CS_LIB = ["col", "wall", "slab", "beam", "sec"];   // 會用到自訂材料庫（calcColLib）的分頁
const csCurAll = () => { try { const o = JSON.parse(ls.get("calcCur", "{}")); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
const csCur = tab => csCurAll()[tab] || "";
const csSetCur = (tab, id) => { const o = csCurAll(); if (id) o[tab] = id; else delete o[tab]; ls.set("calcCur", JSON.stringify(o)); };
const csTab = () => { const [, page, tab, sub] = location.hash.split("/"); return page === "struct" && CS_KEYS[tab] && !sub ? tab : ""; };
const csData = tab => { try { const d = JSON.parse(ls.get(CS_KEYS[tab], "null")); return d && typeof d === "object" ? d : {}; } catch { return {}; } };
const csLib = () => { try { const a = JSON.parse(ls.get("calcColLib", "[]")); return Array.isArray(a) ? a.slice(0, 60) : []; } catch { return []; } };
const csStamp = t => { if (!t) return ""; const d = new Date(t), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const csRO = async rec => (window.cloudRO ? await cloudRO("calcs", rec) : "");

// 開啟中的紀錄：輸入改變時自動存回（只在該分頁畫面上、而且自己可以改的時候）
let csTimer = 0, csQuiet = false;
document.addEventListener("DOMContentLoaded", () => {   // ls 在 app.js 才定義（這支比 app.js 先載入）
  const csLsSet = ls.set;
  ls.set = (k, v) => {
    csLsSet(k, v);
    if (csQuiet) return;
    const tab = csTab();
    if (tab && (CS_KEYS[tab] === k || (k === "calcColLib" && CS_LIB.includes(tab))) && csCur(tab)) { clearTimeout(csTimer); csTimer = setTimeout(() => csWrite(tab), 600); }
  };
});
async function csWrite(tab) {
  csTimer = 0;
  const id = csCur(tab); if (!id) return;
  const rec = await DB.get("calcs", id);
  if (!rec || rec.tab !== tab) { csSetCur(tab, ""); csPaint(); return; }
  if (await csRO(rec)) { csSetCur(tab, ""); csPaint(); return; }
  const data = csData(tab), lib = CS_LIB.includes(tab) ? csLib() : rec.lib;
  if (JSON.stringify(data) === JSON.stringify(rec.data) && JSON.stringify(lib) === JSON.stringify(rec.lib)) return;   // 只是開啟、沒有改：不寫入，免得多一個版次
  rec.data = data; if (lib) rec.lib = lib; rec.updated = Date.now();
  await DB.put("calcs", rec); csPaint();
}
// 把紀錄載入計算機（輸入整份換掉；自訂材料庫只補上沒有的）
function csLoad(rec, cur) {
  csQuiet = true;
  try {
    ls.set(CS_KEYS[rec.tab], JSON.stringify(rec.data || {}));
    if (Array.isArray(rec.lib) && rec.lib.length) {
      const mine = csLib(), ids = new Set(mine.map(p => p && p.id));
      const add = rec.lib.filter(p => p && p.id && !ids.has(p.id));
      if (add.length) ls.set("calcColLib", JSON.stringify([...mine, ...add].slice(0, 60)));
    }
  } finally { csQuiet = false; }
  csSetCur(rec.tab, cur ? rec.id : "");
}

// 畫在結構計算頁上方（#calcBox 前面，不會被各計算機重畫蓋掉）
async function csPaint() {
  const tab = csTab(), box = $("#calcBox"); if (!tab || !box) return;
  let el = $("#csBar");
  if (!el) {
    el = document.createElement("div"); el.id = "csBar"; el.className = "panel vfile";
    box.before(el);
    el.onclick = csClick;
  }
  const id = csCur(tab); let rec = id ? await DB.get("calcs", id) : null;
  if (rec && rec.siteId !== siteId) rec = null;   // 換了專案：輸入留著，但不再存回別的專案的紀錄
  if (id && !rec) csSetCur(tab, "");
  const all = siteId ? (await DB.all("calcs")).filter(x => x.siteId === siteId && x.tab === tab).sort((a, b) => (b.updated || 0) - (a.updated || 0)) : [];
  const open = el.querySelector("#csList")?.hidden === false, msg = el.querySelector("#csMsg")?.textContent || "";
  const ro = [];
  for (const x of all) ro.push(await csRO(x));
  if (csTab() !== tab) return;
  el.innerHTML = `
    <div class="vfname"><small>目前紀錄</small><b>${rec ? esc(rec.name) : "未存到專案"}</b><small>${rec ? `✓ 已存到專案 ${esc(csStamp(rec.updated))}，之後的修改會自動更新` : siteId ? "輸入只暫存在這支手機；要給同事看或換手機用，請存到專案" : "要存到專案請先建立或選擇專案（右上角＋）"}</small></div>
    <div class="vfbtn"><button class="sec${open ? " on" : ""}" id="csOpen" aria-expanded="${open}" aria-controls="csList">📂 計算紀錄${all.length ? `（${all.length}）` : ""}</button><button class="sec" id="csNew">＋ 新計算</button></div>
    <div class="cssave"><input id="csName" placeholder="紀錄名稱，例：3F 柱模 C1" value="${esc(rec ? rec.name : "")}" maxlength="100" aria-label="紀錄名稱"><button id="csSave">${rec ? "💾 改名／存" : "💾 存到專案"}</button></div>
    <small id="csMsg" class="cnote" style="display:block;margin:4px 0 0">${esc(msg)}</small>
    <div id="csList"${open ? "" : " hidden"}>${all.length ? `<p class="cnote" style="margin:8px 0 4px">這個專案的${esc(structName(tab))}紀錄（新的在前）：</p>` + all.map((x, i) => `<div class="vsrow${rec && rec.id === x.id ? " on" : ""}" data-id="${esc(x.id)}">
      <div class="vsname"><b>${esc(x.name || "（未命名）")}</b>${rec && rec.id === x.id ? "（開啟中）" : ""}<small>${esc(csStamp(x.updated))}${ro[i] ? "・同事建立，只能看" : ""}</small></div>
      <div class="vsbtn"><button class="sec" data-csopen="1">開啟</button><button class="sec" data-cscopy="1">複製</button>${ro[i] ? "" : `<button class="danger" data-csdel="1" aria-label="刪除「${esc(x.name)}」">刪除</button>`}</div></div>`).join("")
      : `<p class="cnote" style="margin:8px 0 0">${siteId ? "這個專案還沒有存過這種計算。" : "請先建立或選擇專案（右上角＋）。"}</p>`}</div>`;
}
const csMsg = t => { const m = $("#csMsg"); if (m) m.textContent = t; };
async function csClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  const tab = csTab(); if (!tab) return;
  if (b.id === "csOpen") { const l = $("#csList"), open = l.hidden; l.hidden = !open; b.setAttribute("aria-expanded", String(open)); b.classList.toggle("on", open); return; }
  if (b.id === "csSave") {
    if (!siteId) { csMsg("請先建立或選擇專案（右上角＋）。"); return; }
    const name = $("#csName").value.trim();
    if (!name) { csMsg("請先填紀錄名稱，例如：3F 柱模 C1"); $("#csName").focus(); return; }
    let rec = csCur(tab) ? await DB.get("calcs", csCur(tab)) : null;
    if (rec && await csRO(rec)) rec = null;
    rec = { ...(rec || { id: uid(), siteId, tab, created: Date.now() }), name, data: csData(tab), updated: Date.now() };
    if (CS_LIB.includes(tab)) rec.lib = csLib();
    await DB.put("calcs", rec); csSetCur(tab, rec.id); csMsg(""); csPaint(); return;
  }
  if (b.id === "csNew") {
    const rec = csCur(tab) ? await DB.get("calcs", csCur(tab)) : null;
    if (!rec && Object.keys(csData(tab)).length && !(await uiConfirm("目前的輸入還沒存到專案，要清空開始新計算嗎？"))) return;
    if (csTimer) { clearTimeout(csTimer); await csWrite(tab); }
    csQuiet = true; try { localStorage.removeItem(CS_KEYS[tab]); } catch {} csQuiet = false;
    csSetCur(tab, ""); route(); return;
  }
  const id = b.closest("[data-id]")?.dataset.id; if (!id) return;
  const x = await DB.get("calcs", id); if (!x) { csPaint(); return; }
  if (b.dataset.csopen || b.dataset.cscopy) {
    const cur = csCur(tab) ? await DB.get("calcs", csCur(tab)) : null;
    if (!cur && Object.keys(csData(tab)).length && !(await uiConfirm("目前的輸入還沒存到專案，開啟後會被取代。要繼續嗎？"))) return;
    if (csTimer) { clearTimeout(csTimer); await csWrite(tab); }
    if (b.dataset.cscopy) {
      const c = { ...x, id: uid(), siteId, name: (x.name || "") + "（複本）", created: Date.now(), updated: Date.now() };
      await DB.put("calcs", c); csLoad(c, true);
    } else {
      const ro = await csRO(x);
      csLoad(x, !ro);
      if (ro) { route(); setTimeout(() => csMsg("這份由同事建立，已載入你的計算機，不會改到原紀錄；要保留修改請填名稱另存。"), 300); return; }
    }
    route(); return;
  }
  if (b.dataset.csdel) {
    if (!(await uiConfirm(`刪除「${x.name || "（未命名）"}」？刪除後無法復原。`))) return;
    await DB.del("calcs", id); if (csCur(tab) === id) csSetCur(tab, ""); csPaint();
  }
}
// 每次畫結構計算頁後補上這一列
const csRenderStruct = renderStruct;
renderStruct = function (tab, sub) { const r = csRenderStruct(tab, sub); if (csTab()) csPaint(); return r; };
// 雲端收到同事改了「我正開著的那筆」：換成收到的內容（cloud.js 呼叫，之後會重畫畫面）
function csApplied(rec) { if (rec && csCur(rec.tab) === rec.id && !csTimer) csLoad(rec, true); }
