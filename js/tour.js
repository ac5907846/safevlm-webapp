/* Tour: on arrival the app plays itself. The headline numbers count up, the calibration plane
   lights one dataset at a time, the Lab sweeps the missed-violation target and then carries the
   same threshold to new sites, the Answers tab steps through one item per outcome, and the
   Reproducibility tab recomputes every published operating point. Any click, key press or
   scroll hands the page to the visitor; the small button in the corner pauses and resumes. */
(function (global) {
  'use strict';

  var D = global.Data, M = global.Motion;
  var STOP = { stop: true }, SKIP = { skip: true };
  var landing = location.hash.replace(/^#/, '');
  var gen = 0, playing = false, idx = 0, laps = 0;
  var ui, cap, btn, ring, LEN = 2 * Math.PI * 15;

  /* ---------------------------------------------------------------- timing */
  function sleep(ms) {
    var g = gen;
    return new Promise(function (res, rej) {
      setTimeout(function () { if (g === gen && playing) res(); else rej(STOP); }, ms);
    });
  }
  function until(ok, max) {
    var waited = 0;
    function poll() {
      if (ok()) return Promise.resolve();
      if ((waited += 80) > (max || 10000)) return Promise.reject(SKIP);
      return sleep(80).then(poll);
    }
    return poll();
  }
  function seq(list, fn) {
    return list.reduce(function (p, x, i) { return p.then(function () { return fn(x, i); }); },
      Promise.resolve());
  }
  function go(tab, params) {
    var h = '#' + tab + (params ? '?' + new URLSearchParams(params).toString() : '');
    if (location.hash.split('?')[0] !== '#' + tab) location.replace(h);
  }
  function mod(name) { return global[name] || {}; }
  function isReady(name) { return function () { return !!mod(name).ready && mod(name).ready(); }; }
  function inView(el) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------------------------------------------------------------- the steps */
  var HOME = 'cs10k__test';
  var LAB = { model: 'qwen25vl_7b', signal: 'conf_tokenprob', deploy: HOME };

  /* one stage of the picture on the landing view */
  function hero(stage, site, ms) {
    return function () {
      go('findings');
      return until(isReady('Findings')).then(function () {
        mod('Findings').stage(stage, site);
        return sleep(ms);
      });
    };
  }

  var STEPS = [
    { tab: 'findings', cap: 'Q1 · every answer trusted', ms: 5600, run: function () {
      var again = isReady('Findings')();
      go('findings');
      return until(isReady('Findings')).then(function () {
        mod('Findings').stage(0, HOME);
        if (again) mod('Findings').replay();
        return sleep(5600);
      });
    } },
    { tab: 'findings', cap: 'Q2 · wrong answers are just as confident', ms: 4800, run: hero(1, null, 4800) },
    { tab: 'findings', cap: 'Q3 · the conformal gate defers the rest', ms: 5400, run: hero(2, null, 5400) },
    { tab: 'findings', cap: 'Q4 · same gate, new site', ms: 9400, run: function () {
      go('findings');
      return until(isReady('Findings')).then(function () {
        return seq([['shwd', 3400], ['chv', 1500], ['gdut', 1500], ['pictor', 1500], ['sh17', 1500]], function (s) {
          mod('Findings').stage(3, s[0]);
          return sleep(s[1]);
        });
      });
    } },
    { tab: 'findings', cap: 'Calibration and discrimination', ms: 6500, run: function () {
      go('findings');
      return until(isReady('Findings')).then(function () { return until(mod('Findings').scatterReady); })
      .then(function () {
        inView(document.getElementById('f-scatter'));
        return seq(D.store.meta.datasets, function (d) {
          mod('Findings').spotlight(d.key);
          caption('Calibration and discrimination · ' + d.short);
          return sleep(900);
        });
      });
    } },
    { tab: 'lab', cap: 'Missed-violation target, .5% to 20%', ms: 7400, run: function () {
      go('lab', Object.assign({ alpha: 0.005 }, LAB));
      return until(isReady('Lab')).then(function () {
        mod('Lab').apply(Object.assign({ alpha: '0.005' }, LAB));
        return until(isReady('Lab'));
      }).then(function () {
        var ks = [], k;
        for (k = 1; k <= 40; k++) ks.push(k);
        for (k = 39; k >= 10; k--) ks.push(k);
        return seq(ks, function (k) { mod('Lab').target(k); return sleep(k === 40 ? 600 : 70); });
      }).then(function () { return sleep(1800); });
    } },
    { tab: 'answers', cap: 'What each model answered', ms: 13000, run: function () {
      go('answers', { story: 'all', dataset: 'all' });
      return until(isReady('Answers')).then(function () {
        mod('Answers').apply({ story: 'all', dataset: 'all' });
        return seq(mod('Answers').highlights(), function (qid) {
          mod('Answers').pick(qid);
          return sleep(2600);
        });
      });
    } },
    { tab: 'repro', cap: 'Every published point, recomputed', ms: 4600, run: function () {
      var again = isReady('Repro')();
      go('repro');
      return until(isReady('Repro'), 20000).then(function () {
        if (again) mod('Repro').run();
        return sleep(700);
      }).then(function () { return until(isReady('Repro')); })
        .then(function () { return sleep(3900); });
    } }
  ];

  function cleanup() {
    if (mod('Findings').spotlight) mod('Findings').spotlight(null);
  }

  /* ---------------------------------------------------------------- the loop */
  function loop() {
    var g = gen, s = STEPS[idx];
    caption(laps === 0 && idx === 0 ? 'Auto tour · click anywhere to stop' : s.cap);
    progress(s);
    s.run().then(next, function (e) {
      if (e === SKIP) return next();
      if (e !== STOP && global.console) console.error(e);
      if (e !== STOP) pause();
    });
    function next() {
      if (g !== gen) return;
      cleanup();
      idx = (idx + 1) % STEPS.length;
      if (idx === 0) laps++;
      loop();
    }
  }

  function currentTab() { return (location.hash.replace(/^#/, '').split('?')[0]) || 'findings'; }

  function play() {
    if (playing) return;
    /* resume where the visitor is: the paused step if it is on this tab, else this tab's first */
    var tab = currentTab();
    if (STEPS[idx].tab !== tab) {
      for (var i = 0; i < STEPS.length; i++) if (STEPS[i].tab === tab) { idx = i; break; }
    }
    playing = true;
    gen++;
    paint();
    loop();
  }

  function pause() {
    if (!playing) return;
    playing = false;
    gen++;
    cleanup();
    freeze();
    paint();
  }

  /* ---------------------------------------------------------------- the button */
  function build() {
    ui = document.createElement('div');
    ui.className = 'tour';
    ui.innerHTML =
      '<span class="tour-cap" aria-live="polite"></span>' +
      '<button type="button" class="tour-btn">' +
      '<svg viewBox="0 0 36 36" aria-hidden="true">' +
      '<circle class="tr-bg" cx="18" cy="18" r="15"/>' +
      '<circle class="tr-fg" cx="18" cy="18" r="15" transform="rotate(-90 18 18)"/>' +
      '<g class="i-pause"><rect x="13.2" y="12" width="3.4" height="12" rx="1"/>' +
      '<rect x="19.4" y="12" width="3.4" height="12" rx="1"/></g>' +
      '<path class="i-play" d="M15 11.8v12.4l10-6.2z"/></svg></button>';
    document.body.appendChild(ui);
    cap = ui.querySelector('.tour-cap');
    btn = ui.querySelector('.tour-btn');
    ring = ui.querySelector('.tr-fg');
    ring.style.strokeDasharray = LEN;
    ring.style.strokeDashoffset = LEN;
    btn.addEventListener('click', function () { if (playing) pause(); else play(); });
    paint();
  }

  function paint() {
    ui.classList.toggle('on', playing);
    btn.setAttribute('aria-label', playing ? 'Pause the tour' : 'Play the tour');
    btn.title = playing ? 'Pause the tour' : 'Play the tour';
  }

  function caption(text) { if (cap) cap.textContent = text; }

  /* the ring fills across the whole tour; each step fills its own share in real time */
  function progress(s) {
    var total = STEPS.reduce(function (a, x) { return a + x.ms; }, 0);
    var before = STEPS.slice(0, idx).reduce(function (a, x) { return a + x.ms; }, 0);
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = LEN * (1 - before / total);
    ring.getBoundingClientRect();
    ring.style.transition = 'stroke-dashoffset ' + s.ms + 'ms linear';
    ring.style.strokeDashoffset = LEN * (1 - (before + s.ms) / total);
  }
  function freeze() {
    var now = getComputedStyle(ring).strokeDashoffset;
    ring.style.transition = 'none';
    ring.style.strokeDashoffset = now;
  }

  /* ---------------------------------------------------------------- hand over on any input */
  function interrupt(e) {
    if (playing && !(e.target && e.target.closest && e.target.closest('.tour'))) pause();
  }
  document.addEventListener('pointerdown', interrupt, true);
  document.addEventListener('keydown', interrupt, true);
  window.addEventListener('wheel', interrupt, { passive: true, capture: true });
  window.addEventListener('touchstart', interrupt, { passive: true, capture: true });

  document.addEventListener('app:ready', function () {
    build();
    /* play by itself only on the landing view, not on a shared deep link or with reduced motion */
    if (!M.reduced && (landing === '' || landing === 'findings')) play();
  });

  global.Tour = { play: play, pause: pause };
})(window);
