/* Answers: real benchmark items and what each of the six models wrote back, verbatim, with
   its option probabilities and what the conformal gate would do with the answer. */
(function (global) {
  'use strict';

  var F = global.Fmt, D = global.Data;

  var MODELS = ['qwen25vl_7b', 'qwen25vl_3b', 'llava_ov_7b', 'internvl3_8b',
    'qwen25vl_7b_ft', 'qwen25vl_3b_ft'];
  var STORIES = [
    ['all', 'All', null],
    ['confident and wrong', 'High-confidence errors', '#d48faf'],
    ['fixed by fine-tuning', 'Corrected by fine-tuning', '#8fbf7f'],
    ['said cannot determine', 'Cannot determine', '#a6a6a6'],
    ['false alarm', 'False alarm', '#e2b3c8'],
    ['caught', 'Detected', '#7fb6c8']
  ];
  var LETTERS = 'ABCDEFG';
  var GATE_ALPHA = '0.05';

  var st = { story: 'all', dataset: 'all', qid: null };
  var root = null, items = [], lam = {}, sha = {};

  function take(p) {
    if (!p) return;
    if (p.story) st.story = p.story;
    if (p.dataset) st.dataset = p.dataset;
    if (p.qid) st.qid = p.qid;
  }

  function mount(el, params) {
    root = el;
    take(params);
    el.innerHTML =
      '<div class="note" id="a-note"></div>' +
      '<div class="filters"><div class="chips" id="a-story"></div>' +
      '<div class="chips" id="a-ds"></div></div>' +
      '<div class="answers"><div class="thumbs" id="a-grid"></div>' +
      '<div class="detail card" id="a-detail"></div></div>';
    Promise.all([D.get('items.json'), D.get('repro.json')]).then(function (r) {
      items = r[0].items;
      lam = r[0].lam;
      document.getElementById('a-note').innerHTML = '<b>' + items.length +
        ' illustrative examples.</b> The study analyzes all ' + F.int(r[0].total_answers) +
        ' stored answers to ' + F.int(D.store.meta.headline.items) + ' questions. Shown here: the ' +
        'highest-confidence cases of each outcome for Qwen2.5-VL-7B.';
      r[1].predictions.forEach(function (p) { sha[p.model + '/' + p.file] = p.sha256; });
      render();
    });
  }

  function apply(params) { take(params); render(); }

  function visible() {
    return items.filter(function (it) {
      return (st.story === 'all' || it.story === st.story) &&
        (st.dataset === 'all' || it.dataset === st.dataset);
    });
  }

  function chips(host, options, value, onPick) {
    host.innerHTML = '';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-pressed', String(o[0] === value));
      b.innerHTML = (o[2] ? '<i class="dot" style="background:' + o[2] + '"></i>' : '') + o[1];
      b.addEventListener('click', function () { onPick(o[0]); });
      host.appendChild(b);
    });
  }

  function render() {
    if (!items.length) return;
    chips(document.getElementById('a-story'), STORIES, st.story,
      function (v) { st.story = v; st.qid = null; render(); });
    var ds = [['all', 'All', null]].concat(
      ['cs10k', 'sh17'].map(function (k) { return [k, D.dataset(k).short, D.dataset(k).color]; }));
    chips(document.getElementById('a-ds'), ds, st.dataset,
      function (v) { st.dataset = v; st.qid = null; render(); });

    var list = visible();
    if (!list.some(function (it) { return it.qid === st.qid; })) st.qid = list.length ? list[0].qid : null;
    var grid = document.getElementById('a-grid');
    grid.innerHTML = list.map(function (it) {
      var col = (STORIES.filter(function (s) { return s[0] === it.story; })[0] || [])[2];
      return '<button type="button" class="thumb' + (it.qid === st.qid ? ' on' : '') +
        '" data-qid="' + it.qid + '">' +
        '<img loading="lazy" decoding="async" src="img/items/' + it.img + '_s.webp" alt="" title="' +
        D.esc(it.credit + ' · ' + it.license) + '">' +
        '<span class="stripe" style="background:' + col + '"></span>' +
        '<span class="t">' + (F.TEMPLATE_NAME[it.template] || it.template) + '</span></button>';
    }).join('') || '<p class="muted">No item.</p>';
    grid.querySelectorAll('.thumb').forEach(function (b) {
      b.addEventListener('click', function () { pick(b.getAttribute('data-qid')); });
    });
    detail();
  }

  function pick(qid) {
    var grid = document.getElementById('a-grid');
    st.qid = qid;
    grid.querySelectorAll('.thumb').forEach(function (x) {
      var on = x.getAttribute('data-qid') === qid;
      x.classList.toggle('on', on);
      /* keep the chosen thumbnail in view inside the grid, without scrolling the page */
      if (on && (x.offsetTop < grid.scrollTop || x.offsetTop + x.offsetHeight > grid.scrollTop + grid.clientHeight)) {
        grid.scrollTo({ top: x.offsetTop - 8, behavior: 'smooth' });
      }
    });
    detail();
  }

  /* for the tour: the first item of each outcome */
  function highlights() {
    return STORIES.slice(1).map(function (s) {
      return (items.filter(function (it) { return it.story === s[0]; })[0] || {}).qid;
    }).filter(Boolean);
  }

  function detail() {
    var host = document.getElementById('a-detail');
    var it = items.filter(function (x) { return x.qid === st.qid; })[0];
    if (!it) { host.innerHTML = ''; return; }
    var opts = it.options.map(function (o, i) {
      return '<span class="opt' + (i === it.gt ? ' gt' : '') + '"><b>' + LETTERS[i] + '</b> ' +
        D.esc(o.replace(' from the image', '')) + (i === it.gt ? ' <i>✓</i>' : '') + '</span>';
    }).join('');
    var rows = MODELS.map(function (m) { return row(it, m); }).join('');
    var ref = it.answers[MODELS[0]].file;
    host.innerHTML =
      '<div class="d-img"><img src="img/items/' + it.img + '.webp" alt="' + D.esc(it.question) + '"></div>' +
      '<div class="d-src"><a href="' + D.esc(it.source) + '" target="_blank" rel="noopener">' +
      D.esc(it.credit) + '</a> · <a href="' + D.esc(it.license_url) + '" target="_blank" rel="noopener">' +
      D.esc(it.license) + '</a> · resized</div>' +
      '<div class="d-q">' + D.esc(it.question) + '</div>' +
      '<div class="opts">' + opts + '</div>' +
      '<table class="ans"><thead><tr><th>Model</th><th>Verbatim output</th>' +
      '<th>' + it.options.map(function (_, i) { return LETTERS[i]; }).join(' · ') + '</th>' +
      '<th title="conformal decision rule at a 5% target">Decision at 5%</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<div class="d-file">' + D.esc(it.qid) + ' · ' + D.esc(ref.replace(MODELS[0] + '/', '')) +
      ' · sha256 ' + (sha[ref] || '').slice(0, 12) + '…</div>';
  }

  function row(it, m) {
    var a = it.answers[m];
    var conf = Math.max.apply(null, a.p);
    var answered = a.pred >= 0 && a.pred < 2;
    var l = lam[m] && lam[m].conf_tokenprob ? lam[m].conf_tokenprob[GATE_ALPHA] : null;
    var auto = answered && l !== null && conf >= l;
    var right = a.pred === it.gt;
    var gate = auto ? '<span class="pill ' + (right ? 'ok' : 'bad') + '">automated</span>'
      : '<span class="pill live">' + (answered ? 'deferred' : 'abstained') + '</span>';
    var bars = a.p.map(function (p, i) {
      return '<span class="pb' + (i === a.pred ? ' on' : '') + (i === it.gt ? ' gt' : '') +
        '" title="' + LETTERS[i] + ' ' + F.num(p, 3) + '"><i style="height:' +
        Math.max(2, Math.round(p * 100)) + '%"></i></span>';
    }).join('');
    return '<tr><td class="m">' + D.model(m).short + '</td>' +
      '<td><pre class="raw">' + D.esc(a.raw) + '</pre></td>' +
      '<td><span class="pbs">' + bars + '</span><span class="pv">' + F.num(conf, 2) + '</span></td>' +
      '<td>' + (right ? '<span class="ok-mark">✓</span>' : '<span class="bad-mark">✗</span>') +
      ' ' + gate + '</td></tr>';
  }

  global.Answers = {
    mount: mount, apply: apply, pick: pick, highlights: highlights,
    ready: function () { return items.length > 0; }
  };
})(window);
