// 驗證用：在 Node 裡直接載入網站的結構計算檔（不經瀏覽器），執行計算函式，輸出 JSON。
// 用法：node tools/verify/extract.js < cases.json > out.json（由 verify.py 呼叫）
// 只讀網站原始檔，不修改；用 vm 建一個假的瀏覽器環境（localStorage、document 只做空殼）。
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");
const FILES = ["colform.js", "wallform.js", "slabform.js", "beamform.js", "scaffold.js", "bracket.js", "rowframe.js", "anchor.js", "secprop.js"];
const store = {};
const noop = () => {};
const ctx = vm.createContext({
  console, Math, JSON, Number, String, Array, Object, Map, Set, Float64Array, isFinite, parseFloat, parseInt, Infinity, NaN,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [] },
  window: {}, navigator: { userAgent: "node" }, location: { hash: "" }
});
// 網站共用的小工具（與 app.js、calc.js 同定義）
vm.runInContext(`
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ls = { get: (k, d) => localStorage.getItem(k) ?? d, set: (k, v) => localStorage.setItem(k, v) };
const fmt = (v, d = 2) => Number.isFinite(v) ? String(+v.toFixed(d)) : "—";
const STRUCT_TABS = [];
`, ctx);
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });

// 把 NaN / Infinity 轉成 null，函式略過
const clean = (v, depth = 0) => {
  if (depth > 8) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "function") return undefined;
  if (Array.isArray(v)) return v.map(x => clean(x, depth + 1));
  if (v && typeof v === "object") { const o = {}; for (const [k, x] of Object.entries(v)) { const c = clean(x, depth + 1); if (c !== undefined) o[k] = c; } return o; }
  return v;
};
const run = vm.runInContext(`(function (c) {
  const merge = (a, b) => { for (const [k, v] of Object.entries(b || {})) { if (v && typeof v === "object" && !Array.isArray(v) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) merge(a[k], v); else a[k] = v; } return a; };
  switch (c.tool) {
    case "col": { const r = colCalc(merge(colBlank(), c.st)); return { tiers: r.tiers.map(t => ({ P: t.P, mems: t.mems.map(m => ({ k: m.x.k, L: m.L, w: m.w, M: m.M, V: m.V, Av: m.Av, I: m.s && m.s.I, S: m.s && m.s.S, E: +m.m.E, checks: m.checks })), tie: t.tie })) }; }
    case "wall": { const r = wfCalc(merge(wfBlank(), c.st)); return { pb: r.pb, pipe: r.pipe, braces: r.braces, tiers: r.tiers.map(t => ({ P: t.P, mems: t.mems.map(m => ({ k: m.x.k, L: m.L, w: m.w, M: m.M, V: m.V, I: m.s && m.s.I, S: m.s && m.s.S, E: +m.m.E, checks: m.checks })), sup: t.sup, br: t.br })) }; }
    case "slab": { const r = sfCalc(merge(sfBlank(), c.st)); return { N: r.N, L: r.L, P: r.P, lam: r.lam, Fa: r.Fa, Cc: r.Cc, pipe: r.pipe, sup: r.sup, mems: r.mems.map(m => ({ k: m.x.k, L: m.L, w: m.w, M: m.M, V: m.V, I: m.s && m.s.I, S: m.s && m.s.S, A: m.s && m.s.A, E: +m.m.E, checks: m.checks })) }; }
    case "beam": { const r = bfCalc(merge(bfBlank(), c.st)); const mm = m => ({ n: m.x.n, L: m.L, w: m.w, M: m.M, V: m.V, I: m.s && m.s.I, S: m.s && m.s.S, E: +m.m.E, p: m.p, lo: m.lo, hi: m.hi, cant: m.cant, checks: m.checks });
      return { N: r.N, err: r.err, ply: mm(r.ply), first: r.first.map(mm), second: r.second.map(mm), ties: r.ties.map(t => t.chk), bply: r.bply.map(mm), bw: mm(r.bw), P: r.P, L: r.L, Fa: r.Fa, sup: r.sup }; }
    case "scaf": return scCalc(merge(scBlank(), c.st));
    case "row": return rfCalc(merge(rfBlank(), c.st));
    case "brk": { const st = merge(bkBlank(), c.st), r = bkCalc(st); const g = r.g;
      return { miss: r.miss, P: r.P, secs: r.secs, g: { segs: g.segs, supports: g.supports, loads: g.loads },
        sol: r.sol && { nodes: r.sol.nodes, reac: r.sol.reac, tipDy: r.sol.tipDy, els: r.sol.els.map(e => ({ grp: e.grp, truss: e.truss, i: e.i, j: e.j, L: e.L, pts: e.pts })) },
        groups: r.groups && r.groups.map(x => ({ k: x.k, w: x.w })), checks: r.checks }; }
    case "anc": return ancCalc(merge(ancBlank(), c.st));
    case "sec": { const st = merge(secBlank(), c.st); if (c.shape) { const s = SEC_SHAPES.find(x => x.k === c.shape); const g = s.g(c.dims); st.outer = secPtsText(g[0]); st.holes = g.slice(1).map(secPtsText); } return secCalc(st); }
    case "fa": return wfFa(c.lam, c.Fy, c.E);
    case "fcr": return scFcr(c.KLr, c.Fy, c.E);
  }
  return { error: "unknown tool" };
})`, ctx);
const cases = JSON.parse(fs.readFileSync(0, "utf8"));
const out = cases.map(c => { try { return clean(run(c)); } catch (e) { return { error: String(e && e.stack || e) }; } });
process.stdout.write(JSON.stringify(out));
