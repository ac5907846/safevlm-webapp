/* Findings: the four steps of machine inspector qualification, one measured number each, and
   the calibration-discrimination plane of every model and dataset. */
(function (global) {
  'use strict';

  var F = global.Fmt, D = global.Data, K = global.Charts, M = global.Motion;

  var SHAPE = {
    qwen25vl_7b: 'circle', qwen25vl_3b: 'square', llava_ov_7b: 'triangle',
    internvl3_8b: 'diamond', qwen25vl_7b_ft: 'plus', qwen25vl_3b_ft: 'cross'
  };
  var cal = null, drawn = false, host = null;

  /* the four qualification questions, each a button that sets the stage of the picture above */
  function tile(i, code, title, value, label) {
    return '<button type="button" class="q" data-stage="' + i + '">' +
      '<div class="q-top"><span class="q-code">' + code + '</span>' +
      '<span class="q-title">' + title + '</span></div>' +
      '<div class="q-val">' + value + '</div>' +
      '<div class="q-lab">' + label + '</div></button>';
  }

  function mount(root) {
    host = root;
    var h = D.store.meta.headline;
    var shift = D.dataset(h.shift_dataset).short;
    root.innerHTML =
      '<div class="kicker">' + M.span(h.items, 'int') + ' questions · ' + h.datasets +
      ' public datasets · ' + h.models + ' open VLMs</div>' +
      '<div class="card hero" id="f-hero"></div>' +
      '<div class="miq" id="f-miq">' +
      tile(0, 'Q1', 'Detection reliability', M.span(h.crc_fnr_none, 'pct1'),
        'of violations missed without deferral') +
      tile(1, 'Q2', 'Self-knowledge',
        M.span(h.token_auroc, 'num3') + ' <span class="arrow">→</span> ' + M.span(h.probe_auroc, 'num3'),
        'error-detection AUROC: output confidence → hidden-state probe') +
      tile(2, 'Q3', 'Bounded delegation', M.span(h.crc_coverage, 'pct1'),
        'of decisions automated, ' + F.pct(h.crc_fnr_auto, 1) + ' of violations missed') +
      tile(3, 'Q4', 'Requalification', M.span(h.shift_factor, 'times1'),
        'the missed-violation rate on ' + shift + ', threshold unchanged') +
      '</div>' +
      '<div class="card cal">' +
      '<div class="card-h"><span>Calibration and error discrimination</span>' +
      '<span class="muted">all 42 model × dataset pairs · hover a point, click the key</span></div>' +
      '<div class="cal-b"><div id="f-scatter" class="chart cal-chart"></div>' +
      '<div class="cal-side" id="f-legend"></div></div>' +
      '</div>';
    M.count(root.querySelector('.kicker'));
    M.count(document.getElementById('f-miq'));
    var tiles = [].slice.call(root.querySelectorAll('#f-miq .q'));
    tiles.forEach(function (b) {
      b.addEventListener('click', function () { global.Hero.stage(Number(b.getAttribute('data-stage'))); });
    });
    global.Hero.mount(document.getElementById('f-hero'), function (s) {
      tiles.forEach(function (b, i) {
        b.classList.toggle('on', i === s);
        b.setAttribute('aria-pressed', String(i === s));
      });
    });
    D.get('calibration.json').then(function (rows) { cal = rows; draw(); });
  }

  function tuned(model) { return /_ft$/.test(model); }

  function draw() {
    if (!cal) return;
    var h = D.store.meta.headline;
    var pts = cal.map(function (r) {
      var m = D.model(r.model), d = D.dataset(r.dataset);
      return {
        x: r.ece, y: r.auroc, color: d.color, shape: SHAPE[r.model], r: 5, key: r.dataset,
        tip: '<b>' + m.short + ' · ' + d.short + '</b><br>' +
          '<span class="k">AUROC</span> ' + F.num(r.auroc, 3) + '<br>' +
          '<span class="k">ECE</span> ' + F.num(r.ece, 3) + '<br>' +
          '<span class="k">accuracy</span> ' + F.pct(r.acc, 1)
      };
    });
    /* calibration error on a log scale: most pairs sit below .1 and would crowd a linear axis */
    var f = K.scatter(document.getElementById('f-scatter'), {
      height: 290, points: pts, logX: true, xDomain: [0.014, 0.45], yDomain: [0.4, 0.95],
      xTicks: [0.02, 0.05, 0.1, 0.2, 0.4], margin: { t: 8, r: 10, b: 40, l: 46 },
      xLabel: 'calibration error (ECE, log scale)', yLabel: 'AUROC',
      bandY: [0.45, 0.55], refY: h.probe_auroc,
      refLabel: 'hidden-state probe ' + F.num(h.probe_auroc, 3)
    });
    /* each mark also knows its model and whether that model was fine-tuned */
    f.svg.querySelectorAll('.mark').forEach(function (g, i) {
      g.setAttribute('data-m', cal[i].model);
      g.setAttribute('data-g', tuned(cal[i].model) ? 'ft' : 'zs');
    });
    if (!drawn) M.pop(document.querySelectorAll('#f-scatter .mark'), 24);
    drawn = true;
    side(h.probe_auroc);
  }

  /* show one group of points and fade the rest: a dataset key (the tour), or [attribute, value];
     null shows all */
  var lit = null;
  function spotlight(sel) {
    if (typeof sel === 'string') sel = ['data-k', sel];
    lit = sel;
    document.querySelectorAll('#f-scatter .mark').forEach(function (g) {
      g.classList.toggle('dim', !!sel && g.getAttribute(sel[0]) !== sel[1]);
    });
    document.querySelectorAll('#f-legend .lg').forEach(function (l) {
      l.classList.toggle('on', !!sel && l.getAttribute('data-a') === sel[0] && l.getAttribute('data-v') === sel[1]);
    });
  }

  function side(probe) {
    var zs = cal.filter(function (r) { return !tuned(r.model); });
    var ft = cal.filter(function (r) { return tuned(r.model); });
    function above(rows) { return rows.filter(function (r) { return r.auroc > probe; }).length; }
    function item(attr, v, swatch, label) {
      return '<button type="button" class="lg" data-a="' + attr + '" data-v="' + v + '">' + swatch + label + '</button>';
    }
    var html = '<div class="cal-k">above the probe line</div><div class="lg-grid one">' +
      item('data-g', 'zs', '<b>' + above(zs) + '</b>', 'of ' + zs.length + ' zero-shot pairs') +
      item('data-g', 'ft', '<b>' + above(ft) + '</b>', 'of ' + ft.length + ' fine-tuned pairs') + '</div>';
    html += '<div class="cal-k">dataset</div><div class="lg-grid">';
    D.store.meta.datasets.forEach(function (d) {
      html += item('data-k', d.key, '<i class="dot" style="background:' + d.color + '"></i>', d.short);
    });
    html += '</div><div class="cal-k">model</div><div class="lg-grid">';
    D.store.meta.models.forEach(function (m) {
      html += item('data-m', m.key, '<svg width="14" height="14" viewBox="0 0 14 14" data-shape="' +
        SHAPE[m.key] + '"></svg>', m.short);
    });
    html += '</div>';
    var host = document.getElementById('f-legend');
    host.innerHTML = html;
    host.querySelectorAll('svg[data-shape]').forEach(function (svg) {
      K.shape(svg, svg.getAttribute('data-shape'), 7, 7, 4.6, '#565b66', false);
    });
    host.querySelectorAll('.lg').forEach(function (b) {
      b.addEventListener('click', function () {
        var sel = [b.getAttribute('data-a'), b.getAttribute('data-v')];
        spotlight(lit && lit[0] === sel[0] && lit[1] === sel[1] ? null : sel);
      });
    });
    if (lit) spotlight(lit);
  }

  global.Findings = {
    mount: mount, spotlight: spotlight,
    resize: function () { global.Hero.resize(); draw(); },
    ready: function () { return global.Hero.ready(); },
    scatterReady: function () { return !!document.querySelector('#f-scatter .mark'); },
    replay: function () { M.count(document.getElementById('f-miq')); global.Hero.rain(); },
    stage: function (s, site) { global.Hero.stage(s, site); }
  };
})(window);
