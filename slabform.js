"use strict";
/* 板模板支撐檢核（結構計算的「板模板」分頁，另有 A4 計算書 #/struct/slab/sheet）
   傳力路徑：單位面積載重 N → 襯板 → 第一層大格柵 → 第二層大格柵 → 鋼管支撐。
   ‧載重（預設值取自使用者指定的參考網站，2026-11-14 讀取，非規範原文，皆可修改）：
     N1 固定載重 = Wo × 板厚（Wo 2.3 t/m³）、N2 衝擊載重 = 0.5 × N1、N3 作業載重 150 kgf/m²、N4 模板自重 15 kgf/m²，N = N1 + N2 + N3 + N4。
   ‧構件（colMember，COL_METHODS 預設參考網站算法）：
     襯板 L = L1（100 cm 寬板帶，w = N × 100）；第一層大格柵 w = N × L1、跨距 L2；第二層大格柵 w = N × L2、跨距 L3。
   ‧鋼管支撐：P = N × L2 × L3，λ = KL/r（K = 1），容許壓應力 Fa 用容許應力法柱公式（wfFa，牆模板共用），fc = P / A。
     支撐長 L 三種：樓高 − 板厚／再扣襯板與兩層格柵高／手動輸入。
   ‧材料庫、樹種、內建斷面與柱模板、牆模板共用（colform.js）；鋼管規格與挫曲公式與牆模板單面模共用（wallform.js）。
   ‧單位：長度 cm、力 kgf、應力 kgf/cm²；Wo 用 t/m³，N3、N4 用 kgf/m²。 */

const SF_MEMBERS = [
  { k: "ply", n: "襯板", kind: "ply", span: "L1", trib: null },
  { k: "w1", n: "第一層大格柵", kind: "beam", span: "L2", trib: "L1" },
  { k: "w2", n: "第二層大格柵", kind: "beam", span: "L3", trib: "L2" }
];
const SF_GAPS = [["L1", "第一層大格柵間距 L1"], ["L2", "第二層大格柵間距 L2（＝鋼管垂直第二層大格柵方向的間距）"], ["L3", "鋼管支撐沿第二層大格柵方向的間距 L3"]];
const SF_LMODES = [["net", "樓層高度 − 板厚"], ["stack", "樓層高度 − 板厚 − 襯板與兩層格柵高"], ["man", "自行輸入"]];
const SF_LOAD_DEF = { wo: "2.3", imp: "0.5", work: "150", self: "15" };   // 參考網站：Wo 0.0023 kg/cm³、N2 = 0.5N1、N3 0.015、N4 0.0015 kg/cm²

const sfBlank = () => ({
  info: { proj: "", loc: "", no: "", H: "", t: "", who: "" },
  ...SF_LOAD_DEF, meth: "r", spans: "3", species: "c3", lmode: "net", Lu: "",
  pipe: { D: "4.86", t: "0.24" }, defP: { n: "", a: "3" }, defB: { n: "", a: "" },
  sel: { ply: "p_ply15", w1: "p_b9045", w2: "p_b9045" }, gap: { L1: "", L2: "", L3: "" }
});
function sfLoad() {
  const d = sfBlank();
  let s; try { s = JSON.parse(ls.get("calcSlabForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s); pick(d.pipe, s.pipe); pick(d.defP, s.defP); pick(d.defB, s.defB); pick(d.sel, s.sel); pick(d.gap, s.gap);
  if (!SF_LMODES.some(([k]) => k === d.lmode)) d.lmode = "net";
  return d;
}
const sfSave = st => { ls.set("calcSlabForm", JSON.stringify(st)); svKept(); };

/* ---------- 計算 ---------- */
// 構件受力方向的深度（算支撐長用）：襯板取板厚，矩形取 h，其他取填寫的 h；不知道時為 NaN
const sfDepth = m => !m ? NaN : m.sect === "t" ? colF(m.t) : colF(m.h);
function sfCalc(st, lib = colLib()) {
  const H = colF(st.info.H), t = colF(st.info.t);
  const N1 = colF(st.wo) * t / 1000, N2 = colF(st.imp) * N1, N3 = colF(st.work) / 10000, N4 = colF(st.self) / 10000;   // kgf/cm²
  const N = N1 + N2 + N3 + N4;
  const sp = COL_SPECIES.find(x => x.id === st.species);
  const mat = k => { const m = lib.find(p => p.id === st.sel[k]); if (!m) return m;
    if (m.wood) return { ...m, fb: sp?.fb || "", fv: sp?.fv || "", E: sp?.E || "", spn: sp?.n || "未選樹種" };
    if (m.steel) return { ...m, fb: COL_STEEL.fb, fv: COL_STEEL.fv, E: COL_STEEL.E, spn: "鋼材" };
    return m; };
  const meth = colMeth(st);
  const gap = { L1: colF(st.gap.L1), L2: colF(st.gap.L2), L3: colF(st.gap.L3) };
  const mems = SF_MEMBERS.map(x => colMember(x, mat(x.k), gap[x.span], x.trib ? gap[x.trib] : 100, N, meth, NaN, x.kind === "ply" ? st.defP : st.defB));
  // 鋼管支撐
  const stack = ["ply", "w1", "w2"].map(k => sfDepth(mat(k)));
  const L = st.lmode === "man" ? colF(st.Lu) : st.lmode === "stack" ? H - t - stack.reduce((a, b) => a + b, 0) : H - t;
  const pipe = wfPipeSect(st.pipe), P = N * gap.L2 * gap.L3, lam = pipe && L > 0 ? L / pipe.r : NaN;
  const f = wfFa(lam, colF(COL_STEEL.fy), colF(COL_STEEL.E));
  const sup = { t: "壓應力 fc", v: pipe && L > 0 ? P / pipe.A : NaN, a: f.Fa, u: "kgf/cm²", d: 1 };
  const all = [...mems.flatMap(m => m.checks), sup];
  return { H, t, N1, N2, N3, N4, N, mat, sp, meth, gap, mems, stack, L, pipe, P, lam, ...f, sup,
    ng: all.filter(x => colJudge(x)[1] === "bad").length, miss: all.filter(x => colJudge(x)[1] === "").length };
}
const sfLText = (st, r, f) => st.lmode === "man" ? `L = ${f(r.L, 1)} cm（手動輸入）`
  : st.lmode === "stack" ? `L = 樓層高度 − 板厚 − 襯板 − 第一層 − 第二層大格柵 = ${f(r.H, 1)} − ${f(r.t, 1)} − ${r.stack.map(x => f(x, 1)).join(" − ")} = ${f(r.L, 1)} cm`
  : `L = 樓層高度 − 板厚 = ${f(r.H, 1)} − ${f(r.t, 1)} = ${f(r.L, 1)} cm`;
const sfLoadText = (st, r, f) => `N1 = Wo × 板厚 = ${esc(st.wo)} t/m³ × ${f(r.t, 1)} cm = ${f(r.N1, 4)}；N2 = ${esc(st.imp)} × N1 = ${f(r.N2, 4)}；N3 作業載重 ${esc(st.work)} kgf/m² = ${f(r.N3, 4)}；N4 模板自重 ${esc(st.self)} kgf/m² = ${f(r.N4, 4)}；N = N1 + N2 + N3 + N4 = ${f(r.N, 4)} kgf/cm²`;

/* ---------- 示意圖：平面＋剖面 ---------- */
function sfLayoutSvg(r) {
  const { L1, L2, L3 } = r.gap;
  if (!(L1 > 0 && L2 > 0 && L3 > 0)) return `<p class="cnote">填好 L1、L2、L3 後，這裡會畫出配置示意圖。</p>`;
  const nx = 3, ny = 3, Wx = nx * L3, Wy = ny * L2, pw = 250, k = pw / Math.max(Wx, Wy), x0 = 30, y0 = 18;
  const X = x => x0 + x * k, Yp = y => y0 + y * k, out = [], cap = 200;
  // 平面：第一層大格柵（沿 y，間距 L1）、第二層大格柵（沿 x，間距 L2）、鋼管（L3 × L2）
  const n1 = Math.min(cap, Math.floor(Wx / L1 + 1e-9));
  for (let i = 0; i <= n1; i++) out.push(`<line x1="${X(i * L1).toFixed(1)}" x2="${X(i * L1).toFixed(1)}" y1="${Yp(-L2 / 3).toFixed(1)}" y2="${Yp(Wy + L2 / 3).toFixed(1)}" stroke="currentColor" stroke-width="1" opacity=".7"/>`);
  for (let j = 0; j <= ny; j++) out.push(`<rect x="${X(-L3 / 3).toFixed(1)}" y="${(Yp(j * L2) - 1.8).toFixed(1)}" width="${((Wx + L3 * 2 / 3) * k).toFixed(1)}" height="3.6" fill="currentColor"/>`);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out.push(`<rect x="${(X(i * L3) - 4).toFixed(1)}" y="${(Yp(j * L2) - 4).toFixed(1)}" width="8" height="8" class="sfpost" stroke="currentColor" stroke-width="1.6"/>`);
  const dim = (xa, xb, y, lab) => `<line x1="${X(xa).toFixed(1)}" x2="${X(xb).toFixed(1)}" y1="${y}" y2="${y}" stroke="currentColor" stroke-width=".8"/><text x="${((X(xa) + X(xb)) / 2).toFixed(1)}" y="${y - 3}" text-anchor="middle">${lab}</text>`;
  const ph = Wy * k, planB = y0 + ph + L2 / 3 * k;
  const g = `<g font-size="10" fill="currentColor">${dim(0, L3, 10, "L3")}
    <line x1="${x0 - 14}" x2="${x0 - 14}" y1="${Yp(0).toFixed(1)}" y2="${Yp(L2).toFixed(1)}" stroke="currentColor" stroke-width=".8"/><text x="${x0 - 17}" y="${((Yp(0) + Yp(L2)) / 2 + 3).toFixed(1)}" text-anchor="end">L2</text>
    ${n1 >= 1 ? dim(0, L1, planB + 12, "L1") : ""}</g>`;
  // 剖面（沿第二層大格柵方向）：板、襯板、第一層大格柵（小方塊，間距 L1）、第二層大格柵、鋼管、地面
  const sy = planB + 46, sh = 160, slabH = 12, plyH = 5, w1H = 9, w2H = 9, posH = sh - slabH - plyH - w1H - w2H, top = sy;
  const sec = [`<rect x="${X(-L3 / 3).toFixed(1)}" y="${top}" width="${((Wx + L3 * 2 / 3) * k).toFixed(1)}" height="${slabH}" fill="currentColor" fill-opacity=".25"/>`,
    `<rect x="${X(-L3 / 3).toFixed(1)}" y="${top + slabH}" width="${((Wx + L3 * 2 / 3) * k).toFixed(1)}" height="${plyH}" fill="currentColor" fill-opacity=".6"/>`];
  for (let i = 0; i <= n1; i++) sec.push(`<rect x="${(X(i * L1) - 3).toFixed(1)}" y="${top + slabH + plyH}" width="6" height="${w1H}" fill="currentColor"/>`);
  sec.push(`<rect x="${X(-L3 / 3).toFixed(1)}" y="${top + slabH + plyH + w1H}" width="${((Wx + L3 * 2 / 3) * k).toFixed(1)}" height="${w2H}" fill="currentColor" fill-opacity=".8"/>`);
  const pt = top + slabH + plyH + w1H + w2H, gy = pt + posH;
  for (let i = 0; i <= nx; i++) sec.push(`<line x1="${X(i * L3).toFixed(1)}" x2="${X(i * L3).toFixed(1)}" y1="${pt}" y2="${gy}" stroke="currentColor" stroke-width="2.2"/>`);
  sec.push(`<line x1="${X(-L3 / 3).toFixed(1)}" x2="${X(Wx + L3 / 3).toFixed(1)}" y1="${gy}" y2="${gy}" stroke="currentColor"/>`);
  const right = X(Wx + L3 / 3) + 6;
  const mids = [top + slabH / 2, top + slabH + plyH / 2, top + slabH + plyH + w1H / 2, top + slabH + plyH + w1H + w2H / 2];
  const labs = [`樓板 ${fmt(r.t, 1)} cm`, "襯板", "第一層大格柵", "第二層大格柵"];
  sec.push(`<g font-size="9" fill="currentColor">${labs.map((l, i) => { const ly = top + 2 + i * 12; return `<line x1="${right - 4}" x2="${right + 6}" y1="${mids[i].toFixed(1)}" y2="${ly + 4}" stroke="currentColor" stroke-width=".6"/><text x="${right + 8}" y="${ly + 7}">${l}</text>`; }).join("")}
    <text x="${right + 8}" y="${((pt + gy) / 2 + 12).toFixed(1)}">鋼管 L ${fmt(r.L, 1)} cm</text></g>`);
  const W = right + 84, Ht = gy + 24;
  return `<svg class="cfsvg sflay" viewBox="0 0 ${W.toFixed(0)} ${Ht.toFixed(0)}" role="img" aria-label="板模板支撐配置示意圖">${out.join("")}${g}${sec.join("")}
    <g font-size="10" fill="currentColor"><text x="${x0}" y="${(planB + 30).toFixed(1)}">平面（□ 鋼管、粗線 第二層大格柵、細線 第一層大格柵）</text><text x="${x0}" y="${gy + 16}">剖面（沿第二層大格柵方向，高度不依比例）</text></g></svg>
    <p class="cnote" style="margin-top:0">依輸入的間距畫出 3 × 3 個鋼管間隔的範圍，供核對配置用。</p>`;
}

/* ---------- 畫面 ---------- */
function tabSlabForm(box) {
  const st = sfLoad();
  let lib = colLib();
  const inp = (path, val, ph = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const matOpts = (kind, cur) => `<option value="">請選擇</option>${lib.filter(p => p.kind === kind).map(p => `<option value="${esc(p.id)}" ${p.id === cur ? "selected" : ""}>${esc(p.n || "（未命名）")}</option>`).join("")}`;
  const sel = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const draw = () => {
    const pipeSel = WF_PIPES.find(p => p.D === st.pipe.D && p.t === st.pipe.t)?.id || "";
    box.innerHTML = `
      <div class="cfsteps"><a href="#sf1">1 基本資料</a><a href="#sf2">2 材料規格</a><a href="#sf3">3 配置條件</a><a href="#sf4">4 檢核結果</a></div>
      <section class="panel" id="sf1"><h2><span class="cfno">1</span>基本資料</h2>
        <div class="grid2">
          <div class="field"><label>位置／樓層</label><input data-p="info.loc" value="${esc(st.info.loc)}" placeholder="例：二樓頂版"></div>
          <div class="field"><label>構件編號</label><input data-p="info.no" value="${esc(st.info.no)}" placeholder="例：S1"></div>
          <div class="field"><label>樓層高度（cm）</label>${inp("info.H", st.info.H, "例：350")}</div>
          <div class="field"><label>板厚（cm）</label>${inp("info.t", st.info.t, "例：15")}</div>
          <div class="field"><label>計算人員</label><input data-p="info.who" value="${esc(st.info.who)}"></div>
        </div>
        <h3 class="cfh">載重</h3>
        <div class="grid2">
          <div class="field"><label>混凝土單位重 Wo（t/m³）</label>${inp("wo", st.wo)}</div>
          <div class="field"><label>衝擊載重係數（× N1）</label>${inp("imp", st.imp)}</div>
          <div class="field"><label>作業載重 N3（kgf/m²）</label>${inp("work", st.work)}</div>
          <div class="field"><label>模板自重 N4（kgf/m²）</label>${inp("self", st.self)}</div>
        </div>
        <div id="sfLoad"></div>
        <p class="cnote">N = N1 固定載重（Wo × 板厚）＋ N2 衝擊載重（係數 × N1）＋ N3 作業載重 ＋ N4 模板自重。預設值（2.3、0.5、150、15）取自你指定的參考網站，非規範原文；採用的載重請依施工規範與契約。</p>
        <div class="row"><button type="button" class="sec" id="sfLoadDef">載重恢復預設值</button></div></section>
      <section class="panel" id="sf2"><h2><span class="cfno">2</span>材料規格</h2>
        <div class="grid2">
          <div class="field"><label>木材樹種（襯板及木角材）</label><select data-p="species"><option value="">請選擇</option>${COL_SPECIES.map(x => `<option value="${x.id}" ${st.species === x.id ? "selected" : ""}>${x.n}</option>`).join("")}</select></div>
          <div class="field"><label>襯板撓度檢核標準</label><select id="sfDefP">${COL_DEFP.map(([v, l]) => `<option value="${v}" ${v === (st.defP.a === "3" && !st.defP.n ? "a3" : st.defP.n === "240" && !st.defP.a ? "n240" : "") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          ${SF_MEMBERS.map(x => `<div class="field"><label>${x.n}</label><select data-p="sel.${x.k}" data-kind="${x.kind}">${matOpts(x.kind, st.sel[x.k])}</select></div>`).join("")}
          <div class="field"><label>鋼管支撐</label><select id="sfPipe">${WF_PIPES.map(p => `<option value="${p.id}" ${p.id === pipeSel ? "selected" : ""}>${p.n}</option>`).join("")}<option value="" ${pipeSel ? "" : "selected"}>自訂</option></select></div>
          <div class="field"><label>鋼管外徑 D（cm）</label>${inp("pipe.D", st.pipe.D)}</div>
          <div class="field"><label>鋼管厚度 t（cm）</label>${inp("pipe.t", st.pipe.t)}</div>
          <div class="field"><label>構件計算方式</label>${sel("meth", Object.entries(COL_METHODS).map(([k, x]) => [k, x.n]), st.meth)}</div>
          <div class="field"><label>格柵連續跨數</label>${sel("spans", COL_SPAN_OPTS, st.spans)}</div>
          <div class="field"><label>襯板撓度限制 L／?</label>${inp("defP.n", st.defP.n, "可空白")}</div>
          <div class="field"><label>襯板撓度上限（mm）</label>${inp("defP.a", st.defP.a, "可空白")}</div>
          <div class="field"><label>格柵撓度限制 L／?</label>${inp("defB.n", st.defB.n, "可空白")}</div>
          <div class="field"><label>格柵撓度上限（mm）</label>${inp("defB.a", st.defB.a, "可空白")}</div>
        </div>
        <p class="cnote">撓度兩個都填時取較嚴者。內建木料的容許應力與 E 值依所選樹種、鋼角材與鋼管依鋼材；鋼管的容許壓應力由細長比計算（Fy、E 依鋼材參考值）。</p>
        <details class="cflibbox"><summary>材料參數與斷面資料</summary>
          ${colRefHtml(st.species, (() => { const q = wfPipeSect(WF_PIPES[0]); return `<h3 class="cfh">鋼管支撐</h3><div class="tblwrap"><table class="ct cfref"><tr><th>規格</th><th>A<br><small>cm²</small></th><th>I<br><small>cm⁴</small></th><th>S<br><small>cm³</small></th><th>r<br><small>cm</small></th></tr><tr><th>${WF_PIPES[0].n}</th><td>${fmt(q.A, 3)}</td><td>${fmt(q.I, 3)}</td><td>${fmt(q.S, 3)}</td><td>${fmt(q.r, 3)}</td></tr></table></div>`; })())}
          <h3 class="cfh">自建材料</h3>
          <p class="cnote" style="margin-top:0">與柱模板、牆模板共用。內建以外的材料可在這裡新增，容許值請依材料規格填寫；資料存在這支手機。</p>
          <div id="sfLib">${lib.filter(p => !p.preset).map(colLibCard).join("")}</div>
          <div class="row">${["ply", "beam"].map(k => `<button type="button" class="sec" data-ladd="${k}">＋ ${{ ply: "襯板", beam: "格柵材" }[k]}</button>`).join("")}</div></details></section>
      <section class="panel" id="sf3"><h2><span class="cfno">3</span>配置條件（cm）</h2>
        <div class="grid2">${SF_GAPS.map(([k, l]) => `<div class="field"><label>${l}</label>${inp("gap." + k, st.gap[k])}</div>`).join("")}
          <div class="field"><label>鋼管支撐長 L</label>${sel("lmode", SF_LMODES, st.lmode)}</div>
          ${st.lmode === "man" ? `<div class="field"><label>最大未支撐長度 L（cm）</label>${inp("Lu", st.Lu, "例：有水平繫材時填繫材間距")}</div>` : ""}
        </div>
        <p class="cnote">鋼管支撐在兩個方向的間距為 L3（沿第二層大格柵）× L2（第二層大格柵間距）。${st.lmode === "stack" ? "扣除的高度：襯板取板厚，格柵取所選斷面的高 h；自建材料若沒有 h 會無法計算，請改用其他方式。" : st.lmode === "man" ? "有水平繫材時，可填繫材之間的最大未支撐長度。" : ""}支撐長的取法與挫曲長度係數（K = 1）請依實際構造確認。</p>
        <h3 class="cfh">板模板支撐配置示意圖</h3><div id="sfLay"></div></section>
      <section class="panel" id="sf4"><h2><span class="cfno">4</span>檢核結果</h2><div id="sfRes"></div>
        <div class="row"><a class="btnlink" href="#/struct/slab/sheet" id="sfSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="sfClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁只做數值計算：各構件視為均布載重的梁，鋼管支撐以軸壓檢核挫曲。載重、容許值由你輸入或取自參考資料，結果僅供施工規劃參考；模板支撐的安全仍應依施工規範、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    sfSave(st);
    const r = sfCalc(st, lib);
    $("#sfLoad").innerHTML = `<div class="big"><span>單位面積載重 N</span><b>${fmt(r.N, 4)} kgf/cm²<small style="display:block;font-size:12px;font-weight:500;color:var(--mut)">＝ ${fmt(r.N * 10000, 0)} kgf/m²</small></b></div>`;
    $("#sfLay").innerHTML = sfLayoutSvg(r);
    const cell = c => { const [j, cls] = colJudge(c); return Number.isFinite(c.v) ? `<td class="${cls}">${c.a > 0 ? fmt(c.v / c.a, 2) : fmt(c.v, c.d)}<small>${c.a > 0 ? j : c.u}</small></td>` : `<td>—</td>`; };
    const row = (n, c, first) => `<tr><th>${first ? n + "<br>" : ""}<small>${c.t}</small></th><td>${fmt(c.v, c.d)}<small>${c.u}</small></td><td>${c.a > 0 ? fmt(c.a, c.d) : "—"}</td>${cell(c)}</tr>`;
    const big = c => `<div class="big"><span>${c.t}</span><b>${fmt(c.v, c.d)}${c.a > 0 ? ` ／ ${fmt(c.a, c.d)}` : ""} ${c.u} <em class="cfj ${colJudge(c)[1]}">${colJudge(c)[0]}</em></b></div>`;
    $("#sfRes").innerHTML = `<div class="big"><span>總結</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過容許值</em>` : r.miss ? `<span style="font-size:15px;color:var(--mut)">還有 ${r.miss} 項未完成（缺尺寸、間距、材料或容許值）</span>` : `<em class="cfj ok">全部在容許值以內</em>`}</b></div>
      <div class="tblwrap"><table class="ct cfres"><tr><th>構件</th><th>計算值</th><th>容許值</th><th>比值</th></tr>
        ${r.mems.map(m => m.checks.map((c, i) => row(m.x.n, c, !i)).join("")).join("")}${row("鋼管支撐", r.sup, true)}</table></div>
      <p class="cnote">比值 = 計算值 ÷ 容許值，≤ 1 為 OK。N = ${fmt(r.N, 4)} kgf/cm²。</p>
      <details class="cfdet"><summary>計算明細</summary>
        <p class="cfdh">載重：${sfLoadText(st, r, fmt)}</p>
        ${r.mems.map(m => `<p class="cfdh">${colMemText(m, fmt)}</p>${m.checks.map(big).join("")}`).join("")}
        <p class="cfdh">鋼管支撐：P = N × L2 × L3 = ${fmt(r.N, 4)} × ${fmt(r.gap.L2, 1)} × ${fmt(r.gap.L3, 1)} = ${fmt(r.P, 1)} kgf<br>
          ${sfLText(st, r, fmt)}；A = ${fmt(r.pipe?.A, 3)} cm²、r = ${fmt(r.pipe?.r, 3)} cm<br>
          λ = KL ÷ r = ${fmt(r.lam, 1)}（K = 1）；Cc = ${fmt(r.Cc, 1)}，採${r.inel ? "非彈性" : "彈性"}挫曲公式；fc = P ÷ A</p>${big(r.sup)}</details>`;
  };
  const refreshSelects = () => box.querySelectorAll("select[data-kind]").forEach(s => { s.innerHTML = matOpts(s.dataset.kind, st.sel[s.dataset.p.split(".")[1]]); });
  const redrawKeep = () => { draw(); box.querySelector(".cflibbox").open = true; };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = () => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      o[last] = el.value;
      if (el.dataset.p === "lmode") return draw();
      if (el.dataset.p.startsWith("pipe.")) { const s = $("#sfPipe"); if (s) s.value = WF_PIPES.find(p => p.D === st.pipe.D && p.t === st.pipe.t)?.id || ""; }
      calc();
    });
    box.querySelectorAll("[data-l]").forEach(el => el.oninput = el.onchange = () => {
      const p = lib.find(x => x.id === el.dataset.l); if (!p) return; p[el.dataset.lk] = el.value; colLibSave(lib);
      if (el.dataset.lk === "sect") return redrawKeep();
      if (el.dataset.lk === "n") refreshSelects();
      calc();
    });
    box.querySelectorAll("[data-ladd]").forEach(b => b.onclick = () => {
      const p = colNewMat(b.dataset.ladd); lib.push(p); colLibSave(lib); redrawKeep();
      box.querySelector(`[data-card="${p.id}"] input`)?.focus();
    });
    box.querySelectorAll("[data-ldel]").forEach(b => b.onclick = () => {
      const p = lib.find(x => x.id === b.dataset.ldel); if (!p || !confirm(`刪除材料「${p.n || "未命名"}」？（柱模板、牆模板也會一併刪除）`)) return;
      lib = lib.filter(x => x !== p); colLibSave(lib); for (const k in st.sel) if (st.sel[k] === p.id) st.sel[k] = ""; redrawKeep();
    });
    $("#sfDefP").onchange = e => { const v = e.target.value; if (!v) return; st.defP = v === "a3" ? { n: "", a: "3" } : { n: "240", a: "" }; box.querySelector('[data-p="defP.n"]').value = st.defP.n; box.querySelector('[data-p="defP.a"]').value = st.defP.a; calc(); };
    $("#sfPipe").onchange = e => { const p = WF_PIPES.find(x => x.id === e.target.value); if (!p) return; st.pipe = { D: p.D, t: p.t }; box.querySelector('[data-p="pipe.D"]').value = p.D; box.querySelector('[data-p="pipe.t"]').value = p.t; calc(); };
    $("#sfLoadDef").onclick = () => { Object.assign(st, SF_LOAD_DEF); for (const k in SF_LOAD_DEF) box.querySelector(`[data-p="${k}"]`).value = SF_LOAD_DEF[k]; calc(); };
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#sfClear").onclick = () => { if (!confirm("清除板模板的輸入？（材料庫會保留）")) return; Object.assign(st, sfBlank()); draw(); };
    $("#sfSheet").onclick = e => { e.preventDefault(); location.hash = "#/struct/slab/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderSlabSheet() {
  const st = sfLoad(), r = sfCalc(st), company = siteCompany(siteId);
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const crow = c => { const [j] = colJudge(c); return `<tr><td>${c.t}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${c.a > 0 ? v(c.a, c.d) : "—"}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${j}</td></tr>`; };
  const matRow = (label, m) => `<tr><td>${label}</td><td colspan="3">${m ? esc(m.n || "未命名") + (colSectText(m) ? "：" + esc(colSectText(m)) : "") + `${m.wood ? `；${esc(m.spn)}` : ""}；fb ${esc(m.fb) || "—"}、fv ${esc(m.fv) || "—"}、E ${esc(m.E) || "—"} kgf/cm²` : "未選擇"}</td></tr>`;
  const lim = d => [d.n ? "L/" + esc(d.n) : "", d.a ? esc(d.a) + " mm" : ""].filter(Boolean).join("、") || "未填";
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="sfBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">板模板支撐計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置／樓層</td><td>${esc(st.info.loc)}</td><td>構件編號</td><td>${esc(st.info.no)}</td></tr>
        <tr><td>樓層高度</td><td>${esc(st.info.H)} cm</td><td>板厚</td><td>${esc(st.info.t)} cm</td></tr>
        <tr><td>單位面積載重</td><td colspan="3">${sfLoadText(st, r, v)}</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="4">二、材料規格</th></tr>
        <tr><td>計算方式</td><td colspan="3">${colMethText(st)}</td></tr>
        ${SF_MEMBERS.map(x => matRow(x.n, r.mat(x.k))).join("")}
        <tr><td>鋼管支撐</td><td colspan="3">圓管 D${esc(st.pipe.D)} × t${esc(st.pipe.t)} cm：A ${v(r.pipe?.A, 3)} cm²、I ${v(r.pipe?.I, 3)} cm⁴、r ${v(r.pipe?.r, 3)} cm；Fy ${COL_STEEL.fy}、E ${COL_STEEL.E} kgf/cm²</td></tr>
        <tr><td>撓度限制</td><td colspan="3">襯板：${lim(st.defP)}；格柵：${lim(st.defB)}</td></tr>
        <tr><td colspan="4" style="font-size:9pt">載重預設值、木材與鋼材容許應力、內建斷面及鋼管規格依使用者提供之參考資料（非規範原文）。</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="2">三、配置條件</th></tr>
        ${SF_GAPS.map(([k, l]) => `<tr><td>${l}</td><td class="c">${v(r.gap[k], 1)} cm</td></tr>`).join("")}
        <tr><td>鋼管支撐長 L</td><td class="c">${v(r.L, 1)} cm（${esc(SF_LMODES.find(([k]) => k === st.lmode)[1])}）</td></tr>
      </table>
      <figure class="cffig">${sfLayoutSvg(r)}</figure>
      <table class="pt">
        <tr><th colspan="6">四、構件檢核（N = ${v(r.N, 4)} kgf/cm²）</th></tr>
        <tr><th>項目</th><th>計算值</th><th>容許值</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${r.mems.map(m => `<tr><td colspan="6">${colMemText(m, v)}</td></tr>${m.checks.map(crow).join("")}`).join("")}
        <tr><td colspan="6">鋼管支撐：P = N × L2 × L3 = ${v(r.P, 1)} kgf；${sfLText(st, r, v)}；λ = KL／r = ${v(r.lam, 1)}（K = 1），Cc = ${v(r.Cc, 1)}，採${r.inel ? "非彈性" : "彈性"}挫曲公式求 Fa；fc = P／A</td></tr>${crow(r.sup)}
      </table>
      <table class="pt"><tr><th>檢核結果</th><td>${r.ng ? `${r.ng} 項超過容許值` : r.miss ? `尚有 ${r.miss} 項未完成` : "全部在容許值以內"}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：構件以均布載重之梁計算，鋼管支撐以軸壓檢核挫曲。載重、材料容許值、撓度限制與支撐長由計算人員依材料規格、施工規範與契約確認，本計算書僅供施工規劃參考。計算日期：${esc(rocYmd(today()))}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#sfBack").onclick = () => goBack("#/struct/slab");
  $("#pvPrint").onclick = doPrint;
}

STRUCT_TABS.push(["slab", "板模板", tabSlabForm]);
