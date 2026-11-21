"use strict";
/* 梁模板組立及支撐檢核（結構計算的「梁模板」分頁，另有 A4 計算書 #/struct/beam/sheet）
   斷面：梁寬 Bb、梁深 Hb（梁底到樓板頂，含樓板厚）、樓層高度 H。
   ‧載重（同板模板，預設值取自使用者指定的參考網站，2026-11-14 讀取，非規範原文，皆可修改）：
     N1 = Wo × Hb、N2 = 0.5 × N1、N3 作業 150 kgf/m²、N4 模板自重 15 kgf/m²，N = N1 + N2 + N3 + N4。
   ‧側模（參考網站 beam-view.js 的算法）：側壓力距梁底 z 處 p(z) = N × (Hb − z) / Hb（梁底為 N，往上線性遞減到梁頂為 0）。
     襯板：跨距取第一層大格柵各間距的最大值，側壓力取最下一格中點 p(L1-1 / 2)（偏保守），簡支。
     第一層大格柵（水平，最多 5 階，距梁底 L1-1、其後間距 L1-2…）：分配高度 S（相鄰兩支的中點之間，最下一支從梁底起、最上一支到梁頂），
       w = p(S 中點) × S，跨距 L2（第二層大格柵間距）。
     第二層大格柵（垂直，間距 L2）：2026-11-15 第三方驗證後改為連續梁（bfWale，自寫直接勁度法）：以各階螺桿為支點、兩端外伸，
       載重為第一層大格柵傳來的集中力 F = w × L2（作用在各支高度）；只有一階螺桿時另假設梁底端由底模支承（否則不穩定）。
       原參考網站算法（螺桿處切段、兩端懸臂、段中點側壓力當均布）會低估最下階螺桿約 7%、梁底端剪力約 16%，使用者同意修正。
     螺桿（最多 5 階，距梁底 H4-1、其後間距 H4-2…，水平間距 B4 = L2）：T = 第二層大格柵在該階的支點反力，容許拉力 = Ft × 斷面積。
   ‧底模：梁底襯板 w = N（100 cm 寬板帶），跨距取貫材邊距 L3/2（參考網站，外側邊緣須有可靠支承）；貫材 2 支以上時另檢核貫材之間的跨距 L3（本工具加的）。
     梁底貫材（沿梁長，支數 1～3，間距 L3 = Bb ／ 支數、邊距 L3/2）：w = N × L3，跨距 L4（鋼管支撐沿梁長間距）。
   ‧鋼管支撐（梁寬方向支數 1～3）：P = N × (Bb ／ 支數) × L4，支撐長 L = 樓層高度 − 梁深（參考網站）或手動輸入，
     λ = KL/r（K = 1），Fa 用容許應力法柱公式（wfFa），fc = P / A。
   ‧材料庫、樹種、斷面、構件公式（COL_METHODS）與柱模板共用（colform.js）；鋼管與挫曲公式與牆模板共用（wallform.js）；載重預設與板模板共用（SF_LOAD_DEF）。
   ‧單位：長度 cm、力 kgf、應力 kgf/cm²；Wo 用 t/m³，N3、N4 用 kgf/m²。 */

const BF_MAX = 5, BF_N = ["一", "二", "三", "四", "五"];
const BF_LMODES = [["net", "樓層高度 − 梁深"], ["man", "自行輸入"]];
const BF_MEMS = [["ply", "梁側模襯板", "ply"], ["w1", "側模第一層大格柵", "beam"], ["w2", "側模第二層大格柵", "beam"], ["bply", "梁底模襯板", "ply"], ["bw", "梁底貫材", "beam"]];

const bfBlank = () => ({
  info: { proj: "", loc: "", no: "", Bb: "", Hb: "", H: "", who: "" },
  ...SF_LOAD_DEF, meth: "r", spans: "3", species: "c3", tieFt: WF_FT_DEF, lmode: "net", Lu: "",
  pipe: { D: "4.86", t: "0.24" }, defP: { n: "", a: "3" }, defB: { n: "", a: "" },
  sel: { ply: "p_ply15", w1: "p_b9045", w2: "p_b9045", bply: "p_ply15", bw: "p_b9045", tie: "p_t25" },
  n1: "2", L1: ["", "", "", "", ""], L2: "", nt: "1", H4: ["", "", "", "", ""], nb: "2", np: "2", L4: ""
});
function bfLoad() {
  const d = bfBlank();
  let s; try { s = JSON.parse(ls.get("calcBeamForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s); pick(d.pipe, s.pipe); pick(d.defP, s.defP); pick(d.defB, s.defB); pick(d.sel, s.sel);
  for (const k of ["L1", "H4"]) if (Array.isArray(s[k])) d[k] = d[k].map((_, i) => colStr(s[k][i]));
  const cnt = (v, max, def) => { const n = parseInt(v, 10); return n >= 1 && n <= max ? String(n) : def; };
  d.n1 = cnt(d.n1, BF_MAX, "2"); d.nt = cnt(d.nt, BF_MAX, "1"); d.nb = cnt(d.nb, 3, "2"); d.np = cnt(d.np, 3, "2");
  if (!BF_LMODES.some(([k]) => k === d.lmode)) d.lmode = "net";
  return d;
}
const bfSave = st => { ls.set("calcBeamForm", JSON.stringify(st)); svKept(); };

/* ---------- 計算 ---------- */
// 由距梁底的第一支距離與其後間距算出各支位置；不合理（≤ 0、超過梁頂）時回傳錯誤
function bfPos(gaps, n, Hb, name) {
  const z = []; let acc = 0;
  for (let i = 0; i < n; i++) {
    const g = colF(gaps[i]);
    if (!(g > 0)) return { z: [], err: "" };                      // 還沒填完
    acc += g; z.push(acc);
  }
  return { z, err: Hb > 0 && acc >= Hb ? `${name}最上一支距梁底 ${fmt(acc, 1)} cm，須小於梁深 ${fmt(Hb, 1)} cm` : "" };
}
// 每支的分配區：相鄰兩支的中點之間；最下一支從梁底起、最上一支到梁頂
const bfTrib = (z, Hb) => z.map((v, i) => { const lo = i ? (z[i - 1] + v) / 2 : 0, hi = i < z.length - 1 ? (v + z[i + 1]) / 2 : Hb; return { z: v, lo, hi, S: hi - lo, zc: (lo + hi) / 2 }; });

// 第二層大格柵：直接勁度法連續梁（座標 z 由梁底往上，0～Hb）。sup 支點高度、loads [{z, F}]、EI。
// 回傳最大 |M|、|V|、各區段最大撓度、支點反力。
function bfWale(Hb, sup, loads, EI) {
  const key = [0, Hb, ...sup, ...loads.map(l => l.z)].map(z => +z.toFixed(6)).sort((a, b) => a - b).filter((z, i, a) => !i || z - a[i - 1] > 1e-6);
  const xs = [];
  key.forEach((z, i) => { if (i) for (let k = 1; k <= 6; k++) xs.push(key[i - 1] + (z - key[i - 1]) * k / 6); else xs.push(z); });
  const n = xs.length, nd = 2 * n, K = Array.from({ length: nd }, () => new Float64Array(nd)), F = new Float64Array(nd);
  const at = z => xs.findIndex(x => Math.abs(x - z) < 1e-6);
  for (let e = 0; e < n - 1; e++) {
    const L = xs[e + 1] - xs[e], a = 12 * EI / L ** 3, b = 6 * EI / L ** 2, c = 4 * EI / L, d = 2 * EI / L;
    const k = [[a, b, -a, b], [b, c, -b, d], [-a, -b, a, -b], [b, d, -b, c]], id = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) K[id[r]][id[q]] += k[r][q];
  }
  loads.forEach(l => { F[2 * at(l.z)] += l.F; });
  const fix = new Set(sup.map(z => 2 * at(z))), free = [...Array(nd).keys()].filter(i => !fix.has(i)), m = free.length;
  const A = free.map(r => [...free.map(q => K[r][q]), F[r]]);
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (!(Math.abs(A[p][c]) > 1e-12 * EI)) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < m; r++) if (r !== c) { const f = A[r][c] / A[c][c]; if (f) for (let q = c; q <= m; q++) A[r][q] -= f * A[c][q]; }
  }
  const u = new Float64Array(nd); free.forEach((r, i) => { u[r] = A[i][m] / A[i][i]; });
  let M = 0, V = 0; const dfl = [];   // dfl：各節點（含元素內 3 點）的 [z, |撓度|]
  for (let e = 0; e < n - 1; e++) {
    const L = xs[e + 1] - xs[e], [v1, t1, v2, t2] = [u[2 * e], u[2 * e + 1], u[2 * e + 2], u[2 * e + 3]];
    const Ve = EI * (12 * (v1 - v2) / L ** 3 + 6 * (t1 + t2) / L ** 2), M1 = EI * (6 * (v2 - v1) / L ** 2 - (4 * t1 + 2 * t2) / L), M2 = EI * (6 * (v1 - v2) / L ** 2 + (2 * t1 + 4 * t2) / L);
    V = Math.max(V, Math.abs(Ve)); M = Math.max(M, Math.abs(M1), Math.abs(M2));
    for (let k = 0; k < 4; k++) { const s = k / 4, h = [1 - 3 * s * s + 2 * s ** 3, L * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, L * (-s * s + s ** 3)]; dfl.push([xs[e] + s * L, Math.abs(h[0] * v1 + h[1] * t1 + h[2] * v2 + h[3] * t2)]); }
  }
  dfl.push([xs[n - 1], Math.abs(u[nd - 2])]);
  const R = sup.map(z => { const i = 2 * at(z); let r = F[i]; for (let q = 0; q < nd; q++) r -= K[i][q] * u[q]; return r; });   // 支點反力（與載重反向為正）
  // 區段（兩支點之間＝跨距 L；外伸段＝懸臂，撓度限制取 2 × 外伸長）
  const bnd = [0, ...sup, Hb].filter((z, i, a) => !i || z - a[i - 1] > 1e-6), segs = [];
  for (let i = 0; i < bnd.length - 1; i++) {
    const lo = bnd[i], hi = bnd[i + 1], cant = (i === 0 && lo < sup[0] - 1e-6) || (i === bnd.length - 2 && hi > sup[sup.length - 1] + 1e-6);
    segs.push({ lo, hi, cant, Lref: cant ? 2 * (hi - lo) : hi - lo, d: Math.max(0, ...dfl.filter(([z]) => z >= lo - 1e-6 && z <= hi + 1e-6).map(([, d]) => d)) });
  }
  return { M, V, R, segs };
}

function bfCalc(st, lib = colLib()) {
  const Bb = colF(st.info.Bb), Hb = colF(st.info.Hb), H = colF(st.info.H);
  const N1 = colF(st.wo) * Hb / 1000, N2 = colF(st.imp) * N1, N3 = colF(st.work) / 10000, N4 = colF(st.self) / 10000;   // kgf/cm²
  const N = N1 + N2 + N3 + N4;
  const pAt = z => Hb > 0 ? N * Math.max(0, Hb - z) / Hb : NaN;
  const sp = COL_SPECIES.find(x => x.id === st.species);
  const mat = k => { const m = lib.find(p => p.id === st.sel[k]); if (!m) return m;
    if (m.wood) return { ...m, fb: sp?.fb || "", fv: sp?.fv || "", E: sp?.E || "", spn: sp?.n || "未選樹種" };
    if (m.steel) return { ...m, fb: COL_STEEL.fb, fv: COL_STEEL.fv, E: COL_STEEL.E, spn: "鋼材" };
    if (m.bolt) { const ft = colF(st.tieFt); return { ...m, ta: ft > 0 ? String(+(ft * colF(m.A)).toFixed(1)) : "" }; }
    return m; };
  const meth = colMeth(st);
  const n1 = +st.n1, nt = +st.nt, nb = +st.nb, np = +st.np, L2 = colF(st.L2), L4 = colF(st.L4);
  const p1 = bfPos(st.L1, n1, Hb, "第一層大格柵"), pt = bfPos(st.H4, nt, Hb, "螺桿"), err = [p1.err, pt.err].filter(Boolean);
  const mem = (k, n, kind, L, trib, P, m = meth) => colMember({ k, n, kind }, mat(k), L, trib, P, m, NaN, kind === "ply" ? st.defP : st.defB);
  // 側模襯板
  const plyL = p1.z.length ? Math.max(...st.L1.slice(0, n1).map(colF)) : NaN, plyP = pAt(colF(st.L1[0]) / 2);
  const ply = { ...mem("ply", "梁側模襯板", "ply", plyL, 100, plyP), p: plyP };
  // 第一層大格柵（各階）
  const first = bfTrib(p1.z, Hb).map((t, i) => ({ ...mem("w1", `第${BF_N[i]}支`, "beam", L2, t.S, pAt(t.zc)), ...t, p: pAt(t.zc) }));
  // 第二層大格柵：連續梁（螺桿為支點，只有一階螺桿時梁底端另設支承），第一層大格柵以集中力 F = w × L2 傳入
  const w2m = mat("w2"), w2s = colSect(w2m), E2 = colF(w2m?.E);
  const sup2 = pt.z.length === 1 ? [0, pt.z[0]] : pt.z;
  const loads2 = first.map(m => ({ z: m.z, F: m.w * L2 }));
  const wale = pt.z.length && p1.z.length && !err.length && L2 > 0 && w2s && E2 > 0 ? bfWale(Hb, sup2, loads2, E2 * w2s.I) : null;
  let second = null;
  if (pt.z.length && !err.length) {
    const df = st.defB, lim = sg => Math.min(...[colF(df.n) > 0 ? sg.Lref / colF(df.n) : NaN, colF(df.a) > 0 ? colF(df.a) / 10 : NaN].filter(Number.isFinite));
    const dr = wale ? wale.segs.map(sg => ({ ...sg, lim: lim(sg) })) : [];
    const worst = dr.reduce((a, sg) => !a || (Number.isFinite(sg.lim) ? sg.d / sg.lim : sg.d) > (Number.isFinite(a.lim) ? a.d / a.lim : a.d) ? sg : a, null);
    second = { m: w2m, s: w2s, sup: sup2, loads: loads2, wale, worst, bottom: pt.z.length === 1,
      checks: [
        { t: "彎曲 fb", v: wale ? wale.M / w2s.S : NaN, a: colF(w2m?.fb), u: "kgf/cm²", d: 1 },
        { t: "剪力 fv", v: wale ? w2s.kv * wale.V / w2s.A : NaN, a: colF(w2m?.fv), u: "kgf/cm²", d: 2 },
        { t: "撓度 δ", v: worst ? worst.d * 10 : NaN, a: worst && Number.isFinite(worst.lim) ? worst.lim * 10 : NaN, u: "mm", d: 2 }] };
  }
  // 螺桿：每支第二層大格柵在各階螺桿處的支點反力即該螺桿拉力（螺桿水平間距 = L2）
  const tieA = colF(mat("tie")?.ta), off = pt.z.length === 1 ? 1 : 0;
  const ties = (err.length ? [] : pt.z).map((z, i) => ({ z, i, R: wale ? wale.R[i + off] : NaN, chk: { t: `第${BF_N[i]}階螺桿 拉力 T`, v: wale ? wale.R[i + off] : NaN, a: tieA, u: "kgf", d: 0 } }));
  // 底模
  const L3 = Bb > 0 ? Bb / nb : NaN, edge = L3 / 2;
  const bply = [{ ...mem("bply", "梁底襯板（邊距）", "ply", edge, 100, N), sp: "edge" }];
  if (nb >= 2) bply.push({ ...mem("bply", "梁底襯板（貫材間）", "ply", L3, 100, N), sp: "mid" });
  const bw = mem("bw", "梁底貫材", "beam", L4, L3, N);
  // 鋼管支撐
  const L = st.lmode === "man" ? colF(st.Lu) : H - Hb;
  const pipe = wfPipeSect(st.pipe), P = N * (Bb / np) * L4, lam = pipe && L > 0 ? L / pipe.r : NaN;
  const f = wfFa(lam, colF(COL_STEEL.fy), colF(COL_STEEL.E));
  const sup = { t: "壓應力 fc", v: pipe && L > 0 ? P / pipe.A : NaN, a: f.Fa, u: "kgf/cm²", d: 1 };
  const all = [ply, ...first, ...(second ? [second] : []), ...bply, bw].flatMap(m => m.checks).concat(ties.map(t => t.chk), [sup]);
  if (err.length) all.push({ v: NaN });
  return { Bb, Hb, H, N1, N2, N3, N4, N, pAt, mat, sp, meth, err, n1, nt, nb, np, L2, L3, L4, edge, z1: p1.z, zt: pt.z,
    ply, plyL, first, second, ties, bply, bw, L, pipe, P, lam, ...f, sup,
    ng: all.filter(x => colJudge(x)[1] === "bad").length, miss: all.filter(x => colJudge(x)[1] === "").length };
}
const bfLoadText = (st, r, f) => `N1 = Wo × Hb = ${esc(st.wo)} t/m³ × ${f(r.Hb, 1)} cm = ${f(r.N1, 4)}；N2 = ${esc(st.imp)} × N1 = ${f(r.N2, 4)}；N3 作業載重 ${esc(st.work)} kgf/m² = ${f(r.N3, 4)}；N4 模板自重 ${esc(st.self)} kgf/m² = ${f(r.N4, 4)}；N = N1 + N2 + N3 + N4 = ${f(r.N, 4)} kgf/cm²`;
const bfLText = (st, r, f) => st.lmode === "man" ? `L = ${f(r.L, 1)} cm（手動輸入）` : `L = 樓層高度 − 梁深 = ${f(r.H, 1)} − ${f(r.Hb, 1)} = ${f(r.L, 1)} cm`;
// 各構件明細（畫面與計算書共用）
const bfMemText = (m, f, head) => `${head}：L = ${f(m.L, 1)} cm，w = ${f(m.w, 3)} kgf/cm，M = ${m.c.mt} = ${f(m.M, 0)} kgf·cm，V = ${m.c.v}wL = ${f(m.V, 1)} kgf，δ = ${m.c.dt}`;
function bfDetails(st, r, f) {
  const out = [];
  out.push([bfMemText(r.ply, f, `側模襯板（簡支，跨距取第一層大格柵最大間距；側壓力取最下一格中點 p = N × (Hb − L1-1/2) / Hb = ${f(r.ply.p, 4)} kgf/cm²，100 cm 寬板帶 w = p × 100）`), r.ply.checks]);
  r.first.forEach(m => out.push([bfMemText(m, f, `側模第一層大格柵 ${m.x.n}（距梁底 ${f(m.z, 1)} cm；分配高度 S = ${f(m.hi, 1)} − ${f(m.lo, 1)} = ${f(m.S, 1)} cm，中點 ${f(m.zc, 1)} cm，p = ${f(m.p, 4)} kgf/cm²；w = p × S；跨距 L2）`), m.checks]));
  const sc = r.second;
  if (sc) {
    const w = sc.wale, wt = sc.worst;
    out.push([`側模第二層大格柵（連續梁，以${sc.bottom ? "梁底端與螺桿" : "各階螺桿"}為支點、兩端外伸；第一層大格柵集中力 F = w × L2：${sc.loads.map(l => `${f(l.z, 1)} cm 處 ${f(l.F, 1)} kgf`).join("、") || "—"}）：`
      + (w ? `直接勁度法求得 Mmax = ${f(w.M, 0)} kgf·cm、Vmax = ${f(w.V, 1)} kgf；撓度取最不利區段 ${f(wt.lo, 1)}～${f(wt.hi, 1)} cm（${wt.cant ? "外伸段，限制長度取 2 倍外伸長" : "支點間"}）δ = ${f(wt.d * 10, 2)} mm`
        + (sc.bottom ? `；只有一階螺桿，假設梁底端有支承：梁底端反力 ${f(Math.abs(w.R[0]), 1)} kgf，${w.R[0] < 0 ? "底端被推向梁內側，由梁底模邊緣頂住" : "底端向外，須有止滑木或角材擋住"}，請確認現場構造` : "") : "材料或配置未完成"), sc.checks]);
  }
  r.ties.forEach(t => out.push([`第${BF_N[t.i]}階螺桿（距梁底 ${f(t.z, 1)} cm）：T = 第二層大格柵在此階的支點反力 = ${f(t.chk.v, 0)} kgf（螺桿水平間距 B4 = L2）`, [t.chk]]));
  r.bply.forEach(m => out.push([bfMemText(m, f, `${m.x.n}（簡支，${m.sp === "edge" ? "邊距 L3/2；梁底襯板外側邊緣須有可靠支承及固定" : "貫材間距 L3"}；w = N × 100）`), m.checks]));
  out.push([bfMemText(r.bw, f, `梁底貫材（${r.nb} 支，L3 = Bb ／ ${r.nb} = ${f(r.L3, 1)} cm；w = N × L3；跨距 L4）`), r.bw.checks]);
  out.push([`鋼管支撐（梁寬方向 ${r.np} 支）：P = N × (Bb ／ ${r.np}) × L4 = ${f(r.N, 4)} × ${f(r.Bb / r.np, 1)} × ${f(r.L4, 1)} = ${f(r.P, 1)} kgf；${bfLText(st, r, f)}；A = ${f(r.pipe?.A, 3)} cm²、r = ${f(r.pipe?.r, 3)} cm；λ = KL ÷ r = ${f(r.lam, 1)}（K = 1），Cc = ${f(r.Cc, 1)}，採${r.inel ? "非彈性" : "彈性"}挫曲公式；fc = P ÷ A`, [r.sup]]);
  return out;
}

/* ---------- 示意圖：梁斷面＋側壓力 ---------- */
function bfLayoutSvg(r) {
  const { Bb, Hb } = r;
  if (!(Bb > 0 && Hb > 0) || r.err.length) return `<p class="cnote">${r.err.length ? esc(r.err[0]) : "填好梁寬、梁深後，這裡會畫出配置示意圖。"}</p>`;
  const k = Math.min(150 / Hb, 110 / Bb), bw = Bb * k, bh = Hb * k, x0 = 92, y0 = 22, X = x => x0 + x * k, Y = z => y0 + bh - z * k;
  const xl = x0 - 4, xr = x0 + bw + 4, by = y0 + bh, o = [];
  // 樓板（裝飾）、梁、側模襯板
  o.push(`<rect x="${x0 - 60}" y="${y0}" width="${bw + 120}" height="10" fill="currentColor" fill-opacity=".12"/>`);
  o.push(`<rect x="${x0}" y="${y0}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width=".8"/>`);
  o.push(`<rect x="${xl}" y="${y0 + 10}" width="3" height="${(bh - 6).toFixed(1)}" fill="currentColor" fill-opacity=".7"/><rect x="${xr - 3}" y="${y0 + 10}" width="3" height="${(bh - 6).toFixed(1)}" fill="currentColor" fill-opacity=".7"/>`);
  o.push(`<rect x="${xl}" y="${by}" width="${(xr - xl).toFixed(1)}" height="4" fill="currentColor" fill-opacity=".7"/>`);
  // 第一層大格柵（小方塊）、第二層大格柵（垂直粗線）
  r.z1.forEach(z => o.push(`<rect x="${xl - 7}" y="${(Y(z) - 3).toFixed(1)}" width="6" height="6" fill="currentColor"/><rect x="${xr + 1}" y="${(Y(z) - 3).toFixed(1)}" width="6" height="6" fill="currentColor"/>`));
  o.push(`<rect x="${xl - 12}" y="${y0 + 10}" width="4" height="${(bh - 10).toFixed(1)}" fill="currentColor" fill-opacity=".8"/><rect x="${xr + 8}" y="${y0 + 10}" width="4" height="${(bh - 10).toFixed(1)}" fill="currentColor" fill-opacity=".8"/>`);
  // 螺桿
  r.zt.forEach(z => o.push(`<line x1="${xl - 16}" x2="${xr + 16}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" stroke="currentColor" stroke-width="1.2" stroke-dasharray="4 2"/><rect x="${xl - 17}" y="${(Y(z) - 4).toFixed(1)}" width="3" height="8" fill="currentColor"/><rect x="${xr + 14}" y="${(Y(z) - 4).toFixed(1)}" width="3" height="8" fill="currentColor"/>`));
  // 梁底貫材、鋼管、地面
  const ty = by + 4, gy = ty + 70;
  for (let i = 0; i < r.nb; i++) o.push(`<rect x="${(X((i + 0.5) * r.L3) - 4).toFixed(1)}" y="${ty}" width="8" height="8" fill="currentColor"/>`);
  for (let i = 0; i < r.np; i++) { const x = X((i + 0.5) * Bb / r.np); o.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${ty + 8}" y2="${gy}" stroke="currentColor" stroke-width="3"/>`); }
  o.push(`<line x1="${x0 - 60}" x2="${x0 + bw + 60}" y1="${gy}" y2="${gy}" stroke="currentColor"/>`);
  // 尺寸：左 L1、右 H4、上 Bb
  const dimV = (x, za, zb, lab, anchor) => `<line x1="${x}" x2="${x}" y1="${Y(za).toFixed(1)}" y2="${Y(zb).toFixed(1)}" stroke="currentColor" stroke-width=".7"/><line x1="${x - 3}" x2="${x + 3}" y1="${Y(zb).toFixed(1)}" y2="${Y(zb).toFixed(1)}" stroke="currentColor" stroke-width=".7"/><text x="${anchor === "end" ? x - 3 : x + 3}" y="${((Y(za) + Y(zb)) / 2 + 3).toFixed(1)}" text-anchor="${anchor}">${lab}</text>`;
  const d = [`<line x1="${x0 - 60}" x2="${x0 - 60}" y1="${by}" y2="${by}" stroke="currentColor"/>`];
  r.z1.forEach((z, i) => d.push(dimV(xl - 24, i ? r.z1[i - 1] : 0, z, `L1-${i + 1}`, "end")));
  r.zt.forEach((z, i) => d.push(dimV(xr + 24, i ? r.zt[i - 1] : 0, z, `H4-${i + 1}`, "start")));
  d.push(`<text x="${(x0 + bw / 2).toFixed(1)}" y="${y0 - 6}" text-anchor="middle">Bb ${fmt(Bb, 1)}</text><text x="${(x0 + bw / 2).toFixed(1)}" y="${(y0 + bh / 2).toFixed(1)}" text-anchor="middle">Hb ${fmt(Hb, 1)}</text>`);
  d.push(`<text x="${(x0 + bw + 20).toFixed(1)}" y="${((ty + gy) / 2 + 3).toFixed(1)}">鋼管 ${r.np} 支，L ${fmt(r.L, 1)}</text><text x="${(x0 - 20).toFixed(1)}" y="${((ty + gy) / 2 + 3).toFixed(1)}" text-anchor="end">貫材 ${r.nb} 支</text>`);
  // 側壓力分布（右側）
  const px = x0 + bw + 92, pw = 70, pts = `${px},${Y(Hb).toFixed(1)} ${px + pw},${Y(0).toFixed(1)} ${px},${Y(0).toFixed(1)}`;
  d.push(`<polygon points="${pts}" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="1.2"/><text x="${px}" y="${y0 - 6}">側壓力</text><text x="${px + pw + 2}" y="${(Y(0) + 12).toFixed(1)}" text-anchor="end">N ${fmt(r.N, 4)}</text>`);
  r.ties.forEach(t => d.push(`<circle cx="${(px + pw * r.pAt(t.z) / r.N).toFixed(1)}" cy="${Y(t.z).toFixed(1)}" r="2"/>`));
  const W = px + pw + 14, Ht = gy + 30;
  return `<svg class="cfsvg bflay" viewBox="0 0 ${W.toFixed(0)} ${Ht.toFixed(0)}" role="img" aria-label="梁模板組立及支撐配置示意圖">${o.join("")}
    <g font-size="9" fill="currentColor">${d.join("")}<text x="${x0 - 60}" y="${gy + 16}">斷面（■ 第一層大格柵、粗線 第二層大格柵、虛線 螺桿；鋼管高度不依比例）</text></g></svg>
    <p class="cnote" style="margin-top:0">側壓力梁底為 N，往上線性遞減到梁頂為 0；圓點為各階螺桿位置。</p>`;
}

/* ---------- 畫面 ---------- */
function tabBeamForm(box) {
  const st = bfLoad();
  let lib = colLib();
  const inp = (path, val, ph = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const matOpts = (kind, cur) => `<option value="">請選擇</option>${lib.filter(p => p.kind === kind).map(p => `<option value="${esc(p.id)}" ${p.id === cur ? "selected" : ""}>${esc(p.n || "（未命名）")}</option>`).join("")}`;
  const sel = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const nOpts = (max, u) => Array.from({ length: max }, (_, i) => [String(i + 1), `${i + 1} ${u}`]);
  const draw = () => {
    const pipeSel = WF_PIPES.find(p => p.D === st.pipe.D && p.t === st.pipe.t)?.id || "";
    const L1lab = i => i ? `第${BF_N[i - 1]}、${BF_N[i]}支間距 L1-${i + 1}` : "第一支距梁底 L1-1";
    const H4lab = i => i ? `第${BF_N[i - 1]}、${BF_N[i]}階螺桿間距 H4-${i + 1}` : "第一階螺桿距梁底 H4-1";
    box.innerHTML = `
      <div class="cfsteps"><a href="#bf1">1 基本資料</a><a href="#bf2">2 材料規格</a><a href="#bf3">3 側模配置</a><a href="#bf4">4 底模及支撐</a><a href="#bf5">5 檢核結果</a></div>
      <section class="panel" id="bf1"><h2><span class="cfno">1</span>基本資料</h2>
        <div class="grid2">
          <div class="field"><label>位置／樓層</label><input data-p="info.loc" value="${esc(st.info.loc)}" placeholder="例：二樓頂版"></div>
          <div class="field"><label>構件編號</label><input data-p="info.no" value="${esc(st.info.no)}" placeholder="例：B1"></div>
          <div class="field"><label>梁寬 Bb（cm）</label>${inp("info.Bb", st.info.Bb, "例：45")}</div>
          <div class="field"><label>梁深 Hb（含樓板厚，cm）</label>${inp("info.Hb", st.info.Hb, "例：70")}</div>
          <div class="field"><label>樓層高度（cm）</label>${inp("info.H", st.info.H, "例：300")}</div>
          <div class="field"><label>計算人員</label><input data-p="info.who" value="${esc(st.info.who)}"></div>
        </div>
        <h3 class="cfh">載重</h3>
        <div class="grid2">
          <div class="field"><label>混凝土單位重 Wo（t/m³）</label>${inp("wo", st.wo)}</div>
          <div class="field"><label>衝擊載重係數（× N1）</label>${inp("imp", st.imp)}</div>
          <div class="field"><label>作業載重 N3（kgf/m²）</label>${inp("work", st.work)}</div>
          <div class="field"><label>模板自重 N4（kgf/m²）</label>${inp("self", st.self)}</div>
        </div>
        <div id="bfLoad"></div>
        <p class="cnote">N = N1（Wo × 梁深）＋ N2（係數 × N1）＋ N3 ＋ N4；側模側壓力取梁底為 N、往上線性遞減到梁頂為 0。預設值與算法取自你指定的參考網站，非規範原文；採用的載重與側壓力請依施工規範與契約。</p>
        <div class="row"><button type="button" class="sec" id="bfLoadDef">載重恢復預設值</button></div></section>
      <section class="panel" id="bf2"><h2><span class="cfno">2</span>材料規格</h2>
        <div class="grid2">
          <div class="field"><label>木材樹種（襯板及木角材）</label><select data-p="species"><option value="">請選擇</option>${COL_SPECIES.map(x => `<option value="${x.id}" ${st.species === x.id ? "selected" : ""}>${x.n}</option>`).join("")}</select></div>
          <div class="field"><label>襯板撓度檢核標準</label><select id="bfDefP">${COL_DEFP.map(([v, l]) => `<option value="${v}" ${v === (st.defP.a === "3" && !st.defP.n ? "a3" : st.defP.n === "240" && !st.defP.a ? "n240" : "") ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          ${BF_MEMS.map(([k, n, kind]) => `<div class="field"><label>${n}</label><select data-p="sel.${k}" data-kind="${kind}">${matOpts(kind, st.sel[k])}</select></div>`).join("")}
          <div class="field"><label>螺桿</label><select data-p="sel.tie" data-kind="tie">${matOpts("tie", st.sel.tie)}</select></div>
          <div class="field"><label>螺桿容許拉應力 Ft（kgf/cm²）</label>${inp("tieFt", st.tieFt, "參考網站 1800")}</div>
          <div class="field"><label>鋼管支撐</label><select id="bfPipe">${WF_PIPES.map(p => `<option value="${p.id}" ${p.id === pipeSel ? "selected" : ""}>${p.n}</option>`).join("")}<option value="" ${pipeSel ? "" : "selected"}>自訂</option></select></div>
          <div class="field"><label>鋼管外徑 D（cm）</label>${inp("pipe.D", st.pipe.D)}</div>
          <div class="field"><label>鋼管厚度 t（cm）</label>${inp("pipe.t", st.pipe.t)}</div>
          <div class="field"><label>構件計算方式</label>${sel("meth", Object.entries(COL_METHODS).map(([k, x]) => [k, x.n]), st.meth)}</div>
          <div class="field"><label>格柵連續跨數</label>${sel("spans", COL_SPAN_OPTS, st.spans)}</div>
          <div class="field"><label>襯板撓度限制 L／?</label>${inp("defP.n", st.defP.n, "可空白")}</div>
          <div class="field"><label>襯板撓度上限（mm）</label>${inp("defP.a", st.defP.a, "可空白")}</div>
          <div class="field"><label>格柵撓度限制 L／?</label>${inp("defB.n", st.defB.n, "可空白")}</div>
          <div class="field"><label>格柵撓度上限（mm）</label>${inp("defB.a", st.defB.a, "可空白")}</div>
        </div>
        <p class="cnote">撓度兩個都填時取較嚴者。內建木料的容許應力與 E 值依所選樹種、鋼角材與鋼管依鋼材。內建螺桿的容許拉力 = Ft × 斷面積；Ft 預設 1800 kgf/cm² 是參考網站的螺桿資料，非規範原文，請依螺桿規格核對。</p>
        <details class="cflibbox"><summary>材料參數與斷面資料</summary>
          ${colRefHtml(st.species)}
          <h3 class="cfh">自建材料</h3>
          <p class="cnote" style="margin-top:0">與柱模板、牆模板、板模板共用。內建以外的材料可在這裡新增，容許值請依材料規格填寫；資料存在這支手機。</p>
          <div id="bfLib">${lib.filter(p => !p.preset).map(colLibCard).join("")}</div>
          <div class="row">${["ply", "beam", "tie"].map(k => `<button type="button" class="sec" data-ladd="${k}">＋ ${{ ply: "襯板", beam: "格柵材", tie: "螺桿" }[k]}</button>`).join("")}</div></details></section>
      <section class="panel" id="bf3"><h2><span class="cfno">3</span>側模配置條件（cm）</h2>
        <div class="grid2">
          <div class="field"><label>側模第一層大格柵階數</label>${sel("n1", nOpts(BF_MAX, "階"), st.n1)}</div>
          ${Array.from({ length: +st.n1 }, (_, i) => `<div class="field"><label>${L1lab(i)}</label>${inp(`L1.${i}`, st.L1[i])}</div>`).join("")}
          <div class="field"><label>側模第二層大格柵間距 L2</label>${inp("L2", st.L2, "例：60")}</div>
          <div class="field"><label>螺桿階數</label>${sel("nt", nOpts(BF_MAX, "階"), st.nt)}</div>
          ${Array.from({ length: +st.nt }, (_, i) => `<div class="field"><label>${H4lab(i)}</label>${inp(`H4.${i}`, st.H4[i])}</div>`).join("")}
          <div class="field"><label>螺桿水平間距 B4（＝ L2）</label><input id="bfB4" value="${esc(st.L2)}" readonly tabindex="-1"></div>
        </div>
        <p class="cnote">第一層大格柵水平組在襯板外側、以第二層大格柵（間距 L2）為支點；第二層大格柵垂直、以螺桿為支點的連續梁（兩端外伸），承受第一層大格柵傳來的集中力；只有一階螺桿時，假設梁底端由梁底模支承。螺桿拉力取支點反力，水平間距同 L2。</p></section>
      <section class="panel" id="bf4"><h2><span class="cfno">4</span>底模及支撐配置條件（cm）</h2>
        <div class="grid2">
          <div class="field"><label>梁底貫材支數</label>${sel("nb", nOpts(3, "支"), st.nb)}</div>
          <div class="field"><label>梁底貫材間距 L3（＝ Bb ／ 支數）</label><input id="bfL3" readonly tabindex="-1"></div>
          <div class="field"><label>梁底貫材邊距（＝ L3 ／ 2）</label><input id="bfEdge" readonly tabindex="-1"></div>
          <div class="field"><label>鋼管支撐支數（梁寬方向）</label>${sel("np", nOpts(3, "支"), st.np)}</div>
          <div class="field"><label>鋼管支撐間距 L4（沿梁長）</label>${inp("L4", st.L4, "例：90")}</div>
          <div class="field"><label>鋼管支撐長 L</label>${sel("lmode", BF_LMODES, st.lmode)}</div>
          ${st.lmode === "man" ? `<div class="field"><label>最大未支撐長度 L（cm）</label>${inp("Lu", st.Lu, "例：有水平繫材時填繫材間距")}</div>` : ""}
        </div>
        <p class="cnote">梁底貫材沿梁長方向放置、以鋼管支撐（間距 L4）為支點。梁底襯板依參考網站以邊距計算（外側邊緣須有可靠支承及固定）；貫材 2 支以上時，本工具另檢核貫材之間的跨距。支撐長的取法與挫曲長度係數（K = 1）請依實際構造確認。</p>
        <h3 class="cfh">梁模板組立及支撐配置示意圖</h3><div id="bfLay"></div></section>
      <section class="panel" id="bf5"><h2><span class="cfno">5</span>檢核結果</h2><div id="bfRes"></div>
        <div class="row"><a class="btnlink" href="#/struct/beam/sheet" id="bfSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="bfClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁只做數值計算：各構件視為均布載重的梁，螺桿檢核拉力，鋼管支撐以軸壓檢核挫曲。載重、側壓力分布、容許值由你輸入或取自參考資料，結果僅供施工規劃參考；模板支撐的安全仍應依施工規範、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    bfSave(st);
    const r = bfCalc(st, lib);
    $("#bfLoad").innerHTML = `<div class="big"><span>單位面積載重 N</span><b>${fmt(r.N, 4)} kgf/cm²<small style="display:block;font-size:12px;font-weight:500;color:var(--mut)">＝ ${fmt(r.N * 10000, 0)} kgf/m²</small></b></div>`;
    $("#bfB4").value = st.L2; $("#bfL3").value = Number.isFinite(r.L3) ? fmt(r.L3, 1) : ""; $("#bfEdge").value = Number.isFinite(r.edge) ? fmt(r.edge, 2) : "";
    $("#bfLay").innerHTML = bfLayoutSvg(r);
    const cell = c => { const [j, cls] = colJudge(c); return Number.isFinite(c.v) ? `<td class="${cls}">${c.a > 0 ? fmt(c.v / c.a, 2) : fmt(c.v, c.d)}<small>${c.a > 0 ? j : c.u}</small></td>` : `<td>—</td>`; };
    const row = (n, c, first) => `<tr><th>${first ? n + "<br>" : ""}<small>${c.t}</small></th><td>${fmt(c.v, c.d)}<small>${c.u}</small></td><td>${c.a > 0 ? fmt(c.a, c.d) : "—"}</td>${cell(c)}</tr>`;
    const memRows = (n, m) => m.checks.map((c, i) => row(n, c, !i)).join("");
    const big = c => `<div class="big"><span>${c.t}</span><b>${fmt(c.v, c.d)}${c.a > 0 ? ` ／ ${fmt(c.a, c.d)}` : ""} ${c.u} <em class="cfj ${colJudge(c)[1]}">${colJudge(c)[0]}</em></b></div>`;
    $("#bfRes").innerHTML = `<div class="big"><span>總結</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過容許值</em>` : r.err.length ? `<span style="font-size:15px;color:var(--bad)">${esc(r.err[0])}</span>` : r.miss ? `<span style="font-size:15px;color:var(--mut)">還有 ${r.miss} 項未完成（缺尺寸、間距、材料或容許值）</span>` : `<em class="cfj ok">全部在容許值以內</em>`}</b></div>
      <div class="tblwrap"><table class="ct cfres"><tr><th>構件</th><th>計算值</th><th>容許值</th><th>比值</th></tr>
        ${memRows("側模襯板", r.ply)}
        ${r.first.map(m => memRows(`第一層大格柵 ${m.x.n}`, m)).join("")}
        ${r.second ? memRows("第二層大格柵（連續梁）", r.second) : ""}
        ${r.ties.map(t => row(`螺桿 第${BF_N[t.i]}階`, { ...t.chk, t: "拉力 T" }, true)).join("")}
        ${r.bply.map(m => memRows(m.x.n, m)).join("")}
        ${memRows("梁底貫材", r.bw)}${row("鋼管支撐", r.sup, true)}</table></div>
      <p class="cnote">比值 = 計算值 ÷ 容許值，≤ 1 為 OK。N = ${fmt(r.N, 4)} kgf/cm²。</p>
      <details class="cfdet"><summary>計算明細</summary>
        <p class="cfdh">載重：${bfLoadText(st, r, fmt)}</p>
        ${bfDetails(st, r, fmt).map(([h, cs]) => `<p class="cfdh">${h}</p>${cs.map(big).join("")}`).join("")}</details>`;
  };
  const refreshSelects = () => box.querySelectorAll("select[data-kind]").forEach(s => { s.innerHTML = matOpts(s.dataset.kind, st.sel[s.dataset.p.split(".")[1]]); });
  const redrawKeep = () => { draw(); box.querySelector(".cflibbox").open = true; };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = () => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      o[last] = el.value;
      if (["lmode", "n1", "nt"].includes(el.dataset.p)) return draw();
      if (el.dataset.p.startsWith("pipe.")) { const s = $("#bfPipe"); if (s) s.value = WF_PIPES.find(p => p.D === st.pipe.D && p.t === st.pipe.t)?.id || ""; }
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
    box.querySelectorAll("[data-ldel]").forEach(b => b.onclick = async () => {
      const p = lib.find(x => x.id === b.dataset.ldel); if (!p || !(await uiConfirm(`刪除材料「${p.n || "未命名"}」？（柱模板、牆模板、板模板也會一併刪除）`))) return;
      lib = lib.filter(x => x !== p); colLibSave(lib); for (const k in st.sel) if (st.sel[k] === p.id) st.sel[k] = ""; redrawKeep();
    });
    $("#bfDefP").onchange = e => { const v = e.target.value; if (!v) return; st.defP = v === "a3" ? { n: "", a: "3" } : { n: "240", a: "" }; box.querySelector('[data-p="defP.n"]').value = st.defP.n; box.querySelector('[data-p="defP.a"]').value = st.defP.a; calc(); };
    $("#bfPipe").onchange = e => { const p = WF_PIPES.find(x => x.id === e.target.value); if (!p) return; st.pipe = { D: p.D, t: p.t }; box.querySelector('[data-p="pipe.D"]').value = p.D; box.querySelector('[data-p="pipe.t"]').value = p.t; calc(); };
    $("#bfLoadDef").onclick = () => { Object.assign(st, SF_LOAD_DEF); for (const k in SF_LOAD_DEF) box.querySelector(`[data-p="${k}"]`).value = SF_LOAD_DEF[k]; calc(); };
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#bfClear").onclick = async () => { if (!(await uiConfirm("清除梁模板的輸入？（材料庫會保留）"))) return; Object.assign(st, bfBlank()); draw(); };
    $("#bfSheet").onclick = e => { e.preventDefault(); location.hash = "#/struct/beam/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderBeamSheet() {
  const st = bfLoad(), r = bfCalc(st), company = siteCompany(siteId);
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const crow = c => { const [j] = colJudge(c); return `<tr><td>${c.t}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${c.a > 0 ? v(c.a, c.d) : "—"}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${j}</td></tr>`; };
  const matRow = (label, m) => `<tr><td>${label}</td><td colspan="3">${m ? esc(m.n || "未命名") + (colSectText(m) ? "：" + esc(colSectText(m)) : "") + (m.kind === "tie" ? `；容許拉力 ${esc(m.ta) || "—"} kgf${m.bolt ? `（Ft ${esc(st.tieFt)} kgf/cm² × 斷面積）` : ""}` : `${m.wood ? `；${esc(m.spn)}` : ""}；fb ${esc(m.fb) || "—"}、fv ${esc(m.fv) || "—"}、E ${esc(m.E) || "—"} kgf/cm²`) : "未選擇"}</td></tr>`;
  const lim = d => [d.n ? "L/" + esc(d.n) : "", d.a ? esc(d.a) + " mm" : ""].filter(Boolean).join("、") || "未填";
  const L1t = r.z1.length ? st.L1.slice(0, r.n1).map((x, i) => `L1-${i + 1} = ${esc(x)}`).join("、") : "未填";
  const H4t = r.zt.length ? st.H4.slice(0, r.nt).map((x, i) => `H4-${i + 1} = ${esc(x)}`).join("、") : "未填";
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="bfBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">梁模板組立及支撐計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置／樓層</td><td>${esc(st.info.loc)}</td><td>構件編號</td><td>${esc(st.info.no)}</td></tr>
        <tr><td>梁寬 Bb</td><td>${esc(st.info.Bb)} cm</td><td>梁深 Hb（含樓板）</td><td>${esc(st.info.Hb)} cm</td></tr>
        <tr><td>樓層高度</td><td colspan="3">${esc(st.info.H)} cm</td></tr>
        <tr><td>單位面積載重</td><td colspan="3">${bfLoadText(st, r, v)}</td></tr>
        <tr><td>側壓力</td><td colspan="3">距梁底 z 處 p = N × (Hb − z) ／ Hb，梁底 ${v(r.N, 4)} kgf/cm²，梁頂為 0</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="4">二、材料規格</th></tr>
        <tr><td>計算方式</td><td colspan="3">${colMethText(st)}；側模第二層大格柵以連續梁（直接勁度法）計算，螺桿拉力取其支點反力</td></tr>
        ${BF_MEMS.map(([k, n]) => matRow(n, r.mat(k))).join("")}
        ${matRow("螺桿", r.mat("tie"))}
        <tr><td>鋼管支撐</td><td colspan="3">圓管 D${esc(st.pipe.D)} × t${esc(st.pipe.t)} cm：A ${v(r.pipe?.A, 3)} cm²、I ${v(r.pipe?.I, 3)} cm⁴、r ${v(r.pipe?.r, 3)} cm；Fy ${COL_STEEL.fy}、E ${COL_STEEL.E} kgf/cm²</td></tr>
        <tr><td>撓度限制</td><td colspan="3">襯板：${lim(st.defP)}；格柵：${lim(st.defB)}</td></tr>
        <tr><td colspan="4" style="font-size:9pt">載重預設值、側壓力分布、木材與鋼材容許應力、內建斷面、螺桿 Ft 及鋼管規格依使用者提供之參考資料（非規範原文）。</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="2">三、配置條件</th></tr>
        <tr><td>側模第一層大格柵（${r.n1} 階）</td><td>${L1t} cm</td></tr>
        <tr><td>側模第二層大格柵間距 L2</td><td>${v(r.L2, 1)} cm</td></tr>
        <tr><td>螺桿（${r.nt} 階）</td><td>${H4t} cm；水平間距 B4 = L2 = ${v(r.L2, 1)} cm</td></tr>
        <tr><td>梁底貫材</td><td>${r.nb} 支，間距 L3 = ${v(r.L3, 1)} cm，邊距 ${v(r.edge, 2)} cm</td></tr>
        <tr><td>鋼管支撐</td><td>梁寬方向 ${r.np} 支，沿梁長間距 L4 = ${v(r.L4, 1)} cm，支撐長 L = ${v(r.L, 1)} cm（${esc(BF_LMODES.find(([k]) => k === st.lmode)[1])}）</td></tr>
      </table>
      <figure class="cffig">${bfLayoutSvg(r)}</figure>
      <table class="pt">
        <tr><th colspan="6">四、構件檢核（N = ${v(r.N, 4)} kgf/cm²）</th></tr>
        <tr><th>項目</th><th>計算值</th><th>容許值</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${bfDetails(st, r, v).map(([h, cs]) => `<tr><td colspan="6">${h}</td></tr>${cs.map(crow).join("")}`).join("")}
      </table>
      <table class="pt"><tr><th>檢核結果</th><td>${r.ng ? `${r.ng} 項超過容許值` : r.err.length ? esc(r.err[0]) : r.miss ? `尚有 ${r.miss} 項未完成` : "全部在容許值以內"}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：構件以均布載重之梁計算（側模第二層大格柵以承受集中力之連續梁計算），螺桿檢核拉力，鋼管支撐以軸壓檢核挫曲。載重、側壓力、材料容許值、撓度限制與支撐長由計算人員依材料規格、施工規範與契約確認，本計算書僅供施工規劃參考。計算日期：${esc(rocYmd(today()))}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#bfBack").onclick = () => goBack("#/struct/beam");
  $("#pvPrint").onclick = doPrint;
}

STRUCT_TABS.push(["beam", "梁模板", tabBeamForm]);
