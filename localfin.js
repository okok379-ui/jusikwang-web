/* 내장 재무 — 공공데이터로 구워 둔 연간 실적. 없으면 조용히 비활성.
   fin/all.json 하나로 받는 것이 기본이고, 없으면 fin/index.json + fin/<코드>.json 으로 떨어진다. */
(function(){
'use strict';
var IDX=null, ALL=null, READY=null, CACHE={};

function prep(d){
  if(!d) return null;
  (d.y||[]).sort(function(a,b){return a.yr-b.yr;});
  d.latest = d.y && d.y.length ? d.y[d.y.length-1] : null;
  return d;
}

async function ready(){
  if(READY) return READY;
  READY=(async function(){
    try{                                        /* ① 한 덩어리 */
      var r=await fetch('fin/all.json',{cache:'force-cache'});
      if(r.ok){
        var d=await r.json();
        if(d && d.f){
          ALL=d.f;
          IDX={built:d.built,count:d.count,years:d.years,src:d.src,_has:{}};
          for(var k in ALL) IDX._has[k]=1;
          return true;
        }
      }
    }catch(e){}
    try{                                        /* ② 종목별 파일 */
      var r2=await fetch('fin/index.json',{cache:'force-cache'});
      if(!r2.ok) return false;
      IDX=await r2.json();
      IDX._has={};
      (IDX.list||[]).forEach(function(x){ IDX._has[x.c]=1; });
      return true;
    }catch(e){ return false; }
  })();
  return READY;
}
function info(){ return IDX?{built:IDX.built,count:IDX.count,years:IDX.years,src:IDX.src}:null; }
function has(code){ return !!(IDX&&IDX._has[code]); }

async function get(code){
  if(!(await ready())) return null;
  if(!has(code)) return null;
  if(ALL){
    if(CACHE[code]===undefined) CACHE[code]=prep(ALL[code]||null);
    return CACHE[code];
  }
  if(CACHE[code]!==undefined) return CACHE[code];
  try{
    var r=await fetch('fin/'+code+'.json',{cache:'force-cache'});
    if(!r.ok){ CACHE[code]=null; return null; }
    CACHE[code]=prep(await r.json());
    return CACHE[code];
  }catch(e){ CACHE[code]=null; return null; }
}
window.LocalFin={ready:ready, info:info, has:has, get:get};
})();
