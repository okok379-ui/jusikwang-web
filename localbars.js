/* 내장 일봉 — 키움 앱키 없이 쓰는 데이터 경로.
   bars/index.json + bars/<코드>.json 을 읽고, 장중 분봉은 SynBars 로 재구성한다.
   시세 출처: 금융위원회_주식시세정보 (한국거래소 · 공공데이터포털) */
(function(){
'use strict';
var IDX=null, IDXTRY=false, CACHE={};
var BASE='bars/';

async function ready(){
  if(IDX)return true;
  if(IDXTRY)return !!IDX;
  IDXTRY=true;
  try{
    var r=await fetch(BASE+'index.json',{cache:'default'});
    if(!r.ok)return false;
    IDX=await r.json();
    IDX._by={};
    (IDX.list||[]).forEach(function(x){ IDX._by[x.c]=x; });
    return true;
  }catch(e){ return false; }
}
function info(){ return IDX?{built:IDX.built,days:IDX.days,count:IDX.count,src:IDX.src,
                             t0:IDX.t0||'',t1:IDX.t1||''}:null; }
/* 'YYYYMMDD' → 'YYYY-MM-DD' (없으면 빈 문자열) */
function dash(t){ t=''+(t||''); return t.length===8?t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6):''; }
function list(){ return IDX?(IDX.list||[]):[]; }

/* 종목명/코드 → {code,name} */
async function resolve(q){
  if(!await ready())return null;
  q=(''+(q||'')).trim(); if(!q)return null;
  if(/^[0-9A-Za-z]{6}$/.test(q)){
    var x=IDX._by[q.toUpperCase()];
    return x?{code:x.c,name:x.n}:null;
  }
  var ql=q.toLowerCase(), ex=null, pre=[], has=[];
  (IDX.list||[]).forEach(function(x){
    var n=(x.n||'').toLowerCase();
    if(n===ql){ if(!ex)ex=x; }
    else if(n.indexOf(ql)===0) pre.push(x);
    else if(n.indexOf(ql)>=0) has.push(x);
  });
  var hit=ex||pre[0]||has[0];
  return hit?{code:hit.c,name:hit.n}:null;
}
function search(q,n){
  if(!IDX)return [];
  q=(''+(q||'')).trim().toLowerCase(); if(!q)return [];
  var pre=[],has=[];
  (IDX.list||[]).forEach(function(x){
    var nm=(x.n||'').toLowerCase();
    if(nm.indexOf(q)===0||x.c.indexOf(q)===0)pre.push(x);
    else if(nm.indexOf(q)>=0)has.push(x);
  });
  return pre.concat(has).slice(0,n||12).map(function(x){return {code:x.c,name:x.n};});
}

/* 일봉 — [{t,o,h,l,c,v}] 과거→현재 */
async function daily(code){
  if(CACHE[code])return CACHE[code];
  if(!await ready())return null;
  try{
    var r=await fetch(BASE+code+'.json',{cache:'default'});
    if(!r.ok)return null;
    var p=await r.json();
    var prev=p.b, out=[], ds=p.dates||[];
    for(var i=0;i<p.d.length;i++){
      var q=p.d[i];
      out.push({t: ''+(ds[i]||''), o:prev+q[0], h:prev+q[1], l:prev+q[2], c:prev+q[3], v:(q[4]||0)*1000});
      prev=prev+q[3];
    }
    CACHE[code]=out;
    return out;
  }catch(e){ return null; }
}

function toArr(a){ return a.map(function(x){return [x.o,x.h,x.l,x.c,x.v];}); }

/* 게임 케이스 — 지정한 날짜의 장중을 재구성한 분봉으로 */
async function caseFor(code,name,date){
  var all=await daily(code);
  if(!all||!all.length)return null;
  var i=-1;
  for(var k=0;k<all.length;k++) if(all[k].t===date){ i=k; break; }
  if(i<0)return null;                       /* 휴장일이거나 데이터 밖 */
  if(i<10)return null;                      /* 앞 일봉이 모자람 */
  var past=all.slice(Math.max(0,i-15),i), day=all[i];
  if(past.length<10)return null;
  var mb=window.SynBars.intraday(
    {open:day.o,high:day.h,low:day.l,close:day.c,vol:day.v},
    {bars:380,seed:code+'-'+date});
  var min1=mb.map(function(x){return [x.open,x.high,x.low,x.close,x.vol];});
  var prevClose=past[past.length-1].c, prev2=past.length>=2?past[past.length-2].c:prevClose;
  var meta=IDX&&IDX._by[code];
  return {name:name||(meta&&meta.n)||code, code:code, date:date,
    limitDate:past[past.length-1].t, prevClose:prevClose, open:day.o,
    limitPct:prev2?Math.round((prevClose/prev2-1)*1000)/10:0,
    mktcapEok: meta&&meta.cap?Math.round(meta.cap/1e8):0,
    reason:'내장 일봉 · 장중은 재구성', direct:true, synth:true,
    min1Start:'0900', min1:min1,
    daily:toArr(past), dailyDates:past.map(function(x){return x.t;})};
}
/* date 다음 거래일의 케이스 */
async function nextCase(code,name,date){
  var all=await daily(code);
  if(!all)return null;
  for(var k=0;k<all.length;k++) if(all[k].t>date) return await caseFor(code,name,all[k].t);
  return null;
}

window.LocalBars={ready:ready,info:info,list:list,resolve:resolve,search:search,
                  daily:daily,caseFor:caseFor,nextCase:nextCase,dash:dash};
})();
