/* Autoplay of the landing picture: it plays the four qualification stages by itself, carrying
   the gate to every other site in turn, and loops. Any click, key press or scroll hands the page
   to the visitor; the small button in the picture's corner pauses and resumes. */
(function (global) {
  'use strict';

  var M = global.Motion;
  var STOP = { stop: true }, SKIP = { skip: true };
  var landing = location.hash.replace(/^#/, '');
  var gen = 0, playing = false, idx = 0, laps = 0, started = false;
  var ui = null, cap, btn, ring;
  var HOME = 'cs10k__test';

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
  function hero() { return global.Hero || {}; }
  function ready() { return !!hero().ready && hero().ready(); }

  /* ---------------------------------------------------------------- the stages */
  function stage(s, site, ms) {
    return function () {
      return until(ready).then(function () { hero().stage(s, site); return sleep(ms); });
    };
  }
  var STEPS = [
    { cap: 'Q1 · every answer trusted', ms: 5600, run: function () {
      return until(ready).then(function () {
        hero().stage(0, HOME);
        if (laps > 0) hero().rain();
        return sleep(5600);
      });
    } },
    { cap: 'Q2 · wrong answers are just as confident', ms: 4800, run: stage(1, null, 4800) },
    { cap: 'Q3 · the conformal gate defers the rest', ms: 5400, run: stage(2, null, 5400) },
    { cap: 'Q4 · same gate, new site', ms: 9400, run: function () {
      return until(ready).then(function () {
        return seq([['shwd', 3400], ['chv', 1500], ['gdut', 1500], ['pictor', 1500], ['sh17', 1500]],
          function (s) { hero().stage(3, s[0]); return sleep(s[1]); });
      });
    } }
  ];

  /* ---------------------------------------------------------------- the loop */
  function loop() {
    var g = gen, s = STEPS[idx];
    caption(laps === 0 && idx === 0 ? 'Autoplay · click anywhere to stop' : s.cap);
    progress(s);
    s.run().then(next, function (e) {
      if (e === SKIP) return next();
      if (e !== STOP && global.console) console.error(e);
      if (e !== STOP) pause();
    });
    function next() {
      if (g !== gen) return;
      idx = (idx + 1) % STEPS.length;
      if (idx === 0) laps++;
      loop();
    }
  }

  function play() {
    if (playing || !ui) return;
    /* resume from the stage on screen */
    var now = hero().state ? hero().state().stage : 0;
    if (now !== idx) idx = now;
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
    paint();
  }

  /* ---------------------------------------------------------------- the button, in the picture */
  function attach(host) {
    if (!ui) {
      ui = document.createElement('div');
      ui.className = 'tour';
      ui.innerHTML =
        '<span class="tour-cap" aria-live="polite"></span>' +
        '<button type="button" class="tour-btn"><span class="tour-t">Play</span>' +
        '<i class="tour-bar"></i></button>';
      cap = ui.querySelector('.tour-cap');
      btn = ui.querySelector('.tour-btn');
      ring = ui.querySelector('.tour-bar');
      btn.addEventListener('click', function () { if (playing) pause(); else play(); });
    }
    host.appendChild(ui);
    paint();
    /* play by itself only on the landing view, not on a shared deep link or with reduced motion */
    if (!started) {
      started = true;
      if (!M.reduced && (landing === '' || landing === 'findings')) play();
    }
  }

  function paint() {
    ui.classList.toggle('on', playing);
    btn.querySelector('.tour-t').textContent = playing ? 'Pause' : 'Play';
    btn.setAttribute('aria-label', playing ? 'Pause the animation' : 'Play the animation');
  }

  function caption(text) { if (cap) cap.textContent = text; }

  /* the bar under the word fills across one loop; each stage fills its own share in real time */
  function progress(s) {
    var total = STEPS.reduce(function (a, x) { return a + x.ms; }, 0);
    var before = STEPS.slice(0, idx).reduce(function (a, x) { return a + x.ms; }, 0);
    ring.style.transition = 'none';
    ring.style.transform = 'scaleX(' + (before / total) + ')';
    ring.getBoundingClientRect();
    ring.style.transition = 'transform ' + s.ms + 'ms linear';
    ring.style.transform = 'scaleX(' + ((before + s.ms) / total) + ')';
  }
  function freeze() {
    var now = getComputedStyle(ring).transform;
    ring.style.transition = 'none';
    ring.style.transform = now;
  }

  /* ---------------------------------------------------------------- hand over on any input */
  function interrupt(e) {
    if (playing && !(e.target && e.target.closest && e.target.closest('.tour'))) pause();
  }
  document.addEventListener('pointerdown', interrupt, true);
  document.addEventListener('keydown', interrupt, true);
  window.addEventListener('wheel', interrupt, { passive: true, capture: true });
  window.addEventListener('touchstart', interrupt, { passive: true, capture: true });

  global.Tour = { attach: attach, play: play, pause: pause };
})(window);
