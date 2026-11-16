"use strict";
/* 混凝土錨栓（結構計算的「錨栓」分頁，另有 A4 計算書 #/struct/anc/sheet）
   參考網站 realizcalc.com「混凝土錨栓計算」（2026-11-15 讀取）：錨栓型式、f′c、設計條件、矩形配置、混凝土邊距、
   hef／ha、鋼材 da／Fy／Fu／螺距、產品分類與拔出強度、載重 P（壓正）／Vx／Vy／Mx／My／Mz；三角架支承反力
   代入規則 P = Rx、Vy = −Ry、Mx = −Mz（bracket-anchor-transfer.js）。參考網站的檢核在伺服器端看不到，
   這裡依 ACI 318-19 第 17 章的架構自行實作，SI 公式係數換算成 kgf、cm（換算式寫在 ANC_K），非規範原文。
   ‧受力分配：剛性鋼承板、只計錨栓（不計混凝土承壓），Ni = −P/n − Mx·(yi−ȳ)/Σ(y−ȳ)² − My·(xi−x̄)/Σ(x−x̄)²，
     負值（受壓）取 0；剪力均分＋扭矩 Mz 依距群心距離分配。不計承壓區的力臂，通常偏保守。
   ‧拉：鋼材 φNsa、混凝土拉破 φNcbg（含 ψec、ψed、ψc、ψcp 與三邊以上近邊時的 hef 修正）、拔出 φNpn、側面爆裂 φNsb（預埋擴頭，逐支、含角落折減）。
   ‧剪：鋼材 φVsa、混凝土剪破 φVcbg（X、Y 兩方向分別朝受剪側邊緣，全部剪力由最靠邊一排承擔）、撬破 φVcpg。
   ‧互制：ζN ≤ 0.2 或 ζV ≤ 0.2 時另一項 ≤ 1，否則 ζN + ζV ≤ 1.2。
   ‧未做：黏結式錨栓的握裹、地震設計的額外折減、剪力偏心 ψec,V、鋼承板與柱斷面檢核。 */

const ANC_SI = (k, pw) => k * Math.sqrt(0.0980665) * 10 ** pw / 9.80665;   // SI（N、mm、MPa）係數換算成 kgf、cm、kgf/cm²
const ANC_K = { kc_cast: ANC_SI(10, 1.5), kc_post: ANC_SI(7, 1.5), kc_long: ANC_SI(3.9, 5 / 3), v1: ANC_SI(0.6, 2), v2: ANC_SI(3.7, 1.5), sb: ANC_SI(13, 2) };
const ANC_TYPES = [["torque", "後置式・扭力控制膨脹"], ["disp", "後置式・位移控制膨脹"], ["under", "後置式・擴底"], ["cast", "預埋式・擴頭螺栓"]];
const ANC_CAC = { torque: 4, disp: 4, under: 2.5 };   // cac／hef（後置式未開裂、無補強筋時）
const ANC_BOLTS = [["M10", "1", "1.5"], ["M12", "1.2", "1.75"], ["M16", "1.6", "2"], ["M20", "2", "2.5"], ["M22", "2.2", "2.5"], ["M24", "2.4", "3"]];
const ancBlank = () => ({
  info: { proj: "", loc: "", who: "" }, type: "torque", fc: "280", light: "0", uncr: "0", supp: "0", duct: "1", grout: "0", cat: "2",
  sx: "12", sy: "10", nx: "2", ny: "4", cL: "20", cR: "20", cB: "20", cT: "20", hef: "10", ha: "25",
  da: "1.2", fy: "2400", fu: "4000", pitch: "1.75", Np: "", Abrg: "2",
  P: "", Vx: "", Vy: "", Mx: "", My: "", Mz: "", src: ""
});
function ancLoad() {
  const d = ancBlank();
  let s; try { s = JSON.parse(ls.get("calcAncForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && k in src) dst[k] = colStr(src[k]); };
  pick(d.info, s.info); pick(d, s);
  if (!ANC_TYPES.some(([k]) => k === d.type)) d.type = "torque";
  if (!["1", "2", "3"].includes(d.cat)) d.cat = "2";
  return d;
}
const ancSave = st => { ls.set("calcAncForm", JSON.stringify(st)); svKept(); };

function ancCalc(st) {
  const F = colF, nx = Math.round(F(st.nx)), ny = Math.round(F(st.ny)), sx = F(st.sx), sy = F(st.sy);
  const cL = F(st.cL), cR = F(st.cR), cB = F(st.cB), cT = F(st.cT), hef0 = F(st.hef), ha = F(st.ha), fc = F(st.fc);
  const da = F(st.da), fy = F(st.fy), fu = F(st.fu), pitch = F(st.pitch) / 10, cast = st.type === "cast";
  const miss = [];
  if (!(nx >= 1 && ny >= 1 && nx * ny <= 64) || (nx > 1 && !(sx > 0)) || (ny > 1 && !(sy > 0))) miss.push("錨栓支數與間距");
  if (![cL, cR, cB, cT].every(c => c > 0)) miss.push("混凝土邊距");
  if (!(hef0 > 0 && ha > hef0)) miss.push("有效埋深 hef 與構材厚度 ha（ha 須大於 hef）");
  if (!(fc > 0)) miss.push("f′c");
  if (!(da > 0 && fy > 0 && fu > 0 && pitch > 0 && da > 0.9743 * pitch)) miss.push("錨栓直徑、Fy、Fu、螺距");
  const loads = ["P", "Vx", "Vy", "Mx", "My", "Mz"].map(k => st[k] === "" ? 0 : F(st[k]));
  if (!loads.every(Number.isFinite) || ["P", "Vx", "Vy", "Mx", "My", "Mz"].every(k => st[k] === "")) miss.push("載重（至少填一項）");
  const base = { miss, nx, ny, sx, sy, cast, checks: [], anchors: [] };
  if (miss.length) return base;
  const [P, Vx, Vy, Mx, My, Mz] = loads;
  // 座標：以左下錨栓為原點
  const anchors = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) anchors.push({ id: "A" + (anchors.length + 1), x: i * (nx > 1 ? sx : 0), y: j * (ny > 1 ? sy : 0) });
  const n = anchors.length, Wx = (nx - 1) * (nx > 1 ? sx : 0), Wy = (ny - 1) * (ny > 1 ? sy : 0), xc = Wx / 2, yc = Wy / 2;
  const Ixx = anchors.reduce((s, a) => s + (a.y - yc) ** 2, 0), Iyy = anchors.reduce((s, a) => s + (a.x - xc) ** 2, 0), J = Ixx + Iyy;
  for (const a of anchors) {
    const N = -P / n - (Ixx > 0 ? Mx * (a.y - yc) / Ixx : 0) - (Iyy > 0 ? My * (a.x - xc) / Iyy : 0);
    a.N = Math.max(0, N); a.Nraw = N;
    a.vx = Vx / n - (J > 0 ? Mz * (a.y - yc) / J : 0); a.vy = Vy / n + (J > 0 ? Mz * (a.x - xc) / J : 0); a.V = Math.hypot(a.vx, a.vy);
  }
  const momentNoArm = (Ixx === 0 && Mx) || (Iyy === 0 && My);
  if (momentNoArm) miss.push("單排配置無法承受該方向彎矩（只計錨栓力臂）");
  if (miss.length) return { ...base, anchors };
  // 材料與係數
  const lam = st.light === "1" ? 0.75 : 1, lamA = st.light === "1" && !(cast || st.type === "under") ? 0.8 * lam : lam;   // 輕質混凝土時膨脹式取 0.8λ
  const uncr = st.uncr === "1", supp = st.supp === "1", duct = st.duct === "1";
  const phiS = duct ? { t: 0.75, v: 0.65 } : { t: 0.65, v: 0.6 };
  const phiCt = cast ? (supp ? 0.75 : 0.7) : ({ 1: [0.75, 0.65], 2: [0.65, 0.55], 3: [0.55, 0.45] }[st.cat])[supp ? 0 : 1];
  const phiCv = supp ? 0.75 : 0.7, phiP = phiCt;
  const Ase = Math.PI / 4 * (da - 0.9743 * pitch) ** 2, futa = Math.min(fu, 1.9 * fy, 8750);
  const sf = Math.sqrt(fc), ck = [];
  // 1. 鋼材拉力
  const Nmax = Math.max(...anchors.map(a => a.N)), Nsum = anchors.reduce((s, a) => s + a.N, 0);
  const Nsa = Ase * futa;
  if (Nmax > 0) ck.push({ g: "N", k: "steelN", t: "鋼材拉力（單支）", v: Nmax, a: phiS.t * Nsa, f: `φNsa = ${phiS.t} × Ase × futa = ${phiS.t} × ${fmt(Ase, 4)} × ${fmt(futa, 0)}` });
  // 2. 混凝土拉破（受拉錨栓群）
  const ten = anchors.filter(a => a.N > 1e-9);
  let cb = null;
  const breakout = (grp, withEcc) => {
    const x0 = Math.min(...grp.map(a => a.x)), x1 = Math.max(...grp.map(a => a.x)), y0 = Math.min(...grp.map(a => a.y)), y1 = Math.max(...grp.map(a => a.y));
    const dL = cL + x0, dR = cR + (Wx - x1), dB = cB + y0, dT = cT + (Wy - y1);
    let hef = hef0; const near = [dL, dR, dB, dT].filter(d => d < 1.5 * hef0);
    let hefNote = "";
    if (near.length >= 3) { const h2 = Math.max(Math.max(...[dL, dR, dB, dT].filter(d => d < 1.5 * hef0)) / 1.5, Math.max(nx > 1 ? sx : 0, ny > 1 ? sy : 0) / 3); if (h2 < hef) { hef = h2; hefNote = `三邊以上近邊，hef 取 ${fmt(hef, 2)} cm`; } }
    const ANc = (Math.min(dL, 1.5 * hef) + (x1 - x0) + Math.min(dR, 1.5 * hef)) * (Math.min(dB, 1.5 * hef) + (y1 - y0) + Math.min(dT, 1.5 * hef));
    const ANco = 9 * hef * hef, camin = Math.min(dL, dR, dB, dT);
    const kc = cast ? (hef >= 28 && hef <= 63.5 ? null : ANC_K.kc_cast) : ANC_K.kc_post;
    const Nb = kc === null ? ANC_K.kc_long * lamA * sf * hef ** (5 / 3) : kc * lamA * sf * hef ** 1.5;
    let ecc = 1, ex = 0, ey = 0;
    if (withEcc) {
      const S = grp.reduce((s, a) => s + a.N, 0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      ex = Math.abs(grp.reduce((s, a) => s + a.N * a.x, 0) / S - cx); ey = Math.abs(grp.reduce((s, a) => s + a.N * a.y, 0) / S - cy);
      ecc = Math.min(1, 1 / (1 + ex / (1.5 * hef))) * Math.min(1, 1 / (1 + ey / (1.5 * hef)));
    }
    const ed = camin >= 1.5 * hef ? 1 : 0.7 + 0.3 * camin / (1.5 * hef);
    const psc = uncr ? (cast ? 1.25 : 1.4) : 1;
    let cp = 1;
    if (!cast && uncr && !supp) { const cac = ANC_CAC[st.type] * hef0; cp = camin >= cac ? 1 : Math.min(1, Math.max(camin / cac, 1.5 * hef / cac)); }
    const Ncbg = Math.min(ANc, grp.length * ANco) / ANco * ecc * ed * psc * cp * Nb;
    return { hef, hefNote, ANc: Math.min(ANc, grp.length * ANco), ANco, Nb, ecc, ex, ey, ed, psc, cp, camin, Ncbg, kc: kc === null ? ANC_K.kc_long : kc };
  };
  if (ten.length) {
    cb = breakout(ten, true);
    ck.push({ g: "N", k: "cbN", t: "混凝土拉破（受拉群組）", v: Nsum, a: phiCt * cb.Ncbg, f: `φNcbg = ${phiCt} × ANc/ANco × ψec ${fmt(cb.ecc, 3)} × ψed ${fmt(cb.ed, 3)} × ψc ${fmt(cb.psc, 2)} × ψcp ${fmt(cb.cp, 3)} × Nb；ANc ${fmt(cb.ANc, 0)}、ANco ${fmt(cb.ANco, 0)} cm²；Nb = ${fmt(cb.kc, 2)} × λa ${fmt(lamA, 2)} × √f′c × hef^${cast && cb.kc === ANC_K.kc_long ? "5/3" : "1.5"} = ${fmt(cb.Nb, 1)} kgf${cb.hefNote ? "；" + cb.hefNote : ""}` });
    // 3. 拔出
    const Np = cast ? 8 * F(st.Abrg) * fc : F(st.Np);
    if (Np > 0) { const psp = cast && uncr ? 1.4 : 1; ck.push({ g: "N", k: "po", t: "拔出（單支）", v: Nmax, a: phiP * psp * Np, f: cast ? `φNpn = ${phiP} × ψc,P ${psp} × 8Abrg·f′c = ${phiP} × ${psp} × 8 × ${esc(st.Abrg)} × ${fmt(fc, 0)}` : `φNpn = ${phiP} × 產品報告 Np ${fmt(Np, 0)} kgf` }); }
    else ck.push({ g: "N", k: "po", t: "拔出（單支）", v: Nmax, a: NaN, f: "後置式請填產品報告的拔出強度 Np（依開裂狀態），未填不檢核" });
    // 4. 側面爆裂（預埋擴頭、hef > 2.5ca1）：逐支受拉錨栓計算，ca1 取最近邊距、ca2 取垂直方向的較小邊距，
    //    ca2 < 3ca1 時乘角落折減 (1 + ca2/ca1)/4（ACI 318-19 17.6.4.1.1；2026-11-15 第三方驗證後補上）。群組放大未計（偏保守）。
    if (cast) {
      const Abrg = F(st.Abrg); let sb = null;
      for (const a of ten) {
        const dx = [cL + a.x, cR + (Wx - a.x)], dy = [cB + a.y, cT + (Wy - a.y)], mx = Math.min(...dx), my = Math.min(...dy);
        const ca1 = Math.min(mx, my), ca2 = mx <= my ? my : mx;
        if (!(ca1 < 0.4 * hef0)) continue;
        const fac = ca2 < 3 * ca1 ? (1 + Math.min(3, Math.max(1, ca2 / ca1))) / 4 : 1, Nsb = ANC_K.sb * ca1 * Math.sqrt(Abrg) * lam * sf * fac;
        if (!sb || a.N / Nsb > sb.a.N / sb.Nsb) sb = { a, ca1, ca2, fac, Nsb };
      }
      if (sb) ck.push({ g: "N", k: "sb", t: `側面爆裂（${sb.a.id}）`, v: sb.a.N, a: phiCt * sb.Nsb, f: `φNsb = ${phiCt} × ${fmt(ANC_K.sb, 2)} × ca1 ${fmt(sb.ca1, 1)} × √Abrg × λ × √f′c${sb.fac < 1 ? ` × 角落折減 (1 + ca2 ${fmt(sb.ca2, 1)} ／ ca1)／4 = ${fmt(sb.fac, 3)}` : ""}（逐支檢核，取最不利的 ${sb.a.id}；未計群組放大，保守）` });
    }
  }
  // 5. 鋼材剪力
  const Vmax = Math.max(...anchors.map(a => a.V)), Vtot = Math.hypot(Vx, Vy);
  const Vsa = 0.6 * Ase * futa * (st.grout === "1" ? 0.8 : 1);
  if (Vtot > 0 || Mz) ck.push({ g: "V", k: "steelV", t: "鋼材剪力（單支）", v: Vmax, a: phiS.v * Vsa, f: `φVsa = ${phiS.v} × 0.6 × Ase × futa${st.grout === "1" ? " × 0.8（注漿墊層）" : ""}` });
  // 6. 混凝土剪破（各方向朝受剪側邊緣，最靠邊一排承擔全部剪力）
  const le = Math.min(hef0, 8 * da), vb = ca1 => Math.min(ANC_K.v1 * (le / da) ** 0.2 * Math.sqrt(da) * lam * sf * ca1 ** 1.5, ANC_K.v2 * lam * sf * ca1 ** 1.5);
  const shearDir = (V, ca1, ca2a, ca2b, width, label) => {
    if (!V) return;
    const h = Math.min(1.5 * ca1, ha), w = Math.min(ca2a, 1.5 * ca1) + width + Math.min(ca2b, 1.5 * ca1);
    const AVc = h * w, AVco = 4.5 * ca1 * ca1, ca2 = Math.min(ca2a, ca2b);
    const ed = ca2 >= 1.5 * ca1 ? 1 : 0.7 + 0.3 * ca2 / (1.5 * ca1), psc = uncr ? 1.4 : supp ? 1.2 : 1, hv = Math.max(1, Math.sqrt(1.5 * ca1 / ha));
    const Vb = vb(ca1), Vcbg = AVc / AVco * ed * psc * hv * Vb;
    ck.push({ g: "V", k: "cbV" + label, t: `混凝土剪破（${label}）`, v: Math.abs(V), a: phiCv * Vcbg, f: `ca1 ${fmt(ca1, 1)} cm；φVcbg = ${phiCv} × AVc/AVco（${fmt(AVc, 0)}／${fmt(AVco, 0)}）× ψed ${fmt(ed, 3)} × ψc ${fmt(psc, 2)} × ψh ${fmt(hv, 3)} × Vb ${fmt(Vb, 1)} kgf` });
  };
  shearDir(Vx, Vx > 0 ? cR : cL, cB, cT, Wy, Vx > 0 ? "+X 向右側邊緣" : "−X 向左側邊緣");
  shearDir(Vy, Vy > 0 ? cT : cB, cL, cR, Wx, Vy > 0 ? "+Y 向上側邊緣" : "−Y 向下側邊緣");
  // 7. 撬破
  if (Vtot > 0) {
    const all = breakout(anchors, false), kcp = hef0 < 6.5 ? 1 : 2;
    ck.push({ g: "V", k: "cp", t: "混凝土撬破（群組）", v: Vtot, a: phiCv * kcp * all.Ncbg, f: `φVcpg = ${phiCv} × kcp ${kcp} × Ncpg ${fmt(all.Ncbg, 1)} kgf（全部錨栓、不計偏心）` });
  }
  const ratio = c => c.a > 0 ? c.v / c.a : NaN;
  const zN = Math.max(0, ...ck.filter(c => c.g === "N").map(ratio).filter(Number.isFinite));
  const zV = Math.max(0, ...ck.filter(c => c.g === "V").map(ratio).filter(Number.isFinite));
  const inter = zN <= 0.2 ? zV : zV <= 0.2 ? zN : (zN + zV) / 1.2;
  const checks = ck.map(c => ({ ...c, u: "kgf", d: 1 }));
  checks.push({ g: "I", k: "int", t: "拉剪互制", v: inter, a: 1, u: "比值", d: 3, f: zN <= 0.2 ? `ζN ${fmt(zN, 3)} ≤ 0.2，只看剪力 ζV ${fmt(zV, 3)}` : zV <= 0.2 ? `ζV ${fmt(zV, 3)} ≤ 0.2，只看拉力 ζN ${fmt(zN, 3)}` : `(ζN ${fmt(zN, 3)} + ζV ${fmt(zV, 3)}) ÷ 1.2` });
  return { ...base, anchors, Wx, Wy, P, Vx, Vy, Mx, My, Mz, Ase, futa, lam, lamA, phiS, phiCt, phiCv, cb, zN, zV, checks,
    ng: checks.filter(c => colJudge(c)[1] === "bad").length, nmiss: checks.filter(c => colJudge(c)[1] === "").length };
}

/* ---------- 平面圖 ---------- */
function ancSvg(st, r) {
  if (!r.anchors.length) return `<p class="cnote">填好支數、間距與邊距後，這裡會畫出平面配置。</p>`;
  const F = colF, cL = F(st.cL), cR = F(st.cR), cB = F(st.cB), cT = F(st.cT), hef = F(st.hef);
  const Wc = cL + r.Wx + cR, Hc = cB + r.Wy + cT, k = Math.min(260 / Wc, 240 / Hc), x0 = 40, y0 = 14;
  const X = x => (x0 + (cL + x) * k).toFixed(1), Y = y => (y0 + (Hc - cB - y) * k).toFixed(1), out = [];
  out.push(`<rect x="${x0}" y="${y0}" width="${(Wc * k).toFixed(1)}" height="${(Hc * k).toFixed(1)}" fill="currentColor" fill-opacity=".08" stroke="currentColor"/>`);
  const ten = r.anchors.filter(a => a.N > 1e-9);
  if (ten.length && hef > 0) {
    const e = 1.5 * hef, xa = Math.max(-cL, Math.min(...ten.map(a => a.x)) - e), xb = Math.min(r.Wx + cR, Math.max(...ten.map(a => a.x)) + e);
    const ya = Math.max(-cB, Math.min(...ten.map(a => a.y)) - e), yb = Math.min(r.Wy + cT, Math.max(...ten.map(a => a.y)) + e);
    out.push(`<rect x="${X(xa)}" y="${Y(yb)}" width="${((xb - xa) * k).toFixed(1)}" height="${((yb - ya) * k).toFixed(1)}" fill="none" stroke="currentColor" stroke-dasharray="4 3"/>`);
  }
  for (const a of r.anchors) out.push(`<circle cx="${X(a.x)}" cy="${Y(a.y)}" r="4" fill="${a.N > 1e-9 ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.4"/>${r.anchors.length <= 16 ? `<text x="${(+X(a.x) + 6).toFixed(1)}" y="${(+Y(a.y) - 5).toFixed(1)}" font-size="8" fill="currentColor">${a.id}</text>` : ""}`);
  const g = `<g font-size="9" fill="currentColor"><text x="${x0}" y="${(y0 + Hc * k + 13).toFixed(1)}">混凝土 ${fmt(Wc, 1)} × ${fmt(Hc, 1)} cm（X 向右、Y 向上）</text>
    <text x="${x0}" y="${(y0 + Hc * k + 25).toFixed(1)}">● 受拉錨栓　○ 不受拉　虛線：受拉群組 1.5hef 投影</text></g>`;
  return `<svg class="cfsvg" style="max-width:380px" viewBox="0 0 ${(x0 + Wc * k + 30).toFixed(0)} ${(y0 + Hc * k + 32).toFixed(0)}" role="img" aria-label="錨栓平面配置">${out.join("")}${g}</svg>`;
}

/* ---------- 畫面 ---------- */
function tabAnchor(box) {
  const st = ancLoad();
  const inp = (path, val, ph = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const txt = (path, val, ph = "") => `<input data-p="${path}" value="${esc(val)}" placeholder="${esc(ph)}">`;
  const sel = (path, opts, cur) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const yn = (path, label, cur) => `<label class="wfchk"><input type="checkbox" data-c="${path}" ${cur === "1" ? "checked" : ""}>${label}</label>`;
  const fld = (l, h) => `<div class="field"><label>${l}</label>${h}</div>`;
  const bolt = () => ANC_BOLTS.find(([, d, p]) => d === st.da && p === st.pitch)?.[0] || "";
  const draw = () => {
    const cast = st.type === "cast";
    box.innerHTML = `
      <div class="cfsteps"><a href="#an1">1 基本資料</a><a href="#an2">2 配置</a><a href="#an3">3 材料</a><a href="#an4">4 載重</a><a href="#an5">5 檢核</a></div>
      <section class="panel" id="an1"><h2><span class="cfno">1</span>基本資料</h2>
        <div class="grid2">
          ${fld("位置", txt("info.loc", st.info.loc, "例：托架錨栓 3F 北向"))}
          ${fld("錨栓型式", sel("type", ANC_TYPES, st.type))}
          ${fld("混凝土強度 f′c（kgf/cm²）", inp("fc", st.fc))}
          ${fld("計算人員", txt("info.who", st.info.who))}
          ${cast ? "" : fld("產品分類（可靠度）", sel("cat", [["1", "分類1（R ≥ 0.80）"], ["2", "分類2（0.70 ≤ R < 0.80）"], ["3", "分類3（0.60 ≤ R < 0.70）"]], st.cat))}
        </div>
        ${yn("light", "採用輕質混凝土（λ = 0.75）", st.light)}${yn("uncr", "使用載重下混凝土未開裂", st.uncr)}${yn("supp", "設有防劈裂輔助鋼筋（補強筋）", st.supp)}${yn("duct", "鋼材符合韌性條件", st.duct)}${yn("grout", "剪力採注漿墊層（Vsa × 0.8）", st.grout)}
        <p class="cnote">開裂狀態不確定時請維持「開裂」（較保守）。後置式產品分類依產品評估報告；無可靠資料時建議取分類3。</p></section>
      <section class="panel" id="an2"><h2><span class="cfno">2</span>錨栓配置（cm）</h2>
        <div class="grid2">
          ${fld("X 向支數 nx", inp("nx", st.nx))}${fld("Y 向支數 ny", inp("ny", st.ny))}
          ${fld("X 向間距 sx", inp("sx", st.sx))}${fld("Y 向間距 sy", inp("sy", st.sy))}
          ${fld("左側邊距 cL（至最左錨栓）", inp("cL", st.cL))}${fld("右側邊距 cR", inp("cR", st.cR))}
          ${fld("下側邊距 cB", inp("cB", st.cB))}${fld("上側邊距 cT", inp("cT", st.cT))}
          ${fld("有效埋深 hef", inp("hef", st.hef))}${fld("構材厚度 ha", inp("ha", st.ha))}
        </div>
        <p class="cnote">邊距量到錨栓中心；沒有邊緣的方向請填一個很大的值（例如 999）。三角架靠牆時：Y 向為垂直、X 向為水平。</p>
        <div id="anFig"></div></section>
      <section class="panel" id="an3"><h2><span class="cfno">3</span>錨栓材料</h2>
        <div class="grid2">
          ${fld("規格", `<select id="anBolt">${ANC_BOLTS.map(([n]) => `<option value="${n}" ${n === bolt() ? "selected" : ""}>${n}</option>`).join("")}<option value="" ${bolt() ? "" : "selected"}>自訂</option></select>`)}
          ${fld("桿身直徑 da（cm）", inp("da", st.da))}${fld("螺距 P（mm）", inp("pitch", st.pitch))}
          ${fld("降伏強度 Fy（kgf/cm²）", inp("fy", st.fy))}${fld("抗拉強度 Fu（kgf/cm²）", inp("fu", st.fu))}
          ${cast ? fld("擴頭承壓面積 Abrg（cm²）", inp("Abrg", st.Abrg)) : fld("產品拔出強度 Np（kgf，可空白）", inp("Np", st.Np, "依產品報告、開裂狀態"))}
        </div>
        <p class="cnote">Ase = π/4 ×（da − 0.9743P）²；futa = min(Fu, 1.9Fy, 8750)。M10～M24 為公制粗牙螺距。</p></section>
      <section class="panel" id="an4"><h2><span class="cfno">4</span>載重需求（已乘係數）</h2>
        ${st.src ? `<p class="cnote" style="margin-top:0">${esc(st.src)}</p>` : ""}
        <div class="grid2">
          ${fld("軸力 P（壓正拉負，kgf）", inp("P", st.P))}${fld("剪力 Vx（kgf）", inp("Vx", st.Vx))}
          ${fld("剪力 Vy（kgf）", inp("Vy", st.Vy))}${fld("彎矩 Mx（kgf·cm）", inp("Mx", st.Mx))}
          ${fld("彎矩 My（kgf·cm）", inp("My", st.My))}${fld("扭矩 Mz（kgf·cm）", inp("Mz", st.Mz))}
        </div>
        <p class="cnote">正 Mx 使 +Y 側受壓、正 My 使 +X 側受壓，以錨栓群中心為準。三角架分頁可一鍵帶入支承反力。</p></section>
      <section class="panel" id="an5"><h2><span class="cfno">5</span>檢核結果</h2><div id="anRes"></div>
        <div class="row"><a class="btnlink" href="#/struct/anc/sheet" id="anSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="anClear">清除輸入</button></div></section>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>公式依 ACI 318-19 第 17 章架構，由 SI 單位換算為 kgf、cm（非規範原文）；受力分配只計錨栓、不計混凝土承壓。黏結式錨栓、地震設計額外要求、產品最小間距與邊距、鋼承板與構材本身未檢核。後置式錨栓應依產品評估報告，結果僅供施工規劃參考，請依規範、契約與專業技師的計算為準。</p>`;
    bind(); calc();
  };
  const calc = () => {
    ancSave(st);
    const r = ancCalc(st);
    $("#anFig").innerHTML = ancSvg(st, r);
    const cell = c => { const [j, cls] = colJudge(c); return Number.isFinite(c.v) && c.a > 0 ? `<td class="${cls}">${fmt(c.v / c.a, 2)}<small>${j}</small></td>` : `<td>—<small>${j}</small></td>`; };
    $("#anRes").innerHTML = r.miss.length ? `<div class="big"><span>總結</span><b><span style="font-size:15px;color:var(--mut)">待補：${r.miss.map(esc).join("、")}</span></b></div>`
      : `<div class="big"><span>總結</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過設計強度</em>` : `<em class="cfj ok">已檢核項目都在設計強度以內</em>`}${r.nmiss ? `<small style="display:block;font-size:12px;font-weight:500;color:var(--mut)">${r.nmiss} 項未填資料不檢核</small>` : ""}</b></div>
      <div class="tblwrap"><table class="ct cfres" id="anChk"><tr><th>項目</th><th>需求</th><th>設計強度</th><th>比值</th></tr>
        ${r.checks.map(c => `<tr><th>${c.t}</th><td>${fmt(c.v, c.d)}<small>${c.u}</small></td><td>${c.a > 0 ? fmt(c.a, c.d) : "—"}</td>${cell(c)}</tr>`).join("")}</table></div>
      <h3 class="cfh">各支錨栓受力（kgf）</h3>
      <div class="tblwrap"><table class="ct cfres" id="anEach"><tr><th>編號</th><th>X, Y（cm）</th><th>拉力</th><th>剪力</th></tr>
        ${r.anchors.map(a => `<tr><th>${a.id}</th><td>${fmt(a.x, 1)}, ${fmt(a.y, 1)}</td><td>${fmt(a.N, 1)}</td><td>${fmt(a.V, 1)}</td></tr>`).join("")}</table></div>
      <details class="cfdet"><summary>計算明細</summary>
        <p class="cfdh">Ase = π/4 × (${fmt(colF(st.da), 2)} − 0.9743 × ${fmt(colF(st.pitch) / 10, 3)})² = ${fmt(r.Ase, 4)} cm²；futa = ${fmt(r.futa, 0)} kgf/cm²；λa = ${fmt(r.lamA, 2)}；φ 鋼材 ${r.phiS.t}／${r.phiS.v}、混凝土拉 ${r.phiCt}、剪 ${r.phiCv}</p>
        ${r.checks.map(c => `<p class="cfdh">${c.t}：${c.f}</p>`).join("")}
        <p class="cfdh">係數換算（SI → kgf、cm）：kc ${fmt(ANC_K.kc_cast, 2)}（預埋）／${fmt(ANC_K.kc_post, 2)}（後置）、剪破 ${fmt(ANC_K.v1, 3)}／${fmt(ANC_K.v2, 3)}、側面爆裂 ${fmt(ANC_K.sb, 2)}</p></details>`;
  };
  const setv = (p, v) => { st[p] = v; const el = box.querySelector(`[data-p="${p}"]`); if (el) el.value = v; };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => el.oninput = el.onchange = ev => {
      const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
      if (ev && ev.type === "change" && el.tagName === "INPUT" && o[last] === el.value) return;   // 輸入後失焦不重算，避免按鈕被重畫而按不到
      o[last] = el.value;
      if (el.dataset.p === "type") return draw();
      if (["da", "pitch"].includes(el.dataset.p)) $("#anBolt").value = bolt();
      if (["P", "Vx", "Vy", "Mx", "My", "Mz"].includes(el.dataset.p) && st.src) st.src = "";
      calc();
    });
    box.querySelectorAll("[data-c]").forEach(el => el.onchange = () => { st[el.dataset.c] = el.checked ? "1" : "0"; calc(); });
    $("#anBolt").onchange = e => { const b = ANC_BOLTS.find(([n]) => n === e.target.value); if (b) { setv("da", b[1]); setv("pitch", b[2]); } calc(); };
    box.querySelectorAll(".cfsteps a").forEach(a => a.onclick = e => { e.preventDefault(); box.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#anClear").onclick = () => { if (!confirm("清除錨栓的輸入？")) return; Object.assign(st, ancBlank()); draw(); };
    $("#anSheet").onclick = e => { e.preventDefault(); location.hash = "#/struct/anc/sheet"; };
  };
  draw();
}

/* ---------- 計算書（A4） ---------- */
function renderAncSheet() {
  const st = ancLoad(), r = ancCalc(st), company = ls.get("company", "");
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const conds = [["light", "輕質混凝土"], ["uncr", "未開裂"], ["supp", "設補強筋"], ["duct", "鋼材韌性"], ["grout", "注漿墊層"]].filter(([k]) => st[k] === "1").map(([, l]) => l);
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="anBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">混凝土錨栓計算書</div>
      <table class="pt">
        <tr><th colspan="4">一、基本資料</th></tr>
        <tr><td>工程名稱</td><td colspan="3">${esc(calcProjName(st))}</td></tr>
        <tr><td>位置</td><td colspan="3">${esc(st.info.loc)}</td></tr>
        <tr><td>錨栓型式</td><td>${esc(ANC_TYPES.find(([k]) => k === st.type)[1])}</td><td>f′c</td><td>${esc(st.fc)} kgf/cm²</td></tr>
        <tr><td>設計條件</td><td colspan="3">${conds.length ? conds.join("、") : "開裂、無補強筋"}${st.type !== "cast" ? `；產品分類 ${esc(st.cat)}` : ""}</td></tr>
        <tr><td>配置</td><td colspan="3">${esc(st.nx)} × ${esc(st.ny)} 支，sx ${esc(st.sx)}、sy ${esc(st.sy)} cm；邊距 左 ${esc(st.cL)}、右 ${esc(st.cR)}、下 ${esc(st.cB)}、上 ${esc(st.cT)} cm；hef ${esc(st.hef)}、ha ${esc(st.ha)} cm</td></tr>
        <tr><td>錨栓</td><td colspan="3">da ${esc(st.da)} cm、螺距 ${esc(st.pitch)} mm、Fy ${esc(st.fy)}、Fu ${esc(st.fu)} kgf/cm²；Ase ${v(r.Ase, 4)} cm²、futa ${v(r.futa, 0)} kgf/cm²</td></tr>
        <tr><td>載重</td><td colspan="3">P ${esc(st.P) || 0}、Vx ${esc(st.Vx) || 0}、Vy ${esc(st.Vy) || 0} kgf；Mx ${esc(st.Mx) || 0}、My ${esc(st.My) || 0}、Mz ${esc(st.Mz) || 0} kgf·cm${st.src ? `（${esc(st.src)}）` : ""}</td></tr>
      </table>
      <figure class="cffig">${ancSvg(st, r)}</figure>
      ${r.anchors.length && !r.miss.length ? `<table class="pt"><tr><th colspan="4">二、各支錨栓受力（kgf）</th></tr><tr><th>編號</th><th>X, Y（cm）</th><th>拉力</th><th>剪力</th></tr>
        ${r.anchors.map(a => `<tr><td>${a.id}</td><td class="c">${v(a.x, 1)}, ${v(a.y, 1)}</td><td class="c">${v(a.N, 1)}</td><td class="c">${v(a.V, 1)}</td></tr>`).join("")}</table>` : ""}
      <table class="pt">
        <tr><th colspan="6">三、強度檢核</th></tr>
        ${r.miss.length ? `<tr><td colspan="6">待補：${r.miss.map(esc).join("、")}</td></tr>` : `<tr><th>項目</th><th>需求</th><th>設計強度</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${r.checks.map(c => `<tr><td colspan="6" style="font-size:9pt">${c.t}：${c.f}</td></tr><tr><td>${c.t}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${c.a > 0 ? v(c.a, c.d) : "—"}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 ? v(c.v / c.a, 2) : "—"}</td><td class="c">${colJudge(c)[0]}</td></tr>`).join("")}`}
      </table>
      <table class="pt"><tr><th>檢核結果</th><td>${r.miss.length ? "資料未完整" : r.ng ? `${r.ng} 項超過設計強度` : "已檢核項目都在設計強度以內"}${r.nmiss ? `（${r.nmiss} 項未填資料不檢核）` : ""}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：依 ACI 318-19 第 17 章架構，SI 公式係數換算為 kgf、cm（非規範原文）。受力分配假設剛性鋼承板且只計錨栓。黏結式錨栓、地震設計額外要求、產品最小間距與邊距、鋼承板與構材未檢核；後置式錨栓應依產品評估報告。本計算書僅供施工規劃參考。計算日期：${esc(today())}</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.who ? "：" + esc(st.info.who) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#anBack").onclick = () => goBack("#/struct/anc");
  $("#pvPrint").onclick = doPrint;
}

STRUCT_TABS.push(["anc", "錨栓", tabAnchor]);
