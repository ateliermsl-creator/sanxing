// tile_draw：磁磚計算的展開立面圖與等角透視圖（tiledraw.js）：幾何接續（陽角／陰角／直線）、開口定位、地坪、未畫入圖的面、清理器保留新欄位、名稱轉義、窄螢幕。見 tests/README.md
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();let bad=0;
const chk=(name,ok,info='')=>{if(!ok)bad++;console.log(ok?'OK':'NG',name,info)};
const U='http://localhost:8793/index.html';
const ctx=await b.newContext({viewport:{width:320,height:640}});const p=await ctx.newPage();const e=[];p.on('pageerror',x=>e.push(x.message));
await p.goto(U);await p.waitForTimeout(500);
const r=await p.evaluate(()=>{
 const W=(name,a,b,g,op=[])=>({name,s:'0',a,b,v:'',n:'1',g,op});
 const room=tileNorm([W('A','1.8','2.4','',[{w:'0.8',h:'2',n:'1',x:'0.5',y:''}]),W('B','2.7','2.4','in',[{w:'0.6',h:'0.9',n:'1',x:'',y:'1.2'}]),W('C','1.8','2.4','in'),W('D','2.7','2.4','in'),{...W('F','1.8','2.7','f'),s:'1'}],{specs:[{name:'壁',L:'60',W:'30',j:'2'},{name:'地',L:'30',W:'30',j:'3'}]});
 const g=tileGeo(room);
 const bld=tileGeo(tileNorm([W('N','12','9',''),W('E','8','9',''),W('S','12','9',''),W('W','8','9','')],{}));
 const line=tileGeo(tileNorm([W('1','3','3',''),W('2','4','3','s'),{...W('3','','',''),v:'5'},W('4','2','3','x')],{}));
 const ops=tileOps({op:[{w:'1.5',h:'1.2',n:'6',x:'',y:''}]},12,9), ops2=tileOps({op:[{w:'1',h:'1',n:'3',x:'1',y:'2'}]},10,3);
 const bad=tileNorm([W('<b>x</b>','3','3','')],{});
 return {closed:g.closed,nW:g.walls.length,nF:g.floors.length,d:g.walls.map(w=>w.d.join(',')),door:g.walls[0].ops[0],win:g.walls[1].ops[0],
  bclosed:bld.closed,bd:bld.walls.map(w=>w.d.join(',')),lineEnd:line.end.join(','),skip:line.skip.map(s=>s.i+':'+s.why),
  ops:ops.map(o=>+o.x.toFixed(4)+'/'+o.y),ops2:ops2.map(o=>o.x+'/'+o.y),
  svg:tileDrawHtml(room),xs:tileDrawHtml(bad)};});
chk('室內四面陰角接回 A',r.closed&&r.nW===4&&r.nF===1&&r.d.join(' ')==='1,0 0,-1 -1,0 0,1',r.d.join(' '));
chk('外牆四面陽角接回 A',r.bclosed&&r.bd.join(' ')==='1,0 0,1 -1,0 0,-1',r.bd.join(' '));
chk('門定位（距左 0.5、高達 3/4 牆高貼地）',r.door.x===0.5&&r.door.y===0,JSON.stringify(r.door));
chk('窗定位（自動置中、離地 1.2）',Math.abs(r.win.x-1.05)<1e-9&&r.win.y===1.2,JSON.stringify(r.win));
// 12 m 牆 6 個 1.5 寬：間距 (12−9)/7 = 0.428571；第一個 x = 0.4286，第二個 0.4286+1.5+0.4286 = 2.3571；高 1.2 < 6.75 → 置中 y = 3.9
chk('自動排 6 個窗',r.ops.length===6&&r.ops[0]==='0.4286/3.9'&&r.ops[1]==='2.3571/3.9',r.ops.join(' '));
// 距左 1、3 個寬 1、牆長 10：對稱排到 10−1−1 = 8 → x = 1, 4.5, 8
chk('距左定位多個對稱排',r.ops2.join(' ')==='1/2 4.5/2 8/2',r.ops2.join(' '));
chk('直線接續、直接填面積不畫、不畫入圖',r.lineEnd==='7,0'&&r.skip.join()==='2:直接填面積',r.lineEnd+' '+r.skip.join());
chk('圖面有展開圖、透視圖、圖例',(r.svg.match(/<svg/g)||[]).length===2&&r.svg.includes('壁')&&r.svg.includes('地'));
chk('名稱轉義',!r.xs.includes('<b>')&&r.xs.includes('&lt;b&gt;'));
const c=await p.evaluate(()=>{const x={id:'t1',siteId:'s1',kind:'tile',name:'x',rows:[{name:'a',s:'0',a:'1',b:'1',v:'',n:'1',g:'in',op:[{w:'1',h:'1',n:'1',x:'0.2',y:'0.3'}]}],cfg:{specs:[],rot:'2'},created:1,updated:1};const y=CLEAN.vols(x);return y.rows[0].g==='in'&&y.rows[0].op[0].x==='0.2'&&y.rows[0].op[0].y==='0.3'&&y.cfg.rot==='2'&&CLEAN.vols({...x,rows:[{...x.rows[0],g:'zz'}]}).rows[0].g===''});
chk('清理器保留 g、開口 x／y、rot',c);
await p.evaluate(async()=>{await DB.put('sites',{id:'s1',name:'甲'});localStorage.setItem('siteId','s1');localStorage.setItem('installHint','1');localStorage.setItem('lastBackup',new Date().toISOString());
 localStorage.setItem('calcTileRows',JSON.stringify([{name:'A',s:'0',a:'3',b:'2.4',n:'1',g:'',op:[]},{name:'B',s:'0',a:'2',b:'2.4',n:'1',g:'in',op:[]}]));localStorage.setItem('calcTileCfg','{}')});
await p.goto(U+'#/calc/tile');await p.reload();await p.waitForTimeout(800);
chk('面板有兩張圖',(await p.$$('#tlDraw svg')).length===2);
await p.selectOption('.vrow[data-i="1"] select[data-k="g"]','s');await p.waitForTimeout(200);
chk('改接續方式即時重畫',(await p.evaluate(()=>tileGeo(tileLoad()).end.join(',')))==='5,0');
await p.click('[data-trot]');await p.waitForTimeout(200);chk('轉 90° 存進設定',(await p.evaluate(()=>tileLoad().cfg.rot))==='1');
chk('320 不橫向捲動',(await p.evaluate(()=>document.documentElement.scrollWidth))<=320);
await p.goto(U+'#/calc/tile/sheet');await p.waitForTimeout(500);
chk('計算書有圖',(await p.$$('.paper svg.tlsvg')).length===2&&(await p.innerText('.paper')).includes('四、展開立面圖與透視圖'));
chk('沒有錯誤',!e.length,e.join(';'));
console.log(bad?`有 ${bad} 項沒通過`:'全部通過');await b.close();process.exit(bad?1:0)})();
