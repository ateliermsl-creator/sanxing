"use strict";
/* 外牆框型施工架（結構計算的「施工架」分頁，另有 A4 計算書 #/struct/scaf/sheet）
   參考網站 realizcalc.com「外牆框型施工架」（2026-11-14 讀取）。強度檢核在該網站伺服器端，看不到，
   這裡的主柱與壁連座檢核是工具箱自己依極限設計法柱公式寫的簡化模型，皆註明非規範原文、係數可改。
   ‧自重（單跨單層）：立架 1 片 ＋ 交叉拉桿 × 支數 ＋ 水平拉桿 × 支數 ＋ 踏板 × 片數 ＋ 另件 ＋ 額外靜載。
     單件重量取參考網站自重表（使用者提供的試算表），可改。
   ‧每支主柱：D = 單跨自重 × 層數 ÷ 2；L = q × 跨距 × 立架寬 × 同時作業層數 ÷ 2；Ev = Cv × D。
   ‧每支壁連座：分擔面積 A = 水平間距 × 垂直間距；W = η × 風壓 × A；Eh = Ch × A ÷（跨距 × 立架高）× 單跨自重。
   ‧載重組合（參考網站列的鋼結構極限設計法 2.2 節六組）：1.4D、1.2D＋1.6L、1.2D＋0.5L±1.6W、1.2D＋0.5L±E、0.9D±E、0.9D±1.6W。
   ‧風壓、地震係數一律直接輸入（不內建各縣市風速與工址地震參數，依 CLAUDE.md「不內建法規數值」）。
   ‧壁連座間距上限也由使用者填寫（不內建法規條文數值）；空白就不檢核。
   ‧單位：長度 cm（間距 m）、力 kgf、Fy／E 用 MPa（1 MPa = 10.1972 kgf/cm²）。 */

const SC_MPA = 1 / 0.0980665;   // MPa → kgf/cm²
// 參考網站自重表（weights.js，使用者提供之試算表），kg
const SC_FRAMES = [
  { id: "f1", n: "八字立架 60 × 172.5", s: "八字", w: "60", h: "172.5", kg: "12.29" },
  { id: "f2", n: "八字立架 76.2 × 172.5", s: "八字", w: "76.2", h: "172.5", kg: "12.81" },
  { id: "f3", n: "拱形立架 76.2 × 172.5", s: "拱形", w: "76.2", h: "172.5", kg: "13.82" },
  { id: "f4", n: "門形立架 91.4 × 172.5", s: "門形", w: "91.4", h: "172.5", kg: "15.55" },
  { id: "f5", n: "門形立架 91.4 × 192.5", s: "門形", w: "91.4", h: "192.5", kg: "16.54" },
  { id: "f6", n: "門形立架 121.9 × 172.5", s: "門形", w: "121.9", h: "172.5", kg: "20.16" },
  { id: "f7", n: "門形立架 121.9 × 192.5", s: "門形", w: "121.9", h: "192.5", kg: "21.15" }
];
const SC_SPANS = [{ id: "s1", n: "180 cm", span: "180", br: "2.115" }, { id: "s2", n: "182.9 cm", span: "182.9", br: "2.14" }];   // 交叉拉桿 4 支 8.46／8.56 kg
const SC_DECKS = [{ id: "d1", n: "寬 30 cm", kg: "11.17" }, { id: "d2", n: "寬 50 cm", kg: "15.38" }];
const SC_COLMAT = [{ id: "STK500", fy: "355" }, { id: "STK400", fy: "235" }];        // 主柱鋼管 Fy（MPa）
const SC_TIEMAT = [{ id: "SS400", fy: "215" }, { id: "SS330", fy: "175" }];          // 參考網站：中鋼型錄 t ≤ 100 mm 各級距最小 Fy（MPa）
const SC_PHI_DEF = { phic: "0.85", phit: "0.9", phiv: "0.9" };

const scBlank = () => ({
  info: { proj: "", loc: "", who: "" }, levels: "3", rows: "5",
  frame: { w: "76.2", h: "172.5", kg: "12.81" }, cmat: "STK500", col: { D: "4.27", t: "0.25", fy: "355", E: "200000", K: "1", L: "" },
  span: "182.9", brKg: "2.14", brN: "4", railKg: "1.28", railN: "2", deckKg: "11.17", deckN: "1", miscKg: "5", addKg: "0",
  tie: { sv: "", sh: "", d: "", KL: "20", mat: "SS400", fy: "215", E: "200000", limV: "", limH: "" },
  q: "", work: "1", wp: "", wn: "", beta: "", ch: "", cvr: "0.5", ...SC_PHI_DEF
});
function scLoad() {
  const d = scBlank();
  let s; try { s = JSON.parse(ls.get("calcScafForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s); pick(d.frame, s.frame); pick(d.col, s.col); pick(d.tie, s.tie);
  return d;
}
const scSave = st => { ls.set("calcScafForm", JSON.stringify(st)); svKept(); };

/* ---------- 計算 ---------- */
// 圓形斷面（管或實心），cm
function scRound(D, t) {
  const d = t > 0 ? D - 2 * t : 0;
  if (!(D > 0) || !(d >= 0)) return null;
  const A = Math.PI / 4 * (D * D - d * d), I = Math.PI / 64 * (D ** 4 - d ** 4);
  return { A, I, r: Math.sqrt(I / A) };
}
// 極限設計法柱公式：λc = KL/(rπ)·√(Fy/E)；λc ≤ 1.5 → Fcr = 0.658^(λc²)·Fy，否則 0.877/λc²·Fy
function scFcr(KLr, Fy, E) {
  const lc = KLr / Math.PI * Math.sqrt(Fy / E);
  if (!(lc >= 0)) return { lc: NaN, Fcr: NaN, inel: true };
  return lc <= 1.5 ? { lc, inel: true, Fcr: 0.658 ** (lc * lc) * Fy } : { lc, inel: false, Fcr: 0.877 / (lc * lc) * Fy };
}
const scPos = v => v > 0 ? v : NaN;
function scCalc(st) {
  const F = colF, levels = Math.round(F(st.levels)), rows = Math.round(F(st.rows));
  const fw = F(st.frame.w), fh = F(st.frame.h), span = F(st.span);
  const parts = [
    ["立架", F(st.frame.kg), 1], ["交叉拉桿", F(st.brKg), F(st.brN)], ["水平拉桿", F(st.railKg), F(st.railN)],
    ["水平踏板", F(st.deckKg), F(st.deckN)], ["另件", F(st.miscKg), 1], ["額外靜載", F(st.addKg) || 0, 1]
  ].map(([n, kg, c]) => ({ n, kg, c, sum: kg * c }));
  const panel = parts.reduce((a, p) => a + p.sum, 0);
  const geomOK = levels >= 1 && levels <= 30 && rows >= 2 && fw > 0 && fh > 0 && span > 0;
  const Hs = geomOK ? levels * fh : NaN, Ls = geomOK ? (rows - 1) * span : NaN;
  // 每支主柱
  const D = geomOK ? panel * levels / 2 : NaN;
  const q = F(st.q), work = Math.round(F(st.work));
  const Lv = geomOK && q >= 0 && work >= 1 && work <= levels ? q * (span / 100) * (fw / 100) * work / 2 : NaN;
  const ch = F(st.ch), cv = ch * F(st.cvr), Ev = cv * D;
  // 每支壁連座
  const sv = F(st.tie.sv), sh = F(st.tie.sh), At = sv > 0 && sh > 0 ? sv * sh : NaN;
  const beta = st.beta === "" ? NaN : F(st.beta);
  const eta = st.beta === "" ? 1 : beta >= 0 && beta < 100 ? Math.ceil((1 - beta / 100) * 10 - 1e-9) / 10 : NaN;
  const wp = F(st.wp), wn = Math.abs(F(st.wn));
  const Wc = eta * wp * At, Wt = eta * wn * At;                       // 正壓→壁連座受壓；負壓→受拉
  const Wt_ = geomOK ? At / (span / 100 * fh / 100) * panel : NaN;   // 分擔自重
  const Eh = ch * Wt_;
  const g = (a, b) => a * D + b * Lv;
  const combos = [
    { id: "C1", n: "1.4D", N: 1.4 * D, T: 0, C: 0, V: 0 },
    { id: "C2", n: "1.2D＋1.6L", N: g(1.2, 1.6), T: 0, C: 0, V: 0 },
    { id: "C3", n: "1.2D＋0.5L±1.6W", N: g(1.2, 0.5), T: 1.6 * Wt, C: 1.6 * Wc, V: 0 },
    { id: "C4", n: "1.2D＋0.5L±E", N: g(1.2, 0.5) + Ev, T: Eh, C: Eh, V: Eh },
    { id: "C5", n: "0.9D±E", N: 0.9 * D + Ev, T: Eh, C: Eh, V: Eh },
    { id: "C6", n: "0.9D±1.6W", N: 0.9 * D, T: 1.6 * Wt, C: 1.6 * Wc, V: 0 }
  ];
  const gov = k => { if (!combos.every(c => Number.isFinite(c[k]))) return { v: NaN, by: "" }; const m = combos.reduce((a, c) => c[k] > a[k] ? c : a); return { v: m[k], by: m.id }; };
  const Nu = gov("N"), Tu = gov("T"), Cu = gov("C"), Vu = gov("V");
  // 主柱
  const E = F(st.col.E), cs = scRound(F(st.col.D), F(st.col.t)), Lc = st.col.L === "" ? fh : F(st.col.L), K = F(st.col.K);
  const cfy = F(st.col.fy), cKLr = cs && Lc > 0 && K > 0 ? K * Lc / cs.r : NaN, cf = scFcr(cKLr, cfy, E);
  const colCap = F(st.phic) * cf.Fcr * SC_MPA * (cs ? cs.A : NaN);
  // 壁連座（有效直徑之實心圓桿）
  const ts = scRound(F(st.tie.d), 0), tfy = F(st.tie.fy), tKL = F(st.tie.KL), tKLr = ts && tKL > 0 ? tKL / ts.r : NaN;
  const tf = scFcr(tKLr, tfy, F(st.tie.E)), tA = ts ? ts.A : NaN;
  const capT = F(st.phit) * tfy * SC_MPA * tA, capC = F(st.phic) * tf.Fcr * SC_MPA * tA, capV = F(st.phiv) * 0.6 * tfy * SC_MPA * tA;
  const checks = [
    { k: "col", t: "主柱軸壓 Pu ≤ φcPn", v: Nu.v, a: scPos(colCap), u: "kgf", d: 1, by: Nu.by },
    { k: "tt", t: "壁連座拉力 Tu ≤ φtTn", v: Tu.v, a: scPos(capT), u: "kgf", d: 1, by: Tu.by },
    { k: "tc", t: "壁連座壓力 Cu ≤ φcPn", v: Cu.v, a: scPos(capC), u: "kgf", d: 1, by: Cu.by },
    { k: "tv", t: "壁連座剪力 Vu ≤ φvVn", v: Vu.v, a: scPos(capV), u: "kgf", d: 1, by: Vu.by }
  ];
  if (st.tie.limV !== "") checks.push({ k: "lv", t: "壁連座垂直間距", v: sv, a: scPos(F(st.tie.limV)), u: "m", d: 2, by: "" });
  if (st.tie.limH !== "") checks.push({ k: "lh", t: "壁連座水平間距", v: sh, a: scPos(F(st.tie.limH)), u: "m", d: 2, by: "" });
  const miss = [];
  if (!geomOK) miss.push("層數、排數、立架尺寸或跨距");
  if (!Number.isFinite(Lv)) miss.push("作業面活載重或同時作業層數");
  if (!(sv > 0 && sh > 0)) miss.push("壁連座間距");
  if (!(wp >= 0) || !(wn >= 0)) miss.push("風壓");
  if (!Number.isFinite(eta)) miss.push("孔隙率（0～100%）");
  if (!(ch >= 0) || !(F(st.cvr) >= 0)) miss.push("地震係數");
  if (!(F(st.tie.d) > 0)) miss.push("壁連座有效直徑");
  return { levels, rows, fw, fh, span, Hs, Ls, parts, panel, D, q, work, Lv, ch, cv, Ev, sv, sh, At, beta, eta, wp, wn, Wc, Wt, Wtrib: Wt_, Eh,
    combos, cs, Lc, K, cKLr, cfy, cf, colCap, ts, tfy, tKL, tKLr, tf, tA, capT, capC, capV, checks, miss,
    ng: checks.filter(x => colJudge(x)[1] === "bad").length, nmiss: checks.filter(x => colJudge(x)[1] === "").length };
}

/* ---------- 示意圖：立面（立架、交叉拉桿、踏板、壁連座） ---------- */
function scLayoutSvg(r) {
  if (!(r.Hs > 0 && r.Ls > 0)) return `<p class="cnote">填好層數、排數、立架與跨距後，這裡會畫出立面示意圖。</p>`;
  const pw = 290, k = Math.min(pw / r.Ls, 300 / r.Hs), x0 = 52, y0 = 16, W = r.Ls * k, H = r.Hs * k, out = [];
  const X = x => (x0 + x * k).toFixed(1), Y = y => (y0 + H - y * k).toFixed(1);
  for (let j = 0; j < r.levels; j++) for (let i = 0; i < r.rows - 1; i++) {
    const xa = i * r.span, xb = xa + r.span, ya = j * r.fh, yb = ya + r.fh;
    out.push(`<line x1="${X(xa)}" y1="${Y(ya + r.fh * 0.12)}" x2="${X(xb)}" y2="${Y(yb - r.fh * 0.12)}" stroke="currentColor" stroke-width=".6" opacity=".55"/><line x1="${X(xa)}" y1="${Y(yb - r.fh * 0.12)}" x2="${X(xb)}" y2="${Y(ya + r.fh * 0.12)}" stroke="currentColor" stroke-width=".6" opacity=".55"/>`);
    out.push(`<rect x="${X(xa)}" y="${(+Y(yb) - 2.5).toFixed(1)}" width="${(r.span * k).toFixed(1)}" height="2.5" fill="currentColor" opacity=".8"/>`);
  }
  for (let i = 0; i < r.rows; i++) out.push(`<line x1="${X(i * r.span)}" x2="${X(i * r.span)}" y1="${Y(0)}" y2="${Y(r.Hs)}" stroke="currentColor" stroke-width="1.6"/>`);
  out.push(`<line x1="${(x0 - 10)}" x2="${(x0 + W + 10).toFixed(1)}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor"/>`);
  // 壁連座：第一列距底部 = 垂直間距，其後等距；水平自中央向兩側
  let ties = 0;
  if (r.sv > 0 && r.sh > 0) {
    const sv = r.sv * 100, sh = r.sh * 100, xs = [], mid = r.Ls / 2;
    for (let i = 0; mid + i * sh <= r.Ls + 1e-6 && i < 200; i++) { xs.push(mid + i * sh); if (i) xs.push(mid - i * sh); }
    for (let y = sv; y <= r.Hs + 1e-6 && ties < 2000; y += sv) for (const x of xs) { ties++; out.push(`<line class="sctie" x1="${(+X(x) - 7).toFixed(1)}" x2="${(+X(x) + 7).toFixed(1)}" y1="${Y(y)}" y2="${Y(y)}" stroke-width="4"/>`); }
  }
  const lab = `<g font-size="10" fill="currentColor">
    <line x1="${X(0)}" x2="${X(r.span)}" y1="${(y0 + H + 14).toFixed(1)}" y2="${(y0 + H + 14).toFixed(1)}" stroke="currentColor" stroke-width=".8"/><text x="${((+X(0) + +X(r.span)) / 2).toFixed(1)}" y="${(y0 + H + 25).toFixed(1)}" text-anchor="middle">跨距 ${fmt(r.span, 1)}</text>
    <line x1="${x0 - 14}" x2="${x0 - 14}" y1="${Y(0)}" y2="${Y(r.fh)}" stroke="currentColor" stroke-width=".8"/><text x="${x0 - 17}" y="${((+Y(0) + +Y(r.fh)) / 2 + 3).toFixed(1)}" text-anchor="end">${fmt(r.fh, 1)}</text>
    <text x="${x0}" y="${(y0 + H + 40).toFixed(1)}">架高 ${fmt(r.Hs / 100, 3)} m、長 ${fmt(r.Ls / 100, 2)} m；${r.levels} 層 × ${r.rows} 排；${ties ? `壁連座（粗短線）${ties} 處` : "壁連座間距未填"}</text></g>`;
  return `<svg class="cfsvg" viewBox="0 0 ${(x0 + W + 16).toFixed(0)} ${(y0 + H + 48).toFixed(0)}" role="img" aria-label="外牆框型施工架立面示意圖">${out.join("")}${lab}</svg>
    <p class="cnote" style="margin-top:0">立面依輸入比例繪製：直線為立架腳柱、交叉線為交叉拉桿、粗線為踏板。壁連座第一列距底部一個垂直間距，水平方向自中央向兩側排列。</p>`;
}

/* ---------- 文字（畫面與計算書共用） ---------- */
const scLoadText = (st, r, f) => [
  `單跨單層自重 = ${r.parts.filter(p => p.sum).map(p => `${p.n} ${f(p.kg, 2)}${p.c !== 1 ? " × " + f(p.c, 0) : ""}`).join(" ＋ ")} = ${f(r.panel, 2)} kg`,
  `每支主柱 D = ${f(r.panel, 2)} × ${r.levels} 層 ÷ 2 = ${f(r.D, 2)} kgf`,
  `每支主柱 L = q × 跨距 × 立架寬 × 作業層數 ÷ 2 = ${f(r.q, 1)} × ${f(r.span / 100, 3)} × ${f(r.fw / 100, 3)} × ${f(r.work, 0)} ÷ 2 = ${f(r.Lv, 2)} kgf`,
  `Ev = Cv × D = ${f(r.cv, 4)} × ${f(r.D, 2)} = ${f(r.Ev, 2)} kgf（Cv = ${esc(st.cvr)} × Ch）`,
  `壁連座分擔面積 A = ${f(r.sh, 2)} × ${f(r.sv, 2)} = ${f(r.At, 3)} m²；施工網保留倍率 η = ${Number.isFinite(r.beta) ? `1 − β = ${f(1 - r.beta / 100, 3)}，向上取 ${f(r.eta, 1)}` : "1（未填孔隙率）"}`,
  `風力：正壓 W⁺ = η × ${f(r.wp, 1)} × A = ${f(r.Wc, 2)} kgf（壓）；負壓 W⁻ = η × ${f(r.wn, 1)} × A = ${f(r.Wt, 2)} kgf（拉）`,
  `地震：分擔自重 = A ÷（跨距 × 立架高）× 單跨自重 = ${f(r.At, 3)} ÷ ${f(r.span / 100 * r.fh / 100, 4)} × ${f(r.panel, 2)} = ${f(r.Wtrib, 2)} kgf；Eh = Ch × 分擔自重 = ${f(r.ch, 4)} × ${f(r.Wtrib, 2)} = ${f(r.Eh, 2)} kgf`
];
const scCapText = (st, r, f) => [
  `主柱 圓管 D${esc(st.col.D)} × t${esc(st.col.t)} cm：A = ${f(r.cs?.A, 3)} cm²、r = ${f(r.cs?.r, 3)} cm；KL/r = ${f(r.K, 2)} × ${f(r.Lc, 1)} ÷ ${f(r.cs?.r, 3)} = ${f(r.cKLr, 1)}；λc = ${f(r.cf.lc, 3)}，Fcr = ${r.cf.inel ? "0.658^(λc²)·Fy" : "0.877/λc²·Fy"} = ${f(r.cf.Fcr, 1)} MPa；φcPn = ${esc(st.phic)} × Fcr × A = ${f(r.colCap, 1)} kgf`,
  `壁連座 實心圓桿 d = ${esc(st.tie.d)} cm：A = ${f(r.tA, 3)} cm²、Fy = ${f(r.tfy, 0)} MPa；φtTn = ${esc(st.phit)} × Fy × A = ${f(r.capT, 1)} kgf`,
  `壁連座受壓：KL/r = ${f(r.tKL, 1)} ÷ ${f(r.ts?.r, 3)} = ${f(r.tKLr, 1)}，λc = ${f(r.tf.lc, 3)}，Fcr = ${f(r.tf.Fcr, 1)} MPa；φcPn = ${esc(st.phic)} × Fcr × A = ${f(r.capC, 1)} kgf`,
  `壁連座剪力：φvVn = ${esc(st.phiv)} × 0.6Fy × A = ${f(r.capV, 1)} kgf`
];

/* ---------- 畫面 ---------- */
function tabScaffold(box) {
  const st = scLoad();
  const inp = (path, val, ph = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const txt = (path, val, ph = "") => `<input data-p="${path}" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const opt = (list, cur, lab = x => x.n) => list.map(x => `<option value="${x.id}" ${x.id === cur ? "selected" : ""}>${lab(x)}</option>`).join("");
  const fid = () => SC_FRAMES.find(x => x.w === st.frame.w && x.h === st.frame.h && x.kg === st.frame.kg)?.id || "";
  const sid = () => SC_SPANS.find(x => x.span === st.span && x.br === st.brKg)?.id || "";
  const did = () => SC_DECKS.find(x => x.kg === st.deckKg)?.id || "";
  const fld = (l, h) => `<div class="field"><label>${l}</label>${h}</div>`;
  const draw = () => {
    box.innerHTML = `
      <div class="cfsteps"><a href="#sc1">1 搭設配置</a><a href="#sc2">2 構件規格</a><a href="#sc3">3 載重</a><a href="#sc4">4 檢核結果</a></div>
      <section class="panel" id="sc1"><h2><span class="cfno">1</span>基本資料與搭設配置</h2>
        <div class="grid2">
          ${fld("位置", txt("info.loc", st.info.loc, "例：北向外牆"))}
          ${fld("搭設層數（層）", inp("levels", st.levels))}
          ${fld("縱向排數（排，立架片數）", inp("rows", st.rows))}
          ${fld("計算人員", txt("info.who", st.info.who))}
        </div>
        <h3 class="cfh">立面示意圖</h3><div id="scLay"></div></section>
      <section class="panel" id="sc2"><h2><span class="cfno">2</span>構件規格</h2>
        <h3 class="cfh">立架</h3>
        <div class="grid2">
          ${fld("立架型式", `<select id="scFrame">${opt(SC_FRAMES, fid())}<option value="" ${fid() ? "" : "selected"}>自訂</option></select>`)}
          ${fld("立架寬度（cm）", inp("frame.w", st.frame.w))}
          ${fld("立架高度（cm）", inp("frame.h", st.frame.h))}
          ${fld("立架自重（kg／片）", inp("frame.kg", st.frame.kg))}
          ${fld("主柱材質", `<select id="scCmat">${opt(SC_COLMAT, SC_COLMAT.find(x => x.fy === st.col.fy)?.id || "", x => `${x.id}（Fy ${x.fy} MPa）`)}<option value="" ${SC_COLMAT.some(x => x.fy === st.col.fy) ? "" : "selected"}>自訂</option></select>`)}
          ${fld("主柱 Fy（MPa）", inp("col.fy", st.col.fy))}
          ${fld("主柱外徑 D（cm）", inp("col.D", st.col.D))}
          ${fld("主柱厚度 t（cm）", inp("col.t", st.col.t))}
          ${fld("主柱無側撐長度 L（cm）", inp("col.L", st.col.L, "空白＝立架高度"))}
          ${fld("有效長度係數 K", inp("col.K", st.col.K))}
        </div>
        <h3 class="cfh">交叉拉桿、水平拉桿、踏板、另件</h3>
        <div class="grid2">
          ${fld("縱向跨距", `<select id="scSpan">${opt(SC_SPANS, sid())}<option value="" ${sid() ? "" : "selected"}>自訂</option></select>`)}
          ${fld("跨距（cm）", inp("span", st.span))}
          ${fld("交叉拉桿（kg／支）", inp("brKg", st.brKg))}
          ${fld("交叉拉桿支數（單側 2、雙側 4）", inp("brN", st.brN))}
          ${fld("水平拉桿（kg／支）", inp("railKg", st.railKg))}
          ${fld("水平拉桿支數", inp("railN", st.railN))}
          ${fld("踏板寬度", `<select id="scDeck">${opt(SC_DECKS, did())}<option value="" ${did() ? "" : "selected"}>自訂</option></select>`)}
          ${fld("踏板（kg／片）", inp("deckKg", st.deckKg))}
          ${fld("踏板片數", inp("deckN", st.deckN))}
          ${fld("另件（接榫、止擋、扣鎖等，kg）", inp("miscKg", st.miscKg))}
        </div>
        <h3 class="cfh">壁連座</h3>
        <div class="grid2">
          ${fld("垂直間距（m）", inp("tie.sv", st.tie.sv, "例：3.45"))}
          ${fld("水平間距（m）", inp("tie.sh", st.tie.sh, "例：5.49"))}
          ${fld("有效直徑 d（cm）", inp("tie.d", st.tie.d, "例：螺紋根徑"))}
          ${fld("有效長度 KL（cm）", inp("tie.KL", st.tie.KL))}
          ${fld("壁連座材質", `<select id="scTmat">${opt(SC_TIEMAT, SC_TIEMAT.find(x => x.fy === st.tie.fy)?.id || "", x => `${x.id}（Fy ${x.fy} MPa）`)}<option value="" ${SC_TIEMAT.some(x => x.fy === st.tie.fy) ? "" : "selected"}>自訂</option></select>`)}
          ${fld("壁連座 Fy（MPa）", inp("tie.fy", st.tie.fy))}
          ${fld("垂直間距上限（m，可空白）", inp("tie.limV", st.tie.limV, "依法規自行填寫"))}
          ${fld("水平間距上限（m，可空白）", inp("tie.limH", st.tie.limH, "依法規自行填寫"))}
        </div>
        <p class="cnote">立架、拉桿、踏板的單件自重取自參考網站的自重表（使用者提供的試算表，180 cm 跨距的水平拉桿與踏板沿用 182.9 cm 值），非規範原文，可依實際產品修改。主柱 Fy：STK500 355、STK400 235 MPa；壁連座 Fy 取參考網站值（中鋼型錄 t ≤ 100 mm 最小值），E = 200000 MPa。壁連座間距的法規上限請自行填寫，空白就不檢核。</p>
        <div id="scWt"></div></section>
      <section class="panel" id="sc3"><h2><span class="cfno">3</span>載重（極限設計法）</h2>
        <div class="grid2">
          ${fld("額外靜載（kg／單跨單層）", inp("addKg", st.addKg))}
          ${fld("作業面活載重 q（kgf/m²）", inp("q", st.q, "依規範與契約填寫"))}
          ${fld("同時作業層數", inp("work", st.work))}
        </div>
        <h3 class="cfh">風壓（直接輸入）</h3>
        <div class="grid2">
          ${fld("最大正壓 W⁺（向牆，kgf/m²）", inp("wp", st.wp, "依耐風規範計算"))}
          ${fld("最大負壓 W⁻（向外，kgf/m²，填絕對值）", inp("wn", st.wn, "依耐風規範計算"))}
          ${fld("施工網孔隙率 β（%，可空白）", inp("beta", st.beta, "空白＝不折減"))}
        </div>
        <h3 class="cfh">地震力（直接輸入）</h3>
        <div class="grid2">
          ${fld("水平地震力係數 Ch", inp("ch", st.ch, "依耐震規範計算"))}
          ${fld("垂直係數 Cv ＝ ? × Ch", inp("cvr", st.cvr))}
        </div>
        <h3 class="cfh">強度折減係數</h3>
        <div class="grid2">
          ${fld("受壓 φc", inp("phic", st.phic))}
          ${fld("受拉 φt", inp("phit", st.phit))}
          ${fld("受剪 φv", inp("phiv", st.phiv))}
        </div>
        <p class="cnote">風壓與地震係數請依建築物耐風、耐震設計規範自行計算後填入（工具不內建各地風速與工址參數）。β 有填時，風力乘保留倍率 η = 1 − β（向上取至 0.1，參考網站的簡化假設）。Cv = 0.5Ch 是參考網站「直接輸入」模式的預設；φ 預設 0.85／0.9／0.9。以上皆非規範原文，可修改。</p>
        <div class="row"><button type="button" class="sec" id="scPhiDef">係數恢復預設值</button></div></section>
      <section class="panel" id="sc4"><h2><span class="cfno">4</span>檢核結果</h2><div id="scRes"></div>
        <div class="row"><a class="btnlink" href="#/struct/scaf/sheet" id="scSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="scClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁為簡化模型：主柱只承擔垂直的 D、L、Ev，壁連座只承擔水平的風力與地震力；未計水平力造成的主柱附加軸力、彎矩與二階效應，也未檢核壁連座拉剪互制、偏心、接頭與錨定、托架與地盤承載。結果僅供施工規劃參考，施工架安全仍應依法規、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    scSave(st);
    const r = scCalc(st);
    $("#scLay").innerHTML = scLayoutSvg(r);
    $("#scWt").innerHTML = `<div class="tblwrap"><table class="ct cfres"><tr><th>構件</th><th>單件 kg</th><th>數量</th><th>小計 kg</th></tr>${r.parts.map(p => `<tr><th>${p.n}</th><td>${fmt(p.kg, 2)}</td><td>${fmt(p.c, 0)}</td><td>${fmt(p.sum, 2)}</td></tr>`).join("")}<tr><th>自重合計（單跨單層）</th><td></td><td></td><td><b>${fmt(r.panel, 2)}</b></td></tr></table></div>`;
    const cell = c => { const [j, cls] = colJudge(c); return Number.isFinite(c.v) && c.a > 0 ? `<td class="${cls}">${fmt(c.v / c.a, 2)}<small>${j}</small></td>` : `<td>—</td>`; };
    const n2 = x => Number.isFinite(x) ? fmt(x, 2) : "待補";
    $("#scRes").innerHTML = `<div class="big"><span>總結</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過設計強度</em>` : r.nmiss ? `<span style="font-size:15px;color:var(--mut)">還有 ${r.nmiss} 項未完成${r.miss.length ? "：缺" + r.miss.join("、") : ""}</span>` : `<em class="cfj ok">全部在設計強度以內</em>`}</b></div>
      <div class="tblwrap"><table class="ct cfres" id="scChk"><tr><th>項目</th><th>需求</th><th>強度／上限</th><th>比值</th></tr>
        ${r.checks.map(c => `<tr><th>${c.t}${c.by ? `<small>控制組合 ${c.by}</small>` : ""}</th><td>${fmt(c.v, c.d)}<small>${c.u}</small></td><td>${c.a > 0 ? fmt(c.a, c.d) : "—"}</td>${cell(c)}</tr>`).join("")}</table></div>
      <p class="cnote">比值 = 需求 ÷ 設計強度，≤ 1 為 OK。主柱為每支腳柱，壁連座為每支。</p>
      <h3 class="cfh">載重組合（已乘係數，kgf）</h3>
      <div class="tblwrap"><table class="ct cfres" id="scCombo"><tr><th>組合</th><th>主柱軸力</th><th>壁連座拉力</th><th>壁連座壓力</th><th>沿牆剪力</th></tr>
        ${r.combos.map(c => `<tr><th>${c.id}<small>${c.n}</small></th><td>${n2(c.N)}</td><td>${n2(c.T)}</td><td>${n2(c.C)}</td><td>${n2(c.V)}</td></tr>`).join("")}</table></div>
      <p class="cnote">C4、C5 的主柱軸力取 Ev 全量向下（與 0.3Ex 搭配的情況）；壁連座取 Ex 或 Ey 全量。風、地震分案，不相加。0.9D 組合的上拔另核。</p>
      <details class="cfdet"><summary>計算明細</summary>
        ${scLoadText(st, r, fmt).map(x => `<p class="cfdh">${x}</p>`).join("")}
        ${scCapText(st, r, fmt).map(x => `<p class="cfdh">${x}</p>`).join("")}</details>`;
    if (Number.isFinite(r.D) && Number.isFinite(r.Lv)) {
      $("#scRes").insertAdjacentHTML("beforeend", `<div class="row"><button type="button" class="sec" id="scToBk">帶入三角架（PD ${fmt(r.D, 2)}、PL ${fmt(r.Lv, 2)} kgf）</button></div><p class="cnote" style="margin-top:0">把每支主柱的 D、L 帶入三角架分頁的 PD₁、PD₂、PL₁、PL₂（兩腳相同）。托架以上的層數與本頁不同時，請先調整層數再帶入。</p>`);
      $("#scToBk").onclick = () => { const b = bkLoad(); b.PD1 = b.PD2 = fmt(r.D, 2); b.PL1 = b.PL2 = fmt(r.Lv, 2); b.src = `由施工架分頁帶入（${r.levels} 層、作業 ${r.work} 層）`; bkSave(b); location.hash = "#/struct/brk"; };
    }
  };
  const setv = (p, v) => { const ks = p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k]; o[last] = v; const el = box.querySelector(`[data-p="${p}"]`); if (el) el.value = v; };
  const sync = () => { $("#scFrame").value = fid(); $("#scSpan").value = sid(); $("#scDeck").value = did();
    $("#scCmat").value = SC_COLMAT.find(x => x.fy === st.col.fy)?.id || ""; $("#scTmat").value = SC_TIEMAT.find(x => x.fy === st.tie.fy)?.id || ""; };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = ev => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      if (ev && ev.type === "change" && el.tagName === "INPUT" && o[last] === el.value) return;   // 輸入後失焦不重算，避免按鈕被重畫而按不到
      o[last] = el.value; sync(); calc();
    });
    $("#scFrame").onchange = e => { const f = SC_FRAMES.find(x => x.id === e.target.value); if (f) { setv("frame.w", f.w); setv("frame.h", f.h); setv("frame.kg", f.kg); } calc(); };
    $("#scSpan").onchange = e => { const f = SC_SPANS.find(x => x.id === e.target.value); if (f) { setv("span", f.span); setv("brKg", f.br); } calc(); };
    $("#scDeck").onchange = e => { const f = SC_DECKS.find(x => x.id === e.target.value); if (f) setv("deckKg", f.kg); calc(); };
    $("#scCmat").onchange = e => { const f = SC_COLMAT.find(x => x.id === e.target.value); if (f) setv("col.fy", f.fy); calc(); };
    $("#scTmat").onchange = e => { const f = SC_TIEMAT.find(x => x.id === e.target.value); if (f) setv("tie.fy", f.fy); calc(); };
    $("#scPhiDef").onclick = () => { for (const k in SC_PHI_DEF) setv(k, SC_PHI_DEF[k]); setv("cvr", "0.5"); calc(); };
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#scClear").onclick = () => { if (!confirm("清除施工架的輸入？")) return; Object.assign(st, scBlank()); draw(); };
    $("#scSheet").onclick = e => { e.preventDefault(); location.hash = "#/struct/scaf/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderScafSheet() {
  const st = scLoad(), r = scCalc(st), company = siteCompany(siteId);
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const crow = c => { const [j] = colJudge(c); return `<tr><td>${c.t}${c.by ? `（${c.by}）` : ""}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${c.a > 0 ? v(c.a, c.d) : "—"}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${j}</td></tr>`; };
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="scBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">外牆框型施工架結構計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料與搭設配置</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置</td><td colspan="3">${esc(st.info.loc)}</td></tr>
        <tr><td>搭設層數</td><td>${v(r.levels, 0)} 層</td><td>縱向排數</td><td>${v(r.rows, 0)} 排</td></tr>
        <tr><td>架體高度</td><td>${v(r.Hs / 100, 3)} m</td><td>縱向長度</td><td>${v(r.Ls / 100, 2)} m</td></tr>
        <tr><td>壁連座間距</td><td colspan="3">垂直 ${v(r.sv, 2)} m、水平 ${v(r.sh, 2)} m${st.tie.limV || st.tie.limH ? `（上限：垂直 ${esc(st.tie.limV) || "未填"} m、水平 ${esc(st.tie.limH) || "未填"} m）` : ""}</td></tr>
      </table>
      <figure class="cffig">${scLayoutSvg(r)}</figure>
      <table class="pt">
        <tr><th colspan="4">二、構件規格與自重（單跨單層）</th></tr>
        <tr><td>立架</td><td colspan="3">寬 ${esc(st.frame.w)} × 高 ${esc(st.frame.h)} cm；主柱圓管 D${esc(st.col.D)} × t${esc(st.col.t)} cm，Fy ${esc(st.col.fy)} MPa、E ${esc(st.col.E)} MPa</td></tr>
        <tr><td>壁連座</td><td colspan="3">有效直徑 ${esc(st.tie.d)} cm、KL ${esc(st.tie.KL)} cm，Fy ${esc(st.tie.fy)} MPa</td></tr>
        <tr><th>構件</th><th>單件（kg）</th><th>數量</th><th>小計（kg）</th></tr>
        ${r.parts.map(p => `<tr><td>${p.n}</td><td class="c">${v(p.kg, 2)}</td><td class="c">${v(p.c, 0)}</td><td class="c">${v(p.sum, 2)}</td></tr>`).join("")}
        <tr><td colspan="3">自重合計</td><td class="c">${v(r.panel, 2)}</td></tr>
        <tr><td colspan="4" style="font-size:9pt">單件自重、材料 Fy 依使用者提供之參考資料（非規範原文），可依實際產品修改。</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="2">三、載重</th></tr>
        <tr><td>輸入</td><td>作業面活載重 ${esc(st.q)} kgf/m²、同時作業 ${esc(st.work)} 層；風壓 W⁺ ${esc(st.wp)}、W⁻ ${esc(st.wn)} kgf/m²${st.beta !== "" ? `、施工網孔隙率 ${esc(st.beta)}%` : ""}；Ch ${esc(st.ch)}、Cv = ${esc(st.cvr)}Ch</td></tr>
        ${scLoadText(st, r, v).map(x => `<tr><td colspan="2">${x}</td></tr>`).join("")}
      </table>
      <table class="pt">
        <tr><th colspan="5">四、載重組合（已乘係數，kgf）</th></tr>
        <tr><th>組合</th><th>主柱軸力</th><th>壁連座拉力</th><th>壁連座壓力</th><th>沿牆剪力</th></tr>
        ${r.combos.map(c => `<tr><td>${c.id} ${c.n}</td><td class="c">${v(c.N, 2)}</td><td class="c">${v(c.T, 2)}</td><td class="c">${v(c.C, 2)}</td><td class="c">${v(c.V, 2)}</td></tr>`).join("")}
      </table>
      <table class="pt">
        <tr><th colspan="6">五、強度檢核（φc ${esc(st.phic)}、φt ${esc(st.phit)}、φv ${esc(st.phiv)}）</th></tr>
        ${scCapText(st, r, v).map(x => `<tr><td colspan="6">${x}</td></tr>`).join("")}
        <tr><th>項目（控制組合）</th><th>需求</th><th>強度／上限</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${r.checks.map(crow).join("")}
      </table>
      <table class="pt"><tr><th>檢核結果</th><td>${r.ng ? `${r.ng} 項超過設計強度` : r.nmiss ? `尚有 ${r.nmiss} 項未完成` : "全部在設計強度以內"}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：簡化模型，主柱承擔垂直 D、L、Ev，壁連座承擔水平風力與地震力；未計水平力引致之主柱附加軸力、彎矩與二階效應，未檢核壁連座拉剪互制、偏心、接頭與錨定、托架與地盤承載。風壓、地震係數、活載重與間距上限由計算人員依規範與契約填寫，本計算書僅供施工規劃參考。計算日期：${esc(rocYmd(today()))}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#scBack").onclick = () => goBack("#/struct/scaf");
  $("#pvPrint").onclick = doPrint;
}

STRUCT_TABS.push(["scaf", "施工架", tabScaffold]);
