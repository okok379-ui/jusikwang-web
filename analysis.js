/* 종목 분석 — 일봉만으로 계산하는 기술적 지표와, 재무가 있을 때의 밸류 지표.
   입력 bars: [{t:'YYYYMMDD',o,h,l,c,v}, ...] 오름차순.
   모든 함수는 순수 계산이며 외부 호출을 하지 않는다. */
(function(){
'use strict';

function last(a){ return a[a.length-1]; }
function clamp(x,lo,hi){ return x<lo?lo:(x>hi?hi:x); }
function r1(x){ return Math.round(x*10)/10; }

/* 단순이동평균 — i 위치의 per일 평균. 모자라면 null */
function sma(cs,per,i){
  if(i===undefined) i=cs.length-1;
  if(i+1<per) return null;
  var s=0; for(var k=i-per+1;k<=i;k++) s+=cs[k];
  return s/per;
}
function smaSeries(cs,per){
  var out=[],s=0;
  for(var i=0;i<cs.length;i++){
    s+=cs[i];
    if(i>=per) s-=cs[i-per];
    out.push(i+1>=per? s/per : null);
  }
  return out;
}
/* 지수이동평균 */
function emaSeries(cs,per){
  var k=2/(per+1), out=[], e=null;
  for(var i=0;i<cs.length;i++){
    e = (e===null)? cs[i] : cs[i]*k + e*(1-k);
    out.push(e);
  }
  return out;
}
/* 기울기 — per일 평균이 days일 동안 몇 % 움직였나 */
function slope(cs,per,days){
  var a=sma(cs,per,cs.length-1-days), b=sma(cs,per);
  if(a===null||b===null||!a) return null;
  return (b/a-1)*100;
}

/* RSI(14) — Wilder */
function rsi(cs,per){
  per=per||14;
  if(cs.length<per+1) return null;
  var g=0,l=0,i;
  for(i=1;i<=per;i++){ var d=cs[i]-cs[i-1]; if(d>0)g+=d; else l-=d; }
  g/=per; l/=per;
  for(i=per+1;i<cs.length;i++){
    var d2=cs[i]-cs[i-1];
    g=(g*(per-1)+(d2>0?d2:0))/per;
    l=(l*(per-1)+(d2<0?-d2:0))/per;
  }
  if(l===0) return 100;
  return 100-100/(1+g/l);
}

/* MACD(12,26,9) — 최근값과 직전값, 교차 시점 */
function macd(cs){
  if(cs.length<35) return null;
  var e12=emaSeries(cs,12), e26=emaSeries(cs,26), line=[],i;
  for(i=0;i<cs.length;i++) line.push(e12[i]-e26[i]);
  var sig=emaSeries(line,9), hist=[];
  for(i=0;i<cs.length;i++) hist.push(line[i]-sig[i]);
  var cross=null, ago=null;
  for(i=cs.length-1;i>0 && cs.length-i<=60;i--){
    if(hist[i]>0 && hist[i-1]<=0){ cross='golden'; ago=cs.length-1-i; break; }
    if(hist[i]<0 && hist[i-1]>=0){ cross='dead';   ago=cs.length-1-i; break; }
  }
  return {line:last(line), signal:last(sig), hist:last(hist), cross:cross, crossAgo:ago};
}

/* 볼린저(20,2) — %B 와 밴드폭 */
function bollinger(cs,per,mult){
  per=per||20; mult=mult||2;
  if(cs.length<per) return null;
  var m=sma(cs,per), s=0, i;
  for(i=cs.length-per;i<cs.length;i++) s+=(cs[i]-m)*(cs[i]-m);
  var sd=Math.sqrt(s/per), up=m+mult*sd, dn=m-mult*sd, c=last(cs);
  return {mid:m, up:up, dn:dn, pctB:(up-dn)?((c-dn)/(up-dn))*100:50, width:m?((up-dn)/m)*100:0};
}

/* 최근 n일 고가·저가와 현재 위치(%) */
function range(bars,n){
  var s=bars.slice(Math.max(0,bars.length-n));
  var hi=-Infinity, lo=Infinity;
  for(var i=0;i<s.length;i++){ if(s[i].h>hi)hi=s[i].h; if(s[i].l<lo)lo=s[i].l; }
  var c=last(bars).c;
  return {hi:hi, lo:lo, days:s.length, pos:(hi-lo)?((c-lo)/(hi-lo))*100:50};
}

/* 스윙 고·저를 모아 지지선·저항선 후보를 만든다.
   좌우 w봉보다 높은(낮은) 점을 스윙으로 보고, 1.5% 안쪽이면 한 덩어리로 묶는다. */
function levels(bars,w,tol,look,span){
  w=w||5; tol=tol||1.5; look=look||250; span=span||0.20;
  var all=bars; bars=bars.slice(Math.max(0,bars.length-look));   /* 최근 1년만 본다 */
  var cNow=all[all.length-1].c;
  var piv=[],i,j,ok;
  for(i=w;i<bars.length-w;i++){
    ok=true; for(j=i-w;j<=i+w;j++) if(bars[j].h>bars[i].h){ok=false;break;}
    if(ok) piv.push({p:bars[i].h,i:i,kind:'h'});
    ok=true; for(j=i-w;j<=i+w;j++) if(bars[j].l<bars[i].l){ok=false;break;}
    if(ok) piv.push({p:bars[i].l,i:i,kind:'l'});
  }
  piv.sort(function(a,b){return a.p-b.p;});
  var groups=[],g=null;
  for(i=0;i<piv.length;i++){
    if(g && Math.abs(piv[i].p/g.sum*g.n-1)*100<=tol){ g.sum+=piv[i].p; g.n++; g.lastI=Math.max(g.lastI,piv[i].i); }
    else { g={sum:piv[i].p,n:1,lastI:piv[i].i}; groups.push(g); }
  }
  var c=last(bars).c, out=groups.map(function(x){
    return {price:Math.round(x.sum/x.n), touches:x.n, lastI:x.lastI};
  }).filter(function(x){                                        /* 현재가에서 너무 먼 값은 뺀다 */
    return x.touches>=2 && Math.abs(x.price/cNow-1)<=span;
  });
  var sup=out.filter(function(x){return x.price<c;}).sort(function(a,b){return b.price-a.price;}),
      res=out.filter(function(x){return x.price>c;}).sort(function(a,b){return a.price-b.price;});
  return {support:sup.slice(0,3), resist:res.slice(0,3)};
}

/* 거래량 — 최근 5일 평균이 20일 평균의 몇 배인가 */
function volume(bars){
  if(bars.length<25) return null;
  function avg(n){ var s=0,k; for(k=bars.length-n;k<bars.length;k++) s+=bars[k].v; return s/n; }
  var a5=avg(5), a20=avg(20);
  return {d5:a5, d20:a20, ratio:a20? a5/a20 : 1, today:last(bars).v,
          todayRatio:a20? last(bars).v/a20 : 1};
}

/* 변동성 — 하루 평균 등락폭(%) 20일 */
function volatility(bars){
  if(bars.length<21) return null;
  var s=0,n=0;
  for(var i=bars.length-20;i<bars.length;i++){
    var p=bars[i-1].c; if(!p) continue;
    s+=Math.abs(bars[i].c/p-1)*100; n++;
  }
  return n? s/n : null;
}

/* ── 기술적 종합 ───────────────────────────────────────── */
function technical(bars){
  if(!bars||bars.length<60) return null;
  var cs=bars.map(function(b){return b.c;}), c=last(cs);
  var ma5=sma(cs,5), ma20=sma(cs,20), ma60=sma(cs,60), ma120=sma(cs,120);
  var s20=slope(cs,20,10), s60=slope(cs,60,20);
  var aligned = (ma5!==null&&ma20!==null&&ma60!==null) && ma5>ma20 && ma20>ma60;
  var dead    = (ma5!==null&&ma20!==null&&ma60!==null) && ma5<ma20 && ma20<ma60;
  var t = {
    close:c, ma5:ma5, ma20:ma20, ma60:ma60, ma120:ma120,
    slope20:s20, slope60:s60, aligned:aligned, deadAligned:dead,
    rsi:rsi(cs,14), macd:macd(cs), boll:bollinger(cs,20,2),
    w52:range(bars,250), m3:range(bars,60),
    levels:levels(bars,5,1.5), vol:volume(bars), atrPct:volatility(bars)
  };
  t.score = techScore(t);
  t.trend = aligned && s20>2 ? '상승추세'
          : dead  && s20<-2 ? '하락추세'
          : (s20!==null && Math.abs(s20)<=2 ? '횡보' : (s20>0?'회복 시도':'조정 중'));
  return t;
}

/* 0~100 — 추세 40, 모멘텀 25, 위치 20, 수급 15 */
function techScore(t){
  function band(x,hi,lo,pts){
    if(x===null||x===undefined) return pts/2;
    return clamp((x-lo)/(hi-lo),0,1)*pts;
  }
  var trend = band(t.slope20,10,-10,22) + band(t.slope60,15,-15,12) + (t.aligned?6:(t.deadAligned?0:3));
  var mom   = band(t.rsi!==null?t.rsi:50,70,30,13)
            + (t.macd? (t.macd.hist>0?8:2) : 5)
            + (t.macd&&t.macd.cross==='golden'&&t.macd.crossAgo<=10?4:0);
  var pos   = band(t.w52?t.w52.pos:50,85,15,12)
            + (t.boll? band(t.boll.pctB,90,10,8) : 4);
  var flow  = (t.vol? clamp((t.vol.ratio-0.6)/1.4,0,1)*10 : 5)
            + (t.vol&&t.vol.todayRatio>1.5?5:2);
  return Math.round(clamp(trend+mom+pos+flow,0,100));
}

/* ── 기본적 분석 ───────────────────────────────────────── */
/* fin: {y:[{yr,sale,op,np,ta,td,tc}...]}  shares: 상장주식수  close: 현재가 */
function fundamental(fin, shares, close){
  if(!fin||!fin.y||!fin.y.length) return null;
  var ys=fin.y.slice().sort(function(a,b){return a.yr-b.yr;});
  var cur=last(ys), prev=ys.length>1?ys[ys.length-2]:null;
  function g(a,b){ return (a&&b&&b>0)? (a/b-1)*100 : null; }
  var cap = shares&&close? shares*close : null;
  var f = {
    years:ys, latest:cur,
    saleGrow: prev? g(cur.sale,prev.sale) : null,
    opGrow:   prev? g(cur.op,prev.op)     : null,
    npGrow:   prev? g(cur.np,prev.np)     : null,
    opMargin: (cur.sale&&cur.sale>0&&cur.op!==null)? cur.op/cur.sale*100 : null,
    roe:      (cur.tc&&cur.tc>0&&cur.np!==null)? cur.np/cur.tc*100 : null,
    debtRatio:(cur.tc&&cur.tc>0&&cur.td!==null)? cur.td/cur.tc*100 : null,
    cap: cap,
    per: (cap&&cur.np&&cur.np>0)? cap/cur.np : null,
    pbr: (cap&&cur.tc&&cur.tc>0)? cap/cur.tc : null,
    eps: (shares&&cur.np!==null)? cur.np/shares : null,
    bps: (shares&&cur.tc!==null)? cur.tc/shares : null
  };
  /* 흑자 연속 / 적자 */
  f.profitYears = ys.filter(function(x){return x.np!==null&&x.np>0;}).length;
  f.lossYear    = cur.np!==null && cur.np<0;
  return f;
}

/* PER·PBR 밴드 — 일봉 하루하루에 '그때 공시돼 있던' 연간 실적을 붙여 배수 시계열을 만든다.
   사업연도 Y 실적은 이듬해 봄에 나오므로, 1~3월 봉은 Y-2, 4~12월 봉은 Y-1 실적을 쓴다. */
function bands(fin, shares, bars){
  if(!fin||!fin.y||!fin.y.length||!shares||!bars||!bars.length) return null;
  var by={}; fin.y.forEach(function(y){ by[y.yr]=y; });
  var pers=[], pbrs=[], series=[];
  for(var i=0;i<bars.length;i++){
    var b=bars[i], yr=parseInt(b.t.slice(0,4),10), mo=parseInt(b.t.slice(4,6),10);
    var use=by[mo<=3? yr-2 : yr-1];
    if(!use) continue;
    var cap=shares*b.c;
    var per=(use.np&&use.np>0)? cap/use.np : null;
    var pbr=(use.tc&&use.tc>0)? cap/use.tc : null;
    if(per!==null&&per>0&&per<300) pers.push(per);
    if(pbr!==null&&pbr>0&&pbr<60)  pbrs.push(pbr);
    series.push({t:b.t, per:per, pbr:pbr});
  }
  function stat(a){
    if(a.length<30) return null;                 /* 표본이 너무 적으면 밴드를 만들지 않는다 */
    var s=a.slice().sort(function(x,y){return x-y;});
    function q(p){ return s[Math.min(s.length-1, Math.floor(s.length*p))]; }
    return {lo:q(0.10), q25:q(0.25), mid:q(0.50), q75:q(0.75), hi:q(0.90), n:s.length};
  }
  var r={series:series, per:stat(pers), pbr:stat(pbrs)};
  var lastS = series.length? series[series.length-1] : null;
  r.now = lastS? {per:lastS.per, pbr:lastS.pbr} : null;
  /* 지금 배수가 자기 밴드의 몇 % 자리인가 */
  function pctOf(v,a){
    if(v===null||!a.length) return null;
    var n=0; for(var i=0;i<a.length;i++) if(a[i]<=v) n++;
    return n/a.length*100;
  }
  r.perPct = r.now? pctOf(r.now.per,pers) : null;
  r.pbrPct = r.now? pctOf(r.now.pbr,pbrs) : null;
  return r;
}

/* 참고 적정가 — 그 종목 자신의 과거 배수 밴드에 최근 실적을 곱한 값.
   증권사 목표가가 아니다. */
function fairValue(fin, shares, bd){
  if(!fin||!fin.latest||!shares||!bd) return null;
  var y=fin.latest, out={};
  /* 밴드의 가운데 절반(25~75%)만 쓴다. 양 끝은 한두 해의 이상치인 경우가 많다. */
  if(bd.per && y.np && y.np>0){
    var eps=y.np/shares;
    out.per={lo:Math.round(bd.per.q25*eps), mid:Math.round(bd.per.mid*eps),
             hi:Math.round(bd.per.q75*eps), n:bd.per.n};
  }
  if(bd.pbr && y.tc && y.tc>0){
    var bps=y.tc/shares;
    out.pbr={lo:Math.round(bd.pbr.q25*bps), mid:Math.round(bd.pbr.mid*bps),
             hi:Math.round(bd.pbr.q75*bps), n:bd.pbr.n};
  }
  var parts=[]; if(out.per) parts.push(out.per); if(out.pbr) parts.push(out.pbr);
  if(!parts.length) return null;
  function avg(k){ var s=0; parts.forEach(function(x){s+=x[k];}); return Math.round(s/parts.length); }
  out.mid=avg('mid'); out.lo=avg('lo'); out.hi=avg('hi');   /* 두 잣대를 평균낸다 */
  if(out.lo>out.hi){ var t=out.lo; out.lo=out.hi; out.hi=t; }
  out.basis = (out.per&&out.pbr)?'PER·PBR':(out.per?'PER':'PBR');
  return out;
}

window.Analysis = {
  technical:technical, fundamental:fundamental, bands:bands, fairValue:fairValue,
  sma:sma, smaSeries:smaSeries, emaSeries:emaSeries, rsi:rsi, macd:macd,
  bollinger:bollinger, range:range, levels:levels, volume:volume, volatility:volatility,
  slope:slope, r1:r1
};
})();
