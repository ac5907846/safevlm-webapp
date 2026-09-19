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
      '<div class="card">' +
      '<div class="card-h"><span>Calibration and error discrimination</span>' +
      '<span class="muted">6 models × 7 datasets · hover for values</span></div>' +
      '<div id="f-scatter" class="chart"></div>' +
      '<div class="legend" id="f-legend"></div>' +
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

  function draw() {
    if (!cal) return;
    var h = D.store.meta.headline;
    var pts = cal.map(function (r) {
      var m = D.model(r.model), d = D.dataset(r.dataset);
      return {
        x: r.ece, y: r.auroc, color: d.color, shape: SHAPE[r.model], r: 5.4, key: r.dataset,
        tip: '<b>' + m.short + ' · ' + d.short + '</b><br>' +
          '<span class="k">AUROC</span> ' + F.num(r.auroc, 3) + '<br>' +
          '<span class="k">ECE</span> ' + F.num(r.ece, 3) + '<br>' +
          '<span class="k">accuracy</span> ' + F.pct(r.acc, 1)
      };
    });
    K.scatter(document.getElementById('f-scatter'), {
      height: 360, points: pts, xDomain: [0, 0.42], yDomain: [0.38, 0.95],
      xLabel: 'calibration error (ECE)', yLabel: 'AUROC',
      bandY: [0.45, 0.55], refY: h.probe_auroc,
      refLabel: 'hidden-state probe ' + F.num(h.probe_auroc, 2)
    });
    if (!drawn) M.pop(document.querySelectorAll('#f-scatter .mark'), 24);
    drawn = true;
    legend();
  }

  /* for the tour: show one dataset's points and fade the rest; null shows all */
  function spotlight(key) {
    document.querySelectorAll('#f-scatter .mark').forEach(function (g) {
      g.classList.toggle('dim', key !== null && g.getAttribute('data-k') !== key);
    });
    document.querySelectorAll('#f-legend .lg[data-k]').forEach(function (l) {
      l.classList.toggle('on', l.getAttribute('data-k') === key);
    });
  }

  function legend() {
    var host = document.getElementById('f-legend');
    var html = '<div class="lg-row">';
    D.store.meta.datasets.forEach(function (d) {
      html += '<span class="lg" data-k="' + d.key + '"><i class="dot" style="background:' +
        d.color + '"></i>' + d.short + '</span>';
    });
    html += '</div><div class="lg-row">';
    D.store.meta.models.forEach(function (m) {
      html += '<span class="lg"><svg width="14" height="14" viewBox="0 0 14 14" data-shape="' +
        SHAPE[m.key] + '"></svg>' + m.short + '</span>';
    });
    html += '<span class="lg"><i class="band"></i>chance</span></div>';
    host.innerHTML = html;
    host.querySelectorAll('svg[data-shape]').forEach(function (svg) {
      K.shape(svg, svg.getAttribute('data-shape'), 7, 7, 4.6, '#565b66', false);
    });
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
