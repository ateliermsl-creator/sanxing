# 三星蔥工具箱（sanxing）— 交接說明

給接手維護的 Claude 與人。使用者是建築師、土木技師，在營造公司擔任協理；這是給工地現場用的離線 PWA（手機優先，繁體中文）。
網站：GitHub Pages（`main` 分支、根目錄），推送後約 1～2 分鐘自動更新：https://ateliermsl-creator.github.io/sanxing/

## 技術概況
- 純前端、無框架、無建置步驟。直接編輯檔案即可。第三方只有 `lib/html2canvas`、`lib/jspdf`（皆 MIT，授權檔在 `lib/`）。
- 資料只存在使用者手機瀏覽器的 IndexedDB（庫名 `avocado-toolbox`，歷史原因沒改名，**不要改**，會讓既有資料消失）。目前版本 **12**，資料表：`sites records templates photos workorders punch pours matrecs matcats files shots safety logs vols`。
- 沒有伺服器、沒有帳號。`localStorage` 只放個人偏好（公司名、上次選的工地等）。
- 路由是 hash（`#/頁面/id/子頁`），在 `app.js` 的 `route()` 分派，各功能一支檔案：

| 檔案 | 內容 |
|---|---|
| `app.js` | 資料庫包裝、路由、首頁、自主檢查表、備份／匯入、相機、燈箱、工地設定 |
| `templates.js` | 內建自主檢查表範本（新增範本在這裡加一筆） |
| `safe.js` | **匯入備份的驗證與清理**，以及 `safeImg` / `safeId` |
| `attach.js` | 附加檔案（Blob，單檔 10 MB） |
| `pdf.js` | 「分享 PDF」：html2canvas + jsPDF，把 `.paper` 轉成 A4 |
| `workorder.js punch.js pour.js material.js` | 點工單、缺失改善、混凝土澆置抽驗、材料進場驗收 |
| `cure.js` | 試體養護與拆模追蹤（讀澆置資料） |
| `shot.js` | 施工照片（電子黑板相機）、照片冊 |
| `safety.js` | 職安衛勤前教育／危害告知簽到 |
| `log.js` | 施工日誌（B14-4 格式） |
| `calc.js` | 工程計算機（`#/calc`，八個日常分頁）＋「結構計算」路由（`#/struct`、`renderStruct`）。結構計算 2026-11-15 使用者同意從計算機拆出：分類在 `STRUCT_CATS`（模板／施工架／混凝土構造／其他工具），各檔 `STRUCT_TABS.push` 進來，計算書在 `STRUCT_SHEETS`。舊網址 `#/calc/col`、`#/calc/col/sheet` 等由 `renderCalc` 自動轉到 `#/struct/…`，localStorage 鍵名不變。新增結構計算：檔案裡 `STRUCT_TABS.push`、`STRUCT_CATS` 的 tabs 加 key、`STRUCT_SHEETS` 加計算書 |
| `volume.js` | 計算機「混凝土方數」分頁與 A4 計算書（`#/calc/vol/sheet`）。構件：矩形柱／其他、圓柱、牆（可扣開口）、版（可扣開口）、梁（可扣版厚）、獨立基礎、地梁／連續基礎、樓梯（踏階三角形＋斜版）。欄位共用 a～e（牆、版、矩形皆 a×b×c），開口存 `op`。目前編輯中的內容在 localStorage `calcRows`、`calcCfg`（多了 loc、who、cur、title）；結果區「💾 存檔」（紀錄名稱欄在結果下方，手機拇指好按、電腦版在右欄固定）存到 IndexedDB `vols`（依工地多筆，`{id, siteId, name, rows, cfg, created, updated}`），`cfg.cur` 指向開啟中的那筆並自動存回；頁首「📂 方數紀錄」展開清單（開啟／複製／刪除）、「＋ 新計算」；2026-11-15 使用者要求依使用習慣調整位置與名稱；`vols` 已納入備份、匯入、`CLEAN`、刪除工地。載入後以 `CALC_TABS.splice(2,0,…)` 插回原位置，`index.html` 要緊接在 `calc.js` 後面 |
| `colform.js` | 結構計算「柱模板」分頁與 A4 計算書（`#/struct/col/sheet`）；三步驟＋分階（最多 4 階）＋側壓力分布圖＋配置示意圖。輸入存在 localStorage `calcColForm2`，材料庫 `calcColLib`。使用者同意內建「他提供的」材料表（2026-11-14 參考表截圖）：`COL_SPECIES` 木材樹種容許應力、`COL_PRESETS` 襯板與木角材斷面、`COL_DEFP` 襯板撓度標準，畫面註明非規範原文。鋼材 Fb/Fv/E、鋼角材斷面、螺桿斷面積也照參考表內建；螺桿容許拉應力 Ft 預設 1800 kgf/cm²（參考網站螺桿資料 18 kgf/mm²，2026-11-14 使用者用決策卡同意帶入，可改）。構件係數由 `colMeth(st)` 組出（計算方式 `COL_METHODS` × 格柵連續跨數 `COL_SPANS`，存在 `st.spans`，柱／牆／板／梁四支共用）：三跨以上 0.107wL²、0.607wL（3～5 跨包絡）、兩跨 wL²/8、0.625wL；參考網站算法格柵撓度維持 wL⁴/128EI。小格柵剪力面積只算格柵本身（2026-11-15 第三方驗證後使用者同意修正，原本計入襯板厚） |
| `wallform.js` | 結構計算「牆模板」分頁與 A4 計算書（`#/struct/wall/sheet`）；三層模／四層模（螺桿）／單面模（鋼管斜撐挫曲）。材料庫、樹種、斷面與 `colform.js` 共用（`colLib`、`colLibCard`、`colRefHtml`、`colPressureSvg`）。輸入存在 localStorage `calcWallForm`。側壓力預設 1.5Wo + 0.2Wo(H−1.5)（參考網站公式，註明非規範原文，可切換成 γ×深度） |
| `slabform.js` | 結構計算「板模板」分頁與 A4 計算書（`#/struct/slab/sheet`）；載重 N = Wo×板厚 + 衝擊 0.5N1 + 作業 150 + 模板自重 15 kgf/m²（參考網站值，註明非規範原文，可改）→ 襯板 → 第一層大格柵（跨 L2）→ 第二層大格柵（跨 L3）→ 鋼管支撐挫曲（P = N×L2×L3）。支撐長 L 預設「樓高 − 板厚」（2026-11-14 使用者用決策卡選定），可改扣模板格柵高或手動。材料庫與柱模共用、鋼管與挫曲公式與牆模單面模共用（`wfPipeSect`、`wfFa`）。輸入存在 localStorage `calcSlabForm` |
| `beamform.js` | 結構計算「梁模板」分頁與 A4 計算書（`#/struct/beam/sheet`）；側模（襯板、第一層大格柵最多 5 階、第二層大格柵為連續梁 `bfWale`（直接勁度法，螺桿為支點、兩端外伸，第一層大格柵集中力 F = w×L2；只有一階螺桿時梁底端另設支承），螺桿拉力取支點反力，螺桿最多 5 階，B4 = L2；2026-11-15 驗證後由參考網站的分段懸臂算法改來）＋底模（梁底襯板、貫材 1～3 支，L3 = Bb／支數）＋鋼管支撐（梁寬方向 1～3 支，L = 樓高 − 梁深或手動）。載重同板模板（N 用梁深 Hb），側壓力 p(z) = N(Hb − z)/Hb（參考網站 beam-view.js，非規範原文）。梁底襯板除參考網站的邊距外，貫材 2 支以上另檢核貫材間跨距。輸入存在 localStorage `calcBeamForm` |
| `scaffold.js` | 結構計算「施工架」分頁（外牆框型施工架）與 A4 計算書（`#/struct/scaf/sheet`）。單件自重取參考網站自重表（使用者試算表）；每支主柱 D = 單跨自重×層數/2、L = q×跨距×立架寬×作業層數/2、Ev = Cv×D；每支壁連座 A = 水平×垂直間距，W = η×風壓×A，Eh = Ch×分擔自重。六組載重組合同參考網站。參考網站的強度檢核在伺服器端看不到，主柱與壁連座用極限設計法柱公式（λc、0.658^λc²、0.877/λc²），φc 0.85／φt 0.9／φv 0.9、剪力 0.6FyA，皆可改。**風壓、地震係數、活載重、壁連座間距上限一律由使用者填**（不內建各地風速、工址參數與法規間距）。輸入存在 localStorage `calcScafForm` |
| `bracket.js` | 結構計算「三角架」分頁與 A4 計算書（`#/struct/brk/sheet`）。型式 1～5 幾何同參考網站 bracket.js；P = 1.2PD + 1.6PL、自重 ×1.2。`bkSolve` 是自寫的平面構架直接勁度法（梁＋桁架元素，靠牆兩點固定），測試有懸臂、固端梁與反力平衡驗證。檢核只做托架平面內：受壓（同 `scFcr`）、受拉、彎矩 φbFyS（彈性，保守）、剪力 0.6FyAw、H1 互制；φ 可改。輸入存在 localStorage `calcBrkForm` |
| `rowframe.js` | 結構計算「排架」分頁與 A4 計算書（`#/struct/row/sheet`）。沿用 `scaffold.js` 的自重表與 `scRound`、`scFcr`。D = 單跨自重×層數/2 + qd×面積/2，q = max(輸入, 最小活載 2.4 kPa, 4.8 kPa − qd)（參考網站引 ACI 347R-14，當可改預設、可清空）。地震只有不考慮／直接輸入。輸入存在 localStorage `calcRowForm` |
| `anchor.js` | 結構計算「錨栓」分頁與 A4 計算書（`#/struct/anc/sheet`）。依 ACI 318-19 第 17 章架構自寫，SI 係數換算 kgf-cm（`ANC_K`）；受力分配為剛性鋼承板、只計錨栓。檢核鋼材拉／剪、混凝土拉破（ψec、ψed、ψc、ψcp、三邊近邊 hef 修正）、拔出（後置式填產品 Np）、側面爆裂（預埋，逐支、ca2 < 3ca1 乘角落折減 (1+ca2/ca1)/4）、剪破（X、Y 各朝受剪邊）、撬破、互制。未做黏結式、地震額外要求。輸入存在 localStorage `calcAncForm`。連動：施工架結果「帶入三角架」寫 `calcBrkForm` 的 PD/PL；三角架「支承反力帶入錨栓」寫 `calcAncForm`（P = Rx、Vy = −Ry、Mx = −Mz，同參考網站） |
| `secprop.js` | 結構計算「斷面性質」分頁與 A4 計算書（`#/struct/sec/sheet`）。同參考網站：外輪廓＋孔洞頂點座標（多邊形格林定理），輸出 A、形心、Ix、Iy、Ixy、Jc、主慣性矩與主軸角、Sx±／Sy±，8 位有效數字；另加常用斷面產生器（圓以 72 邊形近似）、迴轉半徑。「存成格柵材自訂斷面」把 A、I、S（換算 cm，S 取兩側較小）寫進 `calcColLib`；`colLibCard` 的自訂格柵卡片有「帶入斷面性質」按鈕（`data-lsec`，在 secprop.js 用委派事件處理）。輸入存在 localStorage `calcSecForm`。未做 DXF 匯入 |
| `calcbar.js` | 計算機底部「結果摘要列」：只讀畫面上的「總結」列與 `.cfres` 的 `td.ok／td.bad`，不碰計算；新計算機沿用同樣結構就自動套用。沒有 OK／NG 的計算機在 `.big` 加 `data-bar="摘要"` 只顯示文字。結果區在畫面上時自動隱藏 |
| `sidenav.js` | 電腦版左側導覽列（≥ 1200px 才顯示，**首頁不顯示**，避免和首頁卡片重複，使用者要求）；新增首頁功能時這裡也加一筆。結構計算區自動讀 `STRUCT_CATS`，目前分類會展開並標目前頁 |
| `sw.js` | Service Worker（網路優先、離線備援） |

## 每次修改一定要做的事
1. **`sw.js` 的 `VERSION` 加 1**（`"v129"` → `"v130"`）。不加的話，已安裝的手機不會換新版。
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
- 使用者資料不離開手機。不要加任何會把資料送到外部的功能，除非使用者明確同意。
- 備份檔沒有加密（已告知風險），GitHub Pages 同帳號下的專案共用同源——不要在同一個 GitHub 帳號下放其他會讀取 IndexedDB 的網站。

## 視覺與版面
- 配色是「侘寂風」，變數與覆寫在 `style.css` 最下方（`:root` 重新定義）。新增元件請用 `var(--g) var(--bad) var(--ok) var(--mut) var(--line) var(--card)`，不要寫死鮮豔的顏色。
- 單據 PDF 的分頁邏輯在 `pdf.js`：在 `tr, figure, .psigs, .kpis, .pbar` 的下緣換頁，表格列不要做超高的列。
- 窄螢幕（320 px）不得出現橫向捲動；輸入框不要加固定寬度。
- **電腦版自動排版**（`style.css` 最下方，依寬度自動切換，使用者要求不需手動選）：≥ 768px 首頁卡片 2 欄、≥ 1024px 模板／施工架計算機左輸入右結果（結果區要是 `#calcBox` 裡最後一個 `section.panel`，前面要有 `.cfsteps`）、≥ 1200px 內頁有左側導覽列（首頁沒有）、首頁 3 欄。手機（< 768px）不受影響。

## 測試
`tests/` 是 Playwright 模擬測試，說明與預期結果見 `tests/README.md`。常用：
```bash
bash tests/run.sh xss_render          # 資安：惡意資料與渲染轉義
bash tests/run.sh backup_roundtrip    # 備份往返，找被清理器丟掉的欄位
bash tests/run.sh print_overflow narrow_overflow pdf_all_outputs   # 版面
```
結構計算另有**第三方獨立驗證**（anaStruct、PyNite、sectionproperties，Python）：`python3 tools/verify/verify.py`，產生 `tools/verify/REPORT.md`。改了任何結構計算檔（`colform.js`～`secprop.js`）都重跑一次，看有沒有新增不一致；新增結構計算時在 `tools/verify/` 補案例（說明見該資料夾 README）。
改 `safe.js`、資料庫、備份：至少跑 `backup_roundtrip`、`db_upgrade_delete_site`、`xss_render`。改版面：跑 `print_overflow`、`narrow_overflow`。

## 還沒做、等使用者決定
- App 鎖（PIN／生物辨識）與備份檔加密——使用者說先暫緩。要做之前先問：密碼位數、忘記密碼怎麼處理、備份密碼忘記打不開是否可接受。
- 施工日誌簽名後鎖定（正式日誌簽了通常不可改）。
- 自主檢查表跨頁時，第 2 頁不會重複標題列。
- 使用者會陸續提供更多自主檢查表範本（Word／PDF），收到後加到 `templates.js`，欄位照原文，沒有的「管理標準」留空。
- 施工日誌的「點工單」刻意不連動（使用者要求）。

## 溝通
使用者習慣繁體中文、白話說明；回報時要誠實分開「我測過什麼」與「沒測到什麼」，不要誇大。涉及法規、結構安全的內容，標示「依契約與規範為準」，不下判斷。
