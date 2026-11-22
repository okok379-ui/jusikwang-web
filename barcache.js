/* barcache.js — 키움에서 받아온 일봉·분봉을 브라우저에 저장해 두 번째부터 빠르게.
   · 과거 데이터는 변하지 않으므로 날짜 단위로 영구 보관
   · 용량이 차면 오래 안 쓴 것부터 버린다(LRU)
   · localStorage 가 막혀 있어도(시크릿 모드 등) 메모리 캐시로는 동작 */
(function (g) {
  'use strict';
  var LS = 'jusikwang_barcache_v1';
  var MAX = 3500000;                 // 약 3.5MB (localStorage 한도 5MB 안쪽)
  var mem = null, dirty = false, timer = null, usable = true;

  function store() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(LS) || '{}'); }
    catch (e) { mem = {}; }
    if (!mem || typeof mem !== 'object') mem = {};
    return mem;
  }
  function evictTo(c, limit) {
    var s = JSON.stringify(c);
    if (s.length <= limit) return s;
    var keys = Object.keys(c).sort(function (a, b) { return (c[a].u || 0) - (c[b].u || 0); });
    var i = 0;
    while (s.length > limit && i < keys.length) { delete c[keys[i++]]; s = JSON.stringify(c); }
    return s;
  }
  function flush() {
    timer = null; if (!dirty || !usable) return; dirty = false;
    var c = store(), s;
    try { s = evictTo(c, MAX); } catch (e) { return; }
    try { localStorage.setItem(LS, s); }
    catch (e) {                                   // 용량 초과 — 절반 버리고 한 번 더
      try { localStorage.setItem(LS, evictTo(c, Math.floor(MAX / 2))); }
      catch (e2) { try { localStorage.removeItem(LS); } catch (e3) {} usable = false; }
    }
  }
  function sched() { dirty = true; if (!timer) timer = setTimeout(flush, 1200); }

  function get(key) {
    var c = store(), it = c[key];
    if (!it) return null;
    it.u = Date.now(); sched();
    return it.v;
  }
  function put(key, val) {
    var c = store();
    c[key] = { u: Date.now(), v: val };
    sched();
  }
  function has(key) { return !!store()[key]; }
  function clear() { mem = {}; dirty = false; try { localStorage.removeItem(LS); } catch (e) {} usable = true; }
  function stats() {
    var c = store(), n = 0, b = 0;
    for (var k in c) n++;
    try { b = JSON.stringify(c).length; } catch (e) {}
    return { count: n, bytes: b, kb: Math.round(b / 1024) };
  }
  /* 봉 배열 압축: {time,open,high,low,close,vol} ↔ [t,o,h,l,c,v] */
  function packBars(bars) {
    return (bars || []).map(function (b) { return [b.time, b.open, b.high, b.low, b.close, b.vol]; });
  }
  function unpackBars(rows) {
    return (rows || []).map(function (r) {
      return { time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], vol: r[5] };
    });
  }
  g.BarCache = { get: get, put: put, has: has, clear: clear, stats: stats,
                 packBars: packBars, unpackBars: unpackBars, flush: flush };
})(typeof window !== 'undefined' ? window : globalThis);
