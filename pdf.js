"use strict";
/* 分享 PDF：把預覽頁的 A4 單據轉成 PDF，用手機的分享功能直接傳到 LINE 等 App
   做法：把每張 .paper 以 A4 版面寬度複製到畫面外 → html2canvas 轉圖 → 在表格列／圖片的邊界換頁 → jsPDF 組成 PDF。
   PDF 內是圖片，文字不能選取複製。函式庫在第一次按下按鈕時才載入。 */

const PDF_LIBS = ["lib/html2canvas.min.js", "lib/jspdf.umd.min.js"];
const pdfLoad = () => pdfLoad.p || (pdfLoad.p = Promise.all(PDF_LIBS.map(src => new Promise((res, rej) => {
  const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => { pdfLoad.p = null; rej(new Error("PDF 元件載入失敗，請確認網路後再試")); }; document.head.append(s);
}))));

async function pdfMake(papers, landscape) {
  await pdfLoad();
  const pageW = landscape ? 297 : 210, pageH = landscape ? 210 : 297, m = landscape ? 10 : 14, contentW = pageW - 2 * m, contentH = pageH - 2 * m;
  const domW = Math.round(contentW / 25.4 * 96), domPageH = Math.round(contentH / contentW * domW);
  const doc = new window.jspdf.jsPDF({ orientation: landscape ? "l" : "p", unit: "mm", format: "a4" });
  const stage = document.createElement("div");
  stage.className = "pdfmode"; stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${domW}px;background:#fff;color:#000;z-index:-1`;
  document.body.append(stage);
  let first = true;
  try {
    for (const el of papers) {
      stage.innerHTML = ""; const c = el.cloneNode(true); stage.append(c);
      await Promise.all([...c.querySelectorAll("img")].map(i => i.decode ? i.decode().catch(() => {}) : 0));
      const canvas = await window.html2canvas(c, { scale: 2, backgroundColor: "#ffffff", logging: false, windowWidth: domW });
      const top = c.getBoundingClientRect().top, total = Math.round(c.getBoundingClientRect().height);
      // 可以換頁的位置：表格列、照片、簽名區、數字卡的下緣（避免把一列字切成兩半）
      const cands = [...c.querySelectorAll("tr, figure, .psigs, .kpis, .pbar")].map(x => Math.round(x.getBoundingClientRect().bottom - top)).sort((a, b) => a - b);
      let start = 0;
      while (start < total - 1) {
        let end = start + domPageH;
        if (end < total) { const ok = cands.filter(y => y > start + domPageH * 0.4 && y <= end); end = ok.length ? ok[ok.length - 1] : end; } else end = total;
        const sy = Math.round(start * canvas.height / total), eh = Math.max(1, Math.round((end - start) * canvas.height / total));
        const part = document.createElement("canvas"); part.width = canvas.width; part.height = eh;
        const g = part.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, part.width, part.height); g.drawImage(canvas, 0, sy, canvas.width, eh, 0, 0, canvas.width, eh);
        if (!first) doc.addPage(); first = false;
        doc.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", m, m, contentW, (end - start) / domW * contentW);
        start = end;
      }
    }
  } finally { stage.remove(); }
  return doc.output("blob");
}

function pdfDownload(file) {
  const url = URL.createObjectURL(file), a = document.createElement("a");
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function pdfShare(btn) {
  if (inAppName()) { doPrint(); return; }                    // LINE 等內建瀏覽器：說明改用 Safari／Chrome
  const label = "📤 分享 PDF";
  if (btn._file) { await pdfSend(btn, btn._file); return; }   // 上次已產生好，只差分享（需要再點一次）
  const papers = [...view.querySelectorAll(".paper")];
  if (!papers.length) { alert("沒有可以轉成 PDF 的內容"); return; }
  btn.disabled = true; btn.textContent = "⏳ 產生 PDF 中…";
  try {
    const blob = await pdfMake(papers, !!document.getElementById("psumPrint"));
    const title = (papers[0].querySelector(".ptitle")?.textContent || "單據").trim();
    btn._file = new File([blob], `${title}_${woRoc(today())}.pdf`, { type: "application/pdf" });
    btn.disabled = false; btn.textContent = label;
    await pdfSend(btn, btn._file);
  } catch (e) { btn.disabled = false; btn.textContent = label; alert("產生 PDF 失敗：" + (e?.message || e)); }
}
async function pdfSend(btn, file) {
  const label = "📤 分享 PDF";
  btn.textContent = label;
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: file.name.replace(/\.pdf$/, "") }); btn._file = null; return; }
    pdfDownload(file); btn._file = null; alert("這個瀏覽器不能直接分享檔案，已改為下載 PDF，再從「檔案」App 傳到 LINE。");
  } catch (e) {
    if (e?.name === "AbortError") { btn._file = null; return; }
    // 產生 PDF 花了一些時間，手機要求「再點一次」才允許開啟分享選單
    if (e?.name === "NotAllowedError") { btn.textContent = "✓ PDF 已產生，點此分享"; return; }
    btn._file = null; pdfDownload(file); alert("無法開啟分享，已改為下載 PDF。");
  }
}

// 在每個預覽頁（有 A4 單據與列印鈕的頁面）自動加上「分享 PDF」按鈕
new MutationObserver(() => {
  const pr = view.querySelector("#pvPrint, #sPrint, #rPrint");
  if (!pr || !view.querySelector(".paper") || view.querySelector("#pdfShare")) return;
  const host = pr.closest(".row, .pvbar") || pr.parentElement, row = document.createElement("div");
  row.className = "row noprint"; row.innerHTML = `<button id="pdfShare">📤 分享 PDF</button>`;
  host.insertAdjacentElement("afterend", row);
  const b = row.querySelector("button"); b.onclick = () => pdfShare(b);
}).observe(view, { childList: true, subtree: true });
