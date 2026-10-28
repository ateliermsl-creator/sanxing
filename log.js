"use strict";
/* 施工日誌（B14-4 建築物施工日誌格式）
   欄位與順序照內政部「建築物施工日誌」：表頭（天氣、工期、進度）、一 施工概況、二 材料、三 人員機具、
   四 技術士、五 職安衛、六 取樣試驗、七 通知協力廠商、八 重要事項、簽章，另附技術士簽章表。
   每天一張，新增時自動帶入上一張的工程資料與累計；可一鍵帶入當天已輸入的材料進場、澆置、檢查與缺失。
   ※ 點工單不連動，人員機具請自行填寫。本格式僅供參考，實際欄位請依契約與主管機關要求。 */

const LG_DAYS = ["日", "一", "二", "三", "四", "五", "六"];
const LG_WX = ["晴", "多雲", "陰", "陣雨", "雨", "雷雨", "強風"];
const lgNum = v => { const n = parseFloat(String(v ?? "").trim()); return Number.isFinite(n) ? n : null; };
const lgSum = (a, b) => { const x = lgNum(a), y = lgNum(b); return x === null && y === null ? "" : fmt((x || 0) + (y || 0), 3); };
const lgDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
const lgRoc = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? { y: +m[1] - 1911, m: +m[2], d: +m[3] } : null; };
const lgRocText = iso => { const r = lgRoc(iso); return r ? `${r.y} 年 ${r.m} 月 ${r.d} 日` : "　　年　　月　　日"; };
const lgWeek = iso => { const n = lgDay(iso); return Number.isFinite(n) ? LG_DAYS[new Date(n * 864e5).getUTCDay()] : ""; };
const lgRow = (o = {}) => ({ id: uid(), name: "", unit: "", contract: "", design: "", today: "", prev: "", note: "", ...o });
const lgSecs = {
  items: [["name", "施工項目", "text"], ["unit", "單位", "text"], ["contract", "契約數量", "decimal"], ["today", "本日完成", "decimal"], ["prev", "前累計", "decimal"], ["note", "備註", "text"]],
  specials: [["name", "施工項目", "text"], ["unit", "單位", "text"], ["contract", "契約數量", "decimal"], ["today", "本日完成", "decimal"], ["prev", "前累計", "decimal"], ["note", "備註", "text"]],
  mats: [["name", "材料名稱", "text"], ["unit", "單位", "text"], ["design", "設計數量", "decimal"], ["today", "本日使用", "decimal"], ["prev", "前累計", "decimal"], ["note", "備註", "text"]],
  labor: [["name", "工別", "text"], ["today", "本日人數", "decimal"], ["prev", "前累計人數", "decimal"]],
  machines: [["name", "機具名稱", "text"], ["today", "本日使用數量", "decimal"], ["prev", "前累計數量", "decimal"]]
};

async function lgNew() {
  const last = (await DB.all("logs")).filter(x => x.siteId === siteId).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created)[0];
  const carry = k => (last?.[k] || []).map(r => lgRow({ ...r, id: uid(), prev: lgSum(r.prev, r.today), today: "" }));
  const r = {
    id: uid(), siteId, no: "", date: shotLocalDate(new Date()), wxAm: "", wxPm: "", contractor: last?.contractor || ls.get("company", ""),
    approved: last?.approved || "", extend: last?.extend || "", start: last?.start || "", finish: last?.finish || "", planPct: "", actualPct: "",
    items: carry("items"), specials: carry("specials"), mats: carry("mats"), labor: carry("labor"), machines: carry("machines"),
    tech: "", techItem: "", techNeed: "", techRows: [], pre: "", newLabor: "", ppe: "", other: "", sampling: "", notify: "", important: "", sig: "", signer: last?.signer || "",
    created: Date.now(), updated: Date.now()
  };
  for (const k of ["items", "labor", "machines"]) if (!r[k].length) r[k].push(lgRow());
  await DB.put("logs", r); return r.id;
}

async function renderLog(a, b) {
  if (!a) return renderLogList();
  return b === "print" ? renderLogPrint(a) : renderLogForm(a);
}

/* ---------- 列表 ---------- */
async function renderLogList() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const all = (await DB.all("logs")).filter(x => x.siteId === siteId).sort((x, y) => y.date.localeCompare(x.date) || y.created - x.created);
  view.innerHTML = `
    <h2 class="t">施工日誌</h2>
    <div class="row" style="margin-top:0"><button id="lgAdd">＋ 新增日誌</button></div>
    ${all.length ? all.map(x => `<a class="rec" href="#/log/${esc(x.id)}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(pRoc(x.date))}（星期${lgWeek(x.date)}）</b><span class="st ${x.sig ? "st-已完成" : "st-填寫中"}">${x.sig ? "✔ 已簽章" : "填寫中"}</span></div>
      <small>${esc([x.wxAm && "上午" + x.wxAm, x.wxPm && "下午" + x.wxPm].filter(Boolean).join("　"))}${x.actualPct ? `　實際進度 ${esc(x.actualPct)}%` : ""}</small></a>`).join("")
      : `<div class="panel">還沒有日誌。按「新增日誌」會自動帶入上一張的工程資料與累計，每天只要補今日內容。</div>`}`;
  $("#lgAdd").onclick = async () => { location.hash = "#/log/" + await lgNew(); };
}

/* ---------- 填寫 ---------- */
async function renderLogForm(id) {
  const r = await DB.get("logs", id);
  if (!r) { goReplace("#/log"); return; }
  r.techRows = r.techRows || [];
  let timer;
  const mark = t => { const el = $("#lgSaved"); if (el) el.textContent = t; };
  const flush = async () => { clearTimeout(timer); r.updated = Date.now(); await DB.put("logs", r); mark(`✓ 已暫存 ${shotNowTime()}`); };
  const save = () => { clearTimeout(timer); mark("儲存中…"); timer = setTimeout(flush, 300); };
  const f = (k, lab, ph = "", type = "text", extra = "") => `<div class="field"><label>${lab}</label><input data-f="${k}" type="${type}" ${extra} placeholder="${ph}" value="${esc(r[k])}"></div>`;
  const wx = k => `<div class="field"><label>${k === "wxAm" ? "上午天氣" : "下午天氣"}</label><input data-f="${k}" list="lgWx" value="${esc(r[k])}" placeholder="例：晴"></div>`;
  const tri = (k, opts) => `<div class="timing" data-tri="${k}">${opts.map(([v, l]) => `<label><input type="radio" name="${k}" value="${v}" ${r[k] === v ? "checked" : ""}> ${l}</label>`).join("")}</div>`;
  const sec = (key, title, hint = "") => `<div class="panel"><b>${title}</b>${hint ? ` <small style="color:var(--mut)">${hint}</small>` : ""}<div id="lg_${key}"></div><div class="row"><button class="sec" data-add="${key}">＋ 增加一列</button>${key === "items" ? `<button class="sec" id="lgCarry">📋 重新帶入上次</button>` : ""}${key === "mats" ? `<button class="sec" id="lgMat">📥 帶入今日進場材料</button>` : ""}</div></div>`;
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">施工日誌</h2><div id="lgSaved" class="saved">✓ 內容會自動暫存</div>
    <datalist id="lgWx">${LG_WX.map(x => `<option value="${x}">`).join("")}</datalist>
    <div class="panel"><div class="grid2">${f("date", "填表日期", "", "date")}${f("no", "表報編號")}</div><div id="lgWeek" class="cnote" style="margin:0"></div>
      <div class="grid2">${wx("wxAm")}${wx("wxPm")}</div></div>
    <div class="panel"><b>工程資料</b> <small style="color:var(--mut)">新增時沿用上一張</small>
      <div class="field"><label>承攬廠商名稱</label><input data-f="contractor" value="${esc(r.contractor)}"></div>
      <div class="grid2">${f("approved", "核定工期（天）", "", "text", 'inputmode="decimal"')}${f("extend", "工期展延天數", "", "text", 'inputmode="decimal"')}${f("start", "開工日期", "", "date")}${f("finish", "完工日期", "", "date")}
        ${f("planPct", "預定進度（%）", "", "text", 'inputmode="decimal"')}${f("actualPct", "實際進度（%）", "", "text", 'inputmode="decimal"')}</div>
      <div id="lgDur" class="big"></div></div>
    ${sec("items", "一、依施工計畫書執行按圖施工概況", "含約定之重要施工項目及完成數量")}
    ${sec("specials", "　營造業專業工程特定施工項目", "A、B…")}
    ${sec("mats", "二、工地材料管理概況", "含約定之重要材料使用狀況及數量")}
    ${sec("labor", "三、工地人員（工別）", "含約定之出工人數")}
    ${sec("machines", "　機具使用情形")}
    <div class="panel"><b>四、本日施工項目是否有須依「營造業專業工程特定施工項目應置之技術士種類、比率或人數標準表」應設置技術士之專業工程</b>
      ${tri("tech", [["yes", "有"], ["no", "無"]])}
      <div id="lgTech" ${r.tech === "yes" ? "" : "hidden"}><p class="cnote">勾選「有」須填「技術士簽章表」。</p>
        <div class="grid2">${f("techItem", "專業工程項目")}${f("techNeed", "應置技術士人數", "", "text", 'inputmode="decimal"')}</div><div id="lg_techRows"></div><div class="row"><button class="sec" data-add="techRows">＋ 增加技術士</button></div></div></div>
    <div class="panel"><b>五、工地職業安全衛生事項之督導、公共環境與安全之維護及其他工地行政事務</b>
      <div class="field"><label>(一)1. 實施勤前教育（含工地預防災變及危害告知）</label>${tri("pre", [["yes", "有"], ["no", "無"]])}<small id="lgPreHint" class="cnote"></small></div>
      <div class="field"><label>2. 確認新進勞工是否提報勞工保險（或其他商業保險）資料及安全衛生教育訓練紀錄</label>${tri("newLabor", [["yes", "有"], ["no", "無"], ["none", "無新進勞工"]])}</div>
      <div class="field"><label>3. 檢查勞工個人防護具</label>${tri("ppe", [["yes", "有"], ["no", "無"]])}</div>
      <div class="field"><label>(二)其他事項</label><textarea data-f="other" rows="3">${esc(r.other)}</textarea></div></div>
    <div class="panel"><b>六、施工取樣試驗紀錄</b> <button class="sec" id="lgSamp" style="min-height:36px;margin-left:6px">📥 帶入今日澆置／試體</button><textarea data-f="sampling" rows="4" style="margin-top:8px">${esc(r.sampling)}</textarea></div>
    <div class="panel"><b>七、通知協力廠商辦理事項</b><textarea data-f="notify" rows="3" style="margin-top:8px">${esc(r.notify)}</textarea></div>
    <div class="panel"><b>八、重要事項記錄</b> <button class="sec" id="lgImp" style="min-height:36px;margin-left:6px">📥 帶入今日檢查與缺失</button>
      <p class="cnote">包含：(1) 主辦機關及監造單位指示　(2) 工地遇緊急異常狀況之通報處理情形　(3) 本日是否由專任工程人員督察按圖施工、解決施工技術問題等。</p>
      <textarea data-f="important" rows="5">${esc(r.important)}</textarea></div>
    <div class="panel"><div class="field"><label>工地主任姓名</label><input data-f="signer" value="${esc(r.signer)}"></div>
      <div style="display:flex;justify-content:space-between;align-items:center"><b>簽章：【工地主任】</b><button class="sec" id="lgClr" style="min-height:36px">清除</button></div><div class="sigbox"><canvas data-sig="boss"></canvas></div></div>
    ${attBlock("附加檔案")}
    <div class="row"><button class="sec" id="lgPrint">👁 預覽／列印（A4）</button></div>
    <div class="row"><button class="danger" id="lgDel">刪除這張日誌</button></div>`;

  // 一般欄位
  const dur = () => {
    const cur = lgDay(r.date), st = lgDay(r.start), ap = lgNum(r.approved), ex = lgNum(r.extend) || 0;
    const cum = Number.isFinite(cur) && Number.isFinite(st) ? cur - st + 1 : null, left = cum !== null && ap !== null ? ap + ex - cum : null;
    $("#lgWeek").textContent = r.date ? `星期${lgWeek(r.date)}・民國 ${lgRocText(r.date)}` : "";
    $("#lgDur").innerHTML = `<span>累計工期</span><b>${cum === null ? "—" : cum + " 天"}</b><span>　剩餘工期</span><b>${left === null ? "—" : left + " 天"}</b>`;
  };
  view.querySelectorAll("[data-f]").forEach(el => el.oninput = () => { r[el.dataset.f] = el.value; dur(); save(); });
  view.querySelectorAll("[data-tri]").forEach(box => box.onchange = e => { const k = box.dataset.tri; r[k] = e.target.value; if (k === "tech") $("#lgTech").hidden = r.tech !== "yes"; save(); });
  dur();
  // 表格列
  const draw = key => {
    const defs = key === "techRows" ? [["kind", "技術士種類", "text"], ["count", "人數", "decimal"], ["name", "姓名", "text"], ["cert", "證書字號", "text"], ["note", "備註", "text"]] : lgSecs[key];
    const wrap = $("#lg_" + key), rows = r[key];
    wrap.innerHTML = rows.map((row, i) => `<div class="lgrow" data-i="${i}">
      <div class="lghead"><b>${key === "specials" ? String.fromCharCode(65 + i) + "." : i + 1}</b>${key === "techRows" ? "" : `<span class="lgcum"></span>`}<button type="button" class="danger" data-rm="${i}" aria-label="刪除" style="min-height:32px;width:36px;padding:0">✕</button></div>
      <div class="lggrid">${defs.map(([k, l, m]) => `<div class="field" style="margin:0;${k === "name" || k === "note" || k === "cert" ? "grid-column:1/-1" : ""}"><label>${l}</label><input data-k="${k}" ${m === "decimal" ? 'inputmode="decimal"' : ""} value="${esc(row[k])}"></div>`).join("")}</div>
      ${key === "techRows" ? `<canvas data-sig="${esc(row.id)}" class="lgsig"></canvas><button class="sec" data-clr="${esc(row.id)}" style="min-height:32px;font-size:13px">清除簽名</button>` : ""}</div>`).join("");
    const cumOf = row => lgSum(row.prev, row.today);
    wrap.querySelectorAll(".lgrow").forEach(el => {
      const row = rows[+el.dataset.i], showCum = () => { const c = $(".lgcum", el); if (c) c.textContent = cumOf(row) ? `累計 ${cumOf(row)}` : ""; };
      el.querySelectorAll("[data-k]").forEach(inp => inp.oninput = () => { row[inp.dataset.k] = inp.value; showCum(); save(); }); showCum();
      $("[data-rm]", el).onclick = () => { rows.splice(+el.dataset.i, 1); if (!rows.length && key !== "techRows" && key !== "specials") rows.push(lgRow()); draw(key); save(); };
    });
    if (key === "techRows") {
      const h = { sigs: Object.fromEntries(rows.filter(x => x.sig).map(x => [x.id, x.sig])) };
      wrap.querySelectorAll("canvas").forEach(c => setupSig(c, h, () => { rows.forEach(x => x.sig = h.sigs[x.id] || ""); save(); }));
      wrap.querySelectorAll("[data-clr]").forEach(b => b.onclick = () => { const c = $(`canvas[data-sig="${b.dataset.clr}"]`, wrap); c.getContext("2d").clearRect(0, 0, c.width, c.height); delete h.sigs[b.dataset.clr]; rows.forEach(x => x.sig = h.sigs[x.id] || ""); save(); });
    }
  };
  ["items", "specials", "mats", "labor", "machines", "techRows"].forEach(draw);
  view.querySelectorAll("[data-add]").forEach(b => b.onclick = () => { const k = b.dataset.add; r[k].push(k === "techRows" ? { id: uid(), kind: "", count: "", name: "", cert: "", note: "", sig: "" } : lgRow()); draw(k); save(); });
  // 帶入
  const lastLog = async () => (await DB.all("logs")).filter(x => x.siteId === r.siteId && x.id !== id && x.date <= r.date).sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created)[0];
  $("#lgCarry").onclick = async () => {
    const p = await lastLog(); if (!p) { alert("找不到更早的日誌。"); return; }
    if (r.items.some(x => x.name || x.today) && !confirm("目前「施工概況」已有內容，重新帶入上次（含累計）會取代，確定嗎？")) return;
    for (const k of ["items", "specials", "mats", "labor", "machines"]) { r[k] = (p[k] || []).map(x => lgRow({ ...x, id: uid(), prev: lgSum(x.prev, x.today), today: "" })); if (!r[k].length && k !== "specials") r[k].push(lgRow()); draw(k); }
    save();
  };
  const dayRecs = async store => (await DB.all(store)).filter(x => x.siteId === r.siteId && x.date === r.date);
  $("#lgMat").onclick = async () => {
    const ms = await dayRecs("matrecs"); if (!ms.length) { alert("這一天沒有材料進場驗收紀錄。"); return; }
    r.mats = r.mats.filter(x => x.name || x.today || x.prev);
    for (const m of ms) r.mats.push(lgRow({ name: [m.name, m.spec].filter(Boolean).join(" "), unit: m.unit, note: `進場 ${[m.qty, m.unit].filter(Boolean).join("")}${m.disp === "reject" ? "（退貨）" : m.disp === "pending" ? "（待確認）" : ""}` }));
    draw("mats"); save();
  };
  $("#lgSamp").onclick = async () => {
    const ps = await dayRecs("pours"), lines = [];
    for (const b of ps) { const s = pourStats([b]); lines.push(`澆置 ${pourTitle(b)}：${s.trucks} 車、${pourVol(s.vol)} m³${s.rej ? `（退料 ${pourVol(s.rej)} m³）` : ""}${b.supplier ? "，" + b.supplier : ""}${b.fc ? "，fc' " + b.fc : ""}`);
      b.trucks.filter(t => t.sampled).forEach(t => lines.push(`　取樣試體 ${t.specimen || "（未編號）"}${t.slump ? "，坍度 " + t.slump + " cm" : ""}${t.chloride ? "，氯離子 " + t.chloride : ""}`)); }
    try { const { tests } = await cuBuild(); tests.filter(x => !x.done && x.due === lgDay(r.date)).forEach(x => lines.push(`今日滿 ${x.age} 天待壓：${x.loc} ${x.spec}`)); } catch {}
    if (!lines.length) { alert("這一天沒有澆置或取樣紀錄。"); return; }
    r.sampling = (r.sampling ? r.sampling + "\n" : "") + lines.join("\n"); $("[data-f=sampling]").value = r.sampling; save();
  };
  $("#lgImp").onclick = async () => {
    const lines = [], cks = await dayRecs("records"), pu = await DB.all("punch");
    for (const c of cks) { const t = TEMPLATES.find(x => x.id === c.templateId), ng = Object.values(c.items || {}).filter(v => v.r === "ng").length; lines.push(`自主檢查：${t?.name || c.templateId}${c.location ? "（" + c.location + "）" : ""}${ng ? `，有缺失 ${ng} 項` : "，結果合格"}`); }
    const nw = pu.filter(x => x.siteId === r.siteId && x.foundDate === r.date), fx = pu.filter(x => x.siteId === r.siteId && x.fixedAt === r.date), open = pu.filter(x => x.siteId === r.siteId && x.status !== "closed").length;
    nw.forEach(x => lines.push(`新增缺失：${x.no ? x.no + " " : ""}${x.location || ""} ${x.desc || ""}`.trim())); fx.forEach(x => lines.push(`缺失完成改善：${x.no ? x.no + " " : ""}${x.location || ""} ${x.desc || ""}`.trim()));
    if (pu.some(x => x.siteId === r.siteId)) lines.push(`目前未結案缺失 ${open} 筆`);
    if (!lines.length) { alert("這一天沒有自主檢查或缺失紀錄。"); return; }
    r.important = (r.important ? r.important + "\n" : "") + lines.join("\n"); $("[data-f=important]").value = r.important; save();
  };
  // 勤前教育提示
  (async () => { const sa = (await DB.all("safety")).filter(x => x.siteId === r.siteId && x.date === r.date); if (sa.length) $("#lgPreHint").textContent = `今天已有勤前教育紀錄（簽到 ${sa.reduce((a, x) => a + saSigned(x), 0)} 人）${r.pre ? "" : "，已自動勾選「有」"}`; if (sa.length && !r.pre) { r.pre = "yes"; const el = view.querySelector('input[name=pre][value=yes]'); if (el) el.checked = true; save(); } })();
  // 簽章
  const hs = { sigs: { boss: r.sig } };
  setupSig($('canvas[data-sig="boss"]'), hs, () => { r.sig = hs.sigs.boss || ""; save(); });
  $("#lgClr").onclick = () => { const c = $('canvas[data-sig="boss"]'); c.getContext("2d").clearRect(0, 0, c.width, c.height); delete hs.sigs.boss; r.sig = ""; save(); };
  attBind(view, id);
  $("#lgPrint").onclick = async () => { await flush(); location.hash = `#/log/${id}/print`; };
  $("#lgDel").onclick = async () => { if (!confirm("確定刪除這張施工日誌？含附加檔案，無法復原。")) return; await attPurge(id); await DB.del("logs", id); goBack("#/log"); };
}

/* ---------- 預覽／列印（B14-4 版面） ---------- */
async function renderLogPrint(id) {
  const r = await DB.get("logs", id);
  if (!r) { goReplace("#/log"); return; }
  const site = sites.find(s => s.id === r.siteId), cur = lgDay(r.date), st = lgDay(r.start), ap = lgNum(r.approved), ex = lgNum(r.extend) || 0;
  const cum = Number.isFinite(cur) && Number.isFinite(st) ? cur - st + 1 : "", left = cum !== "" && ap !== null ? ap + ex - cum : "";
  const pad = (rows, n) => { const a = rows.slice(); while (a.length < n) a.push(null); return a; };
  const wk = lgWeek(r.date), ymd = iso => { const x = lgRoc(iso); return x ? `${x.y} 年 ${x.m} 月 ${x.d} 日` : "　　年　　月　　日"; };
  const box = (v, want, text) => `${r[v] === want ? "☑" : "□"}${text}`;
  const line = (rows, cols) => pad(rows, 2).map(x => `<tr>${cols.map(c => c === "cum" ? `<td class="c">${x ? esc(lgSum(x.prev, x.today)) : ""}</td>` : `<td class="${c === "name" || c === "note" ? "" : "c"}">${x ? esc(x[c]) : "&nbsp;"}</td>`).join("")}</tr>`).join("");
  const rowsSp = pad(r.specials, 2).map((x, i) => `<tr><td>${String.fromCharCode(65 + i)}.${x ? " " + esc(x.name) : ""}</td><td class="c">${x ? esc(x.unit) : ""}</td><td class="c">${x ? esc(x.contract) : ""}</td><td class="c">${x ? esc(x.today) : ""}</td><td class="c">${x ? esc(lgSum(x.prev, x.today)) : ""}</td><td>${x ? esc(x.note) : ""}</td></tr>`).join("");
  const nL = Math.max(r.labor.length, r.machines.length, 2), lab = pad(r.labor, nL), mac = pad(r.machines, nL);
  const lmRows = lab.map((l, i) => { const m = mac[i]; return `<tr><td>${l ? esc(l.name) : "&nbsp;"}</td><td class="c">${l ? esc(l.today) : ""}</td><td class="c">${l ? esc(lgSum(l.prev, l.today)) : ""}</td><td>${m ? esc(m.name) : ""}</td><td class="c">${m ? esc(m.today) : ""}</td><td class="c">${m ? esc(lgSum(m.prev, m.today)) : ""}</td></tr>`; }).join("");
  const multi = s => esc(s).replace(/\n/g, "<br>");
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper lgpaper">
      <div class="ptitle" style="font-size:17px;letter-spacing:.3em">建築物施工日誌<span style="float:right;font-size:13px;letter-spacing:0">B14-4</span></div>
      <div class="lgmeta"><span>表報編號：${esc(r.no)}</span></div>
      <div class="lgmeta"><span>本日天氣：上午：${esc(r.wxAm)}　下午：${esc(r.wxPm)}</span><span>填表日期：${esc(ymd(r.date))}（星期${esc(wk)}）</span></div>
      <table class="pt lgt">
        <tr><th>工程名稱</th><td colspan="3">${esc(site?.name)}</td><th>承攬廠商名稱</th><td colspan="3">${esc(r.contractor)}</td></tr>
        <tr><th>核定工期</th><td class="c">${esc(r.approved)} 天</td><th>累計工期</th><td class="c">${cum} 天</td><th>剩餘工期</th><td class="c">${left} 天</td><th>工期展延天數</th><td class="c">${esc(r.extend)} 天</td></tr>
        <tr><th>開工日期</th><td colspan="3" class="c">${esc(ymd(r.start))}</td><th>完工日期</th><td colspan="3" class="c">${esc(ymd(r.finish))}</td></tr>
        <tr><th>預定進度(%)</th><td colspan="3" class="c">${esc(r.planPct)}</td><th>實際進度(%)</th><td colspan="3" class="c">${esc(r.actualPct)}</td></tr></table>
      <table class="pt lgt"><tr><th colspan="6" class="lgsec">一、依施工計畫書執行按圖施工概況（含約定之重要施工項目及完成數量等）：</th></tr>
        <tr class="lgh"><th>施工項目</th><th style="width:12mm">單位</th><th style="width:20mm">契約數量</th><th style="width:20mm">本日完成數量</th><th style="width:20mm">累計完成數量</th><th style="width:30mm">備註</th></tr>
        ${line(r.items, ["name", "unit", "contract", "today", "cum", "note"])}
        <tr><td colspan="6" class="lgsub">營造業專業工程特定施工項目</td></tr>${rowsSp}</table>
      <table class="pt lgt"><tr><th colspan="6" class="lgsec">二、工地材料管理概況（含約定之重要材料使用狀況及數量等）：</th></tr>
        <tr class="lgh"><th>材料名稱</th><th style="width:12mm">單位</th><th style="width:20mm">設計數量</th><th style="width:20mm">本日使用數量</th><th style="width:20mm">累計使用數量</th><th style="width:30mm">備註</th></tr>
        ${line(r.mats, ["name", "unit", "design", "today", "cum", "note"])}</table>
      <table class="pt lgt"><tr><th colspan="6" class="lgsec">三、工地人員及機具管理（含約定之出工人數及機具使用情形及數量）：</th></tr>
        <tr class="lgh"><th>工別</th><th style="width:20mm">本日人數</th><th style="width:20mm">累計人數</th><th>機具名稱</th><th style="width:20mm">本日使用數量</th><th style="width:20mm">累計使用數量</th></tr>${lmRows}</table>
      <table class="pt lgt"><tr><td class="lgsec2">四、本日施工項目是否有須依「營造業專業工程特定施工項目應置之技術士種類、比率或人數標準表」規定應設置技術士之專業工程：${box("tech", "yes", "有")} ${box("tech", "no", "無")}（此項如勾選「有」，則應填寫後附「建築物施工日誌之技術士簽章表」）</td></tr>
        <tr><td class="lgsec2">五、工地職業安全衛生事項之督導、公共環境與安全之維護及其他工地行政事務：<br>
          (一)施工前檢查事項：<br>　1.實施勤前教育(含工地預防災變及危害告知)：${box("pre", "yes", "有")} ${box("pre", "no", "無")}<br>
          　2.確認新進勞工是否提報勞工保險(或其他商業保險)資料及安全衛生教育訓練紀錄：${box("newLabor", "yes", "有")} ${box("newLabor", "no", "無")} ${box("newLabor", "none", "無新進勞工")}<br>
          　3.檢查勞工個人防護具：${box("ppe", "yes", "有")} ${box("ppe", "no", "無")}<br>(二)其他事項：${multi(r.other)}</td></tr>
        <tr><td class="lgsec2" style="min-height:18mm">六、施工取樣試驗紀錄：<br>${multi(r.sampling)}</td></tr>
        <tr><td class="lgsec2">七、通知協力廠商辦理事項：<br>${multi(r.notify)}</td></tr>
        <tr><td class="lgsec2" style="min-height:24mm">八、重要事項記錄：<br>${multi(r.important)}</td></tr>
        <tr><td class="lgsec2">簽章：【工地主任】（註 3）：${esc(r.signer)}${r.sig ? `<img src="${safeImg(r.sig)}" style="height:16mm;vertical-align:middle;margin-left:6mm">` : ""}</td></tr></table>
      <p class="lgnote">註：1.依營造業法第三十二條第一項第二款規定，工地主任應按日填報施工日誌；本表檢送地方主管建築機關備查。<br>2.施工日誌應包含上開欄位，惟本施工日誌格式僅供參考，起造人得依工程性質及實際需要自行增減之。<br>3.本工程依營造業法第三十條第一項規定須置工地主任者，由工地主任簽章；免置工地主任者，則由營造業法第三十二條第二項所定之人員簽章。<br>4.上開工地主任係為營造業法第三十一條所稱之工地主任。<br>5.上開重要事項記錄包含（1）主辦機關及監造單位指示（2）工地遇緊急異常狀況之通報處理情形（3）本日是否由專任工程人員督察按圖施工、解決施工技術問題等。</p>
    </div>
    ${r.tech === "yes" ? `<div class="paper lgpaper"><div class="ptitle">建築物施工日誌之技術士簽章表</div>
      <table class="pt lgt"><tr><th>專業工程項目</th><td>${esc(r.techItem)}</td><th>應置技術士人數</th><td>${esc(r.techNeed)}</td></tr></table>
      <table class="pt lgt"><tr class="lgh"><th style="width:22mm">技術士種類</th><th style="width:14mm">人數</th><th>技術士姓名</th><th>技術士證書字號</th><th style="width:34mm">技術士簽名或蓋章</th><th>備註</th></tr>
        ${pad(r.techRows, 6).map((x, i) => `<tr style="height:14mm"><td class="c">${x ? esc(x.kind) : String.fromCharCode(65 + i)}</td><td class="c">${x ? esc(x.count) : ""}</td><td>${x ? esc(x.name) : ""}</td><td>${x ? esc(x.cert) : ""}</td><td class="c">${x?.sig ? `<img src="${safeImg(x.sig)}" style="max-height:11mm;max-width:30mm">` : ""}</td><td>${x ? esc(x.note) : ""}</td></tr>`).join("")}</table></div>` : ""}`;
  { const ln = await attNamesLine(id, true); if (ln) $(".paper").insertAdjacentHTML("beforeend", ln); const g = await attGallery(id); if (g) view.insertAdjacentHTML("beforeend", g); }
  $("#pvBack").onclick = () => goBack("#/log/" + id);
  $("#pvPrint").onclick = doPrint;
}
