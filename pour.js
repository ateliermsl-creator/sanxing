"use strict";
/* 混凝土澆置與進場材料抽驗紀錄
   一次澆置（樓層／部位）= 一張表（pours store）；表內有多車紀錄：車號、出廠／到場時間、方量、坍度、氯離子、試體編號、簽名。
   判定標準（坍度範圍、氯離子上限、時限）由使用者依契約／規範填寫，系統只做比對。 */

const POUR_DISP = { use: "澆置使用", reject: "退料" };
const pourMin = (a, b) => { const s = woMin(a), e = woMin(b); return s === null || e === null ? null : (e - s + 1440) % 1440; };   // 出廠→到場（分），跨午夜自動 +24 小時
const pourNow = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
const pourNum = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const pourFloorKey = t => { let m; if ((m = /^B(\d+)/i.exec(t))) return -(+m[1]); if ((m = /^(\d+)\s*[Ff樓]?/.exec(t))) return +m[1]; if (/^(R\d*F?|屋頂|頂樓|屋突)/i.test(t)) return 1000; return 2000; };
const pourFloorSort = (m, n) => pourFloorKey(m) - pourFloorKey(n) || m.localeCompare(n, "zh-Hant");

/* 單車判定：標準有填的項目才比對。回傳 {st: ok|ng|na, items:[[名稱, 是否合格, 說明]]} */
function pourJudge(b, t) {
  const items = [];
  const s = pourNum(t.slump), lo = pourNum(b.slumpMin), hi = pourNum(b.slumpMax);
  if (s !== null && (lo !== null || hi !== null)) items.push(["坍度", !(lo !== null && s < lo) && !(hi !== null && s > hi), `${s} cm（標準 ${lo ?? "—"}～${hi ?? "—"}）`]);
  const c = pourNum(t.chloride), cl = pourNum(b.clMax);
  if (c !== null && cl !== null) items.push(["氯離子", c <= cl, `${c} kg/m³（上限 ${cl}）`]);
  const el = pourMin(t.leave, t.arrive), lim = pourNum(b.limitMin);
  if (el !== null && lim !== null) items.push(["時限", el <= lim, `${el} 分（上限 ${lim}）`]);
  return { st: !items.length ? "na" : items.every(x => x[1]) ? "ok" : "ng", items };
}
const pourBadge = st => st === "ok" ? `<span class="pb ok">合格</span>` : st === "ng" ? `<span class="pb ng">不合格</span>` : `<span class="pb na">未判定</span>`;

/* 統計：總澆置方量不含退料；合格率 = 合格車數 ÷ 已判定車數 */
function pourStats(batches) {
  const r = { batches: batches.length, trucks: 0, vol: 0, rej: 0, judged: 0, ok: 0, ng: 0, samples: 0, rejTrucks: 0 };
  for (const b of batches) for (const t of b.trucks || []) {
    r.trucks++; const v = pourNum(t.volume) || 0;
    if (t.disp === "reject") { r.rej += v; r.rejTrucks++; } else r.vol += v;
    const j = pourJudge(b, t); if (j.st !== "na") { r.judged++; r[j.st]++; }
    if (t.sampled) r.samples++;
  }
  return r;
}
const pourRate = r => (r.judged ? Math.round(r.ok / r.judged * 100) + "%" : "—");
const pourVol = v => fmt(v, 2);
const pourSpecKeys = ["supplier", "fc", "slumpMin", "slumpMax", "clMax", "limitMin"];

async function pourNew() {
  let spec = {}; try { spec = JSON.parse(ls.get("pourSpec", "{}")); } catch {}
  const b = { id: uid(), siteId, date: today(), floor: "", part: "", supplier: "", fc: "", slumpMin: "", slumpMax: "", clMax: "", limitMin: "90", ...spec, trucks: [], created: Date.now(), updated: Date.now() };
  await DB.put("pours", b); return b.id;
}
const pourSaveSpec = b => { const o = {}; pourSpecKeys.forEach(k => o[k] = b[k]); ls.set("pourSpec", JSON.stringify(o)); };   // 下次新增時沿用
const pourTitle = b => [b.floor, b.part].filter(Boolean).join(" ") || "（未填樓層／部位）";

async function renderPour(a, b, c) {
  if (!a) return renderPourList();
  if (a === "summary") return renderPourSummary();
  if (b === "truck") return renderPourTruck(a, c);
  if (b === "print") return renderPourPrint(a);
  return renderPourBatch(a);
}

/* ---------- 列表 ---------- */
async function renderPourList() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const all = (await DB.all("pours")).filter(x => x.siteId === siteId).sort((x, y) => y.date.localeCompare(x.date) || y.created - x.created);
  const tot = pourStats(all);
  view.innerHTML = `
    <h2 class="t">混凝土澆置抽驗</h2>
    <div class="row" style="margin-top:0"><button id="pjAdd">＋ 新增澆置</button><a class="btnlink" href="#/pour/summary">📊 統計總表</a></div>
    ${all.length ? `<div class="panel"><div class="kpis">${[["澆置次數", tot.batches], ["車數", tot.trucks], ["總方量 m³", pourVol(tot.vol)], ["合格率", pourRate(tot)]].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("")}</div></div>` : ""}
    ${all.length ? all.map(x => { const s = pourStats([x]); return `<a class="rec" href="#/pour/${esc(x.id)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(pourTitle(x))}</b><span style="color:var(--mut)">${esc(pRoc(x.date))}</span></div>
      <small>${esc(x.supplier || "（未填預拌廠）")}${x.fc ? "・fc' " + esc(x.fc) : ""}<br>${s.trucks} 車・${pourVol(s.vol)} m³${s.rej ? `（退料 ${pourVol(s.rej)}）` : ""}・合格率 ${pourRate(s)}${s.ng ? `・<span style="color:#c0392b">不合格 ${s.ng} 車</span>` : ""}</small></a>`; }).join("")
      : `<div class="panel" style="color:var(--mut)">還沒有澆置紀錄。預拌混凝土車進場時，按「新增澆置」，一車一筆記錄車號、時間、坍度、氯離子與試體編號，並請試驗人員與司機簽名。</div>`}`;
  $("#pjAdd").onclick = async () => { location.hash = "#/pour/" + await pourNew(); };
}

/* ---------- 一次澆置 ---------- */
async function renderPourBatch(id) {
  const bt = await DB.get("pours", id);
  if (!bt) { goReplace("#/pour"); return; }
  bt.trucks = bt.trucks || [];
  let timer;
  const mark = t => { const el = $("#pjSaved"); if (el) el.textContent = t; };
  const flush = async () => { clearTimeout(timer); bt.updated = Date.now(); await DB.put("pours", bt); pourSaveSpec(bt); mark(`✓ 已暫存 ${pourNow()}`); };
  const save = () => { clearTimeout(timer); mark("儲存中…"); timer = setTimeout(flush, 300); };
  const all = (await DB.all("pours")).filter(x => x.siteId === bt.siteId);
  const floors = [...new Set(all.map(x => x.floor).filter(Boolean))].sort(pourFloorSort), sups = [...new Set(all.map(x => x.supplier).filter(Boolean))];
  const f = (k, lab, ph, extra = "") => `<div class="field"><label>${lab}</label><input data-f="${k}" ${extra} placeholder="${ph}" value="${esc(bt[k])}"></div>`;
  const noSpec = !(bt.slumpMin || bt.slumpMax || bt.clMax);   // 坍度、氯離子標準都還沒填 → 預設展開
  const stat = pourStats([bt]);
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">澆置抽驗紀錄</h2><div id="pjSaved" class="saved">✓ 內容會自動暫存</div>
    <div class="panel"><div class="grid2"><div class="field"><label>日期</label><input type="date" data-f="date" value="${esc(bt.date)}"></div>
        <div class="field"><label>樓層</label><input data-f="floor" list="pjFloors" placeholder="例：3F、B1" value="${esc(bt.floor)}"><datalist id="pjFloors">${floors.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div></div>
      ${f("part", "澆置部位", "例：柱牆、梁板、基礎")}
      <div class="grid2"><div class="field" style="margin:0"><label>預拌廠</label><input data-f="supplier" list="pjSups" placeholder="預拌廠名稱" value="${esc(bt.supplier)}"><datalist id="pjSups">${sups.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
        <div class="field" style="margin:0"><label>設計強度 fc'（kgf/cm²）</label><input data-f="fc" inputmode="decimal" placeholder="例：280" value="${esc(bt.fc)}"></div></div></div>
    <details class="panel" ${noSpec ? "open" : ""}><summary>判定標準（請依契約／規範填寫）</summary>
      <p class="cnote">系統只依你填的標準比對，沒填的項目不判定。填好後下次新增會自動沿用。</p>
      <div class="grid2"><div class="field"><label>坍度下限（cm）</label><input data-f="slumpMin" inputmode="decimal" value="${esc(bt.slumpMin)}"></div><div class="field"><label>坍度上限（cm）</label><input data-f="slumpMax" inputmode="decimal" value="${esc(bt.slumpMax)}"></div>
        <div class="field"><label>氯離子上限（kg/m³）</label><input data-f="clMax" inputmode="decimal" value="${esc(bt.clMax)}"></div><div class="field"><label>出廠→到場時限（分）</label><input data-f="limitMin" inputmode="decimal" value="${esc(bt.limitMin)}"></div></div></details>
    <h2 class="t" style="font-size:17px">各車紀錄</h2>
    <div class="panel"><div class="kpis">${[["車數", stat.trucks], ["澆置方量 m³", pourVol(stat.vol)], ["已判定", stat.judged], ["合格率", pourRate(stat)]].map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      ${stat.rej ? `<p class="cnote">退料 ${stat.rejTrucks} 車、${pourVol(stat.rej)} m³（不計入澆置方量）</p>` : ""}</div>
    ${bt.trucks.map((t, i) => { const j = pourJudge(bt, t); return `<a class="rec" href="#/pour/${esc(bt.id)}/truck/${esc(t.id)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>第 ${i + 1} 車　${esc(t.plate || "（未填車號）")}</b>${pourBadge(j.st)}</div>
      <small>到場 ${esc(t.arrive || "—")}・${esc(t.volume || "—")} m³${t.slump ? "・坍度 " + esc(t.slump) : ""}${t.chloride ? "・Cl⁻ " + esc(t.chloride) : ""}${t.sampled ? "・試體 " + esc(t.specimen || "✓") : ""}${t.disp === "reject" ? `・<span style="color:#c0392b">退料</span>` : ""}${t.sigs?.tester && t.sigs?.driver ? "・✔簽名" : ""}</small></a>`; }).join("")}
    <div class="row"><button id="pjTruck">＋ 新增一車</button></div>
    ${attBlock("附加檔案（配比設計書、試驗報告等）")}
    <div class="row"><button class="sec" id="pjPrint">👁 預覽／列印（A4 橫式）</button><button class="sec" id="pjShare">📤 分享摘要</button></div>
    <div class="row"><button class="danger" id="pjDel">刪除這次澆置（含全部車次）</button></div>`;
  view.querySelectorAll("[data-f]").forEach(el => el.oninput = el.onchange = () => { bt[el.dataset.f] = el.value; save(); });
  $("#pjTruck").onclick = async () => {
    const prev = bt.trucks.at(-1);
    const t = { id: uid(), plate: "", ticket: "", leave: "", arrive: pourNow(), volume: prev?.volume || "", slump: "", chloride: "", temp: "", sampled: false, specimen: "", disp: "use", note: "", names: { tester: ls.get("pourTester", ""), driver: "" }, sigs: {}, created: Date.now() };
    bt.trucks.push(t); await flush(); location.hash = `#/pour/${bt.id}/truck/${t.id}`;
  };
  attBind(view, bt.id);
  $("#pjPrint").onclick = async () => { await flush(); location.hash = "#/pour/" + id + "/print"; };
  $("#pjShare").onclick = async () => {
    const s = pourStats([bt]), site = sites.find(x => x.id === bt.siteId);
    const text = [`【混凝土澆置抽驗】${site?.name || ""}`, `${pRoc(bt.date)}　${pourTitle(bt)}　${bt.supplier || ""}${bt.fc ? "　fc' " + bt.fc : ""}`,
      ...bt.trucks.map((t, i) => { const j = pourJudge(bt, t); return `${i + 1}. ${t.plate || "—"} ${t.arrive || ""}　${t.volume || "—"}m³　坍度${t.slump || "—"}　Cl⁻${t.chloride || "—"}${t.sampled ? "　試體" + (t.specimen || "✓") : ""}　${j.st === "ok" ? "合格" : j.st === "ng" ? "不合格" : "未判定"}${t.disp === "reject" ? "（退料）" : ""}`; }),
      `合計：${s.trucks} 車、澆置 ${pourVol(s.vol)} m³${s.rej ? `（退料 ${pourVol(s.rej)}）` : ""}、合格率 ${pourRate(s)}`].join("\n");
    try { if (navigator.share) { await navigator.share({ title: "混凝土澆置抽驗", text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); alert("已複製，可貼到 LINE 或訊息。"); } catch { prompt("請複製以下內容", text); }
  };
  $("#pjDel").onclick = async () => {
    if (!confirm(`確定刪除這次澆置？含 ${bt.trucks.length} 車的全部紀錄與照片，無法復原。`)) return;
    const ph = await DB.all("photos"); for (const p of ph) if (bt.trucks.some(t => t.id === p.recId)) await DB.del("photos", p.id);
    await attPurge([id, ...bt.trucks.map(t => t.id)]); await DB.del("pours", id); goBack("#/pour");
  };
}

/* ---------- 一車 ---------- */
async function renderPourTruck(id, tid) {
  const bt = await DB.get("pours", id); const t = bt?.trucks?.find(x => x.id === tid);
  if (!t) { goReplace(bt ? "#/pour/" + id : "#/pour"); return; }
  t.names = t.names || {}; t.sigs = t.sigs || {};
  const site = sites.find(s => s.id === bt.siteId), idx = bt.trucks.indexOf(t) + 1;
  let photos = (await DB.all("photos")).filter(p => p.recId === t.id).sort((a, b) => a.created - b.created), timer;
  const mark = x => { const el = $("#ptSaved"); if (el) el.textContent = x; };
  const flush = async () => { clearTimeout(timer); bt.updated = Date.now(); await DB.put("pours", bt); mark(`✓ 已暫存 ${pourNow()}`); };
  const save = () => { clearTimeout(timer); mark("儲存中…"); timer = setTimeout(flush, 300); };
  const inp = (k, lab, ph, extra = "") => `<div class="field"><label>${lab}</label><input data-t="${k}" ${extra} placeholder="${ph}" value="${esc(t[k])}"></div>`;
  const timeInp = (k, lab) => `<div class="field"><label>${lab}</label><div style="display:flex;gap:6px"><input type="time" data-t="${k}" value="${esc(t[k])}" style="flex:1;min-width:0"><button type="button" class="sec" data-now="${k}" style="min-height:46px;padding:0 10px">現在</button></div></div>`;
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">第 ${idx} 車　<small style="color:var(--mut);font-weight:400">${esc(pourTitle(bt))}</small></h2><div id="ptSaved" class="saved">✓ 內容會自動暫存</div>
    <div class="panel"><div class="grid2">${inp("plate", "車號", "例：ABC-1234")}${inp("ticket", "送貨單號（可空白）", "")}</div>
      <div class="grid2">${timeInp("leave", "出廠時間")}${timeInp("arrive", "到場時間")}</div><div id="ptEl" class="cnote" style="margin:0"></div></div>
    <div class="panel"><b>檢測與方量</b><div class="grid2" style="margin-top:8px">${inp("volume", "方量（m³）", "例：6", 'inputmode="decimal"')}${inp("slump", "坍度（cm）", "", 'inputmode="decimal"')}${inp("chloride", "氯離子（kg/m³）", "", 'inputmode="decimal"')}${inp("temp", "混凝土溫度（℃，可空白）", "", 'inputmode="decimal"')}</div>
      <div id="ptJudge"></div></div>
    <div class="panel"><label class="timing" style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-t="sampled" ${t.sampled ? "checked" : ""}> 本車有取樣（製作試體）</label>
      <div id="ptSpec" ${t.sampled ? "" : "hidden"}>${inp("specimen", "試體編號", "例：3F-01～03")}</div>
      <div class="field" style="margin:8px 0 0"><label>處置</label><select data-t="disp">${Object.entries(POUR_DISP).map(([k, l]) => `<option value="${k}" ${t.disp === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div class="field" style="margin:8px 0 0"><label>備註</label><input data-t="note" placeholder="例：加藥劑調整、退料原因" value="${esc(t.note || "")}"></div></div>
    <div class="panel"><b>送貨單／試驗照片</b><div class="phrow"><button type="button" class="phbtn" id="ptCam">📷 拍照</button><label class="phbtn alt">🖼 相簿<input type="file" accept="image/*" multiple hidden id="ptFile"></label><div class="thumbs" id="ptTh"></div></div></div>
    ${attBlock("附加檔案（送貨單、試驗報告等）")}
    ${[["tester", "試驗人員"], ["driver", "司機"]].map(([k, l]) => `<div class="panel"><div class="field" style="margin-bottom:6px"><label>${l}姓名</label><input data-n="${k}" value="${esc(t.names[k])}"></div>
      <div class="sigbox" style="margin:0"><div class="bar"><b>${l}簽名</b><button class="sec" data-clear="${k}">清除</button></div><canvas data-sig="${k}"></canvas></div></div>`).join("")}
    <div class="row"><button id="ptDone">✔ 完成（回澆置表）</button></div>
    <div class="row"><button class="sec" id="ptNext">＋ 下一車</button></div>
    <div class="row"><button class="danger" id="ptDel">刪除這一車</button></div>`;
  const judge = () => {
    const j = pourJudge(bt, t), el = pourMin(t.leave, t.arrive);
    $("#ptEl").textContent = el === null ? "" : `出廠→到場：${el} 分${pourNum(bt.limitMin) !== null && el > pourNum(bt.limitMin) ? "（超過時限）" : ""}`;
    $("#ptJudge").innerHTML = `<div style="margin-top:8px">${pourBadge(j.st)} ${j.items.map(([n, ok, d]) => `<span style="font-size:13px;color:${ok ? "var(--ok)" : "#c0392b"}">${ok ? "✔" : "✕"} ${n} ${esc(d)}</span>`).join("　")}</div>${j.st === "na" ? `<p class="cnote">尚未判定：請在上一頁「判定標準」填入標準，並輸入坍度、氯離子或時間。</p>` : ""}`;
  };
  judge();
  view.querySelectorAll("[data-t]").forEach(el => el.oninput = el.onchange = () => {
    t[el.dataset.t] = el.type === "checkbox" ? el.checked : el.value;
    if (el.dataset.t === "sampled") { $("#ptSpec").hidden = !el.checked; if (el.checked && !t.specimen) { t.specimen = `${bt.floor || ""}${bt.floor ? "-" : ""}${String(idx).padStart(2, "0")}`; view.querySelector('[data-t="specimen"]').value = t.specimen; } }
    judge(); save();
  });
  view.querySelectorAll("[data-now]").forEach(b => b.onclick = () => { t[b.dataset.now] = pourNow(); view.querySelector(`[data-t="${b.dataset.now}"]`).value = t[b.dataset.now]; judge(); save(); });
  view.querySelectorAll("[data-n]").forEach(el => el.oninput = () => { t.names[el.dataset.n] = el.value; if (el.dataset.n === "tester") ls.set("pourTester", el.value); save(); });
  view.querySelectorAll("canvas").forEach(c => setupSig(c, t, save));
  view.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => { const c = $(`canvas[data-sig=${b.dataset.clear}]`); c.getContext("2d").clearRect(0, 0, c.width, c.height); delete t.sigs[b.dataset.clear]; save(); });
  // 照片
  const drawTh = () => { $("#ptTh").innerHTML = photos.map(p => `<span class="th"><img src="${safeImg(p.data)}" alt="照片"><button data-pdel="${esc(p.id)}" aria-label="刪除照片">✕</button></span>`).join(""); };
  drawTh();
  const addPhoto = async file => { const p = { id: uid(), recId: t.id, itemIdx: 0, data: await makePhoto(file, `${bt.date} ${site?.name || ""}`.trim()), created: Date.now() }; await DB.put("photos", p); photos.push(p); drawTh(); };
  $("#ptCam").onclick = () => openCamera(`第 ${idx} 車：${t.plate || ""}`, blob => addPhoto(blob), async files => { for (const f of files) { try { await addPhoto(f); } catch { alert("這張照片無法讀取"); } } });
  $("#ptFile").onchange = async e => { const fs = [...e.target.files]; e.target.value = ""; for (const f of fs) { try { await addPhoto(f); } catch { alert("這張照片無法讀取"); } } };
  view.onclick = async e => {
    const img = e.target.closest?.(".th img");
    if (img) { const pid = img.parentElement.querySelector("[data-pdel]").dataset.pdel; openLightbox(photos, photos.findIndex(x => x.id === pid)); return; }
    const del = e.target.dataset?.pdel; if (!del || !confirm("刪除這張照片？")) return;
    await DB.del("photos", del); photos = photos.filter(x => x.id !== del); drawTh();
  };
  attBind(view, t.id);
  $("#ptDone").onclick = async () => { await flush(); goBack("#/pour/" + id); };
  $("#ptNext").onclick = async () => {
    await flush();
    const n = { id: uid(), plate: "", ticket: "", leave: "", arrive: pourNow(), volume: t.volume, slump: "", chloride: "", temp: "", sampled: false, specimen: "", disp: "use", note: "", names: { tester: t.names.tester || "", driver: "" }, sigs: {}, created: Date.now() };
    bt.trucks.push(n); await flush(); goReplace(`#/pour/${id}/truck/${n.id}`);
  };
  $("#ptDel").onclick = async () => {
    if (!confirm("確定刪除這一車？")) return;
    for (const p of photos) await DB.del("photos", p.id);
    await attPurge(tid); bt.trucks = bt.trucks.filter(x => x.id !== tid); await flush(); goBack("#/pour/" + id);
  };
}

/* ---------- 預覽／列印（A4 橫式） ---------- */
function pourLandscape() {
  document.getElementById("psumPrint")?.remove();
  const st = document.createElement("style"); st.id = "psumPrint"; st.textContent = "@media print{@page{size:A4 landscape;margin:10mm}}"; document.head.append(st);
}
let pourPrintPhoto = true;
async function renderPourPrint(id) {
  const bt = await DB.get("pours", id);
  if (!bt) { goReplace("#/pour"); return; }
  const site = sites.find(s => s.id === bt.siteId), company = ls.get("company", ""), s = pourStats([bt]);
  const photos = (await DB.all("photos")).filter(p => bt.trucks.some(t => t.id === p.recId)).sort((a, b) => a.created - b.created);
  const std = [pourNum(bt.slumpMin) !== null || pourNum(bt.slumpMax) !== null ? `坍度 ${bt.slumpMin || "—"}～${bt.slumpMax || "—"} cm` : "", pourNum(bt.clMax) !== null ? `氯離子 ≤ ${bt.clMax} kg/m³` : "", pourNum(bt.limitMin) !== null ? `出廠→到場 ≤ ${bt.limitMin} 分` : ""].filter(Boolean).join("　");
  const sigCell = (t, k) => `${t.sigs?.[k] ? `<img src="${safeImg(t.sigs[k])}" style="max-height:9mm;max-width:24mm;display:block;margin:0 auto">` : ""}<small>${esc(t.names?.[k] || "")}</small>`;
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <label class="noprint" style="display:flex;gap:8px;align-items:center;margin:0 12px 8px;font-size:15px"><input type="checkbox" id="pvPh" style="width:22px;height:22px" ${pourPrintPhoto ? "checked" : ""}> 附送貨單／試驗照片頁（${photos.length} 張）</label>
    <div class="paper psum">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">混凝土澆置與進場材料抽驗紀錄</div>
      <table class="pt"><tr><th>工程名稱</th><td colspan="3">${esc(site?.name)}</td><th>日期</th><td>${esc(pRoc(bt.date))}</td></tr>
        <tr><th>樓層／部位</th><td>${esc(pourTitle(bt))}</td><th>預拌廠</th><td>${esc(bt.supplier)}</td><th>設計強度</th><td>${bt.fc ? "fc' " + esc(bt.fc) + " kgf/cm²" : ""}</td></tr>
        <tr><th>判定標準</th><td colspan="5">${esc(std || "（未設定）")}</td></tr></table>
      <table class="pt items sm"><tr><th>序</th><th>車號</th><th>送貨單</th><th>出廠</th><th>到場</th><th>經過<br>分</th><th>方量<br>m³</th><th>坍度<br>cm</th><th>氯離子<br>kg/m³</th><th>溫度<br>℃</th><th>試體編號</th><th>處置</th><th>判定</th><th>試驗人員</th><th>司機</th></tr>
        ${bt.trucks.map((t, i) => { const j = pourJudge(bt, t), el = pourMin(t.leave, t.arrive); return `<tr><td class="c">${i + 1}</td><td class="nw">${esc(t.plate)}</td><td>${esc(t.ticket)}</td><td class="c nw">${esc(t.leave)}</td><td class="c nw">${esc(t.arrive)}</td><td class="c">${el ?? ""}</td><td class="c">${esc(t.volume)}</td><td class="c">${esc(t.slump)}</td><td class="c">${esc(t.chloride)}</td><td class="c">${esc(t.temp)}</td><td>${t.sampled ? esc(t.specimen || "✓") : ""}</td><td class="c nw" style="${t.disp === "reject" ? "color:#c0392b" : ""}">${POUR_DISP[t.disp] || ""}</td><td class="c nw" style="${j.st === "ng" ? "color:#c0392b;font-weight:700" : ""}">${j.st === "ok" ? "合格" : j.st === "ng" ? "不合格" : "—"}</td><td class="c">${sigCell(t, "tester")}</td><td class="c">${sigCell(t, "driver")}</td></tr>${t.note ? `<tr><td></td><td colspan="14" style="font-size:11px;color:#444">備註：${esc(t.note)}</td></tr>` : ""}`; }).join("") || `<tr><td colspan="15" class="c" style="color:#777">尚無車次</td></tr>`}</table>
      <p style="margin-top:3mm;font-size:13px">合計：<b>${s.trucks}</b> 車，澆置方量 <b>${pourVol(s.vol)}</b> m³${s.rej ? `（退料 ${s.rejTrucks} 車、${pourVol(s.rej)} m³，不計入）` : ""}；已判定 ${s.judged} 車，合格 ${s.ok}、不合格 ${s.ng}，抽驗合格率 <b>${pourRate(s)}</b>；取樣試體 ${s.samples} 組。</p>
    </div>
    ${pourPrintPhoto && photos.length ? `<div class="paper gallery psum"><div class="ptitle">附件：送貨單／試驗照片</div><div class="gal">${photos.map(p => { const i = bt.trucks.findIndex(t => t.id === p.recId); return `<figure><img src="${safeImg(p.data)}"><figcaption>第 ${i + 1} 車　${esc(bt.trucks[i]?.plate || "")}</figcaption></figure>`; }).join("")}</div></div>` : ""}`;
  pourLandscape();
  { const ln = await attNamesLine([bt.id, ...bt.trucks.map(t => t.id)]); if (ln) $(".paper").insertAdjacentHTML("beforeend", ln); }
  $("#pvBack").onclick = () => goBack("#/pour/" + id);
  $("#pvPrint").onclick = doPrint;
  $("#pvPh").onchange = e => { pourPrintPhoto = e.target.checked; renderPourPrint(id); };
}

/* ---------- 統計總表（依樓層） ---------- */
let pourFrom = "", pourTo = "";
async function renderPourSummary() {
  if (!siteId) { goReplace("#/pour"); return; }
  const site = sites.find(s => s.id === siteId), company = ls.get("company", "");
  const all = (await DB.all("pours")).filter(x => x.siteId === siteId && (!pourFrom || x.date >= pourFrom) && (!pourTo || x.date <= pourTo)).sort((a, b) => a.date.localeCompare(b.date));
  const floors = [...new Set(all.map(x => x.floor || "（未填樓層）"))].sort((m, n) => m === "（未填樓層）" ? 1 : n === "（未填樓層）" ? -1 : pourFloorSort(m, n));
  const rows = floors.map(fl => ({ fl, r: pourStats(all.filter(x => (x.floor || "（未填樓層）") === fl)) })), tot = pourStats(all);
  const line = (l, r) => `<td><b>${esc(l)}</b></td><td class="c">${r.batches}</td><td class="c">${r.trucks}</td><td class="c"><b>${pourVol(r.vol)}</b></td><td class="c">${r.rej ? pourVol(r.rej) : "—"}</td><td class="c">${r.judged}</td><td class="c">${r.ok}</td><td class="c" style="${r.ng ? "color:#c0392b;font-weight:700" : ""}">${r.ng}</td><td class="c"><b>${pourRate(r)}</b></td><td class="c">${r.samples}</td>`;
  view.innerHTML = `
    <div class="noprint"><h2 class="t">澆置抽驗統計總表</h2>
      <div class="panel"><div class="grid2"><div class="field" style="margin:0"><label>起（可空白）</label><input type="date" id="sFrom" value="${esc(pourFrom)}"></div><div class="field" style="margin:0"><label>迄（可空白）</label><input type="date" id="sTo" value="${esc(pourTo)}"></div></div></div>
      <div class="row"><button id="sPrint">🖨 列印／存成 PDF</button><button class="sec" id="sCsv">⬇ 下載 CSV</button></div>
      <div class="row"><button class="sec" id="sShare">📤 分享摘要</button><a class="btnlink" href="#/pour">← 回澆置列表</a></div></div>
    <div class="paper psum">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">混凝土澆置抽驗統計總表</div>
      <div style="margin:1mm 0 3mm;font-size:13px">工程：${esc(site?.name)}　期間：${pourFrom ? pRoc(pourFrom) : "起"} ～ ${pourTo ? pRoc(pourTo) : "今"}　製表：${pRoc(today())}</div>
      ${all.length ? `<table class="pt items sm"><tr><th>樓層</th><th>澆置<br>次數</th><th>車數</th><th>澆置方量<br>m³</th><th>退料<br>m³</th><th>已判定<br>車數</th><th>合格</th><th>不合格</th><th>抽驗<br>合格率</th><th>試體<br>組數</th></tr>
        ${rows.map(({ fl, r }) => `<tr>${line(fl, r)}</tr>`).join("")}<tr>${line("合計", tot)}</tr></table>
        <div style="font-weight:700;margin:4mm 0 1mm">各次澆置</div>
        <table class="pt items sm"><tr><th>日期</th><th>樓層／部位</th><th>預拌廠</th><th>fc'</th><th>車數</th><th>方量 m³</th><th>合格率</th><th>不合格</th></tr>
          ${all.map(x => { const r = pourStats([x]); return `<tr><td class="c nw">${esc(pRoc(x.date))}</td><td>${esc(pourTitle(x))}</td><td>${esc(x.supplier)}</td><td class="c">${esc(x.fc)}</td><td class="c">${r.trucks}</td><td class="c">${pourVol(r.vol)}</td><td class="c">${pourRate(r)}</td><td class="c" style="${r.ng ? "color:#c0392b;font-weight:700" : ""}">${r.ng}</td></tr>`; }).join("")}</table>
        <p class="cnote">澆置方量不含退料；抽驗合格率 = 合格車數 ÷ 已判定車數（已填標準且有檢測值的車次）。</p>` : `<p style="color:var(--mut)">這個期間沒有澆置紀錄。</p>`}
    </div>`;
  pourLandscape();
  $("#sFrom").onchange = e => { pourFrom = e.target.value; renderPourSummary(); };
  $("#sTo").onchange = e => { pourTo = e.target.value; renderPourSummary(); };
  $("#sPrint").onclick = doPrint;
  $("#sCsv").onclick = () => {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const out = [["日期", "樓層", "部位", "預拌廠", "設計強度fc'", "序", "車號", "送貨單號", "出廠", "到場", "經過(分)", "方量(m³)", "坍度(cm)", "氯離子(kg/m³)", "溫度(℃)", "取樣", "試體編號", "處置", "判定", "試驗人員", "司機", "備註"]];
    all.forEach(b => (b.trucks || []).forEach((t, i) => { const j = pourJudge(b, t); out.push([pRoc(b.date), b.floor, b.part, b.supplier, b.fc, i + 1, t.plate, t.ticket, t.leave, t.arrive, pourMin(t.leave, t.arrive) ?? "", t.volume, t.slump, t.chloride, t.temp, t.sampled ? "是" : "", t.specimen, POUR_DISP[t.disp] || "", j.st === "ok" ? "合格" : j.st === "ng" ? "不合格" : "未判定", t.names?.tester, t.names?.driver, t.note]); }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + out.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `混凝土澆置抽驗_${woRoc(today())}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $("#sShare").onclick = async () => {
    if (!all.length) { alert("這個期間沒有澆置紀錄"); return; }
    const text = [`【混凝土澆置抽驗統計】${site?.name || ""}　${pRoc(today())}`, ...rows.map(({ fl, r }) => `${fl}：${r.trucks} 車、${pourVol(r.vol)} m³、合格率 ${pourRate(r)}${r.ng ? `（不合格 ${r.ng}）` : ""}`), `合計：${tot.trucks} 車、${pourVol(tot.vol)} m³、合格率 ${pourRate(tot)}${tot.rej ? `；退料 ${pourVol(tot.rej)} m³` : ""}`].join("\n");
    try { if (navigator.share) { await navigator.share({ title: "混凝土澆置抽驗統計", text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); alert("已複製，可貼到 LINE 或訊息。"); } catch { prompt("請複製以下內容", text); }
  };
}
