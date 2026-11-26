/* 내장 재무 — 공공데이터로 구워 둔 연간 실적. 없으면 조용히 비활성.
   fin/index.json + fin/<종목코드>.json */
(function(){
'use strict';
var IDX=null, READY=null, CACHE={};

async function ready(){
  if(READY) return READY;
  READY=(async function(){
    try{
      var r=await fetch('fin/index.json',{cache:'force-cache'});
      if(!r.ok) return false;
      IDX=await r.json();
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
  if(CACHE[code]!==undefined) return CACHE[code];
  try{
    var r=await fetch('fin/'+code+'.json',{cache:'force-cache'});
    if(!r.ok){ CACHE[code]=null; return null; }
    var d=await r.json();
    (d.y||[]).sort(function(a,b){return a.yr-b.yr;});
    d.latest=d.y&&d.y.length? d.y[d.y.length-1] : null;
    CACHE[code]=d; return d;
  }catch(e){ CACHE[code]=null; return null; }
}
window.LocalFin={ready:ready, info:info, has:has, get:get};
})();
