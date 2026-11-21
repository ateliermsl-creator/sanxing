"use strict";
/* 計算機「結果摘要列」（易用性 B1）
   模板類計算機（柱、牆、板、梁模板、施工架）頁面很長，改了輸入要捲到最底才看得到 OK／NG。
   這支只讀畫面上已算好的檢核表（.cfres 的 td.ok／td.bad 與「總結」列），在手機底部固定顯示一條摘要：
   全部 OK／幾項 NG（列出比值最大的一項）／還有幾項未完成。點一下跳到檢核結果。
   不改各計算機的計算與資料；之後新增的計算機只要沿用同樣的「總結」＋ .cfres 結構就會自動套用。
   沒有 OK／NG 的計算機（斷面性質）在 .big 加 data-bar="摘要文字"，摘要列只顯示那段文字。 */
(() => {
  const bar = document.createElement("div");
  bar.id = "calcBar"; bar.hidden = true; bar.setAttribute("role", "button"); bar.tabIndex = 0;
  bar.setAttribute("aria-live", "polite");
  document.body.appendChild(bar);
  let target = null, firstBad = null, resVisible = false, io = null, raf = 0;

  const firstText = el => { for (const n of el.childNodes) { if (n.nodeType === 3 && n.nodeValue.trim()) return n.nodeValue.trim(); if (n.nodeName === "BR" || n.nodeName === "SMALL") break; } return ""; };
  const findSummary = () => [...document.querySelectorAll("#view .big")].find(b => (b.firstElementChild?.textContent.trim() === "總結" || b.dataset.bar) && !b.closest(".paper"));

  function scan() {
    raf = 0;
    const sum = findSummary();
    if (!sum) { hide(); return; }
    const box = sum.parentElement, sec = sum.closest("section") || box;
    const tbl = box.querySelector("table.cfres");
    const heads = tbl ? [...tbl.rows[0].cells].map(firstText) : [];
    let name = "", worst = null, nBad = 0, nOk = 0; firstBad = null;
    for (const tr of tbl ? [...tbl.rows].slice(1) : []) {
      const th = tr.cells[0]; if (!th) continue;
      const nm = firstText(th); if (nm) name = nm;
      const chk = th.querySelector("small")?.textContent.trim() || "";
      [...tr.cells].forEach((td, i) => {
        const bad = td.classList.contains("bad"), ok = td.classList.contains("ok");
        if (!bad && !ok) return;
        bad ? nBad++ : nOk++;
        if (bad && !firstBad) firstBad = tr;
        const v = parseFloat(td.textContent);
        const col = /^第/.test(heads[i] || "") ? `（${heads[i]}）` : "";
        if (Number.isFinite(v) && (!worst || v > worst.v)) worst = { v, t: `${name} ${chk}${col}`.trim() };
      });
    }
    const msg = sum.lastElementChild?.textContent.trim() || "";
    let cls, html;
    if (sum.dataset.bar) { cls = "mut"; html = `<b>結果</b><span>${esc(sum.dataset.bar)}</span>`; }   // 沒有 OK／NG 的計算機（斷面性質）：只顯示主要數值
    else if (nBad) { cls = "bad"; html = `<b>✕ ${nBad} 項 NG</b><span>最大：${esc(worst.t)} 比值 ${worst.v}</span>`; }
    else if (/以內/.test(msg)) { cls = "ok"; html = `<b>✓ 全部 OK</b><span>${worst ? `最大：${esc(worst.t)} 比值 ${worst.v}` : esc(msg)}</span>`; }
    else { cls = "mut"; html = `<b>${nOk ? `目前 ${nOk} 項 OK，尚未算完` : "尚未算完"}</b><span>${esc(msg)}</span>`; }
    bar.className = cls;
    bar.innerHTML = `<div class="cbtxt">${html}</div><i aria-hidden="true">看結果 ›</i>`;
    bar.setAttribute("aria-label", bar.textContent);
    if (target !== sec) {
      target = sec;
      io?.disconnect();
      resVisible = false;
      if ("IntersectionObserver" in window) { io = new IntersectionObserver(es => { resVisible = es.some(e => e.isIntersecting); show(); }); io.observe(sec); }
    }
    show();
  }
  function show() { bar.hidden = !target || resVisible; document.body.classList.toggle("hasCalcBar", !bar.hidden); }
  function hide() { target = null; io?.disconnect(); io = null; bar.hidden = true; document.body.classList.remove("hasCalcBar"); }
  function go() {
    if (!target) return;
    window.cfStepReveal?.(target);   // 分步驟分頁：先切到檢核結果那一步
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    if (firstBad) { const r = firstBad; r.classList.remove("cbflash"); void r.offsetWidth; r.classList.add("cbflash"); }
  }
  bar.addEventListener("click", go);
  bar.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(scan); }).observe(document.getElementById("view"), { childList: true, subtree: true });
})();
