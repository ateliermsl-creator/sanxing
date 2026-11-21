require('./uidlg');
// cure_backup_xss：見 tests/README.md
const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch(),p=await b.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(800);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'測試工地'});localStorage.setItem('siteId','s1');const d=new Date();d.setDate(d.getDate()-10);const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
await DB.put('pours',{id:'j1',siteId:'s1',date:iso,floor:'3F',part:'頂版',supplier:'',fc:'280',slumpMin:'',slumpMax:'',clMax:'',limitMin:'',created:1,updated:1,trucks:[{id:'t1',plate:'A',ticket:'',leave:'',arrive:'',volume:'6',slump:'',chloride:'',temp:'',sampled:true,specimen:'A1',disp:'use',note:'',names:{},sigs:{},created:1,tests:{7:{date:iso,vals:['300','310'],note:'x'},28:{skip:true}}}],forms:{'樑底模':{strip:iso}}});
await DB.put('matcats',{id:'__cure',ages:[7,28],forms:[{n:'樑底模',d:'14'}],updated:5});
await DB.put('files',{id:'f1',recId:'t1_7',name:'r.pdf',type:'application/pdf',size:3,blob:new Blob(['%PDF']),created:1});});
await p.reload();
// 備份→(惡意改動)→匯入
await p.goto('http://localhost:8793/index.html#/backup');await p.waitForSelector('#expBtn');
const [dl]=await Promise.all([p.waitForEvent('download'),p.click('#expBtn')]);const path=await dl.path();const j=JSON.parse(fs.readFileSync(path,'utf8'));
console.log('備份含 tests/forms/__cure:',!!j.pours[0].trucks[0].tests['7'],!!j.pours[0].forms['樑底模'],!!j.matcats.find(x=>x.id==='__cure'));
j.pours[0].forms['<img src=x onerror=window.__x=1>']={strip:'<script>'};j.pours[0].trucks[0].tests['7'].vals.push('<img src=x onerror=window.__x=2>');j.pours[0].updated=99;
fs.writeFileSync(require('os').tmpdir()+'/imp.json',JSON.stringify(j));
await p.evaluate(()=>indexedDB.deleteDatabase('x'));
await p.setInputFiles('#impFile',require('os').tmpdir()+'/imp.json');await p.waitForTimeout(1200);
const got=await p.evaluate(async()=>{const b=await DB.get('pours','j1');return {forms:Object.keys(b.forms),vals:b.trucks[0].tests['7'].vals,skip:b.trucks[0].tests['28'].skip}});
console.log('匯入後',JSON.stringify(got));
await p.goto('http://localhost:8793/index.html#/cure/ledger');await p.waitForTimeout(600);console.log('xss',await p.evaluate(()=>window.__x),'錯誤',e);await b.close();})();
