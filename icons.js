"use strict";
/* 統一圖示（2026-11-22 品牌識別第二批，取代 emoji）
   規格：24 px 方格、線寬 1.75、圓角端點、單色（顏色跟著文字 currentColor）。
   用法：ic("check") 回傳一段 <svg>；同一個功能在首頁、側欄、頁面都用同一個名字。新增功能時在這裡加一筆。
   單據（.paper）裡的 ○ ✕ ／ 判定符號不換。 */
const IC = {
  check: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 2.5h6v3H9z"/><path d="M8.5 13l2.5 2.5 4.5-5"/>',
  hat: '<path d="M3 18h18"/><path d="M5 18v-1.5a7 7 0 0 1 14 0V18"/><path d="M10 9.7V7.5h4v2.2"/>',
  log: '<path d="M6 3h12v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M4 18a2 2 0 0 1 2-2h12"/><path d="M8 7.5h6M8 11h4"/>',
  box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
  truck: '<path d="M2 16V7h10v9"/><path d="M12 10h4l4 4v2h-2"/><path d="M12 16H8"/><circle cx="6" cy="17" r="2"/><circle cx="16" cy="17" r="2"/><path d="M4 7l3-2.5 4 1"/>',
  cyl: '<ellipse cx="12" cy="5.5" rx="5.5" ry="2.2"/><path d="M6.5 5.5v12.5c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V5.5"/><path d="M9.5 12h5"/>',
  pin: '<path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  sign: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 10.5h5"/><path d="M7 16.5c1.2-1.8 2.2-1.8 2.8 0s1.6 1.8 2.8 0 1.8-1.2 2.6 0 1 .6 1.8 0"/>',
  calc: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><rect x="8" y="5.5" width="8" height="4" rx="1"/><path d="M8.5 13h.01M12 13h.01M15.5 13h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/>',
  cam: '<path d="M4 7.5h3l2-2.5h6l2 2.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  form: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 9.5h16M4 14.5h16M12 4v16"/>',
  scaf: '<path d="M5 3v18M19 3v18M5 8h14M5 15h14M5 8l14 7"/>',
  bolt: '<path d="M12 3v15"/><path d="M8 3.5h8"/><path d="M10 7l4-1.5M10 10l4-1.5M10 13l4-1.5"/><path d="M6 18h12M6 21h12"/>',
  sec: '<path d="M6 4h12v3h-4.3v10H18v3H6v-3h4.3V7H6z"/>',
  ruler: '<path d="M3 16.5 16.5 3 21 7.5 7.5 21z"/><path d="M7 12.5l2 2M10 9.5l2 2M13 6.5l2 2"/>',
  backup: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.7 3.7 0 0 1 17 18.5"/><path d="M12 12.5V20M9 15l3-3 3 3"/>',
  cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.7 3.7 0 0 1 17 18.5z"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18h2"/>',
  home: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h4.5v-5h3v5H18V9.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/><path d="M12.5 7.5l4 4"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
  print: '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="9" rx="2"/><path d="M7 14h10v7H7z"/>',
  pen: '<path d="M4 20l2-6L16 4l4 4L10 18z"/><path d="M4 20l6-2"/><path d="M13.5 6.5l4 4"/>',
  folder: '<path d="M3 6.5a1 1 0 0 1 1-1h5l2 2.5h9a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  more: '<path d="M12 5v14M5 12h14"/>'
};
function ic(name, cls = "") {
  return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IC[name] || ""}</svg>`;
}
