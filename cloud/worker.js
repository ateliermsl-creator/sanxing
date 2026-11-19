/* 三星蔥工具箱 雲端同步（Cloudflare Worker）
   - 網頁本身（index.html、*.js）由 Workers 靜態資產直接送出，這支只處理 /api/*
   - 登入交給 Cloudflare Access（Email 驗證碼），這裡只驗證 Access 簽發的通行證（JWT），不存密碼
   - 權限：管理員看全部；其他人依「專案成員」的角色（lead 工程主管／member 一般同事／viewer 唯讀）
   - 資料：各表單整份 JSON 存在 docs.data，手機收到後一律再經 safe.js 的 CLEAN 清理才寫入
   需要的設定（Cloudflare 後台 → Workers → 設定 → 變數，不要寫進 GitHub）：
     TEAM_DOMAIN  例如 sanxing.cloudflareaccess.com
     POLICY_AUD   Access 應用程式的 Audience（AUD）標籤
     ADMIN_EMAILS 管理員 Email，多位用逗號分開（永遠是管理員，避免把自己停權後進不來）
   本機測試：DEV_AUTH = "1" 且網址是 localhost 時，改用 X-Dev-Email 標頭當登入者 */

const ROLES = ["lead", "member", "viewer"];
const SYNC_KINDS = ["records", "templates"];          // 第一期同步的表單；之後各期在這裡加
const MAX_DOC = 1500000;                               // 單份表單上限（字元），D1 一列上限 2 MB
const PULL_LIMIT = 400;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const now = () => Date.now();
const lower = s => String(s || "").trim().toLowerCase();
const okEmail = s => /^[^@\s,;<>"]{1,64}@[^@\s,;<>"]{1,190}\.[a-z]{2,}$/i.test(s);
const okId = s => typeof s === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s);
const str = (s, n = 200) => String(s ?? "").slice(0, n);

/* ---------- 登入：驗證 Cloudflare Access 的通行證 ---------- */
let certCache = { at: 0, keys: [] };
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function accessKeys(team) {
  if (now() - certCache.at < 3600e3 && certCache.keys.length) return certCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  const j = await r.json();
  certCache = { at: now(), keys: j.keys || [] };
  return certCache.keys;
}
async function verifyAccess(token, env) {
  const [h, p, s] = String(token || "").split(".");
  if (!h || !p || !s) return null;
  const head = JSON.parse(new TextDecoder().decode(b64u(h)));
  const body = JSON.parse(new TextDecoder().decode(b64u(p)));
  const team = String(env.TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!team || !env.POLICY_AUD) return null;
  const aud = Array.isArray(body.aud) ? body.aud : [body.aud];
  if (!aud.includes(env.POLICY_AUD)) return null;
  if (body.iss !== `https://${team}`) return null;
  if (!(body.exp * 1000 > now())) return null;
  for (let round = 0; round < 2; round++) {
    const jwk = (await accessKeys(team)).find(k => k.kid === head.kid);
    if (jwk) {
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), new TextEncoder().encode(h + "." + p));
      return ok ? lower(body.email) : null;
    }
    certCache.at = 0;   // 金鑰輪替：重抓一次
  }
  return null;
}
async function whoIs(req, env) {
  const url = new URL(req.url);
  if (env.DEV_AUTH === "1" && ["localhost", "127.0.0.1"].includes(url.hostname)) return lower(req.headers.get("x-dev-email"));
  const cookie = (req.headers.get("cookie") || "").match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  const token = req.headers.get("cf-access-jwt-assertion") || (cookie && cookie[1]);
  try { return await verifyAccess(token, env); } catch { return null; }
}

/* ---------- 人與權限 ---------- */
const adminList = env => String(env.ADMIN_EMAILS || "").split(",").map(lower).filter(Boolean);
async function loadMe(db, env, email) {
  if (!email) return null;
  let u = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const boot = adminList(env).includes(email);
  if (!u && boot) {   // 設定裡的管理員第一次登入時自動建立
    const t = now();
    await db.prepare("INSERT OR IGNORE INTO users (email, name, admin, disabled, created, updated) VALUES (?, '', 1, 0, ?, ?)").bind(email, t, t).run();
    u = { email, name: "", admin: 1, disabled: 0 };
  }
  if (!u) return { email, missing: true };
  if (u.disabled && !boot) return { email, disabled: true };
  const admin = !!u.admin || boot;
  const rows = admin ? [] : (await db.prepare("SELECT project_id, role FROM members WHERE email = ?").bind(email).all()).results;
  const roles = Object.fromEntries(rows.map(r => [r.project_id, r.role]));
  return { email, name: u.name || "", admin, roles };
}
const roleIn = (me, pid) => me.admin ? "admin" : (me.roles[pid] || "");
const canWrite = r => ["admin", "lead", "member"].includes(r);
const isLead = r => r === "admin" || r === "lead";
const leadAnywhere = me => me.admin || Object.values(me.roles).includes("lead");

/* ---------- 三方合併：兩人離線改同一份 ----------
   base = 我開始改時的版本、theirs = 雲端現在的版本、mine = 我這次上傳的
   不同欄位各取改過的那邊；明細列（有 id 的陣列）依 id 合併；同一欄位兩邊都改 → 後上傳（mine）為準，另一個值記進 notes；
   簽名（sigs 底下）兩邊都簽 → 先簽的（theirs）為準 */
const isObj = v => v && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idList = v => Array.isArray(v) && v.length > 0 && v.every(x => isObj(x) && typeof x.id === "string");
function merge3(base, theirs, mine, path, notes) {
  if (same(mine, theirs)) return mine;
  if (same(base, mine)) return theirs;
  if (same(base, theirs)) return mine;
  const inSig = path.includes("sigs") || /sig$/i.test(path[path.length - 1] || "");
  if (isObj(theirs) && isObj(mine)) {
    const out = {}, b = isObj(base) ? base : {};
    for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
      const v = merge3(b[k], theirs[k], mine[k], [...path, k], notes);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if ((idList(theirs) || theirs?.length === 0) && (idList(mine) || mine?.length === 0) && (base === undefined || Array.isArray(base))) {
    const B = new Map((base || []).filter(isObj).map(x => [x.id, x])), T = new Map(theirs.map(x => [x.id, x])), M = new Map(mine.map(x => [x.id, x]));
    const out = [];
    for (const t of theirs) {
      if (M.has(t.id)) out.push(merge3(B.get(t.id), t, M.get(t.id), [...path, t.id], notes));
      else if (!B.has(t.id) || !same(B.get(t.id), t)) out.push(t);        // 對方新增，或我刪了但對方又改過 → 保留
    }
    for (const m of mine) if (!T.has(m.id) && (!B.has(m.id) || !same(B.get(m.id), m))) out.push(m);   // 我新增的，或對方刪了但我改過
    return out;
  }
  if (Array.isArray(theirs) && Array.isArray(mine) && theirs.every(n => typeof n === "number") && mine.every(n => typeof n === "number"))
    return [...new Set([...theirs, ...mine])].sort((a, b) => a - b);      // 例如完成後修改時間 reopened
  if (path.length === 1 && path[0] === "updated") return Math.max(Number(theirs) || 0, Number(mine) || 0);
  if (inSig && theirs) { notes.push({ path: path.join("."), kept: "theirs" }); return theirs; }
  notes.push({ path: path.join("."), kept: "mine" });
  return mine;
}

/* ---------- 寫入一份表單 ---------- */
async function nextRevBatch(db, stmt) {
  // 流水號 +1 與寫入放在同一個交易，順序就等於寫入順序
  const res = await db.batch([db.prepare("UPDATE meta SET v = v + 1 WHERE k = 'rev'"), stmt]);
  return res[1].meta.changes;
}
async function saveDoc(db, me, cur, item, data, note) {
  const t = now(), v = cur ? cur.version + 1 : 1, text = JSON.stringify(data);
  const locked = Number(data.locked) > 0 ? Number(data.locked) : 0, deleted = item.del ? t : 0;
  let changes;
  if (cur) {
    changes = await nextRevBatch(db, db.prepare(`UPDATE docs SET data = ?, version = ?, rev = (SELECT v FROM meta WHERE k = 'rev'), updated_by = ?, updated = ?, locked = ?, deleted = ?, project_id = ?
      WHERE id = ? AND version = ?`).bind(text, v, me.email, t, locked, deleted, item.project, item.id, cur.version));
  } else {
    changes = await nextRevBatch(db, db.prepare(`INSERT OR IGNORE INTO docs (id, kind, project_id, data, version, rev, created_by, updated_by, created, updated, locked, deleted)
      VALUES (?, ?, ?, ?, 1, (SELECT v FROM meta WHERE k = 'rev'), ?, ?, ?, ?, ?, ?)`).bind(item.id, item.kind, item.project, text, me.email, me.email, t, t, locked, deleted));
  }
  if (!changes) return null;   // 剛好有人搶先寫入：交給呼叫端重試
  await db.prepare("INSERT INTO history (doc_id, version, data, by, at, note) VALUES (?, ?, ?, ?, ?, ?)").bind(item.id, v, text, me.email, t, note || "").run();
  return { version: v, created_by: cur ? cur.created_by : me.email };
}
async function pushOne(db, me, item) {
  if (!okId(item.id) || !SYNC_KINDS.includes(item.kind)) return { id: item.id, status: "bad" };
  const data = item.del ? null : item.data;
  if (!item.del && (!isObj(data) || data.id !== item.id)) return { id: item.id, status: "bad" };
  if (!item.del && JSON.stringify(data).length > MAX_DOC) return { id: item.id, status: "too_big" };
  item.project = item.kind === "templates" ? "" : str(item.project, 64);
  if (item.kind === "records" && !item.del && data.siteId !== item.project) return { id: item.id, status: "bad" };
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await db.prepare("SELECT * FROM docs WHERE id = ?").bind(item.id).first();
    if (cur && cur.kind !== item.kind) return { id: item.id, status: "bad" };
    const pid = cur ? cur.project_id : item.project;
    const role = item.kind === "templates" ? (leadAnywhere(me) ? "lead" : (Object.keys(me.roles).length ? "viewer" : "")) : roleIn(me, pid);
    const curData = cur ? JSON.parse(cur.data) : null;
    const deny = msg => ({ id: item.id, status: "denied", msg, ...(cur ? { version: cur.version, data: curData, deleted: !!cur.deleted, by: cur.created_by } : { gone: true }) });
    if (item.kind === "records" && item.project !== pid && !(isLead(roleIn(me, item.project)) && isLead(role))) return deny("不能把紀錄移到別的專案");
    if (!canWrite(role)) return deny(item.kind === "templates" ? "自訂範本要由工程主管或管理員發布到公司共用" : role === "viewer" ? "你在這個專案是唯讀" : "你不是這個專案的成員");
    const own = !cur || cur.created_by === me.email;
    if (!isLead(role) && !own) return deny("一般同事只能修改自己建立的表單");
    if (!cur) {
      if (item.del) return { id: item.id, status: "ok", version: 0, gone: true };
      const r = await saveDoc(db, me, null, item, data);
      if (r) return { id: item.id, status: "ok", version: r.version, by: r.created_by };
      continue;
    }
    const base = Number(item.base) || 0, stale = base !== cur.version;
    if (item.del) {
      if (cur.deleted) return { id: item.id, status: "ok", version: cur.version, gone: true };
      if (cur.locked && role !== "admin") return deny("已完成的表單不能刪除");
      if (stale && base) {   // 我刪除時，別人剛好改過 → 修改優先，不刪
        return { id: item.id, status: "merged", msg: "別人剛修改過這份，沒有刪除", version: cur.version, data: curData, by: cur.created_by };
      }
      const r = await saveDoc(db, me, cur, item, curData, "delete");
      if (r) return { id: item.id, status: "ok", version: r.version, gone: true };
      continue;
    }
    if (!stale) {
      if (cur.locked && !(Number(data.locked) > 0) && !isLead(role)) return deny("已完成的表單要由工程主管或管理員按「修改」");
      const r = await saveDoc(db, me, cur, item, data, cur.deleted ? "restore" : "");
      if (r) return { id: item.id, status: "ok", version: r.version, by: r.created_by };
      continue;
    }
    // 中間有別人改過
    if (cur.locked && !same(data, curData)) {   // 雲端已完成：我的版本另存成衝突副本，不寫進正本
      await db.prepare("INSERT INTO history (doc_id, version, data, by, at, note) VALUES (?, ?, ?, ?, ?, 'conflict')").bind(item.id, cur.version, JSON.stringify(data), me.email, now()).run();
      return { id: item.id, status: "conflict", msg: "這份在雲端已完成，你離線時的修改已另存成衝突副本，請找工程主管確認", version: cur.version, data: curData, by: cur.created_by };
    }
    let baseData;
    if (base > 0) { const h = await db.prepare("SELECT data FROM history WHERE doc_id = ? AND version = ? AND note != 'conflict' ORDER BY seq DESC LIMIT 1").bind(item.id, base).first(); baseData = h ? JSON.parse(h.data) : undefined; }
    const notes = [];
    const merged = cur.deleted ? data : merge3(baseData, curData, data, [], notes);
    const r = await saveDoc(db, me, cur, item, merged, cur.deleted ? "restore" : notes.length ? "merged:" + JSON.stringify(notes).slice(0, 2000) : "merged");
    if (r) return { id: item.id, status: "merged", msg: cur.deleted ? "這份被別人刪除了，你的修改已把它恢復" : notes.length ? "有人同時修改了同一欄位，請確認內容" : "", notes, version: r.version, data: merged, by: r.created_by };
  }
  return { id: item.id, status: "retry" };
}

/* ---------- 專案 ---------- */
async function visibleProjects(db, me) {
  const rows = (await db.prepare("SELECT * FROM projects ORDER BY name").all()).results;
  return rows.filter(p => me.admin || me.roles[p.id]).map(p => ({ id: p.id, name: p.name, company: p.company, status: p.status, role: roleIn(me, p.id) }));
}
async function upsertProject(db, me, p) {
  if (!me.admin) return { id: p.id, status: "denied", msg: "只有管理員可以新增或修改專案" };
  if (!okId(p.id) || !str(p.name).trim()) return { id: p.id, status: "bad" };
  const t = now(), status = p.status === "closed" ? "closed" : "open";
  await db.prepare(`INSERT INTO projects (id, name, company, status, created, updated, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, company = excluded.company, status = excluded.status, updated = excluded.updated`)
    .bind(p.id, str(p.name).trim(), str(p.company), status, t, t, me.email).run();
  return { id: p.id, status: "ok" };
}

/* ---------- 加入申請：不在名單的人登入後可以送申請，管理員核准才會加入人員名單 ---------- */
let reqReady = false;
async function reqTable(db) {   // 舊資料庫沒有這張表時自動補上（schema.sql 也有）
  if (reqReady) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS requests (email TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', created INTEGER NOT NULL, decided INTEGER NOT NULL DEFAULT 0, decided_by TEXT NOT NULL DEFAULT '')`).run();
  reqReady = true;
}
const REQ_MAX = 100;   // 同時等待核准的申請上限，避免被灌爆
async function reqCount(db, me) {
  if (!me.admin) return 0;
  await reqTable(db);
  return (await db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'").first()).n;
}
async function notMember(req, db, url, email, body) {
  await reqTable(db);
  const path = url.pathname.replace(/^.*?\/api\//, "");
  let row = await db.prepare("SELECT name, note, status FROM requests WHERE email = ?").bind(email).first();
  if (path === "apply" && req.method === "POST") {
    if (row?.status === "rejected") return json({ error: "not_member", email, applied: "rejected" }, 403);
    const name = str(body.name, 30).trim(), note = str(body.note, 100).trim();
    if (!name) return json({ error: "bad_name", msg: "請填姓名" }, 400);
    if (!row && (await db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status = 'pending'").first()).n >= REQ_MAX)
      return json({ error: "too_many", msg: "目前申請太多，請直接聯絡管理員" }, 429);
    await db.prepare(`INSERT INTO requests (email, name, note, status, created) VALUES (?, ?, ?, 'pending', ?)
      ON CONFLICT(email) DO UPDATE SET name = excluded.name, note = excluded.note`).bind(email, name, note, now()).run();
    row = { name, note, status: "pending" };
  }
  return json({ error: "not_member", email, applied: row?.status || "", name: row?.name || "", note: row?.note || "" }, 403);
}

/* ---------- API ---------- */
async function api(req, env, url) {
  const db = env.DB, path = url.pathname.replace(/^.*?\/api\//, "");
  if (path === "login") return Response.redirect(url.origin + "/#/cloud", 302);   // Access 登入完成後回到工具箱
  const email = await whoIs(req, env);
  if (!email) return json({ error: "login" }, 401);
  const me = await loadMe(db, env, email);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (me.missing) return notMember(req, db, url, email, body);
  if (me.disabled) return json({ error: "disabled", email }, 403);

  if (path === "me") return json({ me, projects: await visibleProjects(db, me), reqs: await reqCount(db, me) });

  if (path === "sync" && req.method === "POST") {
    const results = [], projResults = [];
    for (const p of (Array.isArray(body.projects) ? body.projects : []).slice(0, 50)) projResults.push(await upsertProject(db, me, p));
    const me2 = projResults.length ? await loadMe(db, env, email) : me;
    for (const it of (Array.isArray(body.push) ? body.push : []).slice(0, 200)) results.push(await pushOne(db, me2, { ...it }));
    const projects = await visibleProjects(db, me2), vis = projects.map(p => p.id);
    const known = new Set(Array.isArray(body.known) ? body.known : []);
    const cursor = Math.max(0, Number(body.cursor) || 0);
    const kinds = SYNC_KINDS.map(() => "?").join(",");
    const visQ = vis.length ? vis.map(() => "?").join(",") : "''";
    const rows = (await db.prepare(`SELECT id, kind, project_id, data, version, rev, created_by, deleted FROM docs WHERE rev > ? AND kind IN (${kinds}) AND (project_id = '' OR project_id IN (${visQ})) ORDER BY rev LIMIT ${PULL_LIMIT}`)
      .bind(cursor, ...SYNC_KINDS, ...vis).all()).results;
    const more = rows.length === PULL_LIMIT;
    const newCursor = more ? rows[rows.length - 1].rev : (await db.prepare("SELECT v FROM meta WHERE k = 'rev'").first()).v;
    // 剛被加進來的專案：之前的資料流水號比較小，整個專案補給他
    const fresh = vis.filter(id => !known.has(id));
    let extra = [];
    if (fresh.length && cursor > 0) extra = (await db.prepare(`SELECT id, kind, project_id, data, version, rev, created_by, deleted FROM docs WHERE rev <= ? AND kind IN (${kinds}) AND project_id IN (${fresh.map(() => "?").join(",")})`)
      .bind(cursor, ...SYNC_KINDS, ...fresh).all()).results;
    const pull = [...extra, ...rows].map(r => ({ id: r.id, kind: r.kind, project: r.project_id, version: r.version, by: r.created_by, deleted: !!r.deleted, data: r.deleted ? null : JSON.parse(r.data) }));
    return json({ me: me2, projects, results, projResults, pull, cursor: newCursor, more, reqs: await reqCount(db, me2) });
  }

  // 自己的姓名（每個人都可以改自己的）
  if (path === "profile" && req.method === "POST") {
    const name = str(body.name, 50).trim();
    if (!name) return json({ error: "bad_name", msg: "姓名不能空白" }, 400);
    await db.prepare("UPDATE users SET name = ?, updated = ? WHERE email = ?").bind(name, now(), me.email).run();
    return json({ name });
  }
  // 人員管理（管理員）
  if (path === "users") {
    if (!me.admin) return json({ error: "denied" }, 403);
    if (req.method === "POST") {
      const e = lower(body.email);
      if (!okEmail(e)) return json({ error: "bad_email" }, 400);
      if (adminList(env).includes(e) && (body.disabled || body.admin === false)) return json({ error: "boot_admin" }, 400);
      const t = now();
      await db.prepare(`INSERT INTO users (email, name, admin, disabled, created, updated) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET name = excluded.name, admin = excluded.admin, disabled = excluded.disabled, updated = excluded.updated`)
        .bind(e, str(body.name, 50), body.admin ? 1 : 0, body.disabled ? 1 : 0, t, t).run();
      await reqTable(db);
      await db.prepare("DELETE FROM requests WHERE email = ?").bind(e).run();   // 直接加入的人，之前的申請（含不核准）一併清掉
    }
    const users = (await db.prepare("SELECT email, name, admin, disabled FROM users ORDER BY disabled, name, email").all()).results;
    const boot = adminList(env);
    return json({ users: users.map(u => ({ ...u, admin: !!u.admin || boot.includes(u.email), disabled: !!u.disabled, boot: boot.includes(u.email) })) });
  }
  // 加入申請（管理員）：核准 → 加進人員名單（之後再到「專案成員」指派專案）；不核准 → 標記，對方不能再送
  if (path === "requests") {
    if (!me.admin) return json({ error: "denied" }, 403);
    await reqTable(db);
    if (req.method === "POST") {
      const e = lower(body.email), t = now();
      const r = await db.prepare("SELECT * FROM requests WHERE email = ? AND status = 'pending'").bind(e).first();
      if (!r) return json({ error: "no_request", msg: "找不到這筆申請，可能已處理過" }, 400);
      if (body.action === "approve") {
        await db.batch([
          db.prepare("INSERT INTO users (email, name, admin, disabled, created, updated) VALUES (?, ?, 0, 0, ?, ?) ON CONFLICT(email) DO NOTHING").bind(e, str(body.name ?? r.name, 50).trim() || r.name, t, t),
          db.prepare("DELETE FROM requests WHERE email = ?").bind(e)
        ]);
      } else if (body.action === "reject") {
        await db.prepare("UPDATE requests SET status = 'rejected', decided = ?, decided_by = ? WHERE email = ?").bind(t, me.email, e).run();
      } else return json({ error: "bad_action" }, 400);
    }
    const list = (await db.prepare("SELECT email, name, note, created FROM requests WHERE status = 'pending' ORDER BY created").all()).results;
    return json({ requests: list });
  }
  // 專案成員（管理員、該專案的工程主管）
  const m = path.match(/^projects\/([A-Za-z0-9_-]{1,64})\/members$/);
  if (m) {
    const pid = m[1], role = roleIn(me, pid);
    if (!isLead(role)) return json({ error: "denied" }, 403);
    if (req.method === "POST") {
      const e = lower(body.email), r = body.role;
      const u = await db.prepare("SELECT email FROM users WHERE email = ?").bind(e).first();
      if (!u) return json({ error: "no_user", msg: "這個 Email 還不在人員名單，請管理員先加入" }, 400);
      if (r && !ROLES.includes(r)) return json({ error: "bad_role" }, 400);
      if (r === "lead" && !me.admin) return json({ error: "denied", msg: "工程主管只能由管理員指派" }, 403);
      const old = await db.prepare("SELECT role FROM members WHERE project_id = ? AND email = ?").bind(pid, e).first();
      if (old && old.role === "lead" && !me.admin) return json({ error: "denied", msg: "工程主管只能由管理員調整" }, 403);
      if (r) await db.prepare("INSERT INTO members (project_id, email, role, added, added_by) VALUES (?, ?, ?, ?, ?) ON CONFLICT(project_id, email) DO UPDATE SET role = excluded.role")
        .bind(pid, e, r, now(), me.email).run();
      else await db.prepare("DELETE FROM members WHERE project_id = ? AND email = ?").bind(pid, e).run();
    }
    const list = (await db.prepare("SELECT m.email, m.role, u.name, u.disabled FROM members m LEFT JOIN users u ON u.email = m.email WHERE m.project_id = ? ORDER BY m.role, u.name").bind(pid).all()).results;
    return json({ members: list.map(x => ({ ...x, disabled: !!x.disabled })) });
  }
  return json({ error: "not_found" }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.includes("/api/")) {
      try { return await api(req, env, url); }
      catch (e) { return json({ error: "server", msg: String(e && e.message || e).slice(0, 200) }, 500); }
    }
    return env.ASSETS.fetch(req);
  }
};
export { merge3, verifyAccess };
