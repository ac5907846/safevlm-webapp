/* Lab: conformal risk control run live on the frozen answers. Choose a model, a confidence
   signal, a target and the site to deploy on; the threshold is refitted on the ConstructionSite-
   10k calibration split in the browser and applied to the chosen site. Where the setting is one
   the paper reports, the live result is checked against the published value. */
(function (global) {
  'use strict';

  var F = global.Fmt, D = global.Data, K = global.Charts, C = K.C, R = global.CRC, M = global.Motion;

  var MODELS = ['qwen25vl_7b', 'qwen25vl_3b', 'llava_ov_7b', 'internvl3_8b',
    'qwen25vl_7b_ft', 'qwen25vl_3b_ft'];
  var HOME = 'cs10k__test';
  var SITES = ['cs10k__test', 'chv', 'gdut', 'shwd', 'pictor', 'sh17'];
  var SIGNALS = [['conf_tokenprob', 'Answer-token probability'], ['conf_verbal', 'Verbalized confidence']];
  var KMAX = 40;                                      /* target = k / 200, from .5% to 20% */
  var OUT = [
    ['caught', 'violation caught', '#D9EAD3', '#8fbf7f'],
    ['missed', 'violation missed', '#d48faf', '#a8456f'],
    ['falseAlarm', 'false alarm', '#EAD1DC', '#c98aa6'],
    ['clear', 'correctly cleared', '#D4EBF2', '#7fb6c8'],
    ['held', 'deferred to inspector', '#e6e6e6', '#a6a6a6'],
    ['abstain', 'model abstained', '#BFBFBF', '#8a8a8a']
  ];

  var st = { model: 'qwen25vl_7b', signal: 'conf_tokenprob', k: 10, deploy: HOME };
  var root = null, lab = null, preps = {}, curves = {};

  function alpha() { return st.k / 200; }
  function pctAuto(v) { return F.pct(v, Math.abs(v * 100 - Math.round(v * 100)) > 1e-9 ? 1 : 0); }

  function take(p) {
    if (!p) return;
    if (p.model && MODELS.indexOf(p.model) >= 0) st.model = p.model;
    if (p.signal && (p.signal === 'conf_tokenprob' || p.signal === 'conf_verbal')) st.signal = p.signal;
    if (p.deploy && SITES.indexOf(p.deploy) >= 0) st.deploy = p.deploy;
    if (p.alpha) {
      var k = Math.round(Number(p.alpha) * 200);
      if (k >= 1 && k <= KMAX) st.k = k;
    }
  }

  /* ---------------------------------------------------------------- layout */
  function mount(el, params) {
    root = el;
    take(params);
    el.innerHTML =
      '<div class="card lab-controls">' +
      '<div class="field"><label for="l-model">Model</label><select id="l-model"></select></div>' +
      '<div class="field"><label>Confidence estimator</label><div class="seg" id="l-signal"></div></div>' +
      '<div class="field grow"><label for="l-alpha">Missed-violation target <b id="l-av"></b></label>' +
      '<input type="range" id="l-alpha" min="1" max="' + KMAX + '" step="1">' +
      '<div class="ticks" id="l-ticks"></div></div>' +
      '<div class="field"><label>Apply threshold to</label><div class="seg" id="l-deploy"></div></div>' +
      '</div>' +
      '<div class="readout" id="l-read"></div>' +
      '<div class="verify" id="l-verify"></div>' +
      '<div class="grid2">' +
      '<div class="card"><div class="card-h"><span>Achieved missed-violation rate</span>' +
      '<span class="muted">against the target · click to set</span></div>' +
      '<div id="l-g" class="chart short"></div></div>' +
      '<div class="card"><div class="card-h"><span>Share of decisions automated</span>' +
      '<span class="muted">against the target · click to set</span></div>' +
      '<div id="l-p" class="chart short"></div></div>' +
      '</div>' +
      '<div class="card"><div class="card-h"><span>Decision outcomes</span>' +
      '<span class="muted" id="l-n"></span></div>' +
      '<div id="l-o" class="bar-host"></div><div class="legend" id="l-ol"></div></div>';

    var sel = document.getElementById('l-model');
    MODELS.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m;
      o.textContent = D.model(m).label;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { st.model = sel.value; load(); });

    var sig = document.getElementById('l-signal');
    SIGNALS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s[1];
      b.setAttribute('data-v', s[0]);
      b.addEventListener('click', function () { st.signal = s[0]; render(); });
      sig.appendChild(b);
    });

    var range = document.getElementById('l-alpha');
    range.addEventListener('input', function () { st.k = Number(range.value); render(true); });
    var ticks = document.getElementById('l-ticks');
    R.PAPER_ALPHAS.forEach(function (a) {
      var k = Math.round(a * 200);
      var t = document.createElement('button');
      t.type = 'button';
      t.className = 'tick';
      t.setAttribute('data-k', k);
      t.style.left = ((k - 1) / (KMAX - 1) * 100) + '%';
      t.textContent = F.pct(a, 0);
      t.title = 'a target the paper reports';
      t.addEventListener('click', function () { st.k = k; render(true); });
      ticks.appendChild(t);
    });

    var dep = document.getElementById('l-deploy');
    SITES.forEach(function (tag) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-v', tag);
      b.innerHTML = D.dataset(tag).short + (tag === HOME ? '<span class="home">in-dist.</span>' : '');
      b.addEventListener('click', function () { st.deploy = tag; render(); });
      dep.appendChild(b);
    });
    load();
  }

  function apply(params) {
    var before = st.model;
    take(params);
    if (st.model !== before || !lab) load(); else render();
  }

  function load() {
    var m = st.model;
    root.classList.add('busy');
    D.get('lab/' + m + '.json').then(function (j) {
      if (st.model !== m) return;
      lab = j;
      root.classList.remove('busy');
      render();
    });
  }

  function prep(signal) {
    var key = lab.model + '|' + signal;
    if (!preps[key]) preps[key] = R.prepare(lab.sets.cs10k__calib, signal);
    return preps[key];
  }

  /* ---------------------------------------------------------------- compute and draw */
  function render(alphaOnly) {
    if (!lab) return;
    sync();
    var a = alpha();
    var t0 = performance.now();
    var lam = R.fit(prep(st.signal), a);
    var res = R.evaluate(lab.sets[st.deploy], st.signal, lam);
    var home = st.deploy === HOME ? res : R.evaluate(lab.sets[HOME], st.signal, lam);
    var ms = performance.now() - t0;
    readout(res, home, a, !alphaOnly);
    verify(res, a, ms);
    charts(alphaOnly);
    outcomes(res);
  }

  function sync() {
    document.getElementById('l-model').value = st.model;
    document.querySelectorAll('#l-signal button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === st.signal));
    });
    document.querySelectorAll('#l-deploy button').forEach(function (b) {
      var tag = b.getAttribute('data-v');
      b.disabled = !lab.sets[tag];
      b.setAttribute('aria-pressed', String(tag === st.deploy));
    });
    document.getElementById('l-alpha').value = st.k;
    document.getElementById('l-av').textContent = pctAuto(alpha());
    document.querySelectorAll('#l-ticks .tick').forEach(function (t) {
      t.classList.toggle('on', Number(t.getAttribute('data-k')) === st.k);
    });
    var hash = '#lab?model=' + st.model + '&signal=' + st.signal + '&deploy=' + st.deploy +
      '&alpha=' + alpha();
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function big(v, l, cls, sub) {
    return '<div class="big' + (cls ? ' ' + cls : '') + '"><div class="v">' + v + '</div>' +
      '<div class="l">' + l + '</div>' + (sub ? '<div class="s">' + sub + '</div>' : '') + '</div>';
  }

  /* a jump (new site, model or estimator) glides from the old numbers; the target slider,
     which moves in small steps, redraws at once */
  function readout(res, home, a, glide) {
    var closed = res.lam > 1;
    var meets = res.fnr <= a + 1e-12;
    var amp = st.deploy !== HOME && home.fnr > 0 ? res.fnr / home.fnr : null;
    var host = document.getElementById('l-read');
    var before = M.snapshot(host);
    host.innerHTML =
      big(M.span(res.coverage, 'pct1', 'cov'), 'decisions automated', null, closed ? 'no threshold meets the target' : null) +
      big(M.span(res.fnr, 'pct1', 'fnr'), 'missed violations', meets ? 'ok' : 'bad',
        amp !== null ? M.span(amp, 'times1', 'amp') + ' the in-distribution rate' : (meets ? 'within target' : 'over target')) +
      big(M.span(res.fnrNone, 'pct1', 'none'), 'missed without deferral') +
      big(closed ? 'closed' : res.lam === 0 ? '0' : M.span(res.lam, 'num3', 'lam'), 'threshold λ');
    if (glide && M.carry(before, host)) M.count(host, 600, true);
  }

  function source(a) {
    var key = String(a);
    if (st.signal === 'conf_tokenprob' && key === '0.05') return st.deploy === HOME ? 'Table 5' : 'Fig. 5a';
    if (st.signal === 'conf_tokenprob' && st.deploy === HOME) return 'Fig. 4';
    return 'study results';
  }

  function verify(res, a, ms) {
    var paper = lab.paper[st.signal] && lab.paper[st.signal][String(a)] &&
      lab.paper[st.signal][String(a)][st.deploy];
    var n = lab.sets.cs10k__calib.n + res.n;
    var html;
    if (paper) {
      var ok = R.matches(res, paper);
      html = '<span class="pill ' + (ok ? 'ok' : 'bad') + '">' +
        (ok ? '✓ matches the published value' : '✗ differs from the published value') + '</span>' +
        '<span class="src">' + source(a) + '</span>';
    } else {
      html = '<span class="pill live">live</span>';
    }
    html += '<span class="muted">' + F.int(n) + ' stored model outputs · ' +
      (ms < 1 ? '<1' : ms.toFixed(0)) + ' ms in this browser</span>';
    document.getElementById('l-verify').innerHTML = html;
  }

  function curveFor(tag) {
    var key = lab.model + '|' + st.signal + '|' + tag;
    if (curves[key]) return curves[key];
    var p = prep(st.signal), xs = [], fnr = [], cov = [];
    for (var k = 1; k <= KMAX; k++) {
      var a = k / 200, res = R.evaluate(lab.sets[tag], st.signal, R.fit(p, a));
      xs.push(a);
      fnr.push(res.fnr);
      cov.push(res.coverage);
    }
    curves[key] = { x: xs, fnr: fnr, cov: cov };
    return curves[key];
  }

  function charts() {
    var dep = curveFor(st.deploy);
    var home = st.deploy === HOME ? null : curveFor(HOME);
    var dCol = D.dataset(st.deploy).color;
    var sG = [{ name: D.dataset(st.deploy).short, x: dep.x, y: dep.fnr, color: dCol, width: 2.4 }];
    var sP = [{ name: D.dataset(st.deploy).short, x: dep.x, y: dep.cov, color: dCol, width: 2.4 }];
    if (home) {
      sG.push({ name: 'CS10k (in-distribution)', x: home.x, y: home.fnr, color: C.slate, width: 1.6, dash: '4 3' });
      sP.push({ name: 'CS10k (in-distribution)', x: home.x, y: home.cov, color: C.slate, width: 1.6, dash: '4 3' });
    }
    var yMax = Math.max(0.22, Math.max.apply(null, dep.fnr.concat(home ? home.fnr : [])) * 1.08);
    curveChart(document.getElementById('l-g'), {
      series: sG, y1: yMax, diag: true, yLabel: 'missed'
    });
    curveChart(document.getElementById('l-p'), {
      series: sP, y1: 1, diag: false, yLabel: 'automated'
    });
  }

  function curveChart(host, o) {
    var m = { t: 12, r: 18, b: 44, l: 54 };
    var f = K.frame(host, 240, m);
    var x = K.linear(0, 0.2, 0, f.iw), y = K.linear(0, o.y1, f.ih, 0);
    K.axisY(f.g, y, 0, { grid: f.iw, count: 5, format: pctAuto, label: o.yLabel });
    K.axisX(f.g, x, f.ih, { values: R.PAPER_ALPHAS, format: pctAuto, label: 'target' });
    if (o.diag) {
      var d = Math.min(0.2, o.y1);
      K.el('line', {
        x1: x(0), y1: y(0), x2: x(d), y2: y(d),
        stroke: C.ink3, 'stroke-width': 1.2, 'stroke-dasharray': '2 3'
      }, f.g);
      K.text(f.g, x(d * 0.72) + 6, y(d * 0.72) + 16, 'target', { 'font-size': 11, fill: C.ink3 });
    }
    o.series.forEach(function (s) {
      var pts = s.x.map(function (v, i) { return [x(v), y(s.y[i])]; })
        .filter(function (p) { return isFinite(p[1]); });
      K.el('polyline', {
        points: pts.map(function (p) { return p.join(','); }).join(' '),
        fill: 'none', stroke: s.color, 'stroke-width': s.width, 'stroke-dasharray': s.dash || null,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }, f.g);
    });
    var a = alpha(), i = st.k - 1;
    K.el('line', {
      x1: x(a), x2: x(a), y1: 0, y2: f.ih, stroke: C.ink, 'stroke-width': 1, 'stroke-dasharray': '3 3'
    }, f.g);
    o.series.forEach(function (s) {
      if (!isFinite(s.y[i])) return;
      K.el('circle', {
        cx: x(a), cy: y(s.y[i]), r: 4.5, fill: s.color, stroke: '#fff', 'stroke-width': 1.5
      }, f.g);
    });
    var hit = K.el('rect', { x: 0, y: 0, width: f.iw, height: f.ih, class: 'hit' }, f.g);
    function at(e) {
      var box = f.svg.getBoundingClientRect();
      var px = (e.clientX - box.left) * (f.w / box.width) - m.l;
      return Math.min(KMAX, Math.max(1, Math.round(x.invert(px) * 200)));
    }
    hit.addEventListener('mousemove', function (e) {
      var k = at(e), j = k - 1;
      var html = '<b>target ' + pctAuto(k / 200) + '</b>';
      o.series.forEach(function (s) {
        html += '<br><span class="k">' + s.name + '</span> ' + F.pct(s.y[j], 1);
      });
      K.showTip(e, html);
    });
    hit.addEventListener('mouseleave', K.hideTip);
    hit.addEventListener('click', function (e) { st.k = at(e); render(true); });
  }

  function outcomes(res) {
    var host = document.getElementById('l-o');
    K.clear(host);
    var w = Math.max(host.clientWidth || 640, 320), h = 70, top = 26, bh = 34;
    var svg = K.el('svg', { viewBox: '0 0 ' + w + ' ' + h }, host);
    var n = res.n, x0 = 0, autoEnd = 0;
    OUT.forEach(function (o, idx) {
      var c = res.outcomes[o[0]], bw = c / n * w;
      if (bw <= 0) return;
      var r = K.el('rect', {
        x: x0, y: top, width: bw, height: bh, fill: o[2], stroke: o[3], 'stroke-width': 0.8
      }, svg);
      K.hoverable(r, '<b>' + o[1] + '</b><br>' + F.int(c) + ' questions · ' + F.pct(c / n, 1));
      var lab = o[1] + ' ' + F.pct(c / n, 1);
      if (bw > lab.length * 6.8 + 14) {
        K.text(svg, x0 + 8, top + bh / 2 + 4, lab,
          { 'font-size': 12, fill: C.ink });
      }
      x0 += bw;
      if (idx < 4) autoEnd = x0;
    });
    if (autoEnd > 2) {
      K.el('path', {
        d: 'M1,' + (top - 5) + ' V' + (top - 11) + ' H' + (autoEnd - 1) + ' V' + (top - 5),
        fill: 'none', stroke: C.ink, 'stroke-width': 1
      }, svg);
      var label = 'automated ' + F.pct(res.coverage, 1);
      K.text(svg, Math.min(Math.max(autoEnd / 2, 60), w - 60), top - 15, label,
        { 'text-anchor': 'middle', 'font-size': 12, fill: C.ink });
    } else {
      K.text(svg, 0, top - 12, 'no decision automated', { 'font-size': 12, fill: C.ink3 });
    }
    document.getElementById('l-n').textContent =
      F.int(n) + ' questions on ' + D.dataset(st.deploy).label;
    document.getElementById('l-ol').innerHTML = '<div class="lg-row">' + OUT.map(function (o) {
      return '<span class="lg"><i class="sw" style="background:' + o[2] + ';border-color:' +
        o[3] + '"></i>' + o[1] + ' <b>' + F.int(res.outcomes[o[0]]) + '</b></span>';
    }).join('') + '</div>';
  }

  global.Lab = {
    mount: mount, apply: apply, resize: function () { if (lab) render(); },
    ready: function () { return !!lab && lab.model === st.model && !root.classList.contains('busy'); },
    /* for the tour: move the target without a re-layout jump */
    target: function (k) { st.k = k; render(true); }
  };
})(window);
