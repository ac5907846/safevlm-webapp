/* Motion: numbers that count up to their value and marks that pop in. A number to animate is
   written as <span data-count="0.2986" data-fmt="pct1">29.9%</span>, so the page reads right
   before, during and after the animation, and with motion turned off it never moves. */
(function (global) {
  'use strict';

  var F = global.Fmt;
  var reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* pct1 -> F.pct(v, 1), num3 -> F.num(v, 3), times1, int */
  function fmt(name, v) {
    var m = /^([a-z]+)(\d?)$/.exec(name || 'int');
    var d = m[2] === '' ? undefined : Number(m[2]);
    return m[1] === 'int' ? F.int(v) : F[m[1]](v, d);
  }

  function span(v, name, key) {
    return '<span data-count="' + v + '" data-fmt="' + name + '"' +
      (key ? ' data-key="' + key + '"' : '') + '>' + fmt(name, v) + '</span>';
  }

  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  /* every [data-count] under root counts from data-from (or zero) to its value; with moved,
     only the ones given a data-from */
  function count(root, dur, moved) {
    if (!root) return;
    var els = [].slice.call(root.querySelectorAll(moved ? '[data-from]' : '[data-count]'));
    if (reduced || !els.length) return;
    dur = dur || 1100;
    var jobs = els.map(function (el) {
      var to = Number(el.getAttribute('data-count'));
      var from = el.hasAttribute('data-from') ? Number(el.getAttribute('data-from')) : 0;
      el.removeAttribute('data-from');
      return { el: el, to: to, from: from, f: el.getAttribute('data-fmt') };
    });
    var t0 = null, done = false;
    function paint(t) {
      var k = ease(t);
      jobs.forEach(function (j) {
        if (!j.el.isConnected) return;
        j.el.textContent = fmt(j.f, t === 1 ? j.to : j.from + (j.to - j.from) * k);
      });
    }
    function frame(ts) {
      if (done) return;
      if (t0 === null) t0 = ts;
      var t = Math.min(1, (ts - t0) / dur);
      paint(t);
      if (t < 1) requestAnimationFrame(frame); else done = true;
    }
    requestAnimationFrame(frame);
    /* frames can stall in a background tab; the final values land regardless */
    setTimeout(function () { if (!done) { done = true; paint(1); } }, dur + 250);
  }

  /* the values shown before a re-render (matched by data-key), so the new ones move from them */
  function snapshot(root) {
    var out = {};
    [].slice.call(root.querySelectorAll('[data-key]')).forEach(function (e) {
      out[e.getAttribute('data-key')] = e.getAttribute('data-count');
    });
    return out;
  }
  function carry(before, root) {
    var moved = false;
    [].slice.call(root.querySelectorAll('[data-key]')).forEach(function (e) {
      var v = before[e.getAttribute('data-key')];
      if (v !== undefined && v !== e.getAttribute('data-count')) {
        e.setAttribute('data-from', v);
        moved = true;
      }
    });
    return moved;
  }

  /* marks grow in one after another */
  function pop(nodes, step) {
    if (reduced) return;
    [].slice.call(nodes).forEach(function (n, i) {
      n.style.animationDelay = (i * (step || 22)) + 'ms';
      n.classList.add('pop');
    });
  }

  global.Motion = {
    reduced: reduced, fmt: fmt, span: span, count: count, snapshot: snapshot, carry: carry, pop: pop
  };
})(window);
