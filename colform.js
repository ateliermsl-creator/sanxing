"use strict";
/* 柱模板檢核（工程計算機的「柱模板」分頁，另有 A4 計算書 #/calc/col/sheet）
   畫面分三步：1 基本資料 → 2 材料規格（從自建材料庫下拉選擇）→ 3 配置條件（依高度分階），下方即時顯示檢核結果。
   傳力路徑：側壓力 → 襯板 → 小格柵 → 第一層大格柵 → 第二層大格柵 → 螺桿。
   ‧側壓力：深度 d 處 P = γ × d，可填「側壓力上限」（依採用的公式自行計算）取較小值；每一階以該階底部（最深處）的側壓力檢核。
   ‧材料容許應力、E 值、撓度限制、螺桿容許拉力：本工具「不內建任何數值」，由使用者建立材料庫（localStorage calcColLib）。
     例外：使用者提供的參考材料表（2026-11-14 截圖）內建為 COL_SPECIES（木材樹種容許應力）與 COL_PRESETS（襯板、木角材斷面），
     畫面註明「依使用者提供的參考表，非規範原文」；木料的 fb、fv、E 依所選樹種。鋼材（Fb、Fv、E）、鋼角材斷面、螺桿斷面積也取自同一參考表；螺桿容許拉應力 Ft 預設 1800（參考網站螺桿資料 18 kgf/mm²，2026-11-14 使用者同意帶入，非規範原文，可改）。
   ‧構件依均布載重的梁，計算方式見 COL_METHODS：預設「參考網站算法」＝襯板簡支（wL²/8、0.5wL、5wL⁴/384EI），格柵 wL²/10、0.6wL、wL⁴/128EI，
     剪應力 fv = k·V/A（矩形 k 1.5、鋼角材 k 1、A = 2ht），小格柵的剪力面積計入襯板厚度 b(h + t襯板)；另可選三跨以上連續（wL⁴/145EI）或簡支。
   ‧單位：長度 cm、力 kgf、應力 kgf/cm²；γ 用 t/m³、側壓力上限用 t/m²。 */

const COL_MEMBERS = [
  // span／trib：跨距、受載寬度取自哪個間距；ply：襯板以 100 cm 寬的板帶計算
  { k: "ply", n: "襯板", kind: "ply", span: "H1", trib: null },
  { k: "stud", n: "小格柵", kind: "beam", span: "B2", trib: "H1" },
  { k: "w1", n: "第一層大格柵", kind: "beam", span: "H3", trib: "B2" },
  { k: "w2", n: "第二層大格柵", kind: "beam", span: "B4", trib: "H3" }
];
const COL_GAPS = [["H1", "小格柵垂直間距 H1"], ["B2", "第一層大格柵水平間距 B2"], ["H3", "第二層大格柵垂直間距 H3"], ["H4", "螺桿垂直間距 H4"], ["B4", "螺桿水平間距 B4"]];
const COL_KINDS = { ply: "襯板", beam: "角材／鋼管（格柵）", tie: "螺桿" };
const COL_COEF = { s: { m: 1 / 8, v: 0.5, d: 384 / 5, n: "簡支", mt: "wL²/8", dt: "5wL⁴/384EI" }, c: { m: 1 / 10, v: 0.6, d: 145, n: "三跨以上連續（近似）", mt: "wL²/10", dt: "wL⁴/145EI" } };
// 構件計算方式：r 依參考網站（2026-11-14 使用者要求「跟網站一樣」）：襯板簡支、格柵 M = wL²/10、δ = wL⁴/128EI，小格柵剪力面積計入襯板厚度
const COL_METHODS = {
  r: { n: "參考網站算法", ply: COL_COEF.s, beam: { m: 1 / 10, v: 0.6, d: 128, mt: "wL²/10", dt: "wL⁴/128EI" }, tp: true },
  c: { n: "三跨以上連續（近似）", ply: COL_COEF.c, beam: COL_COEF.c },
  s: { n: "簡支（保守）", ply: COL_COEF.s, beam: COL_COEF.s }
};
const colMethText = k => { const m = COL_METHODS[k] || COL_METHODS.r, p = m.ply, b = m.beam;
  return `${m.n}：襯板 M = ${p.mt}、V = ${p.v}wL、δ = ${p.dt}；格柵 M = ${b.mt}、V = ${b.v}wL、δ = ${b.dt}${m.tp ? "；小格柵剪力面積計入襯板厚度" : ""}`; };
// 木材樹種（使用者提供的參考表；fc 只供參考，柱模板檢核未用到）
const COL_SPECIES = [
  { id: "c3", n: "針葉樹III類", note: "赤松、黑松、落葉松、鐵杉、北美鐵杉、南方松", fb: "170", fc: "130", fv: "14", E: "70000" },
  { id: "c4", n: "針葉樹IV類", note: "冷杉、樅松、朝鮮松、柳杉、西部側柏、雲杉、杉木、台灣杉、放射松", fb: "150", fc: "120", fv: "12", E: "70000" },
  { id: "h3", n: "闊葉樹III類", note: "柳桉", fb: "180", fc: "140", fv: "12", E: "70000" }
];
// 內建斷面（名稱 a × b：b 為受力方向的深度；與參考表核對：3.6×4.5 → I 27.338、S 12.15；9×4.5 躺置 → I 68.344、S 30.375）
const COL_PRESETS = [
  { id: "p_ply15", kind: "ply", n: "襯板 1.5 cm", sect: "t", t: "1.5" },
  { id: "p_ply18", kind: "ply", n: "襯板 1.8 cm", sect: "t", t: "1.8" },
  { id: "p_b3645", kind: "beam", n: "木角材 3.6 × 4.5 cm", sect: "rect", b: "3.6", h: "4.5", cnt: "1" },
  { id: "p_b7245", kind: "beam", n: "木角材 7.2 × 4.5 cm（3.6 × 4.5 兩支並排）", sect: "rect", b: "3.6", h: "4.5", cnt: "2" },
  { id: "p_b6060", kind: "beam", n: "木角材 6 × 6 cm", sect: "rect", b: "6", h: "6", cnt: "1" },
  { id: "p_b6075", kind: "beam", n: "木角材 6 × 7.5 cm", sect: "rect", b: "6", h: "7.5", cnt: "1" },
  { id: "p_b9045", kind: "beam", n: "木角材 9 × 4.5 cm（躺置－弱軸）", sect: "rect", b: "9", h: "4.5", cnt: "1" },
  { id: "p_b4590", kind: "beam", n: "木角材 4.5 × 9 cm（立置－強軸）", sect: "rect", b: "4.5", h: "9", cnt: "1" }
].map(p => ({ kv: "1.5", ...p, wood: true })).concat([
  // 鋼角材：A、I、S 照參考表（I、S 為受力方向）；剪力面積 A = 2ht（h 4.5、t 管厚），fv = 0.6wL／A（k = 1）
  { id: "p_s7045_23", kind: "beam", n: "鋼角材 7 × 4.5 × 0.23 cm", sect: "custom", A: "2.07", I: "8.824", S: "3.922", h: "4.5", tw: "0.23", kv: "1", cnt: "1", steel: true },
  { id: "p_s7045_25", kind: "beam", n: "鋼角材 7 × 4.5 × 0.25 cm", sect: "custom", A: "2.25", I: "9.448", S: "4.199", h: "4.5", tw: "0.25", kv: "1", cnt: "1", steel: true }
], [["2", "0.236"], ["2.5", "0.369"], ["3", "0.531"], ["3.5", "0.756"], ["4", "0.945"], ["4.5", "1.238"], ["5", "1.571"]].map(([d, a]) => ({ id: "p_t" + d.replace(".", ""), kind: "tie", n: `${d} 分螺桿`, A: a, bolt: true })));
const COL_STEEL = { n: "鋼材", fy: "2400", fb: "1800", fc: "1800", fv: "1200", E: "2100000" };   // 參考表
// 襯板撓度檢核標準（使用者提供：工程慣例 0.3 cm，或依結構混凝土施工規範 4.3.4 取 L/240）
const COL_DEFP = [["", "自行填寫"], ["a3", "0.3 cm（工程慣例）"], ["n240", "L/240（結構混凝土施工規範 4.3.4）"]];
const COL_MAX_TIERS = 4, COL_TIER_N = ["第一階", "第二階", "第三階", "第四階"];

const colStr = v => (typeof v === "string" || typeof v === "number") ? String(v).slice(0, 60) : "";
const colTier = () => ({ top: "", H1: "", B2: "", H3: "", H4: "", B4: "" });
const colBlank = () => ({
  info: { proj: "", loc: "", no: "", bx: "", by: "", H: "", who: "" },
  gamma: "2.4", pmax: "", meth: "r", species: "c3", tieFt: "1800", defP: { n: "", a: "3" }, defB: { n: "", a: "" },
  sel: { ply: "p_ply15", stud: "p_b3645", w1: "p_b9045", w2: "p_b9045", tie: "p_t25" }, tiers: [colTier()]
});
// 讀回存檔時只留下已知欄位、都轉成字串，避免舊資料或改壞的資料影響畫面
function colLoad() {
  const d = colBlank();
  let s; try { s = JSON.parse(ls.get("calcColForm2", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s); pick(d.defP, s.defP); pick(d.defB, s.defB); pick(d.sel, s.sel);
  if (Array.isArray(s.tiers) && s.tiers.length) d.tiers = s.tiers.slice(0, COL_MAX_TIERS).map(t => { const o = colTier(); pick(o, t); return o; });
  return d;
}
const colSave = st => ls.set("calcColForm2", JSON.stringify(st));
const COL_LIB_KEYS = ["id", "kind", "n", "sect", "t", "b", "h", "cnt", "I", "S", "A", "kv", "fb", "fv", "E", "ta"];
function colLib() {
  let a; try { a = JSON.parse(ls.get("calcColLib", "[]")); } catch { a = []; }
  const own = (Array.isArray(a) ? a : []).filter(p => p && COL_KINDS[p.kind]).slice(0, 60).map(p => Object.fromEntries(COL_LIB_KEYS.map(k => [k, colStr(p[k])])));
  return [...COL_PRESETS.map(p => ({ ...p, preset: true })), ...own];
}
const colLibSave = lib => ls.set("calcColLib", JSON.stringify(lib.filter(p => !p.preset)));
const colNewMat = kind => ({ id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, n: "", sect: kind === "ply" ? "t" : "rect", t: "", b: "", h: "", cnt: "1", I: "", S: "", A: "", kv: "1.5", fb: "", fv: "", E: "", ta: "" });

/* ---------- 計算 ---------- */
const colF = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };
// 斷面性質（襯板為 100 cm 寬板帶；格柵乘以並排根數）
function colSect(mat) {
  if (!mat) return null;
  const n = mat.kind === "ply" ? 1 : Math.max(1, colF(mat.cnt) || 1);
  let I, S, A, kv;
  if (mat.sect === "t") { const t = colF(mat.t); I = 100 * t ** 3 / 12; S = 100 * t * t / 6; A = 100 * t; kv = 1.5; }
  else if (mat.sect === "rect") { const b = colF(mat.b), h = colF(mat.h); I = b * h ** 3 / 12; S = b * h * h / 6; A = b * h; kv = 1.5; }
  else { I = colF(mat.I); S = colF(mat.S); A = colF(mat.A); kv = colF(mat.kv) || 1.5; }
  return { I: I * n, S: S * n, A: A * n, kv, n };
}
const colSectText = mat => !mat ? "未選擇" : mat.kind === "tie" ? (mat.A ? `斷面積 ${mat.A} cm²` : "") : mat.sect === "t" ? `板厚 ${mat.t} cm（100 cm 寬板帶）` : mat.sect === "rect" ? `${mat.b} × ${mat.h} cm${+mat.cnt > 1 ? ` × ${mat.cnt} 根` : ""}` : `I ${mat.I} cm⁴、S ${mat.S} cm³、A ${mat.A} cm²${mat.kind === "ply" ? "（每 100 cm 寬）" : +mat.cnt > 1 ? ` × ${mat.cnt} 根` : ""}`;

// 單一構件（均布載重的梁）：彎曲、剪力、撓度；tp 為襯板厚度（小格柵剪力面積用）
function colMember(x, m, L, trib, P, meth, tp, df) {
  const c = x.kind === "ply" ? meth.ply : meth.beam, s = colSect(m);
  const w = P * trib, M = c.m * w * L * L, V = c.v * w * L, E = colF(m?.E), dl = s ? w * L ** 4 / (c.d * E * s.I) : NaN;
  let Av = s ? s.A : NaN, avt = "";
  if (s && meth.tp && x.k === "stud" && tp > 0) {
    if (m.sect === "rect") { Av = s.n * colF(m.b) * (colF(m.h) + tp); avt = `${s.n > 1 ? s.n + " × " : ""}${m.b} × (${m.h} + ${tp})`; }
    else if (m.steel && m.h && m.tw) { Av = s.n * 2 * (colF(m.h) + tp) * colF(m.tw); avt = `2 × (${m.h} + ${tp}) × ${m.tw}`; }
  }
  const lims = [colF(df.n) > 0 ? L / colF(df.n) : NaN, colF(df.a) > 0 ? colF(df.a) / 10 : NaN].filter(Number.isFinite);
  return { x, m, s, L, trib, w, M, V, Av, avt, c, checks: [
    { t: "彎曲 fb", v: s ? M / s.S : NaN, a: colF(m?.fb), u: "kgf/cm²", d: 1 },
    { t: "剪力 fv", v: s ? s.kv * V / Av : NaN, a: colF(m?.fv), u: "kgf/cm²", d: 2 },
    { t: "撓度 δ", v: dl * 10, a: lims.length ? Math.min(...lims) * 10 : NaN, u: "mm", d: 2 }] };
}
// 明細文字
const colMemText = (m, f) => `${m.x.n}：L = ${f(m.L, 1)} cm，w = P × ${m.x.trib || "100"} = ${f(m.w, 3)} kgf/cm，M = ${m.c.mt} = ${f(m.M, 0)} kgf·cm，V = ${m.c.v}wL = ${f(m.V, 1)} kgf，δ = ${m.c.dt}${m.avt ? `，剪力面積 ${m.avt} = ${f(m.Av, 2)} cm²` : ""}`;
const colPlyT = mat => mat && mat.sect === "t" ? colF(mat.t) : NaN;
function colCalc(st, lib = colLib()) {
  const H = colF(st.info.H), g = colF(st.gamma), pmax = colF(st.pmax), cap = pmax > 0 ? pmax / 10 : Infinity;   // 1 t/m² = 0.1 kgf/cm²
  const pAt = depth => Math.min(g * depth / 1000, cap);       // kgf/cm²（γ t/m³ × 深度 cm）
  const sp = COL_SPECIES.find(x => x.id === st.species);
  const mat = k => { const m = lib.find(p => p.id === st.sel[k]); if (!m) return m;
    if (m.wood) return { ...m, fb: sp?.fb || "", fv: sp?.fv || "", E: sp?.E || "", spn: sp?.n || "未選樹種" };
    if (m.steel) return { ...m, fb: COL_STEEL.fb, fv: COL_STEEL.fv, E: COL_STEEL.E, spn: "鋼材" };
    if (m.bolt) { const ft = colF(st.tieFt); return { ...m, ta: ft > 0 ? String(+(ft * colF(m.A)).toFixed(1)) : "" }; }
    return m; };
  const meth = COL_METHODS[st.meth] || COL_METHODS.r, tiers = [], err = [];
  let lo = 0;
  st.tiers.forEach((t, i) => {
    const last = i === st.tiers.length - 1, hi = last ? H : colF(t.top);
    if (!last && !err.length && !(hi > lo && hi < H)) err.push(`${COL_TIER_N[i]}的最高高度須介於 ${fmt(lo, 0)} 與柱高 ${fmt(H, 0)} cm 之間`);
    const P = pAt(H - lo), gap = { H1: colF(t.H1), B2: colF(t.B2), H3: colF(t.H3), B4: colF(t.B4) };
    gap.H4 = colF(t.H4) > 0 ? colF(t.H4) : gap.H3;
    const mems = COL_MEMBERS.map(x => colMember(x, mat(x.k), gap[x.span], x.trib ? gap[x.trib] : 100, P, meth, colPlyT(mat("ply")), x.kind === "ply" ? st.defP : st.defB));
    const tie = { t: "拉力 T", v: P * gap.B4 * gap.H4, a: colF(mat("tie")?.ta), u: "kgf", d: 0 };
    tiers.push({ i, lo, hi, P, gap, mems, tie, all: [...mems.flatMap(m => m.checks), tie] });
    lo = hi;
  });
  const all = tiers.flatMap(t => t.all);
  return { H, g, cap, pAt, meth, tiers, err, mat, sp,
    ng: all.filter(x => colJudge(x)[1] === "bad").length, miss: all.filter(x => colJudge(x)[1] === "").length };
}
const colJudge = c => !Number.isFinite(c.v) ? ["—", ""] : !(c.a > 0) ? ["未填容許值", ""] : c.v <= c.a ? ["OK", "ok"] : ["NG", "bad"];

/* ---------- 圖：側壓力分布、配置示意 ---------- */
function colPressureSvg(r, base = "柱底") {
  if (!(r.H > 0) || !(r.g > 0)) return "";
  const W = 260, Ht = 210, x0 = 40, y0 = 14, pw = 130, ph = 170, pb = r.pAt(r.H), sx = p => x0 + p / pb * pw, sy = z => y0 + (r.H - z) / r.H * ph;
  const pts = [[x0, sy(r.H)]];
  if (Number.isFinite(r.cap) && r.cap < pb) pts.push([sx(r.cap), sy(r.H - r.cap / r.g * 1000)]);
  pts.push([sx(pb), sy(0)], [x0, sy(0)]);
  return `<svg class="cfsvg" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="側壓力分布圖">
    <polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="1.5"/>
    <line x1="${x0}" x2="${x0}" y1="${y0}" y2="${sy(0)}" stroke="currentColor"/><line x1="${x0}" x2="${x0 + pw + 10}" y1="${sy(0)}" y2="${sy(0)}" stroke="currentColor"/>
    <g font-size="10" fill="currentColor">
      <text x="${x0 - 4}" y="${y0 + 4}" text-anchor="end">${fmt(r.H, 0)}</text><text x="${x0 - 4}" y="${sy(0) + 4}" text-anchor="end">0</text>
      ${r.tiers.map(t => `<line x1="${x0}" x2="${x0 + pw + 8}" y1="${sy(t.lo).toFixed(1)}" y2="${sy(t.lo).toFixed(1)}" stroke="currentColor" stroke-dasharray="3 3" opacity=".6"/>
        <circle cx="${sx(t.P).toFixed(1)}" cy="${sy(t.lo).toFixed(1)}" r="2.5"/><text x="${(sx(t.P) + 5).toFixed(1)}" y="${(sy(t.lo) - 3).toFixed(1)}">${COL_TIER_N[t.i]} ${fmt(t.P, 3)}</text>`).join("")}
      <text x="4" y="${Ht - 6}">橫軸：側壓力 P（kgf/cm²）　縱軸：距${base}（cm）</text></g></svg>`;
}
function colLayoutSvg(r, st) {
  const H = r.H, Wc = colF(st.info.bx) > 0 ? colF(st.info.bx) : 60;
  if (!(H > 0) || r.err.length) return `<p class="cnote">填好柱高與各階間距後，這裡會畫出配置示意圖。</p>`;
  const pw = 64, gapX = 30, x0 = 34, y0 = 10, ph = 300, k = ph / H, kx = pw / Wc, fw = pw, fh = ph;   // 高、寬分開縮放，窄柱也看得清楚
  const Y = z => y0 + fh - z * k, out = [], cap = 120;
  const panel = (i, title, body) => { const px = x0 + i * (pw + gapX); out.push(`<g transform="translate(${px},0)"><rect x="0" y="${y0}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="none" stroke="currentColor" opacity=".35"/>${body(fw)}<text x="${(fw / 2).toFixed(1)}" y="${(y0 + fh + 16).toFixed(1)}" text-anchor="middle" font-size="10" fill="currentColor">${title}</text></g>`); };
  const rowsOf = (t, s) => { const a = []; if (!(s > 0)) return a; for (let z = t.lo + s / 2; z < t.hi && a.length < cap; z += s) a.push(z); return a; };
  const colsOf = (s, edge) => { const a = []; if (!(s > 0)) return a; const n = Math.min(cap, Math.floor(Wc / s + 1e-9)); const st0 = (Wc - n * s) / 2; for (let j = edge ? 0 : 0; j <= n; j++) a.push(st0 + j * s); return a; };
  const hl = (z, w, sw, op = 1) => `<line x1="0" x2="${w.toFixed(1)}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" stroke="currentColor" stroke-width="${sw}" opacity="${op}"/>`;
  panel(0, "襯板及小格柵", w => `<rect x="0" y="${y0}" width="${w.toFixed(1)}" height="${fh.toFixed(1)}" fill="currentColor" fill-opacity=".12"/>` + r.tiers.map(t => rowsOf(t, t.gap.H1).map(z => hl(z, w, 1.2)).join("")).join(""));
  panel(1, "第一層大格柵", () => r.tiers.map(t => colsOf(t.gap.B2).map(x => `<line x1="${(x * kx).toFixed(1)}" x2="${(x * kx).toFixed(1)}" y1="${Y(t.hi).toFixed(1)}" y2="${Y(t.lo).toFixed(1)}" stroke="currentColor" stroke-width="2.5"/>`).join("")).join(""));
  panel(2, "第二層大格柵", w => r.tiers.map(t => rowsOf(t, t.gap.H3).map(z => `<rect x="-5" y="${(Y(z) - 1.8).toFixed(1)}" width="${(w + 10).toFixed(1)}" height="3.6" fill="currentColor"/>`).join("")).join(""));
  panel(3, "螺桿", () => r.tiers.map(t => rowsOf(t, t.gap.H4).map(z => colsOf(t.gap.B4).map(x => `<circle cx="${(x * kx).toFixed(1)}" cy="${Y(z).toFixed(1)}" r="2.4" fill="currentColor"/>`).join("")).join("")).join(""));
  const totalW = x0 + 4 * pw + 3 * gapX;
  const marks = r.tiers.map(t => `<line x1="${x0 - 30}" x2="${totalW}" y1="${Y(t.hi).toFixed(1)}" y2="${Y(t.hi).toFixed(1)}" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/>
    <text x="4" y="${((Y(t.lo) + Y(t.hi)) / 2 + 3).toFixed(1)}" font-size="9" fill="currentColor">${COL_TIER_N[t.i]}</text>`).join("");
  return `<svg class="cfsvg cflay" viewBox="0 0 ${totalW} ${(y0 + fh + 24).toFixed(0)}" role="img" aria-label="柱模板配置示意圖">${marks}${out.join("")}</svg>
    <p class="cnote" style="margin-top:0">依輸入的柱寬${colF(st.info.bx) > 0 ? "" : "（未填，暫以 60 cm 繪製）"}、柱高與各階間距繪製（高、寬分別縮放），只畫柱的一面，供核對配置用。</p>`;
}

/* ---------- 畫面 ---------- */
function colLibCard(p) {
  const f = (k, l, ph = "") => `<div class="field"><label>${l}</label><input data-l="${esc(p.id)}" data-lk="${k}" ${k === "n" ? "" : 'inputmode="decimal"'} value="${esc(p[k])}" placeholder="${esc(ph)}"></div>`;
  const sects = p.kind === "ply" ? [["t", "板厚 t"], ["custom", "自行輸入 I、S、A"]] : [["rect", "矩形 b × h"], ["custom", "自行輸入 I、S、A"]];
  return `<div class="cflib" data-card="${esc(p.id)}">
    <div class="cflibtop"><b>${COL_KINDS[p.kind]}</b><button type="button" class="danger" data-ldel="${esc(p.id)}" aria-label="刪除此材料">✕</button></div>
    ${f("n", "名稱", p.kind === "ply" ? "例：膠合板 1.8 cm" : p.kind === "tie" ? "例：○分螺桿" : "例：角材 3.6×4.5")}
    ${p.kind === "tie" ? `<div class="grid2">${f("ta", "容許拉力 Ta（kgf）", "依產品規格")}</div>` : `
    <div class="field"><label>斷面</label><select data-l="${esc(p.id)}" data-lk="sect">${sects.map(([v, l]) => `<option value="${v}" ${p.sect === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    <div class="grid2">${p.sect === "t" ? f("t", "板厚 t（cm）") : p.sect === "rect" ? f("b", "寬 b（cm）") + f("h", "高 h（受力方向，cm）") : f("I", p.kind === "ply" ? "I（cm⁴／100 cm 寬）" : "I（cm⁴／每根）") + f("S", p.kind === "ply" ? "S（cm³／100 cm 寬）" : "S（cm³／每根）") + f("A", p.kind === "ply" ? "A（cm²／100 cm 寬）" : "A（cm²／每根）") + f("kv", "剪應力係數 k", "矩形 1.5")}
      ${p.kind === "beam" ? f("cnt", "並排根數", "雙鋼管填 2") : ""}
      ${f("fb", "容許彎曲應力 fb（kgf/cm²）")}${f("fv", p.kind === "ply" ? "容許（滾動）剪應力 fv" : "容許剪應力 fv（kgf/cm²）")}${f("E", "彈性模數 E（kgf/cm²）")}</div>`}</div>`;
}
// 參考表（木材容許應力、內建斷面、螺桿斷面積）；牆模板也用
function colRefHtml(species, extra = "") {
  return `<h3 class="cfh">木材容許應力（kgf/cm²）</h3>
          <div class="tblwrap"><table class="ct cfref"><tr><th>樹種</th><th>F<sub>b</sub></th><th>F<sub>c</sub></th><th>F<sub>v</sub></th><th>E</th></tr>
            ${COL_SPECIES.map(x => `<tr class="${x.id === species ? "sel" : ""}"><th>${x.n}<small>${x.note}</small></th><td>${x.fb}</td><td>${x.fc}</td><td>${x.fv}</td><td>${Number(x.E).toLocaleString("en")}</td></tr>`).join("")}
            <tr><th>${COL_STEEL.n}<small>F<sub>y</sub> ${COL_STEEL.fy}</small></th><td>${COL_STEEL.fb}</td><td>${COL_STEEL.fc}</td><td>${COL_STEEL.fv}</td><td>${Number(COL_STEEL.E).toLocaleString("en")}</td></tr></table></div>
          <h3 class="cfh">內建斷面</h3>
          <div class="tblwrap"><table class="ct cfref"><tr><th>規格</th><th>A<br><small>cm²</small></th><th>I<br><small>cm⁴</small></th><th>S<br><small>cm³</small></th></tr>
            ${COL_PRESETS.filter(p => !p.bolt).map(p => { const q = colSect(p), w = p.kind === "ply" ? 100 : 1; return `<tr><th>${esc(p.n)}${p.kind === "ply" ? "<small>每 1 cm 寬</small>" : ""}</th><td>${fmt(q.A / w, 3)}</td><td>${fmt(q.I / w, 3)}</td><td>${fmt(q.S / w, 3)}</td></tr>`; }).join("")}</table></div>
          <h3 class="cfh">螺桿斷面積（cm²）</h3>
          <div class="tblwrap"><table class="ct cfref"><tr>${COL_PRESETS.filter(p => p.bolt).map(p => `<th>${esc(p.n.replace(" 螺桿", ""))}</th>`).join("")}</tr><tr>${COL_PRESETS.filter(p => p.bolt).map(p => `<td>${p.A}</td>`).join("")}</tr></table></div>
          ${extra}
          <p class="cnote">以上依使用者提供的參考表（非規範原文），使用前請與契約、規範核對。</p>`;
}

function tabColForm(box) {
  const st = colLoad();
  let lib = colLib();
  const inp = (path, val, ph = "", extra = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}" ${extra}>`;
  const matOpts = (kind, cur) => `<option value="">請選擇</option>${lib.filter(p => p.kind === kind).map(p => `<option value="${esc(p.id)}" ${p.id === cur ? "selected" : ""}>${esc(p.n || "（未命名）")}</option>`).join("")}`;
  const draw = () => {
    const tn = st.tiers.length;
    box.innerHTML = `
      <div class="cfsteps"><a href="#cf1">1 基本資料</a><a href="#cf2">2 材料規格</a><a href="#cf3">3 配置條件</a><a href="#cf4">4 檢核結果</a></div>
      <section class="panel" id="cf1"><h2><span class="cfno">1</span>基本資料</h2>
        <div class="grid2">
          <div class="field"><label>位置／樓層</label><input data-p="info.loc" value="${esc(st.info.loc)}" placeholder="例：基礎～一層"></div>
          <div class="field"><label>構件編號</label><input data-p="info.no" value="${esc(st.info.no)}" placeholder="例：C1"></div>
          <div class="field"><label>柱高（一次澆置高度，cm）</label>${inp("info.H", st.info.H, "例：300")}</div>
          <div class="field"><label>柱寬（cm，畫圖用）</label>${inp("info.bx", st.info.bx)}</div>
          <div class="field"><label>柱深（cm，記錄用）</label>${inp("info.by", st.info.by)}</div>
          <div class="field"><label>混凝土單位重 γ（t/m³）</label>${inp("gamma", st.gamma)}</div>
          <div class="field"><label>側壓力上限（t/m²，可空白）</label>${inp("pmax", st.pmax, "依採用公式自行計算")}</div>
          <div class="field"><label>計算人員</label><input data-p="info.who" value="${esc(st.info.who)}"></div>
        </div>
        <p class="cnote">側壓力 P = γ × 深度；填了上限就取較小值。採用哪一條側壓力公式請依施工規範與契約。</p></section>
      <section class="panel" id="cf2"><h2><span class="cfno">2</span>材料規格</h2>
        <div class="grid2">
          <div class="field"><label>木材樹種（襯板及木角材）</label><select data-p="species"><option value="">請選擇</option>${COL_SPECIES.map(x => `<option value="${x.id}" ${st.species === x.id ? "selected" : ""}>${x.n}</option>`).join("")}</select></div>
          <div class="field"><label>襯板撓度檢核標準</label><select id="cfDefP">${COL_DEFP.map(([v, l]) => `<option value="${v}" ${v === (st.defP.a === "3" && !st.defP.n ? "a3" : st.defP.n === "240" && !st.defP.a ? "n240" : "") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          ${COL_MEMBERS.map(x => `<div class="field"><label>${x.n}</label><select data-p="sel.${x.k}" data-kind="${x.kind}">${matOpts(x.kind, st.sel[x.k])}</select></div>`).join("")}
          <div class="field"><label>螺桿</label><select data-p="sel.tie" data-kind="tie">${matOpts("tie", st.sel.tie)}</select></div>
          <div class="field"><label>螺桿容許拉應力 Ft（kgf/cm²）</label>${inp("tieFt", st.tieFt, "參考網站 1800")}</div>
          <div class="field"><label>構件計算方式</label><select data-p="meth">${Object.entries(COL_METHODS).map(([k, x]) => `<option value="${k}" ${st.meth === k ? "selected" : ""}>${x.n}</option>`).join("")}</select></div>
          <div class="field"><label>襯板撓度限制 L／?</label>${inp("defP.n", st.defP.n, "可空白")}</div>
          <div class="field"><label>襯板撓度上限（mm）</label>${inp("defP.a", st.defP.a, "可空白")}</div>
          <div class="field"><label>格柵撓度限制 L／?</label>${inp("defB.n", st.defB.n, "可空白")}</div>
          <div class="field"><label>格柵撓度上限（mm）</label>${inp("defB.a", st.defB.a, "可空白")}</div>
        </div>
        <p class="cnote">撓度兩個都填時取較嚴者。內建木料的容許應力與 E 值依所選樹種、鋼角材依鋼材；內建螺桿的容許拉力 = Ft × 斷面積；Ft 預設 1800 kgf/cm² 是參考網站的螺桿資料（18 kgf/mm²），非規範原文，請依螺桿規格核對。</p>
        <details class="cflibbox"><summary>材料參數與斷面資料</summary>
          ${colRefHtml(st.species)}
          <h3 class="cfh">自建材料</h3>
          <p class="cnote" style="margin-top:0">內建以外的材料（相當於「自訂」）可在這裡新增，容許值請依材料規格填寫；資料存在這支手機。</p>
          <div id="cfLib">${lib.filter(p => !p.preset).map(colLibCard).join("")}</div>
          <div class="row">${Object.entries(COL_KINDS).map(([k, l]) => `<button type="button" class="sec" data-ladd="${k}">＋ ${{ ply: "襯板", beam: "格柵材", tie: "螺桿" }[k]}</button>`).join("")}</div></details></section>
      <section class="panel" id="cf3"><h2><span class="cfno">3</span>配置條件（cm）</h2>
        <div class="tblwrap"><table class="ct cftiers"><tr><th>項目</th>${st.tiers.map((_, i) => `<th>${COL_TIER_N[i]}</th>`).join("")}</tr>
          <tr><th>階層最高高度</th>${st.tiers.map((t, i) => i === tn - 1 ? `<td class="cfro">${esc(st.info.H) || "柱高"}</td>` : `<td>${inp(`tiers.${i}.top`, t.top)}</td>`).join("")}</tr>
          ${COL_GAPS.map(([k, l]) => `<tr><th>${l}</th>${st.tiers.map((t, i) => `<td>${inp(`tiers.${i}.${k}`, t[k], k === "H4" ? (t.H3 ? "同H3" : "同H3") : "")}</td>`).join("")}</tr>`).join("")}</table></div>
        <div class="row">${tn < COL_MAX_TIERS ? `<button type="button" class="sec" id="cfTierAdd">＋ 增加一階</button>` : ""}${tn > 1 ? `<button type="button" class="sec" id="cfTierDel">－ 減少一階</button>` : ""}</div>
        <p class="cnote">由下往上分階（第一階在最底下），最上一階到柱頂。螺桿垂直間距 H4 空白時等於 H3。</p>
        <h3 class="cfh">側壓力分布圖</h3><div id="cfPsvg"></div>
        <h3 class="cfh">柱模板配置示意圖</h3><div id="cfLay"></div></section>
      <section class="panel" id="cf4"><h2><span class="cfno">4</span>檢核結果</h2><div id="cfRes"></div>
        <div class="row"><a class="btnlink" href="#/calc/col/sheet" id="cfSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="cfClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁只做數值計算：各構件視為均布載重的梁，每一階以該階最深處的側壓力檢核。容許值由你輸入，結果僅供施工規劃參考；模板支撐的安全仍應依施工規範、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    colSave(st);
    const r = colCalc(st, lib);
    $("#cfPsvg").innerHTML = colPressureSvg(r) || `<p class="cnote">請填柱高與單位重</p>`;
    $("#cfLay").innerHTML = colLayoutSvg(r, st);
    if (r.err.length) { $("#cfRes").innerHTML = r.err.map(e => `<p class="cnote" style="color:var(--bad)">${esc(e)}</p>`).join(""); return; }
    const cell = c => { const [j, cls] = colJudge(c); return Number.isFinite(c.v) ? `<td class="${cls}">${c.a > 0 ? fmt(c.v / c.a, 2) : fmt(c.v, c.d)}<small>${c.a > 0 ? j : c.u}</small></td>` : `<td>—</td>`; };
    const rows = [...COL_MEMBERS.flatMap((x, mi) => r.tiers[0].mems[mi].checks.map((_, ci) => `<tr><th>${ci ? "" : x.n + "<br>"}<small>${r.tiers[0].mems[mi].checks[ci].t}</small></th>${r.tiers.map(t => cell(t.mems[mi].checks[ci])).join("")}</tr>`)),
      `<tr><th>螺桿<br><small>拉力 T</small></th>${r.tiers.map(t => cell(t.tie)).join("")}</tr>`];
    $("#cfRes").innerHTML = `<div class="big"><span>總結</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過容許值</em>` : r.miss ? `<span style="font-size:15px;color:var(--mut)">還有 ${r.miss} 項未完成（缺間距、材料或容許值）</span>` : `<em class="cfj ok">全部在容許值以內</em>`}</b></div>
      <div class="tblwrap"><table class="ct cfres"><tr><th>構件</th>${r.tiers.map(t => `<th>${COL_TIER_N[t.i]}<br><small>P ${fmt(t.P, 3)}</small></th>`).join("")}</tr>${rows.join("")}</table></div>
      <p class="cnote">表中數字為「計算值 ÷ 容許值」，≤ 1 為 OK；未填容許值時顯示計算值。P 單位 kgf/cm²。</p>
      ${r.tiers.map(t => `<details class="cfdet"><summary>${COL_TIER_N[t.i]}（${fmt(t.lo, 0)}～${fmt(t.hi, 0)} cm）計算明細</summary>
        ${t.mems.map(m => `<p class="cfdh">${colMemText(m, fmt)}</p>
          ${m.checks.map(c => `<div class="big"><span>${c.t}</span><b>${fmt(c.v, c.d)}${c.a > 0 ? ` ／ ${fmt(c.a, c.d)}` : ""} ${c.u} <em class="cfj ${colJudge(c)[1]}">${colJudge(c)[0]}</em></b></div>`).join("")}`).join("")}
        <p class="cfdh">螺桿：T = P × B4 × H4 = ${fmt(t.P, 3)} × ${fmt(t.gap.B4, 1)} × ${fmt(t.gap.H4, 1)}</p>
        <div class="big"><span>拉力 T</span><b>${fmt(t.tie.v, 0)}${t.tie.a > 0 ? ` ／ ${fmt(t.tie.a, 0)}` : ""} kgf <em class="cfj ${colJudge(t.tie)[1]}">${colJudge(t.tie)[0]}</em></b></div></details>`).join("")}`;
  };
  const refreshSelects = () => box.querySelectorAll("select[data-kind]").forEach(s => { s.innerHTML = matOpts(s.dataset.kind, st.sel[s.dataset.p.split(".")[1]]); });
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = () => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      o[last] = el.value;
      if (el.dataset.p === "info.H") { const ro = box.querySelector(".cfro"); if (ro) ro.textContent = el.value || "柱高"; }
      calc();
    });
    box.querySelectorAll("[data-l]").forEach(el => el.oninput = el.onchange = () => {
      const p = lib.find(x => x.id === el.dataset.l); if (!p) return; p[el.dataset.lk] = el.value; colLibSave(lib);
      if (el.dataset.lk === "sect") { draw(); box.querySelector(".cflibbox").open = true; return; }
      if (el.dataset.lk === "n") refreshSelects();
      calc();
    });
    box.querySelectorAll("[data-ladd]").forEach(b => b.onclick = () => {
      const p = colNewMat(b.dataset.ladd); lib.push(p); colLibSave(lib); draw();
      box.querySelector(".cflibbox").open = true; box.querySelector(`[data-card="${p.id}"] input`)?.focus();
    });
    box.querySelectorAll("[data-ldel]").forEach(b => b.onclick = () => {
      const p = lib.find(x => x.id === b.dataset.ldel); if (!p || !confirm(`刪除材料「${p.n || "未命名"}」？`)) return;
      lib = lib.filter(x => x !== p); colLibSave(lib); for (const k in st.sel) if (st.sel[k] === p.id) st.sel[k] = ""; draw(); box.querySelector(".cflibbox").open = true;
    });
    $("#cfDefP").onchange = e => { const v = e.target.value; if (!v) return; st.defP = v === "a3" ? { n: "", a: "3" } : { n: "240", a: "" }; box.querySelector('[data-p="defP.n"]').value = st.defP.n; box.querySelector('[data-p="defP.a"]').value = st.defP.a; calc(); };
    $("#cfTierAdd") && ($("#cfTierAdd").onclick = () => { const last = st.tiers[st.tiers.length - 1]; st.tiers.push({ ...last, top: "" }); draw(); });
    $("#cfTierDel") && ($("#cfTierDel").onclick = () => { st.tiers.pop(); st.tiers[st.tiers.length - 1].top = ""; draw(); });
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#cfClear").onclick = () => { if (!confirm("清除柱模板的輸入？（材料庫會保留）")) return; Object.assign(st, colBlank()); draw(); };
    $("#cfSheet").onclick = e => { e.preventDefault(); location.hash = "#/calc/col/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderColSheet() {
  const st = colLoad(), r = colCalc(st), company = ls.get("company", "");
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const crow = c => { const [j] = colJudge(c); return `<tr><td>${c.t}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${c.a > 0 ? v(c.a, c.d) : "—"}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${j}</td></tr>`; };
  const matRow = (label, m, extra) => `<tr><td>${label}</td><td colspan="3">${m ? esc(m.n || "未命名") + (colSectText(m) ? "：" + esc(colSectText(m)) : "") + extra(m) : "未選擇"}</td></tr>`;
  const allow = m => `${m.wood ? `；${esc(m.spn)}` : ""}；fb ${esc(m.fb) || "—"}、fv ${esc(m.fv) || "—"}、E ${esc(m.E) || "—"} kgf/cm²`;
  const lim = d => [d.n ? "L/" + esc(d.n) : "", d.a ? esc(d.a) + " mm" : ""].filter(Boolean).join("、") || "未填";
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="cfBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">柱模板計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置／樓層</td><td>${esc(st.info.loc)}</td><td>構件編號</td><td>${esc(st.info.no)}</td></tr>
        <tr><td>柱斷面</td><td>${esc(st.info.bx)} × ${esc(st.info.by)} cm</td><td>柱高</td><td>${esc(st.info.H)} cm</td></tr>
        <tr><td>單位重 γ</td><td>${esc(st.gamma)} t/m³</td><td>側壓力上限</td><td>${colF(st.pmax) > 0 ? esc(st.pmax) + " t/m²" : "未填（取 γ × 深度）"}</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="4">二、材料規格</th></tr>
        <tr><td>計算方式</td><td colspan="3">${colMethText(st.meth)}</td></tr>
        ${COL_MEMBERS.map(x => matRow(x.n, r.mat(x.k), allow)).join("")}
        ${matRow("螺桿", r.mat("tie"), m => `${m.bolt ? `；Ft ${esc(st.tieFt) || "—"} kgf/cm²` : ""}；容許拉力 ${esc(m.ta) || "—"} kgf`)}
        <tr><td>撓度限制</td><td colspan="3">襯板：${lim(st.defP)}；格柵：${lim(st.defB)}</td></tr>
        <tr><td colspan="4" style="font-size:9pt">木材與鋼材容許應力、內建斷面、螺桿斷面積及 Ft 預設值依使用者提供之參考資料（非規範原文）。</td></tr>
      </table>
      <table class="pt">
        <tr><th>三、配置條件（cm）</th>${r.tiers.map(t => `<th>${COL_TIER_N[t.i]}</th>`).join("")}</tr>
        <tr><td>高度範圍</td>${r.tiers.map(t => `<td class="c">${v(t.lo, 0)}～${v(t.hi, 0)}</td>`).join("")}</tr>
        ${COL_GAPS.map(([k, l]) => `<tr><td>${l}</td>${r.tiers.map(t => `<td class="c">${v(t.gap[k], 1)}</td>`).join("")}</tr>`).join("")}
        <tr><td>設計側壓力 P（kgf/cm²）</td>${r.tiers.map(t => `<td class="c">${v(t.P, 3)}</td>`).join("")}</tr>
      </table>
      ${r.err.length ? `<p>${r.err.map(esc).join("<br>")}</p>` : `<figure class="cffig">${colPressureSvg(r)}${colLayoutSvg(r, st)}</figure>
      ${r.tiers.map(t => `<table class="pt">
        <tr><th colspan="6">${["四", "五", "六", "七"][t.i]}、${COL_TIER_N[t.i]}檢核（${v(t.lo, 0)}～${v(t.hi, 0)} cm，P = ${v(t.P, 3)} kgf/cm²）</th></tr>
        <tr><th>項目</th><th>計算值</th><th>容許值</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${t.mems.map(m => `<tr><td colspan="6">${colMemText(m, v)}</td></tr>${m.checks.map(crow).join("")}`).join("")}
        <tr><td colspan="6">螺桿：T = P × B4 × H4</td></tr>${crow(t.tie)}
      </table>`).join("")}`}
      <table class="pt"><tr><th>檢核結果</th><td>${r.err.length ? "分階高度有誤" : r.ng ? `${r.ng} 項超過容許值` : r.miss ? `尚有 ${r.miss} 項未完成` : "全部在容許值以內"}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：構件以均布載重之梁計算，各階以該階最深處之側壓力檢核。材料容許值、撓度限制與側壓力上限由計算人員依材料規格、施工規範與契約填入，本計算書僅供施工規劃參考。計算日期：${esc(today())}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#cfBack").onclick = () => goBack("#/calc/col");
  $("#pvPrint").onclick = doPrint;
}

CALC_TABS.push(["col", "柱模板", tabColForm]);
