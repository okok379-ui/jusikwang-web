/* split10fit.js — 10분할매수 적합성 채점 엔진 (split10_fit.py 의 브라우저 이식본)
   PC 스크리너(split10_screener.py)와 같은 숫자가 나와야 한다. 로직을 바꾸면 양쪽 같이 고칠 것.
   bars = [{time:'YYYYMMDD', open, high, low, close, vol}, ...]  과거→현재 */
(function (g) {
  'use strict';
  var DEFAULT_DROPS = [3, 6, 9, 12, 15, 18, 21, 24];

  function cfgOf(o) {
    o = o || {};
    return {
      once: Math.trunc(o.once || 1000000),
      drops: (o.drops || DEFAULT_DROPS).slice(0, 8).map(Number),
      tp: Number(o.tp != null ? o.tp : 3.0),
      max_days: Math.trunc(o.max_days || 120),
      daily_max: Math.trunc(o.daily_max != null ? o.daily_max : 3)
    };
  }

  /* bars[i0] 종가에 1차 진입했다고 보고 앞으로 추적 */
  function trial(bars, i0, cfg) {
    var entry = bars[i0].close;
    if (entry <= 0) return null;
    var q1 = Math.floor(cfg.once / entry);
    if (q1 < 1) return null;

    var base = entry, qty = q1, cost = q1 * entry;
    var done = {1: true}, nDone = 1;
    var worst = 0, peakCost = cost;
    var end = Math.min(i0 + 1 + cfg.max_days, bars.length);

    for (var j = i0 + 1; j < end; j++) {
      var b = bars[j], lo = b.low, hi = b.high, op = b.open;
      if (lo <= 0 || hi <= 0) continue;
      /* 분할매수(얕은 차수부터) */
      var today = 0;
      for (var k = 0; k < cfg.drops.length; k++) {
        var n = k + 2;
        if (done[n]) continue;
        var trig = base * (1 - cfg.drops[k] / 100);
        if (lo > trig) break;                       // 오름차순이라 더 깊은 차수는 볼 필요 없음
        if (cfg.daily_max && today >= cfg.daily_max) break;
        var fill = (op > 0) ? Math.min(trig, op) : trig;
        var q = Math.floor(cfg.once / fill);
        if (q < 1) continue;
        qty += q; cost += q * fill; done[n] = true; nDone++; today++;
      }
      var avg = cost / qty;
      if (cost > peakCost) peakCost = cost;
      var dd = (lo - avg) / avg * 100;
      if (dd < worst) worst = dd;
      /* 익절 */
      var target = avg * (1 + cfg.tp / 100);
      if (hi >= target) {
        var f2 = (op > 0) ? Math.max(target, op) : target;
        return {ok: true, days: j - i0, rounds: nDone,
                ret: (f2 - avg) / avg * 100, worst: worst, cost: peakCost, entry: entry};
      }
    }
    var last = (end > i0 + 1) ? bars[end - 1].close : entry;
    var avg2 = cost / qty;
    return {ok: false, days: end - 1 - i0, rounds: nDone,
            ret: (last - avg2) / avg2 * 100, worst: worst, cost: peakCost, entry: entry};
  }

  function pct(part, whole) { return whole ? (part / whole * 100) : 0; }
  function median(xs) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; }), n = s.length;
    return (n % 2) ? s[(n - n % 2) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  }
  function quantile(xs, q) {
    if (!xs.length) return 0;
    var s = xs.slice().sort(function (a, b) { return a - b; });
    var i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)));
    return s[i];
  }
  function band(v, good, bad, pts) {
    if (good === bad) return v >= good ? pts : 0;
    var r = (v - bad) / (good - bad);
    return Math.max(0, Math.min(1, r)) * pts;
  }

  /* 이동평균 — closes[i] 기준 per일 평균. 데이터가 모자라면 null */
  function maAt(cl, per, i) {
    if (i < per - 1 || i >= cl.length) return null;
    var sum = 0;
    for (var k = i - per + 1; k <= i; k++) sum += cl[k];
    return sum / per;
  }

  /* 지금 이평선이 오르고 있는가 — 20봉/60봉 기울기와 정배열.
     장기추세(250봉 두 점)는 '지난 1년에 올랐나'일 뿐이라, 반년 내리다 두 달 전
     돌아선 종목을 깎아버린다. 10분할매수는 '지금 들어가서 되돌아오는가'가 전부다. */
  function maTrend(bars) {
    var cl = [], i;
    for (i = 0; i < bars.length; i++) cl.push(bars[i].close);
    var n = cl.length;
    var o = {ma20_slope: 0, ma60_slope: 0, aligned: false, ma20: null, ma60: null};
    var a20 = maAt(cl, 20, n - 1), b20 = maAt(cl, 20, n - 21);
    var a60 = maAt(cl, 60, n - 1), b60 = maAt(cl, 60, n - 61);
    if (a20 && b20) o.ma20_slope = (a20 / b20 - 1) * 100;
    if (a60 && b60) o.ma60_slope = (a60 / b60 - 1) * 100;
    o.ma20 = a20; o.ma60 = a60;
    if (a20 && a60) o.aligned = cl[n - 1] > a20 && a20 > a60;
    return o;
  }

  /* 추세 배점(15점) — '지난 1년에 올랐나'가 아니라 '지금 오르고 있나'로 본다.
     20봉 이평 기울기 7 + 60봉 이평 기울기 5 + 정배열 3.
     장기추세(250봉)는 배점에서 빼고, 과열·급락 상한에서만 쓴다. */
  function maPts(m) {
    return band(m.ma20_slope, 8, -8, 7) + band(m.ma60_slope, 12, -12, 5) + (m.aligned ? 3 : 0);
  }
  function maUp(m) { return m.aligned && m.ma20_slope >= 5; }

  function score(m, cfg) {
    var parts = [
      ['익절 성공률', band(m.win_rate, 97, 70, 40), 40, m.win_rate.toFixed(1) + '%'],
      ['익절 소요일', band(-m.avg_days, -5, -35, 15), 15, '평균 ' + m.avg_days.toFixed(1) + '일'],
      ['9차 소진율', band(-m.full9_rate, 0, -25, 10), 10, m.full9_rate.toFixed(1) + '%'],
      ['최대 평가손실', band(m.worst_dd, -12, -45, 15), 15, m.worst_dd.toFixed(1) + '%'],
      ['추세 (이평)', maPts(m), 15,
        'MA20 ' + (m.ma20_slope >= 0 ? '+' : '') + m.ma20_slope.toFixed(1) + '% · MA60 ' +
        (m.ma60_slope >= 0 ? '+' : '') + m.ma60_slope.toFixed(1) + '%' +
        (m.aligned ? ' · 정배열' : ' · 역배열') +
        ' · ' + m.trend_days + '봉 ' + (m.trend >= 0 ? '+' : '') + m.trend.toFixed(0) + '%'],
      ['유동성·가격대', band(Math.min(m.avg_amt / 1e8, 50), 20, 2, 3) + band(Math.min(m.qty1, 50), 10, 1, 2), 5,
        (m.avg_amt / 1e8).toFixed(0) + '억 · ' + m.qty1 + '주']
    ];
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i][1];
    var cap = 100, capWhy = '';
    var why = function () {
      return '미회복 ' + m.fail_rate.toFixed(0) + '% · 최대 평가손실 ' + m.worst_dd.toFixed(0) +
             '% · 추세 ' + (m.trend >= 0 ? '+' : '') + m.trend.toFixed(0) + '%';
    };
    var t39 = maUp(m) ? -75 : -60, t54 = maUp(m) ? -50 : -35;
    if (m.fail_rate >= 15 || m.worst_dd <= -50 || m.trend <= t39) { cap = 39; capWhy = why(); }
    else if (m.fail_rate >= 8 || m.worst_dd <= -35 || m.trend <= t54) { cap = 54; capWhy = why(); }
    /* 과열 상한 — 많이 오른 종목은 평균 지표가 좋아도 등급을 올려주지 않는다 */
    var ohw = function () { return '장기 추세 ' + (m.trend >= 0 ? '+' : '') + m.trend.toFixed(0) + '% — 과열(되돌림 위험)'; };
    if (m.trend >= 400 && cap > 54) { cap = 54; capWhy = ohw(); }
    else if (m.trend >= 200 && cap > 70) { cap = 70; capWhy = ohw(); }
    var capped = total > cap;
    total = Math.min(total, cap);
    var g, c;
    if (total >= 85) { g = 'A'; c = '매우 적합'; }
    else if (total >= 70) { g = 'B'; c = '적합'; }
    else if (total >= 55) { g = 'C'; c = '보통 — 금액 줄여서'; }
    else if (total >= 40) { g = 'D'; c = '주의 — 권하지 않음'; }
    else { g = 'E'; c = '부적합'; }
    return {score: Math.round(total * 10) / 10, grade: g, comment: c,
            score_parts: parts, capped: capped, cap_why: capWhy};
  }

  function run(bars, cfgIn, warmup) {
    var cfg = cfgOf(cfgIn);
    warmup = warmup || 0;
    bars = bars.filter(function (b) { return b && b.close; });
    var n = bars.length, lastEntry = n - cfg.max_days - 1;
    if (n < 60 || lastEntry <= warmup)
      return {ok: false, msg: '일봉이 부족합니다(' + n + '봉). 최소 ' + (cfg.max_days + 61) + '봉 필요'};

    var trials = [];
    for (var i = warmup; i <= lastEntry; i++) {
      var t = trial(bars, i, cfg);
      if (t) trials.push(t);
    }
    if (!trials.length)
      return {ok: false, msg: '1회 매수금 ' + cfg.once.toLocaleString() + '원으로 1주도 못 삽니다(현재가 ' +
                              bars[n - 1].close.toLocaleString() + '원)'};

    var wins = [], fails = [], days = [], worstAll = 0, worstFail = 0;
    var sumCost = 0, maxCost = 0, full9 = 0, sumDays = 0;
    var full9Need = cfg.drops.length + 1;
    for (var x = 0; x < trials.length; x++) {
      var t2 = trials[x];
      if (t2.ok) { wins.push(t2); days.push(t2.days); sumDays += t2.days; }
      else { fails.push(t2); if (t2.worst < worstFail) worstFail = t2.worst; }
      if (t2.worst < worstAll) worstAll = t2.worst;
      if (t2.rounds >= full9Need) full9++;
      sumCost += t2.cost;
      if (t2.cost > maxCost) maxCost = t2.cost;
    }
    var winRate = pct(wins.length, trials.length);

    var drops10 = 0;
    for (var i2 = 1; i2 < n; i2++) {
      var p = bars[i2 - 1].close, c2 = bars[i2].close;
      if (p > 0 && (c2 - p) / p * 100 <= -10) drops10++;
    }
    var recent = bars.slice(-60), amt = 0;
    for (var r = 0; r < recent.length; r++) amt += recent[r].close * recent[r].vol;
    amt = amt / Math.max(1, recent.length);

    var yr = (n >= 250) ? bars.slice(-250) : bars, hi52 = -Infinity, lo52 = Infinity;
    for (var y = 0; y < yr.length; y++) { if (yr[y].high > hi52) hi52 = yr[y].high; if (yr[y].low < lo52) lo52 = yr[y].low; }
    var cur = bars[n - 1].close;
    var pos52 = (hi52 > lo52) ? ((cur - lo52) / (hi52 - lo52) * 100) : 50;

    var baseI = Math.max(0, n - 250), p0 = bars[baseI].close;
    var trend = p0 ? ((cur - p0) / p0 * 100) : 0;
    var worstList = trials.map(function (t3) { return t3.worst; });

    var roundsHist = {};
    for (var z = 0; z < trials.length; z++)
      roundsHist[trials[z].rounds] = (roundsHist[trials[z].rounds] || 0) + 1;

    var m = {
      ok: true, bars: n, from: bars[0].time.slice(0, 8), to: bars[n - 1].time.slice(0, 8),
      trials: trials.length, win_rate: winRate, fail_rate: 100 - winRate, fails: fails.length,
      avg_days: days.length ? (sumDays / days.length) : 0,
      med_days: median(days), p90_days: quantile(days, 0.9),
      max_days_seen: days.length ? Math.max.apply(null, days) : 0,
      full9_rate: pct(full9, trials.length), rounds_hist: roundsHist,
      worst_dd: worstAll, worst_dd_fail: worstFail,
      avg_cost: sumCost / trials.length, max_cost: maxCost,
      qty1: cur ? Math.floor(cfg.once / cur) : 0,
      drop10_rate: pct(drops10, n - 1), drop10_cnt: drops10,
      avg_amt: amt, cur: cur, hi52: hi52, lo52: lo52, pos52: pos52,
      trend: trend, trend_days: n - baseI, dd_p95: quantile(worstList, 0.05),
      ma20_slope: 0, ma60_slope: 0, aligned: false, ma20: null, ma60: null
    };
    var mt = maTrend(bars);
    m.ma20_slope = mt.ma20_slope; m.ma60_slope = mt.ma60_slope;
    m.aligned = mt.aligned; m.ma20 = mt.ma20; m.ma60 = mt.ma60;
    var s = score(m, cfg);
    for (var kk in s) m[kk] = s[kk];
    return m;
  }

  function warnings(m, cfgIn) {
    var cfg = cfgOf(cfgIn), out = [];
    if (m.fail_rate >= 10)
      out.push('기한(' + cfg.max_days + '거래일) 안에 익절 못 한 경우가 ' + m.fail_rate.toFixed(1) + '% — 자금이 묶일 수 있습니다');
    if (m.full9_rate >= 15)
      out.push('9차(-' + cfg.drops[cfg.drops.length - 1] + '%)까지 모두 쓴 경우가 ' + m.full9_rate.toFixed(1) +
               '% — 종목당 최대 ' + (cfg.once * (cfg.drops.length + 1)).toLocaleString() + '원이 들어갑니다');
    if (m.worst_dd <= -30)
      out.push('평단 대비 최대 평가손실 ' + m.worst_dd.toFixed(1) + '% — 손절이 없어 그대로 버텨야 합니다');
    if (m.drop10_rate >= 1.0)
      out.push('하루 -10% 이상 급락이 ' + m.drop10_cnt + '회(' + m.drop10_rate.toFixed(1) +
               '%) — 분할 차수를 하루에 몰아 쓸 수 있습니다');
    if (m.qty1 < 5)
      out.push('1회 매수금으로 ' + m.qty1 + '주뿐 — 분할매도 비중이 거칠게 떨어집니다');
    if (m.avg_amt < 5e8)
      out.push('최근 60일 평균 거래대금 ' + (m.avg_amt / 1e8).toFixed(1) + '억 — 체결이 밀릴 수 있습니다');
    if (m.trend <= -30)
      out.push('최근 ' + m.trend_days + '봉 주가가 ' + (m.trend >= 0 ? '+' : '') + m.trend.toFixed(0) +
               '% — 성공률이 높게 나와도 떨어지는 종목에 계속 재진입하는 것일 수 있습니다');
    if (m.trend >= 200)
      out.push('최근 ' + m.trend_days + '봉 주가가 ' + (m.trend >= 0 ? '+' : '') + m.trend.toFixed(0) +
               '% — 급등 뒤 되돌림이 오면 분할매수 9차(-' + cfg.drops[cfg.drops.length - 1] + '%)로도 안 끝날 수 있습니다');
    if (m.pos52 >= 85)
      out.push('52주 고가 대비 상단 ' + m.pos52.toFixed(0) + '% 자리 — 1차 진입 위치가 높습니다');
    return out;
  }

  g.Split10Fit = {run: run, warnings: warnings, DEFAULT_DROPS: DEFAULT_DROPS, cfgOf: cfgOf};
})(window);
