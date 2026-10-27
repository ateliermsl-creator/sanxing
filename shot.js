"use strict";
/* 施工照片「電子黑板」相機
   拍照時把工程名稱、施工項目、部位、日期、施工廠商、說明畫成一塊黑板，直接合成進照片裡。
   每張照片存兩份：含黑板的成品（data）、原始照片（raw，之後改字可以重新合成），另有縮圖（thumb）。
   資料存在「shots」；可以篩選、選取、產出施工照片冊（A4，可列印、分享 PDF）。 */

const shotRoc = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${+m[1] - 1911}年${+m[2]}月${+m[3]}日` : ""; };
const shotJSON = k => { try { return JSON.parse(ls.get(k, "{}")) || {}; } catch { return {}; } };
const shotFieldsGet = () => { const f = shotJSON("shotF"); return { item: f.item || "", part: f.part || "", spec: f.spec || "", vendor: f.vendor || "", note: f.note || "" }; };
const shotOptGet = () => { const o = shotJSON("shotO"); return { pos: o.pos === "br" ? "br" : "bl", size: [0.8, 1, 1.25].includes(o.size) ? o.size : 1, theme: o.theme === "white" ? "white" : "green", showTime: o.showTime !== false, showGps: o.showGps !== false }; };
const shotGpsText = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "";
const shotNowTime = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const shotSiteName = () => sites.find(s => s.id === siteId)?.name || "";
const SHOT_MAX = 1600;
const shotLocalDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ---------- 畫黑板（拍照預覽與存檔共用同一個函式，所見即所得） ---------- */
function shotDrawBoard(g, W, H, f, o) {
  const rows = [["工程名稱", f.site], ["查驗項目", f.item], ["施工位置", f.part], ["設計規格", f.spec], ["日期時間", shotRoc(f.date) + (o.showTime !== false && f.time ? "　" + f.time : "")], ["GPS座標", o.showGps !== false ? shotGpsText(f.lat, f.lng) : ""], ["施工廠商", f.vendor], ["說　　明", f.note]].filter(([, v]) => v);
  if (!rows.length) return;
  const S = Math.min(W, H), bw = Math.min(W * 0.92, S * 0.66 * o.size), fs = bw / 17, pad = fs * 0.6, lw = fs * 5.2, vw = bw - lw - pad * 2, lh = fs * 1.3;
  const dark = o.theme === "green", C = dark ? { bg: "rgba(24,70,38,.93)", ln: "#d9e8d0", tx: "#fff" } : { bg: "rgba(255,255,255,.95)", ln: "#222", tx: "#111" };
  g.save(); g.textBaseline = "top";
  const wrap = s => { g.font = `600 ${fs}px sans-serif`; const out = []; let cur = ""; for (const ch of String(s)) { if (ch === "\n") { out.push(cur); cur = ""; continue; } if (g.measureText(cur + ch).width > vw && cur) { out.push(cur); cur = ch; } else cur += ch; } out.push(cur); return out.slice(0, 4); };
  const laid = rows.map(([l, v]) => { const lines = wrap(v); return { l, lines, h: Math.max(fs * 2, lines.length * lh + fs * 0.7) }; });
  const bh = laid.reduce((a, r) => a + r.h, 0), mg = S * 0.025;
  const x0 = o.pos === "br" ? W - mg - bw : mg, y0 = H - mg - bh;
  g.fillStyle = C.bg; g.fillRect(x0, y0, bw, bh);
  g.strokeStyle = C.ln; g.lineWidth = Math.max(1.5, fs * 0.12); g.strokeRect(x0, y0, bw, bh);
  let y = y0;
  for (const r of laid) {
    if (y > y0) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + bw, y); g.lineWidth = Math.max(1, fs * 0.07); g.stroke(); }
    g.fillStyle = C.tx; g.font = `500 ${fs * 0.9}px sans-serif`; g.fillText(r.l, x0 + pad, y + (r.h - fs * 0.9) / 2);
    g.font = `600 ${fs}px sans-serif`; r.lines.forEach((t, i) => g.fillText(t, x0 + lw + pad, y + (r.h - r.lines.length * lh) / 2 + i * lh + (lh - fs) / 2));
    y += r.h;
  }
  g.beginPath(); g.moveTo(x0 + lw, y0); g.lineTo(x0 + lw, y0 + bh); g.lineWidth = Math.max(1, fs * 0.07); g.stroke();
  g.restore();
}
const shotJpeg = (src, w, h, q, board) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); g.drawImage(src, 0, 0, w, h); if (board) shotDrawBoard(g, w, h, board.f, board.o); return c.toDataURL("image/jpeg", q); };
// src：video、ImageBitmap 或 canvas；回傳 { data（含黑板）, raw（原圖）, thumb }
function shotCompose(src, sw, sh, f, o) {
  const k = Math.min(1, SHOT_MAX / Math.max(sw, sh)), w = Math.round(sw * k), h = Math.round(sh * k);
  const full = shotJpeg(src, w, h, 0.82, { f, o }), raw = shotJpeg(src, w, h, 0.82, null);
  return { data: full, raw };
}
async function shotThumb(dataUrl) {
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const k = Math.min(1, 360 / Math.max(im.width, im.height));
  return shotJpeg(im, Math.round(im.width * k), Math.round(im.height * k), 0.7, null);
}
async function shotSave(src, sw, sh, extra = {}) {
  const f = { site: shotSiteName(), date: extra.date || today(), time: extra.time || "", ...shotFieldsGet() }, o = shotOptGet(), r = shotCompose(src, sw, sh, f, o);
  const rec = { id: uid(), siteId, date: f.date, time: f.time, item: f.item, part: f.part, spec: f.spec, vendor: f.vendor, note: f.note, data: r.data, raw: r.raw, thumb: await shotThumb(r.data), created: Date.now(), updated: Date.now() };
  await DB.put("shots", rec); return rec;
}

/* ---------- 電子黑板相機 ---------- */
async function shotOpenCamera(onSaved) {
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }); }
  catch (err) { alert(`無法開啟內建相機（${err?.name || "未知錯誤"}）。\n請在瀏覽器允許相機權限；或改用「🖼 相簿照片加黑板」選手機拍好的照片。`); return; }
  const past = (await DB.all("shots")).filter(x => x.siteId === siteId);
  const uniq = k => [...new Set(past.sort((a, b) => b.created - a.created).map(x => x[k]).filter(Boolean))].slice(0, 12);
  const f = { site: shotSiteName(), date: shotLocalDate(new Date()), time: shotNowTime(), ...shotFieldsGet() }, o = shotOptGet();
  const box = document.createElement("div"); box.id = "shotCam";
  box.innerHTML = `<div class="scTop"><b>電子黑板相機</b><small id="scGps">📍 定位中…</small><button type="button" id="scEdit">✎ 編輯黑板</button><button type="button" id="scDone">完成</button></div>
    <div class="scEditor" id="scEditor" hidden>
      ${[["item", "查驗項目"], ["part", "施工位置"], ["spec", "設計規格"], ["vendor", "施工廠商（可空白）"], ["note", "說明（可空白）"]].map(([k, l]) => `<label>${l}<input data-k="${k}" list="scl_${k}" value="${esc(f[k])}" autocomplete="off"></label><datalist id="scl_${k}">${uniq(k).map(v => `<option value="${esc(v)}">`).join("")}</datalist>`).join("")}
      <div class="scOpt"><span>位置</span><button type="button" data-o="pos" data-v="bl">左下</button><button type="button" data-o="pos" data-v="br">右下</button>
        <span>大小</span><button type="button" data-o="size" data-v="0.8">小</button><button type="button" data-o="size" data-v="1">中</button><button type="button" data-o="size" data-v="1.25">大</button>
        <span>顏色</span><button type="button" data-o="theme" data-v="green">綠板</button><button type="button" data-o="theme" data-v="white">白板</button>
        <span>顯示</span><button type="button" data-t="showTime">拍攝時間</button><button type="button" data-t="showGps">GPS 座標</button></div></div>
    <div class="scStage" id="scStage"><video playsinline muted autoplay></video><canvas id="scBoard"></canvas></div>
    <div class="camBar"><span id="scCount">已拍 0 張</span><button type="button" id="scShot" aria-label="拍照"></button><span style="width:64px"></span></div>`;
  document.body.append(box);
  const v = $("video", box), cv = $("#scBoard", box), stage = $("#scStage", box);
  v.srcObject = stream;
  const layout = () => {
    if (!v.videoWidth) return;
    const cw = stage.clientWidth, ch = stage.clientHeight, k = Math.min(cw / v.videoWidth, ch / v.videoHeight), dw = v.videoWidth * k, dh = v.videoHeight * k;
    Object.assign(cv.style, { width: dw + "px", height: dh + "px", left: (cw - dw) / 2 + "px", top: (ch - dh) / 2 + "px" });
    cv.width = v.videoWidth; cv.height = v.videoHeight; draw();
  };
  const draw = () => { const g = cv.getContext("2d"); g.clearRect(0, 0, cv.width, cv.height); shotDrawBoard(g, cv.width, cv.height, f, o); box.querySelectorAll("[data-o]").forEach(b => b.classList.toggle("on", String(o[b.dataset.o]) === b.dataset.v)); box.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", o[b.dataset.t])); };
  v.onloadedmetadata = layout; window.addEventListener("resize", layout);
  box.querySelectorAll("[data-k]").forEach(el => el.oninput = () => { f[el.dataset.k] = el.value; ls.set("shotF", JSON.stringify({ item: f.item, part: f.part, spec: f.spec, vendor: f.vendor, note: f.note })); draw(); });
  box.querySelectorAll("[data-o]").forEach(b => b.onclick = () => { o[b.dataset.o] = b.dataset.o === "size" ? +b.dataset.v : b.dataset.v; ls.set("shotO", JSON.stringify(o)); draw(); });
  box.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { o[b.dataset.t] = !o[b.dataset.t]; ls.set("shotO", JSON.stringify(o)); draw(); });
  // GPS：開著相機時持續定位，拍照時取最新的一次
  let watch = null; const gl = $("#scGps", box);
  if (navigator.geolocation) watch = navigator.geolocation.watchPosition(p => { f.lat = p.coords.latitude; f.lng = p.coords.longitude; f.acc = p.coords.accuracy; gl.textContent = `📍 已定位 ±${Math.round(f.acc)}m`; draw(); },
    er => { gl.textContent = er.code === 1 ? "📍 未允許定位" : "📍 無法定位"; }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  else gl.textContent = "📍 不支援定位";
  $("#scEdit", box).onclick = () => { const ed = $("#scEditor", box); ed.hidden = !ed.hidden; };
  let n = 0, busy = false;
  const close = () => { if (watch !== null) navigator.geolocation.clearWatch(watch); window.removeEventListener("resize", layout); stream.getTracks().forEach(t => t.stop()); v.srcObject = null; box.remove(); onSaved?.(n); };
  $("#scDone", box).onclick = close;
  $("#scShot", box).onclick = async () => {
    if (busy || !v.videoWidth) return; busy = true;
    try {
      { const d = new Date(); f.date = shotLocalDate(d); f.time = shotNowTime(d); }
      const r = shotCompose(v, v.videoWidth, v.videoHeight, f, o);
      const rec = { id: uid(), siteId, date: f.date, time: f.time, lat: f.lat, lng: f.lng, acc: f.acc, item: f.item, part: f.part, spec: f.spec, vendor: f.vendor, note: f.note, data: r.data, raw: r.raw, thumb: await shotThumb(r.data), created: Date.now(), updated: Date.now() };
      await DB.put("shots", rec); n++; $("#scCount", box).textContent = `已拍 ${n} 張`;
      box.classList.add("flash"); setTimeout(() => box.classList.remove("flash"), 120);
    } catch { alert("存檔失敗，可能是手機儲存空間不足。"); }
    busy = false;
  };
}

/* ---------- 列表 ---------- */
let shotFDate = "", shotFItem = "", shotSelMode = false, shotSel = new Set(), shotAlbumIds = [], shotAlbumN = 4;
async function renderShot(a, b) {
  if (!a) return renderShotList();
  if (a === "album") return renderShotAlbum();
  return renderShotDetail(a);
}
async function renderShotList() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const all = (await DB.all("shots")).filter(x => x.siteId === siteId).sort((x, y) => y.created - x.created);
  const dates = [...new Set(all.map(x => x.date))].sort().reverse(), items = [...new Set(all.map(x => x.item).filter(Boolean))].sort((x, y) => x.localeCompare(y, "zh-Hant"));
  if (!dates.includes(shotFDate)) shotFDate = ""; if (!items.includes(shotFItem)) shotFItem = "";
  const list = all.filter(x => (!shotFDate || x.date === shotFDate) && (!shotFItem || x.item === shotFItem));
  for (const id of [...shotSel]) if (!all.some(x => x.id === id)) shotSel.delete(id);
  const nBook = shotSelMode && shotSel.size ? shotSel.size : list.length;
  view.innerHTML = `
    <h2 class="t">施工照片（電子黑板）</h2>
    <div class="row" style="margin-top:0"><button id="shCam">📷 電子黑板相機</button><label class="btnlink" style="cursor:pointer">🖼 相簿照片加黑板<input type="file" id="shFile" accept="image/*" multiple hidden></label></div>
    ${all.length ? `<div class="row"><select id="shFD" aria-label="日期"><option value="">全部日期（${all.length}）</option>${dates.map(d => `<option value="${esc(d)}" ${d === shotFDate ? "selected" : ""}>${esc(pRoc(d))}（${all.filter(x => x.date === d).length}）</option>`).join("")}</select>
      <select id="shFI" aria-label="查驗項目"><option value="">全部項目</option>${items.map(d => `<option value="${esc(d)}" ${d === shotFItem ? "selected" : ""}>${esc(d)}</option>`).join("")}</select></div>
      <div class="row"><button class="sec" id="shSel">${shotSelMode ? "✕ 取消選取" : "☑ 選取照片"}</button><button class="sec" id="shBook" ${nBook ? "" : "disabled"}>📖 照片冊（${nBook} 張）</button></div>
      ${shotSelMode ? `<div class="row"><button class="sec" id="shAll">${shotSel.size === list.length && list.length ? "取消全選" : `全選（${list.length}）`}</button><button class="sec" id="shShare" ${shotSel.size ? "" : "disabled"}>📤 分享（${shotSel.size}）</button></div>
      <div class="row"><button class="sec" id="shDl" ${shotSel.size ? "" : "disabled"}>⬇ 下載存查（${shotSel.size}）</button><button class="danger" id="shRm" ${shotSel.size ? "" : "disabled"}>🗑 刪除（${shotSel.size}）</button></div>` : ""}` : ""}
    ${list.length ? `<div class="sgrid">${list.map(x => `<button type="button" class="sth ${shotSel.has(x.id) ? "pick" : ""}" data-id="${esc(x.id)}"><img src="${safeImg(x.thumb || x.data)}" alt="施工照片"><small>${esc(x.item || "（未填項目）")}</small>${shotSelMode ? `<i>${shotSel.has(x.id) ? "✔" : ""}</i>` : ""}</button>`).join("")}</div>`
      : `<div class="panel">${all.length ? "這個篩選下沒有照片。" : "還沒有施工照片。按「電子黑板相機」開始拍，黑板會直接合成在照片上。"}</div>`}`;
  $("#shCam").onclick = () => shotOpenCamera(() => renderShotList());
  $("#shFile").onchange = async e => {
    const files = [...e.target.files]; e.target.value = ""; let ok = 0;
    for (const file of files) {
      try { const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); await shotSave(bmp, bmp.width, bmp.height, { date: shotLocalDate(new Date(file.lastModified || Date.now())), time: shotNowTime(new Date(file.lastModified || Date.now())) }); ok++; }
      catch { /* 讀不出來的檔案略過 */ }
    }
    if (ok < files.length) alert(`有 ${files.length - ok} 張無法讀取，已略過。`);
    renderShotList();
  };
  if (all.length) {
    $("#shFD").onchange = e => { shotFDate = e.target.value; renderShotList(); };
    $("#shFI").onchange = e => { shotFItem = e.target.value; renderShotList(); };
    $("#shSel").onclick = () => { shotSelMode = !shotSelMode; shotSel.clear(); renderShotList(); };
    if (shotSelMode) {
      const picked = () => all.filter(x => shotSel.has(x.id)).sort((p, q) => p.created - q.created);
      const fileOf = (x, i) => new File([dataURLtoBlob(x.data)], `施工照片_${x.date}_${String(i + 1).padStart(2, "0")}${x.item ? "_" + x.item.replace(/[\\/:*?"<>|]/g, "") : ""}.jpg`, { type: "image/jpeg" });
      $("#shAll").onclick = () => { if (shotSel.size === list.length) shotSel.clear(); else list.forEach(x => shotSel.add(x.id)); renderShotList(); };
      $("#shShare").onclick = async () => {
        const fl = picked().map(fileOf);
        try { if (navigator.canShare?.({ files: fl })) { await navigator.share({ files: fl, title: "施工照片" }); return; } } catch (e) { if (e?.name === "AbortError") return; }
        alert("這個瀏覽器不能一次分享多張，改為逐張下載。"); for (const f of fl) { pdfDownload(f); await new Promise(r => setTimeout(r, 400)); }
      };
      $("#shDl").onclick = async () => { const fl = picked().map(fileOf); for (const f of fl) { pdfDownload(f); await new Promise(r => setTimeout(r, 400)); } };
      $("#shRm").onclick = async () => {
        const n = shotSel.size; if (!n || !confirm(`確定刪除選取的 ${n} 張照片？無法復原。\n\n建議先按「下載存查」或「分享」留存。`)) return;
        for (const id of [...shotSel]) await DB.del("shots", id);
        shotSel.clear(); shotSelMode = false; renderShotList();
      };
    }
    $("#shBook").onclick = () => { shotAlbumIds = shotSelMode && shotSel.size ? [...shotSel] : list.map(x => x.id); location.hash = "#/shot/album"; };
  }
  view.querySelectorAll(".sth").forEach(el => el.onclick = () => {
    const id = el.dataset.id;
    if (shotSelMode) { shotSel.has(id) ? shotSel.delete(id) : shotSel.add(id); renderShotList(); } else location.hash = "#/shot/" + id;
  });
}

/* ---------- 單張：看大圖、改黑板文字、分享、下載、刪除 ---------- */
async function renderShotDetail(id) {
  const x = await DB.get("shots", id);
  if (!x) { goReplace("#/shot"); return; }
  const o = shotOptGet(), site = shotSiteName();
  view.innerHTML = `
    <h2 class="t">施工照片</h2>
    <div class="panel"><img id="sdImg" src="${safeImg(x.data)}" alt="施工照片" style="width:100%;border-radius:10px;cursor:zoom-in"></div>
    <div class="panel"><b>黑板內容</b>
      ${[["item", "查驗項目"], ["part", "施工位置"], ["spec", "設計規格"], ["vendor", "施工廠商"], ["note", "說明"]].map(([k, l]) => `<div class="field"><label>${l}</label><input data-k="${k}" value="${esc(x[k])}"></div>`).join("")}
      <div class="field"><label>日期</label><input type="date" data-k="date" value="${esc(x.date)}"></div>
      <div class="field"><label>拍攝時間</label><input type="time" data-k="time" value="${esc(x.time)}"></div>
      <p class="cnote">GPS：${x.lat !== undefined && Number.isFinite(x.lat) ? esc(shotGpsText(x.lat, x.lng)) + (x.acc ? `（誤差約 ${Math.round(x.acc)} 公尺）` : "") : "沒有定位資料（用相簿加黑板的照片不含 GPS）"}</p>
      <div class="phrow"><button type="button" class="sec" data-o="pos" data-v="bl">左下</button><button type="button" class="sec" data-o="pos" data-v="br">右下</button>
        <button type="button" class="sec" data-o="size" data-v="0.8">小</button><button type="button" class="sec" data-o="size" data-v="1">中</button><button type="button" class="sec" data-o="size" data-v="1.25">大</button>
        <button type="button" class="sec" data-o="theme" data-v="green">綠板</button><button type="button" class="sec" data-o="theme" data-v="white">白板</button>
        <button type="button" class="sec" data-t="showTime">顯示時間</button><button type="button" class="sec" data-t="showGps">顯示 GPS</button></div>
      <div class="row"><button id="sdUpd">更新黑板</button></div></div>
    <div class="row"><button class="sec" id="sdShare">📤 分享照片</button><button class="sec" id="sdDl">⬇ 下載</button></div>
    <div class="row"><button class="danger" id="sdDel">刪除這張照片</button></div>`;
  const mark = () => { view.querySelectorAll("[data-o]").forEach(b => b.classList.toggle("on", String(o[b.dataset.o]) === b.dataset.v)); view.querySelectorAll("[data-t]").forEach(b => b.classList.toggle("on", o[b.dataset.t])); };
  mark();
  view.querySelectorAll("[data-o]").forEach(b => b.onclick = () => { o[b.dataset.o] = b.dataset.o === "size" ? +b.dataset.v : b.dataset.v; ls.set("shotO", JSON.stringify(o)); mark(); });
  view.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { o[b.dataset.t] = !o[b.dataset.t]; ls.set("shotO", JSON.stringify(o)); mark(); });
  $("#sdImg").onclick = () => openLightbox([x], 0);
  $("#sdUpd").onclick = async () => {
    const f = { site, date: x.date, lat: x.lat, lng: x.lng }; view.querySelectorAll("[data-k]").forEach(el => f[el.dataset.k] = el.value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) f.date = x.date;
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = safeImg(x.raw || x.data); });
    const r = shotCompose(im, im.width, im.height, f, o);
    Object.assign(x, { item: f.item, part: f.part, spec: f.spec, vendor: f.vendor, note: f.note, date: f.date, time: f.time || "", data: r.data, thumb: await shotThumb(r.data), updated: Date.now() });
    await DB.put("shots", x); $("#sdImg").src = x.data; alert("黑板已更新");
  };
  const file = () => new File([dataURLtoBlob(x.data)], `施工照片_${x.date}_${(x.item || "").replace(/[\\/:*?"<>|]/g, "")}.jpg`, { type: "image/jpeg" });
  $("#sdShare").onclick = async () => {
    const fl = file();
    try { if (navigator.canShare?.({ files: [fl] })) { await navigator.share({ files: [fl] }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    pdfDownload(fl);
  };
  $("#sdDl").onclick = () => pdfDownload(file());
  $("#sdDel").onclick = async () => { if (!confirm("刪除這張照片？無法復原。")) return; await DB.del("shots", id); goBack("#/shot"); };
}

/* ---------- 施工照片冊（A4，每頁 2／4／6 格，可列印、分享 PDF） ---------- */
async function renderShotAlbum() {
  const all = (await DB.all("shots")).filter(x => x.siteId === siteId), set = new Set(shotAlbumIds);
  const items = all.filter(x => set.has(x.id)).sort((p, q) => p.date.localeCompare(q.date) || p.created - q.created);
  if (!items.length) { goReplace("#/shot"); return; }
  const company = ls.get("company", ""), d0 = items[0].date, d1 = items.at(-1).date, N = shotAlbumN, pages = [];
  for (let i = 0; i < items.length; i += N) pages.push(items.slice(i, i + N));
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="noprint phrow" style="margin:0 12px 8px"><span>版面：</span>${[2, 4, 6].map(n => `<button type="button" class="sec ${N === n ? "on" : ""}" data-n="${n}">每頁 ${n} 格</button>`).join("")}</div>
    ${items.length > 24 ? `<p class="noprint cnote" style="margin:0 12px 8px">照片較多（${items.length} 張），分享 PDF 會比較久，也比較耗記憶體，建議分批（用「選取照片」）。</p>` : ""}
    ${pages.map((pg, pi) => `<div class="paper shotal n${N}">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">施工照片</div>
      <table class="pt"><tr><th>工程名稱</th><td>${esc(shotSiteName())}</td><th>拍攝日期</th><td class="nw">${esc(pRoc(d0))}${d0 !== d1 ? " ～ " + esc(pRoc(d1)) : ""}</td><th>頁次</th><td class="nw">${pi + 1} / ${pages.length}</td></tr></table>
      <div class="gal">${pg.map((x, i) => `<figure><img src="${safeImg(x.data)}"><figcaption>${pi * N + i + 1}.　${esc(pRoc(x.date))}　${esc([x.item, x.part].filter(Boolean).join("・"))}</figcaption></figure>`).join("")}</div>
    </div>`).join("")}`;
  $("#pvBack").onclick = () => goBack("#/shot");
  $("#pvPrint").onclick = () => doPrint();
  view.querySelectorAll("[data-n]").forEach(b => b.onclick = () => { shotAlbumN = +b.dataset.n; renderShotAlbum(); });
}
