"use strict";
/* 電腦版左側導覽列（易用性 C）
   只有螢幕寬度 ≥ 1200px 時由 CSS 顯示（style.css 最下方「電腦版自動排版」），手機與平板看不到、版面不變。
   新增首頁功能時，這裡也加一筆。 */
(() => {
  const ITEMS = [
    ["#/", "🏠", "首頁"],
    ["#/checklist", "✅", "自主檢查表"],
    ["#/safety", "👷", "勤前教育／危害告知"],
    ["#/log", "📒", "施工日誌"],
    ["#/material", "📦", "材料進場驗收"],
    ["#/pour", "🚛", "混凝土澆置抽驗"],
    ["#/cure", "🧪", "試體養護與拆模"],
    ["#/punch", "📌", "缺失改善追蹤"],
    ["#/workorder", "📝", "點工單／機械出工"],
    ["#/calc", "🧮", "工程計算機"],
    ["#/shot", "📷", "施工照片"],
    ["#/backup", "💾", "備份與還原"],
    ["#/install", "📲", "加到手機桌面"]
  ];
  const nav = document.createElement("nav");
  nav.id = "sideNav"; nav.setAttribute("aria-label", "功能選單");
  nav.innerHTML = `<a class="snBrand" href="#/"><img src="leek.png" alt=""><span>三星蔥工具箱</span></a>`
    + ITEMS.map(([h, i, t]) => `<a href="${h}" data-h="${h}"><span aria-hidden="true">${i}</span>${t}</a>`).join("");
  document.body.prepend(nav);
  const mark = () => {
    const page = "#/" + (location.hash.split("/")[1] || "");
    nav.querySelectorAll("a[data-h]").forEach(a => {
      const on = a.dataset.h === page || (page === "#/template" && a.dataset.h === "#/checklist");
      a.classList.toggle("on", on);
      on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
    });
  };
  window.addEventListener("hashchange", mark);
  mark();
})();
