/* Conformal risk control on the missed-violation loss, the same procedure as analysis 05 of
   the paper, run in the browser on the frozen answers. It is written to reproduce the Python
   bit for bit: the same candidate thresholds, the same bound, the same order of floating-point
   operations. A set is { conf, verbal, pos, pred } with pos "1" for a real violation and pred
   "0" for an answer of safe, "1" for unsafe, "2" for cannot determine. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CRC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PAPER_ALPHAS = [0.01, 0.02, 0.05, 0.1, 0.15, 0.2];

  function confOf(set, signal) {
    if (signal === 'conf_verbal') {
      return set.verbal.map(function (v) { return v === null ? 0.5 : v / 100; });
    }
    return set.conf;
  }

  function lowerBound(sorted, v) {
    var lo = 0, hi = sorted.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  /* everything the threshold search needs, prepared once per calibration set and signal */
  function prepare(calib, signal) {
    var c = confOf(calib, signal);
    var cand = [0.0, 1.01], missed = [], npos = 0;
    for (var i = 0; i < c.length; i++) {
      cand.push(c[i]);
      if (calib.pos[i] === '1') {
        npos++;
        if (calib.pred[i] === '0') missed.push(c[i]);
      }
    }
    cand.sort(function (a, b) { return a - b; });
    var uniq = [];
    for (var j = 0; j < cand.length; j++) {
      if (j === 0 || cand[j] !== cand[j - 1]) uniq.push(cand[j]);
    }
    missed.sort(function (a, b) { return a - b; });
    return { cand: uniq, missed: missed, npos: npos };
  }

  /* the smallest threshold whose conformal bound (n/(n+1)) * miss + 1/(n+1) meets the target */
  function fit(prep, alpha) {
    var n = prep.npos;
    for (var i = 0; i < prep.cand.length; i++) {
      var lam = prep.cand[i];
      var k = prep.missed.length - lowerBound(prep.missed, lam);
      var miss = n ? k / n : 0.0;
      if ((n / (n + 1)) * miss + 1 / (n + 1) <= alpha) return lam;
    }
    return 1.01;
  }

  /* apply a threshold: an answer is automated when it is a yes or a no at or above it */
  function evaluate(set, signal, lam) {
    var c = confOf(set, signal), n = c.length;
    var o = { caught: 0, missed: 0, falseAlarm: 0, clear: 0, held: 0, abstain: 0 };
    var auto = 0, answered = 0, npos = 0, missAll = 0;
    for (var i = 0; i < n; i++) {
      var pos = set.pos[i] === '1', pred = set.pred[i];
      var ans = pred !== '2';
      var a = ans && c[i] >= lam;
      if (ans) answered++;
      if (a) auto++;
      if (pos) { npos++; if (pred === '0') missAll++; }
      if (!ans) o.abstain++;
      else if (!a) o.held++;
      else if (pos && pred === '0') o.missed++;
      else if (pos) o.caught++;
      else if (pred === '1') o.falseAlarm++;
      else o.clear++;
    }
    return {
      n: n, npos: npos, lam: lam, outcomes: o,
      coverage: auto / n,
      fnr: npos ? o.missed / npos : NaN,
      fnrNone: npos ? missAll / npos : NaN,
      answered: answered / n
    };
  }

  /* compare a live result with the published row [lam, coverage, fnr, fnrNone, answered, ...] */
  function matches(live, paper, tol) {
    tol = tol === undefined ? 1e-12 : tol;
    var got = [live.lam, live.coverage, live.fnr, live.fnrNone, live.answered];
    for (var i = 0; i < 5; i++) {
      if (!(Math.abs(got[i] - paper[i]) <= tol)) return false;
    }
    return true;
  }

  /* every published operating point in one lab file, recomputed: [matched, total] */
  function checkAll(lab) {
    var ok = 0, total = 0, preps = {};
    Object.keys(lab.paper).forEach(function (signal) {
      preps[signal] = prepare(lab.sets.cs10k__calib, signal);
      Object.keys(lab.paper[signal]).forEach(function (a) {
        var lam = fit(preps[signal], Number(a));
        Object.keys(lab.paper[signal][a]).forEach(function (tag) {
          total++;
          if (matches(evaluate(lab.sets[tag], signal, lam), lab.paper[signal][a][tag])) ok++;
        });
      });
    });
    return [ok, total];
  }

  /* confidences packed as three-byte integers of millionths (data/hero.json); the division
     gives exactly the double that parsing the six-decimal text would */
  function unpack(b64, n) {
    var s = atob(b64), out = new Array(n);
    for (var i = 0; i < n; i++) {
      out[i] = ((s.charCodeAt(3 * i) << 16) | (s.charCodeAt(3 * i + 1) << 8) | s.charCodeAt(3 * i + 2)) / 1e6;
    }
    return out;
  }

  return {
    PAPER_ALPHAS: PAPER_ALPHAS, confOf: confOf, prepare: prepare, fit: fit,
    evaluate: evaluate, matches: matches, checkAll: checkAll, unpack: unpack
  };
});
