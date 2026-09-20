/* Tab router. Each tab is its own view with its own address (#findings, #lab, #answers,
   #repro, optionally with ?key=value settings), so a view can be linked and the back button
   works. A tab builds itself the first time it is opened. */
(function () {
  'use strict';

  var TABS = ['findings', 'lab', 'answers', 'repro'];
  var NAME = { findings: 'Findings', lab: 'Lab', answers: 'Answers', repro: 'Data and Models' };
  var mods = { findings: window.Findings, lab: window.Lab, answers: window.Answers, repro: window.Repro };
  var mounted = {};
  var current = null;

  function parse() {
    var h = location.hash.replace(/^#/, '');
    var i = h.indexOf('?');
    var name = i < 0 ? h : h.slice(0, i);
    var params = {};
    if (i >= 0) {
      new URLSearchParams(h.slice(i + 1)).forEach(function (v, k) { params[k] = v; });
    }
    return { name: TABS.indexOf(name) >= 0 ? name : 'findings', params: params };
  }

  function show() {
    var r = parse();
    TABS.forEach(function (t) {
      var on = t === r.name;
      document.getElementById('p-' + t).hidden = !on;
      var b = document.getElementById('tab-' + t);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    var root = document.getElementById('p-' + r.name);
    if (!mounted[r.name]) {
      mounted[r.name] = true;
      mods[r.name].mount(root, r.params);
    } else if (mods[r.name].apply) {
      mods[r.name].apply(r.params);
    } else if (mods[r.name].resize) {
      mods[r.name].resize();
    }
    if (current !== r.name) window.scrollTo(0, 0);
    current = r.name;
    document.title = (r.name === 'findings' ? '' : NAME[r.name] + ' · ') + 'Qualifying VLMs as Construction Safety Inspectors';
  }

  var tablist = document.querySelector('.tabs');
  tablist.addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]');
    if (!b) return;
    var t = b.getAttribute('data-tab');
    if (location.hash.replace(/^#/, '').split('?')[0] === t) show();
    else location.hash = t;
  });
  tablist.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var i = TABS.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1);
    var t = TABS[(i + TABS.length) % TABS.length];
    location.hash = t;
    document.getElementById('tab-' + t).focus();
  });

  var timer = null;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (current && mods[current].resize) mods[current].resize();
    }, 150);
  });

  window.addEventListener('hashchange', show);
  window.Data.boot().then(function () {
    show();
    document.dispatchEvent(new Event('app:ready'));
  }).catch(function (err) {
    document.querySelector('main').innerHTML =
      '<p class="error">Could not load the data: ' + window.Data.esc(err.message) + '</p>';
  });
})();
