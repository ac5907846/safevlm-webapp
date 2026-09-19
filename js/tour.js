/* Autoplay for the two pictures of the landing view. The first plays the four qualification
   stages and carries the gate to every other site in turn; the calibration plane below lights
   one dataset after another, then the zero-shot and the fine-tuned pairs. Both start by
   themselves when the page opens on its landing view. Any click, key press or scroll anywhere
   stops both; each picture has its own Play/Pause button, and only that button resumes it. */
(function (global) {
  'use strict';

  var STOP = { stop: true }, SKIP = { skip: true };
  var landing = location.hash.replace(/^#/, '');
  var HOME = 'cs10k__test';
  var SITES = ['cs10k__test', 'chv', 'gdut', 'shwd', 'pictor', 'sh17'];
  function short(s) { return global.Data.dataset(s).short; }
  var all = [];

  function seq(list, fn) {
    return list.reduce(function (p, x, i) { return p.then(function () { return fn(x, i); }); },
      Promise.resolve());
  }

  /* one autoplay: a looping list of steps, a Play/Pause button with a progress bar, and an
     optional caption beside it */
  function create(opts) {
    var gen = 0, playing = false, idx = 0, laps = 0, started = false;
    var ui = null, cap = null, btn, bar;

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
        if ((waited += 80) > (max || 15000)) return Promise.reject(SKIP);
        return sleep(80).then(poll);
      }
      return poll();
    }
    function caption(text) { if (cap) cap.textContent = text; }
    var ctx = { sleep: sleep, until: until, caption: caption, laps: function () { return laps; } };

    function loop() {
      var g = gen, s = opts.steps[idx];
      caption(s.cap);
      progress(s);
      s.run(ctx).then(next, function (e) {
        if (e === SKIP) return next();
        if (e !== STOP && global.console) console.error(e);
        if (e !== STOP) pause();
      });
      function next() {
        if (g !== gen) return;
        if (opts.after) opts.after();
        idx = (idx + 1) % opts.steps.length;
        if (idx === 0) laps++;
        loop();
      }
    }

    function play() {
      if (playing || !ui) return;
      if (opts.resume) idx = opts.resume(idx);
      playing = true;
      gen++;
      paint();
      loop();
    }
    function pause() {
      if (!playing) return;
      playing = false;
      gen++;
      freeze();
      if (opts.after) opts.after();
      paint();
    }

    function attach(host) {
      if (!ui) {
        ui = document.createElement('div');
        ui.className = 'tour' + (opts.inline ? ' inline' : '');
        ui.innerHTML = (opts.caption === false ? '' : '<span class="tour-cap" aria-live="polite"></span>') +
          '<button type="button" class="tour-btn"><span class="tour-t">Play</span>' +
          '<i class="tour-bar"></i></button>';
        cap = ui.querySelector('.tour-cap');
        btn = ui.querySelector('.tour-btn');
        bar = ui.querySelector('.tour-bar');
        btn.addEventListener('click', function () { if (playing) pause(); else play(); });
      }
      host.appendChild(ui);
      paint();
      /* start by itself only on the landing view, not on a shared deep link */
      if (!started) {
        started = true;
        if (landing === '' || landing === 'findings') play();
      }
    }

    function paint() {
      ui.classList.toggle('on', playing);
      btn.querySelector('.tour-t').textContent = playing ? 'Pause' : 'Play';
      btn.setAttribute('aria-label', (playing ? 'Pause' : 'Play') + ' the animation of ' + opts.name);
    }

    /* the bar under the word fills across one loop; each step fills its own share in real time */
    function progress(s) {
      var total = opts.steps.reduce(function (a, x) { return a + x.ms; }, 0);
      var before = opts.steps.slice(0, idx).reduce(function (a, x) { return a + x.ms; }, 0);
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(' + (before / total) + ')';
      bar.getBoundingClientRect();
      bar.style.transition = 'transform ' + s.ms + 'ms linear';
      bar.style.transform = 'scaleX(' + ((before + s.ms) / total) + ')';
    }
    function freeze() {
      if (!bar) return;
      var now = getComputedStyle(bar).transform;
      bar.style.transition = 'none';
      bar.style.transform = now;
    }

    var inst = { attach: attach, play: play, pause: pause };
    all.push(inst);
    return inst;
  }

  /* ---------------------------------------------------------------- the landing picture */
  function H() { return global.Hero || {}; }
  function heroReady() { return !!H().ready && H().ready(); }
  function stage(s, ms) {
    return function (c) {
      return c.until(heroReady).then(function () { H().stage(s); return c.sleep(ms); });
    };
  }
  var hero = create({
    name: 'the answers picture',
    resume: function (i) { return H().state ? H().state().stage : i; },
    steps: [
      { cap: 'Q1 · every answer acted on', ms: 6 * 1900, run: function (c) {
        return c.until(heroReady).then(function () {
          return seq(SITES, function (s, i) {
            H().stage(0, s);
            if (i === 0 && c.laps() > 0) H().rain();
            c.caption('Q1 · every answer acted on · ' + short(s));
            return c.sleep(1900);
          });
        });
      } },
      { cap: 'Q2 · confidence of correct and incorrect answers', ms: 4800, run: stage(1, 4800) },
      { cap: 'Q3 · conformal threshold and deferral', ms: 5400, run: stage(2, 5400) },
      { cap: 'Q4 · the same threshold on other datasets', ms: 3400 + 4 * 1600, run: function (c) {
        return c.until(heroReady).then(function () {
          return seq(SITES.slice(1).sort(function (a, b) { return (b === 'shwd') - (a === 'shwd'); }),
            function (s) {
              H().stage(3, s);
              c.caption('Q4 · the same threshold on other datasets · ' + short(s));
              return c.sleep(s === 'shwd' ? 3400 : 1600);
            });
        });
      } }
    ]
  });

  /* ---------------------------------------------------------------- the calibration plane */
  function Fd() { return global.Findings || {}; }
  function calReady() { return !!Fd().scatterReady && Fd().scatterReady(); }
  var cal = create({
    name: 'the calibration plane',
    inline: true,
    caption: false,
    after: function () { if (Fd().spotlight) Fd().spotlight(null); },
    steps: [
      { cap: 'datasets', ms: 7 * 1500, run: function (c) {
        return c.until(calReady).then(function () {
          return seq(global.Data.store.meta.datasets, function (d) {
            Fd().spotlight(['data-k', d.key]);
            return c.sleep(1500);
          });
        });
      } },
      { cap: 'zero-shot and fine-tuned', ms: 4400, run: function (c) {
        return c.until(calReady).then(function () {
          Fd().spotlight(['data-g', 'zs']);
          return c.sleep(2200);
        }).then(function () {
          Fd().spotlight(['data-g', 'ft']);
          return c.sleep(2200);
        });
      } },
      { cap: 'all pairs', ms: 1600, run: function (c) {
        Fd().spotlight(null);
        return c.sleep(1600);
      } }
    ]
  });

  /* ---------------------------------------------------------------- hand over on any input */
  function interrupt(e) {
    if (e.target && e.target.closest && e.target.closest('.tour')) return;
    all.forEach(function (a) { a.pause(); });
  }
  document.addEventListener('pointerdown', interrupt, true);
  document.addEventListener('keydown', interrupt, true);
  window.addEventListener('wheel', interrupt, { passive: true, capture: true });
  window.addEventListener('touchstart', interrupt, { passive: true, capture: true });

  global.Tour = {
    hero: hero, cal: cal,
    pause: function () { all.forEach(function (a) { a.pause(); }); }
  };
})(window);
