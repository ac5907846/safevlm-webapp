/* Reproducibility: the paper's conformal results recomputed live from the frozen answers, the
   manuscript audit, the SHA-256 fingerprints of every frozen file, the pinned model revisions and
   the measured compute behind them. */
(function (global) {
  'use strict';

  var F = global.Fmt, D = global.Data, R = global.CRC, M = global.Motion;

  var MODELS = ['qwen25vl_7b', 'qwen25vl_3b', 'llava_ov_7b', 'internvl3_8b',
    'qwen25vl_7b_ft', 'qwen25vl_3b_ft'];
  var rep = null;

  function mount(root) {
    root.innerHTML =
      '<div class="card rep-hero">' +
      '<div class="rep-left">' +
      '<div class="rep-k" id="r-all">…</div>' +
      '<div class="rep-l">published operating points recomputed in this browser</div>' +
      '<button type="button" class="btn" id="r-run">Recompute</button>' +
      '<div class="muted" id="r-time"></div>' +
      '</div>' +
      '<div class="rep-right">' +
      '<div class="card-h"><span>Table 5, live</span><span class="muted">5% target · CS10k test</span></div>' +
      '<table class="data" id="r-t5"></table>' +
      '</div></div>' +
      '<div class="grid3">' +
      '<div class="card stat"><div class="stat-k" id="r-audit-k">…</div>' +
      '<div class="stat-l">numerical values in the article traced to result files</div>' +
      '<div class="stat-s" id="r-audit-s"></div>' +
      '<details><summary>checks</summary><ul class="checks" id="r-checks"></ul></details></div>' +
      '<div class="card stat"><div class="stat-k" id="r-fp-k">…</div>' +
      '<div class="stat-l">archived files with SHA-256 fingerprints</div>' +
      '<div class="stat-s" id="r-fp-s"></div>' +
      '<details><summary>fingerprints</summary><div class="fp" id="r-fp"></div></details></div>' +
      '<div class="card stat"><div class="stat-k" id="r-gpu-k">…</div>' +
      '<div class="stat-l">GPU hours of inference and fine-tuning</div>' +
      '<div class="stat-s" id="r-gpu-s"></div>' +
      '<details><summary>by model</summary><div class="fp" id="r-gpu"></div></details></div>' +
      '</div>' +
      '<div class="card"><div class="card-h"><span>Pinned models</span>' +
      '<span class="muted">exact Hugging Face revisions</span></div>' +
      '<div class="scroll"><table class="data" id="r-models"></table></div></div>' +
      '<div class="grid2">' +
      '<div class="card"><div class="card-h"><span>Prompt</span><span class="muted" id="r-dec"></span></div>' +
      '<pre class="mono" id="r-prompt"></pre></div>' +
      '<div class="card"><div class="card-h"><span>Environment</span></div>' +
      '<div class="tags" id="r-env"></div>' +
      '<div class="card-h second"><span>Availability</span></div>' +
      '<div class="policy" id="r-policy"></div></div>' +
      '</div>';
    document.getElementById('r-run').addEventListener('click', run);
    D.get('repro.json').then(function (j) { rep = j; fill(); run(); });
  }

  /* ---------------------------------------------------------------- live recomputation */
  function run() {
    var btn = document.getElementById('r-run');
    btn.disabled = true;
    document.getElementById('r-all').textContent = '…';
    Promise.all(MODELS.map(function (m) { return D.get('lab/' + m + '.json'); })).then(function (labs) {
      var t0 = performance.now(), ok = 0, total = 0, rows = [], cells = 0, good = 0;
      labs.forEach(function (lab) {
        var r = R.checkAll(lab);
        ok += r[0];
        total += r[1];
        var p = lab.paper.conf_tokenprob['0.05'].cs10k__test;
        var res = R.evaluate(lab.sets.cs10k__test, 'conf_tokenprob',
          R.fit(R.prepare(lab.sets.cs10k__calib, 'conf_tokenprob'), 0.05));
        var live = [res.lam, res.coverage, res.fnr, res.fnrNone];
        var marks = live.map(function (v, i) { return Math.abs(v - p[i]) <= 1e-12; });
        marks.forEach(function (m) { cells++; if (m) good++; });
        rows.push({ model: lab.model, live: live, paper: p, marks: marks });
      });
      var ms = performance.now() - t0;
      var all = document.getElementById('r-all');
      all.innerHTML = M.span(ok, 'int') + '<span class="of">/' + F.int(total) + '</span>' +
        (ok === total ? '<span class="tick-big">✓</span>' : '');
      all.classList.toggle('bad', ok !== total);
      M.count(all, 1300);
      document.getElementById('r-time').textContent =
        good + '/' + cells + ' Table 5 cells · ' + (ms < 1 ? '<1' : ms.toFixed(0)) + ' ms';
      table5(rows);
      btn.disabled = false;
    });
  }

  function table5(rows) {
    var fmt = [
      function (v) { return F.num(v, 3); }, function (v) { return F.pct(v, 1); },
      function (v) { return F.pct(v, 1); }, function (v) { return F.pct(v, 1); }
    ];
    var head = '<thead><tr><th>Model</th><th class="lc">λ</th><th>Automated</th><th>Missed</th>' +
      '<th>No deferral</th></tr></thead>';
    var body = rows.map(function (r) {
      return '<tr><td>' + D.model(r.model).short + '</td>' + r.live.map(function (v, i) {
        return '<td class="num" title="paper ' + fmt[i](r.paper[i]) + '">' + fmt[i](v) +
          (r.marks[i] ? ' <span class="ok-mark">✓</span>' : ' <span class="bad-mark">✗</span>') + '</td>';
      }).join('') + '</tr>';
    }).join('');
    document.getElementById('r-t5').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  /* ---------------------------------------------------------------- static evidence */
  function fill() {
    var a = rep.audit;
    if (a) {
      document.getElementById('r-audit-k').innerHTML = M.span(a.numbers_traced, 'int');
      document.getElementById('r-audit-s').innerHTML = a.checks.length + ' checks · ' +
        (a.issues ? '<b class="bad-mark">' + a.issues + ' issues</b>' : '<b class="ok-mark">0 issues</b>');
      document.getElementById('r-checks').innerHTML = a.checks.map(function (c) {
        return '<li class="' + (c.ok ? 'ok' : 'bad') + '">' +
          D.esc(c.text.replace(/^\[[A-Z]\]\s*/, '')) + '</li>';
      }).join('');
    }

    var preds = rep.predictions, bench = rep.benchmark;
    var answers = preds.reduce(function (s, p) { return s + p.rows; }, 0);
    var adapters = rep.models.filter(function (m) { return m.adapter; });
    document.getElementById('r-fp-k').innerHTML = M.span(preds.length + bench.length + adapters.length, 'int');
    document.getElementById('r-fp-s').textContent = F.int(answers) + ' answers · ' + bench.length +
      ' benchmark files · ' + adapters.length + ' adapters';
    var fp = '<table class="data mini"><tbody>';
    preds.forEach(function (p) {
      fp += row(D.model(p.model).short + ' / ' + p.file, F.int(p.rows), p.sha256);
    });
    bench.forEach(function (b) { fp += row('benchmark / ' + b.file, F.int(b.rows), b.sha256); });
    adapters.forEach(function (m) {
      fp += row(D.model(m.key).short + ' / adapter', F.num(m.adapter.megabytes, 0) + ' MB', m.adapter.sha256);
    });
    document.getElementById('r-fp').innerHTML = fp + '</tbody></table>';

    var inf = Object.keys(rep.gpu_hours).reduce(function (s, k) { return s + rep.gpu_hours[k]; }, 0);
    var ft = adapters.reduce(function (s, m) { return s + m.adapter.gpu_hours; }, 0);
    document.getElementById('r-gpu-k').innerHTML = M.span(inf + ft, 'num0');
    M.count(document.querySelector('#repro .grid3'), 1300);
    document.getElementById('r-gpu-s').textContent = F.num(inf, 0) + ' inference · ' +
      F.num(ft, 0) + ' fine-tuning · ' + rep.hardware;
    document.getElementById('r-gpu').innerHTML = '<table class="data mini"><tbody>' +
      MODELS.map(function (m) {
        var ad = rep.models.filter(function (x) { return x.key === m; })[0].adapter;
        return '<tr><td>' + D.model(m).short + '</td><td class="num">' +
          F.num(rep.gpu_hours[m], 1) + ' h' + (ad ? ' + ' + F.num(ad.gpu_hours, 1) + ' h tuning' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table>';

    var mt = '<thead><tr><th>Model</th><th>Hugging Face</th><th>Revision</th><th>Weights</th>' +
      '<th>Images</th><th>Adapter</th></tr></thead><tbody>';
    rep.models.forEach(function (m) {
      var ad = m.adapter;
      mt += '<tr><td>' + D.model(m.key).short + '</td>' +
        '<td class="mono-s">' + D.esc(m.hf_id) + '</td>' +
        '<td class="mono-s">' + (m.revision
          ? '<a href="https://huggingface.co/' + m.hf_id + '/tree/' + m.revision +
            '" target="_blank" rel="noopener">' + m.revision.slice(0, 10) + '</a>' : 'n/a') + '</td>' +
        '<td>' + (m.quant === 'none' ? m.dtype : m.quant + ' 4-bit') + '</td>' +
        '<td class="mono-s">' + D.esc(m.image_budget || '') + '</td>' +
        '<td>' + (ad ? 'QLoRA r ' + ad.rank + ' · ' + F.int(ad.steps) + ' steps · ' +
          F.int(ad.n_train) + ' images' : '') + '</td></tr>';
    });
    document.getElementById('r-models').innerHTML = mt + '</tbody>';

    document.getElementById('r-prompt').textContent = rep.prompt;
    document.getElementById('r-dec').textContent = 'greedy decoding · seed ' + rep.seed;
    document.getElementById('r-env').innerHTML = Object.keys(rep.environment).map(function (k) {
      return '<span class="tag">' + D.esc(k) + ' <b>' + D.esc(rep.environment[k]) + '</b></span>';
    }).join('');
    var rel = rep.release;
    document.getElementById('r-policy').innerHTML =
      '<div><span class="k">Code</span> ' + (rel.code
        ? '<a href="' + rel.code + '" target="_blank" rel="noopener">' + D.esc(rel.code) + '</a>'
        : 'released with the article') + '</div>' +
      '<div><span class="k">Stored predictions, hidden states, adapters</span> from the authors on ' +
      'reasonable request; the fingerprints above identify the exact files</div>' +
      (rel.doi ? '<div><span class="k">Archive</span> <a href="https://doi.org/' + rel.doi +
        '" target="_blank" rel="noopener">' + D.esc(rel.doi) + '</a></div>' : '');
  }

  function row(name, n, hash) {
    return '<tr><td class="mono-s">' + D.esc(name) + '</td><td class="num">' + n + '</td>' +
      '<td class="mono-s hash" title="' + hash + '">' + hash.slice(0, 16) + '…</td></tr>';
  }

  global.Repro = {
    mount: mount, run: run,
    ready: function () { var b = document.getElementById('r-run'); return !!rep && !!b && !b.disabled; }
  };
})(window);
