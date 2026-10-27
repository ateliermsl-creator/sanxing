"use strict";
/* 工地隨身工程計算機（純前端，離線可用）
   八個分頁：鋼筋稱號、鋼筋重量、混凝土方數、坡度與高程、面積換算、倍數換算、泥作材料、穿樑套管 */

const fmt = (v, d = 2) => Number.isFinite(v) ? String(+v.toFixed(d)) : "—";
const num = (el, d = NaN) => { const v = parseFloat(el?.value); return Number.isFinite(v) ? v : d; };

/* ---------- 鋼筋稱號（單位重、直徑、斷面積、周長） ----------
   ok = true：已與使用者提供的參考資料核對；false：推算值，尚待核對（在表中以 ※ 標示）。 */
const REBARS = [
  { d: "D10", mark: "#3", w: "0.56", db: "0.953", ab: "0.7133", l: "3", ok: true },
  { d: "D13", mark: "#4", w: "0.994", db: "1.27", ab: "1.267", l: "4", ok: true },
  { d: "D16", mark: "#5", w: "1.56", db: "1.59", ab: "1.986", l: "5", ok: true },
  { d: "D19", mark: "#6", w: "2.25", db: "1.91", ab: "2.865", l: "6", ok: true },
  { d: "D22", mark: "#7", w: "3.04", db: "2.22", ab: "3.871", l: "7", ok: true },
  { d: "D25", mark: "#8", w: "3.98", db: "2.54", ab: "5.067", l: "8", ok: true },
  { d: "D29", mark: "#9", w: "5.08", db: "2.87", ab: "6.469", l: "9", ok: true },
  { d: "D32", mark: "#10", w: "6.39", db: "3.22", ab: "8.143", l: "10.1", ok: true },
  { d: "D36", mark: "#11", w: "7.9", db: "3.58", ab: "10.07", l: "11.3", ok: true },
  { d: "D39", mark: "#12", w: "9.57", db: "3.94", ab: "12.19", l: "12.4", ok: true },
  { d: "D43", mark: "#14", w: "11.4", db: "4.3", ab: "14.52", l: "13.5", ok: true },
  { d: "D50", mark: "#16", w: "15.5", db: "5.02", ab: "19.79", l: "15.8", ok: true },
  { d: "D57", mark: "#18", w: "20.2", db: "5.73", ab: "25.79", l: "18", ok: true }
];
const rebarCells = r => [r.mark, r.w, r.db, r.ab, r.l];
function tabRebar(box) {
  const st = tabRebar.st = tabRebar.st || { d: "" };
  box.innerHTML = `
    <div class="panel"><div class="field" style="margin:0"><label>鋼筋稱號</label>
      <select id="rSel"><option value="">請選擇</option>${REBARS.map(r => `<option value="${r.d}" ${r.d === st.d ? "selected" : ""}>${r.d}</option>`).join("")}</select></div>
      <div id="rDetail"></div></div>
    <div class="panel"><h2>全部鋼筋稱號</h2><div class="tblwrap"><table class="ct" id="rAll">
      <tr><th>稱號</th><th>標示<br>代號</th><th>W<br><small>kgf/m</small></th><th>d<sub>b</sub><br><small>cm</small></th><th>A<sub>b</sub><br><small>cm²</small></th><th>ℓ<br><small>cm</small></th></tr>
      ${REBARS.map(r => `<tr data-d="${r.d}"><th>${r.d}${r.ok ? "" : "※"}</th>${rebarCells(r).map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>
      <p class="cnote">W：單位重；d<sub>b</sub>：標稱直徑；A<sub>b</sub>：標稱斷面積；ℓ：標稱周長。<br>D10～D57 的數值已與提供的參考資料逐項核對。</p></div>`;
  const draw = () => {
    st.d = $("#rSel").value;
    const r = REBARS.find(x => x.d === st.d);
    $("#rDetail").innerHTML = !r ? "" : (() => { const c = rebarCells(r); return `
      <div class="big"><span>稱號</span><b>${r.d}</b></div><div class="big"><span>標示代號</span><b>${c[0]}</b></div>
      <div class="big"><span>單位重 W（kgf/m）</span><b>${c[1]}</b></div><div class="big"><span>標稱直徑 d<sub>b</sub>（cm）</span><b>${c[2]}</b></div>
      <div class="big"><span>標稱斷面積 A<sub>b</sub>（cm²）</span><b>${c[3]}</b></div><div class="big"><span>標稱周長 ℓ（cm）</span><b>${c[4]}</b></div>
      `; })();
    box.querySelectorAll("#rAll tr[data-d]").forEach(tr => tr.classList.toggle("sel", tr.dataset.d === st.d));
  };
  $("#rSel").onchange = draw;
  $("#rAll").onclick = e => { const tr = e.target.closest("tr[data-d]"); if (!tr) return; $("#rSel").value = tr.dataset.d; draw(); $("#rSel").scrollIntoView({ block: "center", behavior: "smooth" }); };
  draw();
}

/* ---------- 鋼筋重量估算 ---------- 重量 = 單位重 W（kgf/m）× 每根長度（m）× 根數 */
function tabRebarWt(box) {
  const blank = () => ({ name: "", d: "D13", len: "", n: "" });
  let rows;
  try { rows = JSON.parse(localStorage.getItem("rebarRows") || "null"); } catch { rows = null; }
  if (!Array.isArray(rows) || !rows.length) rows = [blank()];
  const cfg = (() => { try { return JSON.parse(localStorage.getItem("rebarCfg") || "{}"); } catch { return {}; } })();
  box.innerHTML = `
    <div id="wRows"></div>
    <div class="row"><button class="sec" id="wAdd">＋ 新增一列</button><button class="sec" id="wClear">全部清除</button></div>
    <div class="panel"><div class="field" style="margin-bottom:6px"><label>損耗率（%，可填 0）</label><input id="wLoss" inputmode="decimal" value="${esc(cfg.loss ?? 0)}"></div><div id="wOut"></div></div>
    <p class="cnote" style="margin:0 12px 12px">重量 = 單位重 W（kgf/m）× 每根長度（m）× 根數，kgf 視為 kg。長度請輸入<b>公尺</b>。單位重取自「鋼筋稱號」分頁的標稱值，實際進場重量會有 ±誤差，請以過磅為準。資料會記在這支手機。</p>`;
  const wOf = d => parseFloat(REBARS.find(r => r.d === d)?.w);
  const rowW = r => wOf(r.d) * (+r.len || 0) * (+r.n || 0);
  const save = () => { try { localStorage.setItem("rebarRows", JSON.stringify(rows)); localStorage.setItem("rebarCfg", JSON.stringify({ loss: $("#wLoss").value })); } catch {} };
  const sum = () => {
    box.querySelectorAll("[data-wr]").forEach(el => { const v = rowW(rows[+el.dataset.wr]); el.textContent = v > 0 ? fmt(v, 2) + " kg" : "—"; });
    const by = {};
    rows.forEach(r => { const L = (+r.len || 0) * (+r.n || 0); if (L > 0) { const o = by[r.d] = by[r.d] || { L: 0, w: 0 }; o.L += L; o.w += rowW(r); } });
    const total = Object.values(by).reduce((a, o) => a + o.w, 0), loss = num($("#wLoss"), 0), withLoss = total * (1 + loss / 100);
    $("#wOut").innerHTML = total > 0 ? `
      <div class="tblwrap"><table class="ct"><tr><th>號數</th><th>總長 (m)</th><th>重量 (kg)</th></tr>
      ${REBARS.filter(r => by[r.d]).map(r => `<tr><th>${r.d}</th><td>${fmt(by[r.d].L, 2)}</td><td>${fmt(by[r.d].w, 2)}</td></tr>`).join("")}</table></div>
      <div class="big"><span>合計</span><b>${fmt(total, 2)} kg</b></div>
      ${loss > 0 ? `<div class="big"><span>含損耗 ${fmt(loss, 1)}%</span><b>${fmt(withLoss, 2)} kg</b></div>` : ""}
      <div class="big"><span>以噸計${loss > 0 ? "（含損耗）" : ""}</span><b>${fmt(withLoss / 1000, 3)} t</b></div>` : `<p class="cnote">輸入長度與根數後，這裡會顯示各號數的總長、重量與合計。</p>`;
    save();
  };
  const draw = () => {
    $("#wRows").innerHTML = rows.map((r, i) => `<div class="panel vrow" data-i="${i}">
      <div class="vtop"><input data-k="name" placeholder="部位（例：2F 柱主筋）" value="${esc(r.name)}"><select data-k="d">${REBARS.map(b => `<option value="${b.d}" ${b.d === r.d ? "selected" : ""}>${b.d}</option>`).join("")}</select><button class="danger" data-del="${i}" aria-label="刪除此列">✕</button></div>
      <div class="vdims"><label>每根長度（m）<input data-k="len" inputmode="decimal" value="${esc(r.len)}"></label><label>根數<input data-k="n" inputmode="decimal" value="${esc(r.n)}"></label></div>
      <div class="vres"><span style="font-size:13px">W = ${REBARS.find(b => b.d === r.d)?.w} kgf/m　</span>小計：<b data-wr="${i}">—</b></div></div>`).join("");
    sum();
  };
  $("#wRows").oninput = $("#wRows").onchange = e => { const k = e.target.dataset.k, i = e.target.closest(".vrow")?.dataset.i; if (!k) return; rows[+i][k] = e.target.value; if (k === "d") draw(); else sum(); };
  $("#wRows").onclick = e => { const d = e.target.dataset.del; if (d === undefined) return; rows.splice(+d, 1); if (!rows.length) rows.push(blank()); draw(); };
  $("#wAdd").onclick = () => { rows.push({ ...blank(), d: rows[rows.length - 1]?.d || "D13" }); draw(); };
  $("#wClear").onclick = () => { if (!confirm("清除全部列？")) return; rows = [blank()]; draw(); };
  $("#wLoss").oninput = sum;
  draw();
}

/* ---------- 混凝土方數 ---------- */
function tabVolume(box) {
  let rows;
  try { rows = JSON.parse(localStorage.getItem("calcRows") || "null"); } catch { rows = null; }
  if (!Array.isArray(rows) || !rows.length) rows = [{ name: "", type: "rect", a: "", b: "", c: "", n: 1 }];
  const cfg = (() => { try { return JSON.parse(localStorage.getItem("calcCfg") || "{}"); } catch { return {}; } })();
  const loss = cfg.loss ?? 5, cap = cfg.cap ?? 6;
  box.innerHTML = `
    <div id="vRows"></div>
    <div class="row"><button class="sec" id="vAdd">＋ 新增一列</button><button class="sec" id="vClear">全部清除</button></div>
    <div class="panel"><div class="calc-ctl2">
      <div class="field"><label>損耗率（%）</label><input id="vLoss" inputmode="decimal" value="${loss}"></div>
      <div class="field"><label>預拌車容量（m³／車）</label><input id="vCap" inputmode="decimal" value="${cap}"></div></div>
      <div id="vOut"></div></div>
    <p class="cnote" style="margin:0 12px 12px">尺寸一律輸入<b>公尺</b>。矩形＝長×寬×高（厚）；圓柱＝直徑 與 高。損耗率與車容量依你們的習慣填寫，會記在這支手機。</p>`;
  const vol = r => { const a = +r.a, b = +r.b, c = +r.c, n = +r.n || 0; return (r.type === "cyl" ? Math.PI * a * a / 4 * c : a * b * c) * n; };
  const save = () => { try { localStorage.setItem("calcRows", JSON.stringify(rows)); localStorage.setItem("calcCfg", JSON.stringify({ loss: $("#vLoss").value, cap: $("#vCap").value })); } catch {} };
  const sum = () => {
    const sub = rows.reduce((s, r) => s + (Number.isFinite(vol(r)) ? vol(r) : 0), 0);
    const l = num($("#vLoss"), 0), cp = num($("#vCap"), 0), order = sub * (1 + l / 100);
    box.querySelectorAll("[data-vr]").forEach(el => { const v = vol(rows[+el.dataset.vr]); el.textContent = v > 0 ? fmt(v, 3) + " m³" : "—"; });
    $("#vOut").innerHTML = `<div class="big"><span>淨方數</span><b>${fmt(sub, 3)} m³</b></div>
      <div class="big"><span>含損耗 ${fmt(l, 1)}%</span><b>${fmt(order, 3)} m³</b></div>
      <div class="big"><span>建議叫料（進位 0.5）</span><b>${order > 0 ? fmt(Math.ceil(order * 2 - 1e-9) / 2, 1) : "—"} m³</b></div>
      ${cp > 0 && order > 0 ? `<div class="big"><span>約需車數</span><b>${fmt(order / cp, 1)} 車（${Math.ceil(order / cp - 1e-9)} 車）</b></div>` : ""}`;
    save();
  };
  const draw = () => {
    $("#vRows").innerHTML = rows.map((r, i) => `<div class="panel vrow" data-i="${i}">
      <div class="vtop"><input data-k="name" placeholder="名稱（例：2F 柱）" value="${esc(r.name)}"><select data-k="type"><option value="rect" ${r.type === "rect" ? "selected" : ""}>矩形</option><option value="cyl" ${r.type === "cyl" ? "selected" : ""}>圓柱</option></select><button class="danger" data-del="${i}" aria-label="刪除此列">✕</button></div>
      <div class="vdims">${r.type === "cyl"
        ? `<label>直徑<input data-k="a" inputmode="decimal" value="${esc(r.a)}"></label><label>高<input data-k="c" inputmode="decimal" value="${esc(r.c)}"></label>`
        : `<label>長<input data-k="a" inputmode="decimal" value="${esc(r.a)}"></label><label>寬<input data-k="b" inputmode="decimal" value="${esc(r.b)}"></label><label>高／厚<input data-k="c" inputmode="decimal" value="${esc(r.c)}"></label>`}
        <label>數量<input data-k="n" inputmode="decimal" value="${esc(r.n)}"></label></div>
      <div class="vres">小計：<b data-vr="${i}">—</b></div></div>`).join("");
    sum();
  };
  $("#vRows").oninput = e => { const k = e.target.dataset.k, i = e.target.closest(".vrow")?.dataset.i; if (!k) return; rows[+i][k] = e.target.value; if (k === "type") draw(); else sum(); };
  $("#vRows").onclick = e => { const d = e.target.dataset.del; if (d === undefined) return; rows.splice(+d, 1); if (!rows.length) rows.push({ name: "", type: "rect", a: "", b: "", c: "", n: 1 }); draw(); };
  $("#vAdd").onclick = () => { rows.push({ name: "", type: "rect", a: "", b: "", c: "", n: 1 }); draw(); };
  $("#vClear").onclick = () => { if (!confirm("清除全部列？")) return; rows = [{ name: "", type: "rect", a: "", b: "", c: "", n: 1 }]; draw(); };
  $("#vLoss").oninput = $("#vCap").oninput = sum;
  draw();
}

/* ---------- 坡度與高程 ---------- */
function tabSlope(box) {
  box.innerHTML = `
    <div class="panel"><h2>坡度換算</h2>
      <div class="field"><label>水平距離 L（m）</label><input id="sL" inputmode="decimal" value="10"></div>
      <div class="field"><label>已知</label><select id="sKind"><option value="pct">坡度（%）</option><option value="dh">高差（cm）</option><option value="ratio">比例 1：n（填 n）</option><option value="deg">角度（°）</option></select></div>
      <div class="field"><label id="sLab">數值</label><input id="sVal" inputmode="decimal" value="2"></div>
      <div id="sOut"></div></div>
    <div class="panel"><h2>水準測量高程</h2>
      <div class="grid2"><div class="field"><label>已知點高程 BM（m）</label><input id="hBM" inputmode="decimal"></div>
      <div class="field"><label>後視讀數 BS（m）</label><input id="hBS" inputmode="decimal"></div>
      <div class="field"><label>前視讀數 FS（m）</label><input id="hFS" inputmode="decimal"></div>
      <div class="field"><label>設計高程（m，可空白）</label><input id="hDes" inputmode="decimal"></div></div>
      <div id="hOut"></div></div>
    <p class="cnote" style="margin:0 12px 12px">儀器高 HI = BM + BS；待測點高程 = HI − FS。與設計高程相比：正值表示現況偏低（需填），負值表示偏高（需挖／刨）。</p>`;
  const KIND = { pct: "坡度（%）", dh: "高差（cm）", ratio: "n（1：n）", deg: "角度（°）" };
  const s = () => {
    const L = num($("#sL")), k = $("#sKind").value, v = num($("#sVal")); $("#sLab").textContent = KIND[k];
    let slope = NaN;
    if (k === "pct") slope = v / 100; else if (k === "dh") slope = v / 100 / L; else if (k === "ratio") slope = 1 / v; else slope = Math.tan(v * Math.PI / 180);
    $("#sOut").innerHTML = Number.isFinite(slope) ? `
      <div class="big"><span>坡度</span><b>${fmt(slope * 100, 3)} %</b></div>
      <div class="big"><span>比例</span><b>${slope ? "1 : " + fmt(1 / Math.abs(slope), 2) : "—"}</b></div>
      <div class="big"><span>角度</span><b>${fmt(Math.atan(slope) * 180 / Math.PI, 3)} °</b></div>
      <div class="big"><span>L = ${fmt(L, 2)} m 的高差</span><b>${fmt(slope * L * 100, 2)} cm</b></div>
      <div class="big"><span>每 1 m 高差</span><b>${fmt(slope * 100, 2)} cm</b></div>` : `<p class="cnote">請輸入有效數值</p>`;
  };
  const h = () => {
    const bm = num($("#hBM")), bs = num($("#hBS")), fs = num($("#hFS")), des = num($("#hDes")), hi = bm + bs, el = hi - fs;
    $("#hOut").innerHTML = Number.isFinite(el) ? `<div class="big"><span>儀器高 HI</span><b>${fmt(hi, 3)} m</b></div><div class="big"><span>待測點高程</span><b>${fmt(el, 3)} m</b></div>
      ${Number.isFinite(des) ? `<div class="big"><span>設計 − 現況</span><b>${fmt((des - el) * 100, 1)} cm（${des - el > 0 ? "需填" : des - el < 0 ? "需挖" : "吻合"}）</b></div>` : ""}` : "";
  };
  box.querySelectorAll("input,select").forEach(el => el.oninput = () => { s(); h(); }); s(); h();
}

/* ---------- 坪與才 ---------- */
const TAI_CHI = 10 / 33;                     // 1 台尺 = 10/33 m
const UNITS = { ping: ["坪", 400 / 121], sai: ["才（平方台尺）", TAI_CHI * TAI_CHI], m2: ["平方公尺（m²）", 1], ft2: ["平方呎（ft²）", 0.09290304] };
function tabArea(box) {
  box.innerHTML = `
    <div class="panel"><h2>面積換算</h2>
      <div class="grid2"><div class="field"><label>數值</label><input id="aVal" inputmode="decimal" value="1"></div>
      <div class="field"><label>單位</label><select id="aUnit">${Object.entries(UNITS).map(([k, [n]]) => `<option value="${k}" ${k === "ping" ? "selected" : ""}>${n}</option>`).join("")}</select></div></div>
      <div id="aOut"></div></div>
    <div class="panel"><h2>尺寸 → 才數（玻璃、石材、磁磚）</h2>
      <div class="grid2"><div class="field"><label>長（cm）</label><input id="zL" inputmode="decimal"></div><div class="field"><label>寬（cm）</label><input id="zW" inputmode="decimal"></div>
      <div class="field"><label>片數</label><input id="zN" inputmode="decimal" value="1"></div></div>
      <div id="zOut"></div></div>
    <p class="cnote" style="margin:0 12px 12px">1 坪 = 400/121 m² ≈ 3.3058 m²；1 台尺 = 10/33 m ≈ 30.30 cm；1 才 = 1 平方台尺 ≈ 0.0918 m²（面積，用於玻璃、石材、磁磚）。木材「材積」的才不同，這裡不計算。</p>`;
  const a = () => {
    const v = num($("#aVal")), m2 = v * UNITS[$("#aUnit").value][1];
    $("#aOut").innerHTML = Number.isFinite(m2) ? Object.entries(UNITS).map(([k, [n, f]]) => `<div class="big"><span>${n}</span><b>${fmt(m2 / f, 4)}</b></div>`).join("") : "";
  };
  const z = () => {
    const l = num($("#zL")), w = num($("#zW")), n = num($("#zN"), 1), one = l / 100 * w / 100;
    $("#zOut").innerHTML = Number.isFinite(one) ? `<div class="big"><span>每片</span><b>${fmt(one / UNITS.sai[1], 3)} 才</b></div><div class="big"><span>共 ${fmt(n, 0)} 片</span><b>${fmt(one * n / UNITS.sai[1], 2)} 才</b></div>
      <div class="big"><span>面積合計</span><b>${fmt(one * n, 3)} m²（${fmt(one * n / UNITS.ping[1], 3)} 坪）</b></div>` : "";
  };
  box.querySelectorAll("input,select").forEach(el => el.oninput = () => { a(); z(); }); a(); z();
}


/* ---------- 搭接／錨定／彎鉤：倍數換算 ----------
   長度 = 倍數 × 鋼筋直徑 db。倍數請照「結構圖說」填入，本工具不內建任何規範數值；
   常用組合可以存成名稱（例如「fc'280 乙級搭接」），存在這支手機裡，下次直接點選。 */
const lapPresets = () => { try { const a = JSON.parse(ls.get("calcLap", "[]")); return Array.isArray(a) ? a.filter(p => p && typeof p.n === "string" && Number.isFinite(+p.m)).slice(0, 30) : []; } catch { return []; } };
function tabLap(box) {
  const st = tabLap.st = tabLap.st || { m: "", n: "", round: true };
  const draw = () => {
    const ps = lapPresets();
    box.innerHTML = `
      <div class="panel"><h2>倍數 × 鋼筋直徑</h2>
        <p class="cnote">搭接、錨定、彎鉤延伸長度的倍數，請依結構圖說或規範填入；下表列出各號數換算後的長度。</p>
        <div class="grid2"><div class="field"><label>倍數（× db）</label><input id="lM" inputmode="decimal" value="${esc(st.m)}" placeholder="由圖說查得"></div>
          <div class="field"><label>名稱（要存起來才填）</label><input id="lN" value="${esc(st.n)}" placeholder="例：fc'280 乙級搭接"></div></div>
        <label class="timing" style="margin:6px 0"><span style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="lR" ${st.round ? "checked" : ""}> 長度進位到 5 cm</span></label>
        <div class="row"><button class="sec" id="lSave">＋ 存成常用組合</button></div>
        ${ps.length ? `<div class="chips" style="margin:8px 0 0">${ps.map((p, i) => `<span style="display:inline-flex;gap:2px"><button type="button" class="chip" data-p="${i}">${esc(p.n)}（${esc(p.m)}d）</button><button type="button" class="chip" data-x="${i}" aria-label="刪除" style="padding:0 10px">✕</button></span>`).join("")}</div>` : ""}</div>
      <div class="panel"><div id="lOut"></div></div>
      <p class="cnote" style="margin:0 12px 12px">直徑 db 取自「鋼筋稱號」分頁已核對的數值。倍數與長度的取用條件（強度、位置、甲乙級…）請以圖說為準。</p>`;
    const calc = () => {
      const m = num($("#lM")), rnd = $("#lR").checked; st.m = $("#lM").value; st.n = $("#lN").value; st.round = rnd;
      $("#lOut").innerHTML = Number.isFinite(m) && m > 0 ? `<table class="ct"><tr><th>號數</th><th>db (cm)</th><th>長度 (cm)</th></tr>${REBARS.map(r => { const L = m * parseFloat(r.db); return `<tr><td>${r.d}</td><td>${r.db}</td><td><b>${rnd ? Math.ceil(L / 5 - 1e-9) * 5 : fmt(L, 1)}</b></td></tr>`; }).join("")}</table>` : `<p class="cnote">請輸入倍數</p>`;
    };
    box.querySelectorAll("input").forEach(el => el.oninput = calc); calc();
    $("#lSave").onclick = () => {
      const m = num($("#lM")), n = $("#lN").value.trim(); if (!(m > 0) || !n) { alert("請填倍數和名稱"); return; }
      const list = lapPresets().filter(p => p.n !== n); list.push({ n: n.slice(0, 40), m: String(m) }); ls.set("calcLap", JSON.stringify(list)); draw();
    };
    box.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { const p = lapPresets()[+b.dataset.p]; st.m = p.m; st.n = p.n; draw(); });
    box.querySelectorAll("[data-x]").forEach(b => b.onclick = () => { const l = lapPresets(); l.splice(+b.dataset.x, 1); ls.set("calcLap", JSON.stringify(l)); draw(); });
  };
  draw();
}

/* ---------- 泥作材料估算（紅磚／磁磚／砂漿） ----------
   尺寸、灰縫、損耗與單位用量都由你輸入（依實際進場規格與產品說明書），本工具只做面積與數量計算。 */
function tabMasonry(box) {
  const st = tabMasonry.st = tabMasonry.st || { ops: [{ w: "", h: "", n: "1" }] };
  box.innerHTML = `
    <div class="panel"><h2>牆面積（扣除門窗）</h2>
      <div class="grid2"><div class="field"><label>牆長（m）</label><input id="mL" inputmode="decimal"></div><div class="field"><label>牆高（m）</label><input id="mH" inputmode="decimal"></div></div>
      <label style="font-size:14px;color:var(--mut)">開口（門、窗）寬 × 高（m）× 數量</label><div id="mOps"></div>
      <div class="row"><button class="sec" id="mAdd">＋ 增加一個開口</button></div>
      <div id="mArea" class="big" style="margin-top:8px"></div></div>
    <div class="panel"><h2>紅磚</h2>
      <div class="grid2"><div class="field"><label>磚長（cm）</label><input id="bL" inputmode="decimal" value="23"></div><div class="field"><label>磚寬（cm）</label><input id="bW" inputmode="decimal" value="11"></div>
        <div class="field"><label>磚厚（cm）</label><input id="bT" inputmode="decimal" value="6"></div><div class="field"><label>灰縫（cm）</label><input id="bJ" inputmode="decimal" value="1"></div></div>
      <div class="field"><label>牆型</label><select id="bType"><option value="1">1/2B（牆厚＝磚寬，單層）</option><option value="2">1B（牆厚＝磚長，雙層）</option></select></div>
      <div class="field"><label>損耗率（%）</label><input id="bLoss" inputmode="decimal" value="0"></div>
      <p class="cnote">磚的尺寸預設只是常見的參考，請改成實際進場的規格。</p><div id="bOut"></div></div>
    <div class="panel"><h2>磁磚</h2>
      <div class="grid2"><div class="field"><label>片長（cm）</label><input id="tL" inputmode="decimal" value="60"></div><div class="field"><label>片寬（cm）</label><input id="tW" inputmode="decimal" value="30"></div>
        <div class="field"><label>縫寬（mm）</label><input id="tJ" inputmode="decimal" value="3"></div><div class="field"><label>損耗率（%）</label><input id="tLoss" inputmode="decimal" value="0"></div></div>
      <div class="chips" style="margin:6px 0">${[[30, 60], [60, 60], [30, 30], [45, 45], [60, 120]].map(([a, b]) => `<button type="button" class="chip" data-t="${a},${b}">${a}×${b}</button>`).join("")}</div>
      <div id="tOut"></div></div>
    <div class="panel"><h2>乾拌水泥砂漿／益膠泥</h2>
      <div class="grid2"><div class="field"><label>單位用量（kg/m²）</label><input id="sU" inputmode="decimal" placeholder="依產品說明書"></div><div class="field"><label>每包重量（kg）</label><input id="sB" inputmode="decimal" placeholder="例：包裝標示"></div></div>
      <div id="sOut"></div></div>
    <p class="cnote" style="margin:0 12px 12px">結果是理論數量，實際叫料請再考慮切割、破損與現場情況；單位用量、損耗請以產品與契約為準。</p>`;
  const area = () => { const g = num($("#mL")) * num($("#mH")), ops = st.ops.reduce((a, o) => a + (parseFloat(o.w) * parseFloat(o.h) * (parseFloat(o.n) || 1) || 0), 0); return g - ops; };
  const drawOps = () => { $("#mOps").innerHTML = st.ops.map((o, i) => `<div style="display:flex;gap:6px;margin:6px 0"><input data-o="${i}" data-k="w" inputmode="decimal" placeholder="寬" value="${esc(o.w)}"><input data-o="${i}" data-k="h" inputmode="decimal" placeholder="高" value="${esc(o.h)}"><input data-o="${i}" data-k="n" inputmode="decimal" placeholder="數量" value="${esc(o.n)}"><button class="danger" data-ox="${i}" style="min-height:44px">✕</button></div>`).join("");
    $("#mOps").querySelectorAll("[data-o]").forEach(el => el.oninput = () => { st.ops[+el.dataset.o][el.dataset.k] = el.value; calc(); });
    $("#mOps").querySelectorAll("[data-ox]").forEach(el => el.onclick = () => { st.ops.splice(+el.dataset.ox, 1); if (!st.ops.length) st.ops.push({ w: "", h: "", n: "1" }); drawOps(); calc(); }); };
  const calc = () => {
    const A = area(), ok = Number.isFinite(A) && A > 0;
    $("#mArea").innerHTML = Number.isFinite(A) ? `<span>淨面積</span><b>${fmt(A, 2)} m²（${fmt(A / UNITS.ping[1], 2)} 坪）</b>` : "";
    const lossB = 1 + (num($("#bLoss"), 0) / 100), lossT = 1 + (num($("#tLoss"), 0) / 100);
    const j = num($("#bJ"), 0), per = 1e4 / ((num($("#bL")) + j) * (num($("#bT")) + j)) * +$("#bType").value;
    $("#bOut").innerHTML = ok && Number.isFinite(per) ? `<div class="big"><span>每 m² 約</span><b>${fmt(per, 1)} 塊</b></div><div class="big"><span>共需</span><b>${Math.ceil(A * per * lossB)} 塊</b></div>` : "";
    const tj = num($("#tJ"), 0) / 10, tp = 1e4 / ((num($("#tL")) + tj) * (num($("#tW")) + tj));
    $("#tOut").innerHTML = ok && Number.isFinite(tp) ? `<div class="big"><span>每 m² 約</span><b>${fmt(tp, 2)} 片</b></div><div class="big"><span>共需</span><b>${Math.ceil(A * tp * lossT)} 片</b></div>` : "";
    const u = num($("#sU")), bag = num($("#sB"));
    $("#sOut").innerHTML = ok && u > 0 ? `<div class="big"><span>總用量</span><b>${fmt(A * u, 1)} kg</b></div>${bag > 0 ? `<div class="big"><span>約需</span><b>${Math.ceil(A * u / bag)} 包</b></div>` : ""}` : `<p class="cnote">填入單位用量即可估算</p>`;
  };
  box.querySelectorAll("input:not([data-o]),select").forEach(el => el.oninput = calc);
  box.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { const [l, w] = b.dataset.t.split(","); $("#tL").value = l; $("#tW").value = w; calc(); });
  $("#mAdd").onclick = () => { st.ops.push({ w: "", h: "", n: "1" }); drawOps(); };
  drawOps(); calc();
}

/* ---------- 穿樑套管檢核 ----------
   檢核條件（中央區間、管徑上限、孔距倍數）預設為使用者提供的規則，可在畫面上修改；
   這不是規範原文，只提供現場初步判斷，穿樑洞口仍須依結構圖說並經結構技師核可。 */
function tabSleeve(box) {
  box.innerHTML = `
    <div class="panel"><h2>樑與套管尺寸（cm）</h2>
      <div class="grid2"><div class="field"><label>樑深 h</label><input id="vH" inputmode="decimal"></div><div class="field"><label>樑寬 b（記錄用）</label><input id="vB" inputmode="decimal"></div>
        <div class="field"><label>樑淨跨 L</label><input id="vL" inputmode="decimal"></div><div class="field"><label>套管外徑 d</label><input id="vD" inputmode="decimal"></div>
        <div class="field"><label>孔中心距支承面 x</label><input id="vX" inputmode="decimal"></div><div class="field"><label>相鄰孔中心距 s（單孔可空白）</label><input id="vS" inputmode="decimal"></div></div></div>
    <details class="panel"><summary>檢核條件（可修改）</summary>
      <div class="grid2"><div class="field"><label>孔位須在跨度中央 1／?</label><input id="rZ" inputmode="decimal" value="3"></div><div class="field"><label>管徑 ≤ 樑深 1／?</label><input id="rD" inputmode="decimal" value="3"></div>
        <div class="field"><label>孔中心距 ≥ ? 倍管徑</label><input id="rS" inputmode="decimal" value="3"></div></div>
      <p class="cnote">預設值照你提供的規則；請與專案結構圖說核對，必要時在這裡改成圖說規定。</p></details>
    <div class="panel"><div id="vOut"></div></div>
    <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本檢核只是現場初步判斷。穿樑洞口的位置、大小與補強須依結構設計圖說，並經結構技師確認，不可僅憑本工具施工；「不符」代表需洽結構技師，不是自行判定可否。</p>`;
  const go = () => {
    const h = num($("#vH")), L = num($("#vL")), d = num($("#vD")), x = num($("#vX")), s = num($("#vS")), z = num($("#rZ"), 3), k = num($("#rD"), 3), m = num($("#rS"), 3);
    if (![h, L, d, x].every(Number.isFinite)) { $("#vOut").innerHTML = `<p class="cnote">請填樑深、淨跨、管徑與孔位</p>`; return; }
    const lo = L * (1 - 1 / z) / 2, hi = L - lo, rows = [];
    rows.push([x >= lo && x <= hi, `孔位置：距支承面 ${fmt(x, 1)} cm，須在 ${fmt(lo, 1)}～${fmt(hi, 1)} cm（跨度中央 1/${fmt(z, 2)}）`]);
    rows.push([d <= h / k, `管徑：${fmt(d, 1)} cm，須 ≤ 樑深 1/${fmt(k, 2)} = ${fmt(h / k, 1)} cm`]);
    if (Number.isFinite(s)) rows.push([s >= m * d, `孔距：中心距 ${fmt(s, 1)} cm，須 ≥ ${fmt(m, 2)} 倍管徑 = ${fmt(m * d, 1)} cm`]);
    const bad = rows.filter(r => !r[0]).length;
    $("#vOut").innerHTML = rows.map(([ok, t]) => `<div class="big" style="align-items:flex-start"><span>${ok ? "✅" : "❌"}</span><b style="font-weight:500;flex:1;margin-left:8px">${t}</b></div>`).join("")
      + `<div class="big" style="margin-top:8px"><span>結果</span><b style="color:${bad ? "var(--bad)" : "var(--ok)"}">${bad ? `有 ${bad} 項不符，請洽結構技師` : "符合上述檢核條件"}</b></div>`;
  };
  box.querySelectorAll("input").forEach(el => el.oninput = go); go();
}

/* ---------- 分頁 ---------- */
const CALC_TABS = [["rebar", "鋼筋稱號", tabRebar], ["wt", "鋼筋重量", tabRebarWt], ["vol", "混凝土方數", tabVolume], ["slope", "坡度高程", tabSlope], ["area", "面積換算", tabArea], ["lap", "倍數換算", tabLap], ["mas", "泥作材料", tabMasonry], ["sleeve", "穿樑套管", tabSleeve]];
function renderCalc(tab) {
  const cur = CALC_TABS.find(t => t[0] === tab) || CALC_TABS[0];
  view.innerHTML = `<h2 class="t">🧮 工程計算機</h2>
    <div class="chips">${CALC_TABS.map(([k, l]) => `<a class="chip ${k === cur[0] ? "on" : ""}" href="#/calc/${k}" style="display:inline-flex;align-items:center;text-decoration:none">${l}</a>`).join("")}</div>
    <div id="calcBox"></div>`;
  view.querySelectorAll(".chips a.chip").forEach(a => a.onclick = e => { e.preventDefault(); goReplace(a.getAttribute("href")); });   // 切換分頁不累積瀏覽紀錄
  cur[2]($("#calcBox"));
}
