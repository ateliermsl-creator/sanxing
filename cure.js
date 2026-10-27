"use strict";
/* 試體養護與拆模齡期追蹤
   直接讀「混凝土澆置抽驗」的澆置日期、樓層部位、試體編號（有勾「取樣」的車次），
   依設定的試驗齡期（預設 7、28 天）與各拆模項目的天數，換算成待辦清單。
   試壓後回填各試體強度，並附實驗室報告（用附加檔案功能），彙整成強度台帳。
   ※ 拆模天數、判定標準一律由使用者依契約與規範自行填寫，系統不內建任何規範數值，只做日期提醒與數值計算。 */

const CU_DEF_FORMS = ["柱側模", "牆側模", "樑側模", "版底模", "樑底模", "懸臂版底模"];
const cuDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
const cuIso = n => new Date(n * 864e5).toISOString().slice(0, 10);
const cuToday = () => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5; };
const cuLocalIso = () => cuIso(cuToday());
const cuMD = n => { const [, m, d] = cuIso(n).split("-"); return `${+m}/${+d}`; };
const cuNum = v => { const n = parseFloat(String(v ?? "").trim()); return Number.isFinite(n) ? n : null; };

async function cuCfg() {
  const c = await DB.get("matcats", "__cure");
  const ages = (c?.ages?.length ? c.ages : [7, 28]).slice().sort((a, b) => a - b);
  const forms = c?.forms ?? CU_DEF_FORMS.map(n => ({ n, d: "" }));
  return { ages, forms };
}
const cuCfgSave = cfg => DB.put("matcats", { id: "__cure", ages: cfg.ages, forms: cfg.forms, updated: Date.now() });

/* ---------- 由澆置資料換算待辦 ---------- */
async function cuBuild() {
  const cfg = await cuCfg(), today = cuToday(), tests = [], strips = [];
  const pours = (await DB.all("pours")).filter(b => b.siteId === siteId && Number.isFinite(cuDay(b.date)));
  for (const b of pours) {
    const d0 = cuDay(b.date), loc = pourTitle(b);
    b.trucks.forEach((t, i) => {
      if (!t.sampled) return;
      const spec = t.specimen ? `試體 ${t.specimen}` : `第 ${i + 1} 車試體`;
      for (const age of cfg.ages) {
        const due = d0 + age, res = t.tests?.[age];
        tests.push({ b, t, loc, spec, age, due, diff: due - today, done: !!(res && (res.vals?.length || res.date || res.skip)), res });
      }
    });
    for (const f of cfg.forms) {
      const tr = b.forms?.[f.n]; if (!tr) continue;
      const d = cuNum(f.d), ready = d === null ? NaN : d0 + d;
      strips.push({ b, loc, name: f.n, days: d, ready, diff: ready - today, stripped: tr.strip || "" });
    }
  }
  return { cfg, tests, strips, today };
}
function cuTestLine(x) {
  const w = `${esc(x.loc)} ${esc(x.spec)}`;
  if (x.diff < 0) return `🔴 ${w} 已逾期 ${-x.diff} 天未壓（${x.age} 天齡期，原訂 ${cuMD(x.due)}）`;
  if (x.diff === 0) return `⚠️ ${w} 今天滿 ${x.age} 天，待壓`;
  if (x.diff === 1) return `⚠️ ${w} 明日滿 ${x.age} 天待壓`;
  return `🕒 ${w} ${x.diff} 天後（${cuMD(x.due)}）滿 ${x.age} 天`;
}
function cuStripLine(x) {
  const w = `${esc(x.loc)} ${esc(x.name)}`;
  if (Number.isNaN(x.ready)) return `⚙ ${w} 尚未設定拆模天數`;
  if (x.diff <= 0) return `✅ ${w} 已滿 ${x.days} 天可拆模${x.diff < 0 ? `（超過 ${-x.diff} 天）` : ""}`;
  return `🕒 ${w} 還有 ${x.diff} 天（${cuMD(x.ready)}）可拆模，滿 ${x.days} 天`;
}
// 首頁卡片的提醒數：逾期、今天、明天的試壓，以及已可拆未標記的模板
async function cuUrgent() {
  if (!siteId) return 0;
  const { tests, strips } = await cuBuild();
  return tests.filter(x => !x.done && x.diff <= 1).length + strips.filter(x => !x.stripped && !Number.isNaN(x.ready) && x.diff <= 0).length;
}

/* ---------- 路由 ---------- */
async function renderCure(a, b, c) {
  if (!a) return renderCureList();
  if (a === "ledger") return renderCureLedger();
  if (a === "set") return renderCureSet();
  if (a === "test") return renderCureTest(b, c);
  goReplace("#/cure");
}

/* ---------- 待辦清單 ---------- */
let cuShowLater = false;
async function renderCureList() {
  if (!siteId) { view.innerHTML = `<div class="panel">請先按上方 ✎ 建立工地。</div>`; return; }
  const { cfg, tests, strips } = await cuBuild();
  const todoT = tests.filter(x => !x.done).sort((p, q) => p.diff - q.diff), todoS = strips.filter(x => !x.stripped);
  const urgent = [...todoT.filter(x => x.diff <= 1).map(x => ({ k: "t", x, o: x.diff })), ...todoS.filter(x => !Number.isNaN(x.ready) && x.diff <= 0).map(x => ({ k: "s", x, o: x.diff }))].sort((p, q) => p.o - q.o);
  const soon = [...todoT.filter(x => x.diff > 1 && x.diff <= 7).map(x => ({ k: "t", x, o: x.diff })), ...todoS.filter(x => !Number.isNaN(x.ready) && x.diff > 0 && x.diff <= 7).map(x => ({ k: "s", x, o: x.diff }))].sort((p, q) => p.o - q.o);
  const later = [...todoT.filter(x => x.diff > 7).map(x => ({ k: "t", x, o: x.diff })), ...todoS.filter(x => !Number.isNaN(x.ready) && x.diff > 7).map(x => ({ k: "s", x, o: x.diff }))].sort((p, q) => p.o - q.o);
  const unset = todoS.filter(x => Number.isNaN(x.ready));
  const row = ({ k, x }) => k === "t"
    ? `<a class="rec" href="#/cure/test/${esc(x.t.id)}/${x.age}"><b>${cuTestLine(x)}</b><br><small>澆置 ${esc(pRoc(x.b.date))}${x.b.fc ? "・fc' " + esc(x.b.fc) : ""}・點進去回填強度</small></a>`
    : `<div class="rec"><b>${cuStripLine(x)}</b><br><small>澆置 ${esc(pRoc(x.b.date))}</small> <button class="sec" data-strip="${esc(x.b.id)}" data-name="${esc(x.name)}" style="min-height:36px;margin-top:6px">標記已拆模</button></div>`;
  const sec = (title, list, empty) => `<h2 class="t" style="font-size:17px">${title}</h2>${list.length ? list.map(row).join("") : `<div class="panel" style="color:var(--mut)">${empty}</div>`}`;
  const doneN = tests.filter(x => x.done && !x.res?.skip).length;
  view.innerHTML = `
    <h2 class="t">試體養護與拆模追蹤</h2>
    <div class="row" style="margin-top:0"><a class="btnlink" href="#/cure/ledger">📋 強度台帳（${doneN} 筆已試壓）</a><a class="btnlink sm" href="#/cure/set" aria-label="設定">⚙</a></div>
    <p class="cnote">資料來自「混凝土澆置抽驗」：澆置日期、樓層部位、有勾「取樣」的試體編號。試驗齡期：${cfg.ages.join("、")} 天（從澆置當天起算，可到 ⚙ 修改）。</p>
    ${sec("需要處理", urgent, "目前沒有逾期、今明兩天要處理的項目。")}
    ${sec("7 天內", soon, "7 天內沒有到期的項目。")}
    ${later.length ? `<details class="panel" ${cuShowLater ? "open" : ""} id="cuLater"><summary>之後（${later.length}）</summary>${later.map(row).join("")}</details>` : ""}
    ${unset.length ? `<div class="panel"><b>⚙ 有 ${unset.length} 個拆模項目還沒設定天數</b><br><small>到右上 ⚙ 填入各模板的拆模天數（依契約與規範），才會開始提醒。</small></div>` : ""}
    ${!tests.length && !strips.length ? `<div class="panel">還沒有可追蹤的項目。到「混凝土澆置抽驗」新增澆置，在車次勾選「本車有取樣」並填試體編號，就會自動出現在這裡；拆模項目在澆置頁的「拆模追蹤」勾選。</div>` : ""}
    <p class="cnote">拆模天數只是提醒，實際可否拆模仍須依規範與監造、工程師核可。</p>`;
  $("#cuLater")?.addEventListener("toggle", e => { cuShowLater = e.target.open; });
  view.querySelectorAll("[data-strip]").forEach(btn => btn.onclick = async () => {
    const b = await DB.get("pours", btn.dataset.strip); if (!b?.forms?.[btn.dataset.name]) return;
    b.forms[btn.dataset.name].strip = cuLocalIso(); b.updated = Date.now(); await DB.put("pours", b); renderCureList();
  });
}

/* ---------- 回填試壓結果 ---------- */
async function renderCureTest(truckId, ageStr) {
  const age = +ageStr, b = (await DB.all("pours")).find(x => x.trucks.some(t => t.id === truckId));
  const t = b?.trucks.find(x => x.id === truckId);
  if (!b || !t || !Number.isInteger(age)) { goReplace("#/cure"); return; }
  const res = t.tests?.[age] || { date: "", vals: [], note: "" }, due = cuDay(b.date) + age, fc = cuNum(b.fc);
  const vals = res.vals.length ? res.vals.slice() : ["", "", ""];
  const recId = `${t.id}_${age}`, idx = b.trucks.indexOf(t) + 1;
  view.innerHTML = `
    <h2 class="t" style="margin-bottom:0">${age} 天試壓結果</h2>
    <div class="panel"><b>${esc(pourTitle(b))}</b>　${t.specimen ? `試體 ${esc(t.specimen)}` : `第 ${idx} 車`}<br>
      <small>澆置 ${esc(pRoc(b.date))}・預定試壓 ${esc(pRoc(cuIso(due)))}${b.fc ? `・設計強度 fc' ${esc(b.fc)} kgf/cm²` : ""}${t.plate ? `・車號 ${esc(t.plate)}` : ""}</small></div>
    <div class="panel">
      <div class="field"><label>試驗日期</label><input type="date" id="ctDate" value="${esc(res.date || cuLocalIso())}"></div>
      <label style="font-size:14px;color:var(--mut)">各試體抗壓強度（kgf/cm²）</label>
      <div id="ctVals" class="grid2" style="margin-top:6px"></div>
      <div class="row"><button class="sec" id="ctAdd">＋ 增加一個試體</button></div>
      <div id="ctAvg" class="big" style="margin-top:8px"></div>
      <div class="field" style="margin-top:10px"><label>備註（實驗室名稱、報告編號…）</label><input id="ctNote" value="${esc(res.note)}"></div></div>
    ${attBlock("實驗室報告（PDF、照片）")}
    <div class="row"><button id="ctSave">儲存結果</button>${res.skip ? "" : `<button class="sec" id="ctSkip">這個齡期不試壓</button>`}</div>
    ${res.date || res.vals.length || res.skip ? `<div class="row"><button class="danger" id="ctClear">清除這筆結果</button></div>` : ""}`;
  const drawVals = () => { $("#ctVals").innerHTML = vals.map((v, i) => `<input inputmode="decimal" data-v="${i}" placeholder="試體 ${i + 1}" value="${esc(v)}">`).join(""); $("#ctVals").querySelectorAll("input").forEach(el => el.oninput = () => { vals[+el.dataset.v] = el.value; calc(); }); };
  const calc = () => {
    const n = vals.map(cuNum).filter(v => v !== null); if (!n.length) { $("#ctAvg").innerHTML = ""; return; }
    const avg = n.reduce((a, v) => a + v, 0) / n.length;
    $("#ctAvg").innerHTML = `<span>平均</span><b>${fmt(avg, 1)} kgf/cm²</b>${fc ? `<span>　為設計強度的 <b>${fmt(avg / fc * 100, 0)}%</b>（僅供參考，合格與否請依規範判定）</span>` : ""}`;
  };
  drawVals(); calc();
  $("#ctAdd").onclick = () => { vals.push(""); drawVals(); };
  attBind(view, recId);
  $("#ctSave").onclick = async () => {
    const clean = vals.map(v => String(v).trim()).filter(v => cuNum(v) !== null);
    if (!clean.length && !confirm("還沒有填任何強度值，仍要儲存嗎？")) return;
    t.tests = { ...(t.tests || {}), [age]: { date: $("#ctDate").value || cuLocalIso(), vals: clean, note: $("#ctNote").value.trim() } };
    b.updated = Date.now(); await DB.put("pours", b); goBack("#/cure");
  };
  $("#ctSkip")?.addEventListener("click", async () => {
    if (!confirm(`這個 ${age} 天齡期不試壓（例如改用別的齡期）？之後不會再提醒。`)) return;
    t.tests = { ...(t.tests || {}), [age]: { date: "", vals: [], note: "", skip: true } }; b.updated = Date.now(); await DB.put("pours", b); goBack("#/cure");
  });
  $("#ctClear")?.addEventListener("click", async () => {
    if (!confirm("清除這筆試壓結果？（已附的實驗室報告檔案不會刪除）")) return;
    delete t.tests[age]; b.updated = Date.now(); await DB.put("pours", b); renderCureTest(truckId, ageStr);
  });
}

/* ---------- 強度台帳 ---------- */
async function renderCureLedger() {
  const { cfg, tests } = await cuBuild();
  const files = await DB.all("files"), company = ls.get("company", ""), site = sites.find(s => s.id === siteId);
  const rows = tests.slice().sort((p, q) => cuDay(p.b.date) - cuDay(q.b.date) || p.b.created - q.b.created || p.age - q.age);
  const body = rows.map(x => {
    const nums = (x.res?.vals || []).map(cuNum).filter(v => v !== null), avg = nums.length ? nums.reduce((a, v) => a + v, 0) / nums.length : null, fc = cuNum(x.b.fc);
    const fn = files.filter(f => f.recId === `${x.t.id}_${x.age}`).map(f => esc(f.name)).join("、");
    return `<tr><td class="nw">${esc(pRoc(x.b.date))}</td><td>${esc(x.loc)}</td><td>${esc(x.t.specimen || "第 " + (x.b.trucks.indexOf(x.t) + 1) + " 車")}</td><td class="c">${x.age}</td><td class="c nw">${esc(pRoc(cuIso(x.due)))}</td>
      <td class="c nw">${x.res?.skip ? "<small>未試壓</small>" : x.done ? esc(pRoc(x.res.date)) : "<small>待壓</small>"}</td><td class="c">${nums.map(v => fmt(v, 1)).join("<br>")}</td><td class="c"><b>${avg === null ? "" : fmt(avg, 1)}</b></td>
      <td class="c">${fc ? esc(x.b.fc) : ""}</td><td class="c">${avg !== null && fc ? fmt(avg / fc * 100, 0) + "%" : ""}</td><td><small>${fn}</small></td></tr>`;
  }).join("");
  view.innerHTML = `
    <div class="noprint pvbar"><button class="sec" id="pvBack">← 返回</button><button id="pvPrint">🖨 列印／存成 PDF</button></div>
    <div class="paper psum">
      ${company ? `<div class="pcomp">${esc(company)}</div>` : ""}<div class="ptitle">結構體混凝土強度台帳</div>
      <table class="pt"><tr><th>工程名稱</th><td>${esc(site?.name)}</td><th>試驗齡期</th><td>${cfg.ages.join("、")} 天</td><th>統計</th><td>共 ${rows.length} 組，已試壓 ${rows.filter(x => x.done && !x.res?.skip).length} 組</td></tr></table>
      ${rows.length ? `<table class="pt items sm"><tr><th>澆置日</th><th>樓層／部位</th><th>試體編號</th><th>齡期<br>天</th><th>預定試壓</th><th>試驗日</th><th>各試體強度<br>kgf/cm²</th><th>平均</th><th>設計<br>fc'</th><th>達成率</th><th>實驗室報告</th></tr>${body}</table>` : `<p>尚無資料。</p>`}
      <p style="margin-top:3mm;font-size:12px">※ 達成率＝平均強度 ÷ 設計強度，僅供參考；合格判定請依契約與規範辦理。</p>
    </div>`;
  document.getElementById("psumPrint")?.remove();
  const st = document.createElement("style"); st.id = "psumPrint"; st.textContent = "@media print{@page{size:A4 landscape;margin:10mm}}"; document.head.append(st);
  $("#pvBack").onclick = () => goBack("#/cure");
  $("#pvPrint").onclick = doPrint;
}

/* ---------- 設定：試驗齡期、拆模項目與天數 ---------- */
async function renderCureSet() {
  const cfg = await cuCfg();
  view.innerHTML = `
    <h2 class="t">追蹤設定</h2>
    <div class="panel"><b>試驗齡期（天）</b><p class="cnote">用逗號分開，預設 7、28。從澆置當天起算。</p>
      <input id="csAges" value="${esc(cfg.ages.join(", "))}" inputmode="numeric"></div>
    <div class="panel"><b>拆模項目與天數</b><p class="cnote">天數請依契約與規範填寫；沒填天數的項目不會提醒。系統不內建任何規範數值。</p>
      <div id="csForms"></div><div class="row"><button class="sec" id="csAdd">＋ 新增拆模項目</button></div></div>`;
  const forms = cfg.forms.map(f => ({ ...f }));
  const save = async () => {
    const ages = [...new Set($("#csAges").value.split(/[,，、\s]+/).map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 365))].sort((a, b) => a - b).slice(0, 6);
    await cuCfgSave({ ages: ages.length ? ages : [7, 28], forms: forms.filter(f => f.n.trim()).map(f => ({ n: f.n.trim().slice(0, 30), d: String(f.d).trim().slice(0, 4) })) });
  };
  const draw = () => {
    $("#csForms").innerHTML = forms.map((f, i) => `<div class="grid2" style="margin-bottom:6px;align-items:center"><input data-n="${i}" value="${esc(f.n)}" placeholder="例：樑底模"><div style="display:flex;gap:6px;align-items:center"><input data-d="${i}" inputmode="numeric" placeholder="天數" value="${esc(f.d)}"><button class="danger" data-x="${i}" aria-label="刪除" style="min-height:44px">✕</button></div></div>`).join("");
    $("#csForms").querySelectorAll("[data-n]").forEach(el => el.oninput = () => { forms[+el.dataset.n].n = el.value; save(); });
    $("#csForms").querySelectorAll("[data-d]").forEach(el => el.oninput = () => { forms[+el.dataset.d].d = el.value; save(); });
    $("#csForms").querySelectorAll("[data-x]").forEach(el => el.onclick = () => { forms.splice(+el.dataset.x, 1); draw(); save(); });
  };
  draw(); $("#csAges").oninput = save;
  $("#csAdd").onclick = () => { forms.push({ n: "", d: "" }); draw(); };
}

/* ---------- 澆置頁裡的「拆模追蹤」面板 ---------- */
async function cuFormsPanel(bt) {
  const cfg = await cuCfg(), set = cfg.forms.filter(f => f.n);
  return `<div class="panel" id="cuForms"><b>🧱 拆模追蹤</b> <small style="color:var(--mut)">勾選這次澆置要追蹤的模板</small>
    ${set.length ? set.map(f => { const on = !!bt.forms?.[f.n], d = cuNum(f.d), st = bt.forms?.[f.n]?.strip;
      return `<div style="display:flex;align-items:center;gap:8px;margin-top:8px"><label style="display:flex;gap:8px;align-items:center;flex:1"><input type="checkbox" data-cf="${esc(f.n)}" ${on ? "checked" : ""} style="width:22px;height:22px"> ${esc(f.n)}<small style="color:var(--mut)">${d === null ? "（未設定天數）" : `（${d} 天）`}</small></label>${on ? (st ? `<small>已拆 ${esc(pRoc(st))}</small>` : `<small style="color:var(--mut)">${d === null || !Number.isFinite(cuDay(bt.date)) ? "" : "可拆日 " + cuMD(cuDay(bt.date) + d)}</small>`) : ""}</div>`; }).join("") : `<p class="cnote">還沒有拆模項目，到「試體養護與拆模追蹤」的 ⚙ 新增。</p>`}
    <div class="row"><a class="btnlink" href="#/cure">🧪 看待辦清單</a></div></div>`;
}
function cuFormsBind(view, bt, save) {
  view.querySelectorAll("[data-cf]").forEach(el => el.onchange = async () => {
    bt.forms = { ...(bt.forms || {}) };
    if (el.checked) bt.forms[el.dataset.cf] = { strip: "" }; else delete bt.forms[el.dataset.cf];
    save(); const p = $("#cuForms"); if (p) { p.outerHTML = await cuFormsPanel(bt); cuFormsBind(view, bt, save); }
  });
}
