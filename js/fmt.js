/* Number and text formatting, following the project style rules:
   a share is written 17.4%, a decimal below one drops its leading zero, and a positive
   value carries no explicit plus sign. Every readout on the page goes through here so the
   app and the manuscript cannot drift apart. */
(function (global) {
  'use strict';

  var APOS = '’';

  function stripZero(s) {
    if (s.indexOf('0.') === 0) return s.slice(1);
    if (s.indexOf('-0.') === 0) return '-' + s.slice(2);
    return s;
  }

  /* .041 rather than 0.041 */
  function num(x, d) {
    if (x === null || x === undefined || isNaN(x)) return 'n/a';
    d = (d === undefined) ? 2 : d;
    return stripZero(Number(x).toFixed(d));
  }

  /* a fraction as a closed-up percentage: 17.4% */
  function pct(x, d) {
    if (x === null || x === undefined || isNaN(x)) return 'n/a';
    d = (d === undefined) ? 1 : d;
    return stripZero((Number(x) * 100).toFixed(d)) + '%';
  }

  /* a value that is already on a percentage scale */
  function pctRaw(x, d) {
    if (x === null || x === undefined || isNaN(x)) return 'n/a';
    d = (d === undefined) ? 1 : d;
    return stripZero(Number(x).toFixed(d)) + '%';
  }

  function int(x) {
    if (x === null || x === undefined || isNaN(x)) return 'n/a';
    return Math.round(Number(x)).toLocaleString('en-US');
  }

  /* 16.8x, and .9x rather than 0.9x */
  function times(x, d) {
    if (x === null || x === undefined || isNaN(x)) return 'n/a';
    d = (d === undefined) ? 1 : d;
    return stripZero(Number(x).toFixed(d)) + 'x';
  }

  function apos(s) {
    return String(s).replace(/'/g, APOS);
  }

  function titleCase(s) {
    return String(s).charAt(0).toUpperCase() + String(s).slice(1);
  }

  /* a readable name for an estimator key */
  var EST_NAME = {
    verbal: 'verbalized confidence',
    tokenprob: 'answer-token probability',
    margin: 'top-two margin',
    neg_entropy: 'negative answer entropy',
    self_consistency: 'self-consistency vote',
    neg_vote_entropy: 'predictive vote entropy',
    probe: 'hidden-state probe',
    random: 'random ordering'
  };

  var TEMPLATE_NAME = {
    ppe_helmet_all: 'helmet, all workers',
    ppe_vest_all: 'vest, all workers',
    any_violation: 'any hazard rule',
    rule1_violation: 'R1 basic PPE',
    rule2_violation: 'R2 harness at height',
    rule3_violation: 'R3 edge protection',
    rule4_violation: 'R4 excavator proximity',
    which_rule_mc: 'which rule, 5-way',
    count_no_helmet: 'count without helmet',
    count_workers: 'count workers',
    worker_present: 'worker present',
    road_fully_blocked: 'road fully blocked'
  };

  global.Fmt = {
    num: num, pct: pct, pctRaw: pctRaw, int: int, times: times,
    apos: apos, titleCase: titleCase, stripZero: stripZero,
    EST_NAME: EST_NAME, TEMPLATE_NAME: TEMPLATE_NAME, APOS: APOS
  };
})(window);
