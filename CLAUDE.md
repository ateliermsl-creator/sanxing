# 三星蔥工具箱（sanxing）— 交接說明

給接手維護的 Claude 與人。使用者是建築師、土木技師，在營造公司擔任協理；這是給工地現場用的離線 PWA（手機優先，繁體中文）。
網站：GitHub Pages（`main` 分支、根目錄），推送後約 1～2 分鐘自動更新：https://ateliermsl-creator.github.io/sanxing/

## 技術概況
- 純前端、無框架、無建置步驟。直接編輯檔案即可。第三方只有 `lib/html2canvas`、`lib/jspdf`（皆 MIT，授權檔在 `lib/`）。
- 資料只存在使用者手機瀏覽器的 IndexedDB（庫名 `avocado-toolbox`，歷史原因沒改名，**不要改**，會讓既有資料消失）。目前版本 **14**，資料表：`sites records templates photos workorders punch pours matrecs matcats files shots safety logs vols calcs sync`（`sync` 是雲端同步記錄哪一份改過，不是使用者資料，**不放進備份**）。
- **雲端版（同事共用，2026-11-20 使用者同意，分三期）**：同一套程式另部署到 Cloudflare（Workers＋D1＋Access），`cloud.js` 只在非 `github.io`、非 localhost 的網址啟用（本機測試設 localStorage `cloudDev=1`），GitHub Pages 版仍是單機版、行為不變。伺服器在 `cloud/`，設定步驟、權限表、衝突規則見 `cloud/README.md`。第一期同步 `sites`（＝雲端專案）、`records`、`templates`；第二期（2026-11-20 使用者要求提前做）加 `punch logs matrecs safety pours workorders vols`；同日再加 `calcs`（結構計算存到專案，`CLOUD.phase` "3"）。照片（`photos`、`shots`）、附加檔案、公司共用設定（`matcats`）還沒同步（第三期）。要同步的表加到 `cloud.js` 的 `CLOUD.stores` 與 `worker.js` 的 `SYNC_KINDS`，並把 `CLOUD.phase` 加 1（已登入的手機會把專案裡原有的資料補上傳一次）。第二期表單沒有權限時由 `cloud.js` 的 `clGuard`（包住 `route`）整頁改唯讀；新增表單頁要加進 `CL_PAGES`。
- GitHub Pages 單機版沒有伺服器、沒有帳號。`localStorage` 只放個人偏好（上次選的工地等）。**公司名稱（各表單抬頭）存在每個工地的 `sites.company`**，用 `siteCompany(siteId)` 取（2026-11-19 使用者反映切換專案後抬頭沒換）；`localStorage` 的 `company` 只當新增工地的預設值，舊工地第一次載入時由 `loadSites` 帶入。新單據抬頭一律用 `siteCompany(紀錄的 siteId)`。
- 路由是 hash（`#/頁面/id/子頁`），在 `app.js` 的 `route()` 分派，各功能一支檔案：

| 檔案 | 內容 |
|---|---|
| `app.js` | 資料庫包裝、路由、首頁、自主檢查表、備份／匯入、相機、燈箱、工地設定。首頁最上方一行 `.htop`：左邊備份提醒小標籤 `#hBak`（`checkBackup` 同時寫它，首頁時 CSS 藏掉上方整條 `#backupWarn`）、右邊「所在專案」小標籤 `.hbar`（2026-11-17 使用者由「目前工程」改名）（色調同備份提醒；透明 `#hSite` 疊在名稱上點了切換，✎ 修改、＋ 新增；≤ 420px 藏「所在專案：」字樣、名稱過長省略；沒有工地時顯示「尚未建立專案，新增專案」；2026-11-17 使用者要求低調、窄、不擋主要功能，備份提醒一併排；標籤用「工程」是使用者選的，資料仍是工地），與內頁頂端 `#siteSelect` 共用 `siteId`（2026-11-17 使用者要求，「工程專案」就是既有的「工地」，不另建資料；2026-11-17 曾改成「名牌」樣式（朱印＋襯線字，PR #26），使用者覺得不好看已還原，不要再改回名牌） 自主檢查表入口 `#/checklist` 是所在專案的已填紀錄列表（狀態／表單或類別／搜尋篩選，`clFilter clTpl clQuery`），「＋ 新增檢查表」到 `#/checklist/new` 選表（最近用過＋類別＋搜尋），每次填表都是 `records` 一筆獨立紀錄；表單底部「同一張表再填一份」。回列表時 `clPurgeBlank` 清掉完全沒填的空白紀錄（廠商、日期是自動帶入不算；`clDirty` 先存未寫入的輸入）（2026-11-17 使用者要求）。表單底部「💾 儲存並返回」＋「✔ 完成檢查」：完成後 `rec.locked`（時間）整份唯讀、列表顯示 🔒 已完成、不能直接刪除、不會被當空白清掉；「✎ 修改這份紀錄」解除並把時間記進 `rec.reopened`（畫面顯示「完成後曾修改」，PDF 不印）。用語「完成檢查／修改」是 2026-11-17 使用者用決策卡選的（不要改回「鎖定／解除鎖定」，也不要加簽名時跳出詢問）。 |
| `templates.js` | 內建自主檢查表範本（新增範本在這裡加一筆）。2026-11-16 依使用者提供的「土建自主檢查表」Word 轉入 37 張（id 依類別前綴 `fm_ rb_ cc_ tp_ mt_ fn_ me_ ls_`），原表紅字解說存在 `note`：填表點 ⓘ 才顯示、預覽／PDF 預設不印，勾「PDF 附解說」（localStorage `pvNotes`）才印。**紀錄以項目順序對應範本，已上線範本只能在最後加項目**。舊示範表（formwork、rebar、concrete、mep_embed）標 `retired: true`：使用者要求以新表為主，不列在選單，只留給舊紀錄開啟 |
| `safe.js` | **匯入備份的驗證與清理**，以及 `safeImg` / `safeId` |
| `attach.js` | 附加檔案（Blob，單檔 10 MB） |
| `pdf.js` | 「分享 PDF」：html2canvas + jsPDF，把 `.paper` 轉成 A4 |
| `workorder.js punch.js pour.js material.js` | 點工單、缺失改善、混凝土澆置抽驗、材料進場驗收 |
| `cure.js` | 試體養護與拆模追蹤（讀澆置資料） |
| `shot.js` | 施工照片（電子黑板相機）、照片冊 |
| `safety.js` | 職安衛勤前教育／危害告知簽到 |
| `log.js` | 施工日誌（B14-4 格式） |
| `calc.js` | 工程計算機（`#/calc`，八個日常分頁）＋「結構計算」路由（`#/struct`、`renderStruct`）。結構計算 2026-11-15 使用者同意從計算機拆出：分類在 `STRUCT_CATS`（模板／施工架／混凝土構造／其他工具），各檔 `STRUCT_TABS.push` 進來，計算書在 `STRUCT_SHEETS`。舊網址 `#/calc/col`、`#/calc/col/sheet` 等由 `renderCalc` 自動轉到 `#/struct/…`，localStorage 鍵名不變。新增結構計算：檔案裡 `STRUCT_TABS.push`、`STRUCT_CATS` 的 tabs 加 key、`STRUCT_SHEETS` 加計算書 |
| `volume.js` | 計算機「混凝土方數」分頁與 A4 計算書（`#/calc/vol/sheet`）。構件：矩形柱、圓柱、牆（可扣開口）、版（可扣開口）、梁（可扣版厚）、獨立基礎、地梁／連續基礎、樓梯（踏階三角形＋斜版）、其他（`oth`：長×寬×高，或直接填單個體積 `v`，有填 `v` 時以 `v` 為準）。2026-11-20 使用者要求原「矩形柱／其他」拆開：`rect` 只改名為「矩形柱」，舊紀錄照舊。欄位共用 a～e（牆、版、矩形皆 a×b×c），`v` 只有「其他」用，開口存 `op`。目前編輯中的內容在 localStorage `calcRows`、`calcCfg`（多了 loc、who、cur、title）；結果區「💾 存檔」（紀錄名稱欄在結果下方，手機拇指好按、電腦版在右欄固定）存到 IndexedDB `vols`（依工地多筆，`{id, siteId, name, rows, cfg, created, updated}`），`cfg.cur` 指向開啟中的那筆並自動存回；頁首「📂 方數紀錄」展開清單（開啟／複製／刪除）、「＋ 新計算」；2026-11-15 使用者要求依使用習慣調整位置與名稱；`vols` 已納入備份、匯入、`CLEAN`、刪除工地。載入後以 `CALC_TABS.splice(2,0,…)` 插回原位置，`index.html` 要緊接在 `calc.js` 後面 |
| `colform.js` | 結構計算「柱模板」分頁與 A4 計算書（`#/struct/col/sheet`）；三步驟＋分階（最多 4 階）＋側壓力分布圖＋配置示意圖。輸入存在 localStorage `calcColForm2`，材料庫 `calcColLib`。使用者同意內建「他提供的」材料表（2026-11-14 參考表截圖）：`COL_SPECIES` 木材樹種容許應力、`COL_PRESETS` 襯板與木角材斷面、`COL_DEFP` 襯板撓度標準，畫面註明非規範原文。鋼材 Fb/Fv/E、鋼角材斷面、螺桿斷面積也照參考表內建；螺桿容許拉應力 Ft 預設 1800 kgf/cm²（參考網站螺桿資料 18 kgf/mm²，2026-11-14 使用者用決策卡同意帶入，可改）。構件係數由 `colMeth(st)` 組出（計算方式 `COL_METHODS` × 格柵連續跨數 `COL_SPANS`，存在 `st.spans`，柱／牆／板／梁四支共用）：三跨以上 0.107wL²、0.607wL（3～5 跨包絡）、兩跨 wL²/8、0.625wL；參考網站算法格柵撓度維持 wL⁴/128EI。小格柵剪力面積只算格柵本身（2026-11-15 第三方驗證後使用者同意修正，原本計入襯板厚） |
| `wallform.js` | 結構計算「牆模板」分頁與 A4 計算書（`#/struct/wall/sheet`）；三層模／四層模（螺桿）／單面模（鋼管斜撐挫曲）。材料庫、樹種、斷面與 `colform.js` 共用（`colLib`、`colLibCard`、`colRefHtml`、`colPressureSvg`）。輸入存在 localStorage `calcWallForm`。側壓力預設 1.5Wo + 0.2Wo(H−1.5)（參考網站公式，註明非規範原文，可切換成 γ×深度） |
| `slabform.js` | 結構計算「板模板」分頁與 A4 計算書（`#/struct/slab/sheet`）；載重 N = Wo×板厚 + 衝擊 0.5N1 + 作業 150 + 模板自重 15 kgf/m²（參考網站值，註明非規範原文，可改）→ 襯板 → 第一層大格柵（跨 L2）→ 第二層大格柵（跨 L3）→ 鋼管支撐挫曲（P = N×L2×L3）。支撐長 L 預設「樓高 − 板厚」（2026-11-14 使用者用決策卡選定），可改扣模板格柵高或手動。材料庫與柱模共用、鋼管與挫曲公式與牆模單面模共用（`wfPipeSect`、`wfFa`）。輸入存在 localStorage `calcSlabForm` |
| `beamform.js` | 結構計算「梁模板」分頁與 A4 計算書（`#/struct/beam/sheet`）；側模（襯板、第一層大格柵最多 5 階、第二層大格柵為連續梁 `bfWale`（直接勁度法，螺桿為支點、兩端外伸，第一層大格柵集中力 F = w×L2；只有一階螺桿時梁底端另設支承），螺桿拉力取支點反力，螺桿最多 5 階，B4 = L2；2026-11-15 驗證後由參考網站的分段懸臂算法改來）＋底模（梁底襯板、貫材 1～3 支，L3 = Bb／支數）＋鋼管支撐（梁寬方向 1～3 支，L = 樓高 − 梁深或手動）。載重同板模板（N 用梁深 Hb），側壓力 p(z) = N(Hb − z)/Hb（參考網站 beam-view.js，非規範原文）。梁底襯板除參考網站的邊距外，貫材 2 支以上另檢核貫材間跨距。輸入存在 localStorage `calcBeamForm` |
| `scaffold.js` | 結構計算「施工架」分頁（外牆框型施工架）與 A4 計算書（`#/struct/scaf/sheet`）。單件自重取參考網站自重表（使用者試算表）；每支主柱 D = 單跨自重×層數/2、L = q×跨距×立架寬×作業層數/2、Ev = Cv×D；每支壁連座 A = 水平×垂直間距，W = η×風壓×A，Eh = Ch×分擔自重。六組載重組合同參考網站。參考網站的強度檢核在伺服器端看不到，主柱與壁連座用極限設計法柱公式（λc、0.658^λc²、0.877/λc²），φc 0.85／φt 0.9／φv 0.9、剪力 0.6FyA，皆可改。**風壓、地震係數、活載重、壁連座間距上限一律由使用者填**（不內建各地風速、工址參數與法規間距）。輸入存在 localStorage `calcScafForm` |
| `bracket.js` | 結構計算「三角架」分頁與 A4 計算書（`#/struct/brk/sheet`）。型式 1～5 幾何同參考網站 bracket.js；P = 1.2PD + 1.6PL、自重 ×1.2。`bkSolve` 是自寫的平面構架直接勁度法（梁＋桁架元素，靠牆兩點固定），測試有懸臂、固端梁與反力平衡驗證。檢核只做托架平面內：受壓（同 `scFcr`）、受拉、彎矩 φbFyS（彈性，保守）、剪力 0.6FyAw、H1 互制；φ 可改。輸入存在 localStorage `calcBrkForm` |
| `rowframe.js` | 結構計算「排架」分頁與 A4 計算書（`#/struct/row/sheet`）。沿用 `scaffold.js` 的自重表與 `scRound`、`scFcr`。D = 單跨自重×層數/2 + qd×面積/2，q = max(輸入, 最小活載 2.4 kPa, 4.8 kPa − qd)（參考網站引 ACI 347R-14，當可改預設、可清空）。地震只有不考慮／直接輸入。輸入存在 localStorage `calcRowForm` |
| `anchor.js` | 結構計算「錨栓」分頁與 A4 計算書（`#/struct/anc/sheet`）。依 ACI 318-19 第 17 章架構自寫，SI 係數換算 kgf-cm（`ANC_K`）；受力分配為剛性鋼承板、只計錨栓。檢核鋼材拉／剪、混凝土拉破（ψec、ψed、ψc、ψcp、三邊近邊 hef 修正）、拔出（後置式填產品 Np）、側面爆裂（預埋，逐支、ca2 < 3ca1 乘角落折減 (1+ca2/ca1)/4）、剪破（X、Y 各朝受剪邊）、撬破、互制。未做黏結式、地震額外要求。輸入存在 localStorage `calcAncForm`。連動：施工架結果「帶入三角架」寫 `calcBrkForm` 的 PD/PL；三角架「支承反力帶入錨栓」寫 `calcAncForm`（P = Rx、Vy = −Ry、Mx = −Mz，同參考網站） |
| `secprop.js` | 結構計算「斷面性質」分頁與 A4 計算書（`#/struct/sec/sheet`）。同參考網站：外輪廓＋孔洞頂點座標（多邊形格林定理），輸出 A、形心、Ix、Iy、Ixy、Jc、主慣性矩與主軸角、Sx±／Sy±，8 位有效數字；另加常用斷面產生器（圓以 72 邊形近似）、迴轉半徑。「存成格柵材自訂斷面」把 A、I、S（換算 cm，S 取兩側較小）寫進 `calcColLib`；`colLibCard` 的自訂格柵卡片有「帶入斷面性質」按鈕（`data-lsec`，在 secprop.js 用委派事件處理）。輸入存在 localStorage `calcSecForm`。未做 DXF 匯入 |
| `calcsave.js` | 結構計算「存到專案」（2026-11-20 使用者要求計算資料也同步）：每個結構計算頁上方 `#csBar`（`#calcBox` 前面），「💾 存到專案」把該分頁 localStorage 輸入（`CS_KEYS`）存成 IndexedDB `calcs` 一筆 `{id, siteId, tab, name, data, lib, created, updated}`，`lib` 是自訂材料庫（開啟時只補對方沒有的）；「📂 計算紀錄」開啟／複製／刪除、「＋ 新計算」。開啟中的紀錄記在 localStorage `calcCur`（每分頁一筆），包住 `ls.set` 自動存回（內容沒變不寫）。雲端：同事建立的只能看，開啟後載入自己的計算機、不改原紀錄（方數 `vols` 同樣處理）。新增結構計算要在 `CS_KEYS` 加一筆、`safe.js` 的 `calcs.tab` 名單也加。日常計算機八個分頁沒有存檔，不同步 |
| `calcbar.js` | 計算機底部「結果摘要列」：只讀畫面上的「總結」列與 `.cfres` 的 `td.ok／td.bad`，不碰計算；新計算機沿用同樣結構就自動套用。沒有 OK／NG 的計算機在 `.big` 加 `data-bar="摘要"` 只顯示文字。結果區在畫面上時自動隱藏 |
| `sidenav.js` | 電腦版左側導覽列（≥ 1200px 才顯示，**首頁不顯示**，避免和首頁卡片重複，使用者要求）；新增首頁功能時這裡也加一筆。結構計算區自動讀 `STRUCT_CATS`，目前分類會展開並標目前頁 |
| `savestat.js` | **表單儲存狀態（全站共用）**：`svAuto(write)` 回傳 `{save, flush}`，右下角低調小標籤 `#saveTip`（儲存中… → ✓ 已自動儲存 hh:mm、⚠ 儲存失敗）；換頁（hashchange，所以要在 `app.js` 前載入）、切 App、關網頁時立刻寫入未寫的修改；`svDoneRow()`＋`svBindDone(sv, 列表網址)` 是表單底部「💾 儲存並返回」；結構計算的 `xxSave` 呼叫 `svKept()` 顯示「輸入已自動保留」。2026-11-17 使用者反映填完不知道有沒有存而加。**新表單一律用 `svAuto`，不要再自己寫 timer**。同檔「完成／修改」共用功能（2026-11-17 使用者要求各表單都納入）：`dnSv`、`dnBanner`、`dnRow`、`dnBind`，資料欄位 `locked`（完成時間）、`reopened`（完成後修改時間），`safe.js` 的 `cdone` 統一清理。已套用：施工日誌（完成日誌）、材料進場（完成驗收）、勤前教育（完成簽到）、混凝土澆置（完成抽驗，整次澆置連同各車；拆模追蹤完成後仍可勾）。完成後 `dnBind` 停用所有輸入與按鈕（保留 `keep` 指定的預覽／分享等、刪除鈕改成提醒）。點工單沿用自己的簽認流程（`status: signed`），只把用語改成「完成簽認／修改這份紀錄」。缺失改善有自己的結案流程，未套用。新表單要完成功能就用這組函式 |
| `cloud.js` | 雲端同步（只在雲端網址）：包住 `DB.put/DB.del` 記下改過的（`sync` 表）、背景上傳下載（`cloudSync`）、收到的資料一律經 `CLEAN` 清理；`#/cloud` 頁（登入、上傳舊資料、專案成員、人員管理、加入申請）。不在名單的人登入後可送「加入申請」（`api/apply`，雲端 `requests` 表，worker 會自動補建），管理員核准才進人員名單，不核准的不能再送（2026-11-20 使用者要求）；首頁 `#hCloud` 小標籤。權限：`cloudRO`（只能看的原因）、`cloudCanReopen`、`cloudMine`、`cloudSiteBlock`；給 app.js 用的都要是 `function` 宣告（`const` 不會掛在 window 上）。開著的表單收到別人修改會先存畫面輸入再重畫（`clQuiesce`），避免舊畫面蓋掉新資料。app.js 啟動會等 DOMContentLoaded，確保 cloud.js 先包住 DB |
| `cloud/` | 雲端伺服器：`worker.js`（API、Access 通行證驗證、權限、三方合併 `merge3`）、`schema.sql`（D1）、`wrangler.toml`、`README.md`（設定步驟） |
| `sw.js` | Service Worker（網路優先、離線備援；`/api/` 不經快取） |

## 每次修改一定要做的事
1. **`sw.js` 的 `VERSION` 加 1**（例如 `"v135"` → `"v136"`）。不加的話，已安裝的手機不會換新版。
2. 新增 `.js` 檔：同時加進 `index.html` 的 `<script>` 與 `sw.js` 的 `FILES`。
3. **新增或改名資料欄位：同步改 `safe.js` 的 `CLEAN` 規則。** 沒改的話，匯入備份時該欄位會被丟掉（`tests/backup_roundtrip.js` 會抓到）。
4. 新增資料表：`app.js` 的資料庫版本加 1、加進 `onupgradeneeded` 的名單、備份匯出／匯入、`sanitizeBackup`、刪除工地的 `stores`。
5. 所有顯示到畫面的動態文字用 `esc()`；圖片來源用 `safeImg()`；id 放進屬性要 `esc()`。不要用行內事件（`onclick=`），網頁有 CSP（`index.html`）。
6. 日期一律用本地日期（`today()`、`shotLocalDate()`）。**不要用 `toISOString()` 取日期**，台灣凌晨會變成前一天。
7. `updates.json`（首頁「最新更新」）的日期**不得晚於今天**。
8. 推送前跑相關測試（見下）。

## 不可違反的原則
- **不內建、不估算任何法規數值**：拆模天數、搭接／錨定長度、坍度與氯離子標準、判定標準、穿樑規則等，一律由使用者依契約與規範填寫；工具只做日期提醒與數值計算。使用者曾明確要求，也曾要求拿掉搭接長度功能。使用者貼來的規則（如穿樑套管 1/3）只當成可修改的預設值並註明「非規範原文」。
- 單據（`.paper`）永遠白底黑字，不受配色影響；簽名圖要限制在欄位內（`.psigs img`）。
- 不要加版本號顯示與「檢查更新」按鈕（使用者說先不用）。
- 使用者資料不離開手機，**唯一例外是雲端版送到公司自己的 Cloudflare**（2026-11-20 使用者同意）。不要加任何其他會把資料送到外部的功能，除非使用者明確同意。雲端版的權限一律在 `worker.js` 檢查，手機畫面只是先擋。
- 備份檔沒有加密（已告知風險），GitHub Pages 同帳號下的專案共用同源——不要在同一個 GitHub 帳號下放其他會讀取 IndexedDB 的網站。

## 視覺與版面
- 配色是「侘寂風」，變數與覆寫在 `style.css` 最下方（`:root` 重新定義）。新增元件請用 `var(--g) var(--bad) var(--ok) var(--mut) var(--line) var(--card)`，不要寫死鮮豔的顏色。
- 單據 PDF 的分頁邏輯在 `pdf.js`：在 `tr, figure, .psigs, .kpis, .pbar` 的下緣換頁，表格列不要做超高的列。
- 窄螢幕（320 px）不得出現橫向捲動；輸入框不要加固定寬度。
- 浮出面板 `.psheet` / `.psheet-in`（目前用在缺失「回報已改善」）：手機貼底部；≥ 768px 自動改成畫面中央對話框（2026-11-17 使用者反映電腦版太下面）。新的浮出面板請沿用這兩個 class。
- **電腦版自動排版**（`style.css` 最下方，依寬度自動切換，使用者要求不需手動選）：≥ 768px 首頁卡片 2 欄、≥ 1024px 模板／施工架計算機左輸入右結果（結果區要是 `#calcBox` 裡最後一個 `section.panel`，前面要有 `.cfsteps`）、≥ 1200px 內頁有左側導覽列（首頁沒有）、首頁 3 欄。手機（< 768px）不受影響。

## 測試
`tests/` 是 Playwright 模擬測試，說明與預期結果見 `tests/README.md`。常用：
```bash
bash tests/run.sh xss_render          # 資安：惡意資料與渲染轉義
bash tests/run.sh backup_roundtrip    # 備份往返，找被清理器丟掉的欄位
bash tests/run.sh print_overflow narrow_overflow pdf_all_outputs   # 版面
```
結構計算另有**第三方獨立驗證**（anaStruct、PyNite、sectionproperties，Python）：`python3 tools/verify/verify.py`，產生 `tools/verify/REPORT.md`。改了任何結構計算檔（`colform.js`～`secprop.js`）都重跑一次，看有沒有新增不一致；新增結構計算時在 `tools/verify/` 補案例（說明見該資料夾 README）。
改 `safe.js`、資料庫、備份：至少跑 `backup_roundtrip`、`db_upgrade_delete_site`、`xss_render`。
改 `cloud.js`、`cloud/`：跑 `node tests/cloud_jwt.mjs`，並照 `cloud/README.md`「本機測試」啟動 wrangler dev 後跑 `node tests/cloud_api.js`、`node tests/cloud_e2e.js`、`node tests/cloud_apply.js`、`node tests/cloud_phase2.js`（`run.sh` 不含這幾支，因為要另外開伺服器）。改版面：跑 `print_overflow`、`narrow_overflow`。

## 還沒做、等使用者決定
- App 鎖（PIN／生物辨識）與備份檔加密——使用者說先暫緩。要做之前先問：密碼位數、忘記密碼怎麼處理、備份密碼忘記打不開是否可接受。
- 自主檢查表跨頁時，第 2 頁不會重複標題列。
- 使用者會陸續提供更多自主檢查表範本（Word／PDF），收到後加到 `templates.js`，欄位照原文，沒有的「管理標準」留空。
- 施工日誌的「點工單」刻意不連動（使用者要求）。

## 溝通
使用者習慣繁體中文、白話說明；回報時要誠實分開「我測過什麼」與「沒測到什麼」，不要誇大。涉及法規、結構安全的內容，標示「依契約與規範為準」，不下判斷。
