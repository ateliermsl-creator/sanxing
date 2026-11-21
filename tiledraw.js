"use strict";
/* 磁磚計算的「展開立面圖」與「等角透視圖」（示意，SVG）。2026-11-21 使用者要求（參考一款磁磚規劃 App 的展開圖＋透視圖）。
   只讀 tile.js 的資料，不改計算：
   - 每一面用「長 × 高」畫成矩形，依選用的磁磚規格畫格線（片長＋縫為水平模數、片寬＋縫為垂直模數，從左下角起磚）。
   - 各面依清單順序接續。每一面多一個「接上一面」：陽角轉折（預設，外牆繞建築一圈）／陰角轉折（室內繞房間一圈）／同一直線／地坪／不畫入圖。
     約定：看著貼磚的那一面、由左往右走（和展開圖一樣），所以陽角＝往背離磁磚的方向轉，陰角＝往磁磚那側轉；室內、外牆都適用，不用另外選。
   - 開口（門窗）可填「距左」「離地」定位；沒填就自動排：水平平均分布，高度達牆高 3/4 的視為門（貼地），其餘置中。只是示意，數量計算照舊用面積。
   - 直接填「面積」的面沒有長高，畫不出來，圖下會列出；「數量」大於 1 的面只畫一次並標 ×n。
   - 透視圖只畫磁磚面向觀看者的面（看不到的面只畫虛線外框），可轉 90° 看另一側（cfg.rot）。
   - 多層樓／多間（2026-11-21 使用者反映只能畫一層）：「往上一層」從這一面另起一圈，起點同上一圈、疊在上一圈最高的牆上面；
     「另起一圈」另起一圈畫在旁邊（同一層的另一間）。每一圈稱一段，展開圖分段畫、轉角編號每段從 A 重來。 */

const TILE_COLORS = ["#eadfca", "#cfd6c6", "#e2cfc5", "#c9d3d8", "#dcd3b2", "#d8cad6", "#c9c0ad", "#e6e3da"];
const TILE_G = [["", "陽角轉折"], ["in", "陰角轉折"], ["s", "同一直線"], ["up", "往上一層（新的一圈）"], ["new", "另起一圈（畫在旁邊）"], ["f", "地坪（畫在底面）"], ["x", "不畫入圖"]];
const tileLab = i => (i >= 26 ? String.fromCharCode(64 + Math.floor(i / 26)) : "") + String.fromCharCode(65 + i % 26);
const tdF = v => (Math.round(v * 100) / 100).toString();

// 開口位置（牆面座標，左下角為原點，公尺）
function tileOps(r, a, b) {
  const list = (r.op || []).map(o => {
    const n = String(o.n ?? "").trim() === "" ? 1 : Math.round(+o.n);
    return { w: Math.min(+o.w, a), h: Math.min(+o.h, b), n: Math.min(n, 60), x: tileNum(o.x), y: tileNum(o.y) };
  }).filter(o => o.w > 0 && o.h > 0 && o.n > 0);
  const yOf = o => Number.isFinite(o.y) ? Math.max(0, Math.min(o.y, b - o.h)) : o.h >= 0.75 * b ? 0 : (b - o.h) / 2;
  const out = [], auto = [];
  for (const o of list) {
    if (!Number.isFinite(o.x)) { for (let k = 0; k < o.n; k++) auto.push(o); continue; }
    const x0 = Math.max(0, Math.min(o.x, a - o.w)), step = o.n > 1 ? (a - 2 * x0 - o.w) / (o.n - 1) : 0;   // 多個時從「距左」排到右邊對稱的位置
    for (let k = 0; k < o.n; k++) out.push({ x: Math.min(a - o.w, x0 + k * (step > 0 ? step : o.w * 1.2)), y: yOf(o), w: o.w, h: o.h });
  }
  if (auto.length) {
    const gap = Math.max(0, (a - auto.reduce((s, o) => s + o.w, 0)) / (auto.length + 1));
    let x = gap;
    for (const o of auto) { out.push({ x: Math.min(x, a - o.w), y: yOf(o), w: o.w, h: o.h }); x += o.w + gap; }
  }
  return out;
}

// 各面在平面上的位置：起點 p0、方向 d（單位向量）、底高 z0；磁磚那側法向量 = (d.y, −d.x)。groups：每一圈（段）
function tileGeo(st) {
  const walls = [], floors = [], skip = [], groups = [];
  let g = null, P = [0, 0], d = [1, 0];
  const start = kind => {
    let s0 = [0, 0], z0 = 0;
    if (g && kind === "up") { s0 = g.start; z0 = g.z0 + g.H; }
    else if (g && kind === "new") { const xs = walls.flatMap(w => [w.p0[0], w.p0[0] + w.d[0] * w.a]).concat(floors.map(f => f.o[0] + f.a)); s0 = [(xs.length ? Math.max(...xs) : 0) + 1.5, 0]; }
    g = { k: groups.length, start: s0, z0, H: 0, walls: [], floors: [], end: s0 }; groups.push(g); P = s0; d = [1, 0];
  };
  start("");
  st.rows.forEach((r, i) => {
    if (r.g === "x") return;
    const a = tileNum(r.a), b = tileNum(r.b), area = Number.isFinite(tileNum(r.v));
    if (area || !(a > 0 && b > 0)) { if (area || r.name.trim()) skip.push({ i, why: area ? "直接填面積" : "沒有長、高" }); return; }
    const n = String(r.n ?? "").trim() === "" ? 1 : +r.n, fresh = r.g === "up" || r.g === "new";
    if (fresh && (g.walls.length || g.floors.length)) start(r.g);
    if (r.g === "f") { const f = { i, r, a, b, n, gi: g.k, z0: g.z0, o: g.start }; floors.push(f); g.floors.push(f); return; }
    if (g.walls.length && !fresh) { if (r.g === "in") d = [d[1], -d[0]]; else if (r.g !== "s") d = [-d[1], d[0]]; }
    const w = { i, r, a, b, n, gi: g.k, j: g.walls.length, z0: g.z0, p0: P, d, ops: tileOps(r, a, b) };
    walls.push(w); g.walls.push(w); g.H = Math.max(g.H, b);
    P = [P[0] + d[0] * a, P[1] + d[1] * a]; g.end = P;
  });
  for (const q of groups) { q.gap = Math.hypot(q.end[0] - q.start[0], q.end[1] - q.start[1]); q.closed = q.walls.length > 2 && q.gap < 0.01; }
  return { walls, floors, skip, groups: groups.filter(q => q.walls.length || q.floors.length) };
}
const tdGrpName = q => { const w = q.walls[0] || q.floors[0]; return w ? w.r.name.trim() || `第 ${w.i + 1} 面` : ""; };

// 磁磚格線圖樣：單位是牆面座標（公尺），k = 每公尺幾個畫面單位（太密就只填色）
function tileDefs(st, pid, k) {
  return `<defs>${st.cfg.specs.map((sp, i) => {
    const c = tileSpecCalc(sp), mx = (c.L + c.jmm / 10) / 100, my = (c.W + c.jmm / 10) / 100, col = TILE_COLORS[i % TILE_COLORS.length];
    if (!(mx > 0 && my > 0) || Math.min(mx, my) * k < 2.6) return `<pattern id="${pid}t${i}" patternUnits="userSpaceOnUse" width="1" height="1"><rect width="1" height="1" fill="${col}"/></pattern>`;
    return `<pattern id="${pid}t${i}" patternUnits="userSpaceOnUse" width="${mx}" height="${my}"><rect width="${mx}" height="${my}" fill="${col}"/><path d="M0 0H${mx}M0 0V${my}" fill="none" stroke="#7d7260" stroke-opacity=".55" stroke-width="${(0.6 / k).toFixed(5)}"/></pattern>`;
  }).join("")}</defs>`;
}
const tdM = m => `matrix(${m.map(v => +v.toFixed(4)).join(" ")})`;
const tdFace = (pid, s, m, w, h, ops) => `<g transform="${tdM(m)}"><rect width="${w}" height="${h}" fill="url(#${pid}t${+s || 0})"/>${ops.map(o => `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="#fff"/>`).join("")}</g>`;
const tdPoly = (pts, extra = "") => `<polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="#2f2b25" ${extra}/>`;

// 展開立面圖：各面攤平由左到右排，太長自動換行
function tileElevSvg(st, geo, pid) {
  const GS = geo.groups.filter(q => q.walls.length);
  if (!GS.length) return "";
  // 每段先排成數行，全部共用同一個比例（各段大小可以互相比較）
  const segs = GS.map(q => {
    const W = q.walls, H = Math.max(...W.map(w => w.b)), tot = W.reduce((s, w) => s + w.a, 0), maxA = Math.max(...W.map(w => w.a));
    const nl = Math.min(4, Math.max(1, Math.ceil(tot / (H * 7)))), target = Math.max(maxA, tot / nl);
    const lines = [[]]; let len = 0;
    for (const w of W) { if (len > 0 && len + w.a > target * 1.08) { lines.push([]); len = 0; } lines[lines.length - 1].push(w); len += w.a; }
    return { q, W, lines, H };
  });
  const DW = 680, k = Math.min(DW / Math.max(...segs.flatMap(g => g.lines.map(l => l.reduce((s, w) => s + w.a, 0)))), 300 / Math.max(...segs.map(g => g.H)));
  const out = [], X0 = 24, top = 58, bot = 48;
  let y = 0;
  for (const { q, W, lines } of segs) {
  if (segs.length > 1) { out.push(`<text x="${X0 - 8}" y="${y + 16}" font-size="15" font-weight="700" fill="#2f2b25">第 ${q.k + 1} 段：${esc(tdGrpName(q))}${q.z0 > 0 ? `（底高 ${tdF(q.z0)}）` : ""}</text>`); y += 24; }
  for (const line of lines) {
    const lh = Math.max(...line.map(w => w.b)) * k, base = y + top + lh;
    let x = X0;
    for (const w of line) {
      const idx = w.j, ww = w.a * k, wh = w.b * k;
      out.push(tdFace(pid, w.r.s, [k, 0, 0, -k, x, base], w.a, w.b, w.ops));
      out.push(`<rect x="${x.toFixed(1)}" y="${(base - wh).toFixed(1)}" width="${ww.toFixed(1)}" height="${wh.toFixed(1)}" fill="none" stroke="#2f2b25" stroke-width="1.3"/>`);
      for (const o of w.ops) {
        const ox = x + o.x * k, oy = base - (o.y + o.h) * k, ow = o.w * k, oh = o.h * k;
        out.push(`<rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${ow.toFixed(1)}" height="${oh.toFixed(1)}" fill="none" stroke="#2f2b25" stroke-width=".9"/><path d="M${ox.toFixed(1)} ${(oy + oh).toFixed(1)}L${(ox + ow).toFixed(1)} ${oy.toFixed(1)}" stroke="#2f2b25" stroke-width=".5" stroke-opacity=".5"/>`);
        if (ow > 52 && oh > 18) out.push(`<text x="${(ox + ow / 2).toFixed(1)}" y="${(oy + oh / 2 + 4).toFixed(1)}" text-anchor="middle" font-size="12" fill="#2f2b25">${tdF(o.w)}×${tdF(o.h)}</text>`);
      }
      // 尺寸線（上方）＋高度（右側）＋名稱（下方）
      const dy = y + top - 14;
      out.push(`<path d="M${x.toFixed(1)} ${dy}H${(x + ww).toFixed(1)}M${x.toFixed(1)} ${dy - 4}v8M${(x + ww).toFixed(1)} ${dy - 4}v8" stroke="#2f2b25" stroke-width=".7" fill="none"/><text x="${(x + ww / 2).toFixed(1)}" y="${dy - 5}" text-anchor="middle" font-size="14" fill="#2f2b25">${tdF(w.a)}</text>`);
      if (wh > 34 && ww > 50) out.push(`<text x="${(x + ww - 4).toFixed(1)}" y="${(base - wh + 15).toFixed(1)}" text-anchor="end" font-size="12" fill="#2f2b25" stroke="#fff" stroke-width="3" paint-order="stroke">高 ${tdF(w.b)}</text>`);
      const nm = `${w.i + 1}. ${w.r.name.trim() || "第 " + (w.i + 1) + " 面"}${w.n !== 1 ? ` ×${tdF(w.n)}` : ""}`;
      const mc = Math.floor((ww - 4) / 14), lb = nm.length <= mc ? nm : mc >= 4 ? nm.slice(0, mc - 1) + "…" : String(w.i + 1);
      out.push(`<text x="${(x + ww / 2).toFixed(1)}" y="${(base + 20).toFixed(1)}" text-anchor="middle" font-size="14" fill="#2f2b25">${esc(lb)}</text>`);
      // 轉角編號
      const lab = (xx, t) => `<circle cx="${xx.toFixed(1)}" cy="${y + 14}" r="${segs.length > 1 ? 13 : 11}" fill="#fff" stroke="#2f2b25" stroke-width=".9"/><text x="${xx.toFixed(1)}" y="${y + 19}" text-anchor="middle" font-size="${segs.length > 1 ? 12 : 13}" font-weight="700" fill="#2f2b25">${t}</text><path d="M${xx.toFixed(1)} ${y + 25}V${(base - wh).toFixed(1)}" stroke="#2f2b25" stroke-width=".5" stroke-dasharray="2 2"/>`;
      const pre = segs.length > 1 ? q.k + 1 : "";
      if (w === line[0]) out.push(lab(x, pre + tileLab(idx)));
      out.push(lab(x + ww, pre + (idx === W.length - 1 && q.closed ? "A" : tileLab(idx + 1))));
      x += ww;
    }
    out.push(`<path d="M${X0 - 8} ${base.toFixed(1)}H${(x + 8).toFixed(1)}" stroke="#2f2b25" stroke-width="1.6"/>`);
    y = base + bot;
  }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="tlsvg" viewBox="0 0 ${DW + X0 * 2} ${Math.ceil(y - 14)}" role="img" aria-label="磁磚展開立面圖" font-family="sans-serif">${tileDefs(st, pid, k)}${out.join("")}</svg>`;
}

// 等角透視圖：平面座標 (X, Y)、高 Z → 畫面 (X−Y)cos30°, (X+Y)sin30° − Z；觀看者在 (+X, +Y) 方向
function tileIsoSvg(st, geo, pid) {
  if (!geo.walls.length && !geo.floors.length) return "";
  const rot = (+st.cfg.rot || 0) % 4, C = Math.cos(Math.PI / 6), S = 0.5;
  const R = p => { let [x, y] = p; for (let q = 0; q < rot; q++) [x, y] = [-y, x]; return [x, y]; };
  const pj = (X, Y, Z) => [(X - Y) * C, (X + Y) * S - Z];
  const walls = geo.walls.map(w => { const p0 = R(w.p0), d = R(w.d); return { ...w, P0: p0, D: d, P1: [p0[0] + d[0] * w.a, p0[1] + d[1] * w.a], vis: d[1] - d[0] > 1e-9 }; });
  // 地坪放在同一段的牆圍成範圍的左下角（這段沒有牆就從起點往 +Y 排），長沿 X、寬沿 Y，高度 = 這段的底高
  const floors = [];
  for (const q of geo.groups) {
    const xs = q.walls.flatMap(w => [w.p0[0], w.p0[0] + w.d[0] * w.a]), ys = q.walls.flatMap(w => [w.p0[1], w.p0[1] + w.d[1] * w.a]);
    const fo = q.walls.length ? [Math.min(...xs), Math.min(...ys)] : q.start;
    let fy = 0;
    for (const f of q.floors) { floors.push({ ...f, O: R([fo[0], fo[1] + fy]), U: R([1, 0]), V: R([0, 1]) }); if (!q.walls.length) fy += f.b + 0.5; }
  }
  const fpt = (f, u, v) => [f.O[0] + u * f.U[0] + v * f.V[0], f.O[1] + u * f.U[1] + v * f.V[1], f.z0];
  const pts = [...walls.flatMap(w => [pj(...w.P0, w.z0), pj(...w.P1, w.z0), pj(...w.P0, w.z0 + w.b), pj(...w.P1, w.z0 + w.b)]),
    ...floors.flatMap(f => [[0, 0], [f.a, 0], [0, f.b], [f.a, f.b]].map(([u, v]) => pj(...fpt(f, u, v))))];
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0])), y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  const k = Math.min(560 / Math.max(x1 - x0, 1e-6), 420 / Math.max(y1 - y0, 1e-6)), M = 30, ox = M - x0 * k, oy = M + 14 - y0 * k;
  const sp = (X, Y, Z) => { const [a, b] = pj(X, Y, Z); return [ox + a * k, oy + b * k]; };
  const mat = (O, U, V) => { const o = pj(...O), u = pj(...U), v = pj(...V); return [k * u[0], k * u[1], k * v[0], k * v[1], ox + k * o[0], oy + k * o[1]]; };
  // 由下往上、由遠到近畫（同一高度先畫地坪，再畫牆；X+Y 小的在後面）。磁磚背對觀看者的面只畫虛線外框（室內是靠近觀看者的牆、外牆是背面）
  const depth = w => w.f ? 0 : w.P0[0] + w.P0[1] + w.P1[0] + w.P1[1];
  const items = [...floors.map(f => ({ ...f, f: 1 })), ...walls].sort((a, b) => a.z0 - b.z0 || (b.f || 0) - (a.f || 0) || depth(a) - depth(b));
  const out = [];
  for (const w of items) {
    if (w.f) {
      out.push(tdFace(pid, w.r.s, mat(fpt(w, 0, 0), [...w.U, 0], [...w.V, 0]), w.a, w.b, []));
      out.push(tdPoly([[0, 0], [w.a, 0], [w.a, w.b], [0, w.b]].map(([u, v]) => sp(...fpt(w, u, v))), `stroke-width="1"`));
      continue;
    }
    const z = w.z0, box = [sp(...w.P0, z), sp(...w.P1, z), sp(...w.P1, z + w.b), sp(...w.P0, z + w.b)];
    if (!w.vis) { out.push(tdPoly(box, `stroke-width=".8" stroke-dasharray="4 3" stroke-opacity=".55"`)); continue; }
    out.push(tdFace(pid, w.r.s, mat([...w.P0, z], [...w.D, 0], [0, 0, 1]), w.a, w.b, w.ops));
    for (const o of w.ops) out.push(tdPoly([[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].map(([u, v]) => sp(w.P0[0] + w.D[0] * u, w.P0[1] + w.D[1] * u, z + v)), `stroke-width=".8"`));
    out.push(tdPoly(box, `stroke-width="1.4" stroke-linejoin="round"`));
  }
  // 轉角編號（每段從 A 開始；多段時加段號，例如 2A）
  const seen = new Set(), multi = geo.groups.filter(q => q.walls.length).length > 1;
  for (const q of geo.groups) {
    const ws = walls.filter(w => w.gi === q.k);
    ws.forEach((w, i) => {
      for (const [j, P] of [[i, w.P0], [i + 1, w.P1]]) {
        const t = (multi ? q.k + 1 : "") + (j === ws.length && q.closed ? "A" : tileLab(j)); if (seen.has(t)) continue; seen.add(t);
        const [a, b] = sp(...P, w.z0 + w.b), r = multi ? 13 : 11;
        out.push(`<path d="M${a.toFixed(1)} ${b.toFixed(1)}V${(b - 16).toFixed(1)}" stroke="#2f2b25" stroke-width=".6"/><circle cx="${a.toFixed(1)}" cy="${(b - 16 - r).toFixed(1)}" r="${r}" fill="#fff" stroke="#2f2b25" stroke-width=".9"/><text x="${a.toFixed(1)}" y="${(b - 11 - r).toFixed(1)}" text-anchor="middle" font-size="${multi ? 12 : 13}" font-weight="700" fill="#2f2b25">${t}</text>`);
      }
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="tlsvg tliso" viewBox="0 0 ${Math.ceil(2 * M + (x1 - x0) * k)} ${Math.ceil(2 * M + 14 + (y1 - y0) * k)}" role="img" aria-label="磁磚等角透視圖" font-family="sans-serif">${tileDefs(st, pid, k)}${out.join("")}</svg>`;
}

// 圖例＋附註（畫面與計算書共用）
function tileDrawNotes(st, geo) {
  const used = new Set([...geo.walls, ...geo.floors].map(w => +w.r.s || 0));
  const leg = st.cfg.specs.map((sp, i) => used.has(i) ? `<span class="tlleg"><i style="background:${TILE_COLORS[i % TILE_COLORS.length]}"></i>${esc(tileSpecLabel(sp, tileSpecCalc(sp)))}</span>` : "").join("");
  const notes = [];
  if (geo.skip.length) notes.push(`未畫入圖：${geo.skip.map(s => `第 ${s.i + 1} 面（${s.why}）`).join("、")}`);
  const multi = geo.groups.length > 1;
  for (const q of geo.groups) if (q.walls.length > 2 && !q.closed && q.walls.slice(1).some(w => w.r.g !== "s")) notes.push(`${multi ? `第 ${q.k + 1} 段（${tdGrpName(q)}）` : ""}最後一面沒有接回 ${multi ? q.k + 1 : ""}A 點（差 ${tdF(q.gap)} m），請檢查各面長度與「接上一面」是否正確`);
  return `${leg ? `<div class="tllegs">${leg}</div>` : ""}${notes.map(t => `<p class="cnote">${esc(t)}</p>`).join("")}`;
}

// 畫面上的面板內容
function tileDrawHtml(st, pid = "tdv") {
  const geo = tileGeo(st);
  if (!geo.walls.length && !geo.floors.length) return `<p class="cnote">填好各面的長、高後，這裡會畫出展開立面圖與透視圖。${geo.skip.length ? "直接填面積的面沒有長高，畫不出來。" : ""}</p>`;
  const el = tileElevSvg(st, geo, pid + "e"), iso = tileIsoSvg(st, geo, pid + "i");
  return `${el ? `<h3 class="tlh">展開立面圖</h3><div class="tlfig">${el}</div>` : ""}
    <h3 class="tlh">透視圖<button class="sec" data-trot="1" type="button">↻ 轉 90° 看另一側</button></h3><div class="tlfig">${iso}</div>
    ${tileDrawNotes(st, geo)}`;
}

// 計算書用（四、五節）
function tileDrawSheet(st) {
  const geo = tileGeo(st);
  if (!geo.walls.length && !geo.floors.length) return "";
  const el = tileElevSvg(st, geo, "tsve"), iso = tileIsoSvg(st, geo, "tsvi");
  return `<table class="pt"><tr><th style="text-align:left;white-space:normal">四、展開立面圖與透視圖（示意，單位 m）</th></tr></table>
    ${el ? `<figure class="cffig tlpfig">${el}<figcaption>展開立面圖（各面依序攤平，圓圈為轉角編號）</figcaption></figure>` : ""}
    <figure class="cffig tlpfig tlpiso">${iso}<figcaption>等角透視圖</figcaption></figure>
    <div class="tlpnote">${tileDrawNotes(st, geo)}<p class="cnote">圖面依各面長、高與開口尺寸繪製，磁磚格線為示意（由左下角起磚，未表現對縫與切割），以施工圖與現場放樣為準；磁磚太小時圖上只填色、不畫格線。</p></div>`;
}
