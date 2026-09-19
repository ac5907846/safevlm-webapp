/* Hero: the paper in one picture. Every dot is one real answer of Qwen2.5-VL-7B to a
   violation question, placed by the model's confidence; right answers stack above the line,
   wrong ones below, and "cannot determine" answers in a pile of their own. Four stages follow
   the four qualification questions: trusting every answer (Q1), confidence against
   correctness (Q2), the conformal gate that defers the uncertain answers to an inspector
   (Q3), and the same gate on a site it was not fitted on (Q4). Drawn on a canvas, so a few
   thousand dots move at full frame rate; every number is computed live from the stored
   answers with the same code as the Lab. */
(function (global) {
  'use strict';

  var F = global.Fmt, D = global.Data, R = global.CRC, M = global.Motion, K = global.Charts;

  var MODEL = 'qwen25vl_7b', HOME = 'cs10k__test', ALPHA = 0.05, SIGNAL = 'conf_tokenprob';
  var SITES = ['cs10k__test', 'chv', 'gdut', 'shwd', 'pictor', 'sh17'];
  var COL = {
    caught: '#5f9e57', clear: '#6aaac0', missed: '#b8236b', falseAlarm: '#e7aecb',
    deferred: '#dadde3', abstain: '#9aa1ad', right: '#8193b6', wrong: '#b8236b'
  };
  var NAME = {
    caught: 'violation detected', missed: 'violation missed', falseAlarm: 'false alarm',
    clear: 'correctly cleared', deferred: 'deferred to inspector', abstain: 'cannot determine',
    right: 'correct', wrong: 'incorrect'
  };
  var LEGEND = [
    ['caught', 'missed', 'falseAlarm', 'clear', 'abstain'],
    ['right', 'wrong', 'abstain'],
    ['caught', 'missed', 'falseAlarm', 'clear', 'deferred', 'abstain'],
    ['caught', 'missed', 'falseAlarm', 'clear', 'deferred', 'abstain']
  ];
  var INK = '#16181d', INK2 = '#4c515b', INK3 = '#868c98', RULE = '#e2e5ea';

  /* confidence runs from 1/3 (three options) to 1, drawn on a log-odds scale so the pile of
     very confident answers on the shifted sites spreads out instead of towering */
  var LO = 0.33, HI = 0.9995;
  function lg(c) { c = Math.min(Math.max(c, LO), HI); return Math.log(c / (1 - c)); }
  function inv(z) { return 1 / (1 + Math.exp(-z)); }
  var L0 = lg(LO), L1 = lg(HI);
  var AB = 14;                                        /* dots per row in the abstention pile */

  var st = { stage: 0, site: HOME };
  var lab = null, lam = null, lists = {}, el = {}, cv = null, ctx = null, dpr = 1, g = null;
  var P = [], line = null, raf = null, font = '11px sans-serif', onChange = null;

  function rnd(i) { var x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeBack(t) { var s = 1.35; t -= 1; return t * t * ((s + 1) * t + s) + 1; }

  /* ---------------------------------------------------------------- data */
  function list(tag) {
    if (lists[tag]) return lists[tag];
    var s = lab.sets[tag], out = [];
    for (var i = 0; i < s.n; i++) {
      var pos = s.pos[i] === '1', pred = s.pred[i];
      var o = pred === '2' ? 'abstain' : pos ? (pred === '0' ? 'missed' : 'caught')
        : (pred === '1' ? 'falseAlarm' : 'clear');
      out.push({ c: s.conf[i], o: o, right: o === 'caught' || o === 'clear' });
    }
    return (lists[tag] = out);
  }

  /* ---------------------------------------------------------------- geometry */
  function bin(c) {
    var b = Math.floor((lg(c) - L0) / (L1 - L0) * g.nb);
    return Math.max(0, Math.min(g.nb - 1, b));
  }
  function xOf(c) { return g.x0 + (lg(c) - L0) / (L1 - L0) * g.nb * g.bw; }

  function fits() {
    for (var s = 0; s < SITES.length; s++) {
      var li = list(SITES[s]), up = {}, dn = {}, ab = 0, mu = 0, md = 0;
      for (var i = 0; i < li.length; i++) {
        var it = li[i];
        if (it.o === 'abstain') { ab++; continue; }
        var b = bin(it.c);
        if (it.right) mu = Math.max(mu, (up[b] = (up[b] || 0) + 1));
        else md = Math.max(md, (dn[b] = (dn[b] || 0) + 1));
      }
      if (Math.ceil(mu / g.K) * g.p > g.up - 6 || Math.ceil(md / g.K) * g.p > g.dn - 6 ||
        Math.ceil(ab / AB) * g.p > g.up - 6) return false;
    }
    return true;
  }

  function geometry() {
    var w = Math.max(el.cv.clientWidth || 700, 300), narrow = w < 560;
    g = { w: w, top: 30, up: narrow ? 150 : 176, dn: narrow ? 92 : 104, axis: 38, K: 9 };
    g.base = g.top + g.up;
    g.h = g.base + g.dn + g.axis;
    for (var p = 4.4; p >= 1.8; p -= 0.1) {
      g.p = p;
      g.ax0 = 4;
      g.x0 = g.ax0 + AB * p + 34;
      g.bw = g.K * p;
      g.nb = Math.max(8, Math.floor((w - 12 - g.x0) / g.bw));
      if (fits()) break;
    }
    g.x1 = g.x0 + g.nb * g.bw;
    g.r = Math.max(0.8, g.p * 0.4);
    dpr = global.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(g.h * dpr);
    cv.style.height = g.h + 'px';
  }

  /* where every answer of a site sits: above the line if right, below if wrong, abstentions in
     their own pile; inside a column the kinds are kept together */
  var ORDER = { caught: 0, clear: 1, missed: 0, falseAlarm: 1, abstain: 0 };
  function layout(li) {
    var idx = li.map(function (_, i) { return i; });
    idx.sort(function (a, b) {
      return ORDER[li[a].o] - ORDER[li[b].o] || li[a].c - li[b].c || a - b;
    });
    var fill = {}, ab = 0, out = new Array(li.length), cu = [], cd = [];
    for (var b = 0; b < g.nb; b++) { cu.push(0); cd.push(0); }
    idx.forEach(function (i) {
      var it = li[i], x, y, j;
      if (it.o === 'abstain') {
        j = ab++;
        x = g.ax0 + (j % AB) * g.p + g.p / 2;
        y = g.base - 3 - Math.floor(j / AB) * g.p - g.p / 2;
      } else {
        var k = bin(it.c), key = (it.right ? 'u' : 'd') + k;
        j = fill[key] = (fill[key] || 0) + 1;
        j -= 1;
        if (it.right) cu[k]++; else cd[k]++;
        x = g.x0 + k * g.bw + (j % g.K) * g.p + g.p / 2;
        y = it.right ? g.base - 3 - Math.floor(j / g.K) * g.p - g.p / 2
          : g.base + 3 + Math.floor(j / g.K) * g.p + g.p / 2;
      }
      out[i] = [x, y];
    });
    out.cu = cu;
    out.cd = cd;
    out.ab = ab;
    return out;
  }

  function colorOf(it) {
    if (it.o === 'abstain') return 'abstain';
    if (st.stage === 1) return it.right ? 'right' : 'wrong';
    if (st.stage >= 2 && it.c < lam) return 'deferred';
    return it.o;
  }

  /* ---------------------------------------------------------------- particles */
  function particle(x, y) {
    return { x: x, y: y, sx: x, sy: y, tx: x, ty: y, t0: 0, dur: 1, e: easeOut,
      a: 1, sa: 1, ta: 1, c: 'deferred', nc: 'deferred', ct: 0 };
  }
  function move(p, x, y, t0, dur, e) {
    p.sx = p.x; p.sy = p.y; p.tx = x; p.ty = y; p.t0 = t0; p.dur = dur; p.e = e || easeOut;
    p.sa = p.a;
  }

  var cur = null;                                           /* the current layout */

  /* every dot falls into place, a wave from low to high confidence */
  function rain() {
    var li = list(st.site), now = performance.now();
    cur = layout(li);
    P = li.map(function (it, i) {
      var q = particle(cur[i][0], -10 - rnd(i) * 70);
      var wave = (cur[i][0] - g.ax0) / (g.x1 - g.ax0);
      move(q, cur[i][0], cur[i][1], now + wave * 900 + rnd(i + 7) * 450, 650, easeBack);
      q.c = q.nc = colorOf(it);
      return q;
    });
    kick();
  }

  /* recolor for a new stage; the gate's line sweeps and turns what it passes gray */
  function recolor(prevStage) {
    var li = list(st.site), now = performance.now();
    var sweep = st.stage >= 2 && prevStage < 2, lx = xOf(lam);
    li.forEach(function (it, i) {
      var p = P[i], c = colorOf(it);
      if (c === p.nc) return;
      p.nc = c;
      p.ct = sweep && c === 'deferred'
        ? now + Math.max(0, (p.tx - g.x0) / Math.max(1, lx - g.x0)) * 1100
        : now + (p.tx - g.ax0) / (g.x1 - g.ax0) * 500 + rnd(i) * 150;
    });
    gate(now);
    kick();
  }

  /* dots of the old site fly to their place for the new one; extras fade in or out */
  function morph() {
    var li = list(st.site), now = performance.now(), next = layout(li), n = li.length;
    for (var i = 0; i < Math.max(n, P.length); i++) {
      var p = P[i];
      if (i >= n) {
        p.ta = 0;
        move(p, p.x, p.y + 30, now + rnd(i) * 300, 700);
        continue;
      }
      if (!p) {
        p = P[i] = particle(next[i][0], -10 - rnd(i) * 60);
        p.a = 0;
      }
      p.ta = 1;
      move(p, next[i][0], next[i][1], now + rnd(i + 3) * 380, 1000);
      p.nc = colorOf(li[i]);
      p.ct = p.t0 + 450;
      if (p.a === 0) p.c = p.nc;
    }
    cur = next;
    gate(now);
    kick();
  }

  function gate(now) {
    var show = st.stage >= 2, x = show ? xOf(lam) : g.x0;
    if (!line) line = { x: g.x0, sx: g.x0, tx: g.x0, t0: 0, dur: 1, a: 0, sa: 0, ta: 0 };
    line.sx = line.x; line.tx = x; line.sa = line.a; line.ta = show ? 1 : 0;
    line.t0 = now; line.dur = 1100;
  }

  /* ---------------------------------------------------------------- drawing */
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame() {
    raf = null;
    /* with reduced motion every move lands at once; the stages still change */
    var now = M.reduced ? 1e15 : performance.now(), busy = false, groups = {}, faded = [];
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      if (now < p.t0) { busy = true; }
      else {
        var k = Math.min(1, (now - p.t0) / p.dur), e = p.e(k);
        p.x = p.sx + (p.tx - p.sx) * e;
        p.y = p.sy + (p.ty - p.sy) * e;
        p.a = p.sa + (p.ta - p.sa) * k;
        if (k < 1) busy = true;
      }
      if (p.c !== p.nc) { if (now >= p.ct) p.c = p.nc; else busy = true; }
      if (p.a <= 0.01) continue;
      if (p.a < 0.99) faded.push(p);
      else (groups[p.c] = groups[p.c] || []).push(p);
    }
    if (line) {
      var lk = Math.min(1, (now - line.t0) / line.dur), le = easeOut(lk);
      line.x = line.sx + (line.tx - line.sx) * le;
      line.a = line.sa + (line.ta - line.sa) * lk;
      if (lk < 1) busy = true;
    }
    draw(groups, faded);
    if (busy) kick();
  }

  function draw(groups, faded) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, g.w, g.h);
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';

    /* the automated side of the gate */
    if (line && line.a > 0.01) {
      ctx.globalAlpha = line.a;
      ctx.fillStyle = 'rgba(212, 235, 242, .55)';
      ctx.fillRect(line.x, g.top - 12, g.x1 - line.x + 4, g.up + g.dn + 12);
      ctx.globalAlpha = 1;
    }

    /* baseline and side labels */
    ctx.fillStyle = RULE;
    ctx.fillRect(g.x0 - 4, g.base - 0.5, g.x1 - g.x0 + 8, 1);
    ctx.fillStyle = INK2;
    ctx.textAlign = 'right';
    ctx.fillText('correct', g.x0 - 8, g.base - 6);
    ctx.fillText('incorrect', g.x0 - 8, g.base + 14);

    /* the dots, one path per color */
    Object.keys(groups).forEach(function (c) {
      var list = groups[c];
      ctx.beginPath();
      for (var i = 0; i < list.length; i++) {
        ctx.moveTo(list[i].x + g.r, list[i].y);
        ctx.arc(list[i].x, list[i].y, g.r, 0, 6.2832);
      }
      ctx.fillStyle = COL[c];
      ctx.fill();
    });
    faded.forEach(function (p) {
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, g.r, 0, 6.2832);
      ctx.fillStyle = COL[p.c];
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    /* the abstention pile */
    ctx.textAlign = 'left';
    ctx.fillStyle = INK3;
    ctx.fillText('cannot', g.ax0, g.base + 34);
    ctx.fillText('determine', g.ax0, g.base + 47);
    ctx.fillStyle = INK2;
    ctx.fillText(F.int(cur ? cur.ab : 0), g.ax0, g.base + 60);

    /* the mean confidence of right and of wrong answers */
    if (st.stage === 1 && cur) means();

    /* the gate */
    if (line && line.a > 0.01) {
      ctx.globalAlpha = line.a;
      ctx.fillStyle = INK;
      ctx.fillRect(Math.round(line.x) - 0.75, g.top - 12, 1.5, g.up + g.dn + 12);
      ctx.textAlign = 'left';
      ctx.fillText('λ ' + F.num(lam, 3) + '   automated →', line.x + 6, g.top - 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = INK3;
      ctx.fillText('← deferred to an inspector', line.x - 6, g.top - 1);
      ctx.globalAlpha = 1;
    }

    /* confidence axis */
    ctx.fillStyle = INK3;
    ctx.textAlign = 'center';
    var ya = g.base + g.dn + 14;
    [0.4, 0.5, 0.7, 0.9, 0.99, 0.999].forEach(function (c) {
      var x = xOf(c);
      ctx.fillRect(x - 0.5, ya - 12, 1, 4);
      ctx.fillText(F.num(c, c < 0.99 ? 1 : c < 0.999 ? 2 : 3), x, ya + 2);
    });
    ctx.fillStyle = INK2;
    ctx.fillText('model confidence (answer-token probability)', (g.x0 + g.x1) / 2, ya + 20);
  }

  function means() {
    var li = list(st.site), su = 0, nu = 0, sd = 0, nd = 0;
    li.forEach(function (it) {
      if (it.o === 'abstain') return;
      if (it.right) { su += it.c; nu++; } else { sd += it.c; nd++; }
    });
    [[su / nu, -1, COL.right], [sd / nd, 1, COL.wrong]].forEach(function (m) {
      var x = xOf(m[0]), y0 = g.base, y1 = g.base + m[1] * (m[1] < 0 ? g.up - 8 : g.dn - 8);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = INK;
      ctx.textAlign = 'left';
      ctx.fillText('mean ' + F.num(m[0], 2), x + 5, m[1] < 0 ? y1 + 10 : y1);
    });
  }

  /* ---------------------------------------------------------------- print */
  /* the same picture as SVG, at rest: every dot a circle and every label text, so a printed
     or PDF copy of the page stays vector */
  function svg() {
    var o = [], fam = getComputedStyle(document.body).fontFamily.replace(/"/g, "'");
    function tx(x, y, s, fill, anchor) {
      o.push('<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" fill="' + fill + '"' +
        (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + D.esc(s) + '</text>');
    }
    o.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + g.w + ' ' + g.h + '" width="' + g.w +
      '" height="' + g.h + '" font-family="' + fam + '" font-size="11">');
    var gated = st.stage >= 2, lx = gated ? xOf(lam) : null;
    if (gated) {
      o.push('<rect x="' + lx.toFixed(1) + '" y="' + (g.top - 12) + '" width="' + (g.x1 - lx + 4).toFixed(1) +
        '" height="' + (g.up + g.dn + 12) + '" fill="rgb(212,235,242)" fill-opacity=".55"/>');
    }
    o.push('<rect x="' + (g.x0 - 4) + '" y="' + (g.base - 0.5) + '" width="' + (g.x1 - g.x0 + 8) + '" height="1" fill="' + RULE + '"/>');
    tx(g.x0 - 8, g.base - 6, 'correct', INK2, 'end');
    tx(g.x0 - 8, g.base + 14, 'incorrect', INK2, 'end');
    var by = {};
    P.forEach(function (p) { if (p.ta > 0.01) (by[p.nc] = by[p.nc] || []).push(p); });
    Object.keys(by).forEach(function (c) {
      o.push('<g fill="' + COL[c] + '">');
      by[c].forEach(function (p) {
        o.push('<circle cx="' + p.tx.toFixed(2) + '" cy="' + p.ty.toFixed(2) + '" r="' + g.r.toFixed(2) + '"/>');
      });
      o.push('</g>');
    });
    tx(g.ax0, g.base + 34, 'cannot', INK3);
    tx(g.ax0, g.base + 47, 'determine', INK3);
    tx(g.ax0, g.base + 60, F.int(cur ? cur.ab : 0), INK2);
    if (gated) {
      o.push('<rect x="' + (Math.round(lx) - 0.75) + '" y="' + (g.top - 12) + '" width="1.5" height="' + (g.up + g.dn + 12) + '" fill="' + INK + '"/>');
      tx(lx + 6, g.top - 1, 'λ ' + F.num(lam, 3) + '   automated →', INK);
      tx(lx - 6, g.top - 1, '← deferred to an inspector', INK3, 'end');
    }
    if (st.stage === 1) {
      var li = list(st.site), su = 0, nu = 0, sd = 0, nd = 0;
      li.forEach(function (it) {
        if (it.o === 'abstain') return;
        if (it.right) { su += it.c; nu++; } else { sd += it.c; nd++; }
      });
      [[su / nu, -1], [sd / nd, 1]].forEach(function (m) {
        var x = xOf(m[0]), y1 = g.base + m[1] * (m[1] < 0 ? g.up - 8 : g.dn - 8);
        o.push('<line x1="' + x + '" y1="' + g.base + '" x2="' + x + '" y2="' + y1 + '" stroke="' + INK +
          '" stroke-width="1.2" stroke-dasharray="3 3"/>');
        tx(x + 5, m[1] < 0 ? y1 + 10 : y1, 'mean ' + F.num(m[0], 2), INK);
      });
    }
    var ya = g.base + g.dn + 14;
    [0.4, 0.5, 0.7, 0.9, 0.99, 0.999].forEach(function (c) {
      var x = xOf(c);
      o.push('<rect x="' + (x - 0.5).toFixed(1) + '" y="' + (ya - 12) + '" width="1" height="4" fill="' + INK3 + '"/>');
      tx(x, ya + 2, F.num(c, c < 0.99 ? 1 : c < 0.999 ? 2 : 3), INK3, 'middle');
    });
    tx((g.x0 + g.x1) / 2, ya + 20, 'model confidence (answer-token probability)', INK2, 'middle');
    o.push('</svg>');
    return o.join('');
  }

  /* swap the canvas for its SVG twin (used before printing the page to PDF) */
  function vector() {
    if (!lab) return false;
    var old = el.cv.querySelector('.hero-svg');
    if (old) old.remove();
    var d = document.createElement('div');
    d.className = 'hero-svg';
    d.innerHTML = svg();
    el.cv.insertBefore(d, cv);
    cv.style.display = 'none';
    return true;
  }

  /* ---------------------------------------------------------------- hover */
  function hover(e) {
    if (!cur) return;
    var box = cv.getBoundingClientRect(), x = e.clientX - box.left, y = e.clientY - box.top;
    if (x < g.x0 - 20 && y < g.base + 64) {
      K.showTip(e, '<b>cannot determine</b><br>' + F.int(cur.ab) + ' answers, always deferred');
      return;
    }
    if (x < g.x0 || x >= g.x1) { K.hideTip(); return; }
    var b = Math.floor((x - g.x0) / g.bw), z0 = L0 + b / g.nb * (L1 - L0), z1 = L0 + (b + 1) / g.nb * (L1 - L0);
    var c0 = inv(z0), c1 = inv(z1);
    var html = '<b>confidence ' + F.num(c0, c1 < 0.99 ? 2 : 3) + ' to ' + F.num(c1, c1 < 0.99 ? 2 : 3) + '</b><br>' +
      '<span class="k">correct</span> ' + F.int(cur.cu[b]) + ' · <span class="k">incorrect</span> ' + F.int(cur.cd[b]);
    if (st.stage >= 2) {
      html += '<br>' + (c1 <= lam ? 'deferred to an inspector' : c0 >= lam ? 'automated' : 'split by λ');
    }
    K.showTip(e, html);
  }

  /* ---------------------------------------------------------------- readout and legend */
  function code(c, t) { return '<div class="ro-code"><span class="q-code">' + c + '</span>' + t + '</div>'; }
  function link(href, t) { return '<a class="ro-go" href="' + href + '">' + t + ' →</a>'; }

  function readout() {
    var h = D.store.meta.headline, ds = D.dataset(st.site).short;
    var res = R.evaluate(lab.sets[st.site], SIGNAL, st.stage >= 2 ? lam : 0);
    var home = R.evaluate(lab.sets[HOME], SIGNAL, lam);
    var lab2 = '#lab?model=' + MODEL + '&signal=' + SIGNAL + '&deploy=' + st.site + '&alpha=' + ALPHA;
    var html;
    if (st.stage === 0) {
      html = code('Q1', 'Detection reliability') +
        '<div class="ro-v">' + M.span(res.fnrNone, 'pct1', 'a') + '</div>' +
        '<div class="ro-l">missed-violation rate when every answer is acted on</div>' +
        '<div class="ro-s">' + F.int(res.npos) + ' violations · ' + F.int(res.n) + ' questions · ' + ds + '</div>' +
        link('#answers?story=confident+and+wrong', 'examples');
    } else if (st.stage === 1) {
      html = code('Q2', 'Self-knowledge') +
        '<div class="ro-v">' + M.span(h.token_auroc, 'num3', 'a') + '<span class="arrow"> → </span>' +
        M.span(h.probe_auroc, 'num3', 'b') + '</div>' +
        '<div class="ro-l">error-detection AUROC, output confidence → hidden-state probe</div>' +
        '<div class="ro-s">incorrect answers are about as confident as correct ones</div>';
    } else if (st.stage === 2) {
      html = code('Q3', 'Bounded delegation') +
        '<div class="ro-v">' + M.span(res.coverage, 'pct1', 'a') + '</div>' +
        '<div class="ro-l">of decisions automated</div>' +
        '<div class="ro-v2 ok">' + M.span(res.fnr, 'pct1', 'b') + '</div>' +
        '<div class="ro-l">of violations missed, target ' + F.pct(ALPHA, 0) + ' ✓</div>' +
        '<div class="ro-s">λ ' + F.num(lam, 3) + ' fitted on the calibration split</div>' +
        link(lab2, 'open in the Lab');
    } else {
      html = code('Q4', 'Requalification') +
        '<div class="ro-v bad">' + M.span(res.fnr, 'pct1', 'a') + '</div>' +
        '<div class="ro-l">of violations missed on ' + ds + ', same λ</div>' +
        '<div class="ro-v2 bad">' + M.span(home.fnr > 0 ? res.fnr / home.fnr : 0, 'times1', 'b') + '</div>' +
        '<div class="ro-l">the in-distribution rate, with ' + F.pct(res.coverage, 1) + ' automated</div>' +
        link(lab2, 'open in the Lab');
    }
    var before = M.snapshot(el.ro), first = !el.ro.children.length;
    el.ro.innerHTML = html;
    if (first) M.count(el.ro, 1400);
    else if (M.carry(before, el.ro)) M.count(el.ro, 700, true);

    var o = res.outcomes, cnt = {
      caught: o.caught, missed: o.missed, falseAlarm: o.falseAlarm, clear: o.clear, deferred: o.held,
      abstain: o.abstain, right: o.caught + o.clear, wrong: o.missed + o.falseAlarm
    };
    el.lg.innerHTML = '<div class="lg-row">' + LEGEND[st.stage].map(function (k) {
      return '<span class="lg"><i class="dot" style="background:' + COL[k] + '"></i>' + NAME[k] +
        ' <b>' + F.int(cnt[k]) + '</b></span>';
    }).join('') + '</div>';

    el.sub.textContent = MODEL_LABEL() + ' · ' + F.int(res.n) + ' violation questions · ' +
      D.dataset(st.site).label + (st.site === HOME ? ' test split' : '') + ' · one dot per answer';
    el.sites.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === st.site));
    });
    if (onChange) onChange(st.stage);
  }
  function MODEL_LABEL() { return D.model(MODEL).label; }

  /* ---------------------------------------------------------------- public */
  function mount(root, changed) {
    onChange = changed;
    root.innerHTML =
      '<div class="hero-h"><div class="hero-t">Individual answers by confidence<span id="h-sub"></span></div>' +
      '<div class="chips" id="h-sites"></div></div>' +
      '<div class="hero-b"><div class="ro" id="h-ro"></div>' +
      '<div><div class="hero-cv" id="h-cv"><canvas role="img" aria-label="Each answer of the model as a dot, placed by confidence"></canvas></div>' +
      '<div class="legend" id="h-lg"></div></div></div>';
    el.cv = document.getElementById('h-cv');
    el.ro = document.getElementById('h-ro');
    el.lg = document.getElementById('h-lg');
    el.sub = document.getElementById('h-sub');
    el.sites = document.getElementById('h-sites');
    cv = el.cv.querySelector('canvas');
    ctx = cv.getContext('2d');
    font = '11px ' + getComputedStyle(document.body).fontFamily;
    SITES.forEach(function (tag) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('data-v', tag);
      b.innerHTML = '<i class="dot" style="background:' + D.dataset(tag).color + '"></i>' + D.dataset(tag).short;
      b.addEventListener('click', function () { site(tag); });
      el.sites.appendChild(b);
    });
    cv.addEventListener('mousemove', hover);
    cv.addEventListener('mouseleave', K.hideTip);
    if (global.Tour) global.Tour.hero.attach(el.cv);
    preview();
    return load();
  }

  /* before the answers arrive: the headline number and a visible wait, never a blank box */
  function preview() {
    var h = D.store.meta.headline;
    el.ro.innerHTML = code('Q1', 'Detection reliability') +
      '<div class="ro-v">' + M.span(h.crc_fnr_none, 'pct1', 'a') + '</div>' +
      '<div class="ro-l">missed-violation rate when every answer is acted on</div>';
    M.count(el.ro, 1400);
    wait('<span class="hw-bar"><i></i></span>Loading the model’s answers…');
  }
  function wait(html) {
    var w = el.cv.querySelector('.hero-wait');
    if (!html) { if (w) w.remove(); return; }
    if (!w) { w = document.createElement('div'); w.className = 'hero-wait'; el.cv.appendChild(w); }
    w.innerHTML = html;
  }

  /* the answers come from a small file of their own (data/hero.json), so the first page stays
     light; on a slow line the wait says so, and a failed download offers a retry */
  function load() {
    var slow = setTimeout(function () {
      wait('<span class="hw-bar"><i></i></span>Still loading, the connection is slow…');
    }, 5000);
    return D.get('hero.json').then(function (j) {
      clearTimeout(slow);
      var sets = {};
      Object.keys(j.sets).forEach(function (tag) {
        var s = j.sets[tag];
        sets[tag] = { n: s.n, conf: R.unpack(s.conf, s.n), pos: s.pos, pred: s.pred };
      });
      lab = { model: j.model, sets: sets };
      lam = R.fit(R.prepare(lab.sets.cs10k__calib, SIGNAL), ALPHA);
      wait(null);
      geometry();
      rain();
      readout();
    }, function () {
      clearTimeout(slow);
      D.forget('hero.json');
      wait('The answers could not be loaded. <button type="button" class="btn hw-retry">Try again</button>');
      el.cv.querySelector('.hw-retry').addEventListener('click', function () {
        wait('<span class="hw-bar"><i></i></span>Loading the model’s answers…');
        load();
      });
    });
  }

  /* Q2 and Q3 are about the site the gate was fitted on; Q4 is about any other site */
  function stage(s, tag) {
    if (!lab) return;
    var prev = st.stage, before = st.site;
    st.stage = s;
    if (tag) st.site = tag;
    else if (s === 1 || s === 2) st.site = HOME;
    else if (s === 3 && st.site === HOME) st.site = 'shwd';
    if (st.site !== before) morph(); else recolor(prev);
    readout();
  }

  function site(tag) {
    if (!lab) return;
    if (st.stage === 0) { st.site = tag; morph(); readout(); return; }
    stage(tag === HOME ? 2 : 3, tag);
  }

  function resize() {
    if (!lab) return;
    geometry();
    cur = layout(list(st.site));
    P.length = cur.length;
    for (var i = 0; i < cur.length; i++) {
      var p = P[i] || (P[i] = particle(0, 0));
      p.x = p.sx = p.tx = cur[i][0];
      p.y = p.sy = p.ty = cur[i][1];
      p.t0 = 0; p.a = p.sa = p.ta = 1;
      p.c = p.nc = colorOf(list(st.site)[i]);
    }
    if (line) { line.x = line.sx = line.tx = st.stage >= 2 ? xOf(lam) : g.x0; line.t0 = 0; }
    kick();
  }

  global.Hero = {
    mount: mount, stage: stage, site: site, resize: resize, rain: function () { if (lab) rain(); },
    vector: vector, svg: function () { return lab ? svg() : ''; },
    ready: function () { return !!lab; }, state: function () { return { stage: st.stage, site: st.site }; }
  };
})(window);
