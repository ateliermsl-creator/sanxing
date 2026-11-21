"use strict";
/* 計算機「分步驟分頁」（2026-11-21 使用者要求，參考他提供的範例圖「1 格局 2 門窗…」）
   把計算機上方的步驟列（.cfsteps，原本是捲動到該段的連結）改成分頁：一次只顯示一個步驟，
   底部有「上一步／下一步」。不改各計算機的程式與計算，只在畫面上隱藏其他步驟的區塊。
   - 第 i 步的範圍：步驟列所在容器裡，從第 i 個連結指到的區塊，到第 i+1 個區塊之前的所有兄弟元素；
     第一個區塊之前的（例如「目前紀錄」）一律顯示；最後一步後面的 p.cnote（說明）一律顯示。
   - 電腦版（≥ 1024px）最後一步（檢核結果）本來就固定在右欄，所以一律顯示，分頁只切換前面幾步。
   - 各計算機重畫（innerHTML）後自動重新套用；目前在第幾步依網址記在 sessionStorage。
   - 「全部顯示」恢復原本一長頁（記在 localStorage cfStepAll）。
   - 摘要列「看結果」等要跳到某個區塊時呼叫 cfStepReveal(元素)，會先切到該步。 */
(() => {
  const view = document.getElementById("view");
  const wide = matchMedia("screen and (min-width:1024px)");
  const key = () => "cfStep:" + location.hash.split("/").slice(0, 3).join("/");
  const ss = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch {} }
  };
  const allOn = () => { try { return localStorage.getItem("cfStepAll") === "1"; } catch { return false; } };
  const setAll = on => { try { on ? localStorage.setItem("cfStepAll", "1") : localStorage.removeItem("cfStepAll"); } catch {} };

  // 解析：回傳 { box, links, groups:[[元素…]…], last }，last 是最後一步是否固定顯示（電腦版）
  function parse(bar) {
    const box = bar.parentElement;
    const links = [...bar.querySelectorAll("a[href^='#']")];
    const heads = links.map(a => { try { return box.querySelector(a.getAttribute("href")); } catch { return null; } });
    if (heads.length < 2 || heads.some(h => !h || h.parentElement !== box)) return null;
    const kids = [...box.children], idx = heads.map(h => kids.indexOf(h));
    if (idx.some((v, i) => i && v <= idx[i - 1])) return null;
    const groups = idx.map((start, i) => kids.slice(start, i + 1 < idx.length ? idx[i + 1] : kids.length)
      .filter(el => !el.classList.contains("cfnav") && !(i === idx.length - 1 && el.matches("p.cnote"))));
    return { box, links, groups };
  }

  function apply() {
    const bar = view.querySelector(".cfsteps");
    if (!bar) return;
    const P = parse(bar);
    if (!P) return;
    const { box, links, groups } = P;
    const all = allOn();
    const pinLast = wide.matches;                       // 電腦版：結果固定在右欄
    const n = pinLast ? links.length - 1 : links.length;  // 可切換的步數
    let cur = Math.min(Math.max(+ss.get(key()) || 0, 0), n - 1);
    bar.classList.add("cfseg");
    bar.classList.toggle("cfall", all);
    bar.setAttribute("role", "tablist");
    links.forEach((a, i) => {
      const on = !all && i === cur;
      a.classList.toggle("on", on);
      a.setAttribute("role", "tab");
      a.setAttribute("aria-selected", on ? "true" : "false");
    });
    // 全部顯示切換鈕
    let row = bar.nextElementSibling?.classList.contains("cfallrow") ? bar.nextElementSibling : null;
    if (!row) { row = document.createElement("div"); row.className = "cfallrow"; row.innerHTML = `<button type="button" class="cfallbtn"></button>`; bar.after(row); }
    const tg = row.firstElementChild;
    const tt = all ? "分步顯示" : "全部顯示";
    if (tg.textContent !== tt) tg.textContent = tt;
    tg.setAttribute("aria-pressed", all ? "true" : "false");
    groups.forEach((g, i) => g.forEach(el => el.classList.toggle("cfoff", !all && i !== cur && !(pinLast && i === links.length - 1))));
    // 上一步／下一步
    // 只在需要時才動 DOM（自己的修改也會觸發 MutationObserver，避免無限循環）
    const old = [...box.querySelectorAll(":scope > .cfnav")];
    let html = "", last = null;
    if (!all) {
      last = groups[cur][groups[cur].length - 1];
      const lbl = a => a.textContent.trim();
      html = (cur > 0 ? `<button type="button" class="sec" data-go="${cur - 1}">‹ ${esc(lbl(links[cur - 1]))}</button>` : "<span></span>")
        + (cur < n - 1 ? `<button type="button" data-go="${cur + 1}">下一步：${esc(lbl(links[cur + 1]))} ›</button>` : "");
    }
    if (old.length === 1 && last && old[0].previousElementSibling === last && old[0].dataset.h === html) return;
    old.forEach(x => x.remove());
    if (last) {
      const nav = document.createElement("div");
      nav.className = "cfnav"; nav.dataset.h = html; nav.innerHTML = html;
      last.after(nav);
    }
  }

  function go(i, scroll = true) {
    ss.set(key(), String(i));
    apply();
    if (!scroll) return;
    // 捲到這一步的開頭（步驟列固定在上方，所以對齊到步驟列下緣）
    const bar = view.querySelector(".cfsteps"), P = bar && parse(bar), first = P?.groups[i]?.[0];
    if (!first) return;
    const y = first.getBoundingClientRect().top - Math.max(bar.getBoundingClientRect().bottom, 0) - 10;
    if (y < 0) scrollBy(0, y);
  }

  // 點步驟列（取代各計算機原本的「捲動到該段」）、全部顯示、上一步／下一步；用捕捉階段先攔下
  view.addEventListener("click", e => {
    const a = e.target.closest(".cfsteps.cfseg a[href^='#']");
    if (a) {
      const bar = a.closest(".cfsteps"), links = [...bar.querySelectorAll("a[href^='#']")], i = links.indexOf(a);
      if (allOn()) return;   // 全部顯示時維持原本的捲動
      e.preventDefault(); e.stopImmediatePropagation();
      if (wide.matches && i === links.length - 1) return;
      go(i); return;
    }
    if (e.target.closest(".cfallbtn")) { setAll(!allOn()); apply(); return; }
    const b = e.target.closest(".cfnav [data-go]");
    if (b) go(+b.dataset.go);
  }, true);

  window.cfStepReveal = el => {
    const bar = view.querySelector(".cfsteps.cfseg");
    if (!bar || allOn() || !el) return;
    const P = parse(bar); if (!P) return;
    const i = P.groups.findIndex(g => g.some(x => x === el || x.contains(el)));
    if (i < 0 || (wide.matches && i === P.links.length - 1)) return;
    ss.set(key(), String(i)); apply();
  };

  new MutationObserver(apply).observe(view, { childList: true, subtree: true });
  wide.addEventListener?.("change", apply);
})();
