"use strict";
/* 牆身模板檢核（工程計算機的「牆模板」分頁，另有 A4 計算書 #/calc/wall/sheet）
   三種型式：
   ‧三層模：側壓力 → 襯板 → 小格柵 → 第一層大格柵 → 螺桿（大格柵以螺桿垂直間距 H4 為跨距）
   ‧四層模：側壓力 → 襯板 → 小格柵 → 第一層大格柵 → 第二層大格柵 → 螺桿（同柱模板）
   ‧單面模：四層模的螺桿改成鋼管斜撐（只能從單側支撐時）：H = P × H4 × B4，N = H / cosθ，
     支撐長 L = 支撐點高度 / sinθ（另一端假定在基準地面），或手動輸入最大未支撐長度；
     λ = KL/r（K = 1），容許壓應力 Fa 依容許應力法柱公式（λ ≤ Cc 非彈性、λ > Cc 彈性），fc = N/A。
   ‧側壓力兩種：
     ref：P = 1.5Wo + 0.2Wo × (H − 1.5)（H 公尺、Wo 單位重），沿高度線性遞減到牆頂為 0
          —— 取自使用者指定的參考網站（2026-11-14 讀取），畫面註明「非規範原文」，可改用下一種；
     lin：P = γ × 深度，可填上限（與柱模板相同）。
   ‧材料庫、樹種、內建斷面、構件公式（COL_METHODS，預設依參考網站）與柱模板共用（colform.js）。
   ‧螺桿容許拉應力 Ft 預設 1800 kgf/cm²（參考網站螺桿資料 18 kgf/mm²，非規範原文），可修改。
   ‧單位：長度 cm、力 kgf、應力 kgf/cm²；γ 用 t/m³。 */

const WF_TYPES = {
  t3: { n: "三層模", sup: "tie", mems: [
    { k: "ply", n: "襯板", kind: "ply", span: "H1", trib: null },
    { k: "stud", n: "小格柵", kind: "beam", span: "B2", trib: "H1" },
    { k: "w1", n: "第一層大格柵", kind: "beam", span: "H4", trib: "B2" }], gaps: ["H1", "B2", "H4", "B4"] },
  t4: { n: "四層模", sup: "tie", mems: COL_MEMBERS, gaps: ["H1", "B2", "H3", "H4", "B4"] },
  s1: { n: "單面模", sup: "pipe", mems: COL_MEMBERS, gaps: ["H1", "B2", "H3", "H4", "B4", "ang"] }
};
const WF_FT_DEF = "1800";   // 參考網站螺桿 allowableStress 18 kgf/mm²
const WF_PIPES = [{ id: "pp486", n: "圓管 D4.86 × t0.24 cm", D: "4.86", t: "0.24" }];   // 參考網站：A 3.483、I 9.319、S 3.835
const wfGapName = (k, sup) => ({ H1: "小格柵垂直間距 H1", B2: "第一層大格柵水平間距 B2", H3: "第二層大格柵垂直間距 H3",
  H4: sup === "pipe" ? "斜撐垂直間距 H4" : "螺桿垂直間距 H4", B4: sup === "pipe" ? "斜撐水平間距 B4" : "螺桿水平間距 B4",
  ang: "斜撐與水平面夾角 θ（度）", Lu: "最大未支撐長度 L（cm）" })[k];

const wfTier = () => ({ top: "", H1: "", B2: "", H3: "", H4: "", B4: "", ang: "", Lu: "" });
const wfBlank = () => ({
  type: "t4", info: { proj: "", loc: "", no: "", H: "", len: "", thk: "", who: "" },
  pmode: "ref", gamma: "2.3", pmax: "", meth: "r", species: "c3", tieFt: WF_FT_DEF, manual: "",
  pipe: { D: "4.86", t: "0.24" }, defP: { n: "", a: "3" }, defB: { n: "", a: "" },
  sel: { ply: "p_ply15", stud: "p_b3645", w1: "p_b9045", w2: "p_b9045", tie: "p_t25" }, tiers: [wfTier()]
});
function wfLoad() {
  const d = wfBlank();
  let s; try { s = JSON.parse(ls.get("calcWallForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s); pick(d.pipe, s.pipe); pick(d.defP, s.defP); pick(d.defB, s.defB); pick(d.sel, s.sel);
  if (!WF_TYPES[d.type]) d.type = "t4";
  if (Array.isArray(s.tiers) && s.tiers.length) d.tiers = s.tiers.slice(0, COL_MAX_TIERS).map(t => { const o = wfTier(); pick(o, t); return o; });
  return d;
}
const wfSave = st => ls.set("calcWallForm", JSON.stringify(st));

/* ---------- 計算 ---------- */
// 圓管斷面（外徑 D、管厚 t）
function wfPipeSect(p) {
  const D = colF(p.D), t = colF(p.t), d = D - 2 * t;
  if (!(D > 0) || !(t > 0) || !(d >= 0)) return null;
  const A = Math.PI / 4 * (D * D - d * d), I = Math.PI / 64 * (D ** 4 - d ** 4);
  return { D, t, A, I, S: I / (D / 2), r: Math.sqrt(I / A) };
}
// 容許壓應力（容許應力法柱公式，K = 1）
function wfFa(lam, Fy, E) {
  const Cc = Math.sqrt(2 * Math.PI ** 2 * E / Fy);
  if (!(lam >= 0)) return { Cc, Fa: NaN, inel: true };
  if (lam <= Cc) return { Cc, inel: true, Fa: (1 - lam * lam / (2 * Cc * Cc)) * Fy / (5 / 3 + 3 * lam / (8 * Cc) - lam ** 3 / (8 * Cc ** 3)) };
  return { Cc, inel: false, Fa: 12 * Math.PI ** 2 * E / (23 * lam * lam) };
}

function wfCalc(st, lib = colLib()) {
  const T = WF_TYPES[st.type] || WF_TYPES.t4;
  const H = colF(st.info.H), g = colF(st.gamma), pmax = colF(st.pmax), lin = st.pmode === "lin";
  const cap = lin && pmax > 0 ? pmax / 10 : Infinity;                    // 1 t/m² = 0.1 kgf/cm²
  const pb = lin ? Math.min(g * H / 1000, cap) : g * (1.5 + 0.2 * (H / 100 - 1.5)) / 10;   // 牆底側壓力 kgf/cm²
  const pAt = depth => lin ? Math.min(g * depth / 1000, cap) : pb * depth / H;
  const sp = COL_SPECIES.find(x => x.id === st.species);
  const mat = k => { const m = lib.find(p => p.id === st.sel[k]); if (!m) return m;
    if (m.wood) return { ...m, fb: sp?.fb || "", fv: sp?.fv || "", E: sp?.E || "", spn: sp?.n || "未選樹種" };
    if (m.steel) return { ...m, fb: COL_STEEL.fb, fv: COL_STEEL.fv, E: COL_STEEL.E, spn: "鋼材" };
    if (m.bolt) { const ft = colF(st.tieFt); return { ...m, ta: ft > 0 ? String(+(ft * colF(m.A)).toFixed(1)) : "" }; }
    return m; };
  const meth = COL_METHODS[st.meth] || COL_METHODS.r, tiers = [], err = [];
  const pipe = T.sup === "pipe" ? wfPipeSect(st.pipe) : null, Fy = colF(COL_STEEL.fy), Es = colF(COL_STEEL.E);
  let lo = 0;
  st.tiers.forEach((t, i) => {
    const last = i === st.tiers.length - 1, hi = last ? H : colF(t.top);
    if (!last && !err.length && !(hi > lo && hi < H)) err.push(`${COL_TIER_N[i]}的最高高度須介於 ${fmt(lo, 0)} 與牆高 ${fmt(H, 0)} cm 之間`);
    const P = pAt(H - lo), gap = {};
    for (const k of ["H1", "B2", "H3", "H4", "B4", "ang", "Lu"]) gap[k] = colF(t[k]);
    if (st.type !== "t3" && !(gap.H4 > 0)) gap.H4 = gap.H3;              // 四層模、單面模：H4 空白 = H3
    const mems = T.mems.map(x => colMember(x, mat(x.k), gap[x.span], x.trib ? gap[x.trib] : 100, P, meth, colPlyT(mat("ply")), x.kind === "ply" ? st.defP : st.defB));
    tiers.push({ i, lo, hi, P, gap, mems });
    lo = hi;
  });
  // 支撐：螺桿或鋼管斜撐
  const braces = [];
  if (T.sup === "pipe" && !err.length && H > 0) {
    // 自動模式：從牆底按各階 H4 往上排，支撐點所在（或剛越過）的階層決定下一支的間距；超過牆頂不排
    let z = 0;
    while (braces.length < 200) {
      const ti = tiers.findIndex(t => z < t.hi); if (ti < 0) break;
      const s = tiers[ti].gap.H4; if (!(s > 0)) break;
      z += s; if (z > H + 1e-9) break;
      braces.push({ z, ti });
    }
  }
  tiers.forEach(t => {
    if (T.sup === "tie") { t.sup = { t: "拉力 T", v: t.P * t.gap.B4 * t.gap.H4, a: colF(mat("tie")?.ta), u: "kgf", d: 0 }; }
    else {
      const th = t.gap.ang, rad = th * Math.PI / 180, mine = braces.filter(b => b.ti === t.i);
      const okAng = st.manual ? th >= 0 && th < 90 : th > 0 && th < 90;
      const zmax = mine.length ? Math.max(...mine.map(b => b.z)) : NaN;
      const L = st.manual ? t.gap.Lu : zmax / Math.sin(rad);
      const Hf = t.P * t.gap.H4 * t.gap.B4, N = okAng ? Hf / Math.cos(rad) : NaN;
      const lam = pipe ? L / pipe.r : NaN, f = wfFa(lam, Fy, Es);
      t.br = { th, okAng, n: mine.length, zmax, L, Hf, N, lam, ...f };
      t.sup = { t: "壓應力 fc", v: pipe && L > 0 ? N / pipe.A : NaN, a: f.Fa, u: "kgf/cm²", d: 1 };
    }
    t.all = [...t.mems.flatMap(m => m.checks), t.sup];
  });
  const all = tiers.flatMap(t => t.all);
  return { T, H, g, cap, pb, pAt, meth, tiers, err, mat, sp, pipe, braces, lin,
    ng: all.filter(x => colJudge(x)[1] === "bad").length, miss: all.filter(x => colJudge(x)[1] === "").length };
}

/* ---------- 配置示意圖 ---------- */
function wfLayoutSvg(r, st) {
  const H = r.H, Wl = colF(st.info.len) > 0 ? colF(st.info.len) : 200, T = r.T;
  if (!(H > 0) || r.err.length) return `<p class="cnote">填好牆高與各階間距後，這裡會畫出配置示意圖。</p>`;
  const pw = 64, gapX = 26, x0 = 34, y0 = 10, ph = 300, k = ph / H, kx = pw / Wl, cap = 120;
  const Y = z => y0 + ph - z * k, out = [];
  const panels = [];
  const rowsOf = (t, s) => { const a = []; if (!(s > 0)) return a; for (let z = t.lo + s / 2; z < t.hi && a.length < cap; z += s) a.push(z); return a; };
  const colsOf = s => { const a = []; if (!(s > 0)) return a; const n = Math.min(cap, Math.floor(Wl / s + 1e-9)); const s0 = (Wl - n * s) / 2; for (let j = 0; j <= n; j++) a.push(s0 + j * s); return a; };
  const hl = z => `<line x1="0" x2="${pw}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" stroke="currentColor" stroke-width="1.2"/>`;
  const dot = (x, z) => `<circle cx="${(x * kx).toFixed(1)}" cy="${Y(z).toFixed(1)}" r="2.4" fill="currentColor"/>`;
  panels.push(["襯板及小格柵", `<rect x="0" y="${y0}" width="${pw}" height="${ph}" fill="currentColor" fill-opacity=".12"/>` + r.tiers.map(t => rowsOf(t, t.gap.H1).map(hl).join("")).join("")]);
  panels.push(["第一層大格柵", r.tiers.map(t => colsOf(t.gap.B2).map(x => `<line x1="${(x * kx).toFixed(1)}" x2="${(x * kx).toFixed(1)}" y1="${Y(t.hi).toFixed(1)}" y2="${Y(t.lo).toFixed(1)}" stroke="currentColor" stroke-width="2.5"/>`).join("")).join("")]);
  if (T.mems.some(m => m.k === "w2")) panels.push(["第二層大格柵", r.tiers.map(t => rowsOf(t, t.gap.H3).map(z => `<rect x="-5" y="${(Y(z) - 1.8).toFixed(1)}" width="${pw + 10}" height="3.6" fill="currentColor"/>`).join("")).join("")]);
  if (T.sup === "tie") panels.push(["螺桿", r.tiers.map(t => rowsOf(t, t.gap.H4).map(z => colsOf(t.gap.B4).map(x => dot(x, z)).join("")).join("")).join("")]);
  else panels.push(["斜撐位置", r.braces.map(b => colsOf(r.tiers[b.ti].gap.B4).map(x => dot(x, b.z)).join("")).join("")]);
  panels.forEach(([title, body], i) => out.push(`<g transform="translate(${x0 + i * (pw + gapX)},0)"><rect x="0" y="${y0}" width="${pw}" height="${ph}" fill="none" stroke="currentColor" opacity=".35"/>${body}<text x="${pw / 2}" y="${y0 + ph + 16}" text-anchor="middle" font-size="10" fill="currentColor">${title}</text></g>`));
  let totalW = x0 + panels.length * pw + (panels.length - 1) * gapX;
  if (T.sup === "pipe") {   // 側視：牆、地面、斜撐
    const sw = 96, sx = totalW + gapX, ds = r.braces.map(b => { const a = r.tiers[b.ti].gap.ang; return a > 0 && a < 90 ? b.z / Math.tan(a * Math.PI / 180) : NaN; });
    const dmax = Math.max(1, ...ds.filter(Number.isFinite)), kk = Math.min(k, (sw - 12) / dmax);
    out.push(`<g transform="translate(${sx},0)"><rect x="0" y="${y0}" width="6" height="${ph}" fill="currentColor" fill-opacity=".35"/>
      <line x1="0" x2="${sw}" y1="${Y(0)}" y2="${Y(0)}" stroke="currentColor"/>
      ${r.braces.map((b, j) => Number.isFinite(ds[j]) ? `<line x1="6" y1="${Y(b.z).toFixed(1)}" x2="${(6 + ds[j] * kk).toFixed(1)}" y2="${Y(0)}" stroke="currentColor" stroke-width="1.6"/>` : "").join("")}
      <text x="${sw / 2}" y="${y0 + ph + 16}" text-anchor="middle" font-size="10" fill="currentColor">側視（斜撐）</text></g>`);
    totalW = sx + sw;
  }
  const marks = r.tiers.map(t => `<line x1="${x0 - 30}" x2="${totalW}" y1="${Y(t.hi).toFixed(1)}" y2="${Y(t.hi).toFixed(1)}" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/>
    <text x="4" y="${((Y(t.lo) + Y(t.hi)) / 2 + 3).toFixed(1)}" font-size="9" fill="currentColor">${COL_TIER_N[t.i]}</text>`).join("");
  return `<svg class="cfsvg cflay" viewBox="0 0 ${totalW} ${y0 + ph + 24}" role="img" aria-label="牆模板配置示意圖">${marks}${out.join("")}</svg>
    <p class="cnote" style="margin-top:0">依輸入的牆長${colF(st.info.len) > 0 ? "" : "（未填，暫以 200 cm 繪製）"}、牆高與各階間距繪製（高、寬分別縮放${T.sup === "pipe" ? "；側視的水平方向另外縮放" : ""}），供核對配置用。</p>`;
}

const wfPressNote = r => r.lin ? "P = γ × 深度" + (Number.isFinite(r.cap) ? "，取上限較小值" : "") : "P = 1.5Wo + 0.2Wo × (H − 1.5)，沿高度線性遞減至牆頂為 0（參考網站採用，非規範原文）";

/* ---------- 畫面 ---------- */
function tabWallForm(box) {
  const st = wfLoad();
  let lib = colLib();
  const inp = (path, val, ph = "", extra = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}" ${extra}>`;
  const matOpts = (kind, cur) => `<option value="">請選擇</option>${lib.filter(p => p.kind === kind).map(p => `<option value="${esc(p.id)}" ${p.id === cur ? "selected" : ""}>${esc(p.n || "（未命名）")}</option>`).join("")}`;
  const sel = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const draw = () => {
    const T = WF_TYPES[st.type], tn = st.tiers.length, pipeSel = WF_PIPES.find(p => p.D === st.pipe.D && p.t === st.pipe.t)?.id || "";
    const gaps = st.manual && T.sup === "pipe" ? [...T.gaps, "Lu"] : T.gaps;
    box.innerHTML = `
      <div class="cfsteps"><a href="#wf1">1 基本資料</a><a href="#wf2">2 材料規格</a><a href="#wf3">3 配置條件</a><a href="#wf4">4 檢核結果</a></div>
      <section class="panel" id="wf1"><h2><span class="cfno">1</span>基本資料</h2>
        <div class="field"><label>模板型式</label>${sel("type", Object.entries(WF_TYPES).map(([k, t]) => [k, t.n + (t.sup === "pipe" ? "（鋼管斜撐）" : "（螺桿對拉）")]), st.type)}</div>
        <div class="grid2">
          <div class="field"><label>工程名稱</label><input data-p="info.proj" value="${esc(st.info.proj)}" placeholder="例：○○新建工程"></div>
          <div class="field"><label>位置／樓層</label><input data-p="info.loc" value="${esc(st.info.loc)}" placeholder="例：地下一層外牆"></div>
          <div class="field"><label>構件編號</label><input data-p="info.no" value="${esc(st.info.no)}" placeholder="例：W1"></div>
          <div class="field"><label>牆高（一次澆置高度，cm）</label>${inp("info.H", st.info.H, "例：300")}</div>
          <div class="field"><label>牆長（cm，畫圖用）</label>${inp("info.len", st.info.len)}</div>
          <div class="field"><label>牆厚（cm，記錄用）</label>${inp("info.thk", st.info.thk)}</div>
          <div class="field"><label>側壓力計算方式</label>${sel("pmode", [["ref", "1.5Wo + 0.2Wo(H − 1.5)"], ["lin", "γ × 深度（可設上限）"]], st.pmode)}</div>
          <div class="field"><label>混凝土單位重 Wo（t/m³）</label>${inp("gamma", st.gamma)}</div>
          ${st.pmode === "lin" ? `<div class="field"><label>側壓力上限（t/m²，可空白）</label>${inp("pmax", st.pmax, "依採用公式自行計算")}</div>` : ""}
          <div class="field"><label>計算人員</label><input data-p="info.who" value="${esc(st.info.who)}"></div>
        </div>
        <p class="cnote">${st.pmode === "lin" ? "側壓力 P = γ × 深度；填了上限就取較小值。" : "牆底側壓力 P = 1.5Wo + 0.2Wo × (H − 1.5)（H 以公尺計），往上線性遞減到牆頂為 0。此式取自你指定的參考網站，非規範原文。"}採用哪一條側壓力公式請依施工規範與契約。</p></section>
      <section class="panel" id="wf2"><h2><span class="cfno">2</span>材料規格</h2>
        <div class="grid2">
          <div class="field"><label>木材樹種（襯板及木角材）</label><select data-p="species"><option value="">請選擇</option>${COL_SPECIES.map(x => `<option value="${x.id}" ${st.species === x.id ? "selected" : ""}>${x.n}</option>`).join("")}</select></div>
          <div class="field"><label>襯板撓度檢核標準</label><select id="wfDefP">${COL_DEFP.map(([v, l]) => `<option value="${v}" ${v === (st.defP.a === "3" && !st.defP.n ? "a3" : st.defP.n === "240" && !st.defP.a ? "n240" : "") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          ${T.mems.map(x => `<div class="field"><label>${x.n}</label><select data-p="sel.${x.k}" data-kind="${x.kind}">${matOpts(x.kind, st.sel[x.k])}</select></div>`).join("")}
          ${T.sup === "tie" ? `<div class="field"><label>螺桿</label><select data-p="sel.tie" data-kind="tie">${matOpts("tie", st.sel.tie)}</select></div>
          <div class="field"><label>螺桿容許拉應力 Ft（kgf/cm²）</label>${inp("tieFt", st.tieFt, "參考網站 1800")}</div>` : `
          <div class="field"><label>鋼管斜撐</label><select id="wfPipe">${WF_PIPES.map(p => `<option value="${p.id}" ${p.id === pipeSel ? "selected" : ""}>${p.n}</option>`).join("")}<option value="" ${pipeSel ? "" : "selected"}>自訂</option></select></div>
          <div class="field"><label>鋼管外徑 D（cm）</label>${inp("pipe.D", st.pipe.D)}</div>
          <div class="field"><label>鋼管厚度 t（cm）</label>${inp("pipe.t", st.pipe.t)}</div>`}
          <div class="field"><label>構件計算方式</label>${sel("meth", Object.entries(COL_METHODS).map(([k, x]) => [k, x.n]), st.meth)}</div>
          <div class="field"><label>襯板撓度限制 L／?</label>${inp("defP.n", st.defP.n, "可空白")}</div>
          <div class="field"><label>襯板撓度上限（mm）</label>${inp("defP.a", st.defP.a, "可空白")}</div>
          <div class="field"><label>格柵撓度限制 L／?</label>${inp("defB.n", st.defB.n, "可空白")}</div>
          <div class="field"><label>格柵撓度上限（mm）</label>${inp("defB.a", st.defB.a, "可空白")}</div>
        </div>
        <p class="cnote">撓度兩個都填時取較嚴者。內建木料的容許應力與 E 值依所選樹種、鋼角材與鋼管依鋼材。${T.sup === "tie" ? "內建螺桿的容許拉力 = Ft × 斷面積；Ft 預設 1800 kgf/cm² 是參考網站的螺桿資料（18 kgf/mm²），非規範原文，請依螺桿規格核對。" : "鋼管的容許壓應力由細長比計算（Fy、E 依鋼材參考值）。"}</p>
        <details class="cflibbox"><summary>材料參數與斷面資料</summary>
          ${colRefHtml(st.species, T.sup === "pipe" ? (() => { const q = wfPipeSect(WF_PIPES[0]); return `<h3 class="cfh">鋼管斜撐</h3><div class="tblwrap"><table class="ct cfref"><tr><th>規格</th><th>A<br><small>cm²</small></th><th>I<br><small>cm⁴</small></th><th>S<br><small>cm³</small></th><th>r<br><small>cm</small></th></tr><tr><th>${WF_PIPES[0].n}</th><td>${fmt(q.A, 3)}</td><td>${fmt(q.I, 3)}</td><td>${fmt(q.S, 3)}</td><td>${fmt(q.r, 3)}</td></tr></table></div>`; })() : "")}
          <h3 class="cfh">自建材料</h3>
          <p class="cnote" style="margin-top:0">與柱模板共用。內建以外的材料可在這裡新增，容許值請依材料規格填寫；資料存在這支手機。</p>
          <div id="wfLib">${lib.filter(p => !p.preset).map(colLibCard).join("")}</div>
          <div class="row">${Object.keys(COL_KINDS).map(k => `<button type="button" class="sec" data-ladd="${k}">＋ ${{ ply: "襯板", beam: "格柵材", tie: "螺桿" }[k]}</button>`).join("")}</div></details></section>
      <section class="panel" id="wf3"><h2><span class="cfno">3</span>配置條件（cm）</h2>
        ${T.sup === "pipe" ? `<label class="wfchk"><input type="checkbox" id="wfManual" ${st.manual ? "checked" : ""}> 自行輸入各階最大未支撐長度</label>` : ""}
        <div class="tblwrap"><table class="ct cftiers"><tr><th>項目</th>${st.tiers.map((_, i) => `<th>${COL_TIER_N[i]}</th>`).join("")}</tr>
          <tr><th>階層最高高度</th>${st.tiers.map((t, i) => i === tn - 1 ? `<td class="cfro">${esc(st.info.H) || "牆高"}</td>` : `<td>${inp(`tiers.${i}.${"top"}`, t.top)}</td>`).join("")}</tr>
          ${gaps.map(k => `<tr><th>${wfGapName(k, T.sup)}</th>${st.tiers.map((t, i) => `<td>${inp(`tiers.${i}.${k}`, t[k], k === "H4" && st.type !== "t3" ? "同H3" : "")}</td>`).join("")}</tr>`).join("")}</table></div>
        <div class="row">${tn < COL_MAX_TIERS ? `<button type="button" class="sec" id="wfTierAdd">＋ 增加一階</button>` : ""}${tn > 1 ? `<button type="button" class="sec" id="wfTierDel">－ 減少一階</button>` : ""}</div>
        <p class="cnote">由下往上分階（第一階在最底下），最上一階到牆頂。${st.type === "t3" ? "三層模的第一層大格柵以螺桿垂直間距 H4 為跨距。" : `${T.sup === "pipe" ? "斜撐" : "螺桿"}垂直間距 H4 空白時等於 H3。`}${T.sup === "pipe" ? (st.manual ? "手動模式：每階以輸入的最大未支撐長度檢核該階每一支斜撐，夾角可為 0°（水平橫撐）。" : "自動模式：從牆底按各階 H4 往上排斜撐，到達或超過階界後下一支才換下一階的間距，不排到牆頂以上；跨界的斜撐沿用產生它那一階的夾角與水平間距。支撐長 L = 支撐點高度 ÷ sinθ（另一端假定在基準地面）；0° 水平橫撐請改用手動模式。") : ""}</p>
        <h3 class="cfh">側壓力分布圖</h3><div id="wfPsvg"></div>
        <h3 class="cfh">牆模板配置示意圖</h3><div id="wfLay"></div></section>
      <section class="panel" id="wf4"><h2><span class="cfno">4</span>檢核結果</h2><div id="wfRes"></div>
        <div class="row"><a class="btnlink" href="#/calc/wall/sheet" id="wfSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="wfClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁只做數值計算：各構件視為均布載重的梁，每一階以該階最深處的側壓力檢核。容許值由你輸入或取自參考表，結果僅供施工規劃參考；模板支撐的安全仍應依施工規範、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    wfSave(st);
    const r = wfCalc(st, lib), T = r.T;
    $("#wfPsvg").innerHTML = (colPressureSvg(r, "牆底") || `<p class="cnote">請填牆高與單位重</p>`) + (r.H > 0 && r.g > 0 ? `<p class="cnote" style="margin-top:0">牆底 P = ${fmt(r.pb, 3)} kgf/cm²；${esc(wfPressNote(r))}</p>` : "");
    $("#wfLay").innerHTML = wfLayoutSvg(r, st);
    if (r.err.length) { $("#wfRes").innerHTML = r.err.map(e => `<p class="cnote" style="color:var(--bad)">${esc(e)}</p>`).join(""); return; }
    const cell = c => { const [j, cls] = colJudge(c); return Number.isFinite(c.v) ? `<td class="${cls}">${c.a > 0 ? fmt(c.v / c.a, 2) : fmt(c.v, c.d)}<small>${c.a > 0 ? j : c.u}</small></td>` : `<td>—</td>`; };
    const supN = T.sup === "tie" ? "螺桿" : "鋼管斜撐";
    const rows = [...T.mems.flatMap((x, mi) => r.tiers[0].mems[mi].checks.map((cc, ci) => `<tr><th>${ci ? "" : x.n + "<br>"}<small>${cc.t}</small></th>${r.tiers.map(t => cell(t.mems[mi].checks[ci])).join("")}</tr>`)),
      `<tr><th>${supN}<br><small>${r.tiers[0].sup.t}</small></th>${r.tiers.map(t => cell(t.sup)).join("")}</tr>`];
    const supDet = t => T.sup === "tie" ? `<p class="cfdh">螺桿：T = P × B4 × H4 = ${fmt(t.P, 3)} × ${fmt(t.gap.B4, 1)} × ${fmt(t.gap.H4, 1)}</p>
        <div class="big"><span>拉力 T</span><b>${fmt(t.sup.v, 0)}${t.sup.a > 0 ? ` ／ ${fmt(t.sup.a, 0)}` : ""} kgf <em class="cfj ${colJudge(t.sup)[1]}">${colJudge(t.sup)[0]}</em></b></div>`
      : `<p class="cfdh">鋼管斜撐：θ ${fmt(t.br.th, 1)}°${t.br.okAng ? "" : "（夾角須介於 0～90 度" + (st.manual ? "" : "，自動模式不可 0°") + "）"}；${st.manual ? "手動輸入 L" : `本階 ${t.br.n} 支，最高支撐點 ${fmt(t.br.zmax, 1)} cm`}<br>
        H = P × H4 × B4 = ${fmt(t.P, 3)} × ${fmt(t.gap.H4, 1)} × ${fmt(t.gap.B4, 1)} = ${fmt(t.br.Hf, 1)} kgf；N = H ÷ cosθ = ${fmt(t.br.N, 1)} kgf<br>
        L = ${fmt(t.br.L, 1)} cm；λ = L ÷ r = ${fmt(t.br.lam, 1)}（K = 1）；Cc = ${fmt(t.br.Cc, 1)}，採${t.br.inel ? "非彈性" : "彈性"}挫曲公式</p>
        <div class="big"><span>壓應力 fc</span><b>${fmt(t.sup.v, 1)}${t.sup.a > 0 ? ` ／ Fa ${fmt(t.sup.a, 1)}` : ""} kgf/cm² <em class="cfj ${colJudge(t.sup)[1]}">${colJudge(t.sup)[0]}</em></b></div>`;
    $("#wfRes").innerHTML = `<div class="big"><span>總結</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過容許值</em>` : r.miss ? `<span style="font-size:15px;color:var(--mut)">還有 ${r.miss} 項未完成（缺間距、材料或容許值）</span>` : `<em class="cfj ok">全部在容許值以內</em>`}</b></div>
      <div class="tblwrap"><table class="ct cfres"><tr><th>構件（${T.n}）</th>${r.tiers.map(t => `<th>${COL_TIER_N[t.i]}<br><small>P ${fmt(t.P, 3)}</small></th>`).join("")}</tr>${rows.join("")}</table></div>
      <p class="cnote">表中數字為「計算值 ÷ 容許值」，≤ 1 為 OK；未填容許值時顯示計算值。P 單位 kgf/cm²。</p>
      ${r.tiers.map(t => `<details class="cfdet"><summary>${COL_TIER_N[t.i]}（${fmt(t.lo, 0)}～${fmt(t.hi, 0)} cm）計算明細</summary>
        ${t.mems.map(m => `<p class="cfdh">${colMemText(m, fmt)}</p>
          ${m.checks.map(c => `<div class="big"><span>${c.t}</span><b>${fmt(c.v, c.d)}${c.a > 0 ? ` ／ ${fmt(c.a, c.d)}` : ""} ${c.u} <em class="cfj ${colJudge(c)[1]}">${colJudge(c)[0]}</em></b></div>`).join("")}`).join("")}
        ${supDet(t)}</details>`).join("")}`;
  };
  const refreshSelects = () => box.querySelectorAll("select[data-kind]").forEach(s => { s.innerHTML = matOpts(s.dataset.kind, st.sel[s.dataset.p.split(".")[1]]); });
  const redrawKeep = () => { draw(); box.querySelector(".cflibbox").open = true; };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = () => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      o[last] = el.value;
      if (el.dataset.p === "type" || el.dataset.p === "pmode") return draw();
      if (el.dataset.p === "info.H") { const ro = box.querySelector(".cfro"); if (ro) ro.textContent = el.value || "牆高"; }
      if (el.dataset.p.startsWith("pipe.")) { const s = $("#wfPipe"); if (s) s.value = WF_PIPES.find(p => p.D === st.pipe.D && p.t === st.pipe.t)?.id || ""; }
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
      const p = lib.find(x => x.id === b.dataset.ldel); if (!p || !confirm(`刪除材料「${p.n || "未命名"}」？（柱模板也會一併刪除）`)) return;
      lib = lib.filter(x => x !== p); colLibSave(lib); for (const k in st.sel) if (st.sel[k] === p.id) st.sel[k] = ""; redrawKeep();
    });
    $("#wfDefP").onchange = e => { const v = e.target.value; if (!v) return; st.defP = v === "a3" ? { n: "", a: "3" } : { n: "240", a: "" }; box.querySelector('[data-p="defP.n"]').value = st.defP.n; box.querySelector('[data-p="defP.a"]').value = st.defP.a; calc(); };
    $("#wfPipe") && ($("#wfPipe").onchange = e => { const p = WF_PIPES.find(x => x.id === e.target.value); if (!p) return; st.pipe = { D: p.D, t: p.t }; box.querySelector('[data-p="pipe.D"]').value = p.D; box.querySelector('[data-p="pipe.t"]').value = p.t; calc(); });
    $("#wfManual") && ($("#wfManual").onchange = e => { st.manual = e.target.checked ? "1" : ""; draw(); });
    $("#wfTierAdd") && ($("#wfTierAdd").onclick = () => { const last = st.tiers[st.tiers.length - 1]; st.tiers.push({ ...last, top: "" }); draw(); });
    $("#wfTierDel") && ($("#wfTierDel").onclick = () => { st.tiers.pop(); st.tiers[st.tiers.length - 1].top = ""; draw(); });
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#wfClear").onclick = () => { if (!confirm("清除牆模板的輸入？（材料庫會保留）")) return; Object.assign(st, wfBlank()); draw(); };
    $("#wfSheet").onclick = e => { e.preventDefault(); location.hash = "#/calc/wall/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderWallSheet() {
  const st = wfLoad(), r = wfCalc(st), T = r.T, company = ls.get("company", "");
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const crow = c => { const [j] = colJudge(c); return `<tr><td>${c.t}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${c.a > 0 ? v(c.a, c.d) : "—"}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${j}</td></tr>`; };
  const matRow = (label, m, extra) => `<tr><td>${label}</td><td colspan="3">${m ? esc(m.n || "未命名") + (colSectText(m) ? "：" + esc(colSectText(m)) : "") + extra(m) : "未選擇"}</td></tr>`;
  const allow = m => `${m.wood ? `；${esc(m.spn)}` : ""}；fb ${esc(m.fb) || "—"}、fv ${esc(m.fv) || "—"}、E ${esc(m.E) || "—"} kgf/cm²`;
  const lim = d => [d.n ? "L/" + esc(d.n) : "", d.a ? esc(d.a) + " mm" : ""].filter(Boolean).join("、") || "未填";
  const gaps = st.manual && T.sup === "pipe" ? [...T.gaps, "Lu"] : T.gaps;
  const supRows = t => T.sup === "tie" ? `<tr><td colspan="6">螺桿：T = P × B4 × H4</td></tr>${crow(t.sup)}`
    : `<tr><td colspan="6">鋼管斜撐：θ = ${v(t.br.th, 1)}°，H = P × H4 × B4 = ${v(t.br.Hf, 1)} kgf，N = H／cosθ = ${v(t.br.N, 1)} kgf，L = ${v(t.br.L, 1)} cm${st.manual ? "（手動輸入）" : `（最高支撐點 ${v(t.br.zmax, 1)} cm ÷ sinθ）`}，λ = L／r = ${v(t.br.lam, 1)}，Cc = ${v(t.br.Cc, 1)}，採${t.br.inel ? "非彈性" : "彈性"}挫曲公式求 Fa</td></tr>${crow(t.sup)}`;
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="wfBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">牆身模板計算書（${T.n}）</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(st.info.proj)}</td></tr>
        <tr><td>位置／樓層</td><td>${esc(st.info.loc)}</td><td>構件編號</td><td>${esc(st.info.no)}</td></tr>
        <tr><td>牆高</td><td>${esc(st.info.H)} cm</td><td>牆厚／牆長</td><td>${esc(st.info.thk) || "—"} ／ ${esc(st.info.len) || "—"} cm</td></tr>
        <tr><td>單位重 Wo</td><td>${esc(st.gamma)} t/m³</td><td>牆底側壓力</td><td>${v(r.pb, 3)} kgf/cm²</td></tr>
        <tr><td>側壓力</td><td colspan="3">${esc(wfPressNote(r))}${r.lin && colF(st.pmax) > 0 ? `；上限 ${esc(st.pmax)} t/m²` : ""}</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="4">二、材料規格</th></tr>
        <tr><td>計算方式</td><td colspan="3">${colMethText(st.meth)}</td></tr>
        ${T.mems.map(x => matRow(x.n, r.mat(x.k), allow)).join("")}
        ${T.sup === "tie" ? matRow("螺桿", r.mat("tie"), m => `${m.bolt ? `；Ft ${esc(st.tieFt) || "—"} kgf/cm²` : ""}；容許拉力 ${esc(m.ta) || "—"} kgf`)
          : `<tr><td>鋼管斜撐</td><td colspan="3">圓管 D${esc(st.pipe.D)} × t${esc(st.pipe.t)} cm：A ${v(r.pipe?.A, 3)} cm²、I ${v(r.pipe?.I, 3)} cm⁴、r ${v(r.pipe?.r, 3)} cm；Fy ${COL_STEEL.fy}、E ${COL_STEEL.E} kgf/cm²</td></tr>`}
        <tr><td>撓度限制</td><td colspan="3">襯板：${lim(st.defP)}；格柵：${lim(st.defB)}</td></tr>
        <tr><td colspan="4" style="font-size:9pt">木材與鋼材容許應力、內建斷面${T.sup === "tie" ? "、螺桿斷面積及 Ft 預設值" : "及鋼管規格"}依使用者提供之參考資料（非規範原文）。</td></tr>
      </table>
      <table class="pt">
        <tr><th>三、配置條件（cm）</th>${r.tiers.map(t => `<th>${COL_TIER_N[t.i]}</th>`).join("")}</tr>
        <tr><td>高度範圍</td>${r.tiers.map(t => `<td class="c">${v(t.lo, 0)}～${v(t.hi, 0)}</td>`).join("")}</tr>
        ${gaps.map(k => `<tr><td>${wfGapName(k, T.sup)}</td>${r.tiers.map(t => `<td class="c">${v(t.gap[k], 1)}</td>`).join("")}</tr>`).join("")}
        <tr><td>設計側壓力 P（kgf/cm²）</td>${r.tiers.map(t => `<td class="c">${v(t.P, 3)}</td>`).join("")}</tr>
      </table>
      ${r.err.length ? `<p>${r.err.map(esc).join("<br>")}</p>` : `<figure class="cffig">${colPressureSvg(r, "牆底")}${wfLayoutSvg(r, st)}</figure>
      ${r.tiers.map(t => `<table class="pt">
        <tr><th colspan="6">${["四", "五", "六", "七"][t.i]}、${COL_TIER_N[t.i]}檢核（${v(t.lo, 0)}～${v(t.hi, 0)} cm，P = ${v(t.P, 3)} kgf/cm²）</th></tr>
        <tr><th>項目</th><th>計算值</th><th>容許值</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${t.mems.map(m => `<tr><td colspan="6">${colMemText(m, v)}</td></tr>${m.checks.map(crow).join("")}`).join("")}
        ${supRows(t)}
      </table>`).join("")}`}
      <table class="pt"><tr><th>檢核結果</th><td>${r.err.length ? "分階高度有誤" : r.ng ? `${r.ng} 項超過容許值` : r.miss ? `尚有 ${r.miss} 項未完成` : "全部在容許值以內"}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：構件以均布載重之梁計算，各階以該階最深處之側壓力檢核。材料容許值、撓度限制與側壓力公式由計算人員依材料規格、施工規範與契約確認，本計算書僅供施工規劃參考。計算日期：${esc(today())}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#wfBack").onclick = () => goBack("#/calc/wall");
  $("#pvPrint").onclick = doPrint;
}

CALC_TABS.push(["wall", "牆模板", tabWallForm]);
