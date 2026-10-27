"use strict";
/* 附加檔案（電子檔）：PDF、Word、Excel、圖片…，單檔 10 MB 以內
   存在這支手機的瀏覽器裡（IndexedDB「files」，以 Blob 保存），不會上傳到任何伺服器；備份檔可選擇是否包含。
   每個檔案以 recId 綁在某筆紀錄上（檢查表、點工單、缺失、澆置、材料進場…），刪除紀錄時一併刪除。 */

const ATT_MAX = 10 * 1024 * 1024;
const attMB = n => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const attIcon = f => /pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? "📕" : /^image\//.test(f.type) ? "🖼" : /word|\.docx?$/i.test(f.type + f.name) ? "📘" : /excel|sheet|\.xlsx?$/i.test(f.type + f.name) ? "📗" : "📄";
const attFilesOf = async recId => (await DB.all("files")).filter(f => f.recId === recId).sort((a, b) => a.created - b.created);
// recId 可能是「紀錄id」或「紀錄id_後綴」（例如試壓報告），兩者一併清除；uid 只含英數字，不會有底線，不會誤刪
async function attPurge(ids) { const set = new Set([].concat(ids)); for (const f of await DB.all("files")) if (set.has(f.recId) || set.has(String(f.recId).split("_")[0])) await DB.del("files", f.id); }
async function attTotal() { const fs = await DB.all("files"); return { n: fs.length, size: fs.reduce((a, f) => a + (f.size || 0), 0) }; }
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
// 取出附加檔案中的圖片（縮到長邊 1600px、轉 JPEG），讓列印與 PDF 可以直接顯示
const ATT_IMG = ["image/png", "image/jpeg", "image/webp", "image/gif"];
async function attImages(ids) {
  const set = new Set([].concat(ids)), out = [];
  for (const f of (await DB.all("files")).filter(f => set.has(f.recId) && ATT_IMG.includes(f.type) && f.blob).sort((a, b) => a.created - b.created)) {
    try {
      const bmp = await createImageBitmap(f.blob), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
      c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
      out.push({ recId: f.recId, name: f.name, data: c.toDataURL("image/jpeg", 0.85) });
    } catch { /* 讀不出來的圖就略過，仍會在檔名清單中註明 */ }
  }
  return out;
}
// 附加圖片頁：回傳整頁 HTML（沒有圖片就回傳空字串）
async function attGallery(ids, title = "附件：附加圖片", cap = () => "") {
  const im = await attImages(ids);
  return im.length ? `<div class="paper gallery"><div class="ptitle">${esc(title)}</div><div class="gal">${im.map(p => `<figure><img src="${safeImg(p.data)}"><figcaption>${esc(cap(p))}${esc(p.name)}</figcaption></figure>`).join("")}</div></div>` : "";
}
// 列印時在單據下方註明有哪些附加的電子檔（檔案本身不會印出）
async function attNamesLine(ids, skipImages) {
  const set = new Set([].concat(ids)), fs = (await DB.all("files")).filter(f => set.has(f.recId) && !(skipImages && ATT_IMG.includes(f.type))).sort((a, b) => a.created - b.created);
  return fs.length ? `<p class="cnote" style="margin-top:3mm">附加電子檔（不隨本單印出）：${fs.map(f => `${esc(f.name)}（${attMB(f.size)}）`).join("、")}</p>` : "";
}

function attBlock(title = "附加檔案", top = "") {
  return `<div class="panel" id="attBox"><b>${top ? esc(title) : "📎 " + esc(title)}</b>${top} <small style="color:var(--mut)">PDF、Word、Excel、圖片，單檔 10 MB 以內；也可以改用拍照</small>
    <div style="margin-top:8px"><label class="phbtn" style="display:inline-flex">📎 選擇檔案<input type="file" id="attInput" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*" hidden></label></div>
    <div id="attList" style="margin-top:8px"></div></div>`;
}

async function attBind(root, recId, opt = {}) {
  const box = root.querySelector("#attBox"); if (!box) return;
  const list = box.querySelector("#attList"), input = box.querySelector("#attInput");
  if (opt.readonly) box.querySelector("label.phbtn").hidden = true;
  const draw = async () => {
    const fs = await attFilesOf(recId);
    list.innerHTML = fs.length ? fs.map(f => `<div class="att" data-id="${esc(f.id)}"><span class="aic">${attIcon(f)}</span><div class="ainf"><b>${esc(f.name)}</b><small>${attMB(f.size)}</small></div>
      <button class="sec" data-a="open">開啟</button><button class="sec" data-a="share">分享</button>${opt.readonly ? "" : `<button class="danger" data-a="del" aria-label="刪除">✕</button>`}</div>`).join("") : `<small style="color:var(--mut)">尚未附加檔案</small>`;
  };
  await draw();
  input.onchange = async e => {
    const files = [...e.target.files]; e.target.value = "";
    const big = files.filter(f => f.size > ATT_MAX);
    if (big.length) alert(`以下檔案超過 10 MB，沒有加入：\n${big.map(f => `${f.name}（${attMB(f.size)}）`).join("\n")}\n\n建議改用拍照，或先縮小檔案再附加。`);
    for (const f of files.filter(f => f.size <= ATT_MAX)) {
      try { await DB.put("files", { id: uid(), recId, name: f.name, type: f.type || "application/octet-stream", size: f.size, blob: f, created: Date.now() }); }
      catch { alert(`「${f.name}」存不進去，可能是手機儲存空間不足。`); }
    }
    await draw(); opt.onChange?.();
  };
  list.onclick = async e => {
    const btn = e.target.closest("[data-a]"); if (!btn) return;
    const id = btn.closest(".att").dataset.id, f = await DB.get("files", id); if (!f) return;
    if (btn.dataset.a === "del") { if (!confirm(`刪除「${f.name}」？`)) return; await DB.del("files", id); await draw(); opt.onChange?.(); return; }
    const url = URL.createObjectURL(f.blob);
    const download = () => { const a = document.createElement("a"); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); };
    if (btn.dataset.a === "share") {
      const file = new File([f.blob], f.name, { type: f.type });
      try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: f.name }); return; } } catch (er) { if (er?.name === "AbortError") return; }
      download();
    } else if (INLINE_OPEN_TYPES.includes(f.type)) { const w = window.open(url, "_blank"); if (w) w.opener = null; else download(); }      // 只有 PDF 與常見點陣圖直接開啟（SVG、HTML 一律下載）；開不了就改下載
    else download();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  };
}
