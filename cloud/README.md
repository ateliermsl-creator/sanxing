# 雲端版（同事共用）設定步驟

工具箱同一套程式有兩種網址：

| 網址 | 資料放哪 | 誰用 |
|---|---|---|
| GitHub Pages（`*.github.io`） | 只在各自手機（單機版，跟以前一樣） | 不登入的人、備援 |
| Cloudflare（`sanxing.<帳號>.workers.dev` 或公司網域） | 手機先存，有網路時同步到公司的 Cloudflare | 公司同事 |

`cloud.js` 只在 Cloudflare 網址啟用，所以 GitHub Pages 版行為完全不變。

## 用到的 Cloudflare 服務

- **Workers**：送出網頁、處理 `/api/*`（`cloud/worker.js`）
- **D1**：資料庫（`cloud/schema.sql`）
- **Zero Trust → Access**：Email 驗證碼登入，只保護 `/api/*`
- （第三期才用）R2：照片與附加檔案

## 第一次設定（約 30 分鐘）

1. **申請 Cloudflare 帳號**（建議用公司信箱），開啟 Zero Trust，選免費方案（50 人以內）。過程可能要求填付款資料，免費方案不會扣款，以畫面說明為準。
2. **建立資料庫**：Workers & Pages → D1 → 建立，名稱 `sanxing`。把資料庫 ID 填進 `cloud/wrangler.toml` 的 `database_id`。到 D1 的 Console 貼上 `cloud/schema.sql` 全文執行。
3. **部署程式**：Workers & Pages → 建立 → 匯入 GitHub 專案 `sanxing`，
   - 部署指令：`npx wrangler deploy -c cloud/wrangler.toml`
   - 之後推送到 `main` 就會自動更新。
   - 「啟用預覽建置」關掉（預覽網址不受登入保護，也用不到）。
   - 目前（2026-11-20）生產分支暫設為雲端版開發分支，PR 合併後改回 `main`。
4. **設定變數**（Worker → 設定 → 變數與密碼，不要寫進 GitHub）：
   - `ADMIN_EMAILS`：管理員 Email，多位用逗號分開（建議兩位，避免只有一個人進得去）
   - `TEAM_DOMAIN`：Zero Trust 的團隊網域，例如 `sanxing.cloudflareaccess.com`
   - `POLICY_AUD`：下一步建立的 Access 應用程式的 AUD 標籤
   - **不要**設定 `DEV_AUTH`（那是本機測試用）
5. **設定登入**（Zero Trust → Access → 應用程式 → 新增 Self-hosted）：
   - 網域：Worker 的網址，路徑填 `api`（只保護 `/api/*`，網頁本身不擋，離線才開得起來）
   - 登入方式：One-time PIN（Email 驗證碼），可再加 Google
   - 原則（Policy）：Allow → Include → Emails ending in `@公司網域`（用個人 Gmail 的話改成 Everyone，由工具箱的人員名單把關）
   - 工作階段時間：30 天
   - 建好後複製 AUD 標籤填到步驟 4
6. 用手機打開 Worker 網址 →「☁ 登入同步」→ 收驗證碼。管理員登入後在「雲端同步」頁加同事、建專案、指派成員。
7. 同事也可以自己登入後送「加入申請」（填姓名、說明），管理員在「雲端同步」頁的「加入申請」按核准，再到「專案成員」把他加進專案。不核准的 Email 不能再送，要加入請管理員在「人員管理」直接加。

也可以只做步驟 1，建立一組權限限於 Workers、D1、Access 的 API Token，存到 Claude 的環境密碼，其他步驟由 Claude 代為設定。

## 權限

| 可以做的事 | 管理員 | 工程主管 | 一般同事 | 唯讀 |
|---|---|---|---|---|
| 看得到的專案 | 全部 | 被指派的 | 被指派的 | 被指派的 |
| 新增、修改專案名稱 | 可 | — | — | — |
| 加人、停權 | 可 | — | — | — |
| 專案成員 | 可 | 可（不能指派主管） | — | — |
| 填新表單 | 可 | 可 | 可 | — |
| 改別人填的 | 可 | 可 | — | — |
| 已完成的按「修改」 | 可 | 可 | — | — |
| 發布自訂範本給全公司 | 可 | 可 | — | — |

雲端（`worker.js`）一定會檢查；手機畫面（`cloud.js` 的 `cloudRO`、`cloudCanReopen`）先擋住不能按的按鈕。

## 同步與衝突

- 每份表單有「版次」。上傳時帶「我開始改時的版次」，中間沒人改就直接寫入。
- 有人改過：不同欄位自動合併；有 `id` 的明細列（澆置車次、簽到人、日誌列）依 id 合併；同一欄位兩邊都改 → 後上傳為準，另一個值留在修改紀錄（`history`）；簽名兩邊都簽 → 先簽為準。
- 雲端已「完成」、我離線時改了 → 不寫入正本，另存成衝突副本（`history.note = 'conflict'`）。
- 一人刪除、一人修改 → 修改優先。刪除只是標記，資料保留。
- 每一版都存在 `history`，可查誰在何時改了什麼。

## 本機測試

```bash
npm i -g wrangler   # 或在任意資料夾 npm i wrangler
npx wrangler d1 execute sanxing --local --file=cloud/schema.sql -c cloud/wrangler.toml
npx wrangler dev -c cloud/wrangler.toml --local --port 8787 --var DEV_AUTH:1 --var ADMIN_EMAILS:boss@test.tw
node tests/cloud_api.js      # 權限與合併規則
node tests/cloud_e2e.js      # 兩支手機畫面：同步、離線合併、唯讀、舊資料上傳
node tests/cloud_jwt.mjs     # 登入通行證驗證（不需要 wrangler）
```

## 分期

- **第一期（本次）**：登入、人員與專案成員、自主檢查表與自訂範本同步、舊資料上傳。
- 第二期（已上線 2026-11-20）：施工日誌、材料進場、勤前教育、混凝土澆置、點工單、缺失、方數。公司共用設定（材料類別、勤前教育預設、養護天數）尚未同步。同日加入結構計算「存到專案」（calcs）。
- 第三期：照片、簽名、附加檔案放 R2；衝突副本檢視、救回已刪除；結構計算「存到專案」。
