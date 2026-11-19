"use strict";
/* 慣性矩及斷面性質（結構計算的「斷面性質」分頁，另有 A4 計算書 #/struct/sec/sheet）
   參考網站 realizcalc.com「慣性矩及斷面性質計算」（2026-11-15 讀取）：外輪廓與孔洞以頂點座標輸入（x, y，
   空白／Tab／逗號分隔，順逆時針皆可、自動閉合），座標單位只是標示、不縮放；輸出淨面積、形心、Ix、Iy、Ixy、
   極慣性矩 Jc = Ix + Iy、主慣性矩 Iu／Iv 與主軸角、四側斷面模數 Sx±＝Ix/cy±、Sy±＝Iy/cx±。
   計算為多邊形格林定理（理想化直角、不含圓角）；圓與圓管以內接正 72 邊形近似（參考網站 32 邊），非真實圓。
   本工具另加：常用斷面產生器、迴轉半徑 r、一鍵存入／帶入模板計算機材料庫（calcColLib）的「自訂」格柵斷面。
   未做：參考網站的 DXF 匯入（檔案解析）、塑性斷面模數、扭轉常數（Jc 不是扭轉常數 J）。
   輸入存在 localStorage calcSecForm。 */

const SEC_UNITS = { mm: 0.1, cm: 1, m: 100 };   // 換算成 cm 的倍數（帶入材料庫用）
const SEC_MAX_PTS = 400, SEC_MAX_HOLES = 10, SEC_CIRC_N = 72;
// 常用斷面：f 為尺寸欄位，g 回傳 [外輪廓, ...孔洞]（左下為原點）
const SEC_SHAPES = [
  { k: "rect", n: "實心矩形", f: [["B", "寬 B"], ["H", "高 H"]], g: ({ B, H }) => B > 0 && H > 0 && [[[0, 0], [B, 0], [B, H], [0, H]]] },
  { k: "box", n: "矩形中空（方管）", f: [["B", "寬 B"], ["H", "高 H"], ["t", "厚 t"]], g: ({ B, H, t }) => B > 0 && H > 0 && t > 0 && 2 * t < Math.min(B, H) && [[[0, 0], [B, 0], [B, H], [0, H]], [[t, t], [B - t, t], [B - t, H - t], [t, H - t]]] },
  { k: "circ", n: "圓形（近似）", f: [["D", "直徑 D"]], g: ({ D }) => D > 0 && [secCircle(D / 2, D / 2, D / 2)] },
  { k: "pipe", n: "圓管（近似）", f: [["D", "外徑 D"], ["t", "厚 t"]], g: ({ D, t }) => D > 0 && t > 0 && 2 * t < D && [secCircle(D / 2, D / 2, D / 2), secCircle(D / 2, D / 2, D / 2 - t)] },
  { k: "H", n: "H 型", f: [["H", "高 H"], ["B", "翼寬 B"], ["tw", "腹板厚 tw"], ["tf", "翼板厚 tf"]], g: ({ H, B, tw, tf }) => H > 0 && B > 0 && tw > 0 && tf > 0 && tw < B && 2 * tf < H && (() => { const a = (B - tw) / 2, b = (B + tw) / 2; return [[[0, 0], [B, 0], [B, tf], [b, tf], [b, H - tf], [B, H - tf], [B, H], [0, H], [0, H - tf], [a, H - tf], [a, tf], [0, tf]]]; })() },
  { k: "C", n: "C 型（槽形）", f: [["H", "高 H"], ["B", "翼寬 B"], ["tw", "腹板厚 tw"], ["tf", "翼板厚 tf"]], g: ({ H, B, tw, tf }) => H > 0 && B > 0 && tw > 0 && tf > 0 && tw < B && 2 * tf < H && [[[0, 0], [B, 0], [B, tf], [tw, tf], [tw, H - tf], [B, H - tf], [B, H], [0, H]]] },
  { k: "L", n: "L 型（角鋼）", f: [["B", "橫肢寬 B"], ["H", "直肢高 H"], ["t1", "直肢厚 t1"], ["t2", "橫肢厚 t2"]], g: ({ B, H, t1, t2 }) => B > 0 && H > 0 && t1 > 0 && t2 > 0 && t1 < B && t2 < H && [[[0, 0], [B, 0], [B, t2], [t1, t2], [t1, H], [0, H]]] },
  { k: "T", n: "T 型", f: [["B", "翼寬 B"], ["H", "全高 H"], ["tw", "腹板厚 tw"], ["tf", "翼板厚 tf"]], g: ({ B, H, tw, tf }) => B > 0 && H > 0 && tw > 0 && tf > 0 && tw < B && tf < H && (() => { const a = (B - tw) / 2, b = (B + tw) / 2; return [[[a, 0], [b, 0], [b, H - tf], [B, H - tf], [B, H], [0, H], [0, H - tf], [a, H - tf]]]; })() },
  { k: "tri", n: "直角三角形", f: [["b", "底 b"], ["h", "高 h"]], g: ({ b, h }) => b > 0 && h > 0 && [[[0, 0], [b, 0], [0, h]]] }
];
function secCircle(cx, cy, r) { const p = []; for (let i = 0; i < SEC_CIRC_N; i++) { const a = 2 * Math.PI * i / SEC_CIRC_N; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
const secPtsText = pts => pts.map(([x, y]) => `${+x.toFixed(6)}, ${+y.toFixed(6)}`).join("\n");

const secBlank = () => ({
  info: { proj: "", loc: "", no: "", who: "" }, unit: "mm", sig: "8", axis: "x",
  shape: "box", dims: { B: "200", H: "120", t: "20" },
  outer: "0, 0\n200, 0\n200, 120\n0, 120", holes: ["20, 20\n180, 20\n180, 100\n20, 100"]
});
function secLoad() {
  const d = secBlank();
  let s; try { s = JSON.parse(ls.get("calcSecForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const str = (v, n) => (typeof v === "string" || typeof v === "number") ? String(v).slice(0, n) : "";
  for (const k of Object.keys(d.info)) if (s.info && k in s.info) d.info[k] = str(s.info[k], 60);
  for (const k of ["unit", "sig", "axis", "shape"]) if (k in s) d[k] = str(s[k], 10);
  if (!SEC_UNITS[d.unit]) d.unit = "mm";
  if (!["6", "8", "10"].includes(d.sig)) d.sig = "8";
  if (!["x", "y"].includes(d.axis)) d.axis = "x";
  if (!SEC_SHAPES.some(x => x.k === d.shape)) d.shape = "box";
  if (s.dims && typeof s.dims === "object") { d.dims = {}; for (const k of Object.keys(s.dims).slice(0, 8)) if (/^[A-Za-z0-9]{1,3}$/.test(k)) d.dims[k] = str(s.dims[k], 20); }
  if ("outer" in s) d.outer = str(s.outer, 12000);
  if (Array.isArray(s.holes)) d.holes = s.holes.slice(0, SEC_MAX_HOLES).map(h => str(h, 12000));
  return d;
}
const secSave = st => { ls.set("calcSecForm", JSON.stringify(st)); svKept(); };

/* ---------- 計算 ---------- */
// 解析座標文字：每行（或分號隔開）一點 x, y；回傳 { pts, err }
function secParse(text, label) {
  const pts = [], lines = String(text || "").split(/[\n;]/);
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i].trim(); if (!s) continue;
    const m = s.split(/[\s,，、\t]+/).filter(Boolean);
    const x = Number(m[0]), y = Number(m[1]);
    if (m.length !== 2 || !Number.isFinite(x) || !Number.isFinite(y)) return { pts, err: `${label}第 ${i + 1} 行「${s.slice(0, 20)}」不是 x, y 兩個數字` };
    pts.push([x, y]);
  }
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) pts.pop(); }   // 末點等於首點時視為已閉合
  for (let i = pts.length - 1; i > 0; i--) if (pts[i][0] === pts[i - 1][0] && pts[i][1] === pts[i - 1][1]) pts.splice(i, 1);   // 去掉連續重複點
  if (pts.length > SEC_MAX_PTS) return { pts, err: `${label}頂點超過 ${SEC_MAX_PTS} 個` };
  if (pts.length < 3) return { pts, err: `${label}至少要 3 個頂點` };
  return { pts, err: "" };
}
// 單一多邊形的面積積分（帶正負號，逆時針為正）
function secPoly(pts) {
  let A = 0, Qx = 0, Qy = 0, Ixx = 0, Iyy = 0, Ixy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], c = x0 * y1 - x1 * y0;
    A += c / 2; Qy += (x0 + x1) * c / 6; Qx += (y0 + y1) * c / 6;
    Ixx += (y0 * y0 + y0 * y1 + y1 * y1) * c / 12; Iyy += (x0 * x0 + x0 * x1 + x1 * x1) * c / 12;
    Ixy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c / 24;
  }
  return { A, Qx, Qy, Ixx, Iyy, Ixy };
}
const secOrient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
// 兩線段是否「真正交叉」（端點相接、共線重疊不算）
function secCross(p1, p2, q1, q2) {
  const d1 = secOrient(q1, q2, p1), d2 = secOrient(q1, q2, p2), d3 = secOrient(p1, p2, q1), d4 = secOrient(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
const secEdges = pts => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
function secSelfCross(pts) {
  const e = secEdges(pts), n = e.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (secCross(e[i][0], e[i][1], e[j][0], e[j][1])) return true; }
  return false;
}
const secCrossAny = (a, b) => { const ea = secEdges(a), eb = secEdges(b); return ea.some(([p, q]) => eb.some(([r, s]) => secCross(p, q, r, s))); };
// 點是否在多邊形內（射線法；邊上視為在內）
function secInside(pt, poly) {
  let inside = false; const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (Math.abs(secOrient(poly[j], poly[i], pt)) < 1e-12 * (1 + Math.abs(xi) + Math.abs(yi)) && x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)) return true;
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 多邊形內部一點（取一條邊中點往內側微移；供孔洞是否互相包含的判斷）
function secInnerPt(poly) {
  const ccw = secPoly(poly).A > 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!L) continue;
    const s = (ccw ? 1 : -1) * L * 1e-4, p = [(a[0] + b[0]) / 2 - (b[1] - a[1]) / L * s, (a[1] + b[1]) / 2 + (b[0] - a[0]) / L * s];
    if (secInside(p, poly)) return p;
  }
  return poly[0];
}

function secCalc(st) {
  const err = [], o = secParse(st.outer, "外輪廓");
  if (o.err) err.push(o.err);
  const holes = st.holes.map((h, i) => ({ i, ...secParse(h, `孔洞 ${i + 1} `) })).filter(h => String(st.holes[h.i]).trim() !== "");
  holes.forEach(h => h.err && err.push(h.err));
  const base = { err, outer: o.pts, holes: holes.map(h => h.pts), unit: st.unit };
  if (err.length) return base;
  const po = secPoly(o.pts);
  if (secSelfCross(o.pts)) err.push("外輪廓的邊互相交叉，請依邊界順序輸入頂點");
  else if (!(Math.abs(po.A) > 0)) err.push("外輪廓面積為 0（頂點可能在同一直線上）");
  holes.forEach((h, k) => {
    const n = `孔洞 ${h.i + 1} `;
    if (!(Math.abs(secPoly(h.pts).A) > 0)) err.push(`${n}面積為 0`);
    else if (secSelfCross(h.pts)) err.push(`${n}的邊互相交叉`);
    else if (secCrossAny(h.pts, o.pts) || !h.pts.every(p => secInside(p, o.pts))) err.push(`${n}超出外輪廓`);
    else holes.slice(0, k).forEach(g => { if (secCrossAny(h.pts, g.pts) || secInside(secInnerPt(h.pts), g.pts) || secInside(secInnerPt(g.pts), h.pts)) err.push(`${n}與孔洞 ${g.i + 1} 重疊`); });
  });
  if (err.length) return base;
  // 外輪廓取正、孔洞取負（不論輸入方向）
  const sum = { A: 0, Qx: 0, Qy: 0, Ixx: 0, Iyy: 0, Ixy: 0 };
  const add = (p, sgn) => { const s = sgn * Math.sign(p.A); for (const k in sum) sum[k] += s * p[k]; };
  add(po, 1); holes.forEach(h => add(secPoly(h.pts), -1));
  const A = sum.A;
  if (!(A > 0)) { err.push("扣除孔洞後面積不大於 0"); return base; }
  const xc = sum.Qy / A, yc = sum.Qx / A;
  const Ix = sum.Ixx - A * yc * yc, Iy = sum.Iyy - A * xc * xc, Ixy0 = sum.Ixy - A * xc * yc;
  const Ixy = Math.abs(Ixy0) < 1e-10 * Math.max(Math.abs(Ix), Math.abs(Iy)) ? 0 : Ixy0;   // 對稱斷面的浮點誤差歸零
  const avg = (Ix + Iy) / 2, R = Math.hypot((Ix - Iy) / 2, Ixy), Iu = avg + R, Iv = avg - R;
  // 主軸角：x 軸逆時針轉到 u 軸（I 最大）的角度，取 −90° ≦ θ < 90°
  const Ith = t => Ix * Math.cos(t) ** 2 + Iy * Math.sin(t) ** 2 - 2 * Ixy * Math.sin(t) * Math.cos(t);
  let th = 0.5 * Math.atan2(-2 * Ixy, Ix - Iy);
  if (Ith(th + Math.PI / 2) > Ith(th)) th += Math.PI / 2;
  const nrm = d => { let a = ((d + 90) % 180 + 180) % 180 - 90; if (Math.abs(a) < 1e-9) a = 0; return a; };
  const scale = Math.max(Math.abs(Ix), Math.abs(Iy), 1e-300), round = R / scale < 1e-9;   // 圓形等主軸不定
  const thU = round ? 0 : nrm(th * 180 / Math.PI), thV = nrm(thU + 90);
  const xs = o.pts.map(p => p[0]), ys = o.pts.map(p => p[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
  const cyT = ymax - yc, cyB = yc - ymin, cxR = xmax - xc, cxL = xc - xmin;
  return { ...base, ok: true, A, xc, yc, Ix, Iy, Ixy, J: Ix + Iy, Iu, Iv, thU, thV, round,
    xmin, xmax, ymin, ymax, cyT, cyB, cxR, cxL, SxT: Ix / cyT, SxB: Ix / cyB, SyR: Iy / cxR, SyL: Iy / cxL, rx: Math.sqrt(Ix / A), ry: Math.sqrt(Iy / A) };
}
// 有效位數（參考網站預設顯示 8 位有效數字，例 125,664,160、26.666667），千分位
function secNum(v, sig = 8) {
  if (!Number.isFinite(v)) return "—";
  if (v === 0) return "0";
  const s = (+v.toPrecision(sig)).toString();
  if (/e/.test(s)) return s;
  const [i, f] = s.split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f ? "." + f : "");
}
// 帶入模板計算機材料庫（cm）：axis x → 繞 x 軸彎曲（載重沿 y），S 取兩側較小值
function secToCm(r, unit, axis) {
  const f = SEC_UNITS[unit] || 1, y = axis === "y";
  const I = (y ? r.Iy : r.Ix) * f ** 4, S = Math.min(...(y ? [r.SyR, r.SyL] : [r.SxT, r.SxB])) * f ** 3, A = r.A * f * f;
  const q = (v, n) => String(+v.toPrecision(n));
  return { I: q(I, 6), S: q(S, 6), A: q(A, 6) };
}
// 給材料庫「自訂」卡片用：目前「斷面性質」分頁的結果（cm）；沒有有效結果時回傳 null
function secLastCm() {
  const st = secLoad(), r = secCalc(st);
  return r.ok ? { ...secToCm(r, st.unit, st.axis), axis: st.axis, name: st.info.no } : null;
}

/* ---------- 斷面圖 ---------- */
function secSvg(r, st) {
  if (!r.outer.length || r.outer.length < 3) return `<p class="cnote">輸入外輪廓座標後，這裡會畫出斷面。</p>`;
  const all = [r.outer, ...r.holes].flat(), xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = x1 - x0 || 1, H = y1 - y0 || 1, k = Math.min(300 / W, 220 / H), pad = 34;
  const X = x => (pad + (x - x0) * k).toFixed(1), Y = y => (14 + (y1 - y) * k).toFixed(1);
  const path = pts => "M" + pts.map(([x, y]) => `${X(x)} ${Y(y)}`).join("L") + "Z";
  const out = [`<path d="${[r.outer, ...r.holes].filter(p => p.length >= 3).map(path).join("")}" fill="currentColor" fill-opacity=".14" fill-rule="evenodd" stroke="currentColor" stroke-width="1.3"/>`];
  const vw = 2 * pad + W * k, vh = 14 + H * k + 40;
  if (r.ok) {
    const cx = +X(r.xc), cy = +Y(r.yc);
    out.push(`<g stroke="currentColor" stroke-width=".8" stroke-dasharray="5 3" opacity=".75"><line x1="${pad - 14}" y1="${cy}" x2="${(pad + W * k + 14).toFixed(1)}" y2="${cy}"/><line x1="${cx}" y1="${(14 + H * k + 10).toFixed(1)}" x2="${cx}" y2="4"/></g>`);
    out.push(`<g font-size="9" fill="currentColor"><text x="${(pad + W * k + 4).toFixed(1)}" y="${cy - 3}">x꜀</text><text x="${cx + 3}" y="10">y꜀</text></g>`);
    if (!r.round && Math.abs(r.thU) > 0.01 && Math.abs(Math.abs(r.thU) - 90) > 0.01) {
      const L = Math.max(W, H) * k * 0.55, a = r.thU * Math.PI / 180, dx = L * Math.cos(a), dy = L * Math.sin(a);
      out.push(`<g stroke="var(--bad)" stroke-width=".9" stroke-dasharray="2 2"><line x1="${(cx - dx).toFixed(1)}" y1="${(cy + dy).toFixed(1)}" x2="${(cx + dx).toFixed(1)}" y2="${(cy - dy).toFixed(1)}"/><line x1="${(cx + dy).toFixed(1)}" y1="${(cy + dx).toFixed(1)}" x2="${(cx - dy).toFixed(1)}" y2="${(cy - dx).toFixed(1)}"/></g>
        <g font-size="9" fill="var(--bad)"><text x="${(cx + dx + 2).toFixed(1)}" y="${(cy - dy).toFixed(1)}">u</text><text x="${(cx - dy + 2).toFixed(1)}" y="${(cy - dx).toFixed(1)}">v</text></g>`);
    }
    out.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="currentColor"/><text x="${cx + 5}" y="${cy + 11}" font-size="9" fill="currentColor">C (${secNum(r.xc, 5)}, ${secNum(r.yc, 5)})</text>`);
  }
  const u = esc(st.unit);
  out.push(`<g font-size="9" fill="currentColor"><text x="${pad}" y="${(14 + H * k + 24).toFixed(1)}">外包 ${secNum(W, 6)} × ${secNum(H, 6)} ${u}・x 向右、y 向上・等比例</text>
    ${r.ok && !r.round && Math.abs(r.thU) > 0.01 && Math.abs(Math.abs(r.thU) - 90) > 0.01 ? `<text x="${pad}" y="${(14 + H * k + 36).toFixed(1)}" fill="var(--bad)">虛線 u、v：主軸</text>` : ""}</g>`);
  return `<svg class="cfsvg" style="max-width:400px" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}" role="img" aria-label="斷面與形心軸">${out.join("")}</svg>`;
}

/* ---------- 結果表 ---------- */
function secRows(r, st) {
  const u = st.unit, n = v => secNum(v, +st.sig);
  return {
    basic: [["淨斷面積 A", n(r.A), `${u}²`], ["形心 x̄", n(r.xc), u], ["形心 ȳ", n(r.yc), u]],
    inertia: [["Ix（繞形心 x 軸）", n(r.Ix), `${u}⁴`], ["Iy（繞形心 y 軸）", n(r.Iy), `${u}⁴`], ["Ixy", n(r.Ixy), `${u}⁴`], ["極慣性矩 Jc = Ix + Iy", n(r.J), `${u}⁴`],
      ["最大主慣性矩 Iu", n(r.Iu), `${u}⁴`], ["最小主慣性矩 Iv", n(r.Iv), `${u}⁴`],
      ["主軸角 θu", r.round ? "任意" : secNum(r.thU, +st.sig), "°"], ["主軸角 θv", r.round ? "任意" : secNum(r.thV, +st.sig), "°"],
      ["迴轉半徑 rx = √(Ix/A)", n(r.rx), u], ["迴轉半徑 ry = √(Iy/A)", n(r.ry), u]],
    modulus: [["Sx+（上側）", n(r.SxT), `${u}³`], ["Sx−（下側）", n(r.SxB), `${u}³`], ["Sy+（右側）", n(r.SyR), `${u}³`], ["Sy−（左側）", n(r.SyL), `${u}³`],
      ["cy+ ／ cy−", `${n(r.cyT)} ／ ${n(r.cyB)}`, u], ["cx+ ／ cx−", `${n(r.cxR)} ／ ${n(r.cxL)}`, u]]
  };
}
const secTbl = rows => `<div class="tblwrap"><table class="ct secres"><tr><th>性質</th><th>數值</th><th>單位</th></tr>${rows.map(([a, b, c]) => `<tr><th>${a}</th><td>${b}</td><td>${c}</td></tr>`).join("")}</table></div>`;

/* ---------- 畫面 ---------- */
function tabSection(box) {
  const st = secLoad();
  const txt = (path, val, ph = "") => `<input data-p="${path}" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const sel = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const fld = (l, h) => `<div class="field"><label>${l}</label>${h}</div>`;
  const area = (path, val, rows) => `<textarea data-p="${path}" rows="${rows}" spellcheck="false" autocapitalize="off" inputmode="text" style="font-family:ui-monospace,Menlo,Consolas,monospace">${esc(val)}</textarea>`;
  const shape = () => SEC_SHAPES.find(x => x.k === st.shape) || SEC_SHAPES[0];
  const draw = () => {
    const sh = shape();
    box.innerHTML = `
      <div class="cfsteps"><a href="#sp1">1 基本資料</a><a href="#sp2">2 定義斷面</a><a href="#sp3">3 斷面性質</a></div>
      <section class="panel" id="sp1"><h2><span class="cfno">1</span>基本資料</h2>
        <div class="grid2">
          ${fld("位置／用途", txt("info.loc", st.info.loc, "例：模板第二層大格柵"))}
          ${fld("斷面名稱", txt("info.no", st.info.no, "例：鋼管 □50×50×2.3"))}
          ${fld("計算人員", txt("info.who", st.info.who))}
          ${fld("座標單位", sel("unit", [["mm", "mm"], ["cm", "cm"], ["m", "m"]], st.unit))}
          ${fld("顯示有效位數", sel("sig", [["6", "6 位"], ["8", "8 位"], ["10", "10 位"]], st.sig))}
        </div>
        <p class="cnote">單位只是標示座標用的單位，不會縮放輸入值；結果以同一單位表示（面積 ²、慣性矩 ⁴、斷面模數 ³）。</p></section>
      <section class="panel" id="sp2"><h2><span class="cfno">2</span>定義斷面</h2>
        <h3 class="cfh" style="margin-top:0">常用斷面（產生座標）</h3>
        <div class="grid2">
          ${fld("斷面型式", `<select id="spShape">${SEC_SHAPES.map(x => `<option value="${x.k}" ${x.k === sh.k ? "selected" : ""}>${x.n}</option>`).join("")}</select>`)}
          ${sh.f.map(([k, l]) => fld(`${l}（${esc(st.unit)}）`, `<input data-d="${k}" inputmode="decimal" value="${esc(st.dims[k] ?? "")}">`)).join("")}
        </div>
        <div class="row"><button type="button" class="sec" id="spGen">產生座標（取代下方輸入）</button></div>
        <p class="cnote" id="spGenMsg">理想化直角斷面、不含圓角；圓與圓管以內接正 ${SEC_CIRC_N} 邊形近似，數值略小於真實圓。也可以直接在下方輸入任意多邊形。</p>
        <h3 class="cfh">外輪廓（一組封閉邊界）</h3>
        ${area("outer", st.outer, 6)}
        <p class="cnote">每行一點「x, y」，也可用空白或 Tab 分隔、分號換行。依邊界順序輸入，順／逆時針皆可，最後一點自動閉合。</p>
        ${st.holes.map((h, i) => `<h3 class="cfh">孔洞 ${i + 1}<button type="button" class="sec" data-hdel="${i}" style="float:right;min-height:32px;padding:0 10px;font-size:13px">移除</button></h3>${area(`holes.${i}`, h, 4)}`).join("")}
        <div class="row">${st.holes.length < SEC_MAX_HOLES ? `<button type="button" class="sec" id="spHole">＋ 新增孔洞</button>` : ""}<button type="button" class="sec" id="spClear">清除輸入</button></div>
        <p class="cnote">孔洞要完全在外輪廓內、彼此不重疊，所有孔洞使用相同座標系。</p></section>
      <section class="panel" id="sp3"><h2><span class="cfno">3</span>斷面性質</h2><div id="spRes"></div>
        <div class="row"><a class="btnlink" href="#/struct/sec/sheet" id="spSheet">📄 產生計算書（A4）</a></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>以多邊形頂點計算（格林定理），不含圓角；型鋼、鋼管的實際斷面性質請以產品型錄或規範表列值為準。Jc 為極慣性矩，不是扭轉常數。結果僅供施工規劃參考。</p>`;
    bind(); calc();
  };
  const calc = () => {
    secSave(st);
    const r = secCalc(st), u = esc(st.unit);
    if (!r.ok) {
      $("#spRes").innerHTML = `${secSvg(r, st)}<div class="big" data-bar="待補：${esc(r.err[0] || "")}"><span>結果</span><b><span style="font-size:15px;color:var(--bad)">${r.err.map(esc).join("<br>")}</span></b></div>`;
      return;
    }
    const rows = secRows(r, st), n = v => secNum(v, +st.sig), cm = secToCm(r, st.unit, st.axis);
    $("#spRes").innerHTML = `${secSvg(r, st)}
      <div class="big" data-bar="A ${n(r.A)} ${u}²、Ix ${n(r.Ix)} ${u}⁴、Iy ${n(r.Iy)} ${u}⁴"><span>淨斷面積 A</span><b>${n(r.A)} <small>${u}²</small></b></div>
      <div class="big"><span>形心（x̄, ȳ）</span><b>${n(r.xc)}, ${n(r.yc)} <small>${u}</small></b></div>
      <p class="cnote">✓ ${r.outer.length} 個頂點・${r.holes.length} 個孔洞${r.holes.length ? "（已扣除）" : ""}</p>
      <h3 class="cfh">慣性矩與主軸</h3>${secTbl(rows.inertia)}
      <p class="cnote">θu 為 x 軸逆時針轉到最大主慣性矩軸 u 的角度，v 軸與 u 軸正交；主軸以 180° 為週期。${r.round ? "Ix = Iy 且 Ixy = 0，任何方向都是主軸。" : ""}</p>
      <h3 class="cfh">彈性斷面模數</h3>${secTbl(rows.modulus)}
      <p class="cnote">Sx± = Ix ／ cy±，Sy± = Iy ／ cx±；± 指形心上／下側與右／左側。非對稱斷面兩側不同，檢核時取對應受拉、受壓側。</p>
      <h3 class="cfh">帶入模板材料庫</h3>
      <div class="grid2">
        ${fld("彎曲方向", sel("axis", [["x", "繞 x 軸（載重沿 y 向）"], ["y", "繞 y 軸（載重沿 x 向）"]], st.axis))}
        ${fld("材料名稱", `<input id="spName" value="${esc(st.info.no || "")}" placeholder="例：鋼管 □50×50×2.3">`)}
      </div>
      <p class="cnote">換算成 cm：A ${cm.A} cm²、I ${cm.I} cm⁴、S ${cm.S} cm³（S 取兩側較小值）。</p>
      <div class="row"><button type="button" class="sec" id="spLib">存成格柵材「自訂」斷面</button></div>
      <p class="cnote" id="spLibMsg">存入後柱、牆、板、梁模板的格柵下拉都選得到；容許應力 fb、fv、彈性模數 E 與剪應力係數 k 請到「材料參數與斷面資料 → 自建材料」補填。剪力面積預設用全斷面積 A，中空或 H 型斷面請依腹板面積自行修改。</p>`;
    const sv = $("#spRes [data-p='axis']"); if (sv) sv.onchange = () => { st.axis = sv.value; calc(); };
    $("#spLib").onclick = () => {
      const c = secToCm(r, st.unit, st.axis), name = $("#spName").value.trim().slice(0, 60) || `自訂斷面 A${c.A}`;
      let a; try { a = JSON.parse(ls.get("calcColLib", "[]")); } catch { a = []; }
      if (!Array.isArray(a)) a = [];
      if (a.length >= 60) { $("#spLibMsg").textContent = "自建材料已達 60 筆，請先到模板分頁刪除不用的材料。"; return; }
      a.push({ ...colNewMat("beam"), n: name, sect: "custom", I: c.I, S: c.S, A: c.A, kv: "1.5" });
      ls.set("calcColLib", JSON.stringify(a));
      $("#spLibMsg").textContent = `已存入「${name}」（A ${c.A} cm²、I ${c.I} cm⁴、S ${c.S} cm³）。請到模板分頁的自建材料補填 fb、fv、E。`;
    };
  };
  const bind = () => {
    box.querySelectorAll("#sp1 [data-p], #sp2 [data-p]").forEach(el => el.oninput = el.onchange = ev => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      if (ev && ev.type === "change" && el.tagName !== "SELECT" && o[last] === el.value) return;
      o[last] = el.value;
      if (el.dataset.p === "unit") return draw();
      calc();
    });
    box.querySelectorAll("[data-d]").forEach(el => el.oninput = () => { st.dims[el.dataset.d] = el.value; secSave(st); });
    $("#spShape").onchange = e => { st.shape = e.target.value; draw(); };
    $("#spGen").onclick = () => {
      const sh = shape(), v = Object.fromEntries(sh.f.map(([k]) => [k, colF(st.dims[k])])), g = sh.g(v);
      if (!g) { $("#spGenMsg").innerHTML = `<span style="color:var(--bad)">尺寸不完整或不合理（例如厚度太大），請檢查 ${sh.f.map(f => f[1]).join("、")}。</span>`; return; }
      st.outer = secPtsText(g[0]); st.holes = g.slice(1).map(secPtsText);
      const auto = !st.info.no || SEC_SHAPES.some(x => st.info.no.startsWith(x.n.replace(/（.*）/, "") + " "));   // 自動產生的名稱跟著更新，自己改過的不動
      if (auto) st.info.no = `${sh.n.replace(/（.*）/, "")} ${sh.f.map(([k]) => st.dims[k]).join(" × ")} ${st.unit}`;
      draw();
    };
    const hb = $("#spHole"); if (hb) hb.onclick = () => { st.holes.push(""); draw(); box.querySelector(`[data-p="holes.${st.holes.length - 1}"]`)?.focus(); };
    box.querySelectorAll("[data-hdel]").forEach(b => b.onclick = () => { st.holes.splice(+b.dataset.hdel, 1); draw(); });
    $("#spClear").onclick = () => { if (!confirm("清除斷面性質的輸入？")) return; Object.assign(st, secBlank(), { outer: "", holes: [] }); draw(); };
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#spSheet").onclick = e => { e.preventDefault(); location.hash = "#/struct/sec/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderSecSheet() {
  const st = secLoad(), r = secCalc(st), company = siteCompany(siteId), u = esc(st.unit);
  const pts = p => p.map(([x, y]) => `(${+x.toFixed(6)}, ${+y.toFixed(6)})`).join("、");
  const rows = r.ok ? secRows(r, st) : null;
  const sec = (t, rs) => `<tr><th colspan="3">${t}</th></tr>${rs.map(([a, b, c]) => `<tr><td>${a}</td><td class="c">${b}</td><td class="c">${c}</td></tr>`).join("")}`;
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="spBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">斷面性質計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置／用途</td><td colspan="3">${esc(st.info.loc)}</td></tr>
        <tr><td>斷面名稱</td><td>${esc(st.info.no)}</td><td>座標單位</td><td>${u}</td></tr>
        <tr><td>外輪廓</td><td colspan="3" style="font-size:8.5pt">${r.outer.length} 點：${esc(pts(r.outer))}</td></tr>
        ${r.holes.map((h, i) => `<tr><td>孔洞 ${i + 1}</td><td colspan="3" style="font-size:8.5pt">${h.length} 點：${esc(pts(h))}</td></tr>`).join("")}
      </table>
      <figure class="cffig">${secSvg(r, st)}</figure>
      <table class="pt">
        ${r.ok ? `${sec("二、面積與形心", rows.basic)}${sec("三、慣性矩與主軸（對形心軸）", rows.inertia)}${sec("四、彈性斷面模數", rows.modulus)}` : `<tr><th>二、計算結果</th></tr><tr><td>待補：${r.err.map(esc).join("、")}</td></tr>`}
      </table>
      <table class="pt"><tr><td style="font-size:9pt">註：以多邊形頂點依格林定理計算，理想化直角斷面、不含圓角；圓形以內接正 ${SEC_CIRC_N} 邊形近似。θu 為 x 軸逆時針轉至最大主慣性矩軸的角度；Sx± = Ix／cy±、Sy± = Iy／cx±。Jc = Ix + Iy 為極慣性矩，非扭轉常數。型鋼與鋼管請以產品型錄或規範表列值為準，本計算書僅供施工規劃參考。計算日期：${esc(today())}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#spBack").onclick = () => goBack("#/struct/sec");
  $("#pvPrint").onclick = doPrint;
}

// 材料庫「自訂」格柵卡片的「帶入斷面性質」按鈕（柱、牆、板、梁模板共用 colLibCard，用委派事件處理，填入後觸發該頁自己的輸入事件存檔重算）
document.addEventListener("click", e => {
  const b = e.target.closest?.("[data-lsec]"); if (!b) return;
  const card = b.closest("[data-card]"), c = secLastCm();
  if (!card || !c) { b.textContent = "斷面性質分頁沒有有效結果，請先計算"; return; }
  for (const k of ["I", "S", "A"]) { const el = card.querySelector(`[data-lk="${k}"]`); if (el) { el.value = c[k]; el.dispatchEvent(new Event("input", { bubbles: true })); } }
  b.textContent = `已帶入 A ${c.A}、I ${c.I}、S ${c.S}（${c.axis === "y" ? "繞 y 軸" : "繞 x 軸"}）`;
});

STRUCT_TABS.push(["sec", "斷面性質", tabSection]);
