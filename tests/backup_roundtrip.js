// backup_roundtrip：見 tests/README.md
// 備份→匯入 往返：找出被清理器丟掉的欄位
const {chromium}=require('playwright');const fs=require('fs');
const seed=fs.readFileSync(__dirname+'/seed_all.txt','utf8');
(async()=>{const b=await chromium.launch(),errs=[];
const mk=async()=>{const c=await b.newContext({viewport:{width:390,height:844}});const p=await c.newPage();p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>d.accept());return p};
const A=await mk();await A.goto('http://localhost:8793/index.html');await A.waitForTimeout(700);
await A.evaluate(`(async()=>{${seed.replace(/^await p\.evaluate\(async\(\)=>\{/,'').replace(/\}\);\s*$/,'')}})()`);
await A.evaluate(async()=>{ // 補其他資料
 await DB.put('templates',{id:'tc1',custom:true,cat:'自訂',name:'自訂表',sub:'分項',items:[{t:'項目一',std:'標準'}],created:1,updated:5});
 await DB.put('matcats',{id:'c1',name:'自訂類別',checks:['a','b'],order:1,created:1,updated:2});
 await DB.put('matcats',{id:'__docs',docs:['出廠證明'],updated:3});
 await DB.put('matcats',{id:'__cure',ages:[7,14,28],forms:[{n:'樑底模',d:'14'}],updated:3});
 await DB.put('matcats',{id:'__safety',risks:['甲'],hazards:['乙'],statement:'聲明',updated:3});
 const pj=await DB.get('pours','j1');pj.forms={'樑底模':{strip:'2026-10-28'}};pj.trucks[0].tests={7:{date:'2026-10-28',vals:['300','310'],note:'x'},28:{skip:true}};await DB.put('pours','j1'.length?pj:pj);
 await DB.put('vols',{id:'vl1',siteId:'s1',name:'3F 版梁',rows:[{name:'外牆',type:'wall',a:'10',b:'3',c:'0.2',d:'',e:'',n:'1',op:[{w:'1.2',h:'2.1',n:'2'}]},{name:'G1',type:'beam',a:'7.4',b:'0.4',c:'0.7',d:'0.15',e:'',n:'3',op:[]}],cfg:{loss:'5',cap:'6',loc:'3F',who:'王'},created:1,updated:9});
 await DB.put('files',{id:'fl1',recId:'t0_7',name:'報告.pdf',type:'application/pdf',size:4,blob:new Blob(['%PDF']),created:1});
});
await A.reload();await A.waitForTimeout(600);
const dump=async p=>p.evaluate(async()=>{const o={};for(const s of ['sites','records','templates','photos','workorders','punch','pours','matrecs','matcats','shots','safety','logs','vols'])o[s]=await DB.all(s);return o});
const orig=await dump(A);
await A.goto('http://localhost:8793/index.html#/backup');await A.waitForSelector('#expBtn');
let dl;try{[dl]=await Promise.all([A.waitForEvent('download',{timeout:8000}),A.click('#expBtn')]);}catch(e){console.log('匯出失敗',errs,await A.evaluate(()=>document.body.innerText.slice(0,200)));process.exit(1)}fs.copyFileSync(await dl.path(),require('os').tmpdir()+'/rt.json');
const B=await mk();await B.goto('http://localhost:8793/index.html#/backup');await B.waitForSelector('#impFile',{state:'attached'});
await B.setInputFiles('#impFile',require('os').tmpdir()+'/rt.json');await B.waitForTimeout(2500);
const got=await dump(B);
let lost=0;
const cmp=(path,a,b)=>{ if(a===undefined)return; if(a&&typeof a==='object'){ if(b===undefined||b===null){console.log('  遺失',path);lost++;return;} for(const k of Object.keys(a))cmp(path+'.'+k,a[k],b[k]); } else if(a!==b && !(a===''&&b===undefined)){console.log('  不同',path,JSON.stringify(a)?.slice(0,40),'→',JSON.stringify(b)?.slice(0,40));lost++;} };
for(const s of Object.keys(orig)){const m=Object.fromEntries(got[s].map(x=>[x.id,x]));let n=0;for(const r of orig[s]){ if(s==='matcats'&&r.id.startsWith('__seed'))continue; if(!m[r.id]){console.log('整筆遺失',s,r.id);lost++;continue;} for(const k of Object.keys(r)){ if(k==='updated'&&0)continue; cmp(s+'['+r.id+'].'+k,r[k],m[r.id][k]); } n++; } console.log(s.padEnd(11),'原',orig[s].length,'匯入後',got[s].length);}
// 附加檔
const fc=await B.evaluate(async()=>(await DB.all('files')).map(f=>f.id+':'+f.blob?.size));console.log('files',fc);
console.log('總遺失/不同:',lost,'JS錯誤',errs);await b.close();})();
