# 結構計算獨立驗證（tools/verify）

用第三方開源結構分析程式，獨立檢查網站「結構計算」各分頁算出來的數值。只讀網站原始檔，不影響網站本身（`sw.js` 不快取這個資料夾，GitHub Pages 上的使用者也不會載入它）。

## 怎麼跑

```bash
pip install -r tools/verify/requirements.txt   # 第一次
python3 tools/verify/verify.py                  # 在專案根目錄執行，約 10 秒
```

需要 Node.js（讀網站的 `.js` 計算函式）與 Python 3.10 以上。跑完會更新：

- `REPORT.md`：中文驗證報告（結論、發現的問題、假設差異、逐項明細）
- `results.json`：同樣內容的機器可讀版

終端機最後一行是摘要，不一致的項目會逐條列出。以後改了計算檔，重跑一次比對新舊報告的差異即可。

## 檔案

| 檔案 | 內容 |
|---|---|
| `extract.js` | 用 Node 的 `vm` 載入 `colform.js wallform.js slabform.js beamform.js scaffold.js bracket.js rowframe.js anchor.js secprop.js`，呼叫 `colCalc` 等計算函式，輸出 JSON。與手機上跑的是同一份程式碼 |
| `verify.py` | 案例、參考值計算、比對、寫報告 |

## 參考值的來源

| 計算 | 參考 |
|---|---|
| 構件 M、V、δ（簡支、連續、懸臂），梁模第二層大格柵 | anaStruct（2D 梁有限元素） |
| 三角架構架分析 | PyNite（構架有限元素，依輸入幾何獨立建模） |
| 斷面性質、木角材、襯板、鋼管、矩形管、槽鋼、圓管、角鋼 | sectionproperties（有限元素斷面分析） |
| 鋼管 ASD 柱公式、LRFD 柱公式 | 依 AISC 公式獨立重寫（LRFD 用 360-16 的 Fe 寫法對照） |
| 施工架、排架載重與組合 | 獨立重寫 |
| 錨栓 | 依 ACI 318-19 第 17 章用 SI 單位獨立重寫（沒有可用的開源錨栓程式） |

## 新增案例

在 `verify.py` 對應的 `check_xxx()` 裡加一組 `st`（欄位同網站 localStorage 存的格式），用 `app1({"tool": "...", "st": st})` 取工具箱數值，再用 `cmp()`（應一致）或 `info()`（假設差異，只列出）記錄。新增一支結構計算時，`extract.js` 的 `FILES` 與 `switch` 也要加。
