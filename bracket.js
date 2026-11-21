"use strict";
/* 三角架（施工架托架）結構計算（結構計算的「三角架」分頁，另有 A4 計算書 #/struct/brk/sheet）
   參考網站 realizcalc.com「三角架結構計算」（2026-11-14 讀取 bracket.js）：型式 1～5、幾何參數、
   斷面（矩形管／槽鋼／圓管／等邊角鋼）、P = 1.2PD + 1.6PL、自重 × 1.2、上弦／下斜桿／靠牆立材為梁元素、
   加勁桿為桁架元素、靠牆兩處為固定支承。參考網站的構架分析與強度檢核在伺服器端看不到，
   這裡是工具箱自己寫的平面構架分析（直接勁度法）與簡化極限設計檢核，係數可改、皆非規範原文。
   ‧材料：SS400 Fy 245（t ≤ 16 mm）／235（t ≤ 40），SS330 205／195 MPa（參考網站引中鋼型錄），E = 200000 MPa。
   ‧檢核（每一桿段，L = 結構節點間長度、K 可改）：
     受壓 φcPn（極限設計法柱公式，與施工架主柱同 scFcr）、受拉 φtFyA、彎矩 φbFyS（彈性斷面模數，保守）、
     剪力 φv0.6FyAw、軸力與彎矩互制（Pr/Pc ≥ 0.2：Pr/Pc + 8/9·Mr/Mc；否則 Pr/2Pc + Mr/Mc）。
     只檢核托架平面內；平面外挫屈、扭轉、側向扭轉挫屈、局部挫屈、接合與錨栓不在範圍。
   ‧單位：幾何 cm、斷面輸入 mm、力 kgf、彎矩 kgf·cm（顯示 kgf·m）、Fy／E 用 MPa。 */

const BK_TYPES = [["1", "型式1｜上弦懸伸"], ["2", "型式2｜單豎桿"], ["3", "型式3｜雙豎桿"], ["4", "型式4｜V形補強"], ["5", "型式5｜連續斜桿"]];
const BK_GROUPS = [["top", "上弦"], ["bottom", "下斜桿"], ["wall", "靠牆立材"], ["web", "加勁桿"]];
const BK_KINDS = [["rhs", "矩形管"], ["channel", "槽鋼"], ["chs", "圓管"], ["angle", "等邊角鋼"]];
const BK_MATS = { SS400: [245, 235, 215, 205], SS330: [205, 195, 175, 165] };   // MPa；t ≤ 16／40／100／200 mm
const BK_FU = { SS400: 400, SS330: 330 };
const bkFyOf = (mat, t) => { const v = BK_MATS[mat]; if (!v || !(t > 0)) return ""; const i = [16, 40, 100, 200].findIndex(x => t <= x); return i < 0 ? "" : String(v[i]); };
const BK_PHI_DEF = { phic: "0.85", phit: "0.9", phib: "0.9", phiv: "0.9" };
const bkSec = (kind, b, h, t, d) => ({ kind, b, h, t, d });
const bkBlank = () => ({
  info: { proj: "", loc: "", who: "" }, type: "1", X: "150", Y: "48", y1: "8", y2: "24", x1: "40", x2: "50", q1: "50", q2: "50", s1: "20", s2: "76.2",
  PD1: "", PD2: "", PL1: "", PL2: "", src: "", self: "1", mat: "SS400", fy: "245", wmat: "SS400", wfy: "245", E: "200000", K: "1", ...BK_PHI_DEF,
  sec: { top: bkSec("rhs", "40", "60", "3", "42.7"), bottom: bkSec("rhs", "40", "60", "3", "42.7"), wall: bkSec("rhs", "40", "60", "3", "42.7"), web: bkSec("angle", "40", "40", "3", "42.7") }
});
function bkLoad() {
  const d = bkBlank();
  let s; try { s = JSON.parse(ls.get("calcBrkForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s);
  if (s.sec && typeof s.sec === "object") for (const [g] of BK_GROUPS) pick(d.sec[g], s.sec[g]);
  if (!BK_TYPES.some(([k]) => k === d.type)) d.type = "1";
  for (const [g] of BK_GROUPS) if (!BK_KINDS.some(([k]) => k === d.sec[g].kind)) d.sec[g].kind = "rhs";
  return d;
}
const bkSave = st => { ls.set("calcBrkForm", JSON.stringify(st)); svKept(); };

/* ---------- 斷面（輸入 mm，輸出 cm） ---------- */
function bkSection(p) {
  const F = colF, t = F(p.t) / 10, b = F(p.b) / 10, h = F(p.h) / 10, D = F(p.d) / 10;
  if (!(t > 0)) return { err: "厚度須大於 0" };
  let A, I, S, Aw, Imin, txt;
  if (p.kind === "chs") {
    if (!(D > 2 * t)) return { err: "圓管須外徑 D > 2t" };
    const di = D - 2 * t; A = Math.PI / 4 * (D * D - di * di); I = Math.PI / 64 * (D ** 4 - di ** 4); S = I / (D / 2); Aw = A / 2; Imin = I;
    txt = `圓管 φ${esc(p.d)} × ${esc(p.t)} mm`;
  } else if (p.kind === "rhs") {
    if (!(b > 2 * t && h > 2 * t)) return { err: "矩形管 B、H 須大於 2t" };
    A = b * h - (b - 2 * t) * (h - 2 * t); I = (b * h ** 3 - (b - 2 * t) * (h - 2 * t) ** 3) / 12; S = I / (h / 2); Aw = 2 * (h - 2 * t) * t;
    Imin = Math.min(I, (h * b ** 3 - (h - 2 * t) * (b - 2 * t) ** 3) / 12);
    txt = `矩形管 □${esc(p.b)} × ${esc(p.h)} × ${esc(p.t)} mm（H 在托架平面內）`;
  } else if (p.kind === "channel") {
    if (!(b > t && h > 2 * t)) return { err: "槽鋼須翼寬 B > t、總高 H > 2t" };
    A = 2 * b * t + (h - 2 * t) * t; I = (b * h ** 3 - (b - t) * (h - 2 * t) ** 3) / 12; S = I / (h / 2); Aw = (h - 2 * t) * t;
    const cx = (2 * b * t * b / 2 + (h - 2 * t) * t * t / 2) / A;
    Imin = Math.min(I, 2 * (t * b ** 3 / 12 + b * t * (b / 2 - cx) ** 2) + (h - 2 * t) * t ** 3 / 12 + (h - 2 * t) * t * (t / 2 - cx) ** 2);
    txt = `槽鋼 [${esc(p.h)} × ${esc(p.b)} × ${esc(p.t)} mm（腹板在托架平面內）`;
  } else {
    if (!(b > t)) return { err: "角鋼須邊長 B > t" };
    // 等邊角鋼：以兩個矩形組合，Imin = Ix − |Ixy|（等邊時 Ix = Iy）
    const parts = [[t, b, t / 2, b / 2], [b - t, t, (b + t) / 2, t / 2]];
    A = parts.reduce((s, [w, hh]) => s + w * hh, 0);
    const c = parts.reduce((s, [w, hh, x]) => s + w * hh * x, 0) / A;
    const Ix = parts.reduce((s, [w, hh, , y]) => s + w * hh ** 3 / 12 + w * hh * (y - c) ** 2, 0);
    const Ixy = parts.reduce((s, [w, hh, x, y]) => s + w * hh * (x - c) * (y - c), 0);
    Imin = Ix - Math.abs(Ixy); I = Imin; S = Imin / (b / Math.SQRT2); Aw = b * t;
    txt = `等邊角鋼 L${esc(p.b)} × ${esc(p.b)} × ${esc(p.t)} mm（取最小慣性矩）`;
  }
  return { A, I, S, Aw, r: Math.sqrt(I / A), rmin: Math.sqrt(Imin / A), kgm: A * 0.785, t: t * 10, txt };
}

/* ---------- 幾何 ---------- */
function bkGeometry(st) {
  const F = colF, type = st.type, X = F(st.X), Y = F(st.Y), y1 = F(st.y1), y2 = F(st.y2), x1 = F(st.x1), x2 = F(st.x2), q1 = F(st.q1), q2 = F(st.q2), a = F(st.s1), B = F(st.s2);
  const err = [];
  if (!(X > 0 && Y > 0)) err.push("總長 X、總高 Y 須大於 0");
  if (!(y1 >= 0 && y2 > 0 && y1 + y2 <= Y)) err.push("支承位置須 y₁ ≥ 0、y₂ > 0、y₁ + y₂ ≤ Y");
  if (!(x1 > 0 && x1 < X)) err.push("x₁ 須大於 0 且小於 X");
  if ("345".includes(type) && !(x2 > 0 && x1 + x2 < X)) err.push("上弦分段須 x₂ > 0、x₁ + x₂ < X");
  if ("45".includes(type) && !(q1 > 0 && q1 < X)) err.push("下弦 x′₁ 須大於 0 且小於 X");
  if (type === "5" && !(q2 > 0 && q1 + q2 < X)) err.push("下弦分段須 x′₂ > 0、x′₁ + x′₂ < X");
  if (type === "5" && !(x1 <= q1 && q1 < x1 + x2 && x1 + x2 <= q1 + q2)) err.push("型式5 節點須依序：x₁ ≤ x′₁ < x₁+x₂ ≤ x′₁+x′₂");
  if (!(a >= 0 && B > 0 && a + B <= X)) err.push("兩腳載重點須在上弦範圍內：s₁ ≥ 0、s₁ + s₂ ≤ X");
  const g = { type, X, Y, y1, y2, x1, x2, q1, q2, a, B, err, segs: [] };
  if (err.length) return g;
  const lowerX = type === "1" ? x1 : X, lower = x => [x, -Y + Y * x / lowerX];
  const add = (grp, p1, p2) => g.segs.push({ grp, p1, p2 });
  add("top", [0, 0], [X, 0]); add("wall", [0, 0], [0, -Y]); add("bottom", [0, -Y], [lowerX, 0]);
  if (type === "2") add("web", [x1, 0], lower(x1));
  if (type === "3") { add("web", [x1, 0], lower(x1)); add("web", [x1 + x2, 0], lower(x1 + x2)); }
  if (type === "4") { add("web", [x1, 0], lower(q1)); add("web", lower(q1), [x1 + x2, 0]); }
  if (type === "5") { add("web", [0, -Y], [x1, 0]); add("web", [x1, 0], lower(q1)); add("web", lower(q1), [x1 + x2, 0]); add("web", [x1 + x2, 0], lower(q1 + q2)); }
  g.lowerX = lowerX; g.supports = [[0, -y1], [0, -y1 - y2]]; g.loads = [[a, 0], [a + B, 0]];
  return g;
}

/* ---------- 平面構架分析（直接勁度法） ---------- */
function bkSolve(g, secs, E, selfF, P) {
  const nodes = [], key = p => `${Math.round(p[0] * 1000)},${Math.round(p[1] * 1000)}`, idx = new Map();
  const node = p => { const k = key(p); if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push([p[0], p[1]]); } return idx.get(k); };
  // 所有特殊點（支承、載重點、桿件端點）加為節點，梁元素在其上切段
  const pts = [...g.segs.flatMap(s => [s.p1, s.p2]), ...g.supports, ...g.loads];
  pts.forEach(node);
  const onSeg = (p, s) => { const [x1, y1] = s.p1, [x2, y2] = s.p2, L = Math.hypot(x2 - x1, y2 - y1); const tt = ((p[0] - x1) * (x2 - x1) + (p[1] - y1) * (y2 - y1)) / L / L; const dx = x1 + tt * (x2 - x1) - p[0], dy = y1 + tt * (y2 - y1) - p[1]; return tt > 1e-9 && tt < 1 - 1e-9 && Math.hypot(dx, dy) < 1e-6 ? tt : null; };
  const els = [];
  for (const s of g.segs) {
    const truss = s.grp === "web";
    const ts = [0, 1]; if (!truss) for (const p of nodes) { const tt = onSeg(p, s); if (tt !== null) ts.push(tt); }
    ts.sort((a, b) => a - b);
    for (let i = 0; i < ts.length - 1; i++) {
      const pa = [s.p1[0] + ts[i] * (s.p2[0] - s.p1[0]), s.p1[1] + ts[i] * (s.p2[1] - s.p1[1])], pb = [s.p1[0] + ts[i + 1] * (s.p2[0] - s.p1[0]), s.p1[1] + ts[i + 1] * (s.p2[1] - s.p1[1])];
      els.push({ grp: s.grp, truss, i: node(pa), j: node(pb), sec: secs[s.grp] });
    }
  }
  const n = nodes.length * 3, K = Array.from({ length: n }, () => new Float64Array(n)), Fv = new Float64Array(n);
  const local = e => {
    const [xi, yi] = nodes[e.i], [xj, yj] = nodes[e.j], L = Math.hypot(xj - xi, yj - yi), c = (xj - xi) / L, s = (yj - yi) / L;
    const EA = E * e.sec.A / L, EI = E * e.sec.I;
    const k = Array.from({ length: 6 }, () => new Array(6).fill(0));
    k[0][0] = k[3][3] = EA; k[0][3] = k[3][0] = -EA;
    if (!e.truss) {
      const a = 12 * EI / L ** 3, b = 6 * EI / L ** 2, d = 4 * EI / L, f = 2 * EI / L;
      [[1, 1, a], [1, 2, b], [1, 4, -a], [1, 5, b], [2, 2, d], [2, 4, -b], [2, 5, f], [4, 4, a], [4, 5, -b], [5, 5, d]].forEach(([r, q, v]) => { k[r][q] = v; k[q][r] = v; });
    }
    const T = [[c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0], [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1]];
    const q = selfF * e.sec.A * 0.00785;   // 自重 kgf/cm（向下）
    const pa = -q * s, pt = -q * c;          // 局部軸向、橫向分量
    const feq = e.truss ? [pa * L / 2, pt * L / 2, 0, pa * L / 2, pt * L / 2, 0] : [pa * L / 2, pt * L / 2, pt * L * L / 12, pa * L / 2, pt * L / 2, -pt * L * L / 12];
    return { L, c, s, k, T, feq, pa, pt };
  };
  const dof = e => [e.i * 3, e.i * 3 + 1, e.i * 3 + 2, e.j * 3, e.j * 3 + 1, e.j * 3 + 2];
  for (const e of els) {
    const m = e.m = local(e), d = dof(e);
    const kg = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, q) => { let v = 0; for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) v += m.T[a][r] * m.k[a][b] * m.T[b][q]; return v; }));
    for (let r = 0; r < 6; r++) { for (let q = 0; q < 6; q++) K[d[r]][d[q]] += kg[r][q]; let f = 0; for (let a = 0; a < 6; a++) f += m.T[a][r] * m.feq[a]; Fv[d[r]] += f; }
  }
  g.loads.forEach((p, i) => { Fv[node(p) * 3 + 1] -= P[i]; });
  const fixed = new Set(g.supports.flatMap(p => { const k = node(p); return [k * 3, k * 3 + 1, k * 3 + 2]; }));
  // 只接桁架的節點沒有轉動勁度（本模型不會發生，保險起見固定其轉角）
  nodes.forEach((_, k) => { if (!els.some(e => !e.truss && (e.i === k || e.j === k))) fixed.add(k * 3 + 2); });
  const free = [...Array(n).keys()].filter(i => !fixed.has(i)), m = free.length;
  const A = free.map(r => [...free.map(q => K[r][q]), Fv[r]]);
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (!(Math.abs(A[p][c]) > 1e-9)) return { err: "構架不穩定，請檢查幾何" };
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < m; r++) if (r !== c) { const f = A[r][c] / A[c][c]; if (f) for (let q = c; q <= m; q++) A[r][q] -= f * A[c][q]; }
  }
  const u = new Float64Array(n); free.forEach((r, i) => { u[r] = A[i][m] / A[i][i]; });
  // 桿件內力（局部端力 = k·T·u − feq），沿桿取 11 點
  for (const e of els) {
    const { k, T, feq, L, pa, pt } = e.m, ug = dof(e).map(i => u[i]);
    const ul = T.map(row => row.reduce((s, v, j) => s + v * ug[j], 0));
    const f = k.map((row, r) => row.reduce((s, v, j) => s + v * ul[j], 0) - feq[r]);
    e.pts = Array.from({ length: 11 }, (_, i) => { const x = L * i / 10; return { N: -f[0] - pa * x, V: f[1] + pt * x, M: e.truss ? 0 : -f[2] + f[1] * x + pt * x * x / 2 }; });
    e.L = L;
  }
  // 支承反力 = K·u − F（只取支承自由度）
  const reac = g.supports.map(p => { const k = node(p); return [0, 1, 2].map(j => { const r = k * 3 + j; let v = -Fv[r]; for (let q = 0; q < n; q++) v += K[r][q] * u[q]; return v; }); });
  const tip = node([g.X, 0]);
  return { nodes, els, u, reac, tipDy: u[tip * 3 + 1] };
}

/* ---------- 計算與檢核 ---------- */
function bkCalc(st) {
  const F = colF, g = bkGeometry(st), E = F(st.E) * SC_MPA, phi = { c: F(st.phic), t: F(st.phit), b: F(st.phib), v: F(st.phiv) }, Kf = F(st.K);
  const secs = {}, serr = [];
  for (const [k, n] of BK_GROUPS) { const s = bkSection(st.sec[k]); if (s.err) { if (k !== "web" || st.type !== "1") serr.push(`${n}：${s.err}`); } else secs[k] = s; }
  const PD = [F(st.PD1), F(st.PD2)], PL = [F(st.PL1), F(st.PL2)];
  const loadOK = [...PD, ...PL].every(v => v >= 0);
  const P = [0, 1].map(i => 1.2 * PD[i] + 1.6 * PL[i]), selfF = st.self === "1" ? 1.2 : 0;
  const fy = { main: F(st.fy), web: F(st.wfy) };
  const miss = [...g.err, ...serr];
  if (!loadOK) miss.push("PD₁、PD₂、PL₁、PL₂（無載重填 0）");
  if (!(fy.main > 0) || !(fy.web > 0) || !(E > 0)) miss.push("材料 Fy、E");
  const base = { g, secs, P, PD, PL, selfF, fy, phi, Kf, miss, checks: [], groups: [], ng: 0 };
  if (miss.length) return base;
  const sol = bkSolve(g, secs, E, selfF, P);
  if (sol.err) { miss.push(sol.err); return base; }
  const groups = BK_GROUPS.filter(([k]) => sol.els.some(e => e.grp === k)).map(([k, n]) => {
    const s = secs[k], Fy = (k === "web" ? fy.web : fy.main) * SC_MPA, truss = k === "web";
    let worst = null;
    sol.els.filter(e => e.grp === k).forEach((e, idx) => {
      const r = truss ? s.rmin : s.r, KLr = Kf * e.L / r, cr = scFcr(KLr, Fy / SC_MPA, F(st.E));
      const Pc = phi.c * cr.Fcr * SC_MPA * s.A, Pt = phi.t * Fy * s.A, Mc = phi.b * Fy * s.S, Vc = phi.v * 0.6 * Fy * s.Aw;
      const Nc = Math.max(0, ...e.pts.map(p => -p.N)), Nt = Math.max(0, ...e.pts.map(p => p.N));
      const Mm = Math.max(...e.pts.map(p => Math.abs(p.M))), Vm = Math.max(...e.pts.map(p => Math.abs(p.V)));
      const inter = Math.max(...e.pts.map(p => { const Pr = Math.abs(p.N), Pcap = p.N < 0 ? Pc : Pt, a = Pr / Pcap, b = truss ? 0 : Math.abs(p.M) / Mc; return a >= 0.2 ? a + 8 / 9 * b : a / 2 + b; }));
      const ratio = Math.max(Nc / Pc, Nt / Pt, truss ? 0 : Mm / Mc, truss ? 0 : Vm / Vc, inter);
      const it = { idx: idx + 1, L: e.L, KLr, cr, Pc, Pt, Mc, Vc, Nc, Nt, Mm, Vm, inter, ratio };
      if (!worst || ratio > worst.ratio) worst = it;
    });
    return { k, n, s, truss, Fy, w: worst, cnt: sol.els.filter(e => e.grp === k).length };
  });
  const checks = groups.flatMap(gr => {
    const w = gr.w, out = [];
    if (w.Nc > 0.5 || (gr.truss && !(w.Nt > 0.5))) out.push({ t: `${gr.n} 受壓 Pu ≤ φcPn`, v: w.Nc, a: w.Pc, u: "kgf", d: 1 });
    if (w.Nt > 0.5) out.push({ t: `${gr.n} 受拉 Tu ≤ φtTn`, v: w.Nt, a: w.Pt, u: "kgf", d: 1 });
    if (!gr.truss) out.push({ t: `${gr.n} 彎矩 Mu ≤ φbMn`, v: w.Mm / 100, a: w.Mc / 100, u: "kgf·m", d: 2 }, { t: `${gr.n} 剪力 Vu ≤ φvVn`, v: w.Vm, a: w.Vc, u: "kgf", d: 1 });
    if (!gr.truss) out.push({ t: `${gr.n} 軸力與彎矩互制`, v: w.inter, a: 1, u: "比值", d: 3 });
    return out;
  });
  return { ...base, sol, groups, checks, ng: checks.filter(c => colJudge(c)[1] === "bad").length };
}

/* ---------- 示意圖 ---------- */
function bkSvg(r, st) {
  const g = r.g;
  if (g.err.length) return `<p class="cnote">${g.err.map(esc).join("；")}</p>`;
  const k = Math.min(250 / g.X, 150 / g.Y), ox = 66, oy = 40, P = ([x, y]) => [(ox + x * k).toFixed(1), (oy - y * k).toFixed(1)];
  const out = [];
  for (const s of g.segs) { const [a, b] = [P(s.p1), P(s.p2)]; out.push(`<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="currentColor" stroke-width="${s.grp === "web" ? 1.4 : 3}"${s.grp === "web" ? ' stroke-dasharray="4 2"' : ""}/>`); }
  for (const p of g.supports) { const [x, y] = P(p); out.push(`<path d="M${x - 10},${+y - 9}v18 ${[-8, -2, 4].map(d => `M${x - 10},${+y + d}l-6,5`).join(" ")}" fill="none" stroke="currentColor"/><circle cx="${x}" cy="${y}" r="3" fill="currentColor"/>`); }
  g.loads.forEach((p, i) => { const [x, y] = P(p); out.push(`<path d="M${x},${+y - 26}V${+y - 3}m-4,-7l4,7l4,-7" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="${x}" y="${+y - 30}" text-anchor="middle" font-size="10" fill="currentColor">P${i + 1}${Number.isFinite(r.P[i]) ? " " + fmt(r.P[i], 1) : ""}</text>`); });
  const by = oy + g.Y * k;
  const dims = `<g font-size="9" fill="currentColor">
    <line x1="${ox}" x2="${(ox + g.X * k).toFixed(1)}" y1="${(by + 14).toFixed(1)}" y2="${(by + 14).toFixed(1)}" stroke="currentColor" stroke-width=".7"/><text x="${(ox + g.X * k / 2).toFixed(1)}" y="${(by + 25).toFixed(1)}" text-anchor="middle">X ${fmt(g.X, 1)}</text>
    <line x1="${ox - 26}" x2="${ox - 26}" y1="${oy}" y2="${by.toFixed(1)}" stroke="currentColor" stroke-width=".7"/><text x="${ox - 29}" y="${((oy + by) / 2 + 3).toFixed(1)}" text-anchor="end">Y ${fmt(g.Y, 1)}</text>
    <text x="8" y="${(by + 40).toFixed(1)}">粗線：上弦、下斜桿、靠牆立材（梁元素）</text><text x="8" y="${(by + 52).toFixed(1)}">虛線：加勁桿（桁架）；牆側兩點為固定支承</text></g>`;
  return `<svg class="cfsvg" viewBox="0 0 ${Math.max(230, ox + g.X * k + 30).toFixed(0)} ${(by + 58).toFixed(0)}" role="img" aria-label="三角架構造示意圖">${out.join("")}${dims}</svg>`;
}

const bkResultText = (r, f) => !r.sol ? [] : [
  `P₁ = 1.2 × ${f(r.PD[0], 1)} + 1.6 × ${f(r.PL[0], 1)} = ${f(r.P[0], 1)} kgf；P₂ = 1.2 × ${f(r.PD[1], 1)} + 1.6 × ${f(r.PL[1], 1)} = ${f(r.P[1], 1)} kgf；托架自重${r.selfF ? " × 1.2 計入" : "未計入"}`,
  ...r.sol.reac.map((v, i) => `支承 ${i + 1}（距上弦 ${f(-r.g.supports[i][1], 1)} cm）反力：水平 ${f(v[0], 1)} kgf、垂直 ${f(v[1], 1)} kgf、彎矩 ${f(v[2] / 100, 2)} kgf·m（已乘係數，正值為向右／向上／逆時針）`),
  `外端垂直位移（設計載重下）${f(r.sol.tipDy * 10, 2)} mm`,
  ...r.groups.map(gr => { const w = gr.w; return `${gr.n}（${gr.s.txt}，Fy ${f(gr.Fy / SC_MPA, 0)} MPa；共 ${gr.cnt} 段，控制第 ${w.idx} 段 L = ${f(w.L, 1)} cm）：A ${f(gr.s.A, 3)} cm²、${gr.truss ? `rmin ${f(gr.s.rmin, 3)}` : `I ${f(gr.s.I, 3)} cm⁴、S ${f(gr.s.S, 3)} cm³、r ${f(gr.s.r, 3)}`} cm；KL/r ${f(w.KLr, 1)}、λc ${f(w.cr.lc, 3)}、Fcr ${f(w.cr.Fcr, 1)} MPa；φcPn ${f(w.Pc, 1)}、φtTn ${f(w.Pt, 1)} kgf${gr.truss ? "" : `、φbMn ${f(w.Mc / 100, 2)} kgf·m、φvVn ${f(w.Vc, 1)} kgf`}`; })
];

/* ---------- 畫面 ---------- */
function tabBracket(box) {
  const st = bkLoad();
  const inp = (path, val, ph = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const txt = (path, val, ph = "") => `<input data-p="${path}" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const sel = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const fld = (l, h) => `<div class="field"><label>${l}</label>${h}</div>`;
  const matOpts = [["SS400", "SS400"], ["SS330", "SS330"], ["", "自訂"]];
  const draw = () => {
    const ty = st.type;
    box.innerHTML = `
      <div class="cfsteps"><a href="#bk1">1 型式與尺寸</a><a href="#bk2">2 斷面與材料</a><a href="#bk3">3 檢核結果</a></div>
      <section class="panel" id="bk1"><h2><span class="cfno">1</span>型式、尺寸與載重</h2>
        <div class="grid2">
          ${fld("位置", txt("info.loc", st.info.loc, "例：北向外牆 3F"))}
          ${fld("托架型式", sel("type", BK_TYPES, ty))}
          ${fld("計算人員", txt("info.who", st.info.who))}
          ${fld("總長 X（cm）", inp("X", st.X))}
          ${fld("總高 Y（cm）", inp("Y", st.Y))}
          ${fld("上端至支承 y₁（cm）", inp("y1", st.y1))}
          ${fld("支承間距 y₂（cm）", inp("y2", st.y2))}
          ${fld("上弦 x₁（cm）", inp("x1", st.x1))}
          ${"345".includes(ty) ? fld("上弦 x₂（cm）", inp("x2", st.x2)) : ""}
          ${"45".includes(ty) ? fld("下弦 x′₁（水平投影，cm）", inp("q1", st.q1)) : ""}
          ${ty === "5" ? fld("下弦 x′₂（水平投影，cm）", inp("q2", st.q2)) : ""}
          ${fld("距牆 s₁（cm）", inp("s1", st.s1))}
          ${fld("兩腳間距 s₂（cm）", inp("s2", st.s2))}
          ${fld("靜載重 PD₁（kgf）", inp("PD1", st.PD1, "無載重填 0"))}
          ${fld("靜載重 PD₂（kgf）", inp("PD2", st.PD2, "無載重填 0"))}
          ${fld("活載重 PL₁（kgf）", inp("PL1", st.PL1, "無載重填 0"))}
          ${fld("活載重 PL₂（kgf）", inp("PL2", st.PL2, "無載重填 0"))}
          ${fld("托架自重", sel("self", [["1", "計入（× 1.2）"], ["0", "不計"]], st.self))}
        </div>
        ${st.src ? `<p class="cnote">${esc(st.src)}</p>` : ""}<p class="cnote">P₁、P₂ 為施工架兩支腳柱落在上弦的載重，設計值 P = 1.2PD + 1.6PL。PD、PL 可用「施工架」分頁每支主柱的 D、L。s₁ 預設 20 cm 是參考網站的模型假設，不是法定尺寸；距牆開口的防墜措施請另依規定確認。</p>
        <div id="bkFig"></div></section>
      <section class="panel" id="bk2"><h2><span class="cfno">2</span>斷面與材料</h2>
        <div class="grid2">
          ${fld("主架材質（上弦、下斜桿、靠牆立材）", `<select id="bkMat">${matOpts.map(([v, l]) => `<option value="${v}" ${st.mat === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
          ${fld("主架 Fy（MPa）", inp("fy", st.fy))}
          ${ty !== "1" ? fld("加勁桿材質", `<select id="bkWmat">${matOpts.map(([v, l]) => `<option value="${v}" ${st.wmat === v ? "selected" : ""}>${l}</option>`).join("")}</select>`) + fld("加勁桿 Fy（MPa）", inp("wfy", st.wfy)) : ""}
          ${fld("彈性模數 E（MPa）", inp("E", st.E))}
          ${fld("有效長度係數 K", inp("K", st.K))}
        </div>
        ${BK_GROUPS.filter(([g]) => g !== "web" || ty !== "1").map(([g, n]) => { const s = st.sec[g]; return `<h3 class="cfh">${n}${g === "web" ? "（桁架，只受軸力）" : ""}</h3><div class="grid2">
          ${fld("斷面", sel(`sec.${g}.kind`, BK_KINDS, s.kind))}
          ${s.kind === "chs" ? fld("外徑 D（mm）", inp(`sec.${g}.d`, s.d)) : fld(s.kind === "angle" ? "邊長 B（mm）" : s.kind === "channel" ? "翼寬 B（mm）" : "寬 B（平面外，mm）", inp(`sec.${g}.b`, s.b))}
          ${s.kind === "rhs" || s.kind === "channel" ? fld(s.kind === "channel" ? "總高 H（平面內，mm）" : "高 H（平面內，mm）", inp(`sec.${g}.h`, s.h)) : ""}
          ${fld("厚度 t（mm）", inp(`sec.${g}.t`, s.t))}</div><p class="cnote" style="margin-top:0" data-sec="${g}"></p>`; }).join("")}
        <p class="cnote">材質 Fy 依厚度帶入（SS400：t ≤ 16 mm 245、≤ 40 mm 235；SS330：205、195 MPa，參考網站引中鋼型錄），可自訂。斷面忽略圓角、以等厚計算；矩形管 H、槽鋼腹板在托架平面內；角鋼取最小慣性矩。</p>
        <h3 class="cfh">強度折減係數</h3>
        <div class="grid2">${fld("受壓 φc", inp("phic", st.phic))}${fld("受拉 φt", inp("phit", st.phit))}${fld("彎矩 φb", inp("phib", st.phib))}${fld("剪力 φv", inp("phiv", st.phiv))}</div>
        <p class="cnote">非規範原文，依採用的設計規範修改。</p></section>
      <section class="panel" id="bk3"><h2><span class="cfno">3</span>檢核結果</h2><div id="bkRes"></div>
        <div class="row"><a class="btnlink" href="#/struct/brk/sheet" id="bkSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="bkClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁以平面構架（線彈性、一階）分析托架平面內的軸力、剪力與彎矩，靠牆兩處假設為固定支承。平面外挫屈、扭轉、局部挫屈、銲接與螺栓接合、錨栓與牆體承載都未檢核。結果僅供施工規劃參考，托架安全仍應依法規、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    bkSave(st);
    const r = bkCalc(st);
    $("#bkFig").innerHTML = bkSvg(r, st);
    for (const [g] of BK_GROUPS) { const el = box.querySelector(`[data-sec="${g}"]`); if (!el) continue; const s = bkSection(st.sec[g]); el.textContent = s.err ? s.err : `A ${fmt(s.A, 3)} cm²、平面內 I ${fmt(s.I, 3)} cm⁴、S ${fmt(s.S, 3)} cm³、r ${fmt(s.r, 3)} cm、rmin ${fmt(s.rmin, 3)} cm、自重 ${fmt(s.kgm, 2)} kg/m`; }
    const cell = c => { const [j, cls] = colJudge(c); return Number.isFinite(c.v) && c.a > 0 ? `<td class="${cls}">${fmt(c.v / c.a, 2)}<small>${j}</small></td>` : `<td>—</td>`; };
    $("#bkRes").innerHTML = r.miss.length ? `<div class="big"><span>總結</span><b><span style="font-size:15px;color:var(--mut)">待補：${r.miss.map(esc).join("、")}</span></b></div>`
      : `<div class="big"><span>總結</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過設計強度</em>` : `<em class="cfj ok">全部在設計強度以內</em>`}</b></div>
      <div class="tblwrap"><table class="ct cfres" id="bkChk"><tr><th>項目</th><th>需求</th><th>強度</th><th>比值</th></tr>
        ${r.checks.map(c => `<tr><th>${c.t}</th><td>${fmt(c.v, c.d)}<small>${c.u}</small></td><td>${fmt(c.a, c.d)}</td>${cell(c)}</tr>`).join("")}</table></div>
      <p class="cnote">各桿件取比值最大的一段。比值 ≤ 1 為 OK。</p>
      <details class="cfdet"><summary>計算明細與支承反力</summary>${bkResultText(r, fmt).map(x => `<p class="cfdh">${x}</p>`).join("")}</details>`;
    if (r.sol) {
      $("#bkRes").insertAdjacentHTML("beforeend", `<div class="row">${r.sol.reac.map((_, i) => `<button type="button" class="sec" data-toanc="${i}">支承 ${i + 1} 反力帶入錨栓</button>`).join("")}</div><p class="cnote" style="margin-top:0">代入規則同參考網站：P = Rx、Vy = −Ry、Mx = −Mz，Vx、My、Mz 為 0。</p>`);
      box.querySelectorAll("[data-toanc]").forEach(b => b.onclick = () => {
        const i = +b.dataset.toanc, [Rx, Ry, Mz] = r.sol.reac[i], a = ancLoad(), z = x => Math.abs(x) < 0.005 ? "0" : fmt(x, 2);
        Object.assign(a, { P: z(Rx), Vx: "0", Vy: z(-Ry), Mx: z(-Mz), My: "0", Mz: "0", src: `由三角架支承 ${i + 1}（距上弦 ${fmt(-r.g.supports[i][1], 1)} cm）反力帶入` });
        ancSave(a); location.hash = "#/struct/anc";
      });
    }
  };
  const setv = (p, v) => { const ks = p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k]; o[last] = v; const el = box.querySelector(`[data-p="${p}"]`); if (el) el.value = v; };
  const thick = g => colF(st.sec[g].t);
  const autoFy = () => { if (st.mat) setv("fy", bkFyOf(st.mat, Math.max(thick("top"), thick("bottom"), thick("wall")))); if (st.wmat) setv("wfy", bkFyOf(st.wmat, thick("web"))); };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = ev => {
      const p = el.dataset.p, ks = p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      if (ev && ev.type === "change" && el.tagName === "INPUT" && o[last] === el.value) return;   // 輸入後失焦不重算，避免按鈕被重畫而按不到
      o[last] = el.value;
      if (/^P[DL]/.test(p)) st.src = "";
      if (p === "type" || p.endsWith(".kind")) return draw();
      if (p === "fy") { st.mat = ""; const s = $("#bkMat"); if (s) s.value = ""; }
      if (p === "wfy") { st.wmat = ""; const s = $("#bkWmat"); if (s) s.value = ""; }
      if (p.endsWith(".t")) autoFy();
      calc();
    });
    $("#bkMat").onchange = e => { st.mat = e.target.value; autoFy(); calc(); };
    const w = $("#bkWmat"); if (w) w.onchange = e => { st.wmat = e.target.value; autoFy(); calc(); };
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#bkClear").onclick = () => { if (!confirm("清除三角架的輸入？")) return; Object.assign(st, bkBlank()); draw(); };
    $("#bkSheet").onclick = e => { e.preventDefault(); location.hash = "#/struct/brk/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderBrkSheet() {
  const st = bkLoad(), r = bkCalc(st), company = siteCompany(siteId);
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const g = r.g, ty = st.type;
  const crow = c => { const [j] = colJudge(c); return `<tr><td>${c.t}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${v(c.a, c.d)}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${j}</td></tr>`; };
  const dims = [["X", st.X], ["Y", st.Y], ["y₁", st.y1], ["y₂", st.y2], ["x₁", st.x1], ...("345".includes(ty) ? [["x₂", st.x2]] : []), ...("45".includes(ty) ? [["x′₁", st.q1]] : []), ...(ty === "5" ? [["x′₂", st.q2]] : []), ["s₁", st.s1], ["s₂", st.s2]];
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="bkBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">三角架（施工架托架）結構計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置</td><td>${esc(st.info.loc)}</td><td>托架型式</td><td>${esc(BK_TYPES.find(([k]) => k === ty)[1])}</td></tr>
        <tr><td>尺寸（cm）</td><td colspan="3">${dims.map(([k, x]) => `${k} ${esc(x)}`).join("、")}</td></tr>
        <tr><td>載重</td><td colspan="3">PD₁ ${esc(st.PD1)}、PD₂ ${esc(st.PD2)}、PL₁ ${esc(st.PL1)}、PL₂ ${esc(st.PL2)} kgf；P = 1.2PD + 1.6PL；托架自重${st.self === "1" ? " × 1.2 計入" : "未計入"}</td></tr>
      </table>
      <figure class="cffig">${bkSvg(r, st)}</figure>
      <table class="pt">
        <tr><th colspan="2">二、斷面與材料</th></tr>
        ${BK_GROUPS.filter(([k]) => k !== "web" || ty !== "1").map(([k, n]) => { const s = bkSection(st.sec[k]); return `<tr><td>${n}</td><td>${s.err ? esc(s.err) : `${s.txt}；A ${v(s.A, 3)} cm²、I ${v(s.I, 3)} cm⁴、S ${v(s.S, 3)} cm³`}；Fy ${esc(k === "web" ? st.wfy : st.fy)} MPa</td></tr>`; }).join("")}
        <tr><td>其他</td><td>E ${esc(st.E)} MPa、K ${esc(st.K)}；φc ${esc(st.phic)}、φt ${esc(st.phit)}、φb ${esc(st.phib)}、φv ${esc(st.phiv)}（非規範原文）</td></tr>
      </table>
      <table class="pt">
        <tr><th>三、分析結果</th></tr>
        ${r.miss.length ? `<tr><td>待補：${r.miss.map(esc).join("、")}</td></tr>` : bkResultText(r, v).map(x => `<tr><td>${x}</td></tr>`).join("")}
      </table>
      ${r.checks.length ? `<table class="pt">
        <tr><th colspan="6">四、強度檢核（各桿件取控制段）</th></tr>
        <tr><th>項目</th><th>需求</th><th>強度</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${r.checks.map(crow).join("")}</table>` : ""}
      <table class="pt"><tr><th>檢核結果</th><td>${r.miss.length ? "資料未完整" : r.ng ? `${r.ng} 項超過設計強度` : "全部在設計強度以內"}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：平面構架線彈性一階分析，上弦、下斜桿、靠牆立材為梁元素，加勁桿為桁架元素，靠牆兩處為固定支承。只檢核托架平面內之軸力、彎矩、剪力與互制；平面外挫屈、扭轉、局部挫屈、接合、錨栓與牆體承載未檢核。本計算書僅供施工規劃參考。計算日期：${esc(rocYmd(today()))}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#bkBack").onclick = () => goBack("#/struct/brk");
  $("#pvPrint").onclick = doPrint;
}

STRUCT_TABS.push(["brk", "三角架", tabBracket]);
