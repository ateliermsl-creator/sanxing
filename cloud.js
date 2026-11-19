"use strict";
/* ---------- 雲端同步（同事共用，第一期：專案、自主檢查表、自訂範本） ----------
   只有放在公司雲端網址（Cloudflare）時才啟用；GitHub Pages（*.github.io）與本機測試維持單機版，行為完全不變。
   做法：填表照舊先存手機（IndexedDB），這裡在 DB.put／DB.del 之後記下「哪一份改過」（sync 資料表），有網路時背景上傳。
   上傳時帶「我開始改時的版次」，雲端判斷中間有沒有別人改過，需要時自動合併（規則見 cloud/worker.js 的 merge3）。
   從雲端收到的資料一律先經 safe.js 的 CLEAN 清理才寫入，和匯入備份檔同一套檢查。
   登入：Cloudflare Access（Email 驗證碼），只保護 /api/*；網頁本身不含資料，離線照樣能開。
   必須在 app.js 之後載入（要包住 DB），sidenav.js 之前（左側選單多一項）。 */
const CLOUD = {
  on: !/github\.io$/i.test(location.hostname) && (!["localhost", "127.0.0.1", ""].includes(location.hostname) || ls.get("cloudDev", "") === "1"),
  stores: ["sites", "records", "templates"],   // 第一期同步的資料表；之後各期在這裡和 worker.js 的 SYNC_KINDS 加
  me: null, projects: [], meta: new Map(),       // meta：`${store}:${id}` → { v 雲端版次, dirty, n 改了幾次, del, by 建立人, cloud（專案）, local（只在這支手機） }
  state: "idle", msg: "", last: 0, busy: false, again: false, timer: null, notes: [], applied: new Set(),
  deny: null, reqs: 0   // deny：不在名單時雲端回的資料（applied 申請狀態）；reqs：管理員看到的待核准申請數
};
function cloudOn() { return CLOUD.on; }
try { CLOUD.me = JSON.parse(ls.get("cloudMe", "null")); CLOUD.projects = JSON.parse(ls.get("cloudProjects", "[]")); CLOUD.last = +ls.get("cloudLast", "0") || 0; } catch {}

/* ---------- 改過的紀錄（sync 資料表，不放進備份） ---------- */
const clKey = (s, id) => s + ":" + id;
const clMetaPut = m => { CLOUD.meta.set(m.id, m); return tx("sync", "readwrite", o => o.put(m)); };
const clMetaDel = id => { CLOUD.meta.delete(id); return tx("sync", "readwrite", o => o.delete(id)); };
const clMetaLoad = (async () => { if (!CLOUD.on) return; for (const m of await tx("sync", "readonly", o => o.getAll())) CLOUD.meta.set(m.id, m); })().catch(() => {});
const clMeta = (s, id) => CLOUD.meta.get(clKey(s, id));
const clCloudSites = () => new Set([...CLOUD.meta.values()].filter(m => m.s === "sites" && m.cloud).map(m => m.doc));
const clPending = () => { const cs = clCloudSites(); return [...CLOUD.meta.values()].filter(m => m.dirty && !m.err && (m.s === "sites" ? m.cloud : m.s === "templates" ? !m.local : cs.has(m.pid))).length; };

const DBraw = { put: DB.put, del: DB.del };
async function clTouch(s, v, del) {
  await clMetaLoad;
  const id = del ? v : v.id, k = clKey(s, id);
  const m = { ...(CLOUD.meta.get(k) || { id: k, s, doc: id, v: 0 }) };
  if (s === "sites" && !m.cloud) {   // 管理員登入後新增的工地才成為雲端專案；其他都只在這支手機（之後可用「上傳舊資料」）
    if (del || !CLOUD.me?.admin || m.local || !ls.get("cloudInit", "")) { if (!m.local) { m.local = true; await clMetaPut(m); } return; }
    m.cloud = true;
  }
  if (!del && s === "records") m.pid = v.siteId;
  m.dirty = true; m.del = !!del; m.n = (m.n || 0) + 1; delete m.err;
  if (!m.by && !m.v && CLOUD.me) m.by = CLOUD.me.email;
  await clMetaPut(m);
  clSoon();
}
if (CLOUD.on) {
  DB.put = async (s, v) => { const r = await DBraw.put(s, v); if (CLOUD.stores.includes(s)) await clTouch(s, v, false).catch(() => {}); return r; };
  DB.del = async (s, id) => { const r = await DBraw.del(s, id); if (CLOUD.stores.includes(s)) await clTouch(s, id, true).catch(() => {}); return r; };
}
function clSoon(ms = 2000) { if (!CLOUD.on) return; clearTimeout(CLOUD.timer); CLOUD.timer = setTimeout(() => cloudSync(), ms); }

/* ---------- 同步一次 ---------- */
function clSet(state, msg) { CLOUD.state = state; CLOUD.msg = msg || ""; clPaint(); }
async function clApply(kind, d) {   // 把雲端那一份寫進手機（不會再標成「改過」）
  const k = clKey(kind, d.id || d.data?.id);
  CLOUD.applied.add(d.id || d.data?.id);
  if (d.deleted || d.gone || !d.data) {
    if (kind === "records") { for (const p of await DB.all("photos")) if (p.recId === d.id) await DBraw.del("photos", p.id); }
    await DBraw.del(kind, d.id); await clMetaDel(k); return true;
  }
  const clean = CLEAN[kind] && CLEAN[kind](d.data);
  if (!clean) return false;
  await DBraw.put(kind, clean);
  await clMetaPut({ ...(CLOUD.meta.get(k) || {}), id: k, s: kind, doc: clean.id, v: d.version, by: d.by || CLOUD.meta.get(k)?.by || "", pid: clean.siteId || "", dirty: false, del: false, n: CLOUD.meta.get(k)?.n || 0 });
  return true;
}
// 要寫入的那一份正開在畫面上：先讓畫面上還沒存的輸入存進手機（離開輸入框會觸發儲存），再決定要不要覆蓋
async function clQuiesce(id) {
  if (!location.hash.split("/").includes(id)) return;
  const a = document.activeElement; if (a && a !== document.body && view.contains(a)) a.blur();
  await new Promise(r => setTimeout(r, 0));
  if (svCur?.pending) await svCur.flush().catch(() => {});
}
async function cloudSync() {
  if (!CLOUD.on) return;
  if (CLOUD.busy) { CLOUD.again = true; return; }
  if (!navigator.onLine) { clSet("offline"); return; }
  CLOUD.busy = true; clSet("syncing");
  let changed = false, tplChanged = false;
  try {
    await clMetaLoad;
    for (let round = 0; round < 8; round++) {
      const cs = clCloudSites(), metas = [...CLOUD.meta.values()];
      const projects = [], push = [], sent = new Map();
      for (const m of metas.filter(m => m.dirty && !m.err && m.s === "sites" && m.cloud && !m.del)) {
        const s = await DB.get("sites", m.doc); if (s) { projects.push({ id: s.id, name: s.name, company: s.company || "" }); sent.set(m.id, m.n); }
      }
      for (const m of metas.filter(m => m.dirty && !m.err && m.s !== "sites")) {
        if (push.length >= 100) break;
        if (m.s === "templates" && m.local) continue;
        const data = m.del ? null : await DB.get(m.s, m.doc);
        if (!m.del && !data) { await clMetaDel(m.id); continue; }
        const pid = m.s === "records" ? (data ? data.siteId : m.pid) : "";
        if (m.s === "records" && !cs.has(pid)) continue;            // 還只在這支手機的工地，不上傳
        if (m.del && !m.v) { await clMetaDel(m.id); continue; }     // 從沒上傳過就刪了
        push.push({ id: m.doc, kind: m.s, project: pid, base: m.v || 0, del: !!m.del, data, n: m.n });
        sent.set(m.id, m.n);
      }
      const r = await fetch("api/sync", { method: "POST", redirect: "manual", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" }, body: JSON.stringify({ cursor: +ls.get("cloudCur", "0") || 0, known: [...cs], projects, push: push.map(({ n, ...x }) => x) }) });
      if (r.type === "opaqueredirect" || r.status === 401 || r.status === 302) { clSet("login"); return; }
      if (r.status === 403) { clDenied(await r.json().catch(() => ({}))); return; }
      if (!r.ok) { clSet("error", "雲端暫時無法連線（" + r.status + "）"); return; }
      const j = await r.json();
      CLOUD.me = j.me; ls.set("cloudMe", JSON.stringify(j.me)); CLOUD.deny = null; CLOUD.reqs = +j.reqs || 0; ls.set("cloudSignup", "");
      // 第一次登入：這支手機原有的工地都標成「只在這支手機」，要用「上傳舊資料」決定放到哪個專案
      if (!ls.get("cloudInit", "")) {
        const ids = new Set(j.projects.map(p => p.id));
        for (const s of await DB.all("sites")) if (!ids.has(s.id) && !clMeta("sites", s.id)) await clMetaPut({ id: clKey("sites", s.id), s: "sites", doc: s.id, local: true });
        ls.set("cloudInit", "1");
      }
      for (const pr of j.projResults || []) {
        const m = clMeta("sites", pr.id); if (!m) continue;
        if (pr.status === "ok") { if (sent.get(m.id) === m.n) await clMetaPut({ ...m, dirty: false }); }
        else { await clMetaPut({ ...m, cloud: false, local: true, dirty: false }); CLOUD.notes.push(pr.msg || "專案沒有上傳"); }
      }
      for (const res of j.results || []) {
        const it = push.find(x => x.id === res.id); if (!it) continue;
        await clQuiesce(it.id);
        const k = clKey(it.kind, it.id), m = CLOUD.meta.get(k); if (!m) continue;
        const untouched = sent.get(k) === m.n;
        if (res.status === "ok") {
          if (res.gone) { if (untouched) await clMetaDel(k); }
          else await clMetaPut({ ...m, v: untouched ? res.version : m.v, by: res.by || m.by, dirty: !untouched });
        } else if (["merged", "conflict", "denied"].includes(res.status)) {
          if (res.msg) CLOUD.notes.push(res.msg);
          if (res.status === "denied" && res.gone) {           // 雲端沒有這份、我又沒權限建立
            if (it.kind === "templates") await clMetaPut({ ...m, local: true, dirty: false });
            else { await DBraw.del(it.kind, it.id); await clMetaDel(k); changed = true; }
          } else if (untouched || res.status !== "merged") { await clApply(it.kind, { ...res, id: it.id }); changed = true; if (it.kind === "templates") tplChanged = true; }
          // 合併後我又改了：先不覆蓋畫面上的修改，下次上傳再合併一次
        } else if (res.status === "too_big" || res.status === "bad") { await clMetaPut({ ...m, err: res.status }); CLOUD.notes.push(res.status === "too_big" ? "有一份表單太大，無法上傳" : "有一份表單格式不正確，沒有上傳"); }
      }
      // 專案（= 手機的工地）
      CLOUD.projects = j.projects; ls.set("cloudProjects", JSON.stringify(j.projects));
      const seen = new Set();
      for (const p of j.projects) {
        seen.add(p.id);
        const local = await DB.get("sites", p.id), m = clMeta("sites", p.id);
        if (m?.dirty) continue;
        const s = CLEAN.sites({ id: p.id, name: p.name, company: p.company });
        if (s && (!local || local.name !== s.name || local.company !== s.company)) { await DBraw.put("sites", s); changed = true; }
        if (!m?.cloud || m.local) await clMetaPut({ id: clKey("sites", p.id), s: "sites", doc: p.id, cloud: true, dirty: false });
      }
      for (const id of cs) if (!seen.has(id)) {          // 被移出專案：清掉這支手機上的雲端資料（還沒上傳的保留，改成只在本機）
        const left = [...CLOUD.meta.values()].filter(m => m.s === "records" && m.pid === id && m.dirty);
        if (left.length) { await clMetaPut({ ...clMeta("sites", id), cloud: false, local: true }); continue; }
        for (const r of (await DB.all("records")).filter(r => r.siteId === id)) await clApply("records", { id: r.id, deleted: true });
        await DBraw.del("sites", id); await clMetaDel(clKey("sites", id)); changed = true;
        CLOUD.notes.push("你已不在其中一個專案，這支手機上的該專案資料已移除");
      }
      for (const d of j.pull || []) {
        await clQuiesce(d.id);
        const m = clMeta(d.kind, d.id);
        if (m?.dirty) continue;                            // 我也改過：等我上傳時由雲端合併
        if (m && m.v >= d.version && !d.deleted) continue;
        if (await clApply(d.kind, d)) { changed = true; if (d.kind === "templates") tplChanged = true; }
      }
      ls.set("cloudCur", String(j.cursor));
      if (!j.more && push.length < 100) break;
    }
    CLOUD.last = Date.now(); ls.set("cloudLast", String(CLOUD.last));
    clSet("idle");
  } catch (e) {
    clSet(navigator.onLine ? "error" : "offline", navigator.onLine ? "同步失敗，稍後會自動再試" : "");
  } finally {
    CLOUD.busy = false; clPaint();   // 同步中途的狀態（例如不在名單）在這裡才畫上雲端頁
    if (tplChanged) await loadTemplates();
    // 畫面上正開著的那一份剛收到別人的修改：重新顯示，避免用舊內容蓋掉
    const open = location.hash.split("/").slice(2).find(x => CLOUD.applied.has(x));
    if (open && /^#\/checklist\//.test(location.hash)) { if (svCur?.pending) await svCur.flush().catch(() => {}); if (!CLOUD.notes.length) CLOUD.notes.push("這份剛收到同事的修改，畫面已更新"); }
    CLOUD.applied.clear();
    if (changed || open) { await loadSites(); const h = location.hash; if (open || !h || h === "#/" || h === "#/checklist" || h === "#/cloud") route(); }
    if (CLOUD.notes.length) { clToast(CLOUD.notes.join("\n")); CLOUD.notes = []; }
    if (CLOUD.again) { CLOUD.again = false; clSoon(500); }
  }
}

// 雲端說不能同步：不在名單（可以送加入申請）或已停權
function clDenied(j) {
  CLOUD.deny = j || {};
  if (j?.error === "not_member") { CLOUD.me = null; ls.set("cloudMe", "null"); }
  clSet("denied", j?.error === "disabled" ? "這個帳號已停權，請洽管理員" : "還不在公司人員名單");
}

/* ---------- 權限（畫面上先擋，雲端也會再檢查一次） ---------- */
const clRole = pid => !CLOUD.me ? "" : CLOUD.me.admin ? "admin" : (CLOUD.me.roles || {})[pid] || "";
const clIsCloudSite = id => CLOUD.on && clCloudSites().has(id);
// 這份紀錄我只能看、不能改的原因；可以改就回傳空字串
async function cloudRO(store, rec) {
  if (!CLOUD.on || !rec) return "";
  await clMetaLoad;
  if (!clIsCloudSite(rec.siteId) || !CLOUD.me) return "";
  const role = clRole(rec.siteId), by = clMeta(store, rec.id)?.by || "";
  if (!role) return "你不是這個專案的成員，只能查看";
  if (role === "viewer") return "你在這個專案是唯讀，只能查看";
  if (role === "member" && by && by !== CLOUD.me.email) return `這份由 ${by} 建立，一般同事只能查看`;
  return "";
}
// 已完成的表單能不能按「修改」：雲端專案只有工程主管、管理員可以
function cloudCanReopen(rec) { return !clIsCloudSite(rec?.siteId) || ["admin", "lead"].includes(clRole(rec.siteId)); }
// 清空白紀錄時只動自己建立的
function cloudMine(store, id) { const by = clMeta(store, id)?.by; return !CLOUD.on || !by || by === CLOUD.me?.email; }
// 雲端專案的名稱只有管理員能改、不能在手機上直接刪
function cloudSiteBlock(id, act) {
  if (!clIsCloudSite(id)) return "";
  if (act === "del") return "這是公司雲端上的專案，不能在手機上刪除。要關閉專案請洽管理員。";
  if (act === "edit" && !CLOUD.me?.admin) return "雲端專案的名稱與公司抬頭由管理員修改。";
  return "";
}
// 第一次開啟：雲端版先登入，不要求建立工地
function cloudFirst() {
  if (!CLOUD.on) return false;
  if (!CLOUD.me || !CLOUD.me.admin) { goReplace("#/cloud"); return true; }
  return false;
}

/* ---------- 畫面：首頁小標籤、提示 ---------- */
function clLabel() {
  const n = clPending();
  if (CLOUD.state === "denied") return CLOUD.deny?.applied === "pending" ? "☁ 等待核准" : "☁ 無法同步";
  if (!CLOUD.me || CLOUD.state === "login") return "☁ 登入同步";
  if (CLOUD.state === "syncing") return "☁ 同步中…";
  if (CLOUD.state === "offline" || !navigator.onLine) return n ? `☁ 離線・待上傳 ${n} 筆` : "☁ 離線";
  if (CLOUD.state === "error") return n ? `☁ 待上傳 ${n} 筆` : "☁ 稍後再試";
  if (CLOUD.me?.admin && CLOUD.reqs && !n) return `☁ ${CLOUD.reqs} 人申請加入`;
  return n ? `☁ 待上傳 ${n} 筆` : "☁ 已同步";
}
function clPaint() {
  const el = document.getElementById("hCloud"); if (el) el.textContent = clLabel();
  if (location.hash === "#/cloud" && !CLOUD.busy) { const st = document.getElementById("clState"); if (st) st.innerHTML = clStateHtml(); }
}
function cloudHome() {
  if (!CLOUD.on) return;
  const top = document.querySelector(".htop"); if (!top || document.getElementById("hCloud")) return;
  const a = document.createElement("a"); a.id = "hCloud"; a.className = "hbak hcl"; a.href = "#/cloud"; a.textContent = clLabel();
  top.insertBefore(a, top.querySelector(".hbar"));
}
function clToast(text) {
  let el = document.getElementById("clToast");
  if (!el) { el = document.createElement("div"); el.id = "clToast"; el.setAttribute("role", "status"); document.body.appendChild(el); el.onclick = () => { el.hidden = true; }; }
  el.textContent = text; el.hidden = false;
  clearTimeout(clToast.t); clToast.t = setTimeout(() => { el.hidden = true; }, 8000);
}

/* ---------- 雲端同步頁 #/cloud ---------- */
const clRoleName = { admin: "管理員", lead: "工程主管", member: "一般同事", viewer: "唯讀" };
function clDenyHtml() {
  const d = CLOUD.deny || {}, out = `<button class="sec" id="clOut">換 Email 登入</button>`;
  if (d.error === "disabled") return `<b>這個帳號已停權</b>　<small>${esc(d.email || "")}</small><br><small style="color:var(--bad)">請洽管理員。</small><div class="row" style="margin:10px 0 0">${out}</div>`;
  const head = d.applied || !ls.get("cloudSignup", "") ? `<b>還不在公司人員名單</b>　<small>${esc(d.email || "")}</small><br>` : `<b>申請帳號</b>　<small>${esc(d.email || "")}</small><br>`;
  if (d.applied === "pending") return head + `<small style="color:var(--mut)">已送出加入申請（${esc(d.name || "")}${d.note ? "・" + esc(d.note) : ""}），等管理員核准。核准後按「重新檢查」就能開始同步。</small>
    <div class="row" style="margin:10px 0 0"><button class="sec" id="clNow">⟳ 重新檢查</button>${out}</div>`;
  if (d.applied === "rejected") return head + `<small style="color:var(--bad)">管理員沒有核准這個 Email 的申請，如有疑問請直接洽管理員。</small><div class="row" style="margin:10px 0 0">${out}</div>`;
  return head + `<small style="color:var(--mut)">填姓名送出申請，管理員核准後就能同步。沒核准前，這支手機照樣可以填表，資料只存在手機。</small>
    <div class="grid2" style="gap:0 8px;margin-top:8px"><div class="field"><label>姓名</label><input id="clAName" maxlength="30" autocomplete="name" placeholder="例如：王小明"></div>
    <div class="field"><label>說明（選填）</label><input id="clANote" maxlength="100" placeholder="例如：○○工地 現場工程師"></div></div>
    <div class="row" style="margin:0"><button id="clApply">送出加入申請</button>${out}</div>`;
}
function clStateHtml() {
  const me = CLOUD.me, n = clPending();
  if (CLOUD.state === "denied" && CLOUD.deny) return clDenyHtml();
  if (!me || CLOUD.state === "login") return `<b>尚未登入</b><br><small style="color:var(--mut)">輸入你的 Email，收信填驗證碼就能登入，不用設密碼。沒有網路時照樣可以填表，登入後會自動上傳。</small>
    <div class="row" style="margin:10px 0 0"><button id="clLogin">✉ 用 Email 登入</button><button class="sec" id="clSignup">📝 申請帳號</button></div>
    <small style="color:var(--mut)">第一次使用請按「申請帳號」：也要先收一次驗證碼，確認信箱是你本人的，接著填姓名送出，管理員核准後就能使用。</small>`;
  return `<b>${esc(me.name || me.email)}</b>　<small>${esc(me.email)}${me.admin ? "・管理員" : ""}</small><br>
    <small style="color:${CLOUD.state === "denied" || CLOUD.state === "error" ? "var(--bad)" : "var(--mut)"}">${esc(CLOUD.msg || clLabel())}${CLOUD.last ? `・上次同步 ${esc(clStamp(CLOUD.last))}` : ""}${n ? `・還有 ${n} 筆在這支手機等上傳` : ""}</small>
    <div class="row" style="margin:10px 0 0"><button class="sec" id="clNow">⟳ 立即同步</button><button class="sec" id="clOut">登出</button></div>`;
}
async function renderCloud() {
  await clMetaLoad;
  if (!CLOUD.on) { view.innerHTML = `<h2 class="t">雲端同步</h2><div class="panel">這是單機版網址，資料只存在這支手機。同事共用請改用公司的雲端網址。</div>`; return; }
  const me = CLOUD.me, projs = CLOUD.projects || [];
  const locals = (await DB.all("sites")).filter(s => !clCloudSites().has(s.id));
  const recs = await DB.all("records"), cnt = id => recs.filter(r => r.siteId === id).length;
  const writable = projs.filter(p => ["admin", "lead", "member"].includes(p.role));
  const leadOf = projs.filter(p => ["admin", "lead"].includes(p.role));
  view.innerHTML = `<h2 class="t">☁ 雲端同步</h2>
    <div class="panel" id="clState">${clStateHtml()}</div>
    ${me ? `<div class="panel"><b>我參與的專案</b>${projs.length ? projs.map(p => `<div class="clrow"><span>${esc(p.name)}${p.status === "closed" ? "（已關閉）" : ""}</span><small>${esc(clRoleName[p.role] || "")}</small></div>`).join("")
      : `<p class="cnote">${me.admin ? "還沒有雲端專案。按上方 ＋ 新增專案，或用下方「上傳這支手機的舊資料」。" : "管理員還沒有把你加進任何專案，請洽管理員或工程主管。"}</p>`}</div>` : ""}
    ${me && locals.length ? `<div class="panel"><b>上傳這支手機的舊資料</b><p class="cnote">下面這些工地目前只在這支手機。選擇要放到哪個雲端專案，按「上傳」。上傳前會先下載一份備份檔。第一期只同步自主檢查表，其他表單仍留在手機，之後各期會陸續上傳。</p>
      ${locals.map(s => `<div class="climp"><div><b>${esc(s.name)}</b><small>　自主檢查表 ${cnt(s.id)} 份</small></div>
        <div class="field" style="margin:6px 0"><select data-imp="${esc(s.id)}" aria-label="放到哪個專案"><option value="">先不上傳</option>${me.admin ? `<option value="__new">建成新的雲端專案「${esc(s.name)}」</option>` : ""}${writable.map(p => `<option value="${esc(p.id)}" ${p.name === s.name ? "selected" : ""}>併入「${esc(p.name)}」</option>`).join("")}</select></div>
        <button class="sec" data-impgo="${esc(s.id)}">⬆ 上傳</button></div>`).join("")}</div>` : ""}
    ${me && leadOf.length ? `<div class="panel"><b>專案成員</b>
      <div class="field" style="margin:6px 0"><select id="clMP" aria-label="選擇專案">${leadOf.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></div>
      <div id="clMem"><small style="color:var(--mut)">讀取中…</small></div>
      <div class="grid2" style="gap:0 8px"><div class="field"><label>Email</label><input id="clMEmail" type="email" autocomplete="off" placeholder="同事的 Email"></div>
      <div class="field"><label>角色</label><select id="clMRole">${me.admin ? `<option value="lead">工程主管</option>` : ""}<option value="member" selected>一般同事</option><option value="viewer">唯讀</option></select></div></div>
      <div class="row" style="margin:0"><button class="sec" id="clMAdd">＋ 加入專案</button></div></div>` : ""}
    ${me?.admin ? `<div class="panel"><b>加入申請</b><p class="cnote">同事用自己的 Email 登入後可以送出申請。核准後會加進人員名單，再到上方「專案成員」把他加進專案。</p>
      <div id="clReqs"><small style="color:var(--mut)">讀取中…</small></div></div>` : ""}
    ${me?.admin ? `<div class="panel"><b>人員管理（管理員）</b><p class="cnote">只有名單上的 Email 能登入。離職或手機遺失請按「停權」，立刻不能同步。</p>
      <div id="clUsers"><small style="color:var(--mut)">讀取中…</small></div>
      <div class="grid2" style="gap:0 8px"><div class="field"><label>Email</label><input id="clUEmail" type="email" autocomplete="off" placeholder="name@公司.com"></div>
      <div class="field"><label>姓名</label><input id="clUName" placeholder="例如：王小明"></div></div>
      <label style="display:flex;gap:8px;align-items:center;margin:0 0 8px"><input type="checkbox" id="clUAdmin" style="width:22px;height:22px"> 設為管理員（看得到全部專案、可加人停權）</label>
      <div class="row" style="margin:0"><button class="sec" id="clUAdd">＋ 加入人員</button></div></div>` : ""}
    <div class="panel"><small style="color:var(--mut)">權限：管理員看得到全部專案；工程主管、一般同事、唯讀只看得到被加入的專案。一般同事只能修改自己建立的表單；已完成的表單要由工程主管或管理員按「修改」。照片、附加檔案與其他表單在之後的階段上傳。</small></div>`;
  const api = async (path, body) => {
    const r = await fetch("api/" + path, { method: body ? "POST" : "GET", redirect: "manual", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: body && JSON.stringify(body) });
    if (r.type === "opaqueredirect" || r.status === 401) { clSet("login"); throw new Error("請先登入"); }
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.msg || ({ no_user: "這個 Email 還不在人員名單", no_request: "找不到這筆申請，可能已處理過", bad_email: "Email 格式不正確", boot_admin: "設定裡的管理員不能停權或取消管理員", denied: "沒有權限" }[j.error]) || "操作失敗");
    return j;
  };
  const bindState = () => {
    const go = signup => { if (!navigator.onLine) { alert(signup ? "申請需要網路。" : "登入需要網路。"); return; } ls.set("cloudSignup", signup ? "1" : ""); location.href = "api/login"; };
    $("#clLogin")?.addEventListener("click", () => go(false));
    $("#clSignup")?.addEventListener("click", () => go(true));
    if ($("#clAName") && ls.get("cloudSignup", "")) $("#clAName").focus({ preventScroll: true });
    $("#clNow")?.addEventListener("click", () => cloudSync());
    $("#clOut")?.addEventListener("click", () => { if (confirm("要登出嗎？這支手機上已下載的資料會保留，下次登入繼續同步。")) { ls.set("cloudMe", "null"); CLOUD.me = null; location.href = "/cdn-cgi/access/logout"; } });
    $("#clApply")?.addEventListener("click", async e => {
      const name = $("#clAName").value.trim(), note = $("#clANote").value.trim();
      if (!name) { alert("請填姓名，管理員才認得出你。"); $("#clAName").focus(); return; }
      e.target.disabled = true;
      try {
        const r = await fetch("api/apply", { method: "POST", redirect: "manual", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, note }) });
        if (r.type === "opaqueredirect" || r.status === 401) { clSet("login"); return; }
        const j = await r.json().catch(() => ({}));
        if (r.status === 403) { clDenied(j); clToast(j.applied === "pending" ? "已送出申請，等管理員核准" : "沒有送出"); return; }
        if (r.ok) { cloudSync(); return; }   // 送出時剛好已被加入名單
        alert(j.msg || "送出失敗，請稍後再試"); e.target.disabled = false;
      } catch { alert("送出失敗，請確認網路後再試"); e.target.disabled = false; }
    });
  };
  bindState();
  new MutationObserver(bindState).observe($("#clState"), { childList: true });
  // 上傳舊資料
  view.querySelectorAll("[data-impgo]").forEach(b => b.onclick = async () => {
    const sid = b.dataset.impgo, to = view.querySelector(`[data-imp="${CSS.escape(sid)}"]`).value, s = await DB.get("sites", sid);
    if (!to) { alert("請先選擇要放到哪個專案。"); return; }
    const tgt = to === "__new" ? s.name : projs.find(p => p.id === to)?.name;
    if (!confirm(`把「${s.name}」的 ${cnt(sid)} 份自主檢查表上傳到雲端專案「${tgt}」？\n\n會先下載一份備份檔。上傳後同專案的同事都看得到。`)) return;
    b.disabled = true;
    try {
      if (!clToast.bk) { await downloadBackup(); clToast.bk = true; }
      const used = new Set();
      if (to === "__new") {
        const m = clMeta("sites", sid) || { id: clKey("sites", sid), s: "sites", doc: sid };
        await clMetaPut({ ...m, local: false, cloud: true, dirty: true, n: (m.n || 0) + 1 });
        for (const r of recs.filter(r => r.siteId === sid)) { used.add(r.templateId); await DB.put("records", r); }
      } else {
        for (const st of ["records", "workorders", "punch", "pours", "matrecs", "shots", "safety", "logs", "vols"])   // 其他表單先改掛到該專案，留在手機，之後各期上傳
          for (const x of (await DB.all(st)).filter(x => x.siteId === sid)) { x.siteId = to; if (st === "records") used.add(x.templateId); await DB.put(st, x); }
        await DBraw.del("sites", sid); await clMetaDel(clKey("sites", sid));
        if (siteId === sid) { siteId = to; ls.set("siteId", to); }
      }
      if (CLOUD.me.admin || Object.values(CLOUD.me.roles || {}).includes("lead"))
        for (const t of await DB.all("templates")) if (used.has(t.id)) await DB.put("templates", t);
      await loadSites(); await cloudSync(); renderCloud();
    } catch (e) { alert("上傳沒有完成：" + (e.message || e)); b.disabled = false; }
  });
  // 專案成員
  const drawMem = async () => {
    const box = $("#clMem"); if (!box) return;
    try {
      const pid = $("#clMP").value, { members } = await api(`projects/${encodeURIComponent(pid)}/members`);
      box.innerHTML = members.length ? members.map(m => `<div class="clrow"><span>${esc(m.name || m.email)}<small> ${esc(m.email)}${m.disabled ? "・已停權" : ""}</small></span>
        <span><select data-mrole="${esc(m.email)}" aria-label="角色" ${m.role === "lead" && !me.admin ? "disabled" : ""}>${["lead", "member", "viewer"].map(r => `<option value="${r}" ${r === m.role ? "selected" : ""} ${r === "lead" && !me.admin ? "disabled" : ""}>${clRoleName[r]}</option>`).join("")}</select>
        <button class="lnk" data-mdel="${esc(m.email)}" ${m.role === "lead" && !me.admin ? "disabled" : ""}>移出</button></span></div>`).join("") : `<p class="cnote">還沒有成員。</p>`;
    } catch (e) { box.innerHTML = `<p class="cnote">${esc(e.message)}</p>`; }
  };
  if ($("#clMP")) {
    $("#clMP").onchange = drawMem; drawMem();
    $("#clMem").onchange = async e => { const s = e.target.closest("[data-mrole]"); if (!s) return; try { await api(`projects/${encodeURIComponent($("#clMP").value)}/members`, { email: s.dataset.mrole, role: s.value }); } catch (er) { alert(er.message); } drawMem(); };
    $("#clMem").onclick = async e => { const b = e.target.closest("[data-mdel]"); if (!b || !confirm(`把 ${b.dataset.mdel} 移出這個專案？`)) return; try { await api(`projects/${encodeURIComponent($("#clMP").value)}/members`, { email: b.dataset.mdel, role: null }); } catch (er) { alert(er.message); } drawMem(); };
    $("#clMAdd").onclick = async () => { try { await api(`projects/${encodeURIComponent($("#clMP").value)}/members`, { email: $("#clMEmail").value.trim(), role: $("#clMRole").value }); $("#clMEmail").value = ""; } catch (er) { alert(er.message); } drawMem(); };
  }
  // 人員管理
  const drawUsers = async () => {
    const box = $("#clUsers"); if (!box) return;
    try {
      const { users } = await api("users");
      box.innerHTML = users.map(u => `<div class="clrow"><span>${esc(u.name || u.email)}<small> ${esc(u.email)}${u.admin ? "・管理員" : ""}${u.disabled ? "・<b style='color:var(--bad)'>已停權</b>" : ""}</small></span>
        ${u.boot ? `<small style="color:var(--mut)">設定指定</small>` : `<span><button class="lnk" data-uadm="${esc(u.email)}">${u.admin ? "取消管理員" : "設為管理員"}</button><button class="lnk" data-udis="${esc(u.email)}">${u.disabled ? "恢復" : "停權"}</button></span>`}</div>`).join("");
      box.onclick = async e => {
        const a = e.target.closest("[data-uadm],[data-udis]"); if (!a) return;
        const u = users.find(x => x.email === (a.dataset.uadm || a.dataset.udis));
        const next = { email: u.email, name: u.name, admin: a.dataset.uadm ? !u.admin : u.admin, disabled: a.dataset.udis ? !u.disabled : u.disabled };
        if (a.dataset.udis && !u.disabled && !confirm(`停權 ${u.email}？他會立刻不能同步。`)) return;
        try { await api("users", next); } catch (er) { alert(er.message); } drawUsers();
      };
    } catch (e) { box.innerHTML = `<p class="cnote">${esc(e.message)}</p>`; }
  };
  // 加入申請
  const drawReqs = async () => {
    const box = $("#clReqs"); if (!box) return;
    try {
      const { requests } = await api("requests");
      CLOUD.reqs = requests.length; clPaint();
      box.innerHTML = requests.length ? requests.map(q => `<div class="clrow"><span>${esc(q.name)}<small> ${esc(q.email)}${q.note ? "・" + esc(q.note) : ""}・${esc(clStamp(q.created))}</small></span>
        <span><button class="lnk" data-rok="${esc(q.email)}">核准</button><button class="lnk" data-rno="${esc(q.email)}">不核准</button></span></div>`).join("") : `<p class="cnote">目前沒有待核准的申請。</p>`;
    } catch (e) { box.innerHTML = `<p class="cnote">${esc(e.message)}</p>`; }
  };
  if ($("#clReqs")) {
    drawReqs();
    $("#clReqs").onclick = async e => {
      const b = e.target.closest("[data-rok],[data-rno]"); if (!b) return;
      const email = b.dataset.rok || b.dataset.rno, ok = !!b.dataset.rok;
      if (!ok && !confirm(`不核准 ${email}？之後這個 Email 不能再送申請，要加入請你在下方「人員管理」直接加。`)) return;
      try { await api("requests", { email, action: ok ? "approve" : "reject" }); if (ok) clToast(`已加入人員名單。請到「專案成員」把 ${email} 加進專案。`); } catch (er) { alert(er.message); }
      drawReqs(); drawUsers();
    };
  }
  if ($("#clUsers")) {
    drawUsers();
    $("#clUAdd").onclick = async () => { try { await api("users", { email: $("#clUEmail").value.trim(), name: $("#clUName").value.trim(), admin: $("#clUAdmin").checked }); $("#clUEmail").value = $("#clUName").value = ""; $("#clUAdmin").checked = false; } catch (er) { alert(er.message); } drawUsers(); };
  }
  if (!CLOUD.busy && navigator.onLine && (CLOUD.state !== "login" || !me)) cloudSync();
}

/* ---------- 何時同步 ---------- */
if (CLOUD.on) {
  window.addEventListener("online", () => clSoon(500));
  window.addEventListener("offline", () => clSet("offline"));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") clSoon(800); });
  setInterval(() => { if (document.visibilityState === "visible" && CLOUD.me) cloudSync(); }, 60000);
  clMetaLoad.then(() => clSoon(1500));
}
