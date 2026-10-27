"use strict";
/* 資料安全
   匯入的備份檔視為「不可信的輸入」（可能被別人改過再傳給你）：逐筆驗證型別、ID、圖片與檔案資料，
   不合格的丟棄，只保留已知欄位。顯示時圖片來源只接受 data:image/…;base64，ID 只接受英數、底線、連字號。
   ※ 之後新增資料欄位時，請同步更新這裡的清理規則，否則匯入時該欄位會被丟掉。 */

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_IMG = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]*$/;
const SAFE_DATA = /^data:[a-z0-9.+\/-]{0,100};base64,[A-Za-z0-9+/=]*$/i;
const SAFE_FILE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"];
const INLINE_OPEN_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];   // 只有這些類型可以在瀏覽器內直接開啟（SVG、HTML 一律只下載）

const safeImg = v => (typeof v === "string" && v.length < 15e6 && SAFE_IMG.test(v)) ? v : "";
const safeId = v => (typeof v === "string" && SAFE_ID.test(v)) ? v : "";

const cs = (v, max = 4000) => typeof v === "string" ? v.slice(0, max) : (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const cn = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const cb = v => v === true;
const ce = (v, list, def) => list.includes(v) ? v : def;
const cdate = v => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : "";
const ctime = v => (typeof v === "string" && /^\d{1,2}:\d{2}$/.test(v)) ? v : "";
const ciso = v => (typeof v === "string" && v.length <= 40) ? v : "";
const arr = (v, max = 5000) => Array.isArray(v) ? v.slice(0, max) : [];
const obj = v => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
const cname = v => cs(v, 200).replace(/[\u0000-\u001f\u007f]/g, "");
const csigs = (v, keys) => Object.fromEntries(keys.map(k => [k, safeImg(obj(v)[k])]).filter(([, x]) => x));
const cnames = (v, keys) => Object.fromEntries(keys.map(k => [k, cs(obj(v)[k], 100)]));
const clog = v => arr(v, 200).map(l => ({ at: ciso(obj(l).at), text: cs(obj(l).text, 500) }));

const CLEAN = {
  sites: x => safeId(x.id) && { id: x.id, name: cs(x.name, 200) },
  records: x => safeId(x.id) && safeId(x.siteId) && {
    id: x.id, siteId: x.siteId, templateId: cs(x.templateId, 64), docNo: cs(x.docNo, 100), contractor: cs(x.contractor, 200), subcontractor: cs(x.subcontractor, 200),
    date: cdate(x.date), location: cs(x.location, 200), timing: { before: cb(obj(x.timing).before), during: cb(obj(x.timing).during), after: cb(obj(x.timing).after) },
    items: Object.fromEntries(Object.entries(obj(x.items)).filter(([k]) => /^\d{1,3}$/.test(k)).map(([k, v]) => [k, { r: ce(obj(v).r, ["ok", "ng", "na", ""], ""), actual: cs(obj(v).actual), note: cs(obj(v).note) }])),
    sigs: csigs(x.sigs, ["worker", "manager"]), updated: cn(x.updated) },
  templates: x => safeId(x.id) && x.custom === true && {
    id: x.id, custom: true, cat: cs(x.cat, 100), name: cs(x.name, 200), sub: cs(x.sub, 200),
    items: arr(x.items, 300).map(i => ({ t: cs(obj(i).t, 300), std: cs(obj(i).std, 300) })), created: cn(x.created), updated: cn(x.updated) },
  photos: x => safeId(x.id) && safeId(x.recId) && safeImg(x.data) && { id: x.id, recId: x.recId, itemIdx: cn(x.itemIdx), data: x.data, created: cn(x.created) },
  workorders: x => safeId(x.id) && safeId(x.siteId) && {
    id: x.id, siteId: x.siteId, docNo: cs(x.docNo, 100), date: cdate(x.date), vendor: cs(x.vendor, 200), location: cs(x.location, 200), content: cs(x.content, 2000),
    lines: arr(x.lines, 200).map(l => ({ kind: ce(obj(l).kind, ["人力", "機械"], "人力"), name: cs(obj(l).name, 100), other: cb(obj(l).other), spec: cs(obj(l).spec, 100), qty: cs(obj(l).qty, 30),
      start: ctime(obj(l).start), end: ctime(obj(l).end), brk: cs(obj(l).brk, 30), price: cs(obj(l).price, 30), unit: ce(obj(l).unit, ["day", "hour", "lump"], "day") })),
    names: cnames(x.names, ["vendor", "site"]), sigs: csigs(x.sigs, ["vendor", "site"]), status: ce(x.status, ["draft", "signed"], "draft"), signedAt: ciso(x.signedAt), log: clog(x.log), updated: cn(x.updated) },
  punch: x => safeId(x.id) && safeId(x.siteId) && {
    id: x.id, siteId: x.siteId, no: cs(x.no, 60), location: cs(x.location, 200), desc: cs(x.desc, 2000), trade: cs(x.trade, 100), due: cdate(x.due), foundDate: cdate(x.foundDate), foundBy: cs(x.foundBy, 100),
    status: ce(x.status, ["open", "fixed", "closed"], "open"), fixedAt: cdate(x.fixedAt), fixedNote: cs(x.fixedNote, 1000), closedAt: cdate(x.closedAt), closedBy: cs(x.closedBy, 100), rejects: cn(x.rejects),
    thumb: safeImg(x.thumb), seedLoc: typeof x.seedLoc === "string" ? cs(x.seedLoc, 200) : undefined, log: clog(x.log), created: cn(x.created), updated: cn(x.updated) },
  pours: x => safeId(x.id) && safeId(x.siteId) && {
    id: x.id, siteId: x.siteId, date: cdate(x.date), floor: cs(x.floor, 50), part: cs(x.part, 100), supplier: cs(x.supplier, 200), fc: cs(x.fc, 30), slumpMin: cs(x.slumpMin, 30), slumpMax: cs(x.slumpMax, 30),
    clMax: cs(x.clMax, 30), limitMin: cs(x.limitMin, 30), created: cn(x.created), updated: cn(x.updated),
    trucks: arr(x.trucks, 500).map(t => safeId(obj(t).id) && ({ id: t.id, plate: cs(t.plate, 50), ticket: cs(t.ticket, 60), leave: ctime(t.leave), arrive: ctime(t.arrive), volume: cs(t.volume, 30), slump: cs(t.slump, 30),
      chloride: cs(t.chloride, 30), temp: cs(t.temp, 30), sampled: cb(t.sampled), specimen: cs(t.specimen, 100), disp: ce(t.disp, ["use", "reject"], "use"), note: cs(t.note, 500),
      names: cnames(t.names, ["tester", "driver"]), sigs: csigs(t.sigs, ["tester", "driver"]), created: cn(t.created) })).filter(Boolean) },
  matrecs: x => safeId(x.id) && safeId(x.siteId) && {
    id: x.id, siteId: x.siteId, date: cdate(x.date), time: ctime(x.time), catId: cs(x.catId, 64), catName: cs(x.catName, 100), name: cs(x.name, 200), spec: cs(x.spec, 200), qty: cs(x.qty, 30), unit: cs(x.unit, 20),
    vendor: cs(x.vendor, 200), ticket: cs(x.ticket, 60), lot: cs(x.lot, 60), location: cs(x.location, 200),
    docs: arr(x.docs, 50).map(d => ({ n: cs(obj(d).n, 100), v: cb(obj(d).v) })), checks: arr(x.checks, 300).map(c => ({ t: cs(obj(c).t, 300), r: ce(obj(c).r, ["ok", "ng", "na", ""], ""), note: cs(obj(c).note, 500), ...(obj(c).extra === true ? { extra: true } : {}) })),
    disp: ce(x.disp, ["accept", "reject", "pending"], "accept"), note: cs(x.note, 1000), names: cnames(x.names, ["deliver", "inspector"]), sigs: csigs(x.sigs, ["deliver", "inspector"]), created: cn(x.created), updated: cn(x.updated) },
  matcats: x => x.id === "__docs" ? { id: "__docs", docs: arr(x.docs, 50).map(d => cs(d, 100)).filter(Boolean), updated: cn(x.updated) }
    : x.id === "__deleted" ? { id: "__deleted", updated: cn(x.updated) }
    : safeId(x.id) && { id: x.id, name: cs(x.name, 100), checks: arr(x.checks, 300).map(c => cs(c, 300)).filter(Boolean), order: cn(x.order), created: cn(x.created), updated: cn(x.updated) },
  files: x => safeId(x.id) && safeId(x.recId) && typeof x.data === "string" && x.data.length < 20e6 && SAFE_DATA.test(x.data) && {
    id: x.id, recId: x.recId, name: cname(x.name) || "檔案", type: SAFE_FILE_TYPES.includes(x.type) ? x.type : "application/octet-stream", size: cn(x.size), created: cn(x.created), data: x.data }
};
function sanitizeBackup(raw) {
  if (!raw || raw.app !== "avocado-toolbox") throw new Error("not a backup");
  const out = { app: "avocado-toolbox", company: cs(raw.company, 200), dropped: 0 };
  for (const [k, fn] of Object.entries(CLEAN)) {
    const src = arr(raw[k], 50000); out[k] = src.map(x => (x && typeof x === "object") ? fn(x) : null).filter(Boolean);
    out.dropped += src.length - out[k].length;
  }
  return out;
}

function dataURLtoBlob(u) {
  const bin = atob(u.slice(u.indexOf(",") + 1)), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a]);
}
