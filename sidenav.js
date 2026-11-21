"use strict";
/* 電腦版左側導覽列（易用性 C）
   只有螢幕寬度 ≥ 1200px、而且不在首頁時由 CSS 顯示（style.css 最下方「電腦版自動排版」），手機與平板看不到、版面不變。
   新增首頁功能時，這裡也加一筆。結構計算的分類與分頁直接讀 calc.js 的 STRUCT_CATS／STRUCT_TABS：
   列出四個分類，目前所在分類展開它的計算並標示目前頁。 */
(() => {
  const ITEMS = [
    ["#/", "home", "首頁"],
    ["#/checklist", "check", "自主檢查表"],
    ["#/safety", "hat", "勤前教育／危害告知"],
    ["#/log", "log", "施工日誌"],
    ["#/material", "box", "材料進場驗收"],
    ["#/pour", "truck", "混凝土澆置抽驗"],
    ["#/cure", "cyl", "試體養護與拆模"],
    ["#/punch", "pin", "缺失改善追蹤"],
    ["#/workorder", "sign", "點工單／機械出工"],
    ["#/calc", "calc", "工程計算機"],
    ["#/shot", "cam", "施工照片"],
    "struct",
    ...(window.cloudOn?.() ? [["#/cloud", "cloud", "雲端同步"]] : []),
    ["#/backup", "backup", "備份與還原"],
    ["#/install", "phone", "加到手機桌面"]
  ];
  const nav = document.createElement("nav");
  nav.id = "sideNav"; nav.setAttribute("aria-label", "功能選單");
  nav.innerHTML = `<a class="snBrand" href="#/" aria-label="三星蔥工具箱 首頁"><img src="brand/logo-mark.svg" alt=""><img class="snWord" src="brand/wordmark-reverse.svg" alt=""></a>`
    + ITEMS.map(it => it === "struct"
      ? `<div class="snGrp">結構計算</div>` + STRUCT_CATS.map(c => `<a href="#/struct/${c.tabs[0]}" data-cat="${c.k}"><span aria-hidden="true">${ic(c.icon)}</span>${c.t}</a>`
        + c.tabs.map(k => `<a class="snSub" href="#/struct/${k}" data-tab="${k}" data-in="${c.k}">${esc(structName(k))}</a>`).join("")).join("") + `<div class="snGrp">備份與安裝</div>`
      : `<a href="${it[0]}" data-h="${it[0]}"><span aria-hidden="true">${ic(it[1])}</span>${it[2]}</a>`).join("");
  document.body.prepend(nav);
  const mark = () => {
    const [, pg = "", tab = ""] = location.hash.split("/");
    const page = "#/" + pg, cat = pg === "struct" ? structCatOf(tab)?.k : "";
    const set = (a, on) => { a.classList.toggle("on", on); on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"); };
    nav.querySelectorAll("a[data-cat]").forEach(a => a.classList.toggle("open", a.dataset.cat === cat));
    nav.querySelectorAll("a[data-in]").forEach(a => { a.hidden = a.dataset.in !== cat; set(a, a.dataset.tab === tab && !!cat); });
    document.body.classList.toggle("snOff", page === "#/");   // 首頁本身就是功能卡片，不再重複顯示左側選單（使用者要求，參考 realizcalc.com 首頁）
    nav.querySelectorAll("a[data-h]").forEach(a => {
      const on = a.dataset.h === page || (page === "#/template" && a.dataset.h === "#/checklist");
      set(a, on);
    });
  };
  window.addEventListener("hashchange", mark);
  mark();
})();
