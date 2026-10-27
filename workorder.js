"use strict";
/* 點工單／零星機械出工簽認
   流程：現場建立單據 → 填工種／機械與起訖時間 → 下包商代表簽名 → 完成簽認並鎖定 → 存成 PDF／分享文字
   資料：IndexedDB「workorders」，每張單一筆（含兩個手寫簽名圖片） */

const WO_HOURS_PER_DAY = 8;                         // 1 工日 = 8 工時（換算工日用）
// 人力與機械的細項分開；清單裡沒有的可選「其他」自行輸入
const WO_LABOR = ["板模工", "鋼筋工", "水電工", "泥作工", "油漆工", "雜工", "移工"];
const WO_MACHINES = ["吊車", "怪手", "挖土機", "吊卡車", "發電機"];
const woList = kind => (kind === "機械" ? WO_MACHINES : WO_LABOR);
const woRoc = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? String(+m[1] - 1911) + m[2] + m[3] : ""; };
const woMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
const woStamp = iso => { if (!iso) return ""; const d = new Date(iso), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const woBlankLine = (kind = "人力") => ({ kind, name: "", other: false, spec: "", qty: "1", start: "08:00", end: "17:00", brk: "1", price: "", unit: "day" });
// 每個單位的工時 = 結束 − 開始 − 休息（跨午夜自動 +24 小時）
function woUnitHours(l) {
  const s = woMin(l.start), e = woMin(l.end);
  if (s === null || e === null) return 0;
  return Math.max(0, ((e - s + 1440) % 1440) / 60 - (parseFloat(l.brk) || 0));
}
const woLineHours = l => woUnitHours(l) * (parseFloat(l.qty) || 0);
function woTotals(rec) {
  let man = 0, mac = 0;
  for (const l of rec.lines || []) (l.kind === "機械" ? (mac += woLineHours(l)) : (man += woLineHours(l)));
  return { man, mac, days: man / WO_HOURS_PER_DAY };
}
const woH = v => fmt(v, 2);
// 計價：每工（8 工時 = 1 工／1 台班）、每小時、一式；金額四捨五入到元
const WO_UNITS = { "人力": [["day", "每工（8 小時）"], ["hour", "每小時"], ["lump", "一式"]], "機械": [["day", "每台班（8 小時）"], ["hour", "每小時"], ["lump", "一式"]] };
const woUnitLabel = l => (WO_UNITS[l.kind === "機械" ? "機械" : "人力"].find(u => u[0] === (l.unit || "day")) || [])[1] || "";
function woLineAmount(l) {
  const p = parseFloat(l.price); if (!(p > 0)) return 0;
  const h = woLineHours(l), u = l.unit || "day";
  return Math.round(u === "hour" ? p * h : u === "lump" ? p : p * h / WO_HOURS_PER_DAY);
}
const woMoney = v => "$" + Math.round(v).toLocaleString("zh-TW");
const woAmount = rec => (rec.lines || []).reduce((a, l) => a + woLineAmount(l), 0);
const woUnit = l => (l.kind === "機械" ? "台" : "人");

async function woNew() {
  const orders = (await DB.all("workorders")).filter(o => o.siteId === siteId && o.date === today());
  const seq = String(orders.length + 1).padStart(2, "0");
  const rec = { id: uid(), siteId, docNo: `${woRoc(today())}-${seq}`, date: today(), vendor: "", location: "", content: "",
    lines: [woBlankLine()], names: { vendor: "", site: ls.get("woSiteRep", "") }, sigs: {}, status: "draft", signedAt: "", log: [], updated: Date.now() };
  await DB.put("workorders", rec);
  return rec.id;
}

/* ---------- 列表 ---------- */
let woFilter = "all";
async function renderWorkorderList() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const all = (await DB.all("workorders")).filter(o => o.siteId === siteId).sort((a, b) => b.date.localeCompare(a.date) || b.updated - a.updated);
  const list = all.filter(o => woFilter === "all" || (woFilter === "draft" ? o.status !== "signed" : o.status === "signed"));
  const n = f => all.filter(o => f === "all" || (f === "draft" ? o.status !== "signed" : o.status === "signed")).length;
  view.innerHTML = `
    <h2 class="t">點工單／機械出工</h2>
    <div class="row" style="margin-top:0"><button id="woAdd">＋ 新增點工單</button><a class="btnlink" href="#/workorder/summary">📊 月結彙總</a></div>
    <div class="chips">${[["all", "全部"], ["draft", "未簽認"], ["signed", "已簽認"]].map(([k, l]) => `<button class="chip ${k === woFilter ? "on" : ""}" data-f="${k}">${l}（${n(k)}）</button>`).join("")}</div>
    ${list.length ? list.map(o => {
      const t = woTotals(o), names = (o.lines || []).filter(l => l.name).map(l => l.name).slice(0, 3).join("、");
      return `<a class="rec" href="#/workorder/${o.id}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(o.vendor || "（未填廠商）")}</b><span class="st ${o.status === "signed" ? "st-已完成" : "st-填寫中"}">${o.status === "signed" ? "✔ 已簽認" : "未簽認"}</span></div>
        <small>${esc(o.date)}・${esc(o.docNo)}${names ? "・" + esc(names) : ""}<br>${t.man ? `人力 ${woH(t.man)} 工時` : ""}${t.man && t.mac ? "　" : ""}${t.mac ? `機械 ${woH(t.mac)} 台時` : ""}${!t.man && !t.mac ? "尚未填工時" : ""}${woAmount(o) ? "　" + woMoney(woAmount(o)) : ""}${o.location ? "・" + esc(o.location) : ""}</small></a>`;
    }).join("") : `<div class="panel" style="color:var(--mut)">${all.length ? "這個分類沒有單據" : "這個工地還沒有點工單。現場臨時叫吊車、怪手或點工時，按「新增點工單」，收工前請廠商代表當場簽名。"}</div>`}`;
  $("#woAdd").onclick = async () => { location.hash = "#/workorder/" + await woNew(); };
  view.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { woFilter = b.dataset.f; renderWorkorderList(); });
}

/* ---------- 填寫 ---------- */
async function renderWorkorderForm(id) {
  const rec = await DB.get("workorders", id);
  if (!rec) { location.hash = "#/workorder"; return; }
  rec.lines = rec.lines || []; rec.names = rec.names || {}; rec.sigs = rec.sigs || {}; rec.log = rec.log || [];
  const locked = rec.status === "signed";
  const dis = locked ? "disabled" : "";
  const vendors = [...new Set((await DB.all("workorders")).map(o => o.vendor).filter(Boolean))];
  let timer;
  const flush = () => { clearTimeout(timer); rec.updated = Date.now(); return DB.put("workorders", rec); };
  const save = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
  const lineHtml = (l, i) => {
    const mac = l.kind === "機械", list = woList(l.kind), other = l.other || (l.name && !list.includes(l.name));
    return `<div class="panel wol" data-i="${i}">
    <div class="vtop"><select data-k="kind" ${dis}>${["人力", "機械"].map(k => `<option ${l.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select>
      <select data-k="pick" style="flex:1;min-width:0" ${dis}><option value="">${mac ? "選擇機具" : "選擇工種"}</option>${list.map(n => `<option ${!other && l.name === n ? "selected" : ""}>${n}</option>`).join("")}<option value="__other" ${other ? "selected" : ""}>其他</option></select>
      ${locked ? "" : `<button class="danger" data-wdel="${i}" aria-label="刪除此行">✕</button>`}</div>
    ${other ? `<div class="field" style="margin:0 0 8px"><input data-k="name" placeholder="${mac ? "請輸入機具名稱" : "請輸入工種名稱"}" value="${esc(l.name)}" ${dis}></div>` : ""}
    <div class="vdims ${mac ? "c3" : "c2"}">${mac ? `<label>規格／噸位<input data-k="spec" placeholder="例：25T" value="${esc(l.spec)}" ${dis}></label>` : ""}
      <label>數量（${woUnit(l)}）<input data-k="qty" inputmode="decimal" value="${esc(l.qty)}" ${dis}></label>
      <label>休息（時）<input data-k="brk" inputmode="decimal" value="${esc(l.brk)}" ${dis}></label></div>
    <div class="vdims c2" style="margin-top:8px"><label>開始<input type="time" data-k="start" value="${esc(l.start)}" ${dis}></label><label>結束<input type="time" data-k="end" value="${esc(l.end)}" ${dis}></label></div>
    <div class="vres">每${woUnit(l)} <b data-u="${i}">${woH(woUnitHours(l))}</b> 小時　小計：<b data-s="${i}">${woH(woLineHours(l))}</b> ${mac ? "台時" : "工時"}</div>
    <div class="wprice"><div class="vdims c2"><label>單價（元）<input data-k="price" inputmode="decimal" placeholder="可空白" value="${esc(l.price)}"></label>
      <label>計價方式<select data-k="unit">${WO_UNITS[mac ? "機械" : "人力"].map(([k, n]) => `<option value="${k}" ${(l.unit || "day") === k ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
      <div class="vres">金額：<b data-a="${i}">${woLineAmount(l) ? woMoney(woLineAmount(l)) : "—"}</b></div></div></div>`;
  };
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">點工單／機械出工簽認</h2>
    <div style="margin:0 12px;color:var(--mut);font-size:14px">${locked ? `<span style="color:var(--ok);font-weight:700">✔ 已簽認並鎖定</span>・${esc(woStamp(rec.signedAt))}` : "未簽認（可編輯）"}</div>
    <datalist id="woVendors">${vendors.map(v => `<option value="${esc(v)}">`).join("")}</datalist>
    <div class="panel">
      <div class="grid2"><div class="field"><label>日期</label><input type="date" data-f="date" value="${esc(rec.date)}" ${dis}></div><div class="field"><label>單號</label><input data-f="docNo" value="${esc(rec.docNo)}" ${dis}></div></div>
      <div class="field"><label>廠商（下包商／機械行）</label><input data-f="vendor" list="woVendors" placeholder="例：○○吊車行" value="${esc(rec.vendor)}" ${dis}></div>
      <div class="field"><label>施作位置</label><input data-f="location" placeholder="例：B1 東側、3F 外牆" value="${esc(rec.location)}" ${dis}></div>
      <div class="field" style="margin-bottom:0"><label>施作內容／事由</label><textarea data-f="content" rows="2" placeholder="例：吊裝鋼筋、廢料清運" ${dis}>${esc(rec.content)}</textarea></div></div>
    <h2 class="t" style="font-size:17px">出工明細</h2>
    <div id="woLines">${rec.lines.map(lineHtml).join("")}</div>
    ${locked ? "" : `<div class="row"><button class="sec" id="woAddMan">＋ 人力</button><button class="sec" id="woAddMac">＋ 機械</button></div>`}
    <div class="panel" id="woTot"></div>
    ${[["vendor", "廠商代表"], ["site", "我方現場人員"]].map(([k, l]) => `
      <div class="panel"><div class="field" style="margin-bottom:6px"><label>${l}姓名</label><input data-n="${k}" value="${esc(rec.names[k])}" ${dis}></div>
      <div class="sigbox" style="margin:0"><div class="bar"><b>${l}簽名</b>${locked ? "" : `<button class="sec" data-clear="${k}">清除</button>`}</div>
      ${locked ? (rec.sigs[k] ? `<img src="${rec.sigs[k]}" style="width:100%;height:140px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:12px">` : `<div class="panel" style="color:var(--mut)">未簽名</div>`) : `<canvas data-sig="${k}"></canvas>`}</div></div>`).join("")}
    <div class="row">${locked ? `<button class="danger" id="woUnlock">🔓 解除鎖定</button>` : `<button id="woLock">✔ 完成簽認並鎖定</button>`}</div>
    <div class="row"><button class="sec" id="woPreview">👁 預覽／存成 PDF</button><button class="sec" id="woShare">📤 分享文字摘要</button></div>
    ${rec.log.length ? `<div class="panel"><small style="color:var(--mut)">異動紀錄<br>${rec.log.map(x => `${esc(woStamp(x.at))}　${esc(x.text)}`).join("<br>")}</small></div>` : ""}
    <div class="row"><button class="danger" id="woDel">刪除這張點工單</button></div>`;

  const refresh = () => {
    rec.lines.forEach((l, i) => { const u = $(`[data-u="${i}"]`), s = $(`[data-s="${i}"]`), a = $(`[data-a="${i}"]`); if (u) u.textContent = woH(woUnitHours(l)); if (s) s.textContent = woH(woLineHours(l)); if (a) a.textContent = woLineAmount(l) ? woMoney(woLineAmount(l)) : "—"; });
    const t = woTotals(rec), amt = woAmount(rec);
    $("#woTot").innerHTML = `<div class="big"><span>人力合計</span><b>${woH(t.man)} 工時（${fmt(t.days, 2)} 工日）</b></div><div class="big"><span>機械合計</span><b>${woH(t.mac)} 台時</b></div>
      ${amt ? `<div class="big"><span>金額合計（未稅）</span><b>${woMoney(amt)}</b></div>` : ""}
      <p class="cnote">工時 = 結束 − 開始 − 休息，再乘以數量；1 工（1 台班）以 ${WO_HOURS_PER_DAY} 工時換算。<br>單價不在簽認範圍內，簽認鎖定後仍可補填（會留下異動紀錄）。</p>`;
  };
  refresh();
  let priceLogged = false;
  $("#woLines").oninput = $("#woLines").onchange = async e => {
    const k = e.target.dataset.k, i = e.target.closest(".wol")?.dataset.i; if (!k) return;
    const l = rec.lines[+i], priceKey = k === "price" || k === "unit";
    if (locked && !priceKey) return;                       // 簽認後只有單價與計價方式可補填
    if (k === "kind") { l.kind = e.target.value; l.name = ""; l.other = false; l.spec = ""; l.unit = "day"; flush().then(() => renderWorkorderForm(id)); return; }   // 換類別：細項與規格清空
    if (k === "pick") {
      if (e.target.value === "__other") { l.other = true; l.name = ""; } else {
        l.other = false; l.name = e.target.value;
        if (!(parseFloat(l.price) > 0) && l.name) {          // 帶入同廠商同工種上次的單價
          const prev = (await DB.all("workorders")).filter(o => o.id !== rec.id && o.vendor && o.vendor === rec.vendor).sort((a, b) => b.updated - a.updated)
            .flatMap(o => o.lines || []).find(x => x.kind === l.kind && x.name === l.name && parseFloat(x.price) > 0);
          if (prev) { l.price = prev.price; l.unit = prev.unit || "day"; }
        }
      }
      flush().then(() => renderWorkorderForm(id)); return;
    }
    l[k] = e.target.value;
    if (locked && priceKey && !priceLogged) { priceLogged = true; rec.log.push({ at: new Date().toISOString(), text: "簽認後修改單價／計價方式" }); }
    refresh(); save();
  };
  if (!locked) {
    view.querySelectorAll("[data-f]").forEach(el => el.oninput = el.onchange = () => { rec[el.dataset.f] = el.value; save(); });
    view.querySelectorAll("[data-n]").forEach(el => el.oninput = () => { rec.names[el.dataset.n] = el.value; if (el.dataset.n === "site") ls.set("woSiteRep", el.value); save(); });
    $("#woLines").onclick = e => { const d = e.target.dataset.wdel; if (d === undefined) return; rec.lines.splice(+d, 1); flush().then(() => renderWorkorderForm(id)); };
    const add = kind => () => { rec.lines.push(woBlankLine(kind)); flush().then(() => renderWorkorderForm(id)); };
    $("#woAddMan").onclick = add("人力"); $("#woAddMac").onclick = add("機械");
    view.querySelectorAll("canvas").forEach(c => setupSig(c, rec, save));
    view.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => {
      const c = $(`canvas[data-sig=${b.dataset.clear}]`); c.getContext("2d").clearRect(0, 0, c.width, c.height); delete rec.sigs[b.dataset.clear]; save();
    });
    $("#woLock").onclick = async () => {
      const t = woTotals(rec), miss = [];
      if (!rec.vendor.trim()) miss.push("廠商");
      if (!rec.lines.some(l => l.name.trim() && woLineHours(l) > 0)) miss.push("出工明細（名稱與工時）");
      if (!rec.names.vendor?.trim()) miss.push("廠商代表姓名");
      if (!rec.sigs.vendor) miss.push("廠商代表簽名");
      if (miss.length) { alert("還缺少：" + miss.join("、")); return; }
      if (!confirm(`確定簽認並鎖定？\n廠商：${rec.vendor}\n人力 ${woH(t.man)} 工時／機械 ${woH(t.mac)} 台時\n鎖定後不能直接修改。`)) return;
      rec.status = "signed"; rec.signedAt = new Date().toISOString(); rec.log.push({ at: rec.signedAt, text: "完成簽認並鎖定" });
      await flush(); renderWorkorderForm(id);
    };
  } else {
    $("#woUnlock").onclick = async () => {
      if (!confirm("解除鎖定後可以修改，原簽名仍保留，且會留下異動紀錄。確定解除？")) return;
      rec.status = "draft"; rec.log.push({ at: new Date().toISOString(), text: "解除鎖定" }); await flush(); renderWorkorderForm(id);
    };
  }
  $("#woPreview").onclick = async () => { await flush(); location.hash = "#/workorder/" + id + "/preview"; };
  $("#woShare").onclick = async () => {
    const text = woSummaryText(rec);
    try { if (navigator.share) { await navigator.share({ title: "點工單 " + rec.docNo, text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); alert("已複製摘要，可貼到 LINE 或訊息。"); } catch { prompt("請複製以下摘要", text); }
  };
  $("#woDel").onclick = async () => {
    if (locked) { alert("已簽認的單據不能直接刪除，請先解除鎖定。"); return; }
    if (!confirm("確定刪除這張點工單？")) return;
    await DB.del("workorders", id); location.hash = "#/workorder";
  };
}

function woSummaryText(rec) {
  const site = sites.find(s => s.id === rec.siteId), t = woTotals(rec);
  return [`【點工單】${rec.docNo}`, `工程：${site?.name || ""}`, `日期：${rec.date}`, `廠商：${rec.vendor}`, rec.location && `位置：${rec.location}`, rec.content && `內容：${rec.content}`,
    ...rec.lines.filter(l => l.name).map(l => `・${l.name}${l.spec ? "（" + l.spec + "）" : ""} ×${l.qty}${woUnit(l)}　${l.start}–${l.end}（休${l.brk || 0}h）＝${woH(woLineHours(l))} ${l.kind === "機械" ? "台時" : "工時"}`),
    `合計：人力 ${woH(t.man)} 工時（${fmt(t.days, 2)} 工日）／機械 ${woH(t.mac)} 台時`,
    rec.status === "signed" ? `簽認：${rec.names.vendor || "廠商代表"}　${woStamp(rec.signedAt)}` : "（尚未簽認）"].filter(Boolean).join("\n");
}

/* ---------- 預覽／列印 ---------- */
async function renderWorkorderPreview(id) {
  const rec = await DB.get("workorders", id);
  if (!rec) { location.hash = "#/workorder"; return; }
  const site = sites.find(s => s.id === rec.siteId), company = ls.get("company", ""), t = woTotals(rec), signed = rec.status === "signed";
  const showPrice = ls.get("woShowPrice", "") === "1", amt = woAmount(rec), cols = showPrice ? 10 : 8;
  const d = rec.date ? rec.date.replace(/^(\d+)-(\d+)-(\d+)$/, "$1 年 $2 月 $3 日") : "";
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <label class="noprint" style="display:flex;gap:8px;align-items:center;margin:0 12px 8px;font-size:15px"><input type="checkbox" id="pvPrice" style="width:22px;height:22px" ${showPrice ? "checked" : ""}> 顯示單價與金額（預設不印，因單價不在簽認範圍）</label>
    <div class="paper">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}
      <div class="ptitle">點工單／機械出工簽認單</div>
      <div class="pno">單號：<span>${esc(rec.docNo)}</span></div>
      <table class="pt">
        <tr><th>工程名稱</th><td colspan="3">${esc(site?.name)}</td></tr>
        <tr><th>廠商</th><td>${esc(rec.vendor)}</td><th>日期</th><td>${esc(d)}</td></tr>
        <tr><th>施作位置</th><td colspan="3">${esc(rec.location)}</td></tr>
        <tr><th>施作內容</th><td colspan="3">${esc(rec.content).replace(/\n/g, "<br>")}</td></tr>
      </table>
      <table class="pt items sm">
        <tr><th>類別</th><th>工種／機具</th><th>規格</th><th>數量</th><th>起訖</th><th>休息</th><th>工時<br>／單位</th><th>小計</th>${showPrice ? "<th>單價</th><th>金額</th>" : ""}</tr>
        ${rec.lines.filter(l => l.name || woLineHours(l)).map(l => `<tr><td class="c">${l.kind}</td><td>${esc(l.name)}</td><td>${esc(l.spec)}</td><td class="c">${esc(l.qty)}${woUnit(l)}</td><td class="c nw">${esc(l.start)}–${esc(l.end)}</td><td class="c">${esc(l.brk || 0)}h</td><td class="c">${woH(woUnitHours(l))}</td><td class="c">${woH(woLineHours(l))}</td>${showPrice ? `<td class="c nw">${parseFloat(l.price) > 0 ? esc(l.price) + "<br><small>" + esc(woUnitLabel(l).replace(/（.*）/, "")) + "</small>" : ""}</td><td class="c nw">${woLineAmount(l) ? woMoney(woLineAmount(l)) : ""}</td>` : ""}</tr>`).join("")}
        <tr><td colspan="${cols}" class="recheck">合計：人力 <b>${woH(t.man)}</b> 工時（${fmt(t.days, 2)} 工日，以 ${WO_HOURS_PER_DAY} 工時／工日換算）　機械 <b>${woH(t.mac)}</b> 台時${showPrice && amt ? `<br>金額合計（未稅）：<b>${woMoney(amt)}</b>` : ""}</td></tr>
      </table>
      <div class="psigs">${[["vendor", "廠商代表"], ["site", "我方現場人員"]].map(([k, l]) => `<div>${rec.sigs[k] ? `<img src="${rec.sigs[k]}">` : "<br><br>"}${l}${rec.names[k] ? "：" + esc(rec.names[k]) : ""}</div>`).join("")}</div>
      <p style="margin-top:6mm;font-size:12px">${signed ? `簽認時間：${esc(woStamp(rec.signedAt))}（手機電子簽認，簽認後鎖定）` : "※ 尚未完成簽認"}</p>
    </div>`;
  $("#pvBack").onclick = () => location.hash = "#/workorder/" + id;
  $("#pvPrice").onchange = e => { ls.set("woShowPrice", e.target.checked ? "1" : ""); renderWorkorderPreview(id); };
  $("#pvPrint").onclick = () => window.print();
}

/* ---------- 月結彙總 ---------- */
let woMonth = "", woVendor = "";
async function renderWorkorderSummary() {
  if (!siteId) { location.hash = "#/workorder"; return; }
  if (!woMonth) woMonth = today().slice(0, 7);
  const all = (await DB.all("workorders")).filter(o => o.siteId === siteId && o.date.startsWith(woMonth)).sort((a, b) => a.date.localeCompare(b.date) || a.docNo.localeCompare(b.docNo));
  const vendors = [...new Set(all.map(o => o.vendor || "（未填廠商）"))];
  if (woVendor && !vendors.includes(woVendor)) woVendor = "";
  const list = all.filter(o => !woVendor || (o.vendor || "（未填廠商）") === woVendor);
  const groups = {};
  list.forEach(o => (groups[o.vendor || "（未填廠商）"] = groups[o.vendor || "（未填廠商）"] || []).push(o));
  const unsigned = list.filter(o => o.status !== "signed").length, site = sites.find(s => s.id === siteId);
  const tax = ls.get("woTax", "") === "1", grand = { amt: 0 };
  view.innerHTML = `
    <div class="noprint"><h2 class="t">月結彙總</h2>
      <div class="panel"><div class="grid2"><div class="field"><label>月份</label><input type="month" id="sMonth" value="${esc(woMonth)}"></div>
        <div class="field"><label>廠商</label><select id="sVendor"><option value="">全部</option>${vendors.map(v => `<option ${v === woVendor ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></div></div>
        <label style="display:flex;gap:8px;align-items:center;font-size:15px;margin:2px 0 10px"><input type="checkbox" id="sTax" style="width:22px;height:22px" ${tax ? "checked" : ""}> 加計營業稅 5%（金額以未稅單價計）</label>
        ${unsigned ? `<div class="legend" style="margin:0">⚠ 這個月有 <b>${unsigned}</b> 張點工單尚未簽認，請先補簽再請款。</div>` : ""}</div>
      <div class="row"><button id="sPrint">🖨 列印／存成 PDF</button><button class="sec" id="sCsv">⬇ 下載 CSV</button></div></div>
    <div class="paper">
      ${ls.get("company", "") ? `<div class="pcomp">${esc(ls.get("company", ""))}</div>` : ""}
      <div class="ptitle">點工單月結彙總（${esc(woMonth)}）</div>
      <div style="margin:2mm 0 4mm;font-size:13px">工程：${esc(site?.name)}${woVendor ? "　廠商：" + esc(woVendor) : ""}</div>
      ${list.length ? Object.entries(groups).map(([v, os]) => {
        const tt = os.reduce((x, o) => { const t = woTotals(o); x.man += t.man; x.mac += t.mac; x.amt += woAmount(o); return x; }, { man: 0, mac: 0, amt: 0 });
        grand.amt += tt.amt;
        const cs = (o) => esc([o.location, o.content].filter(Boolean).join("：") || o.lines.filter(l => l.name).map(l => l.name).join("、"));
        return `<div style="font-weight:700;margin:4mm 0 1mm">${esc(v)}</div><table class="pt items sm"><tr><th>日期<br>單號</th><th>位置／內容</th><th>人力<br>工時</th><th>機械<br>台時</th><th>金額</th><th>簽認</th></tr>
          ${os.map(o => { const t = woTotals(o), am = woAmount(o); return `<tr><td class="c nw">${esc(o.date.slice(5))}<br><small>${esc(o.docNo)}</small></td><td>${cs(o)}</td><td class="c">${woH(t.man)}</td><td class="c">${woH(t.mac)}</td><td class="c nw">${am ? woMoney(am) : "—"}</td><td class="c nw" style="${o.status === "signed" ? "" : "color:#c0392b"}">${o.status === "signed" ? "✔" : "未簽"}</td></tr>`; }).join("")}
          <tr><td colspan="2" class="c"><b>小計（${os.length} 張）</b><br><small>${fmt(tt.man / WO_HOURS_PER_DAY, 2)} 工日</small></td><td class="c"><b>${woH(tt.man)}</b></td><td class="c"><b>${woH(tt.mac)}</b></td><td class="c nw"><b>${tt.amt ? woMoney(tt.amt) : "—"}</b></td><td></td></tr>
          ${tt.amt && tax ? `<tr><td colspan="4" class="c">營業稅 5%</td><td class="c nw">${woMoney(tt.amt * 0.05)}</td><td></td></tr><tr><td colspan="4" class="c"><b>含稅合計</b></td><td class="c nw"><b>${woMoney(tt.amt + Math.round(tt.amt * 0.05))}</b></td><td></td></tr>` : ""}</table>`;
      }).join("") + (Object.keys(groups).length > 1 && grand.amt ? `<div style="margin-top:5mm;text-align:right;font-size:14px"><b>全部廠商合計（未稅）：${woMoney(grand.amt)}${tax ? `　含稅：${woMoney(grand.amt + Object.values(groups).reduce((x, os) => x + Math.round(os.reduce((y, o) => y + woAmount(o), 0) * 0.05), 0))}` : ""}</b></div>` : "") : `<p style="color:var(--mut)">這個月沒有點工單。</p>`}
    </div>`;
  $("#sMonth").onchange = e => { woMonth = e.target.value || woMonth; renderWorkorderSummary(); };
  $("#sVendor").onchange = e => { woVendor = e.target.value; renderWorkorderSummary(); };
  $("#sTax").onchange = e => { ls.set("woTax", e.target.checked ? "1" : ""); renderWorkorderSummary(); };
  $("#sPrint").onclick = () => window.print();
  $("#sCsv").onclick = () => {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["日期", "單號", "廠商", "位置", "內容", "類別", "工種／機具", "規格", "數量", "開始", "結束", "休息(h)", "每單位工時", "小計工時", "計價方式", "單價", "金額", "簽認狀態", "簽認時間"]];
    list.forEach(o => (o.lines.length ? o.lines : [{}]).forEach(l => rows.push([o.date, o.docNo, o.vendor, o.location, o.content, l.kind, l.name, l.spec, l.qty, l.start, l.end, l.brk, l.kind ? woH(woUnitHours(l)) : "", l.kind ? woH(woLineHours(l)) : "", l.kind ? woUnitLabel(l) : "", l.price ?? "", l.kind ? woLineAmount(l) : "", o.status === "signed" ? "已簽認" : "未簽認", woStamp(o.signedAt)])));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `點工單_${woMonth}${woVendor ? "_" + woVendor : ""}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
}

function renderWorkorder(a, preview) {
  if (!a) return renderWorkorderList();
  if (a === "summary") return renderWorkorderSummary();
  return preview ? renderWorkorderPreview(a) : renderWorkorderForm(a);
}
