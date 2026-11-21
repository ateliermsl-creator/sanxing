require('./uidlg');
// print_overflow：見 tests/README.md
const {chromium}=require('playwright');const fs=require('fs');const S=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(S+'pdfs',{recursive:true});require('fs').mkdirSync(S+'theme',{recursive:true});
(async()=>{const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});const errs=[];p.on('pageerror',x=>errs.push(x.message));p.on('dialog',d=>d.accept());
await p.goto('http://localhost:8793/index.html');await p.waitForTimeout(800);
await p.evaluate(async()=>{
 localStorage.setItem('company','三星蔥營造有限公司');
 await DB.put('sites',{id:'s9',name:'宜蘭三星蔥新建工程'});localStorage.setItem('siteId','s9');
 const td=shotLocalDate(new Date());
 // 彩色橫式測試圖
 const mk=(c,t)=>{const k=document.createElement('canvas');k.width=1200;k.height=900;const g=k.getContext('2d');g.fillStyle=c;g.fillRect(0,0,1200,900);g.fillStyle='#fff';g.font='100px sans-serif';g.fillText(t,350,470);return k.toDataURL('image/jpeg',.8)};
 const wide=()=>{const k=document.createElement('canvas');k.width=1400;k.height=420;const g=k.getContext('2d');g.lineWidth=8;g.beginPath();g.moveTo(40,300);g.bezierCurveTo(300,0,500,500,1300,120);g.stroke();return k.toDataURL()};const sig=wide();
 // 檢查表（21 項）
 const t=TEMPLATES.find(x=>x.id==='mep_embed');const items={};t.items.forEach((_,i)=>items[i]={r:i%7===3?'ng':'ok',actual:i%3?'':'實測 OK',note:''});
 await DB.put('records',{id:'r1',siteId:'s9',templateId:'mep_embed',docNo:'A-001',contractor:'三星蔥',subcontractor:'甲機電',date:td,location:'3F',timing:{before:true,during:false,after:false},items,sigs:{worker:sig,manager:sig},updated:1});
 // 點工單
 await DB.put('workorders',{id:'w1',siteId:'s9',docNo:'1',date:td,vendor:'甲工程行',location:'3F',content:'鋼筋綁紮',lines:[{kind:'人力',name:'鋼筋工',other:false,spec:'',qty:'8',start:'08:00',end:'17:00',brk:'1',price:'2800',unit:'day'},{kind:'機械',name:'吊車',other:false,spec:'25噸',qty:'1',start:'08:00',end:'12:00',brk:'0',price:'3500',unit:'hour'}],names:{vendor:'王',site:'李'},sigs:{vendor:sig,site:sig},status:'signed',signedAt:new Date().toISOString(),log:[],updated:1});
 // 缺失
 for(let i=0;i<8;i++)await DB.put('punch',{id:'pu'+i,siteId:'s9',no:'D-'+(i+1),location:'3F 東側',desc:'鋼筋保護層不足，需補墊塊並複查，詳見現場照片',trade:i%2?'鋼筋班':'水電班',due:td,foundDate:td,foundBy:'李',status:i<5?'open':'fixed',fixedAt:'',fixedNote:'',closedAt:'',closedBy:'',rejects:0,thumb:mk('#a63','缺'+i),log:[],created:i,updated:i});
 await DB.put('photos',{id:'ph1',recId:'r1',itemIdx:0,data:mk('#369','檢查照'),created:1});
 // 澆置（8 車）
 const tr=n=>Array.from({length:n},(_,i)=>({id:'t'+i,plate:'ABC-'+(100+i),ticket:'N'+i,leave:'08:0'+i,arrive:'08:4'+i,volume:'6',slump:'15',chloride:'0.1',temp:'25',sampled:i%2===0,specimen:i%2===0?'A'+i:'',disp:i===5?'reject':'use',note:'',names:{tester:'陳'},sigs:{tester:sig,driver:sig},created:i}));
 await DB.put('pours',{id:'j1',siteId:'s9',date:td,floor:'3F',part:'頂版',supplier:'大發預拌廠',fc:'280',slumpMin:'12',slumpMax:'18',clMax:'0.15',limitMin:'90',created:1,updated:1,trucks:tr(8)});
 await DB.put('photos',{id:'ph2',recId:'t0',itemIdx:0,data:mk('#693','送貨單'),created:2});
 // 材料
 await DB.put('matrecs',{id:'m1',siteId:'s9',date:td,time:'09:00',catId:'x',catName:'竹節鋼筋',name:'D19 鋼筋',spec:'SD420W',qty:'5',unit:'噸',vendor:'甲鋼鐵',ticket:'T1',lot:'L1',location:'材料區',docs:[{n:'出廠證明',v:true},{n:'檢驗報告',v:false}],checks:[{t:'表面無嚴重浮鏽或油污',r:'ok',note:''},{t:'滾印標記',r:'ng',note:'模糊'}],disp:'accept',note:'',names:{deliver:'王',inspector:'李'},sigs:{deliver:sig,inspector:sig},created:1,updated:1});
 // 施工照片 6 張
 for(let i=0;i<6;i++)await DB.put('shots',{id:'sp'+i,siteId:'s9',date:td,time:'10:0'+i,item:'鋼筋綁紮',part:'3F 柱 C'+i,spec:'D19@15',vendor:'',note:'',data:mk(['#2a7','#37a','#a73','#73a','#7a3','#a37'][i],'照片'+(i+1)),raw:'',thumb:'',created:i,updated:i});
 // 勤前教育 25 人
 await DB.put('safety',{id:'sa1',siteId:'s9',date:td,time:'07:30',place:'3F 樓板',host:'王主任',content:'柱鋼筋綁紮',risks:['墜落／高架作業（2 公尺以上、施工架、鋼構）','吊掛／起重升降作業'],hazards:['墜落、滾落','感電'],extra:'',hostSig:sig,people:Array.from({length:25},(_,i)=>({id:'q'+i,name:'人員'+(i+1),co:'鋼筋班',sig})),created:1,updated:1});
 await DB.put('photos',{id:'ph3',recId:'sa1',itemIdx:0,data:mk('#456','勤前合照'),created:3});
 // 日誌
 const lid=await lgNew();const l=await DB.get('logs',lid);Object.assign(l,{wxAm:'晴',wxPm:'雨',approved:'600',start:'2026-10-01',planPct:'12',actualPct:'11',tech:'yes',pre:'yes',ppe:'yes',newLabor:'none',other:'無',sampling:'澆置 3F 頂版：8 車\\n取樣試體 A0~A6',important:'監造指示：鋼筋間距複查\\n通報：無',signer:'王主任',sig});
 l.items=[{...lgRow(),name:'3F 柱鋼筋綁紮',unit:'噸',contract:'120',today:'5',prev:'30',note:''}];l.labor=[{...lgRow(),name:'鋼筋工',today:'8',prev:'40'}];l.machines=[{...lgRow(),name:'吊車',today:'1',prev:'3'}];await DB.put('logs',l);window.__lid=lid;
});
await p.reload();await p.waitForTimeout(600);
const lid=await p.evaluate(async()=>(await DB.all('logs'))[0].id);
const targets=[['checklist','#/checklist/r1/preview',0],['workorder','#/workorder/w1/preview',0],['punch_report','#/punch/report',0],['punch_summary','#/punch/summary',1],['pour_print','#/pour/j1/print',1],['pour_summary','#/pour/summary',1],['material','#/material/m1/print',0],['album','#/shot/album',0],['safety','#/safety/sa1/print',0],['cure','#/cure/ledger',1],['log','#/log/'+lid+'/print',0],['mat_summary','#/material/summary',0],['wo_summary','#/workorder/summary',1]];
for(const [n,h,land] of targets){
  await p.goto('http://localhost:8793/index.html'+h);
  try{await p.waitForSelector('.paper',{timeout:6000});}catch{console.log('無 .paper',n);continue}
  await p.waitForTimeout(500);
  const bad=await p.evaluate(([w])=>{const out=[];document.querySelectorAll('.paper').forEach((pp,pi)=>{pp.style.width=w+'px';pp.style.overflow='visible';pp.style.padding='0';const pr=pp.getBoundingClientRect();pp.querySelectorAll('*').forEach(el=>{const r=el.getBoundingClientRect();if(!r.width||!r.height)return;if(r.right>pr.right+1.5||r.left<pr.left-1.5)out.push('paper'+pi+' <'+el.tagName.toLowerCase()+'.'+(el.className||'')+'> 超出 '+Math.round(r.right-pr.right)+'px')});});return [...new Set(out)].slice(0,5)},[land?1047:688]);
  console.log(bad.length?'超出  '+n+': '+bad.join(' | '):'OK    '+n);}
console.log('JS錯誤',errs);await b.close();})();
