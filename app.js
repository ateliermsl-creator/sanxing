"use strict";
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };   // 用手機的本地日期（toISOString 是 UTC，台灣凌晨 0～8 點會算成前一天）
const ls = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};

/* ---------- 內建瀏覽器（LINE、Facebook…）偵測 ----------
   這類 App 內建的瀏覽器不支援 window.print()、不能加入主畫面，資料也與 Safari／Chrome 分開存放 */
const inAppName = () => { const ua = navigator.userAgent; return /\bLine\//i.test(ua) ? "LINE" : /FBAN|FBAV|FB_IAB/i.test(ua) ? "Facebook" : /Instagram/i.test(ua) ? "Instagram" : /MicroMessenger/i.test(ua) ? "微信" : ""; };
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints > 1 || /Mobile\//.test(navigator.userAgent)));   // iPadOS 的 Safari 會假裝成 Mac
async function copyUrl() {
  const url = location.href.split("#")[0];
  try { await navigator.clipboard.writeText(url); alert("已複製網址，請打開 Safari 貼上網址。"); } catch { prompt("請複製這個網址，貼到 Safari 開啟", url); }
}
function inAppHelp() {
  const n = inAppName(), where = isIOS() ? "右下角的「分享」圖示 ⬆ →「在 Safari 開啟」" : "右上角選單 ⋮ →「以其他瀏覽器開啟」或「在 Chrome 開啟」";
  return { n, where, text: `目前是在 ${n} 的內建瀏覽器裡，無法列印或存成 PDF，也不能加入主畫面。\n\n請改用 ${isIOS() ? "Safari" : "Chrome"} 開啟：點${where}。\n\n注意：內建瀏覽器與 ${isIOS() ? "Safari" : "Chrome"} 的資料是分開的，在這裡填的資料不會出現在那邊。` };
}
// 列印／存成 PDF：內建瀏覽器按了不會有反應，所以改成說明怎麼處理
function doPrint() {
  if (inAppName()) { if (confirm(inAppHelp().text + "\n\n要複製網址嗎？")) copyUrl(); return; }
  window.print();
}
function showInAppBanner() {
  const el = $("#iab"); if (!el) return;
  if (!inAppName() || sessionStorage.getItem("iabHide")) { el.hidden = true; return; }
  const h = inAppHelp();
  el.hidden = false;
  el.innerHTML = `⚠ 你在 <b>${h.n} 內建瀏覽器</b>，無法列印／存 PDF，也不能加入主畫面。請點${h.where}。<br><button class="sec" id="iabCopy" style="min-height:36px;font-size:14px;padding:0 12px;margin-top:6px">複製網址</button> <button class="sec" id="iabHide" style="min-height:36px;font-size:14px;padding:0 12px;margin-top:6px">先不要提醒</button>`;
  $("#iabCopy").onclick = copyUrl;
  $("#iabHide").onclick = () => { try { sessionStorage.setItem("iabHide", "1"); } catch {} el.hidden = true; };
}

/* ---------- 加到手機桌面（安裝教學） ---------- */
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
let deferredInstall = null;      // Android Chrome 的「安裝」提示事件
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; });
window.addEventListener("appinstalled", () => { deferredInstall = null; });
function renderInstall() {
  const ios = isIOS(), android = /Android/i.test(navigator.userAgent), iab = inAppName();
  const iosSteps = `<ol class="steps"><li>用 <b>Safari</b> 開啟本網址（不是 LINE、Facebook 內建瀏覽器，也不是 Chrome）。</li>
    <li>點 <b>分享</b> 圖示（方形加向上箭頭 ⬆）：iPhone 在畫面<b>下方中間</b>，iPad 在畫面<b>右上角</b>網址列旁。</li>
    <li>往下滑，點 <b>「加入主畫面」</b>。</li>
    <li>名稱會是「三星蔥工具箱」，按右上角 <b>「加入」</b>。</li>
    <li>回到桌面，點<b>三星蔥圖示</b>開啟，以後都從這個圖示進來。</li></ol>`;
  const andSteps = `<ol class="steps"><li>用 <b>Chrome</b> 開啟本網址（不是 LINE、Facebook 內建瀏覽器）。</li>
    <li>點右上角選單 <b>⋮</b>。</li>
    <li>點 <b>「加到主畫面」</b> 或 <b>「安裝應用程式」</b>。</li>
    <li>在跳出的視窗按 <b>「安裝」</b> 或 <b>「新增」</b>。</li>
    <li>回到桌面，點<b>三星蔥圖示</b>開啟。</li></ol>
    <p class="cnote">Samsung Internet：點選單 ≡ →「新增頁面到」→「主畫面」。</p>`;
  view.innerHTML = `<h2 class="t">📲 加到手機桌面</h2>
    ${isStandalone() ? `<div class="legend" style="background:#e6f4e6;border-color:#bfe0bf;color:#1d5c1d">✓ 你現在就是從桌面圖示開啟的，已經安裝好了。</div>` : ""}
    ${iab ? `<div class="legend" style="background:#ffe9d6;border-color:#f3c79f;color:#7a3b00">⚠ 你現在在 <b>${iab} 內建瀏覽器</b>，無法加入主畫面。請先改用 ${ios ? "Safari" : "Chrome"} 開啟：點${inAppHelp().where}。<br><button class="sec" id="inCopy" style="min-height:36px;font-size:14px;padding:0 12px;margin-top:6px">複製網址</button></div>` : ""}
    <div class="panel"><b>為什麼要加到桌面？</b><ul style="margin:6px 0 0;padding-left:20px;line-height:1.7"><li>點一下圖示就開，像一般 App，沒有網址列。</li><li>第一次要有網路載入，之後<b>沒有網路也能用</b>。</li><li>不會被當成一般網頁，手機比較不會清掉資料。</li></ul></div>
    ${android && deferredInstall ? `<div class="row"><button id="instNow">⬇ 一鍵安裝到桌面</button></div>` : ""}
    <div class="panel"><h2 style="margin:0 0 6px;font-size:18px">${ios ? "🍎 iPhone／iPad（你的裝置）" : android ? "🤖 Android 手機（你的裝置）" : "📱 手機"}</h2>${ios ? iosSteps : android ? andSteps : iosSteps}</div>
    <details class="panel"><summary>${ios ? "Android 手機怎麼做" : "iPhone／iPad 怎麼做"}</summary><div style="margin-top:8px">${ios ? andSteps : iosSteps}</div></details>
    <div class="panel"><b>先看這幾點</b><ul style="margin:6px 0 0;padding-left:20px;line-height:1.7">
      <li>iPhone／iPad：<b>桌面圖示和 Safari 的資料是分開存放的</b>。建議<b>先加到桌面，再從圖示開始使用</b>。如果已經在 Safari 填了資料：先在 Safari 到「備份與還原」下載備份檔，再從桌面圖示匯入。</li>
      <li>換手機或清除瀏覽器資料前，也請先備份。</li>
      <li>更新：有網路時開啟圖示，會自動換成新版，不必重新安裝。</li></ul></div>
    <div class="row"><button class="sec" id="inCopy2">複製網址</button></div>`;
  $("#inCopy")?.addEventListener("click", copyUrl); $("#inCopy2").onclick = copyUrl;
  $("#instNow")?.addEventListener("click", async () => { try { deferredInstall.prompt(); await deferredInstall.userChoice; } catch {} deferredInstall = null; renderInstall(); });
}

/* ---------- 欄位標籤綁定輸入框（易用性）----------
   各頁的 <label> 多半沒有 for：點標籤不會跳到輸入框、讀屏軟體也念不出欄位名。
   畫面更新後自動把 .field 內的 label 綁到同一格的第一個輸入框 */
let lblSeq = 0;
function bindLabels(root = view) {
  root.querySelectorAll(".field > label:not([for])").forEach(lb => {
    if (lb.querySelector("input,select,textarea")) return;
    const c = lb.parentElement.querySelector("input:not([type=hidden]),select,textarea");
    if (!c) return;
    if (!c.id) c.id = "fld" + (++lblSeq);
    lb.htmlFor = c.id;
  });
}
new MutationObserver(() => bindLabels()).observe(view, { childList: true, subtree: true });

/* ---------- IndexedDB ---------- */
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open("avocado-toolbox", 13);
  r.onupgradeneeded = () => {   // sync：雲端同步記錄哪一份改過（cloud.js），不是使用者資料，不放進備份
    for (const n of ["sites", "records", "templates", "photos", "workorders", "punch", "pours", "matrecs", "matcats", "files", "shots", "safety", "logs", "vols", "sync"])
      if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: "id" });
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(store, mode, fn) {
  const db = await dbp;
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out.result);
    t.onerror = () => rej(t.error);
  });
}
const DB = {
  all: s => tx(s, "readonly", o => o.getAll()),
  get: (s, id) => tx(s, "readonly", o => o.get(id)),
  put: (s, v) => tx(s, "readwrite", o => o.put(v)),
  del: (s, id) => tx(s, "readwrite", o => o.delete(id))
};

/* ---------- 範本（內建 + 自訂） ---------- */
const BUILTIN = window.TEMPLATES.slice();
async function loadTemplates() {
  const custom = (await DB.all("templates")).sort((a, b) => a.created - b.created);
  window.TEMPLATES = BUILTIN.concat(custom);
}

/* ---------- 工地 ---------- */
let sites = [];
let siteId = ls.get("siteId", "");
async function loadSites() {
  sites = (await DB.all("sites")).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  // 公司名稱改成每個工地各自一份：舊工地第一次載入時帶入原本的全站公司名稱
  for (const s of sites) if (typeof s.company !== "string") { s.company = ls.get("company", ""); await DB.put("sites", s); }
  if (!sites.find(s => s.id === siteId)) siteId = sites[0]?.id || "";
  ls.set("siteId", siteId);
  const sel = $("#siteSelect");
  sel.innerHTML = sites.length
    ? sites.map(s => `<option value="${s.id}" ${s.id === siteId ? "selected" : ""}>${esc(s.name)}</option>`).join("")
    : `<option value="">尚未建立工地</option>`;
}
/* 公司名稱跟著工地（專案）走；舊工地沒有這個欄位時沿用以前的全站設定 */
function siteCompany(sid = siteId) {
  const s = sites.find(x => x.id === sid);
  return s && typeof s.company === "string" ? s.company : ls.get("company", "");
}
$("#siteSelect").onchange = e => { siteId = e.target.value; ls.set("siteId", siteId); route(); };
/* mode: "first" 第一次使用（不可取消）／"add" 新增工地／"edit" 修改目前工地與公司 */
function openSetup(mode) {
  const d = $("#setup"), cur = sites.find(x => x.id === siteId);
  const blk = mode === "edit" && cur && window.cloudSiteBlock?.(cur.id, "edit");
  if (blk) { alert(blk); return; }
  $("#setupTitle").textContent = { first: "開始使用：先填寫工地", add: "新增工地", edit: "工地與公司設定" }[mode];
  $("#setupHint").hidden = mode !== "first";
  $("#sName").value = mode === "edit" && cur ? cur.name : "";
  $("#sCompany").value = mode === "edit" && cur ? siteCompany(cur.id) : ls.get("company", "");
  $("#sOk").textContent = mode === "first" ? "開始填表" : "儲存";
  $("#sCancel").hidden = mode === "first";
  $("#sDel").hidden = !(mode === "edit" && cur);
  d.dataset.mode = mode;
  d.showModal();
}
$("#setup").addEventListener("cancel", e => { if ($("#setup").dataset.mode === "first") e.preventDefault(); });
$("#sCancel").onclick = () => $("#setup").close();
$("#setupForm").addEventListener("submit", async e => {
  const name = $("#sName").value.trim();
  if (!name) { e.preventDefault(); return; }
  const mode = $("#setup").dataset.mode;
  const company = $("#sCompany").value.trim();
  ls.set("company", company); // 當作下次新增工地的預設值
  if (mode === "edit" && siteId) {
    const s = sites.find(x => x.id === siteId); s.name = name; s.company = company; await DB.put("sites", s);
  } else {
    let s = sites.find(x => x.name === name);
    if (!s) { s = { id: uid(), name, company }; await DB.put("sites", s); }
    siteId = s.id; ls.set("siteId", siteId);
  }
  await loadSites(); route();
});
// 刪除工地：連同底下所有檢查表、點工單、缺失、澆置、材料進場、照片與附加檔案一併刪除
$("#sDel").onclick = async () => {
  const cur = sites.find(x => x.id === siteId); if (!cur) return;
  const blk = window.cloudSiteBlock?.(cur.id, "del"); if (blk) { alert(blk); return; }
  const stores = ["records", "workorders", "punch", "pours", "matrecs", "shots", "safety", "logs", "vols"], mine = {}, ids = new Set();
  for (const st of stores) {
    mine[st] = (await DB.all(st)).filter(x => x.siteId === cur.id);
    for (const x of mine[st]) { ids.add(x.id); for (const t of x.trucks || []) ids.add(t.id); }
  }
  const total = stores.reduce((a, st) => a + mine[st].length, 0);
  if (!confirm(`要刪除工地「${cur.name}」嗎？\n\n底下共 ${total} 筆資料（檢查表 ${mine.records.length}、點工單 ${mine.workorders.length}、缺失 ${mine.punch.length}、澆置 ${mine.pours.length}、材料進場 ${mine.matrecs.length}、施工照片 ${mine.shots.length}、勤前教育 ${mine.safety.length}、施工日誌 ${mine.logs.length}、混凝土方數 ${mine.vols.length}）與其照片、附加檔案都會一併刪除，無法復原。\n\n建議先到「備份」匯出一份。`)) return;
  const typed = prompt(`為了避免誤刪，請輸入工地名稱確認：\n${cur.name}`);
  if (typed === null) return;
  if (typed.trim() !== cur.name) { alert("名稱不符，沒有刪除。"); return; }
  for (const st of stores) for (const x of mine[st]) await DB.del(st, x.id);
  for (const ph of await DB.all("photos")) if (ids.has(ph.recId)) await DB.del("photos", ph.id);
  await attPurge([...ids]);
  await DB.del("sites", cur.id);
  $("#setup").close(); siteId = "";
  await loadSites();
  if (!sites.length) { goReplace("#/"); openSetup("first"); } else route();
};
$("#addSiteBtn").onclick = () => openSetup("add");
$("#setBtn").onclick = () => openSetup(siteId ? "edit" : "first");
// 返回：站內有上一頁時才真的退回（讓瀏覽紀錄保持乾淨、系統返回鍵才會一致）；
// 直接用連結開啟、重新整理後或沒有站內上一頁時，改成回到上一層，避免跳出網站
let appSeq = history.state?.n || 0, firstSeq = null, replaceN;
function stampHistory() {          // 幫每個瀏覽紀錄編號，才知道目前這一頁是不是站內的第一頁
  if (!(history.state && typeof history.state.n === "number")) { history.replaceState({ ...(history.state || {}), n: replaceN ?? ++appSeq }, ""); }
  replaceN = undefined;
  if (firstSeq === null) firstSeq = history.state.n;
}
const goReplace = h => { replaceN = history.state?.n; location.replace(h); };
function goBack(fallback) {
  if (!(history.state && history.state.n > firstSeq)) { goReplace(fallback); return; }
  const before = location.hash;
  history.back();
  setTimeout(() => { if (location.hash === before) goReplace(fallback); }, 300);
}
function parentHash() {
  const [, page, a, b, c] = location.hash.split("/");
  if (page === "checklist") return a ? (b === "preview" ? "#/checklist/" + a : "#/checklist") : "#/";
  if (page === "workorder") return a ? (b === "preview" ? "#/workorder/" + a : "#/workorder") : "#/";
  if (page === "punch") return a ? "#/punch" : "#/";
  if (page === "material") return !a ? "#/" : b === "print" ? "#/material/" + a : "#/material";
  if (page === "pour") return a === "summary" ? "#/pour" : !a ? "#/" : b === "truck" || b === "print" ? "#/pour/" + a : "#/pour";
  if (page === "shot") return a ? "#/shot" : "#/";
  if (page === "cure") return a === "set" && b === "pour" && safeId(c) ? "#/pour/" + c : a ? "#/cure" : "#/";
  if (page === "log") return !a ? "#/" : b === "print" ? "#/log/" + a : "#/log";
  if (page === "safety") return !a ? "#/" : b === "print" ? "#/safety/" + a : "#/safety";
  if (page === "calc") return b ? "#/calc/" + a : "#/";
  if (page === "struct") return b ? "#/struct/" + a : a ? "#/struct" : "#/";
  if (page === "template") return "#/checklist/new";
  return "#/";   // cloud 等
}
$("#homeBtn").onclick = () => {
  const toHome = () => { if (location.hash.replace(/^#\/?/, "")) location.hash = "#/"; };
  if (!$("#lb").hidden) { window.addEventListener("popstate", toHome, { once: true }); closeLightbox(); return; }   // 先關閉照片預覽（它會退一步瀏覽紀錄），再回首頁
  toHome();
};
$("#backBtn").onclick = () => { if (!$("#lb").hidden) { closeLightbox(); return; } goBack(parentHash()); };

/* ---------- 路由 ---------- */
window.addEventListener("hashchange", route);
async function route() {
  stampHistory();
  showInAppBanner();
  document.getElementById("psumPrint")?.remove();   // 總表的橫式列印設定只對總表有效
  document.querySelectorAll(".psheet").forEach(e => e.remove());   // 換頁時關掉浮出的面板
  const [, page, a, b2, c2] = location.hash.split("/");
  $("#topbar").hidden = !page;
  // 第一次使用要先建立工地；但安裝教學、計算機、備份不需要工地，不要擋住
  if (!sites.length && !["install", "calc", "struct", "backup", "cloud"].includes(page || "") && !$("#setup").open && !window.cloudFirst?.()) openSetup("first");
  window.scrollTo(0, 0);
  if (page === "checklist") {
    if (!a) return renderChecklist();
    if (a === "new") return renderChecklistPick();
    return location.hash.endsWith("/preview") ? renderPreview(a) : renderForm(a);
  }
  if (page === "pour") return renderPour(a, b2, c2);
  if (page === "shot") return renderShot(a, b2);
  if (page === "cure") return renderCure(a, b2, c2);
  if (page === "safety") return renderSafety(a, b2);
  if (page === "log") return renderLog(a, b2);
  if (page === "material") return renderMaterial(a, b2);
  if (page === "install") return renderInstall();
  if (page === "punch") return renderPunch(a);
  if (page === "workorder") return renderWorkorder(a, location.hash.endsWith("/preview"));
  if (page === "calc") return renderCalc(a, b2);
  if (page === "struct") return renderStruct(a, b2);
  if (page === "template") return renderTemplateEditor(a);
  if (page === "backup") return renderBackup();
  if (page === "cloud" && window.renderCloud) return renderCloud();
  return renderHome();
}

/* ---------- 首頁 ---------- */
async function renderHome() {
  let updates = [];
  try { updates = await (await fetch("updates.json")).json(); } catch {}
  let cuN = 0; try { cuN = await cuUrgent(); } catch {}
  if (location.hash.split("/")[1]) return;   // 讀取期間已切到別的頁面，就不要用首頁蓋掉它
  view.innerHTML = `
    <div class="htop"><div class="hbak" id="hBak" hidden></div><div class="hbar"><span class="hbic" aria-hidden="true">🏗️</span>${sites.length
      ? `<span class="hblbl">所在專案：</span><span class="hbname"><b id="hName">${esc((sites.find(s => s.id === siteId) || sites[0]).name)}</b>${sites.length > 1 ? " ▾" : ""}<select id="hSite" aria-label="切換所在專案">${sites.map(s => `<option value="${esc(s.id)}" ${s.id === siteId ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></span><span class="hbact"><button class="lnk" id="hEdit" aria-label="修改所在專案" title="修改所在專案">✎</button><button class="lnk" id="hAdd" aria-label="新增專案" title="新增專案">＋</button></span>`
      : `尚未建立專案，<button class="lnk t" id="hAdd">新增專案</button>`}</div></div>
    ${!isStandalone() && !inAppName() && !(() => { try { return localStorage.getItem("installHint"); } catch { return ""; } })() ? `<div class="hint" id="instHint">📲 把工具箱放到手機桌面，像 App 一樣使用、沒有網路也能開。<br><a href="#/install">看教學</a>　<button class="sec" id="instHide" style="min-height:34px;font-size:14px;padding:0 12px">不用提醒</button></div>` : ""}
    <section class="hero"><img src="leek.png" alt=""><h1>三星蔥工具箱</h1><p>粗糲的現場，需要最純粹的隨身器物</p></section>
    <a class="card" href="#/checklist"><img src="leek.png" alt=""><div><b>自主檢查表</b><small>施工自主檢查・手寫簽名・PDF 列印</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/safety"><div class="ph">👷</div><div><b>職安衛勤前教育／危害告知</b><small>全體合照・高風險作業・九宮格手寫簽到・A4 簽到表</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/log"><div class="ph">📒</div><div><b>施工日誌</b><small>B14-4 格式・自動累計・帶入材料與取樣・A4 PDF</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/material"><div class="ph">📦</div><div><b>材料進場驗收</b><small>類別檢查項目・簽名・照片・進場台帳</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/pour"><div class="ph">🚛</div><div><b>混凝土澆置抽驗</b><small>車號・坍度・氯離子・試體・簽名・方量統計</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/cure"><div class="ph">🧪</div><div><b>試體養護與拆模追蹤</b><small>${cuN ? `⚠️ ${cuN} 項待處理・` : ""}7／28 天試壓提醒・拆模齡期・強度台帳</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/punch"><div class="ph">📌</div><div><b>缺失改善追蹤</b><small>初複驗・位置拍照・期限・工班分派</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/workorder"><div class="ph">📝</div><div><b>點工單／機械出工</b><small>當場簽認・工時彙總・月結對帳</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/calc"><div class="ph">🧮</div><div><b>工程計算機</b><small>鋼筋稱號・鋼筋重量・混凝土方數・坡度高程・面積・泥作材料・穿樑套管</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/shot"><div class="ph">📷</div><div><b>施工照片（電子黑板）</b><small>黑板合成在照片上・照片冊・分享 PDF</small></div><span class="arrow">›</span></a>
    <h2 class="hsec">📐 結構計算 <small>假設工程檢核・A4 計算書</small></h2>
    ${STRUCT_CATS.map(c => `<a class="card" href="#/struct/${c.tabs[0]}"><div class="ph">${c.icon}</div><div><b>${c.t}</b><small>${c.tabs.map(structName).map(esc).join("・")}</small></div><span class="arrow">›</span></a>`).join("")}
    <h2 class="hsec">備份與安裝</h2>
    <a class="card" href="#/backup"><div class="ph">💾</div><div><b>備份與還原</b><small>下載備份檔・匯入備份檔</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/install"><div class="ph">📲</div><div><b>加到手機桌面</b><small>像 App 一樣使用・教學</small></div><span class="arrow">›</span></a>
    <div class="card soon"><div class="ph">＋</div><div><b>更多工具開發中</b><small>敬請期待</small></div></div>
    <details class="panel"><summary><b>📢 最新更新</b>${updates[0] ? ` <small style="color:var(--mut)">${esc(updates[0].date)}</small>` : ""}</summary>${updates.map(u => `<div class="d">${esc(u.date)}</div><ul>${u.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")}</details>`;
  $("#hSite")?.addEventListener("change", e => { siteId = e.target.value; ls.set("siteId", siteId); $("#siteSelect").value = siteId; $("#hName").textContent = sites.find(s => s.id === siteId)?.name || ""; });
  $("#hAdd")?.addEventListener("click", () => openSetup("add"));
  $("#hEdit")?.addEventListener("click", () => openSetup("edit"));
  $("#instHide")?.addEventListener("click", () => { try { localStorage.setItem("installHint", "1"); } catch {} $("#instHint").remove(); });
  checkBackup();
  window.cloudHome?.();
}
function checkBackup() {
  const last = ls.get("lastBackup", "");
  const w = $("#backupWarn");
  const days = last ? (Date.now() - Date.parse(last)) / 864e5 : Infinity;
  const hb = $("#hBak");   // 首頁：和「目前工程」排在同一行的小標籤（CSS 會藏掉上方整條）
  for (const el of [w, hb]) if (el) {
    if (days > 7) { el.hidden = false; el.innerHTML = el === hb ? `<a href="#/backup">💾 ${last ? "7 天沒備份" : "還沒備份"}</a>` : `💾 ${last ? "已超過 7 天沒備份" : "還沒有備份過"}，<a href="#/backup">現在備份</a>`; }
    else el.hidden = true;
  }
}

/* ---------- 照片 ---------- */
// 縮圖壓縮並蓋上日期時間與工地名稱（存證用），存成 JPEG dataURL
async function makePhoto(file, stamp) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); }); }
  const w0 = bmp.width, h0 = bmp.height, k = Math.min(1, 1280 / Math.max(w0, h0));
  const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const g = c.getContext("2d"); g.drawImage(bmp, 0, 0, c.width, c.height);
  const fs = Math.max(14, Math.round(c.width / 38));
  g.font = `600 ${fs}px sans-serif`; g.textBaseline = "bottom";
  const tw = g.measureText(stamp).width;
  g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, c.height - fs * 1.6, tw + fs, fs * 1.6);
  g.fillStyle = "#fff"; g.fillText(stamp, fs / 2, c.height - fs * 0.3);
  return c.toDataURL("image/jpeg", 0.72);
}
const photosOf = async recId => (await DB.all("photos")).filter(p => p.recId === recId).sort((a, b) => a.created - b.created);

/* ---------- 網頁內建相機（共用） ----------
   直接開鏡頭、可連續拍攝；iPhone 主畫面 App 不支援直接開相機的 capture 屬性。
   onShot(blob)：每拍一張呼叫；onFiles(files)：內建相機開不起來、改用手機相機 App 時呼叫 */
async function openCamera(title, onShot, onFiles) {
  const cam = $("#cam"), v = $("#camV");
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch (err) {
    // 內建相機開不起來：說明原因，並提供「改用手機原本的相機 App」備用按鈕（需使用者再點一次）
    const ua = navigator.userAgent;
    const hint = /Android/i.test(ua)
      ? "請點網址列左邊的鎖頭圖示 →「權限」→「相機」→「允許」。若是從主畫面圖示開啟：長按圖示 →「應用程式資訊」→「權限」→「相機」→「允許」。"
      : isIOS() ? "請到「設定 → Safari → 相機」改成「詢問」或「允許」。"
      : "請在瀏覽器網址列允許使用相機。";
    $("#camErrMsg").textContent = `無法開啟內建相機（${err?.name || "未知錯誤"}）。${hint}`;
    $("#camFb").onchange = async e => { const files = [...e.target.files]; e.target.value = ""; $("#camErr").close(); await onFiles(files); };
    $("#camErr").showModal();
    return;
  }
  v.srcObject = stream; cam.hidden = false;
  let n = 0, busy = false;
  $("#camTitle").textContent = title;
  $("#camCount").textContent = "已拍 0 張";
  const close = () => { stream.getTracks().forEach(t => t.stop()); v.srcObject = null; cam.hidden = true; };
  $("#camDone").onclick = close;
  $("#camShot").onclick = async () => {
    if (busy || !v.videoWidth) return;
    busy = true;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.92));
    cam.classList.add("flash"); setTimeout(() => cam.classList.remove("flash"), 120);
    try { await onShot(blob); n++; $("#camCount").textContent = `已拍 ${n} 張`; } catch { alert("存檔失敗"); }
    busy = false;
  };
}

/* ---------- 照片放大預覽 ---------- */
function openLightbox(list, idx) {
  const lb = $("#lb"); let k = idx, x0 = null;
  const show = () => {
    $("#lbImg").src = list[k].data;
    $("#lbCount").textContent = list.length > 1 ? `${k + 1} / ${list.length}` : "";
    $("#lbPrev").hidden = $("#lbNext").hidden = list.length < 2;
  };
  const step = d => { k = (k + d + list.length) % list.length; show(); };
  $("#lbPrev").onclick = () => step(-1);
  $("#lbNext").onclick = () => step(1);
  $("#lbClose").onclick = () => closeLightbox();
  lb.onclick = e => { if (e.target === lb) closeLightbox(); };
  lb.ontouchstart = e => { x0 = e.touches.length === 1 ? e.touches[0].clientX : null; };
  lb.ontouchend = e => { if (x0 === null || list.length < 2) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 70 && !(window.visualViewport && window.visualViewport.scale > 1.05)) step(dx < 0 ? 1 : -1); x0 = null; };
  show(); lb.hidden = false;
  history.pushState({ lb: 1 }, "");   // 讓 Android 返回鍵先關閉預覽
}
function closeLightbox(fromPop) {
  const lb = $("#lb"); if (lb.hidden) return;
  lb.hidden = true; $("#lbImg").removeAttribute("src");
  if (!fromPop && history.state?.lb) history.back();
}
window.addEventListener("popstate", () => closeLightbox(true));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); });

/* ---------- 檢查表列表 ---------- */
// 入口是「已填紀錄」列表；按「＋ 新增檢查表」先選表（#/checklist/new），每次新增都是獨立的一筆紀錄，同一張表可填很多次
let cat = "全部", clFilter = "all", clTpl = "", clQuery = "";
const SYM = { ok: "○", ng: "✕", na: "／" };
const doneCount = r => Object.values(r.items || {}).filter(i => i.r).length;
const ngCount = r => Object.values(r.items || {}).filter(i => i.r === "ng").length;
const tplShort = t => t ? t.name.replace("施工自主檢查表", "").replace("自主檢查表", "") || t.name : "";
const clStatus = (r, t) => r.locked || (t && doneCount(r) >= t.items.length) ? "已完成" : "填寫中";
const clStamp = ms => { const d = new Date(ms), z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
const clNewRec = (templateId, from) => ({ id: uid(), siteId, templateId, docNo: "", contractor: from?.contractor ?? ls.get("contractor", ""), subcontractor: from?.subcontractor || "", date: today(), location: "", timing: {}, items: {}, sigs: {}, updated: Date.now() });
// 按了新增卻什麼都沒填就離開的空白紀錄，回到列表時清掉（廠商、日期是自動帶入的，不算）
let clDirty = null;   // 表單裡還沒寫進資料庫的那一份（剛輸入就按返回），清空白紀錄前先存
async function clPurgeBlank() {
  if (clDirty) { const r = clDirty; clDirty = null; r.updated = Date.now(); await DB.put("records", r); }
  const recs = (await DB.all("records")).filter(r => r.siteId === siteId);
  const ph = new Set((await DB.all("photos")).map(p => p.recId)), fl = new Set((await DB.all("files")).map(f => f.recId));
  for (const r of recs) {
    if (window.cloudMine && !cloudMine("records", r.id)) continue;   // 雲端專案：只清自己建立的
    const blank = !r.locked && !String(r.location || "").trim() && !String(r.docNo || "").trim() && !String(r.subcontractor || "").trim()
      && !Object.values(r.timing || {}).some(Boolean) && !Object.keys(r.sigs || {}).length
      && !Object.values(r.items || {}).some(i => i && (i.r || String(i.actual ?? i.note ?? "").trim())) && !ph.has(r.id) && !fl.has(r.id);
    if (blank) await DB.del("records", r.id);
  }
}
async function renderChecklist() {
  const seq = renderChecklist.seq = (renderChecklist.seq || 0) + 1;
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  await clPurgeBlank();
  const all = (await DB.all("records")).filter(r => r.siteId === siteId).sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated);
  const pc = {}; for (const p of await DB.all("photos")) pc[p.recId] = (pc[p.recId] || 0) + 1;
  if (seq !== renderChecklist.seq || !/^#\/checklist\/?$/.test(location.hash)) return;   // 讀取期間已切到別頁（例如點開一份），不要蓋掉
  const tOf = r => TEMPLATES.find(x => x.id === r.templateId);
  const used = [...new Set(all.map(r => r.templateId))].map(id => TEMPLATES.find(t => t.id === id) || { id, name: id, cat: "其他", items: [] });
  const ucats = [...new Set(used.map(t => t.cat))];
  if (clTpl && !(clTpl.startsWith("c:") ? ucats.includes(clTpl.slice(2)) : used.some(t => t.id === clTpl))) clTpl = "";   // 記著的表已沒有紀錄，就清掉
  const fit = { all: () => true, doing: r => clStatus(r, tOf(r)) === "填寫中", done: r => clStatus(r, tOf(r)) === "已完成", ng: r => ngCount(r) > 0 };
  const chips = [["all", "全部"], ["doing", "填寫中"], ["done", "已完成"], ["ng", "有缺失"]];
  const q = clQuery.trim();
  const list = all.filter(r => {
    const t = tOf(r);
    if (!fit[clFilter](r)) return false;
    if (clTpl && (clTpl.startsWith("c:") ? (t?.cat || "其他") !== clTpl.slice(2) : r.templateId !== clTpl)) return false;
    return !q || [t?.name, r.location, r.docNo, r.subcontractor, r.date].join(" ").includes(q);
  });
  view.innerHTML = `
    <h2 class="t">自主檢查表</h2>
    <div class="row" style="margin-top:0"><a class="btnlink" id="clAdd" href="#/checklist/new" style="background:var(--g);color:#f5f1e8">＋ 新增檢查表</a></div>
    ${all.length ? `<div class="chips">${chips.map(([k, l]) => `<button class="chip ${k === clFilter ? "on" : ""}" data-cf="${k}">${l}（${all.filter(fit[k]).length}）</button>`).join("")}</div>
    <div class="panel" style="padding:10px 12px"><div class="grid2" style="gap:0 8px">
      <div class="field" style="margin:0"><input id="clQ" placeholder="搜尋位置／編號／表名" value="${esc(clQuery)}"></div>
      <div class="field" style="margin:0"><select id="clT" aria-label="依表單篩選"><option value="">全部表單</option>${ucats.map(c => `<optgroup label="${esc(c)}"><option value="c:${esc(c)}" ${clTpl === "c:" + c ? "selected" : ""}>${esc(c)}類全部</option>${used.filter(t => t.cat === c).map(t => `<option value="${esc(t.id)}" ${t.id === clTpl ? "selected" : ""}>${esc(tplShort(t))}</option>`).join("")}</optgroup>`).join("")}</select></div></div>
      <small style="color:var(--mut)">所在專案共 ${all.length} 筆，顯示 ${list.length} 筆</small></div>` : ""}
    ${list.length ? list.map(r => {
      const t = tOf(r), ng = ngCount(r), st = clStatus(r, t);
      return `<a class="rec" href="#/checklist/${esc(r.id)}"><div class="ptop"><b>${esc(t ? tplShort(t) : r.templateId)}</b><span class="st st-${st}">${r.locked ? "🔒 " : ""}${st}</span></div>
        <small><span class="tag">${esc(t?.cat || "其他")}</span>${esc(r.date)}・${r.location ? esc(r.location) : "未填位置"}${r.docNo ? "・編號 " + esc(r.docNo) : ""}</small><br>
        <small>已標記 ${doneCount(r)}/${t?.items.length ?? "?"} 項${pc[r.id] ? `・📷${pc[r.id]}` : ""}${ng ? `・<span style="color:var(--bad)">有缺失 ${ng} 項</span>` : ""}</small></a>`;
    }).join("")
    : `<div class="panel" style="color:var(--mut)">${all.length ? `這個條件下沒有紀錄。<br><button class="sec" id="clClear" style="margin-top:8px;min-height:40px">清除篩選，顯示全部</button>`
      : "這個專案還沒有檢查表紀錄。<br>按「＋ 新增檢查表」選一張表開始填，同一張表可以依位置、日期填很多份。"}</div>`}`;
  view.querySelectorAll("[data-cf]").forEach(b => b.onclick = () => { clFilter = b.dataset.cf; renderChecklist(); });
  $("#clClear")?.addEventListener("click", () => { clFilter = "all"; clTpl = ""; clQuery = ""; renderChecklist(); });
  const qi = $("#clQ");
  if (qi) qi.oninput = () => { clQuery = qi.value; clearTimeout(renderChecklist.t); renderChecklist.t = setTimeout(async () => { await renderChecklist(); const el = $("#clQ"); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 350); };
  $("#clT")?.addEventListener("change", e => { clTpl = e.target.value; renderChecklist(); });
}

/* ---------- 選擇要填的檢查表 ---------- */
let pickQuery = "";
async function renderChecklistPick() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const recs = (await DB.all("records")).filter(r => r.siteId === siteId).sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated);
  const shown = TEMPLATES.filter(t => !t.retired);   // 舊示範表不列出，舊紀錄仍可開啟
  const cats = ["全部", ...new Set(shown.map(t => t.cat))];
  if (!cats.includes(cat)) cat = "全部";
  const stat = {}; for (const r of recs) (stat[r.templateId] = stat[r.templateId] || []).push(r);
  const recent = [...new Set(recs.slice().sort((a, b) => b.updated - a.updated).map(r => r.templateId))].map(id => shown.find(t => t.id === id)).filter(Boolean).slice(0, 4);
  const row = t => {
    const mine = stat[t.id] || [];
    return `<div class="trow"><div class="tinfo"><span class="tag">${esc(t.cat)}</span>${t.custom ? `<span class="tag" style="color:var(--g)">自訂</span>` : ""}<b>${esc(tplShort(t))}</b>
      <small>${mine.length ? `已填 ${mine.length} 份・最近 ${esc(mine[0].date)}${mine[0].location ? "・" + esc(mine[0].location) : ""}` : `${t.items.length} 個檢查項目`}</small></div>
      ${t.custom ? `<a class="btnlink sm" href="#/template/${esc(t.id)}" aria-label="編輯範本">✎</a>` : ""}<button data-new="${esc(t.id)}">填這張</button></div>`;
  };
  const draw = () => {
    const q = pickQuery.trim();
    const list = shown.filter(t => (cat === "全部" || t.cat === cat) && (!q || (t.name + t.cat + (t.sub || "")).includes(q)));
    $("#pkList").innerHTML = `${!q && cat === "全部" && recent.length ? `<h2 class="t" style="font-size:16px">最近用過</h2>${recent.map(row).join("")}<h2 class="t" style="font-size:16px">全部檢查表</h2>` : ""}
      ${list.length ? list.map(row).join("") : `<div class="panel" style="color:var(--mut)">找不到符合的檢查表</div>`}`;
    view.querySelectorAll("[data-cat]").forEach(b => b.classList.toggle("on", b.dataset.cat === cat));
  };
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">選擇要填的檢查表</h2>
    <div style="margin:0 12px 8px;color:var(--mut);font-size:14px">點「填這張」會新增一份獨立紀錄，存在所在專案底下。</div>
    <div class="panel" style="padding:10px 12px"><div class="field" style="margin:0"><input id="pkQ" placeholder="搜尋表名，例如：鋼筋、模板、防水" value="${esc(pickQuery)}"></div></div>
    <div class="chips">${cats.map(c => `<button class="chip ${c === cat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}（${c === "全部" ? shown.length : shown.filter(t => t.cat === c).length}）</button>`).join("")}</div>
    <div id="pkList"></div>
    <div class="row"><a class="btnlink" href="#/template/new">📋 沒有合適的表？自訂空白檢查表</a></div>`;
  draw();
  view.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { cat = b.dataset.cat; draw(); });
  $("#pkQ").oninput = e => { pickQuery = e.target.value; draw(); };
  view.onclick = async e => {
    const b = e.target.closest?.("[data-new]"); if (!b) return;
    const rec = clNewRec(b.dataset.new);
    await DB.put("records", rec);
    goReplace("#/checklist/" + rec.id);   // 換掉選表頁，從表單按返回直接回到紀錄列表
  };
}

/* ---------- 填寫表單 ---------- */
const TIMING = [["before", "施工前"], ["during", "施工中"], ["after", "施工完成"]];
async function loadRec(id) {
  const rec = await DB.get("records", id);
  if (!rec) { goReplace("#/checklist"); return []; }
  rec.timing = rec.timing || {}; rec.items = rec.items || {}; rec.sigs = rec.sigs || {};
  return [rec, TEMPLATES.find(t => t.id === rec.templateId)];
}
async function renderForm(id) {
  const [rec, tpl] = await loadRec(id);
  if (!rec) return;
  let photos = await photosOf(rec.id);
  const ro = window.cloudRO ? await cloudRO("records", rec) : "", canReopen = !window.cloudCanReopen || cloudCanReopen(rec);   // 雲端專案：沒有權限的只能查看
  const locked = !!rec.locked || !!ro, dis = locked ? "disabled" : "", reo = Array.isArray(rec.reopened) ? rec.reopened : [];   // 填寫完畢鎖定：欄位、勾選、照片、簽名都不能改，要先解除鎖定
  const sv = svAuto(() => { if (clDirty === rec) clDirty = null; rec.updated = Date.now(); return DB.put("records", rec); });
  const save = () => { if (locked) return; clDirty = rec; sv.save(); };
  const flush = () => sv.flush();
  const prog = () => `已標記 ${doneCount(rec)}/${tpl.items.length} 項`;
  const inp = (k, lab, ph) => `<div class="field"><label>${lab}</label><input data-f="${k}" value="${esc(rec[k])}" placeholder="${ph || ""}" ${dis}></div>`;
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">${esc(tpl.name)}</h2>
    <div style="margin:0 12px;color:var(--mut);font-size:14px">${esc(tpl.cat)}・<span id="prog" style="color:#7a5418;font-weight:700">${prog()}</span></div>
    ${ro ? `<div class="cllock reopen">👁 ${esc(ro)}<small>${rec.locked ? `已完成檢查・${esc(clStamp(rec.locked))}` : "填寫中"}</small></div>` : locked ? `<div class="cllock">✔ 已完成檢查・${esc(clStamp(rec.locked))}<small>內容只能查看、預覽與列印；${canReopen ? "要改請按最下方「✎ 修改」" : "要修改請找工程主管或管理員"}。${reo.length ? `<br>完成後曾修改：${reo.map(x => esc(clStamp(x))).join("、")}` : ""}</small></div>`
      : reo.length ? `<div class="cllock reopen">✎ 修改中（這份曾完成過）<small>${esc(clStamp(reo[reo.length - 1]))} 開啟修改，改好請按最下方「✔ 完成檢查」。</small></div>` : ""}
    <div class="panel">
      ${inp("contractor", "承攬廠商", "廠商名稱")}${inp("subcontractor", "協力廠商", "協力廠商（如有）")}
      ${inp("location", "檢查位置", "例如：2F、B1 東側")}
      <div class="field"><label>檢查日期</label><input type="date" data-f="date" value="${esc(rec.date)}" ${dis}></div>
      ${inp("docNo", "編號", "表單編號（可空白）")}
      <div class="field"><label>檢查時機</label><div class="timing">${TIMING.map(([k, l]) => `<label><input type="checkbox" data-t="${k}" ${rec.timing[k] ? "checked" : ""} ${dis}> ${l}</label>`).join("")}</div></div>
    </div>
    <div class="legend">結果標記：<b style="color:var(--ok)">○ 合格</b>　<b style="color:var(--bad)">✕ 不合格</b>　<b style="color:var(--mut)">／ 不適用</b></div>
    ${tpl.items.map((it, i) => {
      const v = rec.items[i] || {};
      return `<div class="item" data-i="${i}"><div class="top"><div><div class="t"><span class="n">${i + 1}.</span> ${esc(it.t)}${it.note ? ` <button type="button" class="tipbtn" data-tip="${i}" aria-label="解說" aria-expanded="false">ⓘ</button>` : ""}</div>${it.std ? `<div class="m">規定標準：${esc(it.std)}</div>` : ""}${it.note ? `<div class="tipbox" data-tipbox="${i}" hidden>💡 ${esc(it.note)}</div>` : ""}</div>
        <div class="sym">${["ok", "ng", "na"].map(k => `<button class="${v.r === k ? "on" : ""}" data-r="${k}" aria-label="${k}" ${dis}>${SYM[k]}</button>`).join("")}</div></div>
        <input class="note" placeholder="${locked ? "" : "實際檢查情形（可空白）"}" value="${esc(v.actual ?? v.note)}" ${dis}>
        <div class="phrow">${locked ? "" : `<button type="button" class="phbtn" data-cam="${i}">📷 拍照</button><label class="phbtn alt">🖼 相簿<input type="file" accept="image/*" multiple hidden data-ph="${i}"></label>`}<div class="thumbs" data-th="${i}"></div></div></div>`;
    }).join("")}
    ${attBlock()}
    ${[["worker", "檢查人員簽名"], ["manager", "工地主任簽名"]].map(([k, l]) => `
      <div class="sigbox"><div class="bar"><b>${l}</b>${locked ? "" : `<button class="sec" data-clear="${k}">清除</button>`}</div>${locked
        ? (rec.sigs[k] ? `<img class="sigimg" src="${safeImg(rec.sigs[k])}" alt="${l}">` : `<div class="sigimg signo">未簽名</div>`)
        : `<canvas data-sig="${k}"></canvas>`}</div>`).join("")}
    ${locked ? "" : `<div class="row"><button class="sec" id="svDone">💾 儲存並返回</button><button id="lockBtn">✔ 完成檢查</button></div>`}
    <div class="row"><button class="${locked ? "" : "sec"}" id="previewBtn">👁 預覽／列印</button></div>
    <div class="row"><button class="sec" id="againBtn">＋ 同一張表再填一份</button></div>
    ${locked && !ro && canReopen ? `<div class="row"><button class="sec" id="unlockBtn">✎ 修改這份紀錄</button></div>` : ""}
    ${ro ? "" : `<div class="row"><button class="danger" id="delBtn">刪除這份紀錄</button></div>`}`;

  view.querySelectorAll("[data-f]").forEach(el => el.oninput = el.onchange = () => {
    rec[el.dataset.f] = el.value;
    if (el.dataset.f === "contractor") ls.set("contractor", el.value);
    save();
  });
  view.querySelectorAll("[data-t]").forEach(el => el.onchange = () => { rec.timing[el.dataset.t] = el.checked; save(); });
  view.querySelectorAll(".item").forEach(el => {
    const i = el.dataset.i, note = $(".note", el);
    el.querySelectorAll(".sym button").forEach(b => b.onclick = () => {
      const cur = rec.items[i] = rec.items[i] || {};
      cur.r = cur.r === b.dataset.r ? "" : b.dataset.r;
      el.querySelectorAll(".sym button").forEach(x => x.classList.toggle("on", x.dataset.r === cur.r));
      $("#prog").textContent = prog();
      save();
    });
    note.oninput = () => { (rec.items[i] = rec.items[i] || {}).actual = note.value; save(); };
  });
  const drawThumbs = i => {
    $(`[data-th="${i}"]`).innerHTML = photos.filter(p => p.itemIdx === i).map(p =>
      `<span class="th"><img src="${safeImg(p.data)}" alt="照片"><button data-delph="${esc(p.id)}" aria-label="刪除照片" ${locked ? "hidden" : ""}>✕</button></span>`).join("");
  };
  tpl.items.forEach((_, i) => drawThumbs(i));
  view.onclick = async e => {
    const tip = e.target.closest?.("[data-tip]");
    if (tip) {
      const box = $(`[data-tipbox="${tip.dataset.tip}"]`);
      box.hidden = !box.hidden; tip.setAttribute("aria-expanded", String(!box.hidden)); tip.classList.toggle("on", !box.hidden); return;
    }
    const th = e.target.closest?.(".th img");
    if (th) {
      const id0 = th.parentElement.querySelector("[data-delph]").dataset.delph;
      const cur = photos.find(x => x.id === id0), same = photos.filter(x => x.itemIdx === cur.itemIdx);
      openLightbox(same, same.indexOf(cur)); return;
    }
    const id = e.target.dataset?.delph; if (!id || locked) return;
    if (!confirm("刪除這張照片？")) return;
    const p = photos.find(x => x.id === id); await DB.del("photos", id);
    photos = photos.filter(x => x.id !== id); drawThumbs(p.itemIdx);
  };
  const addPhoto = async (i, file) => {
    const site = sites.find(s => s.id === rec.siteId);
    const p = { id: uid(), recId: rec.id, itemIdx: i, data: await makePhoto(file, `${rec.date || ""} ${site?.name || ""}`.trim()), created: Date.now() };
    await DB.put("photos", p); photos.push(p); drawThumbs(i);
  };
  view.querySelectorAll("input[data-ph]").forEach(inp => inp.onchange = async () => {
    const i = +inp.dataset.ph, files = [...inp.files]; inp.value = "";
    for (const f of files) { try { await addPhoto(i, f); } catch { alert("這張照片無法讀取，請換一張或重新拍攝"); } }
  });
  view.querySelectorAll("[data-cam]").forEach(btn => btn.onclick = () => {
    const i = +btn.dataset.cam;
    openCamera(`第 ${i + 1} 項：${tpl.items[i].t}`, blob => addPhoto(i, blob),
      async files => { for (const f of files) { try { await addPhoto(i, f); } catch { alert("這張照片無法讀取，請重新拍攝"); } } });
  });
  view.querySelectorAll("canvas").forEach(c => setupSig(c, rec, save));
  attBind(view, rec.id, { readonly: locked });
  svBindDone(sv, "#/checklist");
  $("#lockBtn")?.addEventListener("click", async () => {
    const left = tpl.items.length - doneCount(rec), noSig = [["worker", "檢查人員"], ["manager", "工地主任"]].filter(([k]) => !rec.sigs[k]).map(([, l]) => l);
    const warn = [left > 0 ? `還有 ${left} 項沒有標記結果` : "", noSig.length ? `${noSig.join("、")}尚未簽名` : ""].filter(Boolean);
    if (!confirm(`${warn.length ? "⚠ " + warn.join("；") + "。\n\n" : ""}確定完成檢查？\n完成後內容只能查看與列印，要改時可以按「修改」。`)) return;
    rec.locked = Date.now(); clDirty = rec;
    try { await flush(); } catch { delete rec.locked; alert("儲存失敗，可能是手機儲存空間不足，還沒有完成。"); return; }
    renderForm(id);
  });
  $("#unlockBtn")?.addEventListener("click", async () => {
    if (!confirm("這份已完成檢查。要修改內容嗎？\n簽名會保留，並記下修改時間；改好請再按一次「完成檢查」。")) return;
    delete rec.locked; rec.reopened = [...reo, Date.now()].slice(-20); clDirty = rec; await flush(); renderForm(id);
  });
  view.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => {
    const c = $(`canvas[data-sig=${b.dataset.clear}]`);
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    delete rec.sigs[b.dataset.clear]; save();
  });
  $("#previewBtn").onclick = async () => { await flush(); location.hash = "#/checklist/" + rec.id + "/preview"; };
  $("#againBtn").onclick = async () => {   // 新的一份：沿用廠商，位置、日期、結果、簽名都重新填
    await flush();
    const nr = clNewRec(rec.templateId, rec); nr.siteId = rec.siteId;
    await DB.put("records", nr); goReplace("#/checklist/" + nr.id);
  };
  $("#delBtn")?.addEventListener("click", async () => {
    if (locked) { alert("已完成的紀錄不能直接刪除，請先按「修改」。"); return; }
    if (!confirm("確定刪除這份紀錄？")) return;
    for (const p of photos) await DB.del("photos", p.id);
    await attPurge(rec.id); await DB.del("records", rec.id); goBack("#/checklist");
  });
}

function setupSig(c, rec, save) {
  const k = c.dataset.sig, ratio = window.devicePixelRatio || 1;
  c.width = c.clientWidth * ratio; c.height = c.clientHeight * ratio;
  const g = c.getContext("2d");
  g.scale(ratio, ratio); g.lineWidth = 2.5; g.lineCap = g.lineJoin = "round"; g.strokeStyle = "#111";
  if (rec.sigs[k]) { const im = new Image(); im.onload = () => g.drawImage(im, 0, 0, c.clientWidth, c.clientHeight); im.src = rec.sigs[k]; }
  let drawing = false;
  const pos = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  c.onpointerdown = e => { drawing = true; c.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...pos(e)); };
  c.onpointermove = e => { if (!drawing) return; g.lineTo(...pos(e)); g.stroke(); };
  const end = () => { if (!drawing) return; drawing = false; rec.sigs[k] = c.toDataURL("image/png"); save(); };
  c.onpointerup = c.onpointercancel = end;
}

/* ---------- 預覽／列印 ---------- */
async function renderPreview(id) {
  const [rec, tpl] = await loadRec(id);
  if (!rec) return;
  const site = sites.find(s => s.id === rec.siteId);
  const company = siteCompany(rec.siteId);
  const d = rec.date ? rec.date.replace(/^(\d+)-(\d+)-(\d+)$/, "$1 年 $2 月 $3 日") : "";
  const box = k => (rec.timing[k] ? "☑" : "□");
  const photos = await photosOf(rec.id);
  const withNotes = ls.get("pvNotes", "") === "1";
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回填表</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    ${tpl.items.some(it => it.note) ? `<label class="noprint pvopt"><input type="checkbox" id="pvNotes" ${withNotes ? "checked" : ""}> PDF 附解說（教育訓練用，正式送審請勿勾選）</label>` : ""}
    <div class="noprint" style="margin:0 12px 8px;color:var(--mut);font-size:13px">顯示目前填寫的內容。請用 Safari 開啟：iPhone 按列印後，在預覽縮圖上用兩指放大，即可「儲存到檔案」成 PDF；iPad 也是按列印，再用分享圖示存檔。</div>
    <div class="paper${withNotes ? "" : " nonotes"}">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">${esc(tpl.name)}</div>
      <div class="pno">編號：<span>${esc(rec.docNo)}</span></div>
      <table class="pt">
        <tr><th>工程名稱</th><td colspan="3">${esc(site?.name)}</td></tr>
        <tr><th>分項工程名稱</th><td colspan="3">${esc(tpl.sub)}</td></tr>
        <tr><th>承攬廠商</th><td>${esc(rec.contractor)}</td><th>協力廠商</th><td>${esc(rec.subcontractor)}</td></tr>
        <tr><th>檢查位置</th><td>${esc(rec.location)}</td><th>檢查日期</th><td>${esc(d)}</td></tr>
        <tr><th>檢查時機</th><td colspan="3">${TIMING.map(([k, l]) => `${box(k)}${l}`).join("　")}</td></tr>
        <tr><th>檢查結果</th><td colspan="3">○ 檢查合格　✕ 有缺失需改正　／ 無此檢查項目</td></tr>
      </table>
      <table class="pt items">
        <tr><th>檢查項目</th><th>管理標準</th><th>實際檢查結果<br>(量化檢查數據)</th><th style="width:16mm">檢查結果</th></tr>
        ${tpl.items.map((it, i) => { const v = rec.items[i] || {}; return `<tr><td>${esc(it.t)}</td><td>${esc(it.std)}${it.note ? `<div class="pnote">解說：${esc(it.note)}</div>` : ""}</td><td>${esc(v.actual ?? v.note)}</td><td class="c">${SYM[v.r] || ""}</td></tr>`; }).join("")}
        <tr><td colspan="4" class="recheck">缺失複查結果：<br>□已完成改善（檢附改善前中後照片）<br>□未完成改善，填具「缺失改善追蹤表」進行追蹤改善<br><br>複查日期：　　　年　　月　　日　　複查人員職稱：　　　　　　　　簽名：</td></tr>
        <tr><td colspan="4" class="recheck">備註：<br>1.檢查結果合格者註明「○」，不合格者註明「✕」，如無需檢查之項目則打「／」。</td></tr>
      </table>
      <div class="psigs">${[["worker", "檢查人員"], ["manager", "工地主任"]].map(([k, l]) => `<div>${rec.sigs[k] ? `<img src="${safeImg(rec.sigs[k])}">` : "<br><br>"}${l}</div>`).join("")}</div>
    </div>
    ${photos.length ? `<div class="paper gallery"><div class="ptitle">附件：檢查照片</div><div class="gal">${photos.map(p => `<figure><img src="${safeImg(p.data)}"><figcaption>第 ${p.itemIdx + 1} 項　${esc(tpl.items[p.itemIdx]?.t)}</figcaption></figure>`).join("")}</div></div>` : ""}`;
  { const ln = await attNamesLine(rec.id, true); if (ln) $(".paper").insertAdjacentHTML("beforeend", ln); const g = await attGallery(rec.id); if (g) view.insertAdjacentHTML("beforeend", g); }
  $("#pvBack").onclick = () => goBack("#/checklist/" + id);
  const nt = $("#pvNotes"); if (nt) nt.onchange = () => { ls.set("pvNotes", nt.checked ? "1" : ""); $(".paper").classList.toggle("nonotes", !nt.checked); };
  $("#pvPrint").onclick = doPrint;
}

/* ---------- 自訂範本編輯 ---------- */
async function renderTemplateEditor(id) {
  const isNew = id === "new";
  const tpl = isNew ? { id: uid(), custom: true, cat: "", name: "", sub: "", items: [{ t: "", std: "" }], created: Date.now() }
    : structuredClone(TEMPLATES.find(t => t.id === id && t.custom) || null);
  if (!tpl?.id) { goReplace("#/checklist"); return; }
  // 已有紀錄使用時，不可刪除或搬動項目（紀錄以項目順序對應），只能改文字與新增
  const used = isNew ? 0 : (await DB.all("records")).filter(r => r.templateId === tpl.id).length;
  const cats = [...new Set(TEMPLATES.map(t => t.cat))];
  const draw = () => {
    view.innerHTML = `
      <h2 class="t">${isNew ? "自訂空白檢查表" : "編輯檢查表"}</h2>
      <div class="panel">
        <div class="field"><label>類別</label><input id="tCat" list="catList" value="${esc(tpl.cat)}" placeholder="例如：鋼筋、泥作、機電"><datalist id="catList">${cats.map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
        <div class="field"><label>表單名稱（必填）</label><input id="tName" value="${esc(tpl.name)}" placeholder="例如：磁磚工程施工自主檢查表"></div>
        <div class="field"><label>分項工程名稱</label><input id="tSub" value="${esc(tpl.sub)}" placeholder="例如：磁磚工程"></div>
      </div>
      ${used ? `<div class="legend">已有 ${used} 筆紀錄使用這張表，為避免對錯項目，只能修改文字或新增項目，不能刪除。</div>` : ""}
      <h2 class="t" style="font-size:17px">檢查項目</h2>
      ${tpl.items.map((it, i) => `<div class="item" data-i="${i}">
        <div class="top"><b class="n" style="padding-top:10px">${i + 1}.</b>
        <div style="flex:1;min-width:0"><input class="note" style="margin:0 0 8px" data-k="t" placeholder="檢查項目" value="${esc(it.t)}"><input class="note" style="margin:0" data-k="std" placeholder="管理標準（例如：誤差5mm以內）" value="${esc(it.std)}"></div>
        ${used && i < tpl.origLen ? "" : `<button class="danger" data-del="${i}" style="min-width:44px;padding:0" aria-label="刪除此項">✕</button>`}</div></div>`).join("")}
      <div class="row"><button class="sec" id="addItem">＋ 新增檢查項目</button></div>
      <div class="row"><button id="tSave">儲存</button></div>
      ${isNew ? "" : `<div class="row"><button class="danger" id="tDel">刪除這張檢查表</button></div>`}`;
    $("#addItem").onclick = () => { sync(); tpl.items.push({ t: "", std: "" }); draw(); view.querySelector(".item:last-of-type .note")?.focus(); };
    view.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { sync(); tpl.items.splice(+b.dataset.del, 1); if (!tpl.items.length) tpl.items.push({ t: "", std: "" }); draw(); });
    $("#tSave").onclick = async () => {
      sync();
      const items = tpl.items.filter(i => i.t.trim());
      if (!tpl.name.trim()) { alert("請輸入表單名稱"); return; }
      if (!items.length) { alert("至少要有一個檢查項目"); return; }
      if (used && items.length !== tpl.items.length) { alert("已有紀錄使用這張表，不能留下空白項目，請填寫或刪除空白列"); return; }
      tpl.name = tpl.name.trim(); tpl.cat = tpl.cat.trim() || "自訂"; tpl.sub = tpl.sub.trim() || tpl.name.replace(/施工自主檢查表|自主檢查表/, "");
      tpl.items = items.map(i => ({ t: i.t.trim(), std: i.std.trim() })); tpl.updated = Date.now();
      delete tpl.origLen;
      await DB.put("templates", tpl); await loadTemplates();
      goBack("#/checklist/new");
    };
    $("#tDel")?.addEventListener("click", async () => {
      if (used) { alert(`已有 ${used} 筆紀錄使用這張表，請先刪除那些紀錄`); return; }
      if (!confirm("確定刪除這張檢查表？")) return;
      await DB.del("templates", tpl.id); await loadTemplates(); goBack("#/checklist/new");
    });
  };
  const sync = () => {
    tpl.cat = $("#tCat").value; tpl.name = $("#tName").value; tpl.sub = $("#tSub").value;
    view.querySelectorAll(".item").forEach(el => { const it = tpl.items[+el.dataset.i]; it.t = $('[data-k=t]', el).value; it.std = $('[data-k=std]', el).value; });
  };
  tpl.origLen = tpl.items.length;
  draw();
}

/* ---------- 備份 ---------- */
// 下載備份檔（備份頁、雲端「上傳舊資料」前共用）
async function downloadBackup(withFiles = true, withRaw = false) {
  const files = []; if (withFiles) for (const f of await DB.all("files")) files.push({ id: f.id, recId: f.recId, name: f.name, type: f.type, size: f.size, created: f.created, data: await blobToDataURL(f.blob) });
  const data = { files, app: "avocado-toolbox", v: 1, company: ls.get("company", ""), templates: await DB.all("templates"), photos: await DB.all("photos"), workorders: await DB.all("workorders"), punch: await DB.all("punch"), pours: await DB.all("pours"), matrecs: await DB.all("matrecs"), matcats: await DB.all("matcats"), shots: (await DB.all("shots")).map(({ thumb, raw, ...x }) => (withRaw ? { ...x, raw } : x)), safety: await DB.all("safety"), logs: await DB.all("logs"), vols: await DB.all("vols"), sites: await DB.all("sites"), records: await DB.all("records") };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  a.download = `三星蔥工具箱備份_${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  ls.set("lastBackup", new Date().toISOString());
}
async function renderBackup() {
  const last = ls.get("lastBackup", "");
  view.innerHTML = `
    <h2 class="t">備份與還原</h2>
    <div class="panel">上次備份：${last ? esc(new Date(last).toLocaleString("zh-TW")) : "尚未備份"}<br><small style="color:var(--mut)">資料只存在這支手機。換手機或清除瀏覽器資料前，請先下載備份檔。</small></div>
    <div class="panel" id="bkFilesBox" hidden></div>
    <div class="panel" id="bkRawBox" hidden></div>
    <div class="panel" id="bkStore"><small style="color:var(--mut)">儲存空間檢查中…</small></div>
    <div class="row"><button id="expBtn">💾 下載備份檔</button></div>
    <div class="row"><button class="sec" id="impBtn">📂 匯入備份檔</button></div>
    <input type="file" id="impFile" accept=".json,application/json" hidden>`;
  (async () => {   // 儲存空間：用量與是否為「持久儲存」（持久的話，手機空間不足時瀏覽器不會自動清掉資料）
    const box = $("#bkStore"); if (!box || !navigator.storage?.estimate) { if (box) box.hidden = true; return; }
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate(), per = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      box.innerHTML = `<b>儲存空間</b>　已用 ${attMB(usage)}${quota ? ` ／ 可用約 ${attMB(quota)}` : ""}<br><small style="color:var(--mut)">${per ? "✔ 已設為持久儲存，手機空間不足時瀏覽器不會自動清掉資料。" : "尚未取得持久儲存，手機空間不足時瀏覽器可能清掉資料，請定期備份。"}</small>`;
    } catch { box.hidden = true; }
  })();
  DB.all("shots").then(sh => { const box = $("#bkRawBox"); if (!box || !sh.length) return; const raw = sh.reduce((a, x) => a + (x.raw && x.raw !== x.data ? x.raw.length : 0), 0) * 0.75;
    box.hidden = false; box.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="bkRaw" style="width:22px;height:22px"> 施工照片一併備份「原始照片」（約增加 ${attMB(raw)}）</label><p class="cnote">不勾選的話，備份檔較小：照片成品（含黑板）照常備份，只是還原後這些照片無法再修改黑板文字。縮圖不需備份，還原時自動產生。</p>`; });
  attTotal().then(({ n, size }) => { if (!n) return; const box = $("#bkFilesBox"); if (!box) return; box.hidden = false;
    box.innerHTML = `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="bkFiles" checked style="width:22px;height:22px"> 備份包含附加檔案（${n} 個、${attMB(size)}）</label>${size > 50 * 1048576 ? `<p class="cnote" style="color:var(--bad)">附加檔案很大，備份檔會很大、匯出匯入會比較慢。可以取消勾選，只備份紀錄。</p>` : `<p class="cnote">取消勾選的話，備份檔只含紀錄與照片，不含附加的電子檔。</p>`}`; });
  $("#expBtn").onclick = async () => {
    await downloadBackup($("#bkFiles") ? $("#bkFiles").checked : true, !!$("#bkRaw")?.checked);
    renderBackup(); checkBackup();
  };
  $("#impBtn").onclick = () => $("#impFile").click();
  $("#impFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = sanitizeBackup(JSON.parse(await f.text()));      // 備份檔視為不可信輸入，逐筆驗證後才寫入（見 safe.js）
      // 同名工地合併：把匯入紀錄改掛到本機同名工地底下
      const local = await DB.all("sites"), map = Object.create(null);
      for (const s of d.sites) {
        const same = local.find(x => x.name === s.name);
        if (same) map[s.id] = same.id; else { if (typeof s.company !== "string" && d.company) s.company = d.company; await DB.put("sites", s); map[s.id] = s.id; local.push(s); }
      }
      if (d.company && !ls.get("company", "")) ls.set("company", d.company);
      for (const t of d.templates || []) {
        const old = await DB.get("templates", t.id);
        if (!old || (old.updated || 0) < (t.updated || 0) || !old.updated) await DB.put("templates", t);
      }
      await loadTemplates();
      for (const p of d.photos || []) if (!(await DB.get("photos", p.id))) await DB.put("photos", p);
      let n = 0;
      for (const r of d.records) {
        const old = await DB.get("records", r.id);
        if (old && old.updated >= r.updated) continue;
        r.siteId = map[r.siteId] || r.siteId; await DB.put("records", r); n++;
      }
      let wn = 0;
      for (const w of d.workorders || []) {
        const old = await DB.get("workorders", w.id);
        if (old && (old.updated || 0) >= (w.updated || 0)) continue;
        w.siteId = map[w.siteId] || w.siteId; await DB.put("workorders", w); wn++;
      }
      let pn = 0;
      for (const x of d.punch || []) {
        const old = await DB.get("punch", x.id);
        if (old && (old.updated || 0) >= (x.updated || 0)) continue;
        x.siteId = map[x.siteId] || x.siteId; await DB.put("punch", x); pn++;
      }
      let jn = 0;
      for (const x of d.pours || []) {
        const old = await DB.get("pours", x.id);
        if (old && (old.updated || 0) >= (x.updated || 0)) continue;
        x.siteId = map[x.siteId] || x.siteId; await DB.put("pours", x); jn++;
      }
      for (const f of d.files || []) {
        if (await DB.get("files", f.id)) continue;
        await DB.put("files", { id: f.id, recId: f.recId, name: f.name, type: f.type, size: f.size, created: f.created, blob: new File([dataURLtoBlob(f.data)], f.name, { type: f.type }) });
      }
      let mn = 0;
      for (const x of d.matcats || []) { const old = await DB.get("matcats", x.id); if (!old || (old.updated || 0) < (x.updated || 0)) await DB.put("matcats", x); }
      for (const x of d.matrecs || []) {
        const old = await DB.get("matrecs", x.id);
        if (old && (old.updated || 0) >= (x.updated || 0)) continue;
        x.siteId = map[x.siteId] || x.siteId; await DB.put("matrecs", x); mn++;
      }
      let sn = 0;
      for (const x of d.shots || []) {
        const old = await DB.get("shots", x.id);
        if (old && (old.updated || 0) >= (x.updated || 0)) continue;
        x.siteId = map[x.siteId] || x.siteId; if (!x.thumb) { try { x.thumb = await shotThumb(x.data); } catch { x.thumb = ""; } } await DB.put("shots", x); sn++;
      }
      let an = 0;
      for (const x of d.safety || []) {
        const old = await DB.get("safety", x.id);
        if (old && (old.updated || 0) >= (x.updated || 0)) continue;
        x.siteId = map[x.siteId] || x.siteId; await DB.put("safety", x); an++;
      }
      let ln = 0;
      for (const x of d.logs || []) {
        const old = await DB.get("logs", x.id);
        if (old && (old.updated || 0) >= (x.updated || 0)) continue;
        x.siteId = map[x.siteId] || x.siteId; await DB.put("logs", x); ln++;
      }
      let vn = 0;
      for (const x of d.vols || []) {
        const old = await DB.get("vols", x.id);
        if (old && (old.updated || 0) >= (x.updated || 0)) continue;
        x.siteId = map[x.siteId] || x.siteId; await DB.put("vols", x); vn++;
      }
      await loadSites();
      alert(`${d.dropped ? `（有 ${d.dropped} 筆資料格式不正確，已略過）\n` : ""}匯入完成，更新了 ${n} 份檢查紀錄${wn ? `、${wn} 張點工單` : ""}${pn ? `、${pn} 筆缺失` : ""}${jn ? `、${jn} 次澆置抽驗` : ""}${mn ? `、${mn} 筆材料進場` : ""}${sn ? `、${sn} 張施工照片` : ""}${an ? `、${an} 筆勤前教育` : ""}${ln ? `、${ln} 張施工日誌` : ""}${vn ? `、${vn} 筆混凝土方數` : ""}`);
    } catch { alert("這不是有效的備份檔"); }
    e.target.value = "";
  };
}

/* ---------- 啟動 ---------- */
$("#camErrClose").onclick = () => $("#camErr").close();
(async () => {
  // 等後面的程式（cloud.js、sidenav.js…）都載入完再開始：資料庫的回應可能比下一支程式下載得快
  if (document.readyState === "loading") await new Promise(r => document.addEventListener("DOMContentLoaded", r, { once: true }));
  await loadTemplates();
  await loadSites();
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  try { navigator.storage?.persist?.(); } catch {}   // 申請持久儲存（不一定會核准，瀏覽器自行判斷）
})();
