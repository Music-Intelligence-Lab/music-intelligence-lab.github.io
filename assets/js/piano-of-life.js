/**
 * Piano of Life — embedded, side-by-side layout.
 *
 * Video on the LEFT (played at its natural aspect ratio, no CSS
 * rotation — pieces you want rotated should be encoded rotated before
 * upload). Detection reads luminance change across a configurable
 * band on the video frame: horizontal band (axis 'y') for a landscape
 * top-down piano view; vertical band (axis 'x') for a portrait view
 * where the hammers form a vertical strip on the left.
 *
 * Bars fly RIGHT from the video into a thin strip, then seed a shaded
 * Game of Life substrate on the far right.
 *
 * API:
 *   PianoOfLife.mount({
 *     video, strip, gol,
 *     band: {
 *       axis: 'auto' | 'x' | 'y',   // 'auto' picks 'x' for portrait, 'y' for landscape
 *       position: 0.60,             // fraction along the OTHER axis
 *       thickness: 0.05,            // fraction of that same OTHER axis
 *     },
 *     nRows = 96, threshold = 8,
 *     cooldownMs = 260, dirBias = 1.8,
 *   })
 */
(function () {
  'use strict';

  const P = {
    accent:      '#2E3158',
    accentSoft:  'rgba(46,49,88,0.14)',
    accentLine:  'rgba(46,49,88,0.55)',
  };

  function hexRgb(h) { return { r: parseInt(h.slice(1,3),16), g: parseInt(h.slice(3,5),16), b: parseInt(h.slice(5,7),16) }; }
  function mix(c1, c2, t) {
    const a = hexRgb(c1), b = hexRgb(c2);
    return `rgb(${(a.r*(1-t)+b.r*t)|0},${(a.g*(1-t)+b.g*t)|0},${(a.b*(1-t)+b.b*t)|0})`;
  }

  function fitCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = cv.getBoundingClientRect();
    cv.width  = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    cv.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function mount(opts = {}) {
    const {
      video, strip, gol,
      stopBtn,               // optional <button> that toggles simulation on/off
      nRows = 96,
      threshold = 8,
      cooldownMs = 260,
      dirBias = 1.8,
      band = {},
      // Whether column 0 maps to the BOTTOM of the strip (true) or the
      // TOP (false). Depends on which end of the piano is at video-col-0.
      // Landscape videos usually keep the default; portrait videos flipped
      // 180° from a CW rotation want `false`.
      flipCols: flipColsOpt = true,
    } = opts;
    let flipCols = flipColsOpt;
    if (!video || !gol) return null;

    // Config with sensible defaults.
    let bandAxisReq  = band.axis      || 'auto';   // resolved after metadata if 'auto'
    let bandAxis     = bandAxisReq === 'auto' ? 'y' : bandAxisReq;
    let bandPosNow   = band.position != null ? band.position    : 0.60;
    let bandThickNow = band.thickness != null ? band.thickness  : 0.05;

    // Hidden work canvas for detection — downsampled copy of the video
    // frame in its native orientation. Sized so the long side maps to
    // ~320 px, whatever the video's aspect turns out to be.
    const workCv = document.createElement('canvas');
    workCv.width  = 320;
    workCv.height = 180;
    const workCtx = workCv.getContext('2d', { willReadFrequently: true });

    // Resize the work canvas to match the video's aspect once we know it,
    // and resolve the auto band axis.
    function onMetadataReady() {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      if (bandAxisReq === 'auto') bandAxis = vw >= vh ? 'y' : 'x';
      // Keep work canvas long side ~320
      if (vw >= vh) {
        workCv.width = 320;
        workCv.height = Math.max(60, Math.round(320 * vh / vw));
      } else {
        workCv.height = 320;
        workCv.width  = Math.max(60, Math.round(320 * vw / vh));
      }
    }
    if (video.readyState >= 1) onMetadataReady();
    video.addEventListener('loadedmetadata', onMetadataReady);

    const stripCtx = strip ? strip.getContext('2d') : null;
    const golCtx   = gol.getContext('2d');

    const state = {
      rows: nRows, cols: 0,
      cellW: 0, cellH: 0,
      grid: null, next: null, alpha: null,
      tickMs: 0, stepMs: 180,
    };

    function resetGrid() {
      const rect = gol.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      state.rows  = nRows;
      state.cellH = rect.height / state.rows;
      state.cellW = state.cellH;
      state.cols  = Math.max(6, Math.floor(rect.width / state.cellW));
      const N = state.cols * state.rows;
      state.grid  = new Uint8Array(N);
      state.next  = new Uint8Array(N);
      state.alpha = new Float32Array(N);
      state.tickMs = 0;
    }
    function fitGridPreserving() {
      const rect = gol.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const newCellH = rect.height / nRows;
      const newCols  = Math.max(6, Math.floor(rect.width / newCellH));
      if (!state.grid || newCols !== state.cols || nRows !== state.rows) resetGrid();
      else { state.cellH = newCellH; state.cellW = newCellH; }
    }
    function resizeAll() {
      fitCanvas(gol);
      if (strip) fitCanvas(strip);
      fitGridPreserving();
    }

    // Column c → strip y-position. `flipCols` says which end of the piano
    // col 0 corresponds to — true for the classic landscape layout where
    // low notes need to fall to the bottom, false when a 180° flip has
    // already put low notes at the video's bottom.
    function colToY(col, height) {
      const N = nCols();
      const t = flipCols ? (N - 1 - col) / N : col / N;
      return t * height;
    }

    const BAR_SPEED = 260;
    const bars = [];
    function spawnBar(col, strength) {
      bars.push({ col, x: 0, strength, alive: true });
    }
    function drawBars(dtMs) {
      if (!stripCtx || !strip) return;
      const rect = strip.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      stripCtx.clearRect(0, 0, w, h);
      const dx  = BAR_SPEED * dtMs / 1000;
      const rowH = h / nCols();
      for (const b of bars) {
        if (!b.alive) continue;
        b.x += dx;
        const barW  = 8 + Math.min(16, b.strength * 24);
        const alpha = Math.max(0.35, 1 - (b.x / w) * 0.6);
        stripCtx.globalAlpha = alpha;
        stripCtx.fillStyle = P.accent;
        const y = colToY(b.col, h);
        stripCtx.fillRect(b.x, y + 1, barW, Math.max(2, rowH - 2));
        if (b.x > w - 2) {
          b.alive = false;
          // Normalised position, so seeding still works when the strip is
          // hidden (h = 0) on narrow screens.
          const frac = colToY(b.col, 1) + 0.5 / nCols();
          const gridRow = Math.min(state.rows - 1, Math.floor(frac * state.rows));
          seedLeftEdge(gridRow, b.strength);
        }
      }
      stripCtx.globalAlpha = 1;
      for (let i = bars.length - 1; i >= 0; i--) if (!bars[i].alive) bars.splice(i, 1);
    }

    function seedLeftEdge(r, strength) {
      if (!state.grid) return;
      const size = 1 + Math.floor(strength * 3);
      const rh = Math.floor(size / 2);
      for (let dr = -rh; dr <= rh; dr++) {
        const rr = r + dr;
        if (rr < 0 || rr >= state.rows) continue;
        for (let cc = 0; cc < Math.min(2, size); cc++) {
          if (cc >= state.cols) break;
          if (Math.random() < 0.85) {
            state.grid[rr * state.cols + cc] = 1;
            state.alpha[rr * state.cols + cc] = 1;
          }
        }
      }
    }

    function stepGol() {
      const g = state.grid, n = state.next, a = state.alpha;
      const C = state.cols, R = state.rows;
      for (let r = 0; r < R; r++) {
        for (let c = 0; c < C; c++) {
          let live = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= R || cc < 0 || cc >= C) continue;
            live += g[rr * C + cc];
          }
          const i = r * C + c;
          const alive = g[i];
          const born = !alive && live === 3;
          const survives = alive && (live === 2 || live === 3);
          n[i] = born || survives ? 1 : 0;
          if (born)                a[i] = 1;
          else if (survives)       a[i] = Math.max(a[i], 0.9);
          else if (alive)          a[i] = 0.55 * a[i];
          else                     a[i] = 0.72 * a[i];
        }
      }
      const tmp = state.grid; state.grid = state.next; state.next = tmp;
    }

    function drawGol(dtMs) {
      const rect = gol.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      golCtx.clearRect(0, 0, w, h);
      state.tickMs += dtMs;
      if (state.tickMs >= state.stepMs) { stepGol(); state.tickMs = 0; }
      const cw = state.cellW, ch = state.cellH;
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const a = state.alpha[r * state.cols + c];
          if (a < 0.02) continue;
          golCtx.fillStyle = mix('#F7FAF9', P.accent, Math.min(1, a));
          golCtx.globalAlpha = Math.min(1, a);
          golCtx.fillRect(c * cw, r * ch, cw, ch);
        }
      }
      golCtx.globalAlpha = 1;
    }

    // Detection: signed luma change at a horizontal ('y' band) or
    // vertical ('x' band) strip across the video. Columns c ∈ [0, N)
    // run PERPENDICULAR to the band — along the piano's key axis.
    let prevLuma = null;
    const lastHitAt = [];
    function nCols() { return 96; }
    for (let i = 0; i < nCols(); i++) lastHitAt.push(-Infinity);

    function detectHits(now) {
      if (video.readyState < 2 || video.videoWidth === 0) return [];
      // Redraw the video frame at whatever the current work canvas size is
      workCtx.drawImage(video, 0, 0, workCv.width, workCv.height);
      const W = workCv.width, H = workCv.height;
      const img = workCtx.getImageData(0, 0, W, H).data;
      const N = nCols();
      const mean = new Float32Array(N);

      if (bandAxis === 'x') {
        // Vertical band at x = bandPosNow * W, columns run along Y (top→bottom)
        const cx = bandPosNow * W;
        const halfT = (bandThickNow * W) / 2;
        const x0 = Math.max(0, Math.floor(cx - halfT));
        const x1 = Math.min(W, Math.floor(cx + halfT));
        if (x1 <= x0) return [];
        const rowH = H / N;
        for (let x = x0; x < x1; x++) {
          let rowEnd = rowH, row = 0;
          for (let y = 0; y < H; y++) {
            while (y >= rowEnd && row < N - 1) { row++; rowEnd = (row + 1) * rowH; }
            const i = (y * W + x) * 4;
            mean[row] += 0.299 * img[i] + 0.587 * img[i+1] + 0.114 * img[i+2];
          }
        }
        const area = x1 - x0;
        for (let c = 0; c < N; c++) mean[c] /= area * rowH;
      } else {
        // Horizontal band at y = bandPosNow * H, columns run along X (left→right)
        const cy = bandPosNow * H;
        const halfT = (bandThickNow * H) / 2;
        const y0 = Math.max(0, Math.floor(cy - halfT));
        const y1 = Math.min(H, Math.floor(cy + halfT));
        if (y1 <= y0) return [];
        const colW = W / N;
        for (let y = y0; y < y1; y++) {
          let colEnd = colW, col = 0;
          for (let x = 0; x < W; x++) {
            while (x >= colEnd && col < N - 1) { col++; colEnd = (col + 1) * colW; }
            const i = (y * W + x) * 4;
            mean[col] += 0.299 * img[i] + 0.587 * img[i+1] + 0.114 * img[i+2];
          }
        }
        const area = y1 - y0;
        for (let c = 0; c < N; c++) mean[c] /= area * colW;
      }

      const dLuma = new Float32Array(N);
      if (prevLuma && prevLuma.length === N) {
        for (let c = 0; c < N; c++) dLuma[c] = mean[c] - prevLuma[c];
      }
      prevLuma = mean;
      const hits = [];
      for (let c = 0; c < N; c++) {
        const d = dLuma[c];
        const strike = -d;
        const rtrn   =  d;
        if (strike < threshold) continue;
        if ((now - lastHitAt[c]) <= cooldownMs) continue;
        if (strike < dirBias * Math.max(0, rtrn)) continue;
        hits.push({ col: c, strength: Math.min(1, strike / 40) });
        lastHitAt[c] = now;
      }
      return hits;
    }

    // The animation loop is INDEPENDENT of the video. Detection only fires
    // while the video is actually playing; the GoL substrate keeps evolving
    // (and rendering existing cells) even after the video ends. The user
    // can force it to stop via the stopBtn.
    let running = false;
    let raf = 0;
    let lastFrameMs = 0;
    let manuallyStopped = false;

    function startLoop() {
      if (running || manuallyStopped) return;
      running = true;
      lastFrameMs = performance.now();
      raf = requestAnimationFrame(frame);
      updateStopBtn();
    }
    function stopLoop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      updateStopBtn();
    }
    function frame(now) {
      if (!running) return;
      const dt = Math.min(50, now - lastFrameMs || 16);
      lastFrameMs = now;
      // Detection only runs while the video is actually rolling; the GoL
      // keeps evolving on its own between/after strikes.
      if (!video.paused && !video.ended && video.readyState >= 2) {
        const hits = detectHits(now);
        for (const h of hits) spawnBar(h.col, h.strength);
      }
      drawBars(dt);
      drawGol(dt);
      raf = requestAnimationFrame(frame);
    }

    // Video events: start the loop when playback begins; DO NOT stop the
    // loop when the video pauses or ends — the GoL runs independently.
    video.addEventListener('play',    startLoop);
    video.addEventListener('playing', startLoop);

    // Manual stop button — pause/resume the simulation as a whole.
    function updateStopBtn() {
      if (!stopBtn) return;
      const wantPause = running;
      stopBtn.setAttribute('aria-pressed', wantPause ? 'true' : 'false');
      stopBtn.dataset.state = wantPause ? 'running' : 'stopped';
      stopBtn.title = wantPause ? 'stop simulation' : 'resume simulation';
      stopBtn.setAttribute('aria-label', wantPause ? 'stop simulation' : 'resume simulation');
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        if (running) {
          manuallyStopped = true;
          stopLoop();
        } else {
          manuallyStopped = false;
          startLoop();
        }
      });
      updateStopBtn();
    }

    // Audio: the GoL row density shapes a bandpass bank over the video's own
    // audio (same idea as the standalone tool). Rows run along the piano's
    // key axis with low notes at the bottom, so row r maps to a log-spaced
    // band from fMax (top) down to fMin (bottom). Created lazily on the first
    // user gesture because browsers refuse to start an AudioContext before one.
    const audio = { ctx: null, src: null, dry: null, wet: null, gains: [], on: false };
    const N_BANDS = 32, F_MIN = 110, F_MAX = 2093, Q = 9, DRY = 0.35, WET = 0.75;
    function initAudio() {
      if (audio.ctx) return true;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      try {
        audio.ctx = new Ctx();
        audio.src = audio.ctx.createMediaElementSource(video);
      } catch (e) {
        console.warn('Piano of Life: audio unavailable', e);
        audio.ctx = null;
        return false;
      }
      audio.dry = audio.ctx.createGain();
      audio.wet = audio.ctx.createGain();
      audio.dry.gain.value = 1;
      audio.wet.gain.value = 0;
      audio.src.connect(audio.dry).connect(audio.ctx.destination);
      audio.wet.connect(audio.ctx.destination);
      for (let b = 0; b < N_BANDS; b++) {
        const f = audio.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = F_MIN * Math.pow(F_MAX / F_MIN, b / (N_BANDS - 1));
        f.Q.value = Q;
        const g = audio.ctx.createGain();
        g.gain.value = 0;
        audio.src.connect(f).connect(g).connect(audio.wet);
        audio.gains.push(g);
      }
      return true;
    }
    function setFilter(on) {
      if (on && !initAudio()) return false;
      audio.on = !!on;
      if (!audio.ctx) return audio.on;
      audio.ctx.resume().catch(() => {});
      const now = audio.ctx.currentTime;
      audio.dry.gain.setTargetAtTime(audio.on ? DRY : 1, now, 0.05);
      audio.wet.gain.setTargetAtTime(audio.on ? WET : 0, now, 0.05);
      if (!audio.on) for (const g of audio.gains) g.gain.setTargetAtTime(0, now, 0.05);
      return audio.on;
    }
    function updateAudio() {
      if (!audio.on || !state.alpha) return;
      const R = state.rows, C = state.cols, a = state.alpha;
      const pmf = new Float32Array(N_BANDS);
      for (let r = 0; r < R; r++) {
        let s = 0;
        for (let c = 0; c < C; c++) s += a[r * C + c];
        const b = Math.min(N_BANDS - 1, Math.floor(((R - 1 - r) / R) * N_BANDS));
        pmf[b] += s;
      }
      let peak = 0;
      for (let b = 0; b < N_BANDS; b++) if (pmf[b] > peak) peak = pmf[b];
      const norm = peak > 0 ? 0.9 / peak : 0;
      const now = audio.ctx.currentTime;
      for (let b = 0; b < N_BANDS; b++) audio.gains[b].gain.setTargetAtTime(pmf[b] * norm, now, 0.08);
    }
    const audioTimer = setInterval(updateAudio, 60);

    // Swap the detection band when the player loads a different piece. The
    // GoL grid is left alone on purpose: what the last piece grew carries
    // into the next one.
    function setBand(b = {}) {
      bandAxisReq = b.axis || 'auto';
      if (bandAxisReq !== 'auto') bandAxis = bandAxisReq;
      bandPosNow = b.position != null ? b.position : 0.60;
      bandThickNow = b.thickness != null ? b.thickness : 0.05;
      prevLuma = null;
      onMetadataReady();
    }

    resizeAll();
    window.addEventListener('resize', resizeAll);

    return {
      stop() { manuallyStopped = true; stopLoop(); },
      start() { manuallyStopped = false; startLoop(); },
      reset: resetGrid,
      setFilter, setBand,
      setFlipCols(v) { flipCols = v; },
      destroy() { stopLoop(); clearInterval(audioTimer); },
    };
  }

  window.PianoOfLife = { mount };
})();
