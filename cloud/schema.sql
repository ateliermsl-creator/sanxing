-- 三星蔥工具箱 雲端資料庫（Cloudflare D1）
-- 建立：npx wrangler d1 execute sanxing --remote --file=cloud/schema.sql -c cloud/wrangler.toml
-- 只新增、不刪除：之後要加欄位請另寫 ALTER，不要改這裡的既有欄位

-- 人員：用 Email 認人（登入由 Cloudflare Access 寄驗證碼）
CREATE TABLE IF NOT EXISTS users (
  email    TEXT PRIMARY KEY,          -- 一律小寫
  name     TEXT NOT NULL DEFAULT '',
  admin    INTEGER NOT NULL DEFAULT 0, -- 1 = 管理員（看得到全部專案、加人停權）
  disabled INTEGER NOT NULL DEFAULT 0, -- 1 = 停權（離職、手機遺失）
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL
);

-- 專案（手機上的「工地」，id 與手機相同）
CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  company    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'open',  -- open 進行中／closed 已關閉
  created    INTEGER NOT NULL,
  updated    INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);

-- 專案成員：lead 工程主管／member 一般同事／viewer 唯讀（管理員不用列，自動看得到全部）
CREATE TABLE IF NOT EXISTS members (
  project_id TEXT NOT NULL,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL,
  added      INTEGER NOT NULL,
  added_by   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, email)
);
CREATE INDEX IF NOT EXISTS members_email ON members(email);

-- 表單：各種表單整份 JSON 存在 data，kind = 手機上的資料表名稱（records、templates…）
CREATE TABLE IF NOT EXISTS docs (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  project_id TEXT NOT NULL DEFAULT '',   -- 公司共用（例如範本）為空字串
  data       TEXT NOT NULL,
  version    INTEGER NOT NULL,           -- 每改一次 +1，用來判斷中間有沒有別人改過
  rev        INTEGER NOT NULL,           -- 全庫流水號，手機用來只抓「上次之後」改過的
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created    INTEGER NOT NULL,
  updated    INTEGER NOT NULL,
  locked     INTEGER NOT NULL DEFAULT 0, -- 完成時間（0 = 未完成）
  deleted    INTEGER NOT NULL DEFAULT 0  -- 刪除時間（0 = 未刪除；保留 30 天可救回）
);
CREATE INDEX IF NOT EXISTS docs_rev ON docs(rev);
CREATE INDEX IF NOT EXISTS docs_project ON docs(project_id, kind);

-- 修改紀錄：每一版都留，也放「衝突副本」（note = 'conflict'）
CREATE TABLE IF NOT EXISTS history (
  seq     INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id  TEXT NOT NULL,
  version INTEGER NOT NULL,
  data    TEXT NOT NULL,
  by      TEXT NOT NULL,
  at      INTEGER NOT NULL,
  note    TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS history_doc ON history(doc_id, version);

-- 加入申請：不在名單的人登入後送出，管理員核准才加入 users（worker.js 也會自動補建這張表）
CREATE TABLE IF NOT EXISTS requests (
  email      TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  note       TEXT NOT NULL DEFAULT '',          -- 申請人自己填的說明（哪個工地、職稱）
  status     TEXT NOT NULL DEFAULT 'pending',   -- pending 等待核准／rejected 不核准（不能再送）
  created    INTEGER NOT NULL,
  decided    INTEGER NOT NULL DEFAULT 0,
  decided_by TEXT NOT NULL DEFAULT ''
);

-- 流水號
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
INSERT OR IGNORE INTO meta (k, v) VALUES ('rev', 0);
