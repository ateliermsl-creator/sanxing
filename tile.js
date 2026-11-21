"use strict";
/* 計算機「磁磚計算」分頁與 A4 計算書（#/calc/tile/sheet）
   2026-11-20 使用者要求：原「泥作材料」很少用，改成磁磚計算，可逐面累積（例如整棟建築外觀的磁磚）。
   每一列是一個面／區塊：長 × 高（或直接填面積）− 開口（門窗）× 數量；每列選一種磁磚規格。
   磁磚規格可多種（片長、片寬、縫寬、損耗率、每箱片數），依規格分別合計面積、片數、箱數。
   原泥作材料的「紅磚」移到頁面最下方折疊區、「砂漿／益膠泥」改成依總面積估算，功能沒有拿掉；原泥作材料沒有存檔功能，所以沒有舊紀錄要搬。
   存檔沿用混凝土方數的 IndexedDB `vols` 表，以 kind: "tile" 區分（不新增資料表；備份、匯入、刪工地、雲端同步都跟著 vols 走）。
   目前編輯中的內容在 localStorage `calcTileRows`、`calcTileCfg`；cfg.cur 指向開啟中的紀錄並自動存回。
   尺寸、縫寬、損耗、每箱片數、單位用量一律由使用者依進場規格與產品說明填寫，工具只做面積與數量計算。 */

const TILE_MAX_OP = 12, TILE_MAX_SPEC = 8;
const TILE_SIZES = [["二丁掛", 22.7, 6], ["30×60", 60, 30], ["60×60", 60, 60], ["30×30", 30, 30], ["60×120", 120, 60]];
const tileSpecBlank = (i = 0) => ({ name: "磁磚 " + String.fromCharCode(65 + i), L: "", W: "", j: "", loss: "", box: "" });
const tileBlank = (s = "0") => ({ name: "", s, a: "", b: "", v: "", n: "1", g: "", op: [] });

const tileNum = v => { const s = String(v ?? "").trim(); return s === "" ? NaN : +s; };
// 單列：回傳 { A（含數量的淨面積 m²，無法計算為 NaN）, one（單面淨面積）, expr, warn }
function tileCalc(r) {
  const a = tileNum(r.a), b = tileNum(r.b), vv = tileNum(r.v), n = String(r.n ?? "").trim() === "" ? 1 : +r.n, f = x => fmt(x, 3);
  const useV = Number.isFinite(vv);
  if ((!useV && !(Number.isFinite(a) && Number.isFinite(b))) || !Number.isFinite(n)) return { A: NaN, expr: "", warn: "" };
  if ((useV ? vv < 0 : a < 0 || b < 0) || n < 0) return { A: NaN, expr: "", warn: "尺寸不可為負" };
  const gross = useV ? vv : a * b;
  const ops = (r.op || []).map(o => ({ w: +o.w, h: +o.h, n: String(o.n ?? "").trim() === "" ? 1 : +o.n })).filter(o => Number.isFinite(o.w) && Number.isFinite(o.h) && Number.isFinite(o.n) && o.w > 0 && o.h > 0 && o.n > 0);
  const opA = ops.reduce((s, o) => s + o.w * o.h * o.n, 0);
  let expr = useV ? `${f(vv)} m²` : `${f(a)} × ${f(b)}`;
  if (ops.length) expr += ` − 開口（${ops.map(o => `${f(o.w)}×${f(o.h)}${o.n !== 1 ? "×" + f(o.n) : ""}`).join(" + ")}）`;
  if (n !== 1) expr = (ops.length || useV ? `(${expr})` : expr) + ` × ${f(n)}`;
  const one = gross - opA;
  if (one < 0) return { A: NaN, expr, warn: "開口面積大於這一面，請檢查" };
  return { A: one * n, one, expr, warn: "" };
}

// 規格：每 m² 片數 = 10000 ÷ ((片長 + 縫) × (片寬 + 縫))，縫寬 mm 換 cm
function tileSpecCalc(sp) {
  const L = tileNum(sp.L), W = tileNum(sp.W), j = Number.isFinite(tileNum(sp.j)) ? tileNum(sp.j) / 10 : 0;
  const loss = Number.isFinite(tileNum(sp.loss)) ? tileNum(sp.loss) : 0, box = tileNum(sp.box);
  const per = L > 0 && W > 0 && j >= 0 ? 1e4 / ((L + j) * (W + j)) : NaN;
  return { L, W, jmm: j * 10, loss, box: box > 0 ? box : NaN, per };
}

function tileNorm(rows, cfg) {
  if (!Array.isArray(rows)) rows = [];
  if (!cfg || typeof cfg !== "object") cfg = {};
  const s = v => v == null || typeof v === "object" ? "" : String(v);
  let specs = (Array.isArray(cfg.specs) ? cfg.specs : []).slice(0, TILE_MAX_SPEC).filter(x => x && typeof x === "object")
    .map((x, i) => ({ ...tileSpecBlank(i), ...Object.fromEntries(["name", "L", "W", "j", "loss", "box"].map(k => [k, s(x[k])])) }));
  if (!specs.length) specs = [{ ...tileSpecBlank(0), L: "60", W: "30", j: "3", loss: "0" }];
  rows = rows.filter(r => r && typeof r === "object").map(r => {
    const o = tileBlank();
    for (const k of ["name", "s", "a", "b", "v", "n", "g"]) if (r[k] != null && typeof r[k] !== "object") o[k] = String(r[k]);
    if (!["", "in", "s", "up", "new", "f", "x"].includes(o.g)) o.g = "";   // 圖面：接上一面的方式（tiledraw.js）
    if (!(+o.s >= 0 && +o.s < specs.length)) o.s = "0";
    o.op = (Array.isArray(r.op) ? r.op : []).slice(0, TILE_MAX_OP).filter(x => x && typeof x === "object").map(x => ({ w: s(x.w), h: s(x.h), n: x.n == null ? "1" : s(x.n), x: s(x.x), y: s(x.y) }));
    return o;
  });
  if (!rows.length) rows = [tileBlank()];
  return { rows, cfg: { specs, glue: s(cfg.glue), bag: s(cfg.bag), loc: s(cfg.loc), who: s(cfg.who), cur: s(cfg.cur), title: s(cfg.title), rot: ["1", "2", "3"].includes(s(cfg.rot)) ? s(cfg.rot) : "0", sigs: ccsg(cfg.sigs) } };
}
function tileLoad() {
  const j = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  return tileNorm(j("calcTileRows"), j("calcTileCfg"));
}
function tileSave(st) { try { localStorage.setItem("calcTileRows", JSON.stringify(st.rows)); localStorage.setItem("calcTileCfg", JSON.stringify(st.cfg)); } catch {} }

// 合計：依規格分組
function tileTotals(st) {
  const res = st.rows.map(tileCalc);
  const groups = st.cfg.specs.map((sp, i) => {
    const c = tileSpecCalc(sp), A = res.reduce((s, x, k) => s + (Number.isFinite(x.A) && +st.rows[k].s === i ? x.A : 0), 0);
    const cnt = res.filter((x, k) => Number.isFinite(x.A) && +st.rows[k].s === i).length;
    const need = Number.isFinite(c.per) && A > 0 ? Math.ceil(A * c.per * (1 + c.loss / 100) - 1e-9) : NaN;
    return { i, sp, ...c, A, cnt, need, boxes: Number.isFinite(need) && c.box > 0 ? Math.ceil(need / c.box - 1e-9) : NaN };
  });
  const A = groups.reduce((s, g) => s + g.A, 0), glue = tileNum(st.cfg.glue), bag = tileNum(st.cfg.bag);
  const kg = glue > 0 && A > 0 ? A * glue : NaN;
  return { res, groups, A, kg, bags: Number.isFinite(kg) && bag > 0 ? Math.ceil(kg / bag - 1e-9) : NaN, n: res.filter(x => Number.isFinite(x.A)).length };
}

let tileGen = 0;
const tileHasData = st => st.rows.some(r => ["a", "b", "v"].some(k => String(r[k] ?? "").trim() !== "") || String(r.name ?? "").trim() !== "");
const tileRec = (st, base) => ({ ...base, kind: "tile", name: st.cfg.title.trim(), rows: st.rows, cfg: { specs: st.cfg.specs, glue: st.cfg.glue, bag: st.cfg.bag, loc: st.cfg.loc, who: st.cfg.who, rot: st.cfg.rot, ...(Object.keys(st.cfg.sigs || {}).length ? { sigs: st.cfg.sigs } : {}) }, updated: Date.now() });
const tileSpecLabel = (sp, c) => `${sp.name || "磁磚"}${c && c.L > 0 && c.W > 0 ? `（${fmt(c.L, 1)}×${fmt(c.W, 1)} cm）` : ""}`;

function tabTile(box) {
  const st = tileLoad();
  box.innerHTML = `
    <div class="cfsteps"><a href="#tlSpecs">1 磁磚規格</a><a href="#tlRows">2 各面面積</a><a href="#tlp3">3 結果與存檔</a></div>
    <div class="panel vfile" id="tlp0">
      <div class="vfname"><small>目前紀錄</small><b id="tlCurName">新計算</b><small id="tlCurSt"></small></div>
      <div class="vfbtn"><button class="sec" id="tlOpen" aria-expanded="false" aria-controls="tlList">📂 磁磚紀錄<span id="tlCount"></span></button><button class="sec" id="tlNew">＋ 新計算</button></div>
      <div id="tlList" hidden></div></div>
    <div class="panel" id="tlSpecs"></div>
    <div id="tlRows"></div>
    <div class="panel"><div class="row" style="margin:0"><button class="sec" id="tlAdd">＋ 加入一面</button><button class="sec" id="tlClear">全部清除</button></div>
      <p class="cnote">一面一列，例如「北向立面 1F～3F」。同樣的面可填數量；不規則的面（山牆三角形等）可直接填「面積」。</p></div>
    <details class="panel" id="tlDrawBox" open><summary>展開圖與透視圖（示意）</summary><div id="tlDraw"></div>
      <p class="cnote">各面依清單順序接續：外牆繞建築一圈選「陽角轉折」，室內繞房間一圈選「陰角轉折」（看著貼磚面、由左往右排）。多層樓在上一層的第一面選「往上一層」，同一層另一間選「另起一圈」；各層一樣的話，也可以只填一層、「數量」填層數。門窗可填「距左」「離地」定位，沒填會自動排。圖只是示意，數量仍以上面的面積計算；磁磚太小時圖上只填色。</p></details>
    <details class="panel" id="tlGlue"><summary>黏著劑／益膠泥（選填）</summary>
      <div class="calc-ctl2"><div class="field"><label>單位用量（kg/m²）</label><input data-c="glue" inputmode="decimal" placeholder="依產品說明書" value="${esc(st.cfg.glue)}"></div>
        <div class="field"><label>每包重量（kg）</label><input data-c="bag" inputmode="decimal" placeholder="例：包裝標示" value="${esc(st.cfg.bag)}"></div></div>
      <p class="cnote">以所有磁磚的淨面積合計估算（不含損耗）。</p></details>
    <div class="panel"><div class="calc-ctl2">
      <div class="field"><label>位置／部位（計算書用）</label><input data-c="loc" placeholder="例：外牆全區" value="${esc(st.cfg.loc)}"></div>
      <div class="field"><label>計算人員</label><input data-c="who" value="${esc(st.cfg.who)}"></div></div>
      <p class="cnote">尺寸一律輸入<b>公尺</b>，磁磚片長、片寬為<b>公分</b>、縫寬<b>公釐</b>。損耗率、每箱片數依進場規格與你們的習慣填寫；結果是理論數量，實際叫料請再考慮切割、收邊、轉角與破損。資料會記在這支手機。</p></div>
    <section class="panel" id="tlp3"><h2><span class="cfno">3</span>結果與存檔</h2><div id="tlOut"></div>
      <div class="vsave"><div class="field" style="margin-bottom:4px"><label>紀錄名稱</label><input id="tlTitle" placeholder="例：外牆二丁掛" value="${esc(st.cfg.title)}" enterkeyhint="done"></div>
        <div id="tlSaved" class="saved" style="margin:0 0 8px"></div>
        <div class="row" style="margin:0"><button id="tlSave">💾 存檔</button><a class="btnlink" href="#/calc/tile/sheet">📄 計算書</a></div></div></section>
    <details class="panel" id="tlBrick"><summary>紅磚數量（原泥作材料）</summary>
      <div class="grid2"><div class="field"><label>牆淨面積（m²）</label><input id="bA" inputmode="decimal"></div><div class="field"><label>牆型</label><select id="bType"><option value="1">1/2B（牆厚＝磚寬）</option><option value="2">1B（牆厚＝磚長）</option></select></div>
        <div class="field"><label>磚長（cm）</label><input id="bL" inputmode="decimal" value="23"></div><div class="field"><label>磚厚（cm）</label><input id="bT" inputmode="decimal" value="6"></div>
        <div class="field"><label>灰縫（cm）</label><input id="bJ" inputmode="decimal" value="1"></div><div class="field"><label>損耗率（%）</label><input id="bLoss" inputmode="decimal" value="0"></div></div>
      <p class="cnote">磚的尺寸預設只是常見的參考，請改成實際進場的規格。這一區不存檔。</p><div id="bOut"></div></details>`;

  const specSel = r => `<select data-k="s" aria-label="磁磚規格">${st.cfg.specs.map((sp, i) => `<option value="${i}" ${+r.s === i ? "selected" : ""}>${esc(sp.name || "磁磚 " + (i + 1))}</option>`).join("")}</select>`;
  const drawSpecs = () => {
    const one = st.cfg.specs.length === 1;
    $("#tlSpecs").innerHTML = `<h2><span class="cfno">1</span>磁磚規格</h2>` + st.cfg.specs.map((sp, i) => `<div class="tlspec" data-si="${i}">
        <div class="vtop"><input data-sk="name" aria-label="規格名稱" placeholder="例：外牆二丁掛" value="${esc(sp.name)}">${one ? "" : `<button class="danger" data-sdel="${i}" aria-label="刪除規格「${esc(sp.name)}」">✕</button>`}</div>
        <div class="vdims"><label>片長（cm）<input data-sk="L" inputmode="decimal" value="${esc(sp.L)}"></label><label>片寬（cm）<input data-sk="W" inputmode="decimal" value="${esc(sp.W)}"></label><label>縫寬（mm）<input data-sk="j" inputmode="decimal" value="${esc(sp.j)}"></label>
          <label>損耗（%）<input data-sk="loss" inputmode="decimal" value="${esc(sp.loss)}"></label><label>每箱片數<input data-sk="box" inputmode="decimal" placeholder="選填" value="${esc(sp.box)}"></label></div>
        <div class="chips tlsz">${TILE_SIZES.map(([n, l, w], k) => `<button type="button" class="chip" data-sz="${k}">${n}</button>`).join("")}<small class="tlper" data-sper="${i}"></small></div></div>`).join("")
      + `${st.cfg.specs.length < TILE_MAX_SPEC ? `<button class="sec" id="tlSpecAdd" style="min-height:40px;padding:0 12px;font-size:14px">＋ 再加一種磁磚</button>` : ""}
      <p class="cnote">尺寸按鈕只帶入常見的長寬，請改成實際進場的規格。外牆有不同磁磚時，各加一種，下面每一面再選用哪一種。</p>`;
  };
  const rowHtml = (r, i) => `<div class="panel vrow" data-i="${i}">
      <div class="vtop"><input data-k="name" placeholder="例：北向立面 1F～3F" value="${esc(r.name)}">${specSel(r)}<button class="danger" data-del="${i}" aria-label="刪除此面">✕</button></div>
      <div class="vdims"><label>長（m）<input data-k="a" inputmode="decimal" value="${esc(r.a)}"></label><label>高（m）<input data-k="b" inputmode="decimal" value="${esc(r.b)}"></label><label>或面積<input data-k="v" inputmode="decimal" placeholder="m²" value="${esc(r.v)}"></label><label>數量<input data-k="n" inputmode="decimal" value="${esc(r.n)}"></label></div>
      <label class="tlg">畫圖時接上一面<select data-k="g">${TILE_G.map(([v, t]) => `<option value="${v}" ${r.g === v ? "selected" : ""}>${i === 0 && ["", "in", "s", "up", "new"].includes(v) ? (v === "" ? "第一面（起點 A）" : t + "（第一面不影響）") : t}</option>`).join("")}</select></label>
      ${(r.op || []).map((o, j) => `<div class="vdims vop tlop" data-j="${j}"><label>開口${j + 1} 寬（m）<input data-o="w" inputmode="decimal" value="${esc(o.w)}"></label><label>高（m）<input data-o="h" inputmode="decimal" value="${esc(o.h)}"></label><label>個數<input data-o="n" inputmode="decimal" value="${esc(o.n)}"></label><label>距左（m）<input data-o="x" inputmode="decimal" placeholder="自動" value="${esc(o.x)}"></label><label>離地（m）<input data-o="y" inputmode="decimal" placeholder="自動" value="${esc(o.y)}"></label><button class="sec" data-opdel="${j}" aria-label="移除開口${j + 1}" style="align-self:end;min-height:44px">✕</button></div>`).join("")}
      ${(r.op || []).length < TILE_MAX_OP ? `<button class="sec" data-opadd="1" style="margin-top:8px;min-height:40px;padding:0 12px;font-size:14px">＋ 扣除開口（門、窗）</button>` : ""}
      <div class="vres"><small class="vexpr" data-tx="${i}" style="display:block;font-size:12px;overflow-wrap:anywhere"></small>淨面積：<b data-tr="${i}">—</b></div></div>`;

  const sum = () => {
    const T = tileTotals(st);
    T.res.forEach((x, i) => {
      const b = box.querySelector(`[data-tr="${i}"]`), e = box.querySelector(`[data-tx="${i}"]`);
      if (b) b.textContent = Number.isFinite(x.A) ? fmt(x.A, 2) + " m²" : "—";
      if (e) { e.textContent = x.warn || (x.expr ? x.expr + " =" : ""); e.style.color = x.warn ? "var(--bad)" : ""; }
    });
    T.groups.forEach(g => { const el = box.querySelector(`[data-sper="${g.i}"]`); if (el) el.textContent = Number.isFinite(g.per) ? `每 m² 約 ${fmt(g.per, 2)} 片` : ""; });
    const used = T.groups.filter(g => g.cnt);
    $("#tlOut").innerHTML = T.n ? `
      <div class="tblwrap"><table class="ct"><tr><th>磁磚</th><th>淨面積 m²</th><th>需片數</th><th>箱數</th></tr>${used.map(g => `<tr><th>${esc(tileSpecLabel(g.sp, g))}</th><td>${fmt(g.A, 2)}</td><td>${Number.isFinite(g.need) ? g.need : "—"}</td><td>${Number.isFinite(g.boxes) ? g.boxes : "—"}</td></tr>`).join("")}</table></div>
      <div class="big"><span>淨面積合計</span><b>${fmt(T.A, 2)} m²（${fmt(T.A / UNITS.ping[1], 2)} 坪）</b></div>
      ${used.length === 1 ? `<div class="big" data-bar="${esc(`${fmt(T.A, 2)} m²・${Number.isFinite(used[0].need) ? used[0].need + " 片" : "—"}${Number.isFinite(used[0].boxes) ? "・" + used[0].boxes + " 箱" : ""}`)}"><span>含損耗 ${fmt(used[0].loss, 1)}% 需</span><b>${Number.isFinite(used[0].need) ? used[0].need + " 片" : "請填磁磚尺寸"}${Number.isFinite(used[0].boxes) ? `（${used[0].boxes} 箱）` : ""}</b></div>`
        : `<div class="big" data-bar="${esc(`${fmt(T.A, 2)} m²・${used.length} 種磁磚`)}"><span>磁磚種類</span><b>${used.length} 種（見上表）</b></div>`}
      ${Number.isFinite(T.kg) ? `<div class="big"><span>黏著劑／益膠泥</span><b>${fmt(T.kg, 1)} kg${Number.isFinite(T.bags) ? `（${T.bags} 包）` : ""}</b></div>` : ""}
      <p class="cnote">片數已含各規格損耗並無條件進位；箱數 = 片數 ÷ 每箱片數，無條件進位。</p>`
      : `<p class="cnote">輸入每一面的長、高（或面積）後，這裡會依磁磚規格合計面積、片數與箱數。</p>`;
    drawPic(); tileSave(st); autoSave();
  };
  let picRaf = 0;
  const drawPic = () => { cancelAnimationFrame(picRaf); picRaf = requestAnimationFrame(() => { const el = live() && $("#tlDraw"); if (el && $("#tlDrawBox").open) el.innerHTML = tileDrawHtml(st); }); };
  $("#tlDrawBox").ontoggle = drawPic;
  $("#tlDrawBox").onclick = e => { if (!e.target.closest("[data-trot]")) return; st.cfg.rot = String(((+st.cfg.rot || 0) + 1) % 4); sum(); };

  // ---- 儲存的計算（IndexedDB vols，kind: "tile"，依工地） ----
  let timer = 0, rec = null;
  const gen = ++tileGen, live = () => gen === tileGen && box.isConnected && !!$("#tlCurName");   // 換頁後延遲存檔的回呼只存資料、不碰畫面
  const mark = t => { const el = live() && $("#tlSaved"); if (el) el.textContent = t; };
  const head = () => {
    if (!live()) return;
    $("#tlCurName").textContent = rec ? rec.name : (st.cfg.title.trim() || "新計算");
    const c = $("#tlCurSt"); c.textContent = rec ? `已存檔・${volStamp(rec.updated)}` : tileHasData(st) ? "尚未存檔" : ""; c.classList.toggle("bad", !rec && tileHasData(st));
  };
  const tip = () => { if (!live()) return; if (rec) svShow("saved", `✓ 已存檔 ${volStamp(rec.updated)}`); else if (tileHasData(st)) svShow("unsaved", siteId ? "尚未存檔・按最下方「存檔」" : "輸入已保留在這支手機・尚未存檔"); else svHide(); };
  const status = () => { head(); tip(); mark(!siteId ? "要存檔請先建立或選擇專案（右上角＋）。目前的輸入仍會暫存在這支手機。"
    : rec ? `✓ 已存檔 ${volStamp(rec.updated)}，之後的修改會自動更新這筆紀錄` : tileHasData(st) ? "尚未存檔：填紀錄名稱後按「存檔」，之後可從頁首「磁磚紀錄」開啟" : ""); };
  const list = async () => {
    const all = siteId ? (await DB.all("vols")).filter(x => x.siteId === siteId && x.kind === "tile").sort((a, b) => (b.updated || 0) - (a.updated || 0)) : [];
    const el = live() && $("#tlList"); if (!el) return;
    $("#tlCount").textContent = all.length ? `（${all.length}）` : "";
    el.innerHTML = all.length ? `<p class="cnote" style="margin:8px 0 4px">這個專案的磁磚紀錄（新的在前）：</p>` + all.map(x => { const T = tileTotals(tileNorm(x.rows, x.cfg)); return `<div class="vsrow${rec && rec.id === x.id ? " on" : ""}" data-id="${esc(x.id)}">
        <div class="vsname"><b>${esc(x.name || "（未命名）")}</b>${rec && rec.id === x.id ? "（開啟中）" : ""}<small>${esc(volStamp(x.updated))}・淨面積 ${fmt(T.A, 2)} m²・${T.n} 面</small></div>
        <div class="vsbtn"><button class="sec" data-topen="1">開啟</button><button class="sec" data-tcopy="1">複製</button><button class="danger" data-tdel="1" aria-label="刪除「${esc(x.name)}」">刪除</button></div></div>`; }).join("")
      : `<p class="cnote" style="margin:8px 0 0">${siteId ? "這個專案還沒有磁磚紀錄。算好後在頁面下方「存檔」。" : "請先建立或選擇專案（右上角＋）。"}</p>`;
  };
  const reopen = (rows, cfg) => { tileSave(tileNorm(rows, cfg)); tabTile(box); };
  const doSave = async () => { if (!rec) return; clearTimeout(timer); timer = 0; if (!(await DB.get("vols", rec.id))) { forget(); return; } rec = tileRec(st, rec); await DB.put("vols", rec); status(); list(); };
  function autoSave() { if (!rec) { status(); return; } mark("存檔中…"); if (live()) svShow("saving"); clearTimeout(timer); timer = setTimeout(doSave, 400); }
  // 開啟中的紀錄被刪除（在這裡刪、或別台手機刪了同步過來）：回到「新計算」，紀錄名稱一起清掉；輸入保留
  function forget() { clearTimeout(timer); timer = 0; rec = null; st.cfg.cur = ""; st.cfg.title = ""; tileSave(st); const t = live() && $("#tlTitle"); if (t) t.value = ""; status(); list(); }
  $("#tlTitle").oninput = e => { st.cfg.title = e.target.value; tileSave(st); if (rec && st.cfg.title.trim()) autoSave(); else head(); };
  $("#tlTitle").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("#tlSave").click(); } };
  $("#tlOpen").onclick = () => { const l = $("#tlList"), open = l.hidden; l.hidden = !open; $("#tlOpen").setAttribute("aria-expanded", String(open)); $("#tlOpen").classList.toggle("on", open); };
  $("#tlSave").onclick = async () => {
    if (!siteId) { status(); return; }
    if (!st.cfg.title.trim()) { mark("請先填「紀錄名稱」，例如：外牆二丁掛"); $("#tlTitle").focus(); return; }
    rec = tileRec(st, rec || { id: uid(), siteId, created: Date.now() });
    st.cfg.cur = rec.id; tileSave(st);
    await DB.put("vols", rec); status(); list();
  };
  $("#tlNew").onclick = async () => {
    if (!rec && tileHasData(st) && !(await uiConfirm("目前的輸入還沒存檔，要清空開始新計算嗎？"))) return;
    if (timer) await doSave();
    reopen([], { specs: st.cfg.specs, glue: st.cfg.glue, bag: st.cfg.bag, who: st.cfg.who });   // 新計算沿用目前的磁磚規格
  };
  $("#tlList").onclick = async e => {
    const b = e.target.closest("button"), id = b?.closest("[data-id]")?.dataset.id; if (!id) return;
    const x = await DB.get("vols", id); if (!x) { list(); return; }
    if (b.dataset.topen) {
      if (!rec && tileHasData(st) && !(await uiConfirm("目前的輸入還沒存檔，開啟後會被取代。要繼續嗎？"))) return;
      if (timer) await doSave();
      if (window.cloudRO && await cloudRO("vols", x)) {   // 雲端版：同事建立的只能看，載入成未存檔的新計算
        reopen(x.rows, { ...x.cfg, cur: "", title: x.name + "（同事的紀錄，另存才會保留）" }); return;
      }
      reopen(x.rows, { ...x.cfg, cur: x.id, title: x.name });
    } else if (b.dataset.tcopy) {
      if (timer) await doSave();
      const { sigs, ...cfg } = x.cfg || {};   // 複本不帶簽名
      const c = { ...x, cfg, id: uid(), name: (x.name || "") + "（複本）", created: Date.now(), updated: Date.now() };
      await DB.put("vols", c); reopen(c.rows, { ...c.cfg, cur: c.id, title: c.name });
    } else if (b.dataset.tdel) {
      if (!(await uiConfirm(`刪除「${x.name || "（未命名）"}」？刪除後無法復原。`))) return;
      await DB.del("vols", id);
      if (rec && rec.id === id) forget();
      status(); list();
    }
  };
  (async () => {
    const x = st.cfg.cur ? await DB.get("vols", st.cfg.cur) : null;
    if (x && x.siteId === siteId && x.kind === "tile") rec = x; else if (st.cfg.cur) { if (!x) forget(); else { st.cfg.cur = ""; tileSave(st); } }
    status(); list();
  })();

  const draw = () => { $("#tlRows").innerHTML = `<h2 class="t" style="font-size:17px;margin:4px 12px"><span class="cfno">2</span>各面面積</h2>` + st.rows.map(rowHtml).join(""); sum(); };
  const rowOf = el => st.rows[+el.closest(".vrow")?.dataset.i];
  $("#tlRows").oninput = $("#tlRows").onchange = e => {
    const el = e.target, r = el.closest(".vrow") && rowOf(el); if (!r) return;
    if (el.dataset.o) { const j = +el.closest(".vop").dataset.j; r.op[j][el.dataset.o] = el.value; sum(); return; }
    const k = el.dataset.k; if (!k) return;
    r[k] = el.value; sum();
  };
  $("#tlRows").onclick = e => {
    const el = e.target.closest("button"); if (!el) return;
    if (el.dataset.del !== undefined) { st.rows.splice(+el.dataset.del, 1); if (!st.rows.length) st.rows.push(tileBlank()); draw(); return; }
    const r = rowOf(el); if (!r) return;
    if (el.dataset.opadd) { r.op.push({ w: "", h: "", n: "1", x: "", y: "" }); draw(); box.querySelector(`.vrow[data-i="${st.rows.indexOf(r)}"] .vop:last-of-type input`)?.focus(); }
    else if (el.dataset.opdel !== undefined) { r.op.splice(+el.dataset.opdel, 1); draw(); }
  };
  $("#tlSpecs").oninput = e => {
    const el = e.target, k = el.dataset.sk, i = +el.closest("[data-si]")?.dataset.si; if (!k || !st.cfg.specs[i]) return;
    st.cfg.specs[i][k] = el.value;
    if (k === "name") box.querySelectorAll(`#tlRows select[data-k="s"] option[value="${i}"]`).forEach(o => o.textContent = el.value || "磁磚 " + (i + 1));
    sum();
  };
  $("#tlSpecs").onclick = async e => {
    const el = e.target.closest("button"); if (!el) return;
    const i = +el.closest("[data-si]")?.dataset.si;
    if (el.dataset.sz !== undefined) { const [, l, w] = TILE_SIZES[+el.dataset.sz]; Object.assign(st.cfg.specs[i], { L: String(l), W: String(w) }); drawSpecs(); sum(); }
    else if (el.dataset.sdel !== undefined) {
      const d = +el.dataset.sdel, used = st.rows.filter(r => +r.s === d).length;
      if (used && !(await uiConfirm(`有 ${used} 面使用「${st.cfg.specs[d].name}」，刪除後這些面會改用第一種磁磚。要刪除嗎？`))) return;
      st.cfg.specs.splice(d, 1);
      st.rows.forEach(r => { const s = +r.s; r.s = String(s === d ? 0 : s > d ? s - 1 : s); });
      drawSpecs(); draw();
    } else if (el.id === "tlSpecAdd") {
      const p = st.cfg.specs[st.cfg.specs.length - 1];
      st.cfg.specs.push({ ...tileSpecBlank(st.cfg.specs.length), j: p.j, loss: p.loss });
      drawSpecs(); draw(); box.querySelector(`[data-si="${st.cfg.specs.length - 1}"] [data-sk="name"]`)?.select();
    }
  };
  $("#tlAdd").onclick = () => {
    const last = st.rows[st.rows.length - 1];
    st.rows.push(tileBlank(last ? last.s : "0")); draw();
    box.querySelector(`.vrow[data-i="${st.rows.length - 1}"] [data-k="name"]`)?.focus();
  };
  $("#tlClear").onclick = async () => { if (!(await uiConfirm("清除全部的面？（磁磚規格保留）"))) return; st.rows = [tileBlank()]; draw(); };
  box.oninput = e => { const k = e.target.dataset.c; if (!k) return; st.cfg[k] = e.target.value; sum(); };   // 用 oninput（重新開啟紀錄時不會重複掛）

  // 紅磚（原泥作材料，不存檔）
  const brick = () => {
    const A = num($("#bA")), lossB = 1 + num($("#bLoss"), 0) / 100, j = num($("#bJ"), 0);
    const per = 1e4 / ((num($("#bL")) + j) * (num($("#bT")) + j)) * +$("#bType").value;
    $("#bOut").innerHTML = Number.isFinite(per) && per > 0 ? `<div class="big"><span>每 m² 約</span><b>${fmt(per, 1)} 塊</b></div>${A > 0 ? `<div class="big"><span>共需</span><b>${Math.ceil(A * per * lossB - 1e-9)} 塊</b></div>` : ""}` : "";
  };
  $("#tlBrick").querySelectorAll("input,select").forEach(el => el.oninput = brick);
  brick();

  drawSpecs(); draw();
}

function renderTileSheet() {
  const st = tileLoad(), T = tileTotals(st), company = siteCompany(siteId);
  const list = st.rows.map((r, i) => ({ r, x: T.res[i] })).filter(o => Number.isFinite(o.x.A));
  const used = T.groups.filter(g => g.cnt);
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="tsBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">磁磚數量計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(null))}</td></tr>
        ${st.cfg.title ? `<tr><td>紀錄名稱</td><td colspan="3">${esc(st.cfg.title)}</td></tr>` : ""}
        <tr><td>位置／部位</td><td>${esc(st.cfg.loc)}</td><td>計算日期</td><td>${esc(rocYmd(today()))}</td></tr>
      </table>
      <table class="pt items">
        <tr><th colspan="5" style="text-align:left">二、各面面積（尺寸單位 m）</th></tr>
        <tr class="tlwrap"><th>序</th><th>名稱／位置</th><th>磁磚</th><th>計算式</th><th>淨面積<br>m²</th></tr>
        ${list.map((o, i) => `<tr><td class="c">${i + 1}</td><td>${esc(o.r.name)}</td><td>${esc(st.cfg.specs[+o.r.s]?.name || "")}</td><td style="font-size:8.5pt;overflow-wrap:anywhere">${esc(o.x.expr)}</td><td class="c nw">${fmt(o.x.A, 2)}</td></tr>`).join("") || `<tr><td colspan="5" class="c">尚無可計算的面</td></tr>`}
        <tr><td colspan="4" style="text-align:right"><b>淨面積合計</b></td><td class="c nw"><b>${fmt(T.A, 2)}</b></td></tr>
      </table>
      <table class="pt items">
        <tr><th colspan="5" style="text-align:left">三、磁磚數量</th></tr>
        <tr class="tlwrap"><th>磁磚<br><small>尺寸 cm・縫寬 mm</small></th><th>淨面積<br>m²</th><th>每 m²<br>片數</th><th>需片數<br><small>含損耗</small></th><th>箱數</th></tr>
        ${used.map(g => `<tr><td>${esc(g.sp.name)}<br><small>${g.L > 0 && g.W > 0 ? `${fmt(g.L, 1)}×${fmt(g.W, 1)}` : "—"}・縫 ${fmt(g.jmm, 1)}</small></td><td class="c">${fmt(g.A, 2)}</td><td class="c">${fmt(g.per, 2)}</td><td class="c">${Number.isFinite(g.need) ? g.need : "—"}<br><small>損耗 ${fmt(g.loss, 1)}%</small></td><td class="c">${Number.isFinite(g.boxes) ? `${g.boxes}<br><small>${fmt(g.box, 0)} 片／箱</small>` : "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="c">—</td></tr>`}
        ${Number.isFinite(T.kg) ? `<tr><td colspan="3">黏著劑／益膠泥（${fmt(tileNum(st.cfg.glue), 2)} kg/m² × 淨面積）</td><td class="c" colspan="2">${fmt(T.kg, 1)} kg${Number.isFinite(T.bags) ? `（${T.bags} 包）` : ""}</td></tr>` : ""}
      </table>
      <table class="pt"><tr><td style="font-size:9pt">註：每 m² 片數 = 10000 ÷〔(片長 + 縫寬) × (片寬 + 縫寬)〕（cm）；需片數 = 淨面積 × 每 m² 片數 × (1 + 損耗率)，無條件進位；箱數 = 需片數 ÷ 每箱片數，無條件進位。各面已扣除所列開口。本表為理論數量，實際叫料請考慮切割、收邊、轉角與破損，並以圖說與現場量測為準。</td></tr></table>
      ${tileDrawSheet(st)}
      <div class="psigs">${["計算人員" + (st.cfg.who ? "：" + esc(st.cfg.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#tsBack").onclick = () => goBack("#/calc/tile");
  $("#pvPrint").onclick = doPrint;
  csgBind({   // 計算書簽名（calcsig.js）：存在目前輸入，開啟中的磁磚紀錄也一起存（同事建立、只能看的紀錄不會掛 cur）
    get: () => tileLoad().cfg.sigs,
    set: async n => {
      const s = tileLoad(); s.cfg.sigs = n; tileSave(s);
      const r = s.cfg.cur ? await DB.get("vols", s.cfg.cur) : null;
      if (r && r.kind === "tile" && r.siteId === siteId && !(window.cloudRO && await cloudRO("vols", r))) {
        const cfg = { ...(r.cfg || {}) }; if (Object.keys(n).length) cfg.sigs = n; else delete cfg.sigs;
        await DB.put("vols", { ...r, cfg, updated: Date.now() });
      }
    }
  }, renderTileSheet);
}

CALC_TABS.splice(CALC_TABS.findIndex(t => t[0] === "sleeve"), 0, ["tile", "磁磚計算", tabTile]);
