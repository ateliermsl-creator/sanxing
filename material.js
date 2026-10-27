"use strict";
/* 材料進場驗收（通用版）
   - 材料類別與各類別的檢查項目、檢附文件清單由使用者自己設定（不預設任何標準）
   - 每次進場一筆紀錄：品名規格、數量、廠商、檢附文件、逐項檢查、處置、照片、送貨人與驗收人員簽名
   - 紀錄內保存當時的檢查項目快照，之後修改類別設定不會影響舊紀錄 */

const MAT_UNITS = ["支", "根", "片", "箱", "桶", "包", "袋", "卷", "m", "m²", "m³", "kg", "噸", "個", "組", "式", "其他"];
const MAT_DEFAULT_CATS = ["鋼筋", "模板", "水泥砂石", "磁磚石材", "防水材", "管材電線", "門窗五金", "其他"];
const MAT_DEFAULT_DOCS = ["出廠證明", "檢驗報告", "合格證明"];
const MAT_DISP = { accept: "驗收", reject: "退貨", pending: "待確認" };

/* ---------- 類別與設定 ---------- */
async function matSeed() {
  const cats = (await DB.all("matcats")).filter(c => c.id !== "__docs");
  if (!cats.length && !(await DB.get("matcats", "__deleted"))) {
    for (const [i, n] of MAT_DEFAULT_CATS.entries()) await DB.put("matcats", { id: "c_def" + i, name: n, checks: [], order: i, created: i, updated: 0 });
  }
  if (!(await DB.get("matcats", "__docs"))) await DB.put("matcats", { id: "__docs", docs: MAT_DEFAULT_DOCS.slice(), updated: 0 });
}
const matCats = async () => (await DB.all("matcats")).filter(c => !c.id.startsWith("__")).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.created - b.created);
const matDocNames = async () => (await DB.get("matcats", "__docs"))?.docs || MAT_DEFAULT_DOCS;

/* ---------- 判定 ---------- */
// 檢查結果：有不合格 → ng；全部填完 → ok；沒有項目或沒填 → na；部分填 → part
function matJudge(r) {
  const cs = r.checks || [], ans = cs.filter(c => c.r).length;
  return cs.some(c => c.r === "ng") ? "ng" : !cs.length || !ans ? "na" : ans < cs.length ? "part" : "ok";
}
// 最後結果：退貨／待確認以處置為準，其餘看檢查結果
function matFinal(r) { if (r.disp === "reject") return "reject"; if (r.disp === "pending") return "pending"; const j = matJudge(r); return j === "part" ? "na" : j; }
const MAT_LABEL = { ok: "合格", ng: "不合格", reject: "退貨", pending: "待確認", na: "未判定", part: "檢查中" };
const matBadge = r => { const f = matFinal(r), k = f === "ok" ? "ok" : f === "na" ? "na" : f === "pending" ? "pd" : "ng"; return `<span class="pb ${k}">${MAT_LABEL[f]}</span>`; };
const matName = r => [r.name, r.spec].filter(Boolean).join(" ") || "（未填品名）";
const matQty = r => (r.qty ? `${r.qty}${r.unit && r.unit !== "其他" ? " " + r.unit : ""}` : "—");

async function matNew(base = {}) {
  base = Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined));   // 沒指定的欄位不要蓋掉預設值
  const cats = await matCats(), catId = base.catId || ls.get("matCat", "") || cats[0]?.id || "", cat = cats.find(c => c.id === catId) || cats[0];
  const docs = (await matDocNames()).map(n => ({ n, v: false }));
  const r = { id: uid(), siteId, date: today(), time: pourNow(), catId: cat?.id || "", catName: cat?.name || "", name: "", spec: "", qty: "", unit: "", vendor: "", ticket: "", lot: "", location: "",
    docs, checks: (cat?.checks || []).map(t => ({ t, r: "", note: "" })), disp: "accept", note: "", names: { deliver: "", inspector: ls.get("matInspector", "") }, sigs: {}, created: Date.now(), updated: Date.now(), ...base };
  await DB.put("matrecs", r); return r;
}

async function renderMaterial(a, b) {
  await matSeed();
  if (!a) return renderMatList();
  if (a === "cfg") return renderMatCfg();
  if (a === "summary") return renderMatSummary();
  if (b === "print") return renderMatPrint(a);
  return renderMatForm(a);
}

/* ---------- 列表 ---------- */
let matCatFilter = "", matStFilter = "", matQuery = "";
async function renderMatList() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const seq = renderMatList.seq = (renderMatList.seq || 0) + 1;
  const cats = await matCats();
  // 清掉按了新增卻沒填任何內容的空白紀錄
  for (const x of (await DB.all("matrecs")).filter(x => x.siteId === siteId && !x.name.trim() && !x.spec.trim() && !x.vendor.trim() && !x.qty && !(x.checks || []).some(c => c.r) && !x.sigs?.inspector)) {
    if (!(await DB.all("photos")).some(p => p.recId === x.id) && !(await attFilesOf(x.id)).length) await DB.del("matrecs", x.id);
  }
  const all = (await DB.all("matrecs")).filter(x => x.siteId === siteId).sort((p, q) => q.date.localeCompare(p.date) || (q.time || "").localeCompare(p.time || "") || q.created - p.created);
  if (seq !== renderMatList.seq) return;
  if (matCatFilter && !cats.some(c => c.id === matCatFilter)) matCatFilter = "";
  const q = matQuery.trim();
  const list = all.filter(x => (!matCatFilter || x.catId === matCatFilter) && (!matStFilter || matFinal(x) === matStFilter) && (!q || (x.name + x.spec + x.vendor + x.ticket + x.lot).includes(q)));
  const cnt = k => all.filter(x => matFinal(x) === k).length;
  view.innerHTML = `
    <h2 class="t">材料進場驗收</h2>
    <div class="row" style="margin-top:0"><button id="mAdd">＋ 新增進場</button><a class="btnlink" href="#/material/summary">📊 進場台帳</a></div>
    <div class="row" style="margin-top:0"><a class="btnlink" href="#/material/cfg">⚙ 類別與檢查項目設定</a></div>
    <div class="chips"><button class="chip ${!matCatFilter ? "on" : ""}" data-c="">全部（${all.length}）</button>${cats.map(c => `<button class="chip ${matCatFilter === c.id ? "on" : ""}" data-c="${esc(c.id)}">${esc(c.name)}（${all.filter(x => x.catId === c.id).length}）</button>`).join("")}</div>
    <div class="panel" style="padding:10px 12px"><div class="grid2" style="gap:0 8px"><div class="field" style="margin:0"><input id="mQ" placeholder="搜尋品名／廠商／單號" value="${esc(matQuery)}"></div>
      <div class="field" style="margin:0"><select id="mS"><option value="">全部結果</option>${["ng", "reject", "pending", "ok", "na"].map(k => `<option value="${k}" ${matStFilter === k ? "selected" : ""}>${MAT_LABEL[k]}（${cnt(k)}）</option>`).join("")}</select></div></div>
      <small style="color:var(--mut)">共 ${list.length} 筆</small></div>
    <div id="mList">${list.length ? list.map(x => `<a class="rec" href="#/material/${esc(x.id)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(matName(x))}</b>${matBadge(x)}</div>
      <small>${esc(pRoc(x.date))} ${esc(x.time || "")}・${esc(x.catName)}・${esc(matQty(x))}${x.vendor ? "・" + esc(x.vendor) : ""}${x.ticket ? "・單號 " + esc(x.ticket) : ""}</small></a>`).join("")
      : `<div class="panel" style="color:var(--mut)">${all.length ? "這個條件下沒有紀錄" : "還沒有進場紀錄。材料進場時按「新增進場」，選材料類別，逐項檢查並請送貨人與驗收人員簽名。"}</div>`}</div>`;
  $("#mAdd").onclick = async () => { const r = await matNew({ catId: matCatFilter || undefined }); location.hash = "#/material/" + r.id; };
  view.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { matCatFilter = b.dataset.c; renderMatList(); });
  $("#mQ").oninput = e => { matQuery = e.target.value; clearTimeout(renderMatList.t); renderMatList.t = setTimeout(async () => { await renderMatList(); const el = $("#mQ"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 350); };
  $("#mS").onchange = e => { matStFilter = e.target.value; renderMatList(); };
}

/* ---------- 單筆進場 ---------- */
async function renderMatForm(id) {
  const r = await DB.get("matrecs", id);
  if (!r) { goReplace("#/material"); return; }
  r.checks = r.checks || []; r.docs = r.docs || []; r.names = r.names || {}; r.sigs = r.sigs || {};
  const site = sites.find(s => s.id === r.siteId), cats = await matCats(), all = (await DB.all("matrecs")).filter(x => x.siteId === r.siteId);
  const vendors = [...new Set(all.map(x => x.vendor).filter(Boolean))];
  let photos = (await DB.all("photos")).filter(p => p.recId === r.id).sort((a, b) => a.created - b.created), timer;
  const mark = t => { const el = $("#mrSaved"); if (el) el.textContent = t; };
  const flush = async () => { clearTimeout(timer); r.updated = Date.now(); await DB.put("matrecs", r); mark(`✓ 已暫存 ${pourNow()}`); };
  const save = () => { clearTimeout(timer); mark("儲存中…"); timer = setTimeout(flush, 300); };
  const inp = (k, lab, ph, extra = "") => `<div class="field"><label>${lab}</label><input data-f="${k}" ${extra} placeholder="${ph}" value="${esc(r[k])}"></div>`;
  const chk = (c, i) => `<div class="item" data-i="${i}"><div class="top"><div class="t" style="font-weight:600">${i + 1}. ${esc(c.t)}${c.extra ? ` <small style="color:var(--mut)">（本次增加）</small>` : ""}</div>
      <div class="sym">${["ok", "ng", "na"].map(k => `<button class="${c.r === k ? "on" : ""}" data-r="${k}" aria-label="${k}">${SYM[k]}</button>`).join("")}</div></div>
      <input class="note" placeholder="備註（可空白）" value="${esc(c.note)}" style="${c.r === "ng" || c.note ? "" : "display:none"}"></div>`;
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">材料進場驗收</h2><div id="mrSaved" class="saved">✓ 內容會自動暫存</div>
    <div class="panel"><div class="grid2"><div class="field"><label>日期</label><input type="date" data-f="date" value="${esc(r.date)}"></div>
        <div class="field"><label>進場時間</label><div style="display:flex;gap:6px"><input type="time" data-f="time" value="${esc(r.time)}" style="flex:1;min-width:0"><button type="button" class="sec" id="mNow" style="min-height:46px;padding:0 10px">現在</button></div></div></div>
      <div class="field"><label>材料類別</label><select id="mCat">${cats.map(c => `<option value="${c.id}" ${c.id === r.catId ? "selected" : ""}>${esc(c.name)}</option>`).join("")}${cats.some(c => c.id === r.catId) ? "" : `<option value="${esc(r.catId)}" selected>${esc(r.catName)}（已刪除）</option>`}</select></div>
      <div class="grid2">${inp("name", "品名", "例：竹節鋼筋")}${inp("spec", "規格", "例：D16")}</div>
      <div class="grid2"><div class="field"><label>數量</label><input data-f="qty" inputmode="decimal" value="${esc(r.qty)}"></div>
        <div class="field"><label>單位</label><select data-f="unit"><option value="">（選單位）</option>${MAT_UNITS.map(u => `<option ${r.unit === u ? "selected" : ""}>${u}</option>`).join("")}</select></div></div>
      <div class="field"><label>廠商</label><input data-f="vendor" list="mVendors" placeholder="廠商名稱" value="${esc(r.vendor)}"><datalist id="mVendors">${vendors.map(v => `<option value="${esc(v)}">`).join("")}</datalist></div>
      <div class="grid2">${inp("ticket", "送貨單號", "")}${inp("lot", "批號／爐號", "")}</div>
      <div class="field" style="margin-bottom:0"><label>存放位置</label><input data-f="location" placeholder="例：1F 材料區" value="${esc(r.location)}"></div></div>
    ${r.docs.length ? `<div class="panel"><b>檢附文件</b><div class="timing" style="margin-top:8px">${r.docs.map((d, i) => `<label><input type="checkbox" data-d="${i}" ${d.v ? "checked" : ""}> ${esc(d.n)}</label>`).join("")}</div></div>` : ""}
    ${attBlock("檢附文件電子檔（出廠證明、檢驗報告等）")}
    <h2 class="t" style="font-size:17px;margin-bottom:0">檢查項目</h2>
    <div class="legend" style="margin-top:6px">結果標記：<b style="color:var(--ok)">○ 合格</b>　<b style="color:var(--bad)">✕ 不合格</b>　<b style="color:var(--mut)">／ 不適用</b></div>
    <div id="mChecks">${r.checks.length ? r.checks.map(chk).join("") : `<div class="panel" style="color:var(--mut)">這個類別還沒有設定檢查項目。可到「類別與檢查項目設定」新增，或在下方增加本次要檢查的項目。</div>`}</div>
    <div class="panel"><div style="display:flex;gap:8px"><input id="mExtra" placeholder="增加本次檢查項目（例：外箱破損）" style="flex:1;min-width:0;padding:10px 12px;border:1px solid var(--line);border-radius:10px"><button id="mExtraBtn" class="sec" style="min-height:44px;padding:0 14px">＋</button></div></div>
    <div class="panel"><div id="mResult"></div>
      <div class="field" style="margin:10px 0 0"><label>處置</label><select data-f="disp">${Object.entries(MAT_DISP).map(([k, l]) => `<option value="${k}" ${r.disp === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field" style="margin:10px 0 0"><label>備註</label><input data-f="note" placeholder="例：外箱破損 2 箱，已退貨" value="${esc(r.note)}"></div></div>
    <div class="panel"><b>照片</b><div class="phrow"><button type="button" class="phbtn" id="mCam">📷 拍照</button><label class="phbtn alt">🖼 相簿<input type="file" accept="image/*" multiple hidden id="mFile"></label><div class="thumbs" id="mTh"></div></div></div>
    ${[["deliver", "送貨人（可空白）"], ["inspector", "驗收人員"]].map(([k, l]) => `<div class="panel"><div class="field" style="margin-bottom:6px"><label>${l}姓名</label><input data-n="${k}" value="${esc(r.names[k])}"></div>
      <div class="sigbox" style="margin:0"><div class="bar"><b>${l.replace("（可空白）", "")}簽名</b><button class="sec" data-clear="${k}">清除</button></div><canvas data-sig="${k}"></canvas></div></div>`).join("")}
    <div class="row"><button id="mDone">✔ 完成（回列表）</button></div>
    <div class="row"><button class="sec" id="mPrint">👁 預覽／列印驗收單</button><button class="sec" id="mNext">＋ 再新增一筆</button></div>
    <div class="row"><button class="danger" id="mDel">刪除這筆進場紀錄</button></div>`;

  const result = () => {
    const j = matJudge(r), f = matFinal(r), ng = r.checks.filter(c => c.r === "ng");
    $("#mResult").innerHTML = `<b>結果</b>　${matBadge(r)}${j === "part" ? ` <small style="color:var(--mut)">還有 ${r.checks.filter(c => !c.r).length} 項未檢查</small>` : ""}
      ${ng.length ? `<div class="cnote" style="color:#c0392b">不合格項目：${ng.map(c => esc(c.t)).join("、")}</div>` : ""}
      ${ng.length && r.disp === "accept" ? `<div class="legend" style="margin:8px 0 0;color:#c0392b">⚠ 有不合格項目，但處置是「驗收」，請確認；要退貨請改選「退貨」或「待確認」。</div>` : ""}`;
  };
  result();
  const drawTh = () => { $("#mTh").innerHTML = photos.map(p => `<span class="th"><img src="${safeImg(p.data)}" alt="照片"><button data-pdel="${esc(p.id)}" aria-label="刪除照片">✕</button></span>`).join(""); };
  drawTh();
  view.querySelectorAll("[data-f]").forEach(el => el.oninput = el.onchange = () => { r[el.dataset.f] = el.value; if (el.dataset.f === "disp") result(); save(); });
  $("#mNow").onclick = () => { r.time = pourNow(); view.querySelector('[data-f="time"]').value = r.time; save(); };
  $("#mCat").onchange = async e => {
    const cat = cats.find(c => c.id === e.target.value); if (!cat) return;
    if (r.checks.some(c => c.r) && !confirm("換類別會重設檢查項目與已填的結果，確定嗎？")) { e.target.value = r.catId; return; }
    r.catId = cat.id; r.catName = cat.name; r.checks = cat.checks.map(t => ({ t, r: "", note: "" })); ls.set("matCat", cat.id); await flush(); renderMatForm(id);
  };
  view.querySelectorAll("[data-d]").forEach(el => el.onchange = () => { r.docs[+el.dataset.d].v = el.checked; save(); });
  view.querySelectorAll("#mChecks .item").forEach(el => {
    const i = +el.dataset.i, note = $(".note", el);
    el.querySelectorAll(".sym button").forEach(b => b.onclick = () => {
      const c = r.checks[i]; c.r = c.r === b.dataset.r ? "" : b.dataset.r;
      el.querySelectorAll(".sym button").forEach(x => x.classList.toggle("on", x.dataset.r === c.r));
      note.style.display = c.r === "ng" || c.note ? "" : "none"; if (c.r === "ng") note.focus();
      result(); save();
    });
    note.oninput = () => { r.checks[i].note = note.value; save(); };
  });
  const addExtra = async () => { const v = $("#mExtra").value.trim(); if (!v) return; r.checks.push({ t: v, r: "", note: "", extra: true }); await flush(); renderMatForm(id); };
  $("#mExtraBtn").onclick = addExtra; $("#mExtra").onkeydown = e => { if (e.key === "Enter") addExtra(); };
  view.querySelectorAll("[data-n]").forEach(el => el.oninput = () => { r.names[el.dataset.n] = el.value; if (el.dataset.n === "inspector") ls.set("matInspector", el.value); save(); });
  view.querySelectorAll("canvas").forEach(c => setupSig(c, r, save));
  view.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => { const c = $(`canvas[data-sig=${b.dataset.clear}]`); c.getContext("2d").clearRect(0, 0, c.width, c.height); delete r.sigs[b.dataset.clear]; save(); });
  const addPhoto = async file => { const p = { id: uid(), recId: r.id, itemIdx: 0, data: await makePhoto(file, `${r.date} ${site?.name || ""}`.trim()), created: Date.now() }; await DB.put("photos", p); photos.push(p); drawTh(); };
  $("#mCam").onclick = () => openCamera(`材料進場：${matName(r)}`, blob => addPhoto(blob), async files => { for (const f of files) { try { await addPhoto(f); } catch { alert("這張照片無法讀取"); } } });
  $("#mFile").onchange = async e => { const fs = [...e.target.files]; e.target.value = ""; for (const f of fs) { try { await addPhoto(f); } catch { alert("這張照片無法讀取"); } } };
  view.onclick = async e => {
    const img = e.target.closest?.(".th img");
    if (img) { const pid = img.parentElement.querySelector("[data-pdel]").dataset.pdel; openLightbox(photos, photos.findIndex(x => x.id === pid)); return; }
    const del = e.target.dataset?.pdel; if (!del || !confirm("刪除這張照片？")) return;
    await DB.del("photos", del); photos = photos.filter(x => x.id !== del); drawTh();
  };
  attBind(view, r.id);
  $("#mDone").onclick = async () => { await flush(); goBack("#/material"); };
  $("#mPrint").onclick = async () => { await flush(); location.hash = "#/material/" + id + "/print"; };
  $("#mNext").onclick = async () => { await flush(); const n = await matNew({ catId: r.catId, vendor: r.vendor, date: r.date, location: r.location, names: { deliver: "", inspector: r.names.inspector || "" } }); goReplace("#/material/" + n.id); };
  $("#mDel").onclick = async () => { if (!confirm("確定刪除這筆進場紀錄？（含照片）")) return; for (const p of photos) await DB.del("photos", p.id); await attPurge(id); await DB.del("matrecs", id); goBack("#/material"); };
}

/* ---------- 驗收單預覽／列印（A4） ---------- */
let matPrintPhoto = true;
async function renderMatPrint(id) {
  const r = await DB.get("matrecs", id);
  if (!r) { goReplace("#/material"); return; }
  const site = sites.find(s => s.id === r.siteId), company = ls.get("company", "");
  const photos = (await DB.all("photos")).filter(p => p.recId === r.id).sort((a, b) => a.created - b.created);
  const sig = k => `<div>${r.sigs?.[k] ? `<img src="${safeImg(r.sigs[k])}">` : "<br><br>"}${k === "deliver" ? "送貨人" : "驗收人員"}${r.names?.[k] ? "：" + esc(r.names[k]) : ""}</div>`;
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <label class="noprint" style="display:flex;gap:8px;align-items:center;margin:0 12px 8px;font-size:15px"><input type="checkbox" id="pvPh" style="width:22px;height:22px" ${matPrintPhoto ? "checked" : ""}> 附照片頁（${photos.length} 張）</label>
    <div class="paper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">材料進場驗收單</div>
      <table class="pt"><tr><th>工程名稱</th><td colspan="3">${esc(site?.name)}</td></tr>
        <tr><th>進場日期時間</th><td>${esc(pRoc(r.date))} ${esc(r.time || "")}</td><th>材料類別</th><td>${esc(r.catName)}</td></tr>
        <tr><th>品名</th><td>${esc(r.name)}</td><th>規格</th><td>${esc(r.spec)}</td></tr>
        <tr><th>數量</th><td>${esc(matQty(r))}</td><th>廠商</th><td>${esc(r.vendor)}</td></tr>
        <tr><th>送貨單號</th><td>${esc(r.ticket)}</td><th>批號／爐號</th><td>${esc(r.lot)}</td></tr>
        <tr><th>存放位置</th><td>${esc(r.location)}</td><th>檢附文件</th><td>${r.docs.map(d => `${d.v ? "☑" : "□"}${esc(d.n)}`).join("　") || "—"}</td></tr></table>
      <table class="pt items"><tr><th style="width:9mm">#</th><th>檢查項目</th><th style="width:20mm">結果</th><th>備註</th></tr>
        ${r.checks.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${esc(c.t)}</td><td class="c" style="${c.r === "ng" ? "color:#c0392b;font-weight:700" : ""}">${c.r ? SYM[c.r] : ""}</td><td>${esc(c.note)}</td></tr>`).join("") || `<tr><td colspan="4" class="c" style="color:#777">（未設定檢查項目）</td></tr>`}
        <tr><td colspan="4" class="recheck">結果：<b>${MAT_LABEL[matFinal(r)]}</b>　處置：<b>${MAT_DISP[r.disp] || ""}</b>${r.note ? `<br>備註：${esc(r.note)}` : ""}<br><small>結果標記：○ 合格　✕ 不合格　／ 不適用</small></td></tr></table>
      <div class="psigs tall">${sig("deliver")}${sig("inspector")}</div>
    </div>
    ${matPrintPhoto && photos.length ? `<div class="paper gallery"><div class="ptitle">附件：照片</div><div class="gal">${photos.map(p => `<figure><img src="${safeImg(p.data)}"><figcaption>${esc(matName(r))}</figcaption></figure>`).join("")}</div></div>` : ""}`;
  { const ln = await attNamesLine(r.id); if (ln) $(".paper").insertAdjacentHTML("beforeend", ln); }
  $("#pvBack").onclick = () => goBack("#/material/" + id);
  $("#pvPrint").onclick = doPrint;
  $("#pvPh").onchange = e => { matPrintPhoto = e.target.checked; renderMatPrint(id); };
}

/* ---------- 類別與檢查項目設定 ---------- */
async function renderMatCfg() {
  const cats = await matCats(), docs = await matDocNames();
  view.innerHTML = `
    <h2 class="t">類別與檢查項目設定</h2>
    <div class="panel"><b>檢附文件清單</b><p class="cnote">每次新增進場會帶出這些勾選項。一行一個。</p>
      <textarea id="cDocs" rows="${Math.max(3, docs.length + 1)}" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:10px">${esc(docs.join("\n"))}</textarea></div>
    <h2 class="t" style="font-size:17px">材料類別</h2>
    <p class="cnote" style="margin:0 12px 6px">每個類別的「檢查項目」一行一個，新增進場選到該類別時會自動帶出。已經建立的舊紀錄不受影響。內建類別一開始沒有檢查項目，請依你們的驗收標準自行填寫。</p>
    <div id="cCats">${cats.map(c => `<details class="panel" data-id="${esc(c.id)}"><summary>${esc(c.name)}　<small style="color:var(--mut)">${c.checks.length} 項</small></summary>
      <div class="field" style="margin-top:8px"><label>類別名稱</label><input data-cn value="${esc(c.name)}"></div>
      <div class="field"><label>檢查項目（一行一個）</label><textarea data-cc rows="${Math.max(4, c.checks.length + 1)}" placeholder="例：標示是否完整&#10;外觀有無損傷">${esc(c.checks.join("\n"))}</textarea></div>
      <button class="danger" data-cdel style="min-height:40px">刪除這個類別</button></details>`).join("")}</div>
    <div class="row"><button class="sec" id="cAdd">＋ 新增類別</button></div>
    <div class="row"><a class="btnlink" href="#/material">← 回進場列表</a></div>`;
  let t;
  const saveCat = async el => {
    const box = el.closest("[data-id]"), c = await DB.get("matcats", box.dataset.id); if (!c) return;
    c.name = box.querySelector("[data-cn]").value.trim() || c.name; c.checks = box.querySelector("[data-cc]").value.split("\n").map(x => x.trim()).filter(Boolean); c.updated = Date.now(); await DB.put("matcats", c);
    box.querySelector("summary").innerHTML = `${esc(c.name)}　<small style="color:var(--mut)">${c.checks.length} 項</small>`;
  };
  view.querySelectorAll("[data-cn],[data-cc]").forEach(el => el.oninput = () => { clearTimeout(t); t = setTimeout(() => saveCat(el), 400); });
  $("#cDocs").oninput = e => { clearTimeout(t); t = setTimeout(async () => { await DB.put("matcats", { id: "__docs", docs: e.target.value.split("\n").map(x => x.trim()).filter(Boolean), updated: Date.now() }); }, 400); };
  view.querySelectorAll("[data-cdel]").forEach(b => b.onclick = async () => {
    const box = b.closest("[data-id]"); if (!confirm("刪除這個類別？已建立的進場紀錄不受影響。")) return;
    await DB.del("matcats", box.dataset.id); await DB.put("matcats", { id: "__deleted", updated: Date.now() }); renderMatCfg();   // __deleted：避免之後又自動補回內建類別
  });
  $("#cAdd").onclick = async () => { const n = prompt("新類別名稱"); if (!n || !n.trim()) return; await DB.put("matcats", { id: uid(), name: n.trim(), checks: [], order: 99, created: Date.now(), updated: Date.now() }); renderMatCfg(); };
}

/* ---------- 進場台帳（統計） ---------- */
let matFrom = "", matTo = "", matGroup = "cat";
async function renderMatSummary() {
  if (!siteId) { goReplace("#/material"); return; }
  const site = sites.find(s => s.id === siteId), company = ls.get("company", "");
  const all = (await DB.all("matrecs")).filter(x => x.siteId === siteId && (!matFrom || x.date >= matFrom) && (!matTo || x.date <= matTo)).sort((p, q) => p.date.localeCompare(q.date) || (p.time || "").localeCompare(q.time || ""));
  const keyOf = x => matGroup === "vendor" ? (x.vendor || "（未填廠商）") : (x.catName || "（未分類）");
  const keys = [...new Set(all.map(keyOf))].sort((m, n) => m.localeCompare(n, "zh-Hant"));
  const st = l => { const c = { n: l.length, ok: 0, ng: 0, reject: 0, pending: 0, na: 0 }; const qty = {}; l.forEach(x => { c[matFinal(x)]++; const v = parseFloat(x.qty); if (Number.isFinite(v)) { const u = x.unit && x.unit !== "其他" ? x.unit : ""; qty[u] = (qty[u] || 0) + v; } }); c.qty = Object.entries(qty).map(([u, v]) => `${fmt(v, 2)}${u ? " " + u : ""}`).join("、") || "—"; c.done = c.ok + c.ng + c.reject; c.rate = c.done ? Math.round(c.ok / c.done * 100) + "%" : "—"; return c; };
  const line = (lab, c) => `<td><b>${esc(lab)}</b></td><td class="c">${c.n}</td><td class="c">${esc(c.qty)}</td><td class="c">${c.ok}</td><td class="c" style="${c.ng ? "color:#c0392b;font-weight:700" : ""}">${c.ng}</td><td class="c" style="${c.reject ? "color:#c0392b;font-weight:700" : ""}">${c.reject}</td><td class="c">${c.pending}</td><td class="c">${c.na}</td><td class="c"><b>${c.rate}</b></td>`;
  const tot = st(all);
  view.innerHTML = `
    <div class="noprint"><h2 class="t">材料進場台帳</h2>
      <div class="panel"><div class="grid2"><div class="field" style="margin:0"><label>起（可空白）</label><input type="date" id="sFrom" value="${esc(matFrom)}"></div><div class="field" style="margin:0"><label>迄（可空白）</label><input type="date" id="sTo" value="${esc(matTo)}"></div></div>
        <div class="field" style="margin:8px 0 0"><label>統計方式</label><select id="sGroup"><option value="cat" ${matGroup === "cat" ? "selected" : ""}>依材料類別</option><option value="vendor" ${matGroup === "vendor" ? "selected" : ""}>依廠商</option></select></div></div>
      <div class="row"><button id="sPrint">🖨 列印／存成 PDF</button><button class="sec" id="sCsv">⬇ 下載 CSV</button></div>
      <div class="row"><button class="sec" id="sShare">📤 分享摘要</button><a class="btnlink" href="#/material">← 回進場列表</a></div></div>
    <div class="paper psum">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">材料進場台帳</div>
      <div style="margin:1mm 0 3mm;font-size:13px">工程：${esc(site?.name)}　期間：${matFrom ? pRoc(matFrom) : "起"} ～ ${matTo ? pRoc(matTo) : "今"}　製表：${pRoc(today())}</div>
      ${all.length ? `<table class="pt items sm"><tr><th>${matGroup === "vendor" ? "廠商" : "材料類別"}</th><th>進場<br>次數</th><th>數量</th><th>合格</th><th>不合格</th><th>退貨</th><th>待確認</th><th>未判定</th><th>合格率</th></tr>
        ${keys.map(k => `<tr>${line(k, st(all.filter(x => keyOf(x) === k)))}</tr>`).join("")}<tr>${line("合計", tot)}</tr></table>
        <div style="font-weight:700;margin:4mm 0 1mm">進場明細</div>
        <table class="pt items sm"><tr><th>日期</th><th>類別</th><th>品名規格</th><th>數量</th><th>廠商</th><th>送貨單</th><th>結果</th></tr>
          ${all.map(x => `<tr><td class="c nw">${esc(pRoc(x.date))}</td><td>${esc(x.catName)}</td><td>${esc(matName(x))}</td><td class="c nw">${esc(matQty(x))}</td><td>${esc(x.vendor)}</td><td>${esc(x.ticket)}</td><td class="c nw" style="${["ng", "reject"].includes(matFinal(x)) ? "color:#c0392b;font-weight:700" : ""}">${MAT_LABEL[matFinal(x)]}</td></tr>`).join("")}</table>
        <p class="cnote">合格率 = 合格 ÷（合格 + 不合格 + 退貨）；待確認與未判定不計入。數量依單位分別加總。</p>` : `<p style="color:var(--mut)">這個期間沒有進場紀錄。</p>`}
    </div>`;
  $("#sFrom").onchange = e => { matFrom = e.target.value; renderMatSummary(); };
  $("#sTo").onchange = e => { matTo = e.target.value; renderMatSummary(); };
  $("#sGroup").onchange = e => { matGroup = e.target.value; renderMatSummary(); };
  $("#sPrint").onclick = doPrint;
  $("#sCsv").onclick = () => {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const out = [["日期", "時間", "材料類別", "品名", "規格", "數量", "單位", "廠商", "送貨單號", "批號／爐號", "存放位置", "已附文件", "不合格項目", "處置", "結果", "送貨人", "驗收人員", "備註"]];
    all.forEach(x => out.push([pRoc(x.date), x.time, x.catName, x.name, x.spec, x.qty, x.unit, x.vendor, x.ticket, x.lot, x.location, (x.docs || []).filter(d => d.v).map(d => d.n).join("、"), (x.checks || []).filter(c => c.r === "ng").map(c => c.t).join("、"), MAT_DISP[x.disp], MAT_LABEL[matFinal(x)], x.names?.deliver, x.names?.inspector, x.note]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + out.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `材料進場台帳_${woRoc(today())}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $("#sShare").onclick = async () => {
    if (!all.length) { alert("這個期間沒有進場紀錄"); return; }
    const text = [`【材料進場台帳】${site?.name || ""}　${pRoc(today())}`, ...keys.map(k => { const c = st(all.filter(x => keyOf(x) === k)); return `${k}：${c.n} 次（${c.qty}）｜合格${c.ok}${c.ng ? `｜不合格${c.ng}` : ""}${c.reject ? `｜退貨${c.reject}` : ""}${c.pending ? `｜待確認${c.pending}` : ""}`; }), `合計：${tot.n} 次，合格率 ${tot.rate}`].join("\n");
    try { if (navigator.share) { await navigator.share({ title: "材料進場台帳", text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); alert("已複製，可貼到 LINE 或訊息。"); } catch { prompt("請複製以下內容", text); }
  };
}
