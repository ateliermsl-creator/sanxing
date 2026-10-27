"use strict";
/* 缺失改善追蹤（Punch List／初複驗）
   流程：現場登記（位置＋缺失＋照片）→ 辦公室分派工班與期限 → 工班改善後回報 → 複驗合格結案／不合格退回
   資料：IndexedDB「punch」；照片存在「photos」（recId = 缺失 id；itemIdx 0 = 缺失照片、1 = 改善後照片） */

const PUNCH_STATUS = { open: "待改善", fixed: "待複驗", closed: "已結案" };
const PUNCH_TRADES = ["鋼筋工", "板模工", "泥作工", "水電工", "油漆工", "防水工", "門窗工", "機電", "雜工"];
const pDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);      // b − a（天）
const pOver = it => it.status !== "closed" && !!it.due && it.due < today();
const pLate = it => pDays(it.due, today());
const pAddDays = n => { const d = new Date(); d.setDate(d.getDate() + n); const p = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const pStamp = iso => woStamp(iso);
const pRoc = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? `${+m[1] - 1911}/${m[2]}/${m[3]}` : "—"; };   // 民國年：115/10/30

function pNew(base = {}) {
  const it = { id: uid(), siteId, no: "", location: "", desc: "", trade: "", due: "", foundDate: today(), foundBy: ls.get("punchBy", ""),
    status: "open", fixedAt: "", fixedNote: "", closedAt: "", closedBy: "", rejects: 0, thumb: "", log: [], created: Date.now(), updated: Date.now(), ...base };
  return it;
}
async function pNextNo() {
  const n = (await DB.all("punch")).filter(x => x.siteId === siteId && x.foundDate === today()).length + 1;
  return `${woRoc(today())}-${String(n).padStart(2, "0")}`;
}
const pThumb = data => new Promise(res => {
  const im = new Image();
  im.onload = () => { const k = 96 / Math.max(im.width, im.height), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.6)); };
  im.onerror = () => res(""); im.src = data;
});
const pPhotosOf = async id => (await DB.all("photos")).filter(p => p.recId === id).sort((a, b) => a.created - b.created);
const pTrades = async () => [...new Set([...PUNCH_TRADES, ...(await DB.all("punch")).map(x => x.trade).filter(Boolean), ...(await DB.all("workorders")).map(x => x.vendor).filter(Boolean)])];

/* ---------- 列表 ---------- */
let pFilter = "act", pTradeFilter = "", pQuery = "", pBulk = false;
const pPicked = new Set();
async function renderPunch(a) {
  if (a === "report") return renderPunchReport();
  if (a === "summary") return renderPunchSummary();
  if (a) return renderPunchForm(a);
  return renderPunchList();
}
async function renderPunchList() {
  const seq = renderPunchList.seq = (renderPunchList.seq || 0) + 1;      // 連續操作時，只採用最新一次的結果
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  // 清掉按了「新增」卻沒填任何內容的空白缺失
  // 「沿用位置再新增」後位置沒改、也沒填內容或照片的，也視為空白
  for (const x of (await DB.all("punch")).filter(x => x.siteId === siteId && !x.desc.trim() && !x.thumb && !x.fixedNote && (!x.location.trim() || (x.seedLoc !== undefined && x.location === x.seedLoc)))) await DB.del("punch", x.id);
  const all = (await DB.all("punch")).filter(x => x.siteId === siteId);
  const cnt = { act: all.filter(x => x.status !== "closed").length, open: all.filter(x => x.status === "open").length, fixed: all.filter(x => x.status === "fixed").length, over: all.filter(pOver).length, closed: all.filter(x => x.status === "closed").length, all: all.length };
  if (seq !== renderPunchList.seq) return;
  const trades = [...new Set(all.map(x => x.trade).filter(Boolean))];
  if (pTradeFilter && pTradeFilter !== "__none" && !trades.includes(pTradeFilter)) pTradeFilter = "";   // 記著的工班已不存在，就清掉（否則選單顯示「全部」、列表卻是空的）
  const q = pQuery.trim();
  let list = all.filter(x => ({ act: x.status !== "closed", open: x.status === "open", fixed: x.status === "fixed", over: pOver(x), closed: x.status === "closed", all: true })[pFilter]
    && (!pTradeFilter || (pTradeFilter === "__none" ? !x.trade : x.trade === pTradeFilter)) && (!q || (x.location + x.desc + x.trade + x.no).includes(q)));
  list.sort((x, y) => pFilter === "closed" ? (y.closedAt || "").localeCompare(x.closedAt || "") : (pOver(y) - pOver(x)) || (x.due || "9999").localeCompare(y.due || "9999") || x.created - y.created);
  const chips = [["act", "未結案"], ["open", "待改善"], ["fixed", "待複驗"], ["over", "逾期"], ["closed", "已結案"], ["all", "全部"]];
  view.innerHTML = `
    <h2 class="t">缺失改善追蹤</h2>
    <div class="row" style="margin-top:0"><button id="pAdd">＋ 新增缺失</button><a class="btnlink" href="#/punch/report">📄 工班通知單</a></div>
    <div class="row" style="margin-top:0"><a class="btnlink" href="#/punch/summary">📊 改善總表（統計與明細）</a></div>
    <div class="chips">${chips.map(([k, l]) => `<button class="chip ${k === pFilter ? "on" : ""}" data-pf="${k}">${l}（${cnt[k]}）</button>`).join("")}</div>
    <div class="panel" style="padding:10px 12px"><div class="grid2" style="gap:0 8px">
      <div class="field" style="margin:0"><input id="pQ" placeholder="搜尋位置／內容" value="${esc(pQuery)}"></div>
      <div class="field" style="margin:0"><select id="pT"><option value="">全部工班</option><option value="__none" ${pTradeFilter === "__none" ? "selected" : ""}>未指定工班</option>${trades.map(t => `<option ${t === pTradeFilter ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><small style="color:var(--mut)">共 ${list.length} 筆</small><button class="sec" id="pBulkBtn" style="min-height:38px;font-size:14px">${pBulk ? "完成選取" : "☑ 批次指定工班／期限"}</button></div></div>
    ${pBulk ? `<div class="legend" style="margin-top:0">已選 <b id="pCnt">${pPicked.size}</b> 項　<button class="sec" id="pAll" style="min-height:36px;font-size:14px;padding:0 10px">全選</button> <button id="pAssign" style="min-height:36px;font-size:14px;padding:0 12px">指定工班／期限</button></div>` : ""}
    <div id="pList">${list.length ? list.map(x => `<div class="rec pitem" data-id="${x.id}" role="button">
      ${pBulk ? `<input type="checkbox" class="pchk" data-pick="${x.id}" ${pPicked.has(x.id) ? "checked" : ""}>` : ""}
      ${x.thumb ? `<img class="pth" src="${x.thumb}" alt="">` : `<div class="pth ph0">📷</div>`}
      <div class="pbody"><div class="ptop"><b>${esc(x.location || "（未填位置）")}</b><span class="st st-${x.status === "closed" ? "已完成" : x.status === "fixed" ? "填寫中" : "未填"}" style="${x.status === "open" ? "color:#c0392b" : ""}">${PUNCH_STATUS[x.status]}</span></div>
        <div class="pdesc">${esc(x.desc || "（未填缺失內容）")}</div>
        <small>${x.trade ? "👷 " + esc(x.trade) : `<span class="late">未指定工班</span>`}・期限 ${x.due ? pRoc(x.due) : "未設"}${pOver(x) ? `<span class="late">　逾期 ${pLate(x)} 天</span>` : ""}${x.rejects ? `　↩${x.rejects}` : ""}</small>
        ${pBulk ? "" : x.status === "open" ? `<div class="pact"><button data-pact="fix">✔ 回報改善</button></div>` : x.status === "fixed" ? `<div class="pact"><button data-pact="pass">✅ 結案</button><button class="danger" data-pact="reject">↩ 退回</button></div>` : ""}</div></div>`).join("")
      : `<div class="panel" style="color:var(--mut)">${all.length ? `這個條件下沒有缺失。<br><small>目前篩選：${esc(chips.find(c => c[0] === pFilter)?.[1])}${pTradeFilter ? "、工班＝" + esc(pTradeFilter === "__none" ? "未指定" : pTradeFilter) : ""}${q ? "、搜尋「" + esc(q) + "」" : ""}</small><br><button class="sec" id="pClear" style="margin-top:8px;min-height:40px">清除篩選，顯示全部</button>` : "還沒有缺失紀錄。到現場按「新增缺失」，記下位置、拍照、寫缺失內容，沒有網路也能用。"}</div>`}</div>`;
  $("#pAdd").onclick = async () => { const it = pNew({ no: await pNextNo() }); await DB.put("punch", it); location.hash = "#/punch/" + it.id; };
  view.querySelectorAll("[data-pf]").forEach(b => b.onclick = () => { pFilter = b.dataset.pf; renderPunchList(); });
  $("#pClear")?.addEventListener("click", () => { pFilter = "all"; pTradeFilter = ""; pQuery = ""; renderPunchList(); });
  $("#pQ").oninput = e => { pQuery = e.target.value; clearTimeout(renderPunchList.t); renderPunchList.t = setTimeout(async () => { await renderPunchList(); const el = $("#pQ"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 350); };
  $("#pT").onchange = e => { pTradeFilter = e.target.value; renderPunchList(); };
  $("#pBulkBtn").onclick = () => { pBulk = !pBulk; pPicked.clear(); renderPunchList(); };
  $("#pList").onclick = async e => {
    const act = e.target.closest("[data-pact]");
    if (act) { await pQuickAction(act.dataset.pact, act.closest(".pitem").dataset.id); return; }       // 快捷按鈕：不進入單筆畫面
    const row = e.target.closest(".pitem"); if (!row) return;
    if (pBulk) { const id = row.dataset.id, box = row.querySelector(".pchk"); if (e.target !== box) box.checked = !box.checked; box.checked ? pPicked.add(id) : pPicked.delete(id); $("#pCnt").textContent = pPicked.size; return; }
    location.hash = "#/punch/" + row.dataset.id;
  };
  if (pBulk) {
    $("#pAll").onclick = () => { list.forEach(x => pPicked.add(x.id)); renderPunchList(); };
    $("#pAssign").onclick = async () => {
      if (!pPicked.size) { alert("請先勾選要指定的缺失"); return; }
      const all2 = await pTrades(), dlg = document.createElement("dialog");
      dlg.innerHTML = `<h2 style="margin:0 0 10px;font-size:19px">指定 ${pPicked.size} 筆缺失</h2>
        <div class="field" style="margin:0 0 10px"><label>責任工班／廠商（空白＝不變更）</label><input id="bTrade" list="bTrades" placeholder="例：泥作工"><datalist id="bTrades">${all2.map(t => `<option value="${esc(t)}">`).join("")}</datalist></div>
        <div class="field" style="margin:0 0 6px"><label>改善期限（空白＝不變更）</label><input type="date" id="bDue"></div>
        <div class="chips" style="margin:0 0 12px"><button class="chip" data-d="3">+3 天</button><button class="chip" data-d="7">+7 天</button><button class="chip" data-d="14">+14 天</button></div>
        <button class="full" id="bOk">確定</button><button class="sec full" id="bNo" style="margin-top:8px">取消</button>`;
      document.body.append(dlg); dlg.showModal();
      dlg.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { $("#bDue").value = pAddDays(+b.dataset.d); });
      $("#bNo").onclick = () => dlg.remove();
      $("#bOk").onclick = async () => {
        const tr = $("#bTrade").value.trim(), du = $("#bDue").value;
        for (const id of pPicked) { const x = await DB.get("punch", id); if (!x) continue; if (tr) x.trade = tr; if (du) x.due = du; if (tr || du) { x.log.push({ at: new Date().toISOString(), text: `指定${tr ? "工班：" + tr : ""}${tr && du ? "、" : ""}${du ? "期限：" + pRoc(du) : ""}` }); x.updated = Date.now(); await DB.put("punch", x); } }
        dlg.remove(); pPicked.clear(); pBulk = false; renderPunchList();
      };
    };
  }
}

/* ---------- 清單上的快捷動作：回報改善／結案／退回 ---------- */
async function pAttachPhoto(it, slot, file) {
  const site = sites.find(s => s.id === it.siteId);
  const p = { id: uid(), recId: it.id, itemIdx: slot, data: await makePhoto(file, `${slot === 0 ? it.foundDate || today() : today()} ${site?.name || ""}`.trim()), created: Date.now() };
  await DB.put("photos", p); return p;
}
async function pSave(it) { it.updated = Date.now(); await DB.put("punch", it); }
async function pQuickAction(kind, id) {
  const it = await DB.get("punch", id); if (!it) return;
  it.log = it.log || [];
  const log = text => it.log.push({ at: new Date().toISOString(), text });
  if (kind === "fix") { pFixSheet(it, async () => { await renderPunchList(); }); return; }
  if (kind === "pass") {
    const by = prompt("複驗人員姓名", ls.get("punchBy", "")); if (by === null) return;
    it.status = "closed"; it.closedAt = today(); it.closedBy = by.trim(); if (by.trim()) ls.set("punchBy", by.trim()); log(`複驗合格・結案（${by.trim() || "未填"}）`);
  } else if (kind === "reject") {
    const why = prompt("複驗不合格的原因（可空白）", ""); if (why === null) return;
    it.status = "open"; it.rejects = (it.rejects || 0) + 1; it.fixedAt = ""; log("複驗不合格・退回" + (why.trim() ? "：" + why.trim() : ""));
  }
  await pSave(it); renderPunchList();
}
// 回報改善：寫改善說明、拍改善後照片。用自訂的底部面板（不用 dialog，才不會蓋住拍照畫面）
async function pFixSheet(it, done) {
  const box = document.createElement("div"); box.className = "psheet";
  let have = (await pPhotosOf(it.id)).filter(p => p.itemIdx === 1).length;
  box.innerHTML = `<div class="psheet-in"><h2 style="margin:0 0 4px;font-size:19px">回報已改善</h2>
    <div style="color:var(--mut);font-size:14px">${esc(it.location || it.no)}｜${esc(it.desc)}</div>
    <div class="field" style="margin:12px 0"><label>改善說明（可空白）</label><input id="sfNote" placeholder="例：已打磨修補" value="${esc(it.fixedNote)}"></div>
    <div class="phrow"><button type="button" class="phbtn" id="sfCam">📷 拍改善後照片</button><label class="phbtn alt">🖼 相簿<input type="file" accept="image/*" multiple hidden id="sfFile"></label></div>
    <div id="sfCnt" style="font-size:14px;color:var(--mut);margin-top:6px"></div>
    <button class="full" id="sfOk" style="margin-top:14px">✔ 確定回報（改為待複驗）</button><button class="sec full" id="sfNo" style="margin-top:8px">取消</button></div>`;
  document.body.append(box);
  const cnt = () => { box.querySelector("#sfCnt").textContent = have ? `已有 ${have} 張改善後照片` : "還沒有改善後照片（可不拍）"; };
  cnt();
  const add = async f => { try { await pAttachPhoto(it, 1, f); have++; cnt(); } catch { alert("這張照片無法讀取，請重新拍攝"); } };
  box.querySelector("#sfCam").onclick = () => openCamera(`改善後照片：${it.location || it.no}`, blob => add(blob), async files => { for (const f of files) await add(f); });
  box.querySelector("#sfFile").onchange = async e => { const fs = [...e.target.files]; e.target.value = ""; for (const f of fs) await add(f); };
  box.querySelector("#sfNo").onclick = () => box.remove();
  box.querySelector("#sfOk").onclick = async () => {
    it.fixedNote = box.querySelector("#sfNote").value.trim(); it.status = "fixed"; it.fixedAt = today();
    it.log.push({ at: new Date().toISOString(), text: "回報已改善" + (it.fixedNote ? "：" + it.fixedNote : "") });
    await pSave(it); box.remove(); await done();
  };
}

/* ---------- 單筆缺失 ---------- */
async function renderPunchForm(id) {
  const it = await DB.get("punch", id);
  if (!it) { goReplace("#/punch"); return; }
  it.log = it.log || [];
  const site = sites.find(s => s.id === it.siteId);
  let photos = await pPhotosOf(it.id), timer;
  const mark = t => { const el = $("#pSaved"); if (el) el.textContent = t; };
  const flush = async () => { clearTimeout(timer); it.updated = Date.now(); await DB.put("punch", it); mark(`✓ 已暫存 ${new Date().toTimeString().slice(0, 5)}`); };
  const save = () => { clearTimeout(timer); mark("儲存中…"); timer = setTimeout(flush, 300); };
  const trades = await pTrades(), locs = [...new Set((await DB.all("punch")).filter(x => x.siteId === it.siteId).map(x => x.location).filter(Boolean))];
  const photoBlock = (slot, label) => `<div class="panel"><b>${label}</b><div class="phrow"><button type="button" class="phbtn" data-pcam="${slot}">📷 拍照</button><label class="phbtn alt">🖼 相簿<input type="file" accept="image/*" multiple hidden data-pfile="${slot}"></label><div class="thumbs" data-pth="${slot}"></div></div></div>`;
  const badge = `<span class="st st-${it.status === "closed" ? "已完成" : it.status === "fixed" ? "填寫中" : "未填"}" style="${it.status === "open" ? "color:#c0392b" : ""};font-size:15px">${PUNCH_STATUS[it.status]}</span>`;
  const hasAfter = photos.some(p => p.itemIdx === 1), open = it.status === "open";
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">缺失 <small style="color:var(--mut);font-weight:400">${esc(it.no)}</small> ${badge}</h2>
    <div id="pSaved" class="saved">✓ 內容會自動暫存，不需要另外按儲存</div>
    ${pOver(it) ? `<div class="legend" style="color:#c0392b">⚠ 已逾期 ${pLate(it)} 天（期限 ${pRoc(it.due)}）</div>` : ""}
    <div class="panel">
      <div class="field"><label>位置（樓層／區域／軸線）</label><input data-f="location" list="pLocs" placeholder="例：3F A~C 軸 北側牆" value="${esc(it.location)}"><datalist id="pLocs">${locs.map(l => `<option value="${esc(l)}">`).join("")}</datalist></div>
      <div class="field" style="margin-bottom:0"><label>缺失內容</label><textarea data-f="desc" rows="3" placeholder="例：蜂窩、露筋、牆面不平整">${esc(it.desc)}</textarea></div></div>
    ${photoBlock(0, "缺失照片")}
    <div class="panel"><b>指派</b> <small style="color:var(--mut)">現場可先空白，回辦公室再批次指定</small>
      <div class="field" style="margin-top:8px"><label>責任工班／廠商</label><input data-f="trade" list="pTrades" placeholder="例：泥作工" value="${esc(it.trade)}"><datalist id="pTrades">${trades.map(t => `<option value="${esc(t)}">`).join("")}</datalist></div>
      <div class="field" style="margin-bottom:6px"><label>改善期限</label><input type="date" data-f="due" value="${esc(it.due)}"></div>
      <div class="chips" style="margin:0"><button class="chip" data-d="3">+3 天</button><button class="chip" data-d="7">+7 天</button><button class="chip" data-d="14">+14 天</button></div>
      <details style="margin-top:8px"><summary>登記日期與登記人</summary><div class="grid2" style="margin-top:6px"><div class="field" style="margin:0"><label>登記日期</label><input type="date" data-f="foundDate" value="${esc(it.foundDate)}"></div><div class="field" style="margin:0"><label>登記人</label><input data-f="foundBy" value="${esc(it.foundBy)}"></div></div></details></div>
    <div class="row"><button id="pDone">${open ? "✔ 完成登記" : "← 回列表"}</button></div>
    <div class="row"><button class="sec" id="pNext">＋ 再新增一筆（沿用位置、工班、期限）</button></div>
    ${open ? `<details class="pfix" ${it.fixedNote || hasAfter ? "open" : ""}><summary>🔧 改善回報（工班改善後再填）</summary>
      <div class="panel"><div class="field" style="margin:0"><label>改善說明（可空白）</label><input data-f="fixedNote" placeholder="例：已打磨修補" value="${esc(it.fixedNote)}"></div></div>${photoBlock(1, "改善後照片")}
      <div class="row"><button class="sec" id="pFix">✔ 回報已改善（待複驗）</button></div></details>` : ""}
    ${it.status === "fixed" ? `<div class="panel"><b>改善回報</b><div style="margin-top:6px">${esc(it.fixedNote || "（未填說明）")}<br><small style="color:var(--mut)">${esc(it.fixedAt)} 回報</small></div></div>${photoBlock(1, "改善後照片")}
      <div class="row"><button id="pPass">✅ 複驗合格・結案</button></div><div class="row"><button class="danger" id="pReject">↩ 複驗不合格・退回</button></div>` : ""}
    ${it.status === "closed" ? `<div class="panel"><b style="color:var(--ok)">✔ 已結案</b><div style="margin-top:6px">${esc(it.closedAt)}　複驗：${esc(it.closedBy || "—")}${it.fixedNote ? `<br>改善：${esc(it.fixedNote)}` : ""}</div></div>${photoBlock(1, "改善後照片")}<div class="row"><button class="sec" id="pReopen">重新開啟</button></div>` : ""}
    ${it.log.length ? `<div class="panel"><small style="color:var(--mut)">紀錄<br>${it.log.map(x => `${esc(pStamp(x.at))}　${esc(x.text)}`).join("<br>")}</small></div>` : ""}
    <div class="row"><button class="danger" id="pDel">刪除這筆缺失</button></div>`;

  const drawTh = slot => { const el = $(`[data-pth="${slot}"]`); if (el) el.innerHTML = photos.filter(p => p.itemIdx === slot).map(p => `<span class="th"><img src="${p.data}" alt="照片"><button data-pdel="${p.id}" aria-label="刪除照片">✕</button></span>`).join(""); };
  [0, 1].forEach(drawTh);
  const syncThumb = async () => { const f = photos.find(p => p.itemIdx === 0); it.thumb = f ? await pThumb(f.data) : ""; await flush(); };
  const addPhoto = async (slot, file) => {
    const p = { id: uid(), recId: it.id, itemIdx: slot, data: await makePhoto(file, `${slot === 0 ? it.foundDate || today() : today()} ${site?.name || ""}`.trim()), created: Date.now() };
    await DB.put("photos", p); photos.push(p); drawTh(slot); if (slot === 0) await syncThumb();
  };
  view.querySelectorAll("[data-f]").forEach(el => el.oninput = el.onchange = () => {
    it[el.dataset.f] = el.value; if (el.dataset.f === "foundBy") ls.set("punchBy", el.value);
    if (el.dataset.f === "due" && el.value) { flush().then(() => renderPunchForm(id)); return; }   // 逾期提醒即時更新
    save();
  });
  view.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { it.due = pAddDays(+b.dataset.d); flush().then(() => renderPunchForm(id)); });
  view.querySelectorAll("[data-pcam]").forEach(b => b.onclick = () => { const slot = +b.dataset.pcam;
    openCamera(slot === 0 ? `缺失照片：${it.location || it.no}` : `改善後照片：${it.location || it.no}`, blob => addPhoto(slot, blob),
      async files => { for (const f of files) { try { await addPhoto(slot, f); } catch { alert("這張照片無法讀取，請重新拍攝"); } } }); });
  view.querySelectorAll("[data-pfile]").forEach(inp => inp.onchange = async () => { const slot = +inp.dataset.pfile, files = [...inp.files]; inp.value = "";
    for (const f of files) { try { await addPhoto(slot, f); } catch { alert("這張照片無法讀取，請換一張"); } } });
  view.onclick = async e => {
    const img = e.target.closest?.(".th img");
    if (img) { const pid = img.parentElement.querySelector("[data-pdel]").dataset.pdel, cur = photos.find(x => x.id === pid), same = photos.filter(x => x.itemIdx === cur.itemIdx); openLightbox(same, same.indexOf(cur)); return; }
    const del = e.target.dataset?.pdel; if (!del || !confirm("刪除這張照片？")) return;
    const ph = photos.find(x => x.id === del); await DB.del("photos", del); photos = photos.filter(x => x.id !== del); drawTh(ph.itemIdx); if (ph.itemIdx === 0) await syncThumb();
  };
  const logAdd = text => it.log.push({ at: new Date().toISOString(), text });
  $("#pFix")?.addEventListener("click", async () => { it.status = "fixed"; it.fixedAt = today(); logAdd("回報已改善" + (it.fixedNote ? "：" + it.fixedNote : "")); await flush(); renderPunchForm(id); });
  $("#pPass")?.addEventListener("click", async () => {
    const by = prompt("複驗人員姓名", ls.get("punchBy", "")); if (by === null) return;
    it.status = "closed"; it.closedAt = today(); it.closedBy = by.trim(); if (by.trim()) ls.set("punchBy", by.trim()); logAdd(`複驗合格・結案（${by.trim() || "未填"}）`); await flush(); renderPunchForm(id);
  });
  $("#pReject")?.addEventListener("click", async () => {
    const why = prompt("複驗不合格的原因（可空白）", ""); if (why === null) return;
    it.status = "open"; it.rejects = (it.rejects || 0) + 1; it.fixedAt = ""; logAdd("複驗不合格・退回" + (why.trim() ? "：" + why.trim() : "")); await flush(); renderPunchForm(id);
  });
  $("#pReopen")?.addEventListener("click", async () => { if (!confirm("重新開啟這筆缺失？")) return; it.status = "open"; it.closedAt = ""; it.closedBy = ""; logAdd("重新開啟"); await flush(); renderPunchForm(id); });
  $("#pDone").onclick = async () => { await flush(); goBack("#/punch"); };
  $("#pNext").onclick = async () => { await flush(); const n = pNew({ no: await pNextNo(), location: it.location, seedLoc: it.location, trade: it.trade, due: it.due, foundDate: it.foundDate, foundBy: it.foundBy }); await DB.put("punch", n); goReplace("#/punch/" + n.id); };
  $("#pDel").onclick = async () => { if (!confirm("確定刪除這筆缺失？（含照片）")) return; for (const p of photos) await DB.del("photos", p.id); await DB.del("punch", id); goBack("#/punch"); };
}

/* ---------- 工班通知單 ---------- */
let pRepTrade = "", pRepStatus = { open: true, fixed: true, closed: false }, pRepPhoto = true;
async function renderPunchReport() {
  const seq = renderPunchReport.seq = (renderPunchReport.seq || 0) + 1;   // 連續操作時，只採用最新一次的結果
  if (!siteId) { goReplace("#/punch"); return; }
  const all = (await DB.all("punch")).filter(x => x.siteId === siteId && (x.desc.trim() || x.location.trim()));
  const trades = [...new Set(all.map(x => x.trade).filter(Boolean))];
  if (pRepTrade && pRepTrade !== "__none" && !trades.includes(pRepTrade)) pRepTrade = "";   // 記著的工班已不存在，就清掉
  const items = all.filter(x => pRepStatus[x.status] && (!pRepTrade || (pRepTrade === "__none" ? !x.trade : x.trade === pRepTrade)))
    .sort((x, y) => (x.due || "9999").localeCompare(y.due || "9999") || x.created - y.created);
  // 工班順序固定：預設工班清單的順序 → 其他工班依名稱 → 未指定工班放最後（每個工班內依期限排序）
  const tradeRank = t => { const i = PUNCH_TRADES.indexOf(t); return i >= 0 ? i : 100; };
  const groups = {};
  [...new Set(items.map(x => x.trade || ""))].sort((m, n) => !m - !n || tradeRank(m) - tradeRank(n) || m.localeCompare(n, "zh-Hant")).forEach(t => { groups[t || "（未指定工班）"] = items.filter(x => (x.trade || "") === t); });
  const photoMap = {};
  if (pRepPhoto) for (const p of await DB.all("photos")) if (p.itemIdx === 0 && items.some(x => x.id === p.recId) && !photoMap[p.recId]) photoMap[p.recId] = p.data;
  if (seq !== renderPunchReport.seq) return;
  const site = sites.find(s => s.id === siteId), company = ls.get("company", "");
  const cnt = { open: all.filter(x => x.status === "open").length, fixed: all.filter(x => x.status === "fixed").length, closed: all.filter(x => x.status === "closed").length };
  view.innerHTML = `
    <div class="noprint"><h2 class="t">缺失改善通知單</h2>
      <div class="panel"><div class="field"><label>工班／廠商</label><select id="rTrade"><option value="">全部工班（每個工班一頁）</option><option value="__none" ${pRepTrade === "__none" ? "selected" : ""}>未指定工班</option>${trades.map(t => `<option ${t === pRepTrade ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="timing" style="margin-bottom:8px">${Object.entries(PUNCH_STATUS).map(([k, l]) => `<label><input type="checkbox" data-rs="${k}" ${pRepStatus[k] ? "checked" : ""}> ${l}</label>`).join("")}</div>
        <label class="timing" style="display:flex;gap:8px"><input type="checkbox" id="rPhoto" ${pRepPhoto ? "checked" : ""}> 附缺失照片</label></div>
      <div class="row"><button id="rPrint">🖨 列印／存成 PDF</button><button class="sec" id="rShare">📤 分享文字</button></div>
      <div class="row"><a class="btnlink" href="#/punch">← 回缺失列表</a></div></div>
    <div id="rPaper">${items.length ? Object.entries(groups).map(([tr, os], gi) => `<div class="paper prep" style="${gi ? "" : ""}">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">缺失改善通知單</div>
      <div style="margin:2mm 0 3mm;font-size:13px">工程：${esc(site?.name)}　工班／廠商：<b>${esc(tr)}</b>　製表：${pRoc(today())}　共 ${os.length} 項</div>
      <table class="pt items sm"><tr><th>編號</th><th>位置</th><th>缺失內容</th>${pRepPhoto ? "<th>照片</th>" : ""}<th>期限</th><th>狀態</th></tr>
        ${os.map(x => `<tr><td class="c nw">${esc(x.no)}</td><td>${esc(x.location)}</td><td>${esc(x.desc)}${x.rejects ? `<br><small>↩ 複驗退回 ${x.rejects} 次</small>` : ""}</td>${pRepPhoto ? `<td class="c">${photoMap[x.id] ? `<img src="${photoMap[x.id]}" style="width:26mm;max-height:26mm;object-fit:cover">` : ""}</td>` : ""}
          <td class="c nw" style="${pOver(x) ? "color:#c0392b" : ""}">${x.due ? pRoc(x.due) : "—"}${pOver(x) ? `<br><small>逾期${pLate(x)}天</small>` : ""}</td><td class="c nw">${PUNCH_STATUS[x.status]}</td></tr>`).join("")}</table>
      <div class="psigs tall"><div>工班簽收／日期</div><div>工地主任</div></div></div>`).join("") : `<div class="panel noprint" style="color:var(--mut)">沒有符合條件的缺失。<br><small>這個工地共有 ${all.length} 筆：待改善 ${cnt.open}、待複驗 ${cnt.fixed}、已結案 ${cnt.closed}。<br>目前篩選：工班＝${pRepTrade ? esc(pRepTrade === "__none" ? "未指定" : pRepTrade) : "全部"}；狀態＝${Object.entries(PUNCH_STATUS).filter(([k]) => pRepStatus[k]).map(([, l]) => l).join("、") || "（都沒勾選）"}</small><br><button class="sec" id="rClear" style="margin-top:8px;min-height:40px">清除篩選，顯示全部</button></div>`}</div>`;
  $("#rTrade").onchange = e => { pRepTrade = e.target.value; renderPunchReport(); };
  $("#rClear")?.addEventListener("click", () => { pRepTrade = ""; pRepStatus = { open: true, fixed: true, closed: true }; renderPunchReport(); });
  view.querySelectorAll("[data-rs]").forEach(b => b.onchange = () => { pRepStatus[b.dataset.rs] = b.checked; renderPunchReport(); });
  $("#rPhoto").onchange = e => { pRepPhoto = e.target.checked; renderPunchReport(); };
  $("#rPrint").onclick = doPrint;
  $("#rShare").onclick = async () => {
    const text = Object.entries(groups).map(([tr, os]) => `【缺失改善通知】${site?.name || ""}\n工班：${tr}　${pRoc(today())}\n` + os.map((x, i) => `${i + 1}. ${x.location || "—"}｜${x.desc || "—"}｜期限 ${x.due ? pRoc(x.due) : "未設"}${pOver(x) ? `（逾期${pLate(x)}天）` : ""}`).join("\n") + `\n共 ${os.length} 項，請於期限前改善並通知複驗。`).join("\n\n");
    if (!text) { alert("沒有可分享的缺失"); return; }
    try { if (navigator.share) { await navigator.share({ title: "缺失改善通知", text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); alert("已複製，可貼到 LINE 或訊息。"); } catch { prompt("請複製以下內容", text); }
  };
}

/* ---------- 改善總表（統計 + 全部明細） ---------- */
let pSumTrade = "", pSumStatus = { open: true, fixed: true, closed: true };
const pLoc1 = loc => ((loc || "").trim().split(/[\s，,、／/]+/)[0]) || "（未填位置）";                  // 位置的第一段（例：3F、B1、屋頂）
const pTradeRank = t => { const i = PUNCH_TRADES.indexOf(t); return i >= 0 ? i : 100; };
const pSortKeys = arr => [...arr].sort((m, n) => !m - !n || pTradeRank(m) - pTradeRank(n) || m.localeCompare(n, "zh-Hant"));
const pPct = (a, b) => (b ? Math.round(a / b * 100) + "%" : "—");
function pStats(list) {
  const c = { n: list.length, open: 0, fixed: 0, closed: 0, over: 0 };
  list.forEach(x => { c[x.status]++; if (pOver(x)) c.over++; });
  return c;
}
async function renderPunchSummary() {
  const seq = renderPunchSummary.seq = (renderPunchSummary.seq || 0) + 1;
  if (!siteId) { goReplace("#/punch"); return; }
  const all = (await DB.all("punch")).filter(x => x.siteId === siteId && (x.desc.trim() || x.location.trim()));
  if (seq !== renderPunchSummary.seq) return;
  const trades = [...new Set(all.map(x => x.trade).filter(Boolean))];
  if (pSumTrade && pSumTrade !== "__none" && !trades.includes(pSumTrade)) pSumTrade = "";
  const site = sites.find(s => s.id === siteId), company = ls.get("company", "");
  const tot = pStats(all);
  const days = all.filter(x => x.fixedAt && x.foundDate).map(x => pDays(x.foundDate, x.fixedAt)).filter(d => d >= 0);
  const avg = days.length ? (days.reduce((a, b) => a + b, 0) / days.length).toFixed(1) : "—";
  const statRows = (keyFn, order) => order.map(k => { const l = all.filter(x => keyFn(x) === k), c = pStats(l);
    return `<tr><td>${esc(k)}</td><td class="c">${c.n}</td><td class="c">${c.open}</td><td class="c">${c.fixed}</td><td class="c">${c.closed}</td><td class="c" style="${c.over ? "color:#c0392b;font-weight:700" : ""}">${c.over}</td><td class="c">${pPct(c.closed, c.n)}</td></tr>`; }).join("");
  const tradeKey = x => x.trade || "（未指定工班）", tradeOrder = pSortKeys([...new Set(all.map(x => x.trade || ""))]).map(t => t || "（未指定工班）");
  // 位置排序：地下層（B2、B1）→ 1F、2F、3F… → 屋頂（RF）→ 其他
  const floorKey = t => { let m; if ((m = /^B(\d+)/i.exec(t))) return -(+m[1]); if ((m = /^(\d+)\s*[Ff樓]?/.exec(t))) return +m[1]; if (/^(R\d*F?|屋頂|頂樓|屋突)/i.test(t)) return 1000; return 2000; };
  const locOrder = [...new Set(all.map(x => pLoc1(x.location)))].sort((m, n) => floorKey(m) - floorKey(n) || m.localeCompare(n, "zh-Hant"));
  const totRow = `<tr><td><b>合計</b></td><td class="c"><b>${tot.n}</b></td><td class="c"><b>${tot.open}</b></td><td class="c"><b>${tot.fixed}</b></td><td class="c"><b>${tot.closed}</b></td><td class="c"><b>${tot.over}</b></td><td class="c"><b>${pPct(tot.closed, tot.n)}</b></td></tr>`;
  const head = a => `<tr><th>${a}</th><th>總數</th><th>待改善</th><th>待複驗</th><th>已結案</th><th>逾期</th><th>完成率</th></tr>`;
  const rank = { open: 0, fixed: 1, closed: 2 };
  const rows = all.filter(x => pSumStatus[x.status] && (!pSumTrade || (pSumTrade === "__none" ? !x.trade : x.trade === pSumTrade)))
    .sort((x, y) => rank[x.status] - rank[y.status] || (pOver(y) - pOver(x)) || (x.due || "9999").localeCompare(y.due || "9999") || x.created - y.created);
  view.innerHTML = `
    <div class="noprint"><h2 class="t">缺失改善總表</h2>
      <div class="panel"><div class="field"><label>明細的工班篩選（上方統計一律是全部）</label><select id="sTrade"><option value="">全部工班</option><option value="__none" ${pSumTrade === "__none" ? "selected" : ""}>未指定工班</option>${trades.map(t => `<option ${t === pSumTrade ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
        <div class="timing">${Object.entries(PUNCH_STATUS).map(([k, l]) => `<label><input type="checkbox" data-ss="${k}" ${pSumStatus[k] ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
      <div class="row"><button id="sPrint">🖨 列印／存成 PDF</button><button class="sec" id="sCsv">⬇ 下載 CSV</button></div>
      <div class="row"><button class="sec" id="sShare">📤 分享摘要</button><a class="btnlink" href="#/punch">← 回缺失列表</a></div></div>
    <div class="paper psum">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">缺失改善總表</div>
      <div style="margin:1mm 0 3mm;font-size:13px">工程：${esc(site?.name)}　製表：${pRoc(today())}</div>
      ${tot.n ? `<div class="kpis">${[["總數", tot.n], ["待改善", tot.open], ["待複驗", tot.fixed], ["已結案", tot.closed], ["逾期", tot.over], ["完成率", pPct(tot.closed, tot.n)], ["平均改善天數", avg]].map(([l, v]) => `<div class="kpi ${l === "逾期" && tot.over ? "bad" : ""}"><b>${v}</b><span>${l}</span></div>`).join("")}</div>
      <div class="pbar"><i style="width:${Math.round(tot.closed / tot.n * 100)}%"></i><i class="b2" style="width:${Math.round(tot.fixed / tot.n * 100)}%"></i></div>
      <div style="font-size:11px;color:#555;margin:2px 0 4mm">深綠＝已結案　淺綠＝待複驗　（平均改善天數：登記到回報改善）</div>
      <div style="font-weight:700;margin:3mm 0 1mm">依工班</div><table class="pt items sm">${head("工班")}${statRows(tradeKey, tradeOrder)}${totRow}</table>
      <div style="font-weight:700;margin:4mm 0 1mm">依位置（取位置的第一段，如樓層）</div><table class="pt items sm">${head("位置")}${statRows(x => pLoc1(x.location), locOrder)}${totRow}</table>
      <div style="font-weight:700;margin:4mm 0 1mm">缺失明細（${rows.length} 筆）</div>
      <table class="pt items sm"><tr><th>編號</th><th>位置</th><th>缺失內容</th><th>工班</th><th>期限</th><th>狀態</th><th>登記</th><th>改善回報</th><th>結案</th></tr>
        ${rows.map(x => `<tr><td class="nw">${esc(x.no)}</td><td>${esc(x.location)}</td><td>${esc(x.desc)}${x.rejects ? `<br><small>↩退回${x.rejects}次</small>` : ""}</td><td>${esc(x.trade)}</td>
          <td class="c nw" style="${pOver(x) ? "color:#c0392b" : ""}">${x.due ? pRoc(x.due) : "—"}${pOver(x) ? `<br><small>逾期${pLate(x)}天</small>` : ""}</td><td class="c nw">${PUNCH_STATUS[x.status]}</td>
          <td class="c nw">${x.foundDate ? pRoc(x.foundDate) : ""}</td><td class="c nw">${x.fixedAt ? pRoc(x.fixedAt) : ""}</td><td class="c nw">${x.closedAt ? pRoc(x.closedAt) : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="c" style="color:#777">沒有符合條件的缺失</td></tr>`}</table>` : `<p style="color:var(--mut)">還沒有缺失紀錄。</p>`}
    </div>`;
  // 列印時改成 A4 橫式（明細欄位較多）；換頁時移除
  document.getElementById("psumPrint")?.remove();
  const st = document.createElement("style"); st.id = "psumPrint"; st.textContent = "@media print{@page{size:A4 landscape;margin:10mm}}"; document.head.append(st);
  $("#sTrade").onchange = e => { pSumTrade = e.target.value; renderPunchSummary(); };
  view.querySelectorAll("[data-ss]").forEach(b => b.onchange = () => { pSumStatus[b.dataset.ss] = b.checked; renderPunchSummary(); });
  $("#sPrint").onclick = doPrint;
  $("#sCsv").onclick = () => {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const out = [["編號", "位置", "缺失內容", "責任工班", "期限", "狀態", "逾期天數", "登記日期", "登記人", "改善回報日", "改善說明", "結案日期", "複驗人", "退回次數"]];
    rows.forEach(x => out.push([x.no, x.location, x.desc, x.trade, x.due ? pRoc(x.due) : "", PUNCH_STATUS[x.status], pOver(x) ? pLate(x) : "", x.foundDate ? pRoc(x.foundDate) : "", x.foundBy, x.fixedAt ? pRoc(x.fixedAt) : "", x.fixedNote, x.closedAt ? pRoc(x.closedAt) : "", x.closedBy, x.rejects || 0]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + out.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `缺失改善總表_${woRoc(today())}.csv`; document.body.appendChild(a); a.click(); a.remove();
  };
  $("#sShare").onclick = async () => {
    const lines = tradeOrder.map(k => { const c = pStats(all.filter(x => tradeKey(x) === k)); return `${k}：共${c.n}｜待改善${c.open}｜待複驗${c.fixed}｜已結案${c.closed}${c.over ? `｜逾期${c.over}` : ""}`; });
    const text = `【缺失改善總表】${site?.name || ""}　${pRoc(today())}\n共 ${tot.n} 項：待改善 ${tot.open}、待複驗 ${tot.fixed}、已結案 ${tot.closed}（完成率 ${pPct(tot.closed, tot.n)}）${tot.over ? `，逾期 ${tot.over} 項` : ""}\n` + lines.join("\n");
    if (!tot.n) { alert("還沒有缺失紀錄"); return; }
    try { if (navigator.share) { await navigator.share({ title: "缺失改善總表", text }); return; } } catch (e) { if (e?.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(text); alert("已複製，可貼到 LINE 或訊息。"); } catch { prompt("請複製以下內容", text); }
  };
}
