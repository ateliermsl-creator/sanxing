"use strict";
const $ = (s, el = document) => el.querySelector(s);
const view = $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
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

/* ---------- IndexedDB ---------- */
const dbp = new Promise((res, rej) => {
  const r = indexedDB.open("avocado-toolbox", 6);
  r.onupgradeneeded = () => {
    for (const n of ["sites", "records", "templates", "photos", "workorders", "punch", "pours"])
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
  if (!sites.find(s => s.id === siteId)) siteId = sites[0]?.id || "";
  ls.set("siteId", siteId);
  const sel = $("#siteSelect");
  sel.innerHTML = sites.length
    ? sites.map(s => `<option value="${s.id}" ${s.id === siteId ? "selected" : ""}>${esc(s.name)}</option>`).join("")
    : `<option value="">尚未建立工地</option>`;
}
$("#siteSelect").onchange = e => { siteId = e.target.value; ls.set("siteId", siteId); route(); };
/* mode: "first" 第一次使用（不可取消）／"add" 新增工地／"edit" 修改目前工地與公司 */
function openSetup(mode) {
  const d = $("#setup"), cur = sites.find(x => x.id === siteId);
  $("#setupTitle").textContent = { first: "開始使用：先填寫工地", add: "新增工地", edit: "工地與公司設定" }[mode];
  $("#setupHint").hidden = mode !== "first";
  $("#sName").value = mode === "edit" && cur ? cur.name : "";
  $("#sCompany").value = ls.get("company", "");
  $("#sOk").textContent = mode === "first" ? "開始填表" : "儲存";
  $("#sCancel").hidden = mode === "first";
  d.dataset.mode = mode;
  d.showModal();
}
$("#setup").addEventListener("cancel", e => { if ($("#setup").dataset.mode === "first") e.preventDefault(); });
$("#sCancel").onclick = () => $("#setup").close();
$("#setupForm").addEventListener("submit", async e => {
  const name = $("#sName").value.trim();
  if (!name) { e.preventDefault(); return; }
  const mode = $("#setup").dataset.mode;
  ls.set("company", $("#sCompany").value.trim());
  if (mode === "edit" && siteId) {
    const s = sites.find(x => x.id === siteId); s.name = name; await DB.put("sites", s);
  } else {
    let s = sites.find(x => x.name === name);
    if (!s) { s = { id: uid(), name }; await DB.put("sites", s); }
    siteId = s.id; ls.set("siteId", siteId);
  }
  await loadSites(); route();
});
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
  const [, page, a, b] = location.hash.split("/");
  if (page === "checklist") return a ? (b === "preview" ? "#/checklist/" + a : "#/checklist") : "#/";
  if (page === "workorder") return a ? (b === "preview" ? "#/workorder/" + a : "#/workorder") : "#/";
  if (page === "punch") return a ? "#/punch" : "#/";
  if (page === "pour") return a === "summary" ? "#/pour" : !a ? "#/" : b === "truck" || b === "print" ? "#/pour/" + a : "#/pour";
  if (page === "template") return "#/checklist";
  return "#/";
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
  if (!sites.length && !["install", "calc", "backup"].includes(page || "") && !$("#setup").open) openSetup("first");
  window.scrollTo(0, 0);
  if (page === "checklist") {
    if (!a) return renderChecklist();
    return location.hash.endsWith("/preview") ? renderPreview(a) : renderForm(a);
  }
  if (page === "pour") return renderPour(a, b2, c2);
  if (page === "install") return renderInstall();
  if (page === "punch") return renderPunch(a);
  if (page === "workorder") return renderWorkorder(a, location.hash.endsWith("/preview"));
  if (page === "calc") return renderCalc(a);
  if (page === "template") return renderTemplateEditor(a);
  if (page === "backup") return renderBackup();
  return renderHome();
}

/* ---------- 首頁 ---------- */
async function renderHome() {
  let updates = [];
  try { updates = await (await fetch("updates.json")).json(); } catch {}
  if (location.hash.split("/")[1]) return;   // 讀取期間已切到別的頁面，就不要用首頁蓋掉它
  view.innerHTML = `
    ${!isStandalone() && !inAppName() && !(() => { try { return localStorage.getItem("installHint"); } catch { return ""; } })() ? `<div class="hint" id="instHint">📲 把工具箱放到手機桌面，像 App 一樣使用、沒有網路也能開。<br><a href="#/install">看教學</a>　<button class="sec" id="instHide" style="min-height:34px;font-size:14px;padding:0 12px">不用提醒</button></div>` : ""}
    <section class="hero"><img src="leek.png" alt=""><h1>三星蔥營造工具箱</h1><p>工地隨身工具・沒有網路也能用</p></section>
    <a class="card" href="#/checklist"><img src="leek.png" alt=""><div><b>自主檢查表</b><small>施工自主檢查・手寫簽名・PDF 列印</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/pour"><div class="ph">🚛</div><div><b>混凝土澆置抽驗</b><small>車號・坍度・氯離子・試體・簽名・方量統計</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/punch"><div class="ph">📌</div><div><b>缺失改善追蹤</b><small>初複驗・位置拍照・期限・工班分派</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/workorder"><div class="ph">📝</div><div><b>點工單／機械出工</b><small>當場簽認・工時彙總・月結對帳</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/calc"><div class="ph">🧮</div><div><b>工程計算機</b><small>鋼筋・混凝土・坡度高程・坪才</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/backup"><div class="ph">💾</div><div><b>備份與還原</b><small>下載備份檔・匯入備份檔</small></div><span class="arrow">›</span></a>
    <a class="card" href="#/install"><div class="ph">📲</div><div><b>加到手機桌面</b><small>像 App 一樣使用・教學</small></div><span class="arrow">›</span></a>
    <div class="card soon"><div class="ph">＋</div><div><b>更多工具開發中</b><small>敬請期待</small></div></div>
    <section class="panel"><h2>📢 最新更新</h2>${updates.map(u => `<div class="d">${esc(u.date)}</div><ul>${u.items.map(i => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")}</section>`;
  $("#instHide")?.addEventListener("click", () => { try { localStorage.setItem("installHint", "1"); } catch {} $("#instHint").remove(); });
  checkBackup();
}
function checkBackup() {
  const last = ls.get("lastBackup", "");
  const w = $("#backupWarn");
  const days = last ? (Date.now() - Date.parse(last)) / 864e5 : Infinity;
  if (days > 7) {
    w.hidden = false;
    w.innerHTML = `💾 ${last ? "已超過 7 天沒備份" : "還沒有備份過"}，<a href="#/backup">現在備份</a>`;
  } else w.hidden = true;
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
let cat = "全部";
const SYM = { ok: "○", ng: "✕", na: "／" };
const doneCount = r => Object.values(r.items || {}).filter(i => i.r).length;
async function renderChecklist() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const recs = (await DB.all("records")).filter(r => r.siteId === siteId).sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated);
  const pc = {}; for (const p of await DB.all("photos")) pc[p.recId] = (pc[p.recId] || 0) + 1;
  const cats = ["全部", ...new Set(TEMPLATES.map(t => t.cat))];
  if (!cats.includes(cat)) cat = "全部";
  const list = TEMPLATES.filter(t => cat === "全部" || t.cat === cat);
  view.innerHTML = `
    <h2 class="t">自主檢查表（${TEMPLATES.length}）</h2>
    <div class="row" style="margin-top:0"><a class="btnlink" href="#/template/new">📋 自訂空白檢查表</a></div>
    <div class="chips">${cats.map(c => `<button class="chip ${c === cat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}（${c === "全部" ? TEMPLATES.length : TEMPLATES.filter(t => t.cat === c).length}）</button>`).join("")}</div>
    ${list.map(t => {
      const mine = recs.filter(r => r.templateId === t.id), last = mine[0];
      const st = !last ? "未填" : doneCount(last) >= t.items.length ? "已完成" : "填寫中";
      return `<div class="trow"><div class="tinfo"><span class="tag">${esc(t.cat)}</span>${t.custom ? `<span class="tag" style="color:var(--g)">自訂</span>` : ""}<b>${esc(t.name.replace("施工自主檢查表", "").replace("自主檢查表", ""))}</b>
        <small>${last ? `${esc(last.location || "未填位置")}・${esc(last.date)}・共 ${mine.length} 筆` : "尚無紀錄"}</small></div>
        <span class="st st-${st}">${st}</span>${t.custom ? `<a class="btnlink sm" href="#/template/${t.id}" aria-label="編輯範本">✎</a>` : ""}<button data-new="${t.id}">填表</button></div>`;
    }).join("")}
    <h2 class="t">已填寫紀錄</h2>
    ${recs.length ? recs.filter(r => cat === "全部" || TEMPLATES.find(x => x.id === r.templateId)?.cat === cat).map(r => {
      const t = TEMPLATES.find(x => x.id === r.templateId);
      const ng = Object.values(r.items || {}).filter(i => i.r === "ng").length;
      return `<a class="rec" href="#/checklist/${r.id}"><b>${esc(t?.name || r.templateId)}</b><br><small>${esc(r.date)}${r.location ? "・" + esc(r.location) : ""}・已標記 ${doneCount(r)}/${t?.items.length ?? "?"} 項${pc[r.id] ? `・📷${pc[r.id]}` : ""}${ng ? `・<span style="color:var(--bad)">有缺失 ${ng} 項</span>` : ""}</small></a>`;
    }).join("") : `<div class="panel" style="color:var(--mut)">這個工地還沒有紀錄</div>`}`;
  view.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { cat = b.dataset.cat; renderChecklist(); });
  view.querySelectorAll("[data-new]").forEach(b => b.onclick = async () => {
    const rec = { id: uid(), siteId, templateId: b.dataset.new, docNo: "", contractor: ls.get("contractor", ""), subcontractor: "", date: today(), location: "", timing: {}, items: {}, sigs: {}, updated: Date.now() };
    await DB.put("records", rec);
    location.hash = "#/checklist/" + rec.id;
  });
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
  let timer;
  let photos = await photosOf(rec.id);
  const save = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
  const flush = () => { clearTimeout(timer); rec.updated = Date.now(); return DB.put("records", rec); };
  const prog = () => `已標記 ${doneCount(rec)}/${tpl.items.length} 項`;
  const inp = (k, lab, ph) => `<div class="field"><label>${lab}</label><input data-f="${k}" value="${esc(rec[k])}" placeholder="${ph || ""}"></div>`;
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">${esc(tpl.name)}</h2>
    <div style="margin:0 12px;color:var(--mut);font-size:14px">${esc(tpl.cat)}・<span id="prog" style="color:#c77d00;font-weight:700">${prog()}</span></div>
    <div class="panel">
      ${inp("contractor", "承攬廠商", "廠商名稱")}${inp("subcontractor", "協力廠商", "協力廠商（如有）")}
      ${inp("location", "檢查位置", "例如：2F、B1 東側")}
      <div class="field"><label>檢查日期</label><input type="date" data-f="date" value="${esc(rec.date)}"></div>
      ${inp("docNo", "編號", "表單編號（可空白）")}
      <div class="field"><label>檢查時機</label><div class="timing">${TIMING.map(([k, l]) => `<label><input type="checkbox" data-t="${k}" ${rec.timing[k] ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
    </div>
    <div class="legend">結果標記：<b style="color:var(--ok)">○ 合格</b>　<b style="color:var(--bad)">✕ 不合格</b>　<b style="color:var(--mut)">／ 不適用</b></div>
    ${tpl.items.map((it, i) => {
      const v = rec.items[i] || {};
      return `<div class="item" data-i="${i}"><div class="top"><div><div class="t"><span class="n">${i + 1}.</span> ${esc(it.t)}</div><div class="m">規定標準：${esc(it.std)}</div></div>
        <div class="sym">${["ok", "ng", "na"].map(k => `<button class="${v.r === k ? "on" : ""}" data-r="${k}" aria-label="${k}">${SYM[k]}</button>`).join("")}</div></div>
        <input class="note" placeholder="實際檢查情形（可空白）" value="${esc(v.actual ?? v.note)}">
        <div class="phrow"><button type="button" class="phbtn" data-cam="${i}">📷 拍照</button><label class="phbtn alt">🖼 相簿<input type="file" accept="image/*" multiple hidden data-ph="${i}"></label><div class="thumbs" data-th="${i}"></div></div></div>`;
    }).join("")}
    ${[["worker", "檢查人員簽名"], ["manager", "工地主任簽名"]].map(([k, l]) => `
      <div class="sigbox"><div class="bar"><b>${l}</b><button class="sec" data-clear="${k}">清除</button></div><canvas data-sig="${k}"></canvas></div>`).join("")}
    <div class="row"><button id="previewBtn">👁 預覽／列印</button></div>
    <div class="row"><button class="danger" id="delBtn">刪除這份紀錄</button></div>`;

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
      `<span class="th"><img src="${p.data}" alt="照片"><button data-delph="${p.id}" aria-label="刪除照片">✕</button></span>`).join("");
  };
  tpl.items.forEach((_, i) => drawThumbs(i));
  view.onclick = async e => {
    const th = e.target.closest?.(".th img");
    if (th) {
      const id0 = th.parentElement.querySelector("[data-delph]").dataset.delph;
      const cur = photos.find(x => x.id === id0), same = photos.filter(x => x.itemIdx === cur.itemIdx);
      openLightbox(same, same.indexOf(cur)); return;
    }
    const id = e.target.dataset?.delph; if (!id) return;
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
  view.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => {
    const c = $(`canvas[data-sig=${b.dataset.clear}]`);
    c.getContext("2d").clearRect(0, 0, c.width, c.height);
    delete rec.sigs[b.dataset.clear]; save();
  });
  $("#previewBtn").onclick = async () => { await flush(); location.hash = "#/checklist/" + rec.id + "/preview"; };
  $("#delBtn").onclick = async () => {
    if (!confirm("確定刪除這份紀錄？")) return;
    for (const p of photos) await DB.del("photos", p.id);
    await DB.del("records", rec.id); goBack("#/checklist");
  };
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
  const company = ls.get("company", "");
  const d = rec.date ? rec.date.replace(/^(\d+)-(\d+)-(\d+)$/, "$1 年 $2 月 $3 日") : "";
  const box = k => (rec.timing[k] ? "☑" : "□");
  const photos = await photosOf(rec.id);
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回填表</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="noprint" style="margin:0 12px 8px;color:var(--mut);font-size:13px">顯示目前填寫的內容。請用 Safari 開啟：iPhone 按列印後，在預覽縮圖上用兩指放大，即可「儲存到檔案」成 PDF；iPad 也是按列印，再用分享圖示存檔。</div>
    <div class="paper">
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
        ${tpl.items.map((it, i) => { const v = rec.items[i] || {}; return `<tr><td>${esc(it.t)}</td><td>${esc(it.std)}</td><td>${esc(v.actual ?? v.note)}</td><td class="c">${SYM[v.r] || ""}</td></tr>`; }).join("")}
        <tr><td colspan="4" class="recheck">缺失複查結果：<br>□已完成改善（檢附改善前中後照片）<br>□未完成改善，填具「缺失改善追蹤表」進行追蹤改善<br><br>複查日期：　　　年　　月　　日　　複查人員職稱：　　　　　　　　簽名：</td></tr>
        <tr><td colspan="4" class="recheck">備註：<br>1.檢查結果合格者註明「○」，不合格者註明「✕」，如無需檢查之項目則打「／」。</td></tr>
      </table>
      <div class="psigs">${[["worker", "檢查人員"], ["manager", "工地主任"]].map(([k, l]) => `<div>${rec.sigs[k] ? `<img src="${rec.sigs[k]}">` : "<br><br>"}${l}</div>`).join("")}</div>
    </div>
    ${photos.length ? `<div class="paper gallery"><div class="ptitle">附件：檢查照片</div><div class="gal">${photos.map(p => `<figure><img src="${p.data}"><figcaption>第 ${p.itemIdx + 1} 項　${esc(tpl.items[p.itemIdx]?.t)}</figcaption></figure>`).join("")}</div></div>` : ""}`;
  $("#pvBack").onclick = () => goBack("#/checklist/" + id);
  $("#pvPrint").onclick = doPrint;
}

/* ---------- 自訂範本編輯 ---------- */
async function renderTemplateEditor(id) {
  const isNew = id === "new";
  const tpl = isNew ? { id: uid(), custom: true, cat: "", name: "", sub: "", items: [{ t: "", std: "" }], created: Date.now() }
    : structuredClone(TEMPLATES.find(t => t.id === id && t.custom));
  if (!tpl.id) { goReplace("#/checklist"); return; }
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
      goBack("#/checklist");
    };
    $("#tDel")?.addEventListener("click", async () => {
      if (used) { alert(`已有 ${used} 筆紀錄使用這張表，請先刪除那些紀錄`); return; }
      if (!confirm("確定刪除這張檢查表？")) return;
      await DB.del("templates", tpl.id); await loadTemplates(); goBack("#/checklist");
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
async function renderBackup() {
  const last = ls.get("lastBackup", "");
  view.innerHTML = `
    <h2 class="t">備份與還原</h2>
    <div class="panel">上次備份：${last ? esc(new Date(last).toLocaleString("zh-TW")) : "尚未備份"}<br><small style="color:var(--mut)">資料只存在這支手機。換手機或清除瀏覽器資料前，請先下載備份檔。</small></div>
    <div class="row"><button id="expBtn">💾 下載備份檔</button></div>
    <div class="row"><button class="sec" id="impBtn">📂 匯入備份檔</button></div>
    <input type="file" id="impFile" accept=".json,application/json" hidden>`;
  $("#expBtn").onclick = async () => {
    const data = { app: "avocado-toolbox", v: 1, company: ls.get("company", ""), templates: await DB.all("templates"), photos: await DB.all("photos"), workorders: await DB.all("workorders"), punch: await DB.all("punch"), pours: await DB.all("pours"), sites: await DB.all("sites"), records: await DB.all("records") };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    a.download = `三星蔥工具箱備份_${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    ls.set("lastBackup", new Date().toISOString());
    renderBackup(); checkBackup();
  };
  $("#impBtn").onclick = () => $("#impFile").click();
  $("#impFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== "avocado-toolbox") throw 0;
      // 同名工地合併：把匯入紀錄改掛到本機同名工地底下
      const local = await DB.all("sites"), map = {};
      for (const s of d.sites) {
        const same = local.find(x => x.name === s.name);
        if (same) map[s.id] = same.id; else { await DB.put("sites", s); map[s.id] = s.id; local.push(s); }
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
      await loadSites();
      alert(`匯入完成，更新了 ${n} 份檢查紀錄${wn ? `、${wn} 張點工單` : ""}${pn ? `、${pn} 筆缺失` : ""}${jn ? `、${jn} 次澆置抽驗` : ""}`);
    } catch { alert("這不是有效的備份檔"); }
    e.target.value = "";
  };
}

/* ---------- 啟動 ---------- */
(async () => {
  await loadTemplates();
  await loadSites();
  route();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
