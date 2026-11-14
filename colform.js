"use strict";
/* 柱模板檢核（工程計算機的分頁之一，另有 A4 計算書）
   傳力路徑：混凝土側壓力 → 襯板 → 小格柵 → 第一層大格柵 → 第二層大格柵 → 緊結器（螺桿）。
   ‧側壓力只用液壓 P = γ × H，可另填「側壓力上限」（依你採用的規範或施工規範自行計算後填入），取兩者較小值。
   ‧材料容許應力、彈性模數、撓度限制、螺桿容許拉力：本工具「不內建任何數值」，一律由使用者依材料規格與契約填寫；
     可存成常用材料，記在這支手機（localStorage）。
   ‧構件依均布載重的梁計算：簡支 M = wL²/8、V = wL/2、δ = 5wL⁴/384EI；
     三跨以上連續（近似）M = wL²/10、V = 0.6wL、δ = wL⁴/145EI。
   ‧單位：長度 cm、力 kgf、應力 kgf/cm²；γ 用 t/m³、側壓力上限用 t/m²。 */

const COL_MEMBERS = [
  // k：構件代號；span／trib：跨距、受載寬度取自哪個間距；ply：襯板以 100 cm 寬的板帶計算
  { k: "ply", n: "襯板", span: "H1", trib: null, ply: true },
  { k: "stud", n: "小格柵", span: "B2", trib: "H1" },
  { k: "w1", n: "第一層大格柵", span: "H3", trib: "B2" },
  { k: "w2", n: "第二層大格柵", span: "B4", trib: "H3" }
];
const COL_GAPS = [
  ["H1", "小格柵間距 H1", "＝襯板的跨距"],
  ["B2", "第一層大格柵間距 B2", "＝小格柵的跨距"],
  ["H3", "第二層大格柵間距 H3", "＝第一層大格柵的跨距"],
  ["B4", "螺桿（緊結器）水平間距 B4", "＝第二層大格柵的跨距"],
  ["H4", "螺桿（緊結器）垂直間距 H4", "通常等於 H3"]
];
const COL_COEF = { s: { m: 1 / 8, v: 0.5, d: 384 / 5, n: "簡支" }, c: { m: 1 / 10, v: 0.6, d: 145, n: "三跨以上連續（近似）" } };
const colBlankMem = ply => ({ cont: "c", sect: "rect", b: "", h: "", I: "", S: "", A: "", kv: "1.5", cnt: "1", fb: "", fv: "", E: "", defN: "", defA: "" });
const colBlank = () => ({
  info: { proj: "", loc: "", no: "", bx: "", by: "", H: "", by_: "" },
  gamma: "2.4", pmax: "", gaps: { H1: "", B2: "", H3: "", B4: "", H4: "" },
  m: Object.fromEntries(COL_MEMBERS.map(x => [x.k, colBlankMem(x.ply)])),
  tie: { ta: "", name: "" }
});
// 讀回存檔時只留下已知欄位、而且都轉成字串，避免舊資料或手動改壞的資料影響畫面
function colLoad() {
  const d = colBlank();
  let s; try { s = JSON.parse(ls.get("calcColForm", "null")); } catch { s = null; }
  if (!s || typeof s !== "object") return d;
  const pick = (dst, src) => { if (!src || typeof src !== "object") return; for (const k of Object.keys(dst)) if (typeof dst[k] === "string" && (typeof src[k] === "string" || typeof src[k] === "number")) dst[k] = String(src[k]).slice(0, 60); };
  pick(d.info, s.info); pick(d, s); pick(d.gaps, s.gaps); pick(d.tie, s.tie);
  for (const x of COL_MEMBERS) pick(d.m[x.k], s.m?.[x.k]);
  return d;
}
const colSave = st => ls.set("calcColForm", JSON.stringify(st));
const colMats = () => { try { const a = JSON.parse(ls.get("calcColMat", "[]")); return Array.isArray(a) ? a.filter(p => p && typeof p.n === "string").slice(0, 30) : []; } catch { return []; } };

/* ---------- 計算 ---------- */
function colCalc(st) {
  const f = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : NaN; };
  const H = f(st.info.H), g = f(st.gamma), pmax = f(st.pmax);
  const pFull = g * H / 1000;                                   // kgf/cm²（γ t/m³ × H cm）
  const P = Number.isFinite(pmax) && pmax > 0 ? Math.min(pFull, pmax / 10) : pFull;   // 1 t/m² = 0.1 kgf/cm²
  const gap = k => f(st.gaps[k]);
  const mems = COL_MEMBERS.map(x => {
    const m = st.m[x.k], c = COL_COEF[m.cont] || COL_COEF.c, L = gap(x.span), trib = x.ply ? 100 : gap(x.trib);
    const n = Math.max(1, f(m.cnt) || 1);
    let I, S, A, kv;
    if (m.sect === "rect") { const b = x.ply ? 100 : f(m.b), h = f(m.h); I = b * h ** 3 / 12; S = b * h * h / 6; A = b * h; kv = 1.5; }
    else { I = f(m.I); S = f(m.S); A = f(m.A); kv = f(m.kv) || 1.5; }
    if (!x.ply) { I *= n; S *= n; A *= n; }
    const w = P * trib, M = c.m * w * L * L, V = c.v * w * L, d = w * L ** 4 / (c.d * f(m.E) * I);
    const fb = M / S, fv = kv * V / A;
    const lims = [f(m.defN) > 0 ? L / f(m.defN) : NaN, f(m.defA) > 0 ? f(m.defA) / 10 : NaN].filter(Number.isFinite);
    const dAllow = lims.length ? Math.min(...lims) : NaN;
    return { x, m, c, L, trib, w, M, V, I, S, A, kv, n,
      checks: [
        { t: "彎曲應力 fb", v: fb, a: f(m.fb), u: "kgf/cm²", d: 1 },
        { t: "剪應力 fv", v: fv, a: f(m.fv), u: "kgf/cm²", d: 2 },
        { t: "撓度 δ", v: d * 10, a: dAllow * 10, u: "mm", d: 2 }
      ] };
  });
  const T = P * gap("B4") * gap("H4");
  const tie = { t: "螺桿拉力 T", v: T, a: f(st.tie.ta), u: "kgf", d: 0 };
  const all = [...mems.flatMap(x => x.checks), tie];
  const ng = all.filter(c => Number.isFinite(c.v) && c.a > 0 && c.v > c.a).length;
  const miss = all.filter(c => !Number.isFinite(c.v) || !(c.a > 0)).length;
  return { H, g, pFull, P, pmax, mems, tie, ng, miss };
}
const colJudge = c => !Number.isFinite(c.v) ? ["—", ""] : !(c.a > 0) ? ["未填容許值", ""] : c.v <= c.a ? ["OK", "ok"] : ["NG", "bad"];

/* ---------- 畫面 ---------- */
function tabColForm(box) {
  const st = colLoad();
  const inp = (path, val, ph = "", attr = "") => `<input data-p="${path}" inputmode="decimal" value="${esc(val)}" placeholder="${esc(ph)}" ${attr}>`;
  const memPanel = x => {
    const m = st.m[x.k], mats = colMats();
    return `<details class="panel cfm" data-m="${x.k}"><summary>${x.n}　<small class="cfsum" data-sum="${x.k}"></small></summary>
      <p class="cnote" style="margin-top:0">跨距＝${x.span}${x.ply ? "；以 100 cm 寬的板帶計算" : `；受載寬度＝${x.trib}`}</p>
      <div class="grid2">
        <div class="field"><label>支承條件</label><select data-p="m.${x.k}.cont"><option value="c" ${m.cont === "c" ? "selected" : ""}>三跨以上連續</option><option value="s" ${m.cont === "s" ? "selected" : ""}>簡支</option></select></div>
        <div class="field"><label>斷面輸入</label><select data-p="m.${x.k}.sect"><option value="rect" ${m.sect === "rect" ? "selected" : ""}>${x.ply ? "板厚" : "矩形 b × h"}</option><option value="custom" ${m.sect === "custom" ? "selected" : ""}>自行輸入 I、S、A</option></select></div>
      </div>
      <div class="grid2 cf-rect" ${m.sect === "rect" ? "" : "hidden"}>
        ${x.ply ? `<div class="field"><label>板厚 t（cm）</label>${inp(`m.${x.k}.h`, m.h, "例：1.8")}</div>`
        : `<div class="field"><label>寬 b（cm）</label>${inp(`m.${x.k}.b`, m.b)}</div><div class="field"><label>高 h（受力方向，cm）</label>${inp(`m.${x.k}.h`, m.h)}</div>`}
      </div>
      <div class="grid2 cf-cust" ${m.sect === "custom" ? "" : "hidden"}>
        <div class="field"><label>I（cm⁴）${x.ply ? "／100 cm 寬" : "／每根"}</label>${inp(`m.${x.k}.I`, m.I)}</div>
        <div class="field"><label>S（cm³）${x.ply ? "／100 cm 寬" : "／每根"}</label>${inp(`m.${x.k}.S`, m.S)}</div>
        <div class="field"><label>A（cm²）${x.ply ? "／100 cm 寬" : "／每根"}</label>${inp(`m.${x.k}.A`, m.A)}</div>
        <div class="field"><label>剪應力係數 k（τ = kV/A）</label>${inp(`m.${x.k}.kv`, m.kv, "矩形 1.5")}</div>
      </div>
      ${x.ply ? "" : `<div class="field"><label>並排根數（例：雙鋼管填 2）</label>${inp(`m.${x.k}.cnt`, m.cnt)}</div>`}
      <h3 class="cfh">材料容許值（依材料規格填寫）</h3>
      ${mats.length ? `<div class="field"><label>套用常用材料</label><select data-mat="${x.k}"><option value="">請選擇</option>${mats.map((p, i) => `<option value="${i}">${esc(p.n)}</option>`).join("")}</select></div>` : ""}
      <div class="grid2">
        <div class="field"><label>容許彎曲應力 fb（kgf/cm²）</label>${inp(`m.${x.k}.fb`, m.fb)}</div>
        <div class="field"><label>容許剪應力 fv（kgf/cm²）</label>${inp(`m.${x.k}.fv`, m.fv, x.ply ? "膠合板用滾動剪力" : "")}</div>
        <div class="field"><label>彈性模數 E（kgf/cm²）</label>${inp(`m.${x.k}.E`, m.E)}</div>
        <div class="field"><label>撓度限制 L／?</label>${inp(`m.${x.k}.defN`, m.defN, "可空白")}</div>
        <div class="field"><label>撓度上限（mm）</label>${inp(`m.${x.k}.defA`, m.defA, "可空白")}</div>
      </div>
      <div class="row"><button type="button" class="sec" data-savemat="${x.k}">＋ 存成常用材料</button></div>
      <div class="cfout" data-out="${x.k}"></div></details>`;
  };
  const draw = () => {
    const mats = colMats();
    box.innerHTML = `
      <div class="panel"><h2>柱模板檢核</h2>
        <p class="cnote" style="margin-top:0">由側壓力依序檢核襯板 → 小格柵 → 第一層大格柵 → 第二層大格柵 → 螺桿。容許應力、E 值、撓度限制與螺桿容許拉力<b>本工具不內建</b>，請依材料規格、施工規範與契約填寫。</p>
        <div class="grid2">
          <div class="field"><label>工程名稱</label><input data-p="info.proj" value="${esc(st.info.proj)}"></div>
          <div class="field"><label>位置／樓層</label><input data-p="info.loc" value="${esc(st.info.loc)}"></div>
          <div class="field"><label>構件編號</label><input data-p="info.no" value="${esc(st.info.no)}" placeholder="例：C1"></div>
          <div class="field"><label>計算人員</label><input data-p="info.by_" value="${esc(st.info.by_)}"></div>
          <div class="field"><label>柱斷面寬（cm）</label>${inp("info.bx", st.info.bx, "記錄用")}</div>
          <div class="field"><label>柱斷面深（cm）</label>${inp("info.by", st.info.by, "記錄用")}</div>
        </div></div>
      <div class="panel"><h2>側壓力</h2>
        <div class="grid2">
          <div class="field"><label>澆置高度 H（cm）</label>${inp("info.H", st.info.H, "一次澆置的高度")}</div>
          <div class="field"><label>混凝土單位重 γ（t/m³）</label>${inp("gamma", st.gamma)}</div>
          <div class="field"><label>側壓力上限（t/m²，可空白）</label>${inp("pmax", st.pmax, "依採用的公式自行計算")}</div>
        </div>
        <div id="cfP"></div>
        <p class="cnote">液壓 P = γ × H。若依澆置速率、溫度等條件算出較小的設計側壓力，填在「側壓力上限」，計算取兩者較小值。採用哪一條公式請依施工規範與契約。</p></div>
      <div class="panel"><h2>配置間距（cm）</h2>
        ${COL_SVG}
        <div class="grid2">${COL_GAPS.map(([k, l, h]) => `<div class="field"><label>${l}</label>${inp("gaps." + k, st.gaps[k], h)}</div>`).join("")}</div></div>
      ${COL_MEMBERS.map(memPanel).join("")}
      <details class="panel cfm" data-m="tie"><summary>緊結器（螺桿）　<small class="cfsum" data-sum="tie"></small></summary>
        <div class="grid2">
          <div class="field"><label>規格（記錄用）</label><input data-p="tie.name" value="${esc(st.tie.name)}" placeholder="例：型號、直徑"></div>
          <div class="field"><label>容許拉力 Ta（kgf）</label>${inp("tie.ta", st.tie.ta, "依產品規格")}</div></div>
        <p class="cnote">螺桿拉力 T = P × B4 × H4（受載面積法）。</p>
        <div class="cfout" data-out="tie"></div></details>
      <div class="panel"><div id="cfAll"></div>
        <div class="row"><a class="btnlink" href="#/calc/col/sheet" id="cfSheet">📄 產生計算書（A4）</a><button type="button" class="sec" id="cfClear">全部清除</button></div></div>
      <p class="cnote" style="margin:0 12px 12px"><b>提醒：</b>本頁只做數值計算，假設各構件為均布載重的梁、以澆置底部最大側壓力檢核整支柱。容許值由你輸入，結果僅供施工規劃參考；模板支撐的安全仍應依施工規範、契約與專業技師的計算為準。資料會記在這支手機。</p>`;
    bind(); calc();
  };
  const calc = () => {
    colSave(st);
    const r = colCalc(st);
    $("#cfP").innerHTML = Number.isFinite(r.pFull) ? `
      <div class="big"><span>液壓 γH</span><b>${fmt(r.pFull * 10, 2)} t/m²</b></div>
      <div class="big"><span>設計側壓力 P</span><b>${fmt(r.P * 10, 2)} t/m²（${fmt(r.P, 3)} kgf/cm²）</b></div>` : `<p class="cnote">請填澆置高度與單位重</p>`;
    const row = c => { const [j, cls] = colJudge(c); return `<div class="big"><span>${c.t}</span><b>${fmt(c.v, c.d)}${c.a > 0 ? ` ／ ${fmt(c.a, c.d)}` : ""} ${c.u}　<em class="cfj ${cls}">${j}</em></b></div>`; };
    const sum = cs => { const bad = cs.filter(c => colJudge(c)[0] === "NG").length, miss = cs.filter(c => colJudge(c)[1] === "").length; return bad ? `<em class="cfj bad">NG ${bad} 項</em>` : miss ? "" : `<em class="cfj ok">OK</em>`; };
    for (const m of r.mems) {
      box.querySelector(`[data-out="${m.x.k}"]`).innerHTML = `
        <div class="big"><span>跨距 L／受載寬</span><b>${fmt(m.L, 1)}／${fmt(m.trib, 1)} cm</b></div>
        <div class="big"><span>均布載重 w</span><b>${fmt(m.w, 3)} kgf/cm</b></div>
        <div class="big"><span>M／V</span><b>${fmt(m.M, 0)} kgf·cm／${fmt(m.V, 1)} kgf</b></div>
        ${m.checks.map(row).join("")}<p class="cnote">計算值 ／ 容許值。${COL_COEF[m.m.cont]?.n || ""}。</p>`;
      box.querySelector(`[data-sum="${m.x.k}"]`).innerHTML = sum(m.checks);
    }
    box.querySelector(`[data-out="tie"]`).innerHTML = row(r.tie);
    box.querySelector(`[data-sum="tie"]`).innerHTML = sum([r.tie]);
    $("#cfAll").innerHTML = `<div class="big"><span>檢核結果</span><b>${r.ng ? `<em class="cfj bad">${r.ng} 項超過容許值</em>` : r.miss ? `<span style="font-size:15px;color:var(--mut)">還有 ${r.miss} 項未完成（缺尺寸或容許值）</span>` : `<em class="cfj ok">全部在容許值以內</em>`}</b></div>`;
  };
  const bind = () => {
    box.querySelectorAll("[data-p]").forEach(el => {
      el.oninput = el.onchange = () => {
        const ks = el.dataset.p.split("."), last = ks.pop(); let o = st; for (const k of ks) o = o[k];
        o[last] = el.value;
        if (last === "sect") { const p = el.closest(".cfm"); p.querySelector(".cf-rect").hidden = el.value !== "rect"; p.querySelector(".cf-cust").hidden = el.value !== "custom"; }
        calc();
      };
    });
    box.querySelectorAll("[data-mat]").forEach(el => el.onchange = () => {
      const p = colMats()[+el.value]; if (!p) return; const m = st.m[el.dataset.mat];
      for (const k of ["fb", "fv", "E", "defN", "defA"]) { m[k] = String(p[k] ?? ""); const i = box.querySelector(`[data-p="m.${el.dataset.mat}.${k}"]`); if (i) i.value = m[k]; }
      el.value = ""; calc();
    });
    box.querySelectorAll("[data-savemat]").forEach(b => b.onclick = () => {
      const m = st.m[b.dataset.savemat]; if (![m.fb, m.fv, m.E].some(v => parseFloat(v) > 0)) { alert("請先填容許應力或 E 值"); return; }
      const n = (prompt("材料名稱（例：柳安膠合板 18 mm、雙鋼管）") || "").trim().slice(0, 40); if (!n) return;
      const list = colMats().filter(p => p.n !== n); list.push({ n, fb: m.fb, fv: m.fv, E: m.E, defN: m.defN, defA: m.defA });
      ls.set("calcColMat", JSON.stringify(list)); const open = [...box.querySelectorAll("details[open]")].map(d => d.dataset.m); draw();
      open.forEach(k => { const d = box.querySelector(`details[data-m="${k}"]`); if (d) d.open = true; });
    });
    $("#cfClear").onclick = () => { if (!confirm("清除柱模板的全部輸入？（常用材料會保留）")) return; Object.assign(st, colBlank()); draw(); };
    $("#cfSheet").onclick = e => { e.preventDefault(); location.hash = "#/calc/col/sheet"; };
  };
  draw();
}

// 示意圖（不按比例）：說明各間距代號，顏色用 currentColor 跟著配色
const COL_SVG = `<svg class="cfsvg" viewBox="0 0 340 175" role="img" aria-label="柱模板配置示意圖">
  <g fill="none" stroke="currentColor">
    <rect x="40" y="10" width="160" height="150" stroke-width="1.5" opacity=".5"/>
    ${[30, 55, 80, 105, 130].map(y => `<line x1="40" x2="200" y1="${y}" y2="${y}" stroke-width="1" opacity=".55"/>`).join("")}
    ${[75, 165].map(x => `<rect x="${x - 4}" y="10" width="8" height="150" stroke-width="1.5"/>`).join("")}
    ${[45, 120].map(y => `<rect x="25" y="${y - 4}" width="190" height="8" stroke-width="2"/>`).join("")}
    ${[45, 120].map(y => [25, 215].map(x => `<circle cx="${x}" cy="${y}" r="4" fill="currentColor"/>`).join("")).join("")}
  </g>
  <g font-size="11" fill="currentColor">
    <text x="228" y="34">─ 小格柵</text><text x="228" y="52">═ 第二層大格柵</text><text x="228" y="70">▯ 第一層大格柵</text><text x="228" y="88">● 螺桿</text>
    <text x="206" y="70">H1</text><text x="110" y="168" text-anchor="middle">B2</text><text x="4" y="86">H3</text><text x="228" y="140">B4＝螺桿間距</text>
  </g></svg>
  <p class="cnote" style="margin-top:0">示意圖不按比例；平立面配置依實際圖說。</p>`;

/* ---------- 計算書（A4） ---------- */
function renderColSheet() {
  const st = colLoad(), r = colCalc(st), company = ls.get("company", "");
  const v = (x, d) => Number.isFinite(x) ? fmt(x, d) : "—";
  const crow = c => { const [j] = colJudge(c); return `<tr><td>${c.t}</td><td class="c">${v(c.v, c.d)}</td><td class="c">${c.a > 0 ? v(c.a, c.d) : "—"}</td><td class="c">${c.u}</td><td class="c">${c.a > 0 && Number.isFinite(c.v) ? v(c.v / c.a, 2) : "—"}</td><td class="c">${j}</td></tr>`; };
  const sect = m => m.m.sect === "rect" ? (m.x.ply ? `板厚 t = ${esc(m.m.h)} cm（100 cm 寬板帶）` : `矩形 ${esc(m.m.b)} × ${esc(m.m.h)} cm × ${fmt(m.n, 0)} 根`) : `I = ${esc(m.m.I)} cm⁴、S = ${esc(m.m.S)} cm³、A = ${esc(m.m.A)} cm²${m.x.ply ? "（每 100 cm 寬）" : `，× ${fmt(m.n, 0)} 根`}`;
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="cfBack">← 返回修改</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper cfpaper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">柱模板計算書</div>
      <table class="pt">
        <tr><th>工程名稱</th><td colspan="3">${esc(st.info.proj)}</td></tr>
        <tr><th>位置／樓層</th><td>${esc(st.info.loc)}</td><th>構件編號</th><td>${esc(st.info.no)}</td></tr>
        <tr><th>柱斷面</th><td>${esc(st.info.bx)} × ${esc(st.info.by)} cm</td><th>計算日期</th><td>${esc(today())}</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="4">一、設計側壓力</th></tr>
        <tr><td>澆置高度 H</td><td class="c">${esc(st.info.H)} cm</td><td>單位重 γ</td><td class="c">${esc(st.gamma)} t/m³</td></tr>
        <tr><td>液壓 γH</td><td class="c">${v(r.pFull * 10, 2)} t/m²</td><td>側壓力上限</td><td class="c">${r.pmax > 0 ? esc(st.pmax) + " t/m²" : "未填"}</td></tr>
        <tr><td>設計側壓力 P</td><td class="c" colspan="3">${v(r.P * 10, 2)} t/m²（${v(r.P, 3)} kgf/cm²）</td></tr>
      </table>
      <table class="pt">
        <tr><th colspan="4">二、配置間距（cm）</th></tr>
        <tr><td>小格柵 H1</td><td class="c">${esc(st.gaps.H1)}</td><td>第一層大格柵 B2</td><td class="c">${esc(st.gaps.B2)}</td></tr>
        <tr><td>第二層大格柵 H3</td><td class="c">${esc(st.gaps.H3)}</td><td>螺桿 B4 × H4</td><td class="c">${esc(st.gaps.B4)} × ${esc(st.gaps.H4)}</td></tr>
      </table>
      ${r.mems.map((m, i) => `<table class="pt">
        <tr><th colspan="6">${"三四五六"[i]}、${m.x.n}</th></tr>
        <tr><td colspan="6">斷面：${sect(m)}；${m.c.n}；跨距 L = ${v(m.L, 1)} cm，受載寬 ${v(m.trib, 1)} cm</td></tr>
        <tr><td colspan="6">w = P × ${m.x.ply ? "100" : m.x.trib} = ${v(m.w, 3)} kgf/cm；M = ${m.c.m === 1 / 8 ? "wL²/8" : "wL²/10"} = ${v(m.M, 0)} kgf·cm；V = ${m.c.v}wL = ${v(m.V, 1)} kgf；δ = ${m.c.d === 145 ? "wL⁴/145EI" : "5wL⁴/384EI"}</td></tr>
        <tr><th>項目</th><th>計算值</th><th>容許值</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${m.checks.map(crow).join("")}
        <tr><td colspan="6">E = ${esc(m.m.E) || "—"} kgf/cm²；撓度限制：${[m.m.defN ? "L/" + esc(m.m.defN) : "", m.m.defA ? esc(m.m.defA) + " mm" : ""].filter(Boolean).join("、") || "未填"}</td></tr>
      </table>`).join("")}
      <table class="pt">
        <tr><th colspan="6">七、緊結器（螺桿）${st.tie.name ? "：" + esc(st.tie.name) : ""}</th></tr>
        <tr><td colspan="6">T = P × B4 × H4</td></tr>
        <tr><th>項目</th><th>計算值</th><th>容許值</th><th>單位</th><th>比值</th><th>判定</th></tr>
        ${crow(r.tie)}
      </table>
      <table class="pt"><tr><th>檢核結果</th><td>${r.ng ? `${r.ng} 項超過容許值` : r.miss ? `尚有 ${r.miss} 項未完成` : "全部在容許值以內"}</td></tr>
        <tr><td colspan="2" style="font-size:9pt">註：構件以均布載重之梁計算，以澆置底部最大側壓力檢核。材料容許值、撓度限制與側壓力上限由計算人員依材料規格、施工規範與契約填入，本計算書僅供施工規劃參考。</td></tr></table>
      <div class="psigs">${["計算人員" + (st.info.by_ ? "：" + esc(st.info.by_) : ""), "工地主任"].map(l => `<div><br><br>${l}</div>`).join("")}</div>
    </div>`;
  $("#cfBack").onclick = () => goBack("#/calc/col");
  $("#pvPrint").onclick = doPrint;
}

CALC_TABS.push(["col", "柱模板", tabColForm]);
