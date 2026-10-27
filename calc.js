"use strict";
/* 工地隨身工程計算機（純前端，離線可用）
   四個分頁：鋼筋長度速查、混凝土方數、坡度與高程、坪與才 */

const fmt = (v, d = 2) => Number.isFinite(v) ? String(+v.toFixed(d)) : "—";
const num = (el, d = NaN) => { const v = parseFloat(el?.value); return Number.isFinite(v) ? v : d; };

/* ---------- 鋼筋伸展／搭接長度 ----------
   單位 kgf/cm²、cm。公式為 ACI 318 簡化式換算成 kgf/cm² 的形式（土木401 沿用同一體系）。
   ※ 係數未能對照規範原文逐條核對，請由結構技師依現行「混凝土結構設計規範」與設計圖說確認。 */
const COEF = {
  tensionA: { small: 0.15, large: 0.19 },   // 淨間距≥db、保護層≥db 且箍筋符合最小量（直線受拉）
  tensionB: { small: 0.22, large: 0.28 },   // 其他情況（直線受拉）
  psiMax: 1.7,                              // ψt·ψe 上限
  tensionMin: 30,                           // cm
  hook: 0.075, hookMinDb: 8, hookMin: 15,   // 標準彎鉤 ldh = 0.075·ψe·fy/(λ√f'c)·db
  comp: 0.075, compFy: 0.0043, compMin: 20, // 受壓 ldc = max(0.075 fy/(λ√f'c)·db, 0.0043 fy·db)
  compSplice: 0.0071, compSpliceHi: [0.013, 24], compSpliceMin: 30,
  smallBarDb: 1.91                          // #6 (D19) 及以下用較小係數
};
const BARS = [["#3", "D10", 0.953], ["#4", "D13", 1.27], ["#5", "D16", 1.59], ["#6", "D19", 1.91], ["#7", "D22", 2.22],
  ["#8", "D25", 2.54], ["#9", "D29", 2.87], ["#10", "D32", 3.23], ["#11", "D36", 3.58], ["#14", "D43", 4.30], ["#18", "D57", 5.73]];
const FCS = [210, 240, 280, 350, 420];
const MODES = {
  ld: "受拉直線伸展長度 ld", spA: "受拉搭接 A 級（1.0 ld）", spB: "受拉搭接 B 級（1.3 ld）",
  ldh: "標準彎鉤伸展長度 ldh", ldc: "受壓伸展長度 ldc", spC: "受壓搭接長度"
};
function rebarLen(mode, db, fc, fy, o) {
  const rt = Math.sqrt(fc), small = db <= COEF.smallBarDb + 1e-6;
  const psi = Math.min(o.pt * o.pe, COEF.psiMax);
  const tb = (o.cond === "A" ? COEF.tensionA : COEF.tensionB)[small ? "small" : "large"];
  const ld = Math.max(tb * fy * psi / rt * db, COEF.tensionMin);
  switch (mode) {
    case "ld": return ld;
    case "spA": return ld;
    case "spB": return Math.max(1.3 * ld, COEF.tensionMin);
    case "ldh": return Math.max(COEF.hook * o.pe * fy / rt * db, COEF.hookMinDb * db, COEF.hookMin);
    case "ldc": return Math.max(COEF.comp * fy / rt * db, COEF.compFy * fy * db, COEF.compMin);
    case "spC": return Math.max(fy <= 4200 ? COEF.compSplice * fy * db : (COEF.compSpliceHi[0] * fy - COEF.compSpliceHi[1]) * db, COEF.compSpliceMin);
  }
}
const FORMULA = {
  ld: o => { const k = o.cond === "A" ? COEF.tensionA : COEF.tensionB; return `ld = ${k.small}（≤D19）或 ${k.large}（≥D22）× fy·ψt·ψe ÷ (λ√f'c) × db，ψt·ψe ≤ ${COEF.psiMax}，λ = 1，且 ≥ ${COEF.tensionMin} cm`; },
  spA: () => "A 級搭接 = 1.0 ld（配置鋼筋量 ≥ 需要量 2 倍，且搭接長度內搭接量 ≤ 全部的 1/2）",
  spB: () => "B 級搭接 = 1.3 ld（不符合 A 級條件者），且 ≥ 30 cm",
  ldh: () => `ldh = ${COEF.hook} × ψe·fy ÷ (λ√f'c) × db，且 ≥ ${COEF.hookMinDb}db、≥ ${COEF.hookMin} cm`,
  ldc: () => `ldc = max(${COEF.comp}·fy ÷ (λ√f'c)·db，${COEF.compFy}·fy·db)，且 ≥ ${COEF.compMin} cm`,
  spC: () => `受壓搭接：fy ≤ 4200 時 ${COEF.compSplice}·fy·db；fy > 4200 時 (${COEF.compSpliceHi[0]}·fy − ${COEF.compSpliceHi[1]})·db；且 ≥ ${COEF.compSpliceMin} cm`
};
function tabRebar(box) {
  const st = tabRebar.st = tabRebar.st || { mode: "ld", fy: 4200, pt: 1, pe: 1, cond: "A" };
  box.innerHTML = `
    <div class="panel calc-ctl">
      <div class="field"><label>查詢項目</label><select id="rMode">${Object.entries(MODES).map(([k, v]) => `<option value="${k}" ${k === st.mode ? "selected" : ""}>${v}</option>`).join("")}</select></div>
      <div class="field"><label>鋼筋降伏強度 fy</label><select id="rFy">${[[2800, "SD280（2800）"], [4200, "SD420（4200）"], [4900, "SD490（4900）"]].map(([v, l]) => `<option value="${v}" ${v === st.fy ? "selected" : ""}>${l} kgf/cm²</option>`).join("")}</select></div>
      <details${st.pt !== 1 || st.pe !== 1 || st.cond !== "A" ? " open" : ""}><summary>進階條件（上層筋、環氧塗布、間距）</summary>
      <div class="field"><label>澆置位置 ψt</label><select id="rPt"><option value="1" ${st.pt === 1 ? "selected" : ""}>一般（1.0）</option><option value="1.3" ${st.pt === 1.3 ? "selected" : ""}>上層筋：其下混凝土厚 &gt; 30 cm（1.3）</option></select></div>
      <div class="field"><label>鋼筋塗布 ψe</label><select id="rPe"><option value="1" ${st.pe === 1 ? "selected" : ""}>無塗布（1.0）</option><option value="1.2" ${st.pe === 1.2 ? "selected" : ""}>環氧塗布，保護層 ≥ 3db 且淨距 ≥ 6db（1.2）</option><option value="1.5" ${st.pe === 1.5 ? "selected" : ""}>環氧塗布，其他情況（1.5）</option></select></div>
      <div class="field"><label>間距與保護層條件（直線受拉用）</label><select id="rCond"><option value="A" ${st.cond === "A" ? "selected" : ""}>淨間距 ≥ db、保護層 ≥ db 且箍筋符合最小量</option><option value="B" ${st.cond === "B" ? "selected" : ""}>其他情況（較保守）</option></select></div>
      </details>
    </div>
    <div class="panel" id="rOut"></div>
    <div class="legend" style="margin:0 12px 12px">⚠ 這是<b>估算基準值</b>，不能取代設計圖說。公式係數依 ACI 318 簡化式換算，<b>尚未對照現行土木401 規範原文逐條核對</b>，請由結構技師確認後使用；實際施工以結構圖說標示為準。</div>`;
  const draw = () => {
    st.mode = $("#rMode").value; st.fy = +$("#rFy").value; st.pt = +$("#rPt").value; st.pe = +$("#rPe").value; st.cond = $("#rCond").value;
    const o = { pt: st.pt, pe: st.pe, cond: st.cond };
    $("#rOut").innerHTML = `<h2>${MODES[st.mode]}（cm）</h2>
      <div class="tblwrap"><table class="ct"><tr><th>鋼筋</th>${FCS.map(f => `<th>f'c<br>${f}</th>`).join("")}</tr>
      ${BARS.map(([n, d, db]) => `<tr><th>${n}<br><small>${d}</small></th>${FCS.map(fc => `<td>${Math.ceil(rebarLen(st.mode, db, fc, st.fy, o) - 1e-9)}</td>`).join("")}</tr>`).join("")}</table></div>
      <p class="cnote">數值為無條件進位到整數 cm。單位：f'c、fy 為 kgf/cm²；λ = 1（常重混凝土）；#號後為對應的 D 號。<br><b>公式：</b>${FORMULA[st.mode](o)}</p>`;
  };
  box.querySelector(".calc-ctl").oninput = draw; draw();
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

/* ---------- 分頁 ---------- */
const CALC_TABS = [["rebar", "鋼筋長度", tabRebar], ["vol", "混凝土方數", tabVolume], ["slope", "坡度高程", tabSlope], ["area", "坪與才", tabArea]];
function renderCalc(tab) {
  const cur = CALC_TABS.find(t => t[0] === tab) || CALC_TABS[0];
  view.innerHTML = `<h2 class="t">🧮 工程計算機</h2>
    <div class="chips">${CALC_TABS.map(([k, l]) => `<a class="chip ${k === cur[0] ? "on" : ""}" href="#/calc/${k}" style="display:inline-flex;align-items:center;text-decoration:none">${l}</a>`).join("")}</div>
    <div id="calcBox"></div>`;
  cur[2]($("#calcBox"));
}
