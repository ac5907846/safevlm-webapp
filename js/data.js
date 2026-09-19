/* Loads JSON on demand and only once. The first paint needs meta.json alone; every other file
   is fetched by the tab that uses it, the first time that tab opens. */
(function (global) {
  'use strict';

  var cache = {};
  var store = {};

  function get(path) {
    if (!cache[path]) {
      cache[path] = fetch('data/' + path).then(function (res) {
        if (!res.ok) throw new Error(path + ' returned ' + res.status);
        return res.json();
      });
    }
    return cache[path];
  }

  function boot() {
    return get('meta.json').then(function (m) {
      store.meta = m;
      store.modelByKey = {};
      store.datasetByKey = {};
      m.models.forEach(function (x) { store.modelByKey[x.key] = x; });
      m.datasets.forEach(function (x) { store.datasetByKey[x.key] = x; });
      return store;
    });
  }

  function model(key) {
    return store.modelByKey[key] || { key: key, short: key, label: key };
  }

  /* a dataset key or an evaluation tag such as cs10k__test */
  function dataset(key) {
    var k = String(key).split('__')[0];
    return store.datasetByKey[k] || { key: k, short: k, label: k, color: '#9aa1ad' };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  global.Data = { get: get, boot: boot, store: store, model: model, dataset: dataset, esc: esc };
})(window);
