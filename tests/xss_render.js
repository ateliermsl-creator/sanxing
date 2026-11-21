require('./uidlg');
// xss_render：見 tests/README.md
// 直接把惡意字串寫進 DB（繞過匯入清理器），並拿掉 CSP，測試各頁面「顯示時」的轉義
const {chromium}=require('playwright');const fs=require('fs');
const seed=fs.readFileSync(__dirname+'/seed_all.txt','utf8');
const PAY='"><img src=x onerror=window.__x=1><svg onload=window.__x=2>';
const IMG='x" onerror="window.__x=3" a="';
(async()=>{const b=await chromium.launch(),c=await b.newContext({viewport:{width:390,height:844}});
await c.route('**/index.html',async r=>{const resp=await r.fetch();let t=await resp.text();t=t.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,'');r.fulfill({response:resp,body:t});});
const p=await c.newPage();const errs=[];p.on('pageerror',x=>errs.push(x.stack.split('\n').slice(0,3).join(' | ')));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(700);
await p.evaluate(`(async()=>{${seed.replace(/^await p\.evaluate\(async\(\)=>\{/,'').replace(/\}\);\s*$/,'').replace("const lid=await lgNew();","siteId='s9';const lid=await lgNew();")}})()`);
await p.evaluate(async()=>{await DB.put('matcats',{id:'__cure',ages:[7,28],forms:[{n:'樑底模',d:'14'}],updated:1});});
// 汙染：所有字串（除結構性欄位）
await p.evaluate(async([PAY,IMG])=>{
 const SKIP=new Set(['id','siteId','recId','templateId','status','kind','type','r','disp','unit']);
 const IMGK=new Set(['data','thumb','raw','sig','hostSig','worker','manager','vendor_sig']);
 const taint=(o,k)=>{ if(typeof o==='string'){ if(SKIP.has(k))return o; if(IMGK.has(k))return IMG; if(/^\d{4}-\d{2}-\d{2}$/.test(o)||/^\d{1,2}:\d{2}$/.test(o)||/^\d+(\.\d+)?$/.test(o))return o+PAY; return PAY;} if(Array.isArray(o))return o.map(x=>taint(x,k)); if(o&&typeof o==='object'&&!(o instanceof Blob)){const n={};for(const kk of Object.keys(o)){ n[kk]=(IMGK.has(kk)&&typeof o[kk]==='object')?o[kk]:taint(o[kk],kk);} if(o.sigs)for(const kk of Object.keys(o.sigs))n.sigs[kk]=IMG; if(o.names)for(const kk of Object.keys(o.names))n.names[kk]=PAY; return n;} return o;};
 for(const s of ['records','workorders','punch','pours','matrecs','shots','safety','logs','photos','templates','matcats']){ for(const r of await DB.all(s)){ if(s==='matcats'&&r.id.startsWith('__'))continue; await DB.put(s,taint(r,'')); } }
 for(const f of await DB.all('files')){f.name=PAY;await DB.put('files',f);}
 await DB.put('sites',{id:'s9',name:PAY});localStorage.setItem('company',PAY);
 localStorage.setItem('calcTileRows',JSON.stringify([{name:PAY,s:'0',a:'3',b:'2',v:'',n:'1',op:[{w:'1',h:'1',n:'1'}]}]));localStorage.setItem('calcTileCfg',JSON.stringify({specs:[{name:PAY,L:'60',W:'30',j:'3',loss:'5',box:'8'}],loc:PAY,who:PAY,title:PAY,cur:'tlx'}));
 await DB.put('vols',{id:'tlx',siteId:'s9',kind:'tile',name:PAY,rows:[{name:PAY,s:'0',a:'3',b:'2',v:'',n:'1',op:[]}],cfg:{specs:[{name:PAY,L:'60',W:'30',j:'3',loss:'5',box:'8'}],loc:PAY,who:PAY},created:1,updated:2});
},[PAY,IMG]);
await p.reload();await p.waitForTimeout(700);
const ids=await p.evaluate(async()=>({lid:(await DB.all('logs'))[0]?.id}));
const routes=['#/','#/checklist','#/checklist/r1','#/checklist/r1/preview','#/template/tc1','#/workorder','#/workorder/w1','#/workorder/w1/preview','#/workorder/summary','#/punch','#/punch/pu1','#/punch/report','#/punch/summary','#/pour','#/pour/j1','#/pour/j1/truck/t0','#/pour/j1/print','#/pour/summary','#/material','#/material/m1','#/material/m1/print','#/material/cfg','#/material/summary','#/shot','#/shot/sp1','#/shot/album','#/safety','#/safety/sa1','#/safety/sa1/print','#/safety/set','#/cure','#/cure/ledger','#/cure/set','#/cure/test/t0/28','#/log','#/log/'+ids.lid,'#/log/'+ids.lid+'/print','#/calc','#/calc/lap','#/calc/mas','#/calc/tile','#/calc/tile/sheet','#/calc/sleeve','#/backup','#/install'];
let bad=0;
for(const h of routes){await p.goto('http://localhost:8793/index.html'+h);await p.waitForTimeout(450);
 const x=await p.evaluate(()=>window.__x);if(errs.length>(globalThis.__n||0)){console.log('JS錯誤於',h,errs.slice(globalThis.__n||0).map(m=>m.slice(0,60)));globalThis.__n=errs.length}
 // 也點開本頁的「選取模式」等不做，僅檢查渲染
 if(x){bad++;console.log('XSS 觸發',h,'→',x);await p.evaluate(()=>{window.__x=undefined});}}
console.log('已檢查',routes.length,'頁，XSS 觸發',bad,'JS錯誤',errs.length,errs.slice(0,5));await b.close();})();
