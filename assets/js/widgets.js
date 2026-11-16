/* Interactive figures on the projects page.
   maqam: a maqam in a chosen tuning system, playable from the mouse or keyboard (DiArMaqAr data).
   bach:  where the passages of one prelude and fugue fall in the autoencoder's latent space.
   aria:  a prompt and Aria's continuation as a piano roll, playable.
   pol:   Piano of Life, the piano video seeding a Game of Life.
   Each widget replaces a static fallback, so the page still reads without JavaScript. */
(function () {
  'use strict';
  var SVGNS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent, text) {
    var n = document.createElementNS(SVGNS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (text !== undefined) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function html(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function button(label, cls) {
    var b = html('button', cls || 'w-btn', label);
    b.type = 'button';
    return b;
  }
  function typing(e) {
    var t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (t.closest && t.closest('.mil-pop')));
  }

  /* ---------------- sound ---------------- */
  var ac = null, bus = null;
  function audio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    // body resonances of a wooden instrument, a short room, and a limiter
    var low = ac.createBiquadFilter(); low.type = 'peaking'; low.frequency.value = 240; low.Q.value = 1.1; low.gain.value = 4;
    var mid = ac.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1500; mid.Q.value = 1.4; mid.gain.value = 2.5;
    var air = ac.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 5200; air.gain.value = -6;
    var comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    var room = ac.createConvolver(); room.buffer = impulse(1.7);
    var wet = ac.createGain(); wet.gain.value = 0.24;
    bus = ac.createGain(); bus.gain.value = 0.85;
    bus.connect(low); low.connect(mid); mid.connect(air);
    air.connect(comp); air.connect(room); room.connect(wet); wet.connect(comp);
    comp.connect(ac.destination);
    return ac;
  }
  function impulse(secs) {
    var len = Math.floor(ac.sampleRate * secs), b = ac.createBuffer(2, len, ac.sampleRate);
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), lp = 0;
      for (var i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.32; d[i] = lp * Math.pow(1 - i / len, 3); }
    }
    return b;
  }

  /* A plucked string (Karplus-Strong). The averaging filter delays by half a sample and the
     leftover fraction of the period is corrected with playbackRate, so a 150-cent step is
     exactly 150 cents. */
  var strings = {};
  function stringBuffer(freq) {
    var key = Math.round(freq * 10);
    if (strings[key]) return strings[key];
    var sr = ac.sampleRate, period = Math.max(2, Math.round(sr / freq - 0.5));
    var rendered = sr / (period + 0.5), len = Math.floor(sr * 2.6);
    var data = new Float32Array(len), line = new Float32Array(period), i, lp = 0;
    var pick = Math.max(1, Math.round(period / 7));
    for (i = 0; i < period; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.7; line[i] = lp + 0.35 * (1 - 2 * Math.abs(i / period - 0.5)); }
    for (i = period - 1; i >= pick; i--) line[i] -= 0.85 * line[i - pick];    // plucked near the bridge
    var p = 0, prev = line[period - 1], loss = Math.min(0.9995, 0.9972 + 0.0022 * Math.min(1, 160 / freq));
    for (i = 0; i < len; i++) {
      var cur = line[p];
      data[i] = cur;
      line[p] = 0.5 * (cur + prev) * loss;
      prev = cur;
      p = (p + 1) % period;
    }
    var fade = Math.floor(sr * 0.3);
    for (i = 0; i < fade; i++) data[len - 1 - i] *= i / fade;
    var buf = ac.createBuffer(1, len, sr);
    buf.getChannelData(0).set(data);
    return (strings[key] = { buffer: buf, rate: freq / rendered });
  }
  /* A qanun course: three strings a few cents apart, spread across the stereo field. */
  function qanun(freq, when, gain) {
    if (!audio()) return;
    var t = when || ac.currentTime;
    [-2.6, 0, 2.6].forEach(function (cents, k) {
      var f = freq * Math.pow(2, cents / 1200), s = stringBuffer(f);
      var src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = s.buffer;
      src.playbackRate.value = s.rate;
      g.gain.value = (gain || 0.5) * (k === 1 ? 0.42 : 0.3);
      src.connect(g);
      if (ac.createStereoPanner) {
        var pan = ac.createStereoPanner(); pan.pan.value = (k - 1) * 0.35;
        g.connect(pan); pan.connect(bus);
      } else { g.connect(bus); }
      src.start(t + k * 0.004);
    });
  }

  /* A simple piano voice, rendered once into a buffer: a few slightly stretched harmonics
     that decay faster as they go up, with the damper falling when the key is released. */
  function renderPiano(notes, total) {
    var sr = ac.sampleRate, len = Math.ceil(sr * total), out = new Float32Array(len), TWO_PI = 2 * Math.PI;
    notes.forEach(function (n) {
      var start = Math.floor(n[0] * sr), dur = Math.min(n[1], 4), f = 440 * Math.pow(2, (n[2] - 69) / 12);
      var amp = 0.16 * Math.pow(n[3] / 127, 1.4), ring = Math.floor((dur + 0.35) * sr);
      for (var h = 1; h <= 6; h++) {
        var fh = h * f * Math.sqrt(1 + 0.0004 * h * h);
        if (fh > sr / 2.3) break;
        var a = amp / Math.pow(h, 1.35), tau = Math.max(0.25, 2.4 - n[2] / 60) / Math.pow(h, 0.7), w = TWO_PI * fh / sr;
        for (var i = 0; i < ring && start + i < len; i++) {
          var t = i / sr, env = Math.exp(-t / tau) * Math.min(1, t / 0.003);
          if (t > dur) env *= Math.exp(-(t - dur) / 0.07);
          out[start + i] += a * env * Math.sin(w * i);
        }
      }
    });
    var buf = ac.createBuffer(1, len, sr);
    buf.getChannelData(0).set(out);
    return buf;
  }

  /* ---------------- maqam and tuning system ---------------- */
  function maqamWidget(fig, D) {
    var stage = fig.querySelector('.widget-stage');
    var bySys = {}, byMq = {};
    D.systems.forEach(function (s) { bySys[s.id] = s; });
    D.maqamat.forEach(function (m) { byMq[m.id] = m; });
    var nice = { rast: 'Rast', bayat: 'Bayat', hijaz: 'Hijaz', saba: 'Saba', segah: 'Segah', nahawand: 'Nahawand', kurd: 'Kurd' };
    var S = { mq: 'rast', ts: 'ronzevalle_1904' };
    var timers = [];

    stage.innerHTML = '';
    var controls = html('div', 'w-controls');
    var rowM = html('div', 'w-row'), rowT = html('div', 'w-row');
    rowM.appendChild(html('span', 'w-label', 'Maqam'));
    rowT.appendChild(html('span', 'w-label', 'Tuning system'));
    var chipsM = html('div', 'w-seg'), chipsT = html('div', 'w-seg');
    chipsM.setAttribute('role', 'group'); chipsM.setAttribute('aria-label', 'Maqam');
    chipsT.setAttribute('role', 'group'); chipsT.setAttribute('aria-label', 'Tuning system');
    rowM.appendChild(chipsM); rowT.appendChild(chipsT);
    controls.appendChild(rowM); controls.appendChild(rowT);
    stage.appendChild(controls);

    D.maqamat.forEach(function (m) {
      var b = button(nice[m.id] || m.id, 'w-btn');
      b.dataset.id = m.id;
      b.addEventListener('click', function () {
        S.mq = m.id;
        if (!m.idx[S.ts]) S.ts = 'ronzevalle_1904';
        stop(); draw();
      });
      chipsM.appendChild(b);
    });
    D.systems.forEach(function (s) {
      var b = button(s.label, 'w-btn');
      b.dataset.id = s.id;
      b.addEventListener('click', function () {
        if (!byMq[S.mq].idx[s.id]) return;
        S.ts = s.id; stop(); draw();
      });
      chipsT.appendChild(b);
    });

    var svg = el('svg', { viewBox: '0 0 640 270', class: 'w-svg', role: 'img' }, stage);
    var foot = html('div', 'w-row w-foot');
    var play = button('Play the scale', 'w-play');
    var readout = html('span', 'w-readout');
    readout.setAttribute('aria-live', 'polite');
    foot.appendChild(play); foot.appendChild(readout);
    stage.appendChild(foot);
    stage.appendChild(html('p', 'w-hint', 'Keyboard: with the pointer over the diagram, keys 1 to 8 (or A to K) play the notes and the space bar plays the scale.'));

    var L = 34, R = 606, X = function (c) { return L + (R - L) * c / 1200; };
    var degrees = [];

    function scale() {
      var s = bySys[S.ts], m = byMq[S.mq], idx = m.idx[S.ts];
      var cs = idx.map(function (d) { return s.cents[d[0]] + d[1] * 1200; });
      for (var i = 1; i < cs.length; i++) while (cs[i] <= cs[i - 1]) cs[i] += 1200;
      cs.push(cs[0] + 1200);
      return { s: s, m: m, abs: cs, rel: cs.map(function (c) { return c - cs[0]; }) };
    }

    function draw() {
      chipsM.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === S.mq)); });
      chipsT.querySelectorAll('button').forEach(function (b) {
        var ok = !!byMq[S.mq].idx[b.dataset.id];
        b.setAttribute('aria-pressed', String(b.dataset.id === S.ts));
        b.disabled = !ok;
        b.title = ok ? '' : nice[S.mq] + ' is not spelled in this tuning system in DiArMaqAr';
      });
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var sc = scale(), s = sc.s, m = sc.m;
      svg.setAttribute('aria-label', 'Maqam ' + nice[m.id] + ' in the ' + s.label + ' tuning system');

      var j = m.jins, jx0 = X(sc.rel[0]), jx1 = X(sc.rel[j.size - 1]);
      el('path', { d: 'M' + jx0 + ' 46 V38 H' + jx1 + ' V46', class: 'w-bracket' }, svg);
      el('text', { x: (jx0 + jx1) / 2, y: 28, class: 'w-jins' }, svg, j.name);

      el('line', { x1: X(0), x2: X(1200), y1: 128, y2: 128, class: 'w-scale-line' }, svg);
      for (var i = 0; i < sc.rel.length - 1; i++) {
        var a = sc.rel[i], b = sc.rel[i + 1], st = Math.round(b - a);
        var off = Math.abs(st - Math.round(st / 100) * 100) >= 20;
        el('text', { x: (X(a) + X(b)) / 2, y: 156, class: 'w-step' + (off ? ' w-step--off' : '') }, svg, st + '¢');
      }
      degrees = sc.rel.map(function (c, i) {
        var isT = i === 0 || i === sc.rel.length - 1;
        var name = i < m.notes.length ? m.notes[i] : 'octave';
        el('text', { x: X(c), y: i % 2 ? 98 : 78, class: 'w-note' }, svg, name);
        el('text', { x: X(c), y: 180, class: 'w-keycap' }, svg, String(i + 1));
        var dot = el('circle', { cx: X(c), cy: 128, r: isT ? 8 : 7, class: 'w-deg' + (isT ? ' w-deg--tonic' : ''), tabindex: 0, role: 'button' }, svg);
        dot.setAttribute('aria-label', 'Play ' + name);
        var f = s.ref * Math.pow(2, sc.abs[i] / 1200);
        var hit = function () { qanun(f, 0, 0.6); flash(dot); };
        dot.addEventListener('click', hit);
        dot.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); hit(); } });
        return { dot: dot, f: f, hit: hit };
      });

      var tonic = sc.abs[0];
      el('text', { x: L, y: 204, class: 'w-row-label' }, svg, 'pitches in ' + s.label + ' (' + s.n + ' per octave)');
      el('line', { x1: X(0), x2: X(1200), y1: 222, y2: 222, class: 'w-axis' }, svg);
      s.cents.forEach(function (c) {
        var r = (((c - tonic) % 1200) + 1200) % 1200;
        el('line', { x1: X(r), x2: X(r), y1: 213, y2: 231, class: 'w-tick' }, svg);
      });
      el('line', { x1: X(1200), x2: X(1200), y1: 213, y2: 231, class: 'w-tick' }, svg);
      el('text', { x: L, y: 252, class: 'w-row-label' }, svg, '12-tone equal temperament');
      for (var k = 0; k < 12; k++) {
        var r12 = (((k * 100 - tonic) % 1200) + 1200) % 1200;
        el('line', { x1: X(r12), x2: X(r12), y1: 258, y2: 268, class: 'w-tick w-tick--grid' }, svg);
        if (r12 < 0.5) el('line', { x1: X(1200), x2: X(1200), y1: 258, y2: 268, class: 'w-tick w-tick--grid' }, svg);
      }
      var steps = s.id === 'angloeuropean_1700' ? 'twelve equal steps' : s.n + ' pitches per octave';
      readout.textContent = nice[m.id] + ' in ' + s.label + ', ' + steps + '.';
    }

    function flash(dot) {
      dot.classList.add('is-on');
      setTimeout(function () { dot.classList.remove('is-on'); }, 260);
    }
    function stop() {
      timers.forEach(clearTimeout);
      timers = [];
      play.textContent = 'Play the scale';
    }
    function playScale() {
      if (timers.length) { stop(); return; }
      if (!audio()) return;
      var seq = degrees.concat(degrees.slice(0, -1).reverse()), gap = 0.36, t0 = ac.currentTime + 0.05;
      seq.forEach(function (d, i) {
        qanun(d.f, t0 + i * gap, i === 0 || i === seq.length - 1 ? 0.6 : 0.5);
        timers.push(setTimeout(function () { flash(d.dot); }, (i * gap + 0.05) * 1000));
      });
      timers.push(setTimeout(stop, (seq.length * gap + 0.4) * 1000));
      play.textContent = 'Stop';
    }
    play.addEventListener('click', playScale);

    // keyboard: 1-8 or A S D F G H J K, space for the whole scale, while the pointer is over the diagram
    var over = false;
    fig.addEventListener('pointerenter', function () { over = true; });
    fig.addEventListener('pointerleave', function () { over = false; });
    var ROW = 'asdfghjk';
    document.addEventListener('keydown', function (e) {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!over && !fig.contains(document.activeElement)) return;
      var i = '12345678'.indexOf(e.key);
      if (i < 0) i = ROW.indexOf(e.key.toLowerCase());
      if (i >= 0 && degrees[i]) { e.preventDefault(); degrees[i].hit(); return; }
      if (e.key === ' ') { e.preventDefault(); playScale(); }
    });

    draw();
  }

  /* ---------------- Bach: one piece in the latent space ---------------- */
  function bachWidget(fig, D) {
    var stage = fig.querySelector('.widget-stage');
    var minorName = { Ab: 'G#' };
    function keyName(p) { return (p.mode === 'minor' && minorName[p.key] ? minorName[p.key] : p.key) + ' ' + p.mode; }

    stage.innerHTML = '';
    var controls = html('div', 'w-row w-controls');
    var lab = html('label', 'w-label', 'Piece');
    var sel = html('select', 'w-select');
    D.pieces.forEach(function (p, i) {
      var o = html('option', '', 'No. ' + p.n + ' in ' + keyName(p));
      o.value = i;
      sel.appendChild(o);
    });
    lab.appendChild(sel);
    var prev = button('Previous', 'w-btn'), next = button('Next', 'w-btn');
    controls.appendChild(lab); controls.appendChild(prev); controls.appendChild(next);
    stage.appendChild(controls);

    var W = 460, H = 440, pad = 30;
    var cx = D.keys.reduce(function (a, k) { return a + k.x; }, 0) / D.keys.length;
    var cy = D.keys.reduce(function (a, k) { return a + k.y; }, 0) / D.keys.length;
    var dist = D.seq.map(function (s) { return Math.max(Math.abs(s[1] - cx), Math.abs(s[2] - cy)); }).sort(function (a, b) { return a - b; });
    var half = dist[Math.floor(dist.length * 0.96)];
    var PX = function (x) { return W / 2 + (x - cx) / half * (W / 2 - pad); };
    var PY = function (y) { return H / 2 - (y - cy) / half * (H / 2 - pad); };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'w-svg w-svg--bach', role: 'img' }, stage);
    var clip = el('clipPath', { id: 'bach-clip' }, el('defs', {}, svg));
    el('rect', { x: 0, y: 0, width: W, height: H }, clip);
    var cloud = el('g', { class: 'w-cloud', 'clip-path': 'url(#bach-clip)' }, svg);
    D.seq.forEach(function (s) { el('circle', { cx: PX(s[1]).toFixed(1), cy: PY(s[2]).toFixed(1), r: 1.7 }, cloud); });

    var K = D.keys.map(function (k) { return [PX(k.x), PY(k.y)]; }), n = K.length, d = 'M' + K[0][0] + ' ' + K[0][1];
    for (var i = 0; i < n; i++) {
      var p0 = K[(i - 1 + n) % n], p1 = K[i], p2 = K[(i + 1) % n], p3 = K[(i + 2) % n];
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        (p2[0] - (p3[0] - p1[0]) / 6) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ' ' + p2[1];
    }
    el('path', { d: d + ' Z', class: 'w-ring' }, svg);
    var mx = K.reduce(function (a, k) { return a + k[0]; }, 0) / n, my = K.reduce(function (a, k) { return a + k[1]; }, 0) / n;
    var keyLabels = {};
    D.keys.forEach(function (k, i) {
      var a = Math.atan2(K[i][1] - my, K[i][0] - mx);
      el('circle', { cx: K[i][0], cy: K[i][1], r: 3.5, class: 'w-key-dot' }, svg);
      keyLabels[k.key] = el('text', { x: K[i][0] + Math.cos(a) * 17, y: K[i][1] + Math.sin(a) * 17, class: 'w-key' }, svg, k.key);
    });

    var layer = el('g', { 'clip-path': 'url(#bach-clip)' }, svg);
    var readout = html('p', 'w-readout');
    readout.setAttribute('aria-live', 'polite');
    stage.appendChild(readout);

    function show(i) {
      sel.value = i;
      var p = D.pieces[i];
      while (layer.firstChild) layer.removeChild(layer.firstChild);
      var pts = D.seq.filter(function (s) { return s[0] === i; });
      el('polyline', { points: pts.map(function (s) { return PX(s[1]).toFixed(1) + ',' + PY(s[2]).toFixed(1); }).join(' '), class: 'w-path' }, layer);
      pts.forEach(function (s) { el('circle', { cx: PX(s[1]).toFixed(1), cy: PY(s[2]).toFixed(1), r: 2.8, class: 'w-pt' }, layer); });
      el('circle', { cx: PX(p.x), cy: PY(p.y), r: 8, class: 'w-centroid' }, layer);
      Object.keys(keyLabels).forEach(function (k) { keyLabels[k].classList.toggle('is-on', k === p.key); });
      svg.setAttribute('aria-label', 'Passages of Prelude and Fugue No. ' + p.n + ' in ' + keyName(p) + ' in the latent space');
      readout.textContent = 'No. ' + p.n + ' in ' + keyName(p) + ': ' + pts.length + ' passages. The open circle is their average.';
    }
    sel.addEventListener('change', function () { show(+sel.value); });
    prev.addEventListener('click', function () { show((+sel.value + D.pieces.length - 1) % D.pieces.length); });
    next.addEventListener('click', function () { show((+sel.value + 1) % D.pieces.length); });
    show(0);
  }

  /* ---------------- Aria: a prompt and its continuation ---------------- */
  function ariaWidget(fig, D) {
    var stage = fig.querySelector('.widget-stage');
    stage.innerHTML = '';
    var controls = html('div', 'w-row w-controls');
    controls.appendChild(html('span', 'w-label', 'Continuation'));
    var seg = html('div', 'w-seg');
    controls.appendChild(seg);
    stage.appendChild(controls);
    var W = 640, H = 250, top = 22, bottom = 20;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'w-svg w-svg--roll', role: 'img' }, stage);
    var foot = html('div', 'w-row w-foot');
    var play = button('Play', 'w-play');
    var readout = html('span', 'w-readout');
    foot.appendChild(play); foot.appendChild(readout);
    stage.appendChild(foot);

    var cur = 0, buffers = {}, src = null, raf = 0, head = null, startAt = 0, total = 1, X = null;

    D.takes.forEach(function (t, i) {
      var b = button('Take ' + (i + 1) + ', temperature ' + t.temperature, 'w-btn');
      b.addEventListener('click', function () { stopPlay(); cur = i; draw(); });
      seg.appendChild(b);
    });

    function draw() {
      seg.querySelectorAll('button').forEach(function (b, i) { b.setAttribute('aria-pressed', String(i === cur)); });
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      var t = D.takes[cur], all = t.prompt.concat(t.output);
      total = Math.max.apply(null, all.map(function (n) { return n[0] + n[1]; })) + 0.5;
      var lo = Math.min.apply(null, all.map(function (n) { return n[2]; })) - 2, hi = Math.max.apply(null, all.map(function (n) { return n[2]; })) + 2;
      X = function (s) { return 10 + (W - 20) * s / total; };
      var rowH = (H - top - bottom) / (hi - lo);
      var Y = function (p) { return top + (hi - p) * rowH; };
      for (var p = Math.ceil(lo / 12) * 12; p <= hi; p += 12) {
        el('line', { x1: 10, x2: W - 10, y1: Y(p), y2: Y(p), class: 'w-roll-c' }, svg);
        el('text', { x: W - 8, y: Y(p) - 3, class: 'w-roll-label', 'text-anchor': 'end' }, svg, 'C' + (p / 12 - 1));
      }
      var xp = X(t.prompt_end);
      el('rect', { x: 10, y: top - 6, width: xp - 10, height: H - top - bottom + 12, class: 'w-roll-prompt-bg' }, svg);
      el('text', { x: 14, y: 14, class: 'w-roll-label' }, svg, 'prompt');
      el('text', { x: xp + 6, y: 14, class: 'w-roll-label' }, svg, 'Aria continues');
      function bar(n, cls) {
        el('rect', { x: X(n[0]), y: Y(n[2]) - rowH / 2, width: Math.max(1.5, X(n[0] + n[1]) - X(n[0])), height: Math.max(2, rowH * 0.9), class: cls }, svg);
      }
      t.prompt.forEach(function (n) { bar(n, 'w-note-prompt'); });
      t.output.forEach(function (n) { bar(n, 'w-note-aria'); });
      head = el('line', { x1: 10, x2: 10, y1: top - 8, y2: H - bottom + 8, class: 'w-head' }, svg);
      head.style.display = 'none';
      svg.setAttribute('aria-label', 'Piano roll: a ' + t.prompt.length + '-note prompt and ' + t.output.length + ' notes of continuation');
      readout.textContent = t.prompt.length + '-note prompt, then ' + t.output.length + ' notes from Aria.';
    }
    function stopPlay() {
      if (src) { var s = src; src = null; try { s.stop(); } catch (e) { /* already stopped */ } }
      cancelAnimationFrame(raf);
      if (head) head.style.display = 'none';
      play.textContent = 'Play';
    }
    function tick() {
      var s = ac.currentTime - startAt;
      if (!src || s > total) { stopPlay(); return; }
      var x = X(Math.max(0, s));
      head.setAttribute('x1', x); head.setAttribute('x2', x);
      raf = requestAnimationFrame(tick);
    }
    play.addEventListener('click', function () {
      if (src) { stopPlay(); return; }
      if (!audio()) return;
      var t = D.takes[cur];
      if (!buffers[cur]) buffers[cur] = renderPiano(t.prompt.concat(t.output), total + 1);
      src = ac.createBufferSource();
      src.buffer = buffers[cur];
      src.connect(bus);
      startAt = ac.currentTime + 0.05;
      src.start(startAt);
      src.onended = function () { if (src) stopPlay(); };
      head.style.display = '';
      play.textContent = 'Stop';
      raf = requestAnimationFrame(tick);
    });
    draw();
  }

  /* ---------------- Piano of Life ---------------- */
  function polWidget(fig, D) {
    var stage = fig.querySelector('.widget-stage');
    stage.innerHTML =
      '<div class="pol-stage"><div class="pol-video-wrap"><video playsinline preload="none"></video></div>' +
      '<canvas class="pol-strip"></canvas><div class="pol-substrate"><canvas class="pol-gol"></canvas>' +
      '<p class="pol-hint">Press play: every hammer strike seeds the cells.</p></div></div>';
    var video = stage.querySelector('video');
    video.crossOrigin = 'anonymous';
    if (fig.getAttribute('data-poster')) video.poster = fig.getAttribute('data-poster');
    video.src = D.video;
    var foot = html('div', 'w-row w-foot');
    var play = button('Play', 'w-play'), hear = button('Hear the cells', 'w-btn');
    hear.setAttribute('aria-pressed', 'false');
    hear.title = 'Let the Game of Life filter the piano’s own sound';
    var readout = html('span', 'w-readout', D.title);
    foot.appendChild(play); foot.appendChild(hear); foot.appendChild(readout);
    stage.appendChild(foot);

    var pol = null;
    function mount() {
      pol = window.PianoOfLife.mount({
        video: video, strip: stage.querySelector('.pol-strip'), gol: stage.querySelector('.pol-gol'),
        band: D.band, flipCols: D.flipCols
      });
    }
    function ensure(cb) {
      if (pol) return cb();
      if (window.PianoOfLife) { mount(); return cb(); }
      var s = document.createElement('script');
      s.src = fig.getAttribute('data-script');
      s.onload = function () { mount(); cb(); };
      document.head.appendChild(s);
    }
    play.addEventListener('click', function () {
      ensure(function () { if (video.paused) video.play().catch(function () {}); else video.pause(); });
    });
    video.addEventListener('play', function () { if (pol) pol.start(); play.textContent = 'Pause'; var h = stage.querySelector('.pol-hint'); if (h) h.remove(); });
    video.addEventListener('pause', function () { play.textContent = 'Play'; });
    hear.addEventListener('click', function () {
      ensure(function () {
        var on = hear.getAttribute('aria-pressed') !== 'true';
        hear.setAttribute('aria-pressed', pol.setFilter(on) ? 'true' : 'false');
      });
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        if (!pol) return;
        if (es[0].isIntersecting) { if (!video.paused) pol.start(); } else { pol.stop(); video.pause(); }
      }).observe(fig);
    }
  }

  var builders = { maqam: maqamWidget, bach: bachWidget, aria: ariaWidget, pol: polWidget };
  document.querySelectorAll('[data-widget]').forEach(function (fig) {
    var build = builders[fig.getAttribute('data-widget')];
    if (!build) return;
    fetch(fig.getAttribute('data-src'))
      .then(function (r) { return r.json(); })
      .then(function (D) { build(fig, D); fig.classList.add('is-live'); })
      .catch(function () { /* keep the static figure */ });
  });
})();
