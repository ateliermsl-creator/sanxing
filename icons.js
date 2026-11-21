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
  more: '<path d="M12 5v14M5 12h14"/>',
  save: '<path d="M5 4a1 1 0 0 1 1-1h10.5L20 6.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"/><path d="M8.5 3v4.5h6V3"/><path d="M8 21v-6.5h8V21"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="M21 15.5l-5-4.5-9.5 8.5"/>',
  download: '<path d="M12 3.5v11M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19.5h14"/>',
  doc: '<path d="M6 3h8l4.5 4.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v4.5h4.5M8.5 12.5h7M8.5 16h5"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8.5 16v-4M12.5 16V8M16.5 16v-6"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01"/>',
  clip: '<path d="M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.5-7.5"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7"/><path d="M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5v-3a4 4 0 0 1 8 0v3"/>',
  gear: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  done: '<path d="M4.5 12.5l5 5 10-11"/>',
  wait: '<path d="M7 3h10M7 21h10"/><path d="M8 3v3.5l4 5.5-4 5.5V21M16 3v3.5L12 12l4 5.5V21"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  sync: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4.5h-4.5"/>',
  select: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>'
};
function ic(name, cls = "") {
  return `<svg class="ic${cls ? " " + cls : ""}" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${IC[name] || ""}</svg>`;
}

// 按鈕開頭的 emoji 自動換成同風格的線性圖示（2026-11-22 品牌識別第三批）
// 範圍：button、.btnlink、label.phbtn、summary；單據（.paper）與頂列不動。按鈕文字照舊寫 emoji 也可以，新按鈕建議直接用 ic()。
// ✕ ✓ ← 是一般文字符號（各手機顯示一致），不換。
// 文字改了（例如「⏳ 產生 PDF 中…」）會自動再換一次。只有圖示沒有字的按鈕記得要有 aria-label。
const IC_EMOJI = {
  "🖨": "print", "📤": "share", "💾": "save", "📂": "folder", "✍": "pen", "✎": "edit", "✏": "edit", "✔": "done", "✅": "done",
  "📷": "cam", "🖼": "image", "👁": "eye", "⬇": "download", "📥": "download", "⬆": "upload", "📄": "doc", "📊": "chart", "📋": "list",
  "📎": "clip", "🗑": "trash", "➕": "plus", "＋": "plus", "📍": "pin", "☁": "cloud", "🔒": "lock", "⚙": "gear", "↩": "undo", "☑": "select",
  "⏳": "wait", "✉": "mail", "📮": "mail", "⟳": "sync", "🔄": "sync", "📖": "log", "🧪": "cyl", "🔧": "edit"
};
const IC_RE = new RegExp("^(\\s*)(" + Object.keys(IC_EMOJI).join("|") + ")\\uFE0F?\\s*");
const IC_SEL = "button, a.btnlink, label.btnlink, label.phbtn, summary";
function icSwapOne(b) {
  if (b.closest(".paper, #topbar, .sym, [data-noic]")) return;
  const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
  let t; while ((t = w.nextNode()) && !t.nodeValue.trim());
  if (!t || t.parentElement.closest("svg, select, .uiin")) return;
  const m = IC_RE.exec(t.nodeValue); if (!m) return;
  const rest = t.nodeValue.slice(m[0].length);
  const tmp = document.createElement("span"); tmp.innerHTML = ic(IC_EMOJI[m[2]], "bi");
  t.parentNode.insertBefore(tmp.firstChild, t);
  t.nodeValue = rest;
  b.classList.toggle("bi-only", !b.textContent.trim());
}
function icSwap(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches(IC_SEL)) icSwapOne(root);
  const up = root.closest?.(IC_SEL); if (up && up !== root) icSwapOne(up);
  root.querySelectorAll(IC_SEL).forEach(icSwapOne);
}
new MutationObserver(ms => {
  for (const m of ms) {
    if (m.type === "characterData") icSwap(m.target.parentElement);
    else for (const n of m.addedNodes) icSwap(n.nodeType === 1 ? n : n.parentElement);
  }
}).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
document.addEventListener("DOMContentLoaded", () => icSwap(document.body));
