/* Small SVG chart toolkit. No dependencies, no build step: the page is a set of static
   files that Cloudflare can serve as they are. Every chart is interactive, which is the
   point of the app; the paper already has the static versions. */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var F = global.Fmt;

  var C = {
    navy: '#1b2a49', pink: '#b8236b', green: '#1f5f3f', gold: '#c9a227',
    teal: '#1d6f7a', burgundy: '#7a1f3d', slate: '#9aa1ad', charcoal: '#3b3b3b',
    ink: '#16181d', ink2: '#565b66', ink3: '#868c98',
    rule: '#e2e5ea', rule2: '#f0f2f5', tint: '#eef1f6'
  };

  /* ---------------------------------------------------------------- primitives */
  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
      });
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  function text(parent, x, y, s, attrs) {
    var t = el('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = s;
    return t;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function frame(container, height, margin) {
    clear(container);
    var w = Math.max(container.clientWidth || 640, 320);
    var h = height;
    var svg = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'presentation'
    }, container);
    var g = el('g', { transform: 'translate(' + margin.l + ',' + margin.t + ')' }, svg);
    return {
      svg: svg, g: g, w: w, h: h,
      iw: w - margin.l - margin.r,
      ih: h - margin.t - margin.b,
      m: margin
    };
  }

  function linear(d0, d1, r0, r1) {
    var s = function (v) {
      if (d1 === d0) return r0;
      return r0 + (v - d0) / (d1 - d0) * (r1 - r0);
    };
    s.invert = function (p) { return d0 + (p - r0) / (r1 - r0) * (d1 - d0); };
    s.domain = [d0, d1];
    s.range = [r0, r1];
    return s;
  }

  function log(d0, d1, r0, r1) {
    var l0 = Math.log10(d0), l1 = Math.log10(d1);
    var s = function (v) { return r0 + (Math.log10(v) - l0) / (l1 - l0) * (r1 - r0); };
    s.invert = function (p) { return Math.pow(10, l0 + (p - r0) / (r1 - r0) * (l1 - l0)); };
    s.domain = [d0, d1];
    s.range = [r0, r1];
    return s;
  }

  function band(keys, r0, r1, pad) {
    pad = pad === undefined ? 0.12 : pad;
    var step = (r1 - r0) / keys.length;
    var bw = step * (1 - pad);
    var idx = {};
    keys.forEach(function (k, i) { idx[k] = r0 + i * step + (step - bw) / 2; });
    var s = function (k) { return idx[k]; };
    s.bandwidth = bw;
    s.step = step;
    s.center = function (k) { return idx[k] + bw / 2; };
    return s;
  }

  function ticks(d0, d1, count) {
    var span = d1 - d0;
    if (span <= 0) return [d0];
    var raw = span / (count || 5);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
    var out = [];
    for (var v = Math.ceil(d0 / step) * step; v <= d1 + step * 1e-9; v += step) {
      out.push(Math.abs(v) < 1e-12 ? 0 : v);
    }
    return out;
  }

  /* ---------------------------------------------------------------- tooltip */
  var tipEl = null;
  function tip() {
    if (!tipEl) tipEl = document.getElementById('tip');
    return tipEl;
  }
  function showTip(evt, html) {
    var t = tip();
    t.innerHTML = html;
    t.classList.add('on');
    var pad = 12;
    var x = Math.min(Math.max(evt.clientX, 110), window.innerWidth - 110);
    var y = Math.max(evt.clientY - pad, 60);
    t.style.left = x + 'px';
    t.style.top = y + 'px';
  }
  function hideTip() { tip().classList.remove('on'); }

  function hoverable(node, html, onClick) {
    node.addEventListener('mousemove', function (e) { showTip(e, html); });
    node.addEventListener('mouseleave', hideTip);
    if (onClick) {
      node.style.cursor = 'pointer';
      node.addEventListener('click', onClick);
      node.setAttribute('tabindex', '0');
      node.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); }
      });
    }
  }

  /* ---------------------------------------------------------------- axes */
  function axisX(g, scale, y, opts) {
    opts = opts || {};
    var ax = el('g', { class: 'axis' }, g);
    el('line', { x1: scale.range[0], x2: scale.range[1], y1: y, y2: y }, ax);
    (opts.values || ticks(scale.domain[0], scale.domain[1], opts.count || 5))
      .forEach(function (v) {
        var x = scale(v);
        el('line', { x1: x, x2: x, y1: y, y2: y + 4 }, ax);
        text(ax, x, y + 16, opts.format ? opts.format(v) : F.num(v, opts.decimals || 2),
          { 'text-anchor': 'middle' });
      });
    if (opts.label) {
      text(g, (scale.range[0] + scale.range[1]) / 2, y + 36, opts.label,
        { 'text-anchor': 'middle', class: 'axis-label' });
    }
    return ax;
  }

  function axisY(g, scale, x, opts) {
    opts = opts || {};
    var ax = el('g', { class: 'axis' }, g);
    el('line', { x1: x, x2: x, y1: scale.range[0], y2: scale.range[1] }, ax);
    (opts.values || ticks(scale.domain[0], scale.domain[1], opts.count || 5))
      .forEach(function (v) {
        var y = scale(v);
        el('line', { x1: x - 4, x2: x, y1: y, y2: y }, ax);
        text(ax, x - 8, y + 3.5, opts.format ? opts.format(v) : F.num(v, opts.decimals || 2),
          { 'text-anchor': 'end' });
        if (opts.grid) {
          el('line', { class: 'gridline', x1: x, x2: opts.grid, y1: y, y2: y }, g);
        }
      });
    if (opts.label) {
      text(g, 0, 0, opts.label, {
        class: 'axis-label', 'text-anchor': 'middle',
        transform: 'translate(' + (x - 42) + ',' +
          ((scale.range[0] + scale.range[1]) / 2) + ') rotate(-90)'
      });
    }
    return ax;
  }

  /* ---------------------------------------------------------------- reliability */
  function reliability(container, rec) {
    var m = { t: 16, r: 16, b: 46, l: 48 };
    var f = frame(container, 300, m);
    var x = linear(0, 1, 0, f.iw);
    var y = linear(0, 1, f.ih, 0);

    axisY(f.g, y, 0, { grid: f.iw, count: 5, decimals: 2, label: 'accuracy' });
    axisX(f.g, x, f.ih, { count: 5, decimals: 2, label: 'stated confidence' });

    var bins = (rec && rec.bins ? rec.bins : []).filter(function (b) { return b.acc !== null; });
    var total = bins.reduce(function (a, b) { return a + b.n; }, 0) || 1;
    var maxShare = bins.reduce(function (a, b) { return Math.max(a, b.n / total); }, 1e-9);

    /* where the answers sit */
    bins.forEach(function (b) {
      var hh = (b.n / total) / maxShare * (f.ih * 0.17);
      el('rect', {
        x: x(b.lo), y: f.ih - hh, width: Math.max(x(b.hi) - x(b.lo) - 1, 1), height: hh,
        fill: C.slate, opacity: .32
      }, f.g);
    });

    el('line', {
      x1: x(0), y1: y(0), x2: x(1), y2: y(1),
      stroke: C.ink3, 'stroke-width': 1, 'stroke-dasharray': '3 3'
    }, f.g);

    if (bins.length > 1) {
      var pts = bins.map(function (b) {
        return [x((b.lo + b.hi) / 2), y(b.acc)];
      });
      var diag = bins.map(function (b) {
        return [x((b.lo + b.hi) / 2), y((b.lo + b.hi) / 2)];
      });
      var area = pts.map(function (p) { return p.join(','); }).join(' ') + ' ' +
        diag.slice().reverse().map(function (p) { return p.join(','); }).join(' ');
      el('polygon', { points: area, fill: C.pink, opacity: .22 }, f.g);
      el('polyline', {
        points: pts.map(function (p) { return p.join(','); }).join(' '),
        fill: 'none', stroke: C.charcoal, 'stroke-width': 1.8,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }, f.g);
      bins.forEach(function (b, i) {
        var cx = pts[i][0], cy = pts[i][1];
        el('circle', { cx: cx, cy: cy, r: 3.2, fill: C.charcoal }, f.g);
        var hit = el('circle', { cx: cx, cy: cy, r: 11, class: 'hit' }, f.g);
        hoverable(hit,
          '<b>confidence ' + F.num(b.lo, 2) + ' to ' + F.num(b.hi, 2) + '</b><br>' +
          '<span class="k">answers</span> ' + F.int(b.n) + '<br>' +
          '<span class="k">accuracy</span> ' + F.num(b.acc, 3) + '<br>' +
          '<span class="k">mean confidence</span> ' + F.num(b.conf, 3));
      });
    }
    return f;
  }

  /* ---------------------------------------------------------------- scatter */
  function scatter(container, opts) {
    var m = opts.margin || { t: 14, r: 16, b: 48, l: 52 };
    var f = frame(container, opts.height || 300, m);
    var xs = opts.logX ? log(opts.xDomain[0], opts.xDomain[1], 0, f.iw)
      : linear(opts.xDomain[0], opts.xDomain[1], 0, f.iw);
    var ys = linear(opts.yDomain[0], opts.yDomain[1], f.ih, 0);

    if (opts.bandY) {
      el('rect', {
        x: 0, y: ys(opts.bandY[1]), width: f.iw,
        height: Math.abs(ys(opts.bandY[0]) - ys(opts.bandY[1])),
        fill: C.slate, opacity: .13
      }, f.g);
    }
    axisY(f.g, ys, 0, { grid: f.iw, count: 5, decimals: opts.yDecimals || 2, label: opts.yLabel });
    axisX(f.g, xs, f.ih, {
      count: 5, decimals: opts.xDecimals || 2, label: opts.xLabel,
      values: opts.xTicks, format: opts.xFormat
    });
    if (opts.refY !== undefined && opts.refY !== null) {
      el('line', {
        x1: 0, x2: f.iw, y1: ys(opts.refY), y2: ys(opts.refY),
        stroke: opts.refColor || C.navy, 'stroke-width': 1.2, 'stroke-dasharray': '5 3'
      }, f.g);
      if (opts.refLabel) {
        text(f.g, f.iw - 4, ys(opts.refY) - 6, opts.refLabel,
          { 'text-anchor': 'end', fill: opts.refColor || C.navy, 'font-size': 11 });
      }
    }

    (opts.points || []).forEach(function (p) {
      var cx = xs(p.x), cy = ys(p.y);
      if (!isFinite(cx) || !isFinite(cy)) return;
      var g = el('g', { class: 'mark' + (p.dim ? ' dim' : '') }, f.g);
      shape(g, p.shape || 'circle', cx, cy, p.r || 5.4, p.color || C.navy, p.selected);
      var hit = el('circle', { cx: cx, cy: cy, r: 12, class: 'hit' }, g);
      hoverable(hit, p.tip, p.onClick);
    });
    return f;
  }

  function shape(g, kind, cx, cy, r, fill, selected) {
    var attrs = { fill: fill, stroke: '#fff', 'stroke-width': 1 };
    if (kind === 'square') {
      el('rect', Object.assign({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, attrs), g);
    } else if (kind === 'triangle') {
      el('polygon', Object.assign({
        points: [cx, cy - r * 1.15, cx - r, cy + r * .8, cx + r, cy + r * .8].join(' ')
      }, attrs), g);
    } else if (kind === 'diamond') {
      el('polygon', Object.assign({
        points: [cx, cy - r * 1.2, cx + r * 1.05, cy, cx, cy + r * 1.2, cx - r * 1.05, cy].join(' ')
      }, attrs), g);
    } else if (kind === 'plus') {
      var t = r * .42;
      el('polygon', Object.assign({
        points: [cx - t, cy - r, cx + t, cy - r, cx + t, cy - t, cx + r, cy - t, cx + r, cy + t,
          cx + t, cy + t, cx + t, cy + r, cx - t, cy + r, cx - t, cy + t, cx - r, cy + t,
          cx - r, cy - t, cx - t, cy - t].join(' ')
      }, attrs), g);
    } else if (kind === 'cross') {
      var u = r * .42, d = r * .78;
      el('polygon', Object.assign({
        points: [cx - d, cy - d + u, cx - d + u, cy - d, cx, cy - u, cx + d - u, cy - d,
          cx + d, cy - d + u, cx + u, cy, cx + d, cy + d - u, cx + d - u, cy + d,
          cx, cy + u, cx - d + u, cy + d, cx - d, cy + d - u, cx - u, cy].join(' ')
      }, attrs), g);
    } else {
      el('circle', Object.assign({ cx: cx, cy: cy, r: r }, attrs), g);
    }
    if (selected) el('circle', { cx: cx, cy: cy, r: r + 4.5, class: 'sel-ring' }, g);
  }

  /* ---------------------------------------------------------------- matrix */
  function matrix(container, opts) {
    var m = { t: 30, r: 12, b: 26, l: 108 };
    var rowH = opts.rowHeight || 40;
    var f = frame(container, m.t + m.b + rowH * opts.rows.length, m);
    var x = band(opts.cols, 0, f.iw, 0.06);
    var y = band(opts.rows, 0, rowH * opts.rows.length, 0.10);

    opts.cols.forEach(function (c) {
      text(f.g, x.center(c), -12, opts.colLabel(c),
        { 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: C.ink });
      if (opts.colColor) {
        el('rect', {
          x: x(c), y: -7, width: x.bandwidth, height: 3, fill: opts.colColor(c)
        }, f.g);
      }
    });
    opts.rows.forEach(function (r) {
      text(f.g, -10, y.center(r) + 4, opts.rowLabel(r),
        { 'text-anchor': 'end', 'font-size': 12, 'font-weight': 600, fill: C.ink });
    });

    opts.rows.forEach(function (rk) {
      opts.cols.forEach(function (ck) {
        var cell = opts.cell(rk, ck);
        var gx = x(ck), gy = y(rk);
        var g = el('g', {}, f.g);
        el('rect', {
          x: gx, y: gy, width: x.bandwidth, height: y.bandwidth, rx: 4,
          fill: cell.fill, stroke: '#fff', 'stroke-width': 1.5
        }, g);
        if (cell.label) {
          text(g, gx + x.bandwidth / 2, gy + y.bandwidth / 2 + 1, cell.label, {
            'text-anchor': 'middle', 'font-size': 13, 'font-weight': 600,
            fill: cell.ink || C.ink
          });
        }
        if (cell.sub) {
          text(g, gx + x.bandwidth / 2, gy + y.bandwidth - 6, cell.sub, {
            'text-anchor': 'middle', 'font-size': 10.5, fill: cell.subInk || C.ink2
          });
        }
        var hit = el('rect', {
          x: gx, y: gy, width: x.bandwidth, height: y.bandwidth, class: 'hit'
        }, g);
        if (cell.tip) hoverable(hit, cell.tip, cell.onClick);
      });
    });
    return f;
  }

  /* ---------------------------------------------------------------- lines with crosshair */
  function lines(container, opts) {
    var m = { t: 16, r: 20, b: 48, l: 56 };
    var f = frame(container, opts.height || 360, m);
    var xs = linear(opts.xDomain[0], opts.xDomain[1], 0, f.iw);
    var ys = linear(opts.yDomain[0], opts.yDomain[1], f.ih, 0);

    axisY(f.g, ys, 0, { grid: f.iw, count: 5, decimals: 2, label: opts.yLabel });
    axisX(f.g, xs, f.ih, { count: 5, decimals: 2, label: opts.xLabel });

    if (opts.refY !== undefined) {
      el('line', {
        x1: 0, x2: f.iw, y1: ys(opts.refY), y2: ys(opts.refY),
        stroke: C.charcoal, 'stroke-width': 1, 'stroke-dasharray': '4 3'
      }, f.g);
      text(f.g, f.iw - 3, ys(opts.refY) - 5, opts.refLabel || '',
        { 'text-anchor': 'end', 'font-size': 11, fill: C.ink2 });
    }

    opts.series.forEach(function (s) {
      var pts = s.x.map(function (vx, i) {
        return [xs(vx), ys(s.y[i])];
      }).filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
      el('polyline', {
        points: pts.map(function (p) { return p.join(','); }).join(' '),
        fill: 'none', stroke: s.color, 'stroke-width': s.width || 2,
        'stroke-dasharray': s.dash || null, 'stroke-linejoin': 'round',
        'stroke-linecap': 'round', opacity: s.opacity || 1
      }, f.g);
    });

    /* crosshair readout */
    var cross = el('g', { opacity: 0 }, f.g);
    var vline = el('line', {
      y1: 0, y2: f.ih, stroke: C.ink3, 'stroke-width': 1, 'stroke-dasharray': '3 3'
    }, cross);
    var dots = opts.series.map(function (s) {
      return el('circle', { r: 4, fill: s.color, stroke: '#fff', 'stroke-width': 1.2 }, cross);
    });
    var hit = el('rect', { x: 0, y: 0, width: f.iw, height: f.ih, class: 'hit' }, f.g);
    hit.addEventListener('mousemove', function (e) {
      var box = f.svg.getBoundingClientRect();
      var scale = f.w / box.width;
      var px = (e.clientX - box.left) * scale - m.l;
      var vx = Math.min(Math.max(xs.invert(px), opts.xDomain[0]), opts.xDomain[1]);
      cross.setAttribute('opacity', 1);
      vline.setAttribute('x1', xs(vx));
      vline.setAttribute('x2', xs(vx));
      var rows = '<b>' + opts.readoutX(vx) + '</b>';
      opts.series.forEach(function (s, i) {
        var j = nearest(s.x, vx);
        dots[i].setAttribute('cx', xs(s.x[j]));
        dots[i].setAttribute('cy', ys(s.y[j]));
        rows += '<br><span class="k">' + s.name + '</span> ' + opts.readoutY(s.y[j]);
      });
      showTip(e, rows);
    });
    hit.addEventListener('mouseleave', function () {
      cross.setAttribute('opacity', 0);
      hideTip();
    });
    return f;
  }

  function nearest(arr, v) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < arr.length; i++) {
      var d = Math.abs(arr[i] - v);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /* ---------------------------------------------------------------- split tracks */
  function splitTracks(container, opts) {
    var m = { t: 26, r: 16, b: 26, l: 96 };
    var rowH = 42;
    var f = frame(container, m.t + m.b + rowH * opts.rows.length, m);
    var x = linear(0, 1, 0, f.iw);
    var y = band(opts.rows.map(function (r) { return r.key; }), 0, rowH * opts.rows.length, 0.34);

    text(f.g, 0, -10, 'Western', { 'font-size': 11, fill: C.pink, 'font-weight': 600 });
    text(f.g, f.iw, -10, 'Asia',
      { 'font-size': 11, fill: C.navy, 'font-weight': 600, 'text-anchor': 'end' });

    opts.rows.forEach(function (r) {
      var gy = y(r.key), h = y.bandwidth;
      text(f.g, -10, gy + h / 2 + 4, r.label,
        { 'text-anchor': 'end', 'font-size': 12, 'font-weight': 600, fill: C.ink });
      el('rect', { x: 0, y: gy, width: f.iw, height: h, rx: h / 2, fill: C.rule2 }, f.g);
      var wWest = x(r.western);
      el('path', {
        d: roundedLeft(0, gy, wWest, h), fill: C.pink, opacity: .92
      }, f.g);
      el('path', {
        d: roundedRight(f.iw - x(r.asia), gy, x(r.asia), h), fill: C.navy, opacity: .92
      }, f.g);
      if (r.western > 0.12) {
        text(f.g, 8, gy + h / 2 + 4, F.pct(r.western, 0),
          { 'font-size': 11.5, fill: '#fff', 'font-weight': 600 });
      }
      if (r.asia > 0.12) {
        text(f.g, f.iw - 8, gy + h / 2 + 4, F.pct(r.asia, 0),
          { 'font-size': 11.5, fill: '#fff', 'font-weight': 600, 'text-anchor': 'end' });
      }
      var hit = el('rect', { x: 0, y: gy, width: f.iw, height: h, class: 'hit' }, f.g);
      hoverable(hit, r.tip);
    });
    return f;
  }

  function roundedLeft(x, y, w, h) {
    var r = Math.min(h / 2, w);
    return 'M' + (x + r) + ',' + y + ' H' + (x + w) + ' V' + (y + h) + ' H' + (x + r) +
      ' A' + r + ',' + r + ' 0 0 1 ' + x + ',' + (y + h - r) +
      ' V' + (y + r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + r) + ',' + y + ' Z';
  }

  function roundedRight(x, y, w, h) {
    var r = Math.min(h / 2, w);
    return 'M' + x + ',' + y + ' H' + (x + w - r) +
      ' A' + r + ',' + r + ' 0 0 1 ' + (x + w) + ',' + (y + r) +
      ' V' + (y + h - r) + ' A' + r + ',' + r + ' 0 0 1 ' + (x + w - r) + ',' + (y + h) +
      ' H' + x + ' Z';
  }

  /* ---------------------------------------------------------------- dumbbells */
  function dumbbells(container, opts) {
    var m = { t: 24, r: 18, b: 44, l: 104 };
    var rowH = 30;
    var f = frame(container, m.t + m.b + rowH * opts.rows.length, m);
    var x = linear(opts.xDomain[0], opts.xDomain[1], 0, f.iw);
    var y = band(opts.rows.map(function (r) { return r.key; }), 0, rowH * opts.rows.length, 0.3);

    axisX(f.g, x, rowH * opts.rows.length + 8, { count: 5, decimals: 2, label: opts.xLabel });

    opts.rows.forEach(function (r) {
      var cy = y.center(r.key);
      text(f.g, -10, cy + 4, r.label,
        { 'text-anchor': 'end', 'font-size': 12, fill: C.ink });
      if (r.a === null || r.b === null) return;
      el('line', {
        x1: x(r.a), x2: x(r.b), y1: cy, y2: cy,
        stroke: C.rule, 'stroke-width': 4, 'stroke-linecap': 'round'
      }, f.g);
      el('circle', { cx: x(r.a), cy: cy, r: 5, fill: C.navy, stroke: '#fff', 'stroke-width': 1.2 }, f.g);
      el('circle', { cx: x(r.b), cy: cy, r: 5, fill: C.pink, stroke: '#fff', 'stroke-width': 1.2 }, f.g);
      var hit = el('rect', {
        x: 0, y: cy - rowH / 2, width: f.iw, height: rowH, class: 'hit'
      }, f.g);
      hoverable(hit, r.tip);
    });
    return f;
  }

  /* ---------------------------------------------------------------- horizontal gauge */
  function gauge(container, value, opts) {
    clear(container);
    var w = Math.max(container.clientWidth || 320, 200), h = 16;
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h }, container);
    el('rect', { x: 0, y: 3, width: w, height: 10, rx: 5, fill: C.rule2 }, svg);
    var frac = Math.max(0, Math.min(1, value));
    el('rect', {
      x: 0, y: 3, width: Math.max(frac * w, 2), height: 10, rx: 5,
      fill: opts && opts.color ? opts.color : C.navy
    }, svg);
    if (opts && opts.marker !== undefined) {
      var mx = Math.max(0, Math.min(1, opts.marker)) * w;
      el('line', {
        x1: mx, x2: mx, y1: 0, y2: h, stroke: C.charcoal, 'stroke-width': 1.5
      }, svg);
    }
    return svg;
  }

  global.Charts = {
    C: C, el: el, text: text, clear: clear, frame: frame,
    linear: linear, log: log, band: band, ticks: ticks,
    reliability: reliability, scatter: scatter, matrix: matrix, lines: lines,
    splitTracks: splitTracks, dumbbells: dumbbells, gauge: gauge,
    hoverable: hoverable, showTip: showTip, hideTip: hideTip, shape: shape,
    axisX: axisX, axisY: axisY
  };
})(window);
