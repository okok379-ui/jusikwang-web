/* 재구성 분봉 — 일봉 하나(O/H/L/C/V)에서 그날의 장중 경로를 만든다.
   성질: 만든 경로의 시작은 O, 끝은 C, 최고점은 정확히 H, 최저점은 정확히 L.
         그래서 '이 가격에 닿았나'로 결정되는 체결은 실제 일봉과 똑같이 난다.
   한계: 장중 '순서'와 모양은 지어낸 것이다. 분봉 타이밍을 보는 단타 연습에는 못 쓴다.
   같은 seed 면 같은 결과가 나온다(종목+날짜로 seed 를 주면 다시 열어도 같은 차트). */
(function(){
'use strict';

function rng(seed){                       /* mulberry32 — 작고 재현 가능한 난수 */
  var a=(seed>>>0)||1;
  return function(){
    a|=0; a=a+0x6D2B79F5|0;
    var t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function gauss(r){                        /* Box-Muller */
  var u=0,v=0;
  while(u===0)u=r();
  while(v===0)v=r();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}
function hashSeed(s){
  var h=2166136261>>>0;
  s=''+s;
  for(var i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function tick(p){
  p=Math.abs(p);
  var T=[[2000,1],[5000,5],[20000,10],[50000,50],[200000,100],[500000,500]];
  for(var i=0;i<T.length;i++) if(p<T[i][0]) return T[i][1];
  return 1000;
}
/* max(line+s*dev)==target (up) 또는 min(...)==target 이 되는 s 를 이분탐색 */
function fitScale(line,dev,target,up){
  function f(s){
    var m=up?-Infinity:Infinity;
    for(var i=0;i<line.length;i++){ var v=line[i]+s*dev[i]; if(up?v>m:v<m) m=v; }
    return m;
  }
  var lo=0,hi=1;
  for(var k=0;k<60;k++){ if(up?(f(hi)<target):(f(hi)>target)){ hi*=2; if(hi>1e9)break; } else break; }
  for(var j=0;j<80;j++){ var mid=(lo+hi)/2, v=f(mid); if(up?(v<target):(v>target)) lo=mid; else hi=mid; }
  return (lo+hi)/2;
}

/* 하루치 분봉 만들기.
   day: {open,high,low,close,vol}  ·  opt: {bars:380, seed:'005930-20261110', sub:4} */
function intraday(day,opt){
  opt=opt||{};
  var o=+day.open,h=+day.high,l=+day.low,c=+day.close,v=+(day.vol||0);
  var nb=opt.bars||380, sub=opt.sub||4, n=nb*sub;
  var r=rng(typeof opt.seed==='number'?opt.seed:hashSeed(opt.seed||'0'));
  if(!(h>=Math.max(o,c))) h=Math.max(o,c);
  if(!(l<=Math.min(o,c))) l=Math.min(o,c);

  var line=[],i;
  for(i=0;i<=n;i++) line.push(o+(c-o)*i/n);
  /* 브라운 브리지 */
  var w=[0];
  for(i=0;i<n;i++) w.push(w[i]+gauss(r));
  var b=[];
  for(i=0;i<=n;i++) b.push(w[i]-w[n]*i/n);
  var ss=0; for(i=0;i<=n;i++) ss+=b[i]*b[i];
  var sd=Math.sqrt(ss/(n+1))||1e-9, rangeV=Math.max(1,h-l);
  for(i=0;i<=n;i++) b[i]=b[i]/sd*rangeV*0.30;

  var up=[],dn=[],anyUp=false,anyDn=false;
  for(i=0;i<=n;i++){
    up.push(b[i]>0?b[i]:0); dn.push(b[i]<0?b[i]:0);
    if(b[i]>0)anyUp=true; if(b[i]<0)anyDn=true;
  }
  if(!anyUp) for(i=0;i<=n;i++) up[i]=Math.abs(b[i])*1e-6+1e-9;
  if(!anyDn) for(i=0;i<=n;i++) dn[i]=-(Math.abs(b[i])*1e-6+1e-9);

  var su=fitScale(line,up,h,true), sl=fitScale(line,dn,l,false);
  var path=[];
  for(i=0;i<=n;i++) path.push(line[i]+su*up[i]+sl*dn[i]);

  /* 끝점(시가·종가)은 그대로 두고, 고가·저가를 정확히 맞춘다.
     h 가 시가·종가보다 높으면 그 고점은 반드시 중간 어딘가이므로 중간에서만 찍는다. */
  function enforce(){
    path[0]=o; path[n]=c;
    var hi=1,lo=1,k;
    for(k=1;k<n;k++){ if(path[k]>path[hi])hi=k; if(path[k]<path[lo])lo=k; }
    if(h>Math.max(o,c)) path[hi]=h;         /* 고점이 중간에 있는 경우만 */
    if(l<Math.min(o,c)) path[lo]=l;
  }
  enforce();
  var t=tick(c);
  for(i=0;i<=n;i++){ var p=Math.round(path[i]/t)*t; path[i]=Math.min(h,Math.max(l,p)); }
  enforce();

  /* 거래량 — 장 초반·마감에 몰리는 U자 */
  var wt=[],sum=0;
  for(i=0;i<nb;i++){
    var x=nb>1?i/(nb-1):0;
    var g=(1.6*Math.exp(-6*x)+1.2*Math.exp(-6*(1-x))+0.5)*(0.6+r()*0.9);
    wt.push(g); sum+=g;
  }
  var out=[],cum=0,prev=0;
  for(i=0;i<nb;i++){
    var s0=i*sub, s1=Math.min(n,(i+1)*sub);
    var hh=-Infinity,ll=Infinity;
    for(var k=s0;k<=s1;k++){ if(path[k]>hh)hh=path[k]; if(path[k]<ll)ll=path[k]; }
    cum+=wt[i];
    var upto=Math.round(v*cum/sum);        /* 누적 반올림 — 합이 정확히 v 가 된다 */
    out.push({open:path[s0],high:hh,low:ll,close:path[s1],vol:upto-prev});
    prev=upto;
  }
  return out;
}

/* 분 인덱스 → HHMM (09:00 시작, 12:30 휴장 없음, 15:30 마감) */
function minLabel(i,startHH,startMM){
  var m=(startHH==null?9:startHH)*60+(startMM==null?0:startMM)+i;
  return ('0'+Math.floor(m/60)).slice(-2)+('0'+(m%60)).slice(-2);
}

window.SynBars={intraday:intraday, minLabel:minLabel, _rng:rng, _hash:hashSeed, _tick:tick};
})();
