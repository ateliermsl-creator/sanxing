"use strict";
/* 排架（以框式施工架當樓板支撐）結構計算（結構計算的「排架」分頁，另有 A4 計算書 #/struct/row/sheet）
   參考網站 realizcalc.com「排架結構計算」（2026-11-14 讀取 row-assets/load-plan.js）：
   ‧單跨單排代表單元：每片立架兩腳均分。單跨自重同施工架（scaffold.js 的自重表），排架不另加額外靜載。
   ‧每支主柱 D = 單跨自重 × 層數 ÷ 2 ＋ 支撐靜載 qd × 跨距 × 立架寬 ÷ 2（qd = 板厚 × 混凝土單位重 ＋ 額外靜載，或直接輸入）。
   ‧活載 q = max(輸入值, 最小活載, 最小總載 − qd)；參考網站最小值取 ACI 347R-14 4.2.1 的 2.4 kPa、4.8 kPa，
     這裡當成可修改的預設值（非規範原文，清空即不套用）。L = q × 跨距 × 立架寬 ÷ 2。
   ‧地震：不考慮／直接輸入 Ch（Cv = 比例 × Ch，參考網站直接模式 0.5）；Ev = Cv × D。
   ‧組合：1.4D、1.2D＋1.6L；有地震再加 1.2D＋0.5L＋Ev、0.9D＋Ev。主柱以極限設計法柱公式檢核（同 scaffold.js 的 scFcr）。
   ‧單位：cm、kgf、kgf/m²、MPa。 */

const RF_KPA = 1000 / 9.80665;   // kPa → kgf/m²
const rfBlank = () => ({
  info: { proj: "", loc: "", who: "" }, levels: "3",
  frame: { w: "91.4", h: "172.5", kg: "15.55" }, col: { D: "4.27", t: "0.25", fy: "355", E: "200000", K: "1", L: "" },
  span: "182.9", brKg: "2.14", brN: "4", railKg: "1.28", railN: "2", deckKg: "11.17", deckN: "1", miscKg: "5",
  dmode: "slab", slab: "20", gam: "2400", other: "0", qd: "", q: "250", minL: "2.4", minT: "4.8",
  eq: "none", ch: "", cvr: "0.5", phic: "0.85"
});
function rfLoad() {
  const d = rfBlank();
  let s; try { s = JSON.parse(ls.get("calcRowForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s); pick(d.frame, s.frame); pick(d.col, s.col);
  if (!["slab", "direct"].includes(d.dmode)) d.dmode = "slab";
  if (!["none", "direct"].includes(d.eq)) d.eq = "none";
  return d;
}
const rfSave = st => { ls.set("calcRowForm", JSON.stringify(st)); svKept(); };

function rfCalc(st) {
  const F = colF, levels = Math.round(F(st.levels)), fw = F(st.frame.w), fh = F(st.frame.h), span = F(st.span);
  const parts = [["立架", F(st.frame.kg), 1], ["交叉拉桿", F(st.brKg), F(st.brN)], ["水平拉桿", F(st.railKg), F(st.railN)], ["水平踏板", F(st.deckKg), F(st.deckN)], ["另件", F(st.miscKg), 1]]
    .map(([n, kg, c]) => ({ n, kg, c, sum: kg * c }));
  const panel = parts.reduce((a, p) => a + p.sum, 0);
  const geomOK = levels >= 1 && levels <= 30 && fw > 0 && fh > 0 && span > 0;
  const area = geomOK ? span / 100 * fw / 100 : NaN, Hs = geomOK ? levels * fh : NaN;
  const qc = F(st.slab) / 100 * F(st.gam);
  const qd = st.dmode === "slab" ? qc + F(st.other) : F(st.qd);
  const minL = st.minL === "" ? 0 : F(st.minL) * RF_KPA, minT = st.minT === "" ? 0 : F(st.minT) * RF_KPA;
  const q = Math.max(F(st.q), minL, minT - qd);
  const frameD = panel * levels / 2, topD = qd * area / 2, D = frameD + topD, L = q * area / 2;
  const quake = st.eq === "direct", cv = F(st.ch) * F(st.cvr), Ev = quake ? cv * D : 0;
  const combos = [{ id: "C1", n: "1.4D", N: 1.4 * D }, { id: "C2", n: "1.2D＋1.6L", N: 1.2 * D + 1.6 * L }];
  if (quake) combos.push({ id: "C4", n: "1.2D＋0.5L＋Ev", N: 1.2 * D + 0.5 * L + Ev }, { id: "C5", n: "0.9D＋Ev", N: 0.9 * D + Ev });
  const gov = combos.every(c => Number.isFinite(c.N)) ? combos.reduce((a, c) => c.N > a.N ? c : a) : { N: NaN, id: "" };
  const cs = scRound(F(st.col.D), F(st.col.t)), Lc = st.col.L === "" ? fh : F(st.col.L), K = F(st.col.K);
  const KLr = cs && Lc > 0 && K > 0 ? K * Lc / cs.r : NaN, cf = scFcr(KLr, F(st.col.fy), F(st.col.E));
  const cap = F(st.phic) * cf.Fcr * SC_MPA * (cs ? cs.A : NaN);
  const check = { t: "主柱軸壓 Pu ≤ φcPn", v: gov.N, a: cap > 0 ? cap : NaN, u: "kgf", d: 1, by: gov.id };
  const miss = [];
  if (!geomOK) miss.push("層數、立架尺寸或跨距");
  if (!(qd >= 0)) miss.push(st.dmode === "slab" ? "板厚、混凝土單位重或額外靜載" : "支撐靜載重");
  if (!(F(st.q) >= 0)) miss.push("作業活載重");
  if (quake && !(cv >= 0)) miss.push("地震係數 Ch");
  return { levels, fw, fh, span, parts, panel, area, Hs, qc, qd, minL, minT, q, frameD, topD, D, L, quake, cv, Ev, combos, gov, cs, Lc, K, KLr, cf, cap, check, miss };
}

function rfSvg(r) {
  if (!(r.Hs > 0)) return `<p class="cnote">填好層數、立架與跨距後，這裡會畫出示意圖。</p>`;
  const k = Math.min(200 / r.span, 260 / (r.Hs + 30)), x0 = 60, y0 = 30, W = r.span * k, H = r.Hs * k, out = [];
  const X = x => (x0 + x * k).toFixed(1), Y = y => (y0 + H - y * k).toFixed(1);
  out.push(`<rect x="${(x0 - 20)}" y="${(y0 - 18)}" width="${(W + 40).toFixed(1)}" height="12" fill="currentColor" fill-opacity=".25"/><text x="${(x0 + W / 2).toFixed(1)}" y="${y0 - 9}" text-anchor="middle" font-size="9" fill="currentColor">樓板（支撐靜載 ${fmt(r.qd, 0)} kgf/m²）</text>`);
  for (let j = 0; j < r.levels; j++) {
    const ya = j * r.fh, yb = ya + r.fh;
    out.push(`<line x1="${X(0)}" y1="${Y(ya + r.fh * .12)}" x2="${X(r.span)}" y2="${Y(yb - r.fh * .12)}" stroke="currentColor" stroke-width=".6" opacity=".55"/><line x1="${X(0)}" y1="${Y(yb - r.fh * .12)}" x2="${X(r.span)}" y2="${Y(ya + r.fh * .12)}" stroke="currentColor" stroke-width=".6" opacity=".55"/><rect x="${X(0)}" y="${(+Y(yb) - 2.5).toFixed(1)}" width="${W.toFixed(1)}" height="2.5" fill="currentColor" opacity=".8"/>`);
  }
  for (const x of [0, r.span]) out.push(`<line x1="${X(x)}" x2="${X(x)}" y1="${Y(0)}" y2="${(y0 - 6)}" stroke="currentColor" stroke-width="1.8"/>`);
  out.push(`<line x1="${x0 - 20}" x2="${(x0 + W + 20).toFixed(1)}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor"/>`);
  const g = `<g font-size="10" fill="currentColor"><text x="${(x0 + W / 2).toFixed(1)}" y="${(y0 + H + 14).toFixed(1)}" text-anchor="middle">跨距 ${fmt(r.span, 1)} cm（立架寬 ${fmt(r.fw, 1)} cm）</text>
    <line x1="${x0 - 14}" x2="${x0 - 14}" y1="${Y(0)}" y2="${Y(r.fh)}" stroke="currentColor" stroke-width=".8"/><text x="${x0 - 17}" y="${((+Y(0) + +Y(r.fh)) / 2 + 3).toFixed(1)}" text-anchor="end">${fmt(r.fh, 1)}</text>
    <text x="${x0 - 20}" y="${(y0 + H + 28).toFixed(1)}">架高 ${fmt(r.Hs / 100, 3)} m、${r.levels} 層；單跨、單排代表單元</text></g>`;
  return `<svg class="cfsvg" style="max-width:360px" viewBox="0 0 ${(x0 + W + 40).toFixed(0)} ${(y0 + H + 36).toFixed(0)}" role="img" aria-label="排架示意圖">${out.join("")}${g}</svg>`;
}

const rfText = (st, r, f) => [
  `單跨單層自重 = ${r.parts.filter(p => p.sum).map(p => `${p.n} ${f(p.kg, 2)}${p.c !== 1 ? " × " + f(p.c, 0) : ""}`).join(" ＋ ")} = ${f(r.panel, 2)} kg`,
  `支撐靜載 qd = ${st.dmode === "slab" ? `板厚 ${esc(st.slab)} cm × ${esc(st.gam)} kgf/m³ ＋ ${esc(st.other)} = ` : ""}${f(r.qd, 1)} kgf/m²；單元面積 = ${f(r.span / 100, 3)} × ${f(r.fw / 100, 3)} = ${f(r.area, 4)} m²`,
  `每支主柱 D = ${f(r.panel, 2)} × ${r.levels} ÷ 2 ＋ ${f(r.qd, 1)} × ${f(r.area, 4)} ÷ 2 = ${f(r.frameD, 2)} ＋ ${f(r.topD, 2)} = ${f(r.D, 2)} kgf`,
  `採用活載 q = max(輸入 ${esc(st.q)}、最小活載 ${f(r.minL, 1)}、最小總載 ${f(r.minT, 1)} − qd) = ${f(r.q, 1)} kgf/m²；每支主柱 L = ${f(r.q, 1)} × ${f(r.area, 4)} ÷ 2 = ${f(r.L, 2)} kgf`,
  r.quake ? `Ev = Cv × D = ${f(r.cv, 4)} × ${f(r.D, 2)} = ${f(r.Ev, 2)} kgf（Cv = ${esc(st.cvr)} × Ch）` : "不考慮地震力",
  `主柱 圓管 D${esc(st.col.D)} × t${esc(st.col.t)} cm：A ${f(r.cs?.A, 3)} cm²、r ${f(r.cs?.r, 3)} cm；KL/r = ${f(r.K, 2)} × ${f(r.Lc, 1)} ÷ ${f(r.cs?.r, 3)} = ${f(r.KLr, 1)}；λc ${f(r.cf.lc, 3)}，Fcr = ${r.cf.inel ? "0.658^(λc²)·Fy" : "0.877/λc²·Fy"} = ${f(r.cf.Fcr, 1)} MPa；φcPn = ${esc(st.phic)} × Fcr × A = ${f(r.cap, 1)} kgf`
];

function tabRowFrame(box) {
  const st = rfLoad();
  const inp = (path, val, ph = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const txt = (path, val, ph = "") => `<input data-p="${path}" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const sel = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const opt = (list, cur, lab = x => x.n) => list.map(x => `<option value="${x.id}" ${x.id === cur ? "selected" : ""}>${lab(x)}</option>`).join("");
  const fld = (l, h) => `<div class="field"><label>${l}</label>${h}</div>`;
  const fid = () => SC_FRAMES.find(x => x.w === st.frame.w && x.h === st.frame.h && x.kg === st.frame.kg)?.id || "";
  const sid = () => SC_SPANS.find(x => x.span === st.span && x.br === st.brKg)?.id || "";
  const did = () => SC_DECKS.find(x => x.kg === st.deckKg)?.id || "";
  const draw = () => {
    box.innerHTML = `
      <div class="cfsteps"><a href="#rf1">1 搭設配置</a><a href="#rf2">2 構件規格</a><a href="#rf3">3 載重</a><a href="#rf4">4 檢核結果</a></div>
      <section class="panel" id="rf1"><h2><span class="cfno">1</span>基本資料與搭設配置</h2>
        <div class="grid2">
          ${fld("位置", txt("info.loc", st.info.loc, "例：挑高大廳 2F 版"))}
          ${fld("搭設層數（層）", inp("levels", st.levels))}
          ${fld("計算人員", txt("info.who", st.info.who))}
        </div>
        <div id="rfFig"></div></section>
      <section class="panel" id="rf2"><h2><span class="cfno">2</span>構件規格</h2>
        <div class="grid2">
          ${fld("立架型式", `<select id="rfFrame">${opt(SC_FRAMES, fid())}<option value="" ${fid() ? "" : "selected"}>自訂</option></select>`)}
          ${fld("立架寬度（cm）", inp("frame.w", st.frame.w))}
          ${fld("立架高度（cm）", inp("frame.h", st.frame.h))}
          ${fld("立架自重（kg／片）", inp("frame.kg", st.frame.kg))}
          ${fld("主柱材質", `<select id="rfCmat">${opt(SC_COLMAT, SC_COLMAT.find(x => x.fy === st.col.fy)?.id || "", x => `${x.id}（Fy ${x.fy} MPa）`)}<option value="" ${SC_COLMAT.some(x => x.fy === st.col.fy) ? "" : "selected"}>自訂</option></select>`)}
          ${fld("主柱 Fy（MPa）", inp("col.fy", st.col.fy))}
          ${fld("主柱外徑 D（cm）", inp("col.D", st.col.D))}
          ${fld("主柱厚度 t（cm）", inp("col.t", st.col.t))}
          ${fld("主柱無側撐長度 L（cm）", inp("col.L", st.col.L, "空白＝立架高度"))}
          ${fld("有效長度係數 K", inp("col.K", st.col.K))}
          ${fld("縱向跨距", `<select id="rfSpan">${opt(SC_SPANS, sid())}<option value="" ${sid() ? "" : "selected"}>自訂</option></select>`)}
          ${fld("跨距（cm）", inp("span", st.span))}
          ${fld("交叉拉桿（kg／支）", inp("brKg", st.brKg))}
          ${fld("交叉拉桿支數", inp("brN", st.brN))}
          ${fld("水平拉桿（kg／支）", inp("railKg", st.railKg))}
          ${fld("水平拉桿支數", inp("railN", st.railN))}
          ${fld("踏板寬度", `<select id="rfDeck">${opt(SC_DECKS, did())}<option value="" ${did() ? "" : "selected"}>自訂</option></select>`)}
          ${fld("踏板（kg／片）", inp("deckKg", st.deckKg))}
          ${fld("踏板片數", inp("deckN", st.deckN))}
          ${fld("另件（kg）", inp("miscKg", st.miscKg))}
        </div>
        <p class="cnote">單件自重與施工架分頁相同（參考網站自重表，非規範原文，可改）。</p>
        <div id="rfWt"></div></section>
      <section class="panel" id="rf3"><h2><span class="cfno">3</span>載重（極限設計法）</h2>
        <div class="grid2">
          ${fld("支撐靜載重取得方式", sel("dmode", [["slab", "依樓板厚度換算"], ["direct", "直接輸入平均靜載重"]], st.dmode))}
          ${st.dmode === "slab" ? fld("樓板厚度（cm）", inp("slab", st.slab)) + fld("混凝土單位重（kgf/m³）", inp("gam", st.gam)) + fld("支撐額外靜載（kgf/m²）", inp("other", st.other, "模板、鋼筋等")) : fld("支撐平均靜載重（kgf/m²）", inp("qd", st.qd))}
          ${fld("作業活載重（kgf/m²，含澆置衝擊）", inp("q", st.q))}
          ${fld("最小活載（kPa，可空白）", inp("minL", st.minL))}
          ${fld("最小 D＋L（kPa，可空白）", inp("minT", st.minT))}
          ${fld("地震力", sel("eq", [["none", "不考慮"], ["direct", "直接輸入係數"]], st.eq))}
          ${st.eq === "direct" ? fld("水平地震力係數 Ch", inp("ch", st.ch, "依耐震規範計算")) + fld("垂直係數 Cv ＝ ? × Ch", inp("cvr", st.cvr)) : ""}
          ${fld("受壓 φc", inp("phic", st.phic))}
        </div>
        <p class="cnote">支撐靜載與活載於架頂作用一次，由每片立架兩腳均分。預設值（板厚 20 cm、2400 kgf/m³、活載 250 kgf/m²、最小活載 2.4 kPa、最小 D＋L 4.8 kPa、Cv = 0.5Ch、φc 0.85）取自參考網站，參考網站註明最小值引 ACI 347R-14，這裡非規範原文，請依契約與規範修改。</p></section>
      <section class="panel" id="rf4"><h2><span class="cfno">4</span>檢核結果</h2><div id="rfRes"></div>
        <div class="row"><a class="btnlink" href="#/struct/row/sheet" id="rfSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="rfClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁只以單跨單排代表單元檢核主柱軸壓；未計水平力、偏心載重、千斤頂與頂座、底座與地盤（下層樓板）承載、架頂格柵與模板。結果僅供施工規劃參考，支撐安全仍應依法規、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    rfSave(st);
    const r = rfCalc(st);
    $("#rfFig").innerHTML = rfSvg(r);
    $("#rfWt").innerHTML = `<div class="tblwrap"><table class="ct cfres"><tr><th>構件</th><th>單件 kg</th><th>數量</th><th>小計 kg</th></tr>${r.parts.map(p => `<tr><th>${p.n}</th><td>${fmt(p.kg, 2)}</td><td>${fmt(p.c, 0)}</td><td>${fmt(p.sum, 2)}</td></tr>`).join("")}<tr><th>自重合計（單跨單層）</th><td></td><td></td><td><b>${fmt(r.panel, 2)}</b></td></tr></table></div>`;
    const c = r.check, [j, cls] = colJudge(c);
    $("#rfRes").innerHTML = r.miss.length ? `<div class="big"><span>總結</span><b><span style="font-size:15px;color:var(--mut)">待補：${r.miss.join("、")}</span></b></div>`
      : `<div class="big"><span>總結</span><b>${cls === "bad" ? `<em class="cfj bad">主柱超過設計強度</em>` : cls === "ok" ? `<em class="cfj ok">主柱在設計強度以內</em>` : "—"}</b></div>
      <div class="tblwrap"><table class="ct cfres" id="rfChk"><tr><th>項目</th><th>需求</th><th>強度</th><th>比值</th></tr>
        <tr><th>${c.t}<small>控制組合 ${c.by}</small></th><td>${fmt(c.v, 1)}<small>kgf</small></td><td>${fmt(c.a, 1)}</td><td class="${cls}">${fmt(c.v / c.a, 2)}<small>${j}</small></td></tr></table></div>
      <h3 class="cfh">載重組合（每支主柱，kgf）</h3>
      <div class="tblwrap"><table class="ct cfres" id="rfCombo"><tr><th>組合</th><th>D</th><th>L</th>${r.quake ? "<th>Ev</th>" : ""}<th>Pu</th></tr>
        ${r.combos.map(x => `<tr><th>${x.id}<small>${x.n}</small></th><td>${fmt(r.D, 2)}</td><td>${x.id === "C1" || x.id === "C5" ? 0 : fmt(r.L, 2)}</td>${r.quake ? `<td>${x.id === "C4" || x.id === "C5" ? fmt(r.Ev, 2) : 0}</td>` : ""}<td>${fmt(x.N, 2)}</td></tr>`).join("")}</table></div>
      <details class="cfdet"><summary>計算明細</summary>${rfText(st, r, fmt).map(x => `<p class="cfdh">${x}</p>`).join("")}</details>`;
  };
  const setv = (p, v) => { const ks = p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k]; o[last] = v; const el = box.querySelector(`[data-p="${p}"]`); if (el) el.value = v; };
  const sync = () => { $("#rfFrame").value = fid(); $("#rfSpan").value = sid(); $("#rfDeck").value = did(); $("#rfCmat").value = SC_COLMAT.find(x => x.fy === st.col.fy)?.id || ""; };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = ev => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      if (ev && ev.type === "change" && el.tagName === "INPUT" && o[last] === el.value) return;   // 輸入後失焦不重算，避免按鈕被重畫而按不到
      o[last] = el.value;
      if (el.dataset.p === "dmode" || el.dataset.p === "eq") return draw();
      sync(); calc();
    });
    $("#rfFrame").onchange = e => { const f = SC_FRAMES.find(x => x.id === e.target.value); if (f) { setv("frame.w", f.w); setv("frame.h", f.h); setv("frame.kg", f.kg); } calc(); };
    $("#rfSpan").onchange = e => { const f = SC_SPANS.find(x => x.id === e.target.value); if (f) { setv("span", f.span); setv("brKg", f.br); } calc(); };
    $("#rfDeck").onchange = e => { const f = SC_DECKS.find(x => x.id === e.target.value); if (f) setv("deckKg", f.kg); calc(); };
    $("#rfCmat").onchange = e => { const f = SC_COLMAT.find(x => x.id === e.target.value); if (f) setv("col.fy", f.fy); calc(); };
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#rfClear").onclick = () => { if (!confirm("清除排架的輸入？")) return; Object.assign(st, rfBlank()); draw(); };
    $("#rfSheet").onclick = e => { e.preventDefault(); location.hash = "#/struct/row/sheet"; };
  };
  draw();
}

function renderRowSheet() {
  const st = rfLoad(), r = rfCalc(st), company = ls.get("company", "");
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—", c = r.check, [j] = colJudge(c);
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="rfBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">排架結構計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料與搭設配置</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置</td><td colspan="3">${esc(st.info.loc)}</td></tr>
        <tr><td>搭設層數</td><td>${v(r.levels, 0)} 層</td><td>架體高度</td><td>${v(r.Hs / 100, 3)} m</td></tr>
        <tr><td>立架</td><td colspan="3">寬 ${esc(st.frame.w)} × 高 ${esc(st.frame.h)} cm、跨距 ${esc(st.span)} cm；主柱圓管 D${esc(st.col.D)} × t${esc(st.col.t)} cm，Fy ${esc(st.col.fy)} MPa、E ${esc(st.col.E)} MPa</td></tr>
      </table>
      <figure class="cffig">${rfSvg(r)}</figure>
      <table class="pt">
        <tr><th colspan="4">二、構件自重（單跨單層）</th></tr>
        <tr><th>構件</th><th>單件（kg）</th><th>數量</th><th>小計（kg）</th></tr>
        ${r.parts.map(p => `<tr><td>${p.n}</td><td class="c">${v(p.kg, 2)}</td><td class="c">${v(p.c, 0)}</td><td class="c">${v(p.sum, 2)}</td></tr>`).join("")}
        <tr><td colspan="3">自重合計</td><td class="c">${v(r.panel, 2)}</td></tr>
      </table>
      <table class="pt"><tr><th>三、載重與主柱強度</th></tr>${rfText(st, r, v).map(x => `<tr><td>${x}</td></tr>`).join("")}</table>
      <table class="pt">
        <tr><th colspan="2">四、載重組合（每支主柱）</th></tr>
        ${r.combos.map(x => `<tr><td>${x.id} ${x.n}</td><td class="c">${v(x.N, 2)} kgf</td></tr>`).join("")}
      </table>
      <table class="pt">
        <tr><th>項目（控制組合）</th><th>需求</th><th>強度</th><th>單位</th><th>比值</th><th>判定</th></tr>
        <tr><td>${c.t}（${c.by}）</td><td class="c">${v(c.v, 1)}</td><td class="c">${v(c.a, 1)}</td><td class="c">kgf</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${r.miss.length ? "資料未完整" : j}</td></tr>
        <tr><td colspan="6" style="font-size:9pt">註：單跨單排代表單元，每片立架兩腳均分；未計水平力、偏心、頂座與底座、地盤或下層樓板承載及架頂格柵。載重預設值取自參考網站（非規範原文），由計算人員依規範與契約確認，本計算書僅供施工規劃參考。計算日期：${esc(today())}</td></tr>
      </table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#rfBack").onclick = () => goBack("#/struct/row");
  $("#pvPrint").onclick = doPrint;
}

STRUCT_TABS.push(["row", "排架", tabRowFrame]);
