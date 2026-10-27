"use strict";
/* 職安衛勤前教育／危害告知簽到
   早上工具箱會議：全體合照、勾選今日高風險作業與危害告知項目、手機傳閱讓人員在九宮格裡輪流手寫簽名，
   一鍵產出 A4 簽到表（可列印、分享 PDF）。每天一筆，依日期留存，稽核時按日期就找得到。
   ※ 高風險作業、危害告知項目與聲明文字只是預設建議，請依公司職安衛規定到「設定」修改。 */

const SA_RISKS = ["墜落／高架作業（2 公尺以上、施工架、鋼構）", "吊掛／起重升降作業", "局限空間作業", "動火作業", "活線／感電作業", "營造危險作業（開挖、擋土、模板支撐、拆除）", "機械設備操作作業（被捲、被夾、被切割）", "特別危害健康作業（高溫、噪音、輻射、異常氣壓）"];
const SA_HAZARDS = ["墜落、滾落", "感電", "物體飛落、倒塌、崩塌", "被夾、被捲、被撞", "火災、爆炸", "缺氧、中毒", "個人防護具正確使用（安全帽、安全帶、安全鞋…）", "機具設備與車輛動線", "天氣與環境（高溫、強風、下雨）"];
const SA_STATEMENT = "以上人員已於作業前接受本日工作內容、作業環境、危害因素及安全衛生注意事項之告知，並確實遵守。";
const SA_PAGE = 9;

async function saCfg() {
  const c = await DB.get("matcats", "__safety");
  return { risks: c?.risks?.length ? c.risks : SA_RISKS, hazards: c?.hazards?.length ? c.hazards : SA_HAZARDS, statement: c?.statement || SA_STATEMENT };
}
const saNow = () => shotNowTime();
const saToday = () => shotLocalDate(new Date());
const saCells = (n = SA_PAGE) => Array.from({ length: n }, () => ({ id: uid(), name: "", co: "", sig: "" }));
const saSigned = r => r.people.filter(p => p.sig).length;
const saListed = r => r.people.filter(p => p.name || p.sig).length;

async function saNew() {
  const mine = (await DB.all("safety")).filter(x => x.siteId === siteId).sort((a, b) => b.created - a.created), last = mine[0];
  const r = { id: uid(), siteId, date: saToday(), time: saNow(), place: last?.place || "", host: last?.host || "", content: "", risks: [], hazards: [], extra: "", hostSig: "", people: saCells(), created: Date.now(), updated: Date.now() };
  await DB.put("safety", r); return r.id;
}

async function renderSafety(a, b) {
  if (!a) return renderSafetyList();
  if (a === "set") return renderSafetySet();
  return b === "print" ? renderSafetyPrint(a) : renderSafetyForm(a);
}

/* ---------- 列表 ---------- */
async function renderSafetyList() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const all = (await DB.all("safety")).filter(x => x.siteId === siteId).sort((x, y) => y.date.localeCompare(x.date) || y.created - x.created);
  view.innerHTML = `
    <h2 class="t">職安衛勤前教育／危害告知</h2>
    <div class="row" style="margin-top:0"><button id="saAdd">＋ 新增今日勤前教育</button><a class="btnlink sm" href="#/safety/set" aria-label="設定">⚙</a></div>
    ${all.length ? all.map(x => `<a class="rec" href="#/safety/${esc(x.id)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(pRoc(x.date))} ${esc(x.time)}</b><span style="color:var(--mut)">簽到 ${saSigned(x)}／${saListed(x)} 人</span></div>
      <small>${x.risks.length ? "⚠️ " + esc(x.risks.join("、")) : "未勾高風險作業"}${x.place ? "・" + esc(x.place) : ""}</small></a>`).join("")
      : `<div class="panel">還沒有紀錄。每天早上工具箱會議按「新增今日勤前教育」：拍合照、勾今日高風險作業與危害告知、傳閱手機簽名。</div>`}`;
  $("#saAdd").onclick = async () => { location.hash = "#/safety/" + await saNew(); };
}

/* ---------- 一天的勤前教育 ---------- */
async function renderSafetyForm(id) {
  const r = await DB.get("safety", id);
  if (!r) { goReplace("#/safety"); return; }
  const cfg = await saCfg(), all = (await DB.all("safety")).filter(x => x.siteId === r.siteId && x.id !== id).sort((a, b) => b.created - a.created);
  const known = k => [...new Set([...all.flatMap(x => x.people.map(p => p[k])), ...r.people.map(p => p[k])].filter(Boolean))].slice(0, 200);
  let photos = await photosOf(id), timer;
  const mark = t => { const el = $("#saSaved"); if (el) el.textContent = t; };
  const flush = async () => { clearTimeout(timer); r.updated = Date.now(); await DB.put("safety", r); ls.set("saHost", r.host); mark(`✓ 已暫存 ${saNow()}`); };
  const save = () => { clearTimeout(timer); mark("儲存中…"); timer = setTimeout(flush, 300); };
  const f = (k, lab, ph, type = "text") => `<div class="field"><label>${lab}</label><input data-f="${k}" type="${type}" placeholder="${ph}" value="${esc(r[k])}"></div>`;
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">勤前教育／危害告知</h2><div id="saSaved" class="saved">✓ 內容會自動暫存</div>
    <div class="panel"><div class="grid2">${f("date", "日期", "", "date")}${f("time", "時間", "", "time")}</div>
      ${f("place", "地點／作業區域", "例：3F 樓板、地下室開挖區")}${f("host", "主持人（工地負責人）", "姓名")}${f("content", "今日工作內容", "例：3F 柱鋼筋綁紮、模板組立")}</div>
    <div class="panel"><b>今日高風險作業</b> <small style="color:var(--mut)">有就勾</small>
      <div class="chips" style="margin:8px 0 0" id="saRisks">${[...cfg.risks, ...r.risks.filter(x => !cfg.risks.includes(x))].map(x => `<button type="button" class="chip ${r.risks.includes(x) ? "on" : ""}" data-risk="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>
    <div class="panel"><b>危害告知項目</b> <small style="color:var(--mut)">已告知的打勾</small>
      <div class="timing" style="flex-direction:column;gap:10px;margin-top:8px" id="saHaz">${[...cfg.hazards, ...r.hazards.filter(x => !cfg.hazards.includes(x))].map(x => `<label><input type="checkbox" data-haz="${esc(x)}" ${r.hazards.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div>
      <div class="field" style="margin-top:10px"><label>其他告知事項（可空白）</label><input data-f="extra" placeholder="例：今日有吊車作業，下方禁止進入" value="${esc(r.extra)}"></div></div>
    <div class="panel"><b>全體合照</b><div class="phrow"><button type="button" class="phbtn" id="saCam">📷 拍照</button><label class="phbtn alt">🖼 相簿<input type="file" accept="image/*" multiple hidden id="saFile"></label><div class="thumbs" id="saTh"></div></div></div>
    <h2 class="t" style="font-size:17px;margin-bottom:0">簽到（傳閱手機）</h2>
    <p class="cnote" style="margin:0 12px 6px">${esc(cfg.statement)}<br>請每位人員在自己的格子填姓名，並用手指簽名。</p>
    <div class="row" style="margin:0 12px 8px"><button class="sec" id="saPrev" ${all.length ? "" : "disabled"}>📋 帶入上次名單</button><button class="sec" id="saMore">＋ 新增 9 格</button></div>
    <div id="saGrid"></div>
    <datalist id="saNames">${known("name").map(x => `<option value="${esc(x)}">`).join("")}</datalist><datalist id="saCos">${known("co").map(x => `<option value="${esc(x)}">`).join("")}</datalist>
    <div class="panel"><div class="bar" style="display:flex;justify-content:space-between;align-items:center"><b>主持人簽名</b><button class="sec" id="saHostClr" style="min-height:36px">清除</button></div><div class="sigbox"><canvas data-sig="host"></canvas></div></div>
    ${attBlock("附加檔案（危害告知單、教育訓練資料等）")}
    <div class="row"><button class="sec" id="saPrint">👁 預覽／列印（A4）</button></div>
    <div class="row"><button class="danger" id="saDel">刪除這筆紀錄</button></div>`;
  view.querySelectorAll("[data-f]").forEach(el => el.oninput = () => { r[el.dataset.f] = el.value; save(); });
  $("#saRisks").onclick = e => { const b = e.target.closest("[data-risk]"); if (!b) return; const k = b.dataset.risk; r.risks = r.risks.includes(k) ? r.risks.filter(x => x !== k) : [...r.risks, k]; b.classList.toggle("on"); save(); };
  $("#saHaz").onchange = e => { const k = e.target.dataset?.haz; if (k === undefined) return; r.hazards = e.target.checked ? [...r.hazards, k] : r.hazards.filter(x => x !== k); save(); };
  // 全體合照
  const drawTh = () => { $("#saTh").innerHTML = photos.map(p => `<span class="th"><img src="${safeImg(p.data)}" alt="照片"><button data-pdel="${esc(p.id)}" aria-label="刪除照片">✕</button></span>`).join(""); };
  const addPhoto = async file => { const p = { id: uid(), recId: id, itemIdx: 0, data: await makePhoto(file, `${r.date} ${shotSiteName()}`.trim()), created: Date.now() }; await DB.put("photos", p); photos.push(p); drawTh(); };
  const many = async files => { for (const x of files) { try { await addPhoto(x); } catch { alert("這張照片無法讀取"); } } };
  drawTh();
  $("#saCam").onclick = () => openCamera("勤前教育全體合照", blob => addPhoto(blob), many);
  $("#saFile").onchange = async e => { const fs = [...e.target.files]; e.target.value = ""; await many(fs); };
  $("#saTh").onclick = async e => {
    const img = e.target.closest("img"); if (img) { openLightbox(photos, photos.findIndex(x => x.id === img.parentElement.querySelector("[data-pdel]").dataset.pdel)); return; }
    const del = e.target.dataset?.pdel; if (!del || !confirm("刪除這張照片？")) return;
    await DB.del("photos", del); photos = photos.filter(x => x.id !== del); drawTh();
  };
  // 九宮格簽到
  const holder = { sigs: {} };
  const syncSigs = () => { for (const p of r.people) p.sig = holder.sigs[p.id] || ""; };
  const drawGrid = () => {
    holder.sigs = Object.fromEntries(r.people.filter(p => p.sig).map(p => [p.id, p.sig]));
    const pages = []; for (let i = 0; i < r.people.length; i += SA_PAGE) pages.push(r.people.slice(i, i + SA_PAGE));
    $("#saGrid").innerHTML = pages.map((pg, pi) => `${pages.length > 1 ? `<small class="cnote" style="margin:4px 12px;display:block">第 ${pi + 1} 頁</small>` : ""}<div class="sagrid">${pg.map(p => `<div class="sacell" data-a="${esc(p.id)}"><button type="button" class="sax" data-rm="${esc(p.id)}" aria-label="刪除這格">✕</button>
      <input data-n="name" placeholder="姓名" list="saNames" value="${esc(p.name)}"><input data-n="co" placeholder="單位／工班" list="saCos" value="${esc(p.co)}">
      <canvas data-sig="${esc(p.id)}"></canvas><button type="button" class="sec sacl" data-clr="${esc(p.id)}">清除簽名</button></div>`).join("")}</div>`).join("");
    $("#saGrid").querySelectorAll("canvas").forEach(c => setupSig(c, holder, () => { syncSigs(); save(); }));
    $("#saGrid").querySelectorAll(".sacell").forEach(cell => {
      const p = r.people.find(x => x.id === cell.dataset.a);
      cell.querySelectorAll("[data-n]").forEach(el => el.oninput = () => { p[el.dataset.n] = el.value; save(); });
      $("[data-clr]", cell).onclick = () => { delete holder.sigs[p.id]; const c = $("canvas", cell); c.getContext("2d").clearRect(0, 0, c.width, c.height); syncSigs(); save(); };
      $("[data-rm]", cell).onclick = () => { if ((p.name || p.sig) && !confirm("刪除這一格（含姓名與簽名）？")) return; r.people = r.people.filter(x => x.id !== p.id); if (!r.people.length) r.people = saCells(); drawGrid(); save(); };
    });
  };
  drawGrid();
  $("#saMore").onclick = () => { syncSigs(); r.people = [...r.people, ...saCells()]; drawGrid(); save(); };
  $("#saPrev").onclick = () => {
    const prev = all[0]; if (!prev) return;
    const names = prev.people.filter(p => p.name).map(p => ({ id: uid(), name: p.name, co: p.co, sig: "" }));
    if (!names.length) { alert("上次紀錄沒有填姓名。"); return; }
    if (r.people.some(p => p.name || p.sig) && !confirm(`目前這張已經有人填寫，帶入上次的 ${names.length} 人（不含簽名）會取代目前名單，確定嗎？`)) return;
    r.people = names; while (r.people.length % SA_PAGE) r.people.push(...saCells(1)); drawGrid(); save();
  };
  // 主持人簽名
  const hs = { sigs: { host: r.hostSig } };
  setupSig($('canvas[data-sig="host"]'), hs, () => { r.hostSig = hs.sigs.host || ""; save(); });
  $("#saHostClr").onclick = () => { const c = $('canvas[data-sig="host"]'); c.getContext("2d").clearRect(0, 0, c.width, c.height); delete hs.sigs.host; r.hostSig = ""; save(); };
  attBind(view, id);
  $("#saPrint").onclick = async () => { syncSigs(); await flush(); location.hash = `#/safety/${id}/print`; };
  $("#saDel").onclick = async () => {
    if (!confirm("確定刪除這筆勤前教育紀錄？含合照、簽名與附加檔案，無法復原。")) return;
    for (const p of photos) await DB.del("photos", p.id);
    await attPurge(id); await DB.del("safety", id); goBack("#/safety");
  };
}

/* ---------- 預覽／列印 ---------- */
async function renderSafetyPrint(id) {
  const r = await DB.get("safety", id);
  if (!r) { goReplace("#/safety"); return; }
  const cfg = await saCfg(), site = sites.find(s => s.id === r.siteId), company = ls.get("company", ""), photos = await photosOf(id);
  const ppl = r.people.filter(p => p.name || p.sig), rows = Math.ceil(Math.max(ppl.length, 10) / 2);
  const hz = [...cfg.hazards, ...r.hazards.filter(x => !cfg.hazards.includes(x))], rk = [...cfg.risks, ...r.risks.filter(x => !cfg.risks.includes(x))];
  const cell = (p, n) => p ? `<td class="c">${n}</td><td>${esc(p.name)}</td><td><small>${esc(p.co)}</small></td><td class="c sgc">${p.sig ? `<img src="${safeImg(p.sig)}" style="max-height:11mm;max-width:30mm;display:block;margin:0 auto">` : ""}</td>` : `<td class="c">${n}</td><td></td><td></td><td class="sgc"></td>`;
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">職業安全衛生　勤前教育／危害告知　簽到表</div>
      <table class="pt"><tr><th>工程名稱</th><td colspan="3">${esc(site?.name)}</td><th>日期時間</th><td>${esc(pRoc(r.date))}　${esc(r.time)}</td></tr>
        <tr><th>地點／區域</th><td>${esc(r.place)}</td><th>主持人</th><td>${esc(r.host)}</td><th>今日工作</th><td>${esc(r.content)}</td></tr>
        <tr><th>高風險作業</th><td colspan="5">${rk.map(x => `${r.risks.includes(x) ? "☑" : "□"} ${esc(x)}`).join("　")}</td></tr>
        <tr><th>危害告知</th><td colspan="5" style="line-height:1.7">${hz.map(x => `${r.hazards.includes(x) ? "☑" : "□"} ${esc(x)}`).join("　")}${r.extra ? `<br>其他：${esc(r.extra)}` : ""}</td></tr></table>
      <p style="margin:2mm 0;font-size:12px">${esc(cfg.statement)}</p>
      <table class="pt items sm"><tr><th>序</th><th>姓名</th><th>單位／工班</th><th style="width:34mm">簽名</th><th>序</th><th>姓名</th><th>單位／工班</th><th style="width:34mm">簽名</th></tr>
        ${Array.from({ length: rows }, (_, i) => `<tr style="height:14mm">${cell(ppl[i], i + 1)}${cell(ppl[i + rows], i + rows + 1)}</tr>`).join("")}</table>
      <div class="psigs"><div>${r.hostSig ? `<img src="${safeImg(r.hostSig)}">` : "<br><br>"}主持人${r.host ? "：" + esc(r.host) : ""}</div><div><br><br>共 ${ppl.length} 人，已簽名 ${saSigned(r)} 人</div></div>
    </div>
    ${photos.length ? `<div class="paper gallery"><div class="ptitle">附件：勤前教育全體合照</div><div class="gal" style="grid-template-columns:1fr">${photos.map(p => `<figure><img src="${safeImg(p.data)}" style="max-height:150mm"><figcaption>${esc(pRoc(r.date))} ${esc(r.time)}　${esc(site?.name)}</figcaption></figure>`).join("")}</div></div>` : ""}`;
  { const ln = await attNamesLine(id, true); if (ln) $(".paper").insertAdjacentHTML("beforeend", ln); const g = await attGallery(id); if (g) view.insertAdjacentHTML("beforeend", g); }
  $("#pvBack").onclick = () => goBack("#/safety/" + id);
  $("#pvPrint").onclick = doPrint;
}

/* ---------- 設定 ---------- */
async function renderSafetySet() {
  const cfg = await saCfg();
  view.innerHTML = `
    <h2 class="t">勤前教育設定</h2>
    <p class="cnote" style="margin:0 12px 8px">內建項目只是常見的建議，請依公司職安衛規定修改。每行一項，改完自動儲存。</p>
    <div class="panel"><b>高風險作業</b><textarea id="ssRisks" rows="5" style="width:100%;margin-top:6px">${esc(cfg.risks.join("\n"))}</textarea></div>
    <div class="panel"><b>危害告知項目</b><textarea id="ssHaz" rows="10" style="width:100%;margin-top:6px">${esc(cfg.hazards.join("\n"))}</textarea></div>
    <div class="panel"><b>簽到聲明文字</b><textarea id="ssSt" rows="3" style="width:100%;margin-top:6px">${esc(cfg.statement)}</textarea></div>
    <div class="row"><button class="sec" id="ssReset">還原為預設</button></div>`;
  let t; const lines = v => v.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 40).map(x => x.slice(0, 60));
  const save = () => { clearTimeout(t); t = setTimeout(() => DB.put("matcats", { id: "__safety", risks: lines($("#ssRisks").value), hazards: lines($("#ssHaz").value), statement: $("#ssSt").value.trim().slice(0, 300), updated: Date.now() }), 400); };
  ["#ssRisks", "#ssHaz", "#ssSt"].forEach(s => $(s).oninput = save);
  $("#ssReset").onclick = async () => { if (!confirm("還原成內建的預設項目與聲明？")) return; await DB.del("matcats", "__safety"); renderSafetySet(); };
}
