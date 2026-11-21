require('./uidlg');
// volume_calc：混凝土方數各構件、開口、扣版厚、樓梯、壞資料、計算書、窄螢幕與電腦版；見 tests/README.md
const {chromium}=require('playwright');const O=require('path').join(__dirname,'out')+'/';require('fs').mkdirSync(O,{recursive:true});
(async()=>{const b=await chromium.launch();const e=[];
for(const [w,dpr] of [[390,2],[320,1],[1440,1]]){const p=await b.newPage({viewport:{width:w,height:844},deviceScaleFactor:dpr});await p.addInitScript(()=>{try{localStorage.setItem('cfStepAll','1')}catch{}});p.on('pageerror',x=>e.push(x.message));p.on('dialog',d=>d.accept());
const U='http://localhost:8793/index.html';
await p.goto(U);await p.evaluate(()=>{localStorage.setItem('calcRows',JSON.stringify([{name:'舊柱',type:'rect',a:'0.6',b:'0.6',c:'3',n:'4'},{name:'圓',type:'cyl',a:'0.8',c:'3.2',n:2},
{name:'外牆',type:'wall',a:'10',b:'3',c:'0.2',n:'1',op:[{w:'1.2',h:'2.1',n:'2'},{w:'0.9',h:'1.2',n:''}]},
{name:'版',type:'slab',a:'8',b:'6',c:'0.15',n:'1',op:[{w:'2',h:'1',n:'1'}]},
{name:'G1',type:'beam',b:'0.4',c:'0.7',a:'7.4',d:'0.15',n:'3'},{name:'F1',type:'ftg',a:'2',b:'2',c:'0.6',n:'4'},{name:'FB',type:'gb',b:'0.5',c:'1',a:'6',n:'2'},
{name:'梯',type:'stair',b:'1.2',d:'10',c:'0.17',a:'0.27',e:'0.15',n:'1'},{name:'<img src=x onerror=alert(1)>',type:'zzz',a:'-1',b:'1',c:'1'},{name:'集水坑',type:'oth',a:'1.5',b:'1.5',c:'1.2',n:'2'},{name:'設備基座',type:'oth',a:'1',b:'1',c:'1',v:'0.85',n:'3'},{name:'只填體積',type:'oth',v:'2.4'}]));localStorage.setItem('calcCfg',JSON.stringify({loss:'5',cap:'6',loc:'3F',who:'王'}));});
await p.goto(U+'#/calc/vol');await p.waitForSelector('#vOut .big');await p.waitForTimeout(300);await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
if(w===390){console.log([...await p.$$eval('[data-vr]',x=>x.map(y=>y.textContent))].join(' | '));
console.log(await p.$$eval('[data-vx]',x=>x.map(y=>y.textContent).join('\n')));
console.log((await p.innerText('#vOut')).replace(/\s+/g,' '));
console.log('bar',await p.evaluate(()=>{const b=document.getElementById('calcBar');return b.hidden+' '+b.innerText}));
// interactions
await p.selectOption('#vAddType','wall');await p.click('#vAdd');await p.fill('.vrow[data-i="12"] [data-k="a"]','5');await p.fill('.vrow[data-i="12"] [data-k="b"]','3');await p.fill('.vrow[data-i="12"] [data-k="c"]','0.15');
await p.click('.vrow[data-i="12"] [data-opadd]');await p.fill('.vrow[data-i="12"] [data-o="w"]','1');await p.fill('.vrow[data-i="12"] [data-o="h"]','2');
console.log('新牆',await p.textContent('[data-vr="12"]'),await p.textContent('[data-vx="12"]'));
await p.selectOption('.vrow[data-i="12"] [data-k="type"]','slab');console.log('改版',await p.textContent('[data-vr="12"]'));
await p.screenshot({path:O+'vol_phone.png',fullPage:true});
await p.goto(U+'#/calc/vol/sheet');await p.waitForTimeout(400);await p.screenshot({path:O+'vol_sheet.png',fullPage:true});console.log('sheet img',await p.$$eval('.paper img',x=>x.length));
}
console.log(w,'hscroll',await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
if(w===1440){await p.screenshot({path:O+'vol_desk.png'});console.log('bar hidden',await p.evaluate(()=>document.getElementById('calcBar').hidden));}
if(w===320) await p.screenshot({path:O+'vol_320.png',fullPage:true});
}
console.log('errs',e);await b.close();})();
