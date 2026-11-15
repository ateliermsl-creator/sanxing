"use strict";
/* 計算機「混凝土方數」分頁與 A4 計算書（#/calc/vol/sheet）
   構件：矩形柱／其他、圓柱、牆（可扣開口）、版（可扣開口）、梁（可扣版厚）、獨立基礎、地梁／連續基礎、樓梯（踏階＋斜版）。
   多列加總、每列乘數量，分類小計、損耗率、建議叫料（進位 0.5 m³）、車數。尺寸一律公尺。
   沿用舊版的 localStorage `calcRows`、`calcCfg`；舊資料的 rect（a 長、b 寬、c 高）、cyl（a 直徑、c 高）照舊可用。
   維度欄位共用 a～e（牆、版、矩形都是 a×b×c，c 為厚／高），切換構件時數值保留；牆、版的開口存在 op: [{w, h, n}]。 */

const VOL_MAX_OP = 8;
const VOL_TYPES = [
  { k: "rect", n: "矩形柱／其他", f: [["a", "長"], ["b", "寬"], ["c", "高"]], ph: "例：2F C1 柱" },
  { k: "cyl", n: "圓柱", f: [["a", "直徑"], ["c", "高"]], ph: "例：2F 圓柱" },
  { k: "wall", n: "牆", f: [["a", "長"], ["b", "高"], ["c", "厚"]], op: ["寬", "高"], ph: "例：2F 外牆 A 軸" },
  { k: "slab", n: "版", f: [["a", "長"], ["b", "寬"], ["c", "厚"]], op: ["長", "寬"], ph: "例：3F 樓版 A～B" },
  { k: "beam", n: "梁", f: [["b", "梁寬"], ["c", "梁深"], ["a", "淨長"], ["d", "扣版厚"]], ph: "例：3F G1 梁" },
  { k: "ftg", n: "獨立基礎", f: [["a", "長"], ["b", "寬"], ["c", "厚"]], ph: "例：F1 基腳" },
  { k: "gb", n: "地梁／連續基礎", f: [["b", "寬"], ["c", "深"], ["a", "淨長"]], ph: "例：FB1 地梁" },
  { k: "stair", n: "樓梯", f: [["b", "梯寬"], ["d", "級數"], ["c", "級高"], ["a", "級深"], ["e", "斜版厚"]], ph: "例：1F～2F 樓梯" }
];
const volType = k => VOL_TYPES.find(t => t.k === k) || VOL_TYPES[0];
const volBlank = (type = "rect") => ({ name: "", type, a: "", b: "", c: "", d: "", e: "", n: 1, op: [] });

// 單列計算：回傳 { v（含數量的 m³，無法計算為 NaN）, one（單個）, expr（計算式文字）, warn }
function volCalc(r) {
  const t = volType(r.type), g = k => { const s = String(r[k] ?? "").trim(); return s === "" ? NaN : +s; };
  const n = String(r.n ?? "").trim() === "" ? 1 : +r.n;
  const f = x => fmt(x, 4);
  const need = t.f.filter(([k]) => !(t.k === "beam" && k === "d")).map(([k]) => g(k));
  if (need.some(x => !Number.isFinite(x)) || !Number.isFinite(n)) return { v: NaN, expr: "", warn: "" };
  if (need.some(x => x < 0) || n < 0 || (t.k === "beam" && g("d") < 0)) return { v: NaN, expr: "", warn: "尺寸不可為負" };
  const a = g("a"), b = g("b"), c = g("c"), d = g("d"), e = g("e");
  let one, expr, warn = "";
  if (t.k === "cyl") { one = Math.PI * a * a / 4 * c; expr = `π/4 × ${f(a)}² × ${f(c)}`; }
  else if (t.k === "wall" || t.k === "slab") {
    const thk = c, gross = a * b * c;   // 牆：長×高×厚、版：長×寬×厚，欄位一致，切換時數值保留
    const ops = (r.op || []).map(o => ({ w: +o.w, h: +o.h, n: String(o.n ?? "").trim() === "" ? 1 : +o.n })).filter(o => Number.isFinite(o.w) && Number.isFinite(o.h) && Number.isFinite(o.n) && o.w > 0 && o.h > 0 && o.n > 0);
    const opA = ops.reduce((s, o) => s + o.w * o.h * o.n, 0);
    one = gross - opA * thk;
    expr = `${f(a)} × ${f(b)} × ${f(c)}`
      + (ops.length ? ` − 開口（${ops.map(o => `${f(o.w)}×${f(o.h)}${o.n !== 1 ? "×" + f(o.n) : ""}`).join(" + ")}）× ${f(thk)}` : "");
    if (opA > a * b + 1e-9) warn = "開口面積大於構件面積，請檢查";
  }
  else if (t.k === "beam") {
    const dd = Number.isFinite(d) ? d : 0, h = c - dd;
    one = b * h * a;
    expr = dd > 0 ? `${f(b)} × (${f(c)} − ${f(dd)}) × ${f(a)}` : `${f(b)} × ${f(c)} × ${f(a)}`;
    if (h < 0) warn = "扣版厚大於梁深，請檢查";
  }
  else if (t.k === "gb") { one = b * c * a; expr = `${f(b)} × ${f(c)} × ${f(a)}`; }
  else if (t.k === "stair") {
    const L = d * a, H = d * c, s = Math.hypot(L, H);
    one = b * (d * c * a / 2 + e * s);
    expr = `${f(b)} × [${f(d)} × ${f(c)} × ${f(a)} / 2 + ${f(e)} × √(${f(L)}² + ${f(H)}²)]`;
  }
  else { one = a * b * c; expr = `${f(a)} × ${f(b)} × ${f(c)}`; }
  if (n !== 1) expr += ` × ${f(n)}`;
  return { v: one < 0 ? NaN : one * n, one, expr, warn };
}

// 目前正在編輯的內容放 localStorage（calcRows、calcCfg，隨打隨存）；按結果區的「存檔」後另存到 IndexedDB 的 vols 表（依工地、可多筆），
// calcCfg.cur 記住目前開啟的是哪一筆，之後的修改自動寫回那一筆。vols 會進備份、刪工地時一併刪除（safe.js 有 CLEAN 規則）。
function volNorm(rows, cfg) {
  if (!Array.isArray(rows)) rows = [];
  rows = rows.filter(r => r && typeof r === "object").map(r => {
    const o = volBlank(VOL_TYPES.some(t => t.k === r.type) ? r.type : "rect");
    for (const k of ["name", "a", "b", "c", "d", "e", "n"]) if (r[k] != null && typeof r[k] !== "object") o[k] = String(r[k]);
    o.op = (Array.isArray(r.op) ? r.op : []).slice(0, VOL_MAX_OP).filter(x => x && typeof x === "object").map(x => ({ w: String(x.w ?? ""), h: String(x.h ?? ""), n: String(x.n ?? "1") }));
    return o;
  });
  if (!rows.length) rows = [volBlank()];
  if (!cfg || typeof cfg !== "object") cfg = {};
  const s = v => v == null || typeof v === "object" ? "" : String(v);
  return { rows, cfg: { loss: cfg.loss == null ? "5" : s(cfg.loss), cap: cfg.cap == null ? "6" : s(cfg.cap), loc: s(cfg.loc), who: s(cfg.who), cur: s(cfg.cur), title: s(cfg.title) } };
}
function volLoad() {
  const j = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  return volNorm(j("calcRows"), j("calcCfg"));
}
function volSave(st) { try { localStorage.setItem("calcRows", JSON.stringify(st.rows)); localStorage.setItem("calcCfg", JSON.stringify(st.cfg)); } catch {} }

// 總計：淨方數、分類小計、損耗、叫料、車數
function volTotals(st) {
  const res = st.rows.map(volCalc), by = {};
  res.forEach((x, i) => { if (Number.isFinite(x.v)) by[st.rows[i].type] = (by[st.rows[i].type] || 0) + x.v; });
  const sub = Object.values(by).reduce((a, b) => a + b, 0);
  const pf = s => { const v = parseFloat(s); return Number.isFinite(v) ? v : 0; };
  const loss = pf(st.cfg.loss), cap = pf(st.cfg.cap), order = sub * (1 + loss / 100);
  const call = order > 0 ? Math.ceil(order * 2 - 1e-9) / 2 : 0;
  return { res, by, sub, loss, cap, order, call, trucks: cap > 0 && order > 0 ? Math.ceil(order / cap - 1e-9) : 0, n: res.filter(x => Number.isFinite(x.v)).length };
}

let volGen = 0;
const volStamp = t => { const d = new Date(t || 0), z = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
const volHasData = st => st.rows.some(r => ["a", "b", "c", "d", "e"].some(k => String(r[k] ?? "").trim() !== "") || String(r.name ?? "").trim() !== "");
const volRec = (st, base) => ({ ...base, name: st.cfg.title.trim(), rows: st.rows, cfg: { loss: st.cfg.loss, cap: st.cfg.cap, loc: st.cfg.loc, who: st.cfg.who }, updated: Date.now() });

function tabVolume(box) {
  const st = volLoad();
  box.innerHTML = `
    <div class="cfsteps"><a href="#vRows">1 構件</a><a href="#vp2">2 損耗與叫料</a><a href="#vp3">3 結果與存檔</a></div>
    <div class="panel vfile" id="vp0">
      <div class="vfname"><small>目前紀錄</small><b id="vCurName">新計算</b><small id="vCurSt"></small></div>
      <div class="vfbtn"><button class="sec" id="vOpen" aria-expanded="false" aria-controls="vList">📂 方數紀錄<span id="vCount"></span></button><button class="sec" id="vNew">＋ 新計算</button></div>
      <div id="vList" hidden></div></div>
    <div id="vRows"></div>
    <div class="panel"><div class="field" style="margin-bottom:8px"><label>新增構件種類</label><select id="vAddType">${VOL_TYPES.map(t => `<option value="${t.k}">${t.n}</option>`).join("")}</select></div>
      <div class="row" style="margin:0"><button class="sec" id="vAdd">＋ 新增一列</button><button class="sec" id="vClear">全部清除</button></div></div>
    <div class="panel" id="vp2"><h2><span class="cfno">2</span>損耗與叫料</h2><div class="calc-ctl2">
      <div class="field"><label>損耗率（%）</label><input id="vLoss" data-c="loss" inputmode="decimal" value="${esc(st.cfg.loss)}"></div>
      <div class="field"><label>預拌車容量（m³／車）</label><input id="vCap" data-c="cap" inputmode="decimal" value="${esc(st.cfg.cap)}"></div>
      <div class="field"><label>樓層／部位（計算書用）</label><input data-c="loc" placeholder="例：3F 梁板" value="${esc(st.cfg.loc)}"></div>
      <div class="field"><label>計算人員</label><input data-c="who" value="${esc(st.cfg.who)}"></div></div>
      <p class="cnote">損耗率與車容量依你們的習慣填寫。計算書的工程名稱自動帶入目前選的工地。</p></div>
    <p class="cnote" style="margin:0 12px 12px">尺寸一律輸入<b>公尺</b>。梁長建議填柱面到柱面的淨長，避免和柱重複；梁與版一起計算時，梁可填「扣版厚」只算版底以下。樓梯 = 梯寬 ×〔級數 × 級高 × 級深 ÷ 2 ＋ 斜版厚 × 斜長〕，斜長 = √((級數×級深)² + (級數×級高)²)，平台請另以「版」計算。數值僅供估算叫料，實際以圖說與現場量測為準。資料會記在這支手機。</p>
    <section class="panel" id="vp3"><h2><span class="cfno">3</span>結果與存檔</h2><div id="vOut"></div>
      <div class="vsave"><div class="field" style="margin-bottom:4px"><label>紀錄名稱</label><input id="vTitle" placeholder="例：3F 版梁澆置" value="${esc(st.cfg.title)}" enterkeyhint="done"></div>
        <div id="vSaved" class="saved" style="margin:0 0 8px"></div>
        <div class="row" style="margin:0"><button id="vSave">💾 存檔</button><a class="btnlink" href="#/calc/vol/sheet">📄 計算書</a></div></div></section>`;
  const dimIn = (i, k, v) => `<input data-k="${k}" inputmode="decimal" value="${esc(v)}">`;
  const rowHtml = (r, i) => {
    const t = volType(r.type);
    return `<div class="panel vrow" data-i="${i}">
      <div class="vtop"><input data-k="name" placeholder="${esc(t.ph)}" value="${esc(r.name)}"><select data-k="type" aria-label="構件種類">${VOL_TYPES.map(x => `<option value="${x.k}" ${x.k === t.k ? "selected" : ""}>${x.n}</option>`).join("")}</select><button class="danger" data-del="${i}" aria-label="刪除此列">✕</button></div>
      <div class="vdims">${t.f.map(([k, l]) => `<label>${l}${k === "d" && t.k === "stair" ? "" : "（m）"}${dimIn(i, k, r[k])}</label>`).join("")}<label>數量${dimIn(i, "n", r.n)}</label></div>
      ${t.op ? `${(r.op || []).map((o, j) => `<div class="vdims vop" data-j="${j}"><label>開口${j + 1} ${t.op[0]}（m）<input data-o="w" inputmode="decimal" value="${esc(o.w)}"></label><label>${t.op[1]}（m）<input data-o="h" inputmode="decimal" value="${esc(o.h)}"></label><label>個數<input data-o="n" inputmode="decimal" value="${esc(o.n)}"></label><button class="sec" data-opdel="${j}" aria-label="移除開口${j + 1}" style="align-self:end;min-height:44px">✕</button></div>`).join("")}
        ${(r.op || []).length < VOL_MAX_OP ? `<button class="sec" data-opadd="1" style="margin-top:8px;min-height:40px;padding:0 12px;font-size:14px">＋ 扣除開口（門窗、管道間）</button>` : ""}` : ""}
      <div class="vres"><small class="vexpr" data-vx="${i}" style="display:block;font-size:12px;overflow-wrap:anywhere"></small>小計：<b data-vr="${i}">—</b></div></div>`;
  };
  const sum = () => {
    const T = volTotals(st);
    T.res.forEach((x, i) => {
      const b = box.querySelector(`[data-vr="${i}"]`), e = box.querySelector(`[data-vx="${i}"]`);
      if (b) b.textContent = Number.isFinite(x.v) ? fmt(x.v, 3) + " m³" : "—";
      if (e) { e.textContent = x.warn || (x.expr ? x.expr + " =" : ""); e.style.color = x.warn ? "var(--bad)" : ""; }
    });
    const cats = VOL_TYPES.filter(t => T.by[t.k] != null);
    $("#vOut").innerHTML = T.n ? `
      ${cats.length > 1 ? `<div class="tblwrap"><table class="ct"><tr><th>構件</th><th>方數 (m³)</th></tr>${cats.map(t => `<tr><th>${t.n}</th><td>${fmt(T.by[t.k], 3)}</td></tr>`).join("")}</table></div>` : ""}
      <div class="big"><span>淨方數</span><b>${fmt(T.sub, 3)} m³</b></div>
      <div class="big"><span>含損耗 ${fmt(T.loss, 1)}%</span><b>${fmt(T.order, 3)} m³</b></div>
      <div class="big" data-bar="叫料 ${T.call > 0 ? fmt(T.call, 1) : "—"} m³（淨 ${fmt(T.sub, 2)}）"><span>建議叫料（進位 0.5）</span><b>${T.call > 0 ? fmt(T.call, 1) : "—"} m³</b></div>
      ${T.trucks ? `<div class="big"><span>約需車數</span><b>${fmt(T.order / T.cap, 1)} 車（${T.trucks} 車）</b></div>` : ""}`
      : `<p class="cnote">輸入構件尺寸後，這裡會顯示分類小計、淨方數、含損耗方數與建議叫料。</p>`;
    volSave(st); autoSave();
  };
  // ---- 儲存的計算（IndexedDB vols，依工地） ----
  let timer = 0, rec = null;
  const gen = ++volGen, live = () => gen === volGen;   // 重新繪製後，舊畫面的非同步回呼不再更新畫面（只把資料存完）
  const mark = t => { const el = live() && $("#vSaved"); if (el) el.textContent = t; };
  const head = () => {   // 頁首顯示目前開啟的是哪一筆紀錄
    if (!live()) return;
    $("#vCurName").textContent = rec ? rec.name : (st.cfg.title.trim() || "新計算");
    const c = $("#vCurSt"); c.textContent = rec ? `已存檔・${volStamp(rec.updated)}` : volHasData(st) ? "尚未存檔" : ""; c.classList.toggle("bad", !rec && volHasData(st));
  };
  const status = () => { head(); mark(!siteId ? "要存檔請先建立或選擇工地（右上角＋）。目前的輸入仍會暫存在這支手機。"
    : rec ? `✓ 已存檔 ${volStamp(rec.updated)}，之後的修改會自動更新這筆紀錄` : volHasData(st) ? "尚未存檔：填紀錄名稱後按「存檔」，之後可從頁首「方數紀錄」開啟" : ""); };
  const list = async () => {
    const all = siteId ? (await DB.all("vols")).filter(x => x.siteId === siteId).sort((a, b) => (b.updated || 0) - (a.updated || 0)) : [];
    const el = live() && $("#vList"); if (!el) return;
    $("#vCount").textContent = all.length ? `（${all.length}）` : "";
    el.innerHTML = all.length ? `<p class="cnote" style="margin:8px 0 4px">這個工地的方數紀錄（新的在前）：</p>` + all.map(x => { const T = volTotals(volNorm(x.rows, x.cfg)); return `<div class="vsrow${rec && rec.id === x.id ? " on" : ""}" data-id="${esc(x.id)}">
        <div class="vsname"><b>${esc(x.name || "（未命名）")}</b>${rec && rec.id === x.id ? "（開啟中）" : ""}<small>${esc(volStamp(x.updated))}・淨 ${fmt(T.sub, 3)} m³・叫料 ${T.call > 0 ? fmt(T.call, 1) : "—"} m³</small></div>
        <div class="vsbtn"><button class="sec" data-vopen="1">開啟</button><button class="sec" data-vcopy="1">複製</button><button class="danger" data-vdel="1" aria-label="刪除「${esc(x.name)}」">刪除</button></div></div>`; }).join("")
      : `<p class="cnote" style="margin:8px 0 0">${siteId ? "這個工地還沒有方數紀錄。算好後在頁面最下方「存檔」。" : "請先建立或選擇工地（右上角＋）。"}</p>`;
  };
  const reopen = (rows, cfg) => { volSave(volNorm(rows, cfg)); tabVolume(box); };
  const doSave = async () => {
    if (!rec) return;
    clearTimeout(timer); timer = 0;
    rec = volRec(st, rec); await DB.put("vols", rec); status(); list();
  };
  function autoSave() { if (!rec) { status(); return; } mark("存檔中…"); clearTimeout(timer); timer = setTimeout(doSave, 400); }
  $("#vTitle").oninput = e => { st.cfg.title = e.target.value; volSave(st); if (rec && st.cfg.title.trim()) autoSave(); else head(); };
  $("#vTitle").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("#vSave").click(); } };
  $("#vOpen").onclick = () => { const l = $("#vList"), open = l.hidden; l.hidden = !open; $("#vOpen").setAttribute("aria-expanded", String(open)); $("#vOpen").classList.toggle("on", open); };
  $("#vSave").onclick = async () => {
    if (!siteId) { status(); return; }
    if (!st.cfg.title.trim()) { mark("請先填「紀錄名稱」，例如：3F 版梁澆置"); $("#vTitle").focus(); return; }
    rec = volRec(st, rec || { id: uid(), siteId, created: Date.now() });
    st.cfg.cur = rec.id; volSave(st);
    await DB.put("vols", rec); status(); list();
  };
  $("#vNew").onclick = async () => {
    if (!rec && volHasData(st) && !confirm("目前的輸入還沒存檔，要清空開始新計算嗎？")) return;
    if (timer) await doSave();
    reopen([], { loss: st.cfg.loss, cap: st.cfg.cap, who: st.cfg.who });
  };
  $("#vList").onclick = async e => {
    const b = e.target.closest("button"), id = b?.closest("[data-id]")?.dataset.id; if (!id) return;
    const x = await DB.get("vols", id); if (!x) { list(); return; }
    if (b.dataset.vopen) {
      if (!rec && volHasData(st) && !confirm("目前的輸入還沒存檔，開啟後會被取代。要繼續嗎？")) return;
      if (timer) await doSave();
      reopen(x.rows, { ...x.cfg, cur: x.id, title: x.name });
    } else if (b.dataset.vcopy) {
      if (timer) await doSave();
      const c = { ...x, id: uid(), name: (x.name || "") + "（複本）", created: Date.now(), updated: Date.now() };
      await DB.put("vols", c); reopen(c.rows, { ...c.cfg, cur: c.id, title: c.name });
    } else if (b.dataset.vdel) {
      if (!confirm(`刪除「${x.name || "（未命名）"}」？刪除後無法復原。`)) return;
      await DB.del("vols", id);
      if (rec && rec.id === id) { clearTimeout(timer); timer = 0; rec = null; st.cfg.cur = ""; volSave(st); }
      status(); list();
    }
  };
  (async () => {   // 開啟中的那一筆要存在、且屬於目前工地，否則視為未儲存
    const x = st.cfg.cur ? await DB.get("vols", st.cfg.cur) : null;
    if (x && x.siteId === siteId) rec = x; else if (st.cfg.cur) { st.cfg.cur = ""; volSave(st); }
    status(); list();
  })();
  const draw = () => { $("#vRows").innerHTML = `<h2 class="t" style="font-size:17px;margin:4px 12px"><span class="cfno">1</span>構件</h2>` + st.rows.map(rowHtml).join(""); sum(); };
  const rowOf = el => st.rows[+el.closest(".vrow")?.dataset.i];
  $("#vRows").oninput = $("#vRows").onchange = e => {
    const el = e.target, r = el.closest(".vrow") && rowOf(el); if (!r) return;
    if (el.dataset.o) { const j = +el.closest(".vop").dataset.j; r.op[j][el.dataset.o] = el.value; sum(); return; }
    const k = el.dataset.k; if (!k) return;
    r[k] = el.value;
    if (k === "type") draw(); else sum();
  };
  $("#vRows").onclick = e => {
    const el = e.target.closest("button"); if (!el) return;
    if (el.dataset.del !== undefined) { st.rows.splice(+el.dataset.del, 1); if (!st.rows.length) st.rows.push(volBlank()); draw(); return; }
    const r = rowOf(el); if (!r) return;
    if (el.dataset.opadd) { r.op.push({ w: "", h: "", n: "1" }); draw(); box.querySelector(`.vrow[data-i="${st.rows.indexOf(r)}"] .vop:last-of-type input`)?.focus(); }
    else if (el.dataset.opdel !== undefined) { r.op.splice(+el.dataset.opdel, 1); draw(); }
  };
  $("#vAdd").onclick = () => { st.rows.push(volBlank($("#vAddType").value)); draw(); box.querySelector(`.vrow[data-i="${st.rows.length - 1}"] [data-k="name"]`)?.focus(); };
  $("#vClear").onclick = () => { if (!confirm("清除全部列？")) return; st.rows = [volBlank()]; draw(); };
  $("#vp2").oninput = e => { const k = e.target.dataset.c; if (!k) return; st.cfg[k] = e.target.value; sum(); };
  draw();
}

function renderVolSheet() {
  const st = volLoad(), T = volTotals(st), company = ls.get("company", "");
  const list = st.rows.map((r, i) => ({ r, x: T.res[i] })).filter(o => Number.isFinite(o.x.v));
  const cats = VOL_TYPES.filter(t => T.by[t.k] != null);
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="vsBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">混凝土數量計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(null))}</td></tr>
        ${st.cfg.title ? `<tr><td>紀錄名稱</td><td colspan="3">${esc(st.cfg.title)}</td></tr>` : ""}
        <tr><td>樓層／部位</td><td>${esc(st.cfg.loc)}</td><td>計算日期</td><td>${esc(today())}</td></tr>
      </table>
      <table class="pt items">
        <tr><th colspan="5" style="text-align:left">二、構件數量（尺寸單位 m）</th></tr>
        <tr><th>序</th><th>名稱</th><th>構件</th><th>計算式</th><th class="nw">小計 m³</th></tr>
        ${list.map((o, i) => `<tr><td class="c">${i + 1}</td><td>${esc(o.r.name)}</td><td class="nw">${esc(volType(o.r.type).n)}</td><td style="font-size:8.5pt;overflow-wrap:anywhere">${esc(o.x.expr)}${o.x.warn ? `<br><b>${esc(o.x.warn)}</b>` : ""}</td><td class="c nw">${fmt(o.x.v, 3)}</td></tr>`).join("") || `<tr><td colspan="5" class="c">尚無可計算的構件</td></tr>`}
      </table>
      <table class="pt">
        <tr><th colspan="2">三、合計</th></tr>
        ${cats.map(t => `<tr><td>${esc(t.n)}</td><td class="c">${fmt(T.by[t.k], 3)} m³</td></tr>`).join("")}
        <tr><td><b>淨方數</b></td><td class="c"><b>${fmt(T.sub, 3)} m³</b></td></tr>
        <tr><td>含損耗 ${fmt(T.loss, 1)}%</td><td class="c">${fmt(T.order, 3)} m³</td></tr>
        <tr><td><b>建議叫料（進位 0.5 m³）</b></td><td class="c"><b>${T.call > 0 ? fmt(T.call, 1) : "—"} m³</b></td></tr>
        ${T.trucks ? `<tr><td>約需車數（${fmt(T.cap, 2)} m³／車）</td><td class="c">${fmt(T.order / T.cap, 1)} 車（${T.trucks} 車）</td></tr>` : ""}
      </table>
      <table class="pt"><tr><td style="font-size:9pt">註：梁以淨長計算；有填扣版厚者只計版底以下。牆、版已扣除所列開口。樓梯 = 梯寬 ×〔級數 × 級高 × 級深 ÷ 2 ＋ 斜版厚 × 斜長〕，平台另以版計。本表僅供估算叫料，實際以圖說與現場量測為準。</td></tr></table>
      <div class="psigs">${["計算人員" + (st.cfg.who ? "：" + esc(st.cfg.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#vsBack").onclick = () => goBack("#/calc/vol");
  $("#pvPrint").onclick = doPrint;
}

CALC_TABS.splice(2, 0, ["vol", "混凝土方數", tabVolume]);
