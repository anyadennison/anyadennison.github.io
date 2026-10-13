(() => {
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 const state = { freq: .45, amp: .7, wave: 'sine', keyNote: 0, keyHit: 0 };
 const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
 const label = m => names[m % 12] + (Math.floor(m / 12) - 1);
 const hz = m => 440 * 2 ** ((m - 69) / 12);

 /* ---------- Audio. Sound only starts from a click or key press. ---------- */
 let audio, master;
 const volume = () => .15 + state.amp * .55;
 const initAudio = () => {
  if (!audio) {
   audio = new (window.AudioContext || window.webkitAudioContext)();
   master = audio.createGain();
   master.connect(audio.destination);
  }
  if (audio.state === 'suspended') audio.resume();
  master.gain.value = volume();
 };
 // The instrument plays a plain oscillator in the selected shape, no filter.
 const LEVEL = { sine: .42, triangle: .4, square: .14, saw: .16 }; // evens out loudness across shapes
 const genTone = midi => {
  initAudio();
  const t = audio.currentTime;
  const osc = audio.createOscillator(), env = audio.createGain();
  osc.type = state.wave === 'saw' ? 'sawtooth' : state.wave;
  osc.frequency.value = hz(midi);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(LEVEL[state.wave], t + .012);
  env.gain.setValueAtTime(LEVEL[state.wave], t + .28);
  env.gain.exponentialRampToValueAtTime(.0005, t + 1.1);
  osc.connect(env).connect(master);
  osc.start(t); osc.stop(t + 1.15);
  state.keyNote = hz(midi); state.keyHit = 1; wake();
 };

 /* ---------- Mediocre Melodies: a short sung chord, slightly off-key on purpose ----------
    A sawtooth voice through three formant filters makes an "aah"; each note drifts a little flat or sharp. */
 const voice = (midi, start, cents) => {
  const t = audio.currentTime + start;
  const f = hz(midi) * 2 ** (cents / 1200);
  const osc = audio.createOscillator(), lfo = audio.createOscillator(), depth = audio.createGain(), env = audio.createGain();
  osc.type = 'sawtooth'; osc.frequency.value = f;
  lfo.frequency.value = 5 + Math.random(); depth.gain.value = f * .012;
  lfo.connect(depth).connect(osc.frequency);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(.32, t + .12);
  env.gain.setValueAtTime(.32, t + .7);
  env.gain.exponentialRampToValueAtTime(.0005, t + 1.6);
  env.connect(master);
  [[800, 1], [1150, .5], [2900, .2]].forEach(([formant, level]) => {
   const band = audio.createBiquadFilter(), g = audio.createGain();
   band.type = 'bandpass'; band.frequency.value = formant; band.Q.value = 9; g.gain.value = level;
   osc.connect(band).connect(g).connect(env);
  });
  osc.start(t); lfo.start(t); osc.stop(t + 1.7); lfo.stop(t + 1.7);
 };
 const hum = document.getElementById('hum');
 hum.addEventListener('click', () => {
  initAudio();
  // C major, sung by three people who started at slightly different times and pitches.
  [[60, 0, -18], [64, .05, 31], [67, .11, -42]].forEach(([m, start, cents]) => voice(m, start, cents + (Math.random() - .5) * 10));
  hum.classList.add('on');
  clearTimeout(hum._t); hum._t = setTimeout(() => hum.classList.remove('on'), 1500);
 });

 /* ---------- Keys: C4 to C5, white and black, with the usual computer-keyboard layout ---------- */
 const keysEl = document.getElementById('keys');
 const readout = document.getElementById('readout');
 const KEYS = [
  [60, 'a'], [61, 'w'], [62, 's'], [63, 'e'], [64, 'd'], [65, 'f'], [66, 't'],
  [67, 'g'], [68, 'y'], [69, 'h'], [70, 'u'], [71, 'j'], [72, 'k']
 ];
 const byShortcut = {};
 let whiteIndex = 0;
 KEYS.forEach(([m, shortcut]) => {
  const black = names[m % 12].includes('#');
  const k = document.createElement('button');
  k.type = 'button';
  k.className = 'key ' + (black ? 'black' : 'white');
  k.dataset.note = m;
  k.innerHTML = `<kbd aria-hidden="true">${shortcut.toUpperCase()}</kbd>${black ? '' : `<span>${label(m)}</span>`}`;
  k.setAttribute('aria-label', `Play ${label(m).replace('#', ' sharp ')}, shortcut ${shortcut.toUpperCase()}`);
  if (black) k.style.left = `${whiteIndex / 8 * 100}%`; else whiteIndex++;
  keysEl.appendChild(k);
  byShortcut[shortcut] = k;
 });
 const press = el => {
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 140);
 };
 const noteListeners = []; // the trace subscribes to notes in stage 3
 const playKey = k => {
  const m = Number(k.dataset.note);
  genTone(m);
  readout.textContent = `${label(m)} · ${hz(m).toFixed(1)} Hz`;
  press(k);
  noteListeners.forEach(fn => fn(m));
 };
 keysEl.addEventListener('pointerdown', e => { const k = e.target.closest('.key'); if (k) playKey(k); });
 keysEl.addEventListener('click', e => { const k = e.target.closest('.key'); if (k && e.detail === 0) playKey(k); });
 // Shortcuts only respond while the instrument is on screen, so typing elsewhere stays silent.
 const instrument = document.querySelector('.instrument');
 addEventListener('keydown', e => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = byShortcut[e.key.toLowerCase()];
  if (!k) return;
  const r = instrument.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  e.preventDefault();
  playKey(k);
 });

 /* ---------- Knobs ---------- */
 const knob = (el, key) => {
  const set = v => {
   state[key] = Math.max(0, Math.min(1, v));
   el.style.setProperty('--v', state[key]);
   el.setAttribute('aria-valuenow', Math.round(state[key] * 100));
   if (key === 'amp' && master) master.gain.value = volume();
   wake();
  };
  let startY = 0, startV = 0;
  el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); startY = e.clientY; startV = state[key]; });
  el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) set(startV + (startY - e.clientY) / 150); });
  el.addEventListener('wheel', e => { e.preventDefault(); set(state[key] - e.deltaY / 800); }, { passive: false });
  el.addEventListener('keydown', e => {
   const d = { ArrowUp: .05, ArrowRight: .05, ArrowDown: -.05, ArrowLeft: -.05, PageUp: .2, PageDown: -.2 }[e.key];
   if (d) { e.preventDefault(); set(state[key] + d); }
   if (e.key === 'Home') { e.preventDefault(); set(0); }
   if (e.key === 'End') { e.preventDefault(); set(1); }
  });
 };
 knob(document.getElementById('k-freq'), 'freq');
 knob(document.getElementById('k-amp'), 'amp');

 /* ---------- Waveform selector: drives the trace and the sound ---------- */
 const scopeTag = document.getElementById('scope-tag');
 document.querySelectorAll('input[name="wave"]').forEach(r => r.addEventListener('change', () => {
  state.wave = r.value;
  scopeTag.textContent = 'CH1 · ' + r.value.toUpperCase();
  wake();
 }));

 /* ---------- Hero scope ---------- */
 const canvas = document.getElementById('scope');
 const ctx = canvas.getContext('2d');
 const MUSTARD = '#D9A93B';
 let w = 0, h = 0, phase = 0, raf = 0, visible = true, last = 0;
 const size = () => {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  w = r.width; h = r.height;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wake();
 };
 const shape = (wave, x) => {
  const p = x - Math.floor(x);
  if (wave === 'square') return p < .5 ? 1 : -1;
  if (wave === 'saw') return 2 * p - 1;
  if (wave === 'triangle') return p < .5 ? 4 * p - 1 : 3 - 4 * p;
  return Math.sin(2 * Math.PI * x);
 };
 const draw = () => {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(169,184,154,.16)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) { const x = Math.round(w * i / 10) + .5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let i = 1; i < 8; i++) { const y = Math.round(h * i / 8) + .5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(169,184,154,.38)';
  ctx.beginPath(); ctx.moveTo(0, h / 2 + .5); ctx.lineTo(w, h / 2 + .5); ctx.stroke();
  // A played key pulls the trace to that note's pitch, then it settles back.
  const idle = 1.5 + state.freq * 7;
  const played = state.keyNote / 65 * (.6 + state.freq * .8);
  const cycles = idle + (played - idle) * state.keyHit;
  const a = Math.min(h * .44, h * .36 * (.25 + state.amp * .75) * (1 + .18 * state.keyHit));
  ctx.beginPath();
  for (let px = 0; px <= w; px += 1.5) {
   const y = h / 2 - shape(state.wave, px / w * cycles + phase) * a;
   px ? ctx.lineTo(px, y) : ctx.moveTo(px, y);
  }
  ctx.strokeStyle = MUSTARD; ctx.lineWidth = 2.25; ctx.lineJoin = 'round'; ctx.stroke();
 };
 const frame = now => {
  raf = 0;
  const dt = Math.min(50, now - (last || now)); last = now;
  if (!reduced.matches) phase += dt * (.0004 + state.freq * .0012);
  state.keyHit *= Math.pow(.9975, dt);
  draw();
  if (visible && (!reduced.matches || state.keyHit > .01)) raf = requestAnimationFrame(frame); else last = 0;
 };
 function wake() { if (!raf && w) raf = requestAnimationFrame(frame); }
 if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); }).observe(canvas);
 addEventListener('resize', size, { passive: true });
 size();

 /* ---------- Rack: patching lights the module and reshapes the trace beside Projects ---------- */
 const modules = [...document.querySelectorAll('.module')];
 state.patchWave = 'square';
 modules.forEach(mod => mod.querySelector('.patch').addEventListener('click', () => {
  modules.forEach(m => {
   const on = m === mod, btn = m.querySelector('.patch');
   m.classList.toggle('patched', on);
   btn.setAttribute('aria-pressed', String(on));
   btn.querySelector('.patch-text').textContent = on ? 'Patched' : 'Patch';
  });
  state.patchWave = mod.dataset.wave;
  wakeTrace();
 }));


 /* ---------- Live trace ----------
    The spine is resampled into points every ~2px, each with its arc length and a normal.
    Each frame draws only the points inside the viewport, displaced along their normal by:
    an idle wave, the patched module's wave beside Projects, and any notes travelling down the page. */
 const traceCanvas = document.createElement('canvas');
 traceCanvas.className = 'trace-canvas';
 traceCanvas.setAttribute('aria-hidden', 'true');
 document.body.appendChild(traceCanvas);
 const tctx = traceCanvas.getContext('2d');
 const projects = document.getElementById('projects').querySelector('.rail');
 let pts = [], total = 0, railTop = 0, railBottom = 0, proj = { top: 0, bottom: 0 }, traceRaf = 0, tw = 0, th = 0;
 const pulses = [];
 const INK = '#2B2A26', TERRA = '#C2643C';
 const SPEED = .9, DELAY = 140, SPAN = 280; // px per ms, ms before the signal leaves the jack, pulse length in px

 const sizeTrace = () => {
  const dpr = Math.min(2, devicePixelRatio || 1);
  tw = innerWidth; th = innerHeight;
  traceCanvas.width = Math.round(tw * dpr); traceCanvas.height = Math.round(th * dpr);
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
 };
 function buildTrace(ox, oy, hy, rx, ey, r) {
  pts = []; total = 0;
  const add = (x, y) => {
   if (pts.length) { const q = pts[pts.length - 1]; total += Math.hypot(x - q.x, y - q.y); }
   pts.push({ x, y, s: total, nx: 0, ny: 0 });
  };
  const line = (x0, y0, x1, y1) => { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2)); for (let i = 1; i <= n; i++) add(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); };
  const quad = (x0, y0, cx, cy, x1, y1) => { for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; add(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1); } };
  add(ox, oy);
  line(ox, oy, ox, hy - r); quad(ox, hy - r, ox, hy, ox - r, hy);
  line(ox - r, hy, rx + r, hy); quad(rx + r, hy, rx, hy, rx, hy + r);
  line(rx, hy + r, rx, ey);
  pts.forEach((p, i) => {
   const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
   const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
   p.nx = -ty / len; p.ny = tx / len;
  });
  railTop = hy + r; railBottom = ey;
  const pr = projects.getBoundingClientRect();
  proj = { top: pr.top + scrollY, bottom: pr.bottom + scrollY };
  sizeTrace();
  document.documentElement.classList.add('trace-live');
  wakeTrace();
 }
 const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
 // Index of the first point at or below page y (the path never climbs, so y is sorted).
 const indexAt = y => { let lo = 0, hi = pts.length - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (pts[mid].y < y) lo = mid + 1; else hi = mid; } return lo; };

 const offset = (p, t) => {
  const ends = smooth(Math.min(p.s, total - p.s) / 40);
  const live = !reduced.matches;
  let d = 2.2 * Math.sin(2 * Math.PI * (p.s / 90 - (live ? t * .00035 : 0)));
  // Beside Projects the trace carries the patched module's waveform.
  if (p.y > proj.top && p.y < proj.bottom && p.y > railTop) {
   const k = smooth((p.y - proj.top) / 60) * smooth((proj.bottom - p.y) / 60);
   const m = state.patchWave === 'flat' ? (live ? (Math.random() - .5) * 1.6 : 0) : 7 * shape(state.patchWave, p.s / 44 - (live ? t * .0006 : 0));
   d += (m - d) * k;
  }
  let pulse = 0;
  for (const q of pulses) {
   const front = (t - q.t0 - DELAY) * SPEED, dist = front - p.s;
   if (dist < 0 || dist > SPAN) continue;
   const env = Math.sin(Math.PI * dist / SPAN) * Math.exp(-(t - q.t0) / 2600);
   pulse += 10 * env * shape(q.wave, p.s / q.lambda - t * .002);
  }
  return { d: (d + pulse) * ends, pulse: Math.abs(pulse) };
 };

 const drawTrace = t => {
  tctx.clearRect(0, 0, tw, th);
  if (!pts.length) return;
  const top = scrollY - 40, bottom = scrollY + th + 40;
  let i = indexAt(top);
  if (i > 0) i--;
  const seg = [];
  for (; i < pts.length && pts[i].y <= bottom; i++) {
   const p = pts[i], o = offset(p, t);
   seg.push({ x: p.x + p.nx * o.d - scrollX, y: p.y + p.ny * o.d - scrollY, pulse: o.pulse });
  }
  if (!seg.length) return;
  tctx.lineJoin = 'round'; tctx.lineCap = 'round';
  tctx.beginPath();
  seg.forEach((q, j) => j ? tctx.lineTo(q.x, q.y) : tctx.moveTo(q.x, q.y));
  tctx.strokeStyle = INK; tctx.lineWidth = 2; tctx.stroke();
  // Notes in flight are drawn again in terracotta so the travelling signal reads clearly.
  if (pulses.length) {
   tctx.beginPath();
   let on = false;
   seg.forEach(q => { if (q.pulse > .35) { on ? tctx.lineTo(q.x, q.y) : tctx.moveTo(q.x, q.y); on = true; } else on = false; });
   tctx.strokeStyle = TERRA; tctx.lineWidth = 2.6; tctx.stroke();
  }
  // The probe follows the reader down the rail.
  const py = scrollY + th * .45;
  if (py > railTop && py < railBottom) {
   const p = pts[indexAt(py)], o = offset(p, t);
   const x = p.x + p.nx * o.d - scrollX, y = py - scrollY;
   tctx.beginPath(); tctx.moveTo(x - 13, y); tctx.lineTo(x - 8, y); tctx.moveTo(x + 8, y); tctx.lineTo(x + 13, y);
   tctx.strokeStyle = INK; tctx.lineWidth = 1.5; tctx.stroke();
   tctx.beginPath(); tctx.arc(x, y, 5.5, 0, Math.PI * 2);
   tctx.fillStyle = '#F4EFE3'; tctx.fill();
   tctx.strokeStyle = TERRA; tctx.lineWidth = 2.5; tctx.stroke();
  }
 };
 const traceFrame = t => {
  traceRaf = 0;
  for (let j = pulses.length - 1; j >= 0; j--) if ((t - pulses[j].t0 - DELAY) * SPEED - SPAN > total || t - pulses[j].t0 > 9000) pulses.splice(j, 1);
  drawTrace(t);
  if (!reduced.matches && !document.hidden) traceRaf = requestAnimationFrame(traceFrame);
 };
 function wakeTrace() { if (!traceRaf) traceRaf = requestAnimationFrame(traceFrame); }
 // Reduced motion: the trace stays still and notes only move the hero scope.
 noteListeners.push(m => {
  if (reduced.matches) return;
  pulses.push({ t0: performance.now(), wave: state.wave, lambda: Math.max(36, 30000 / hz(m)) });
  wakeTrace();
 });
 addEventListener('scroll', wakeTrace, { passive: true });
 document.addEventListener('visibilitychange', wakeTrace);
 reduced.addEventListener && reduced.addEventListener('change', wakeTrace);

 /* ---------- The spine: instrument output, under the hero, down the rail, into OUT ---------- */
 const main = document.getElementById('main');
 const spinePath = document.getElementById('spine-path');
 const outJack = document.getElementById('out-jack');
 const endNode = document.getElementById('end-node');
 const heroGrid = document.querySelector('.hero-grid');
 const centre = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
 const routeSpine = () => {
  const box = main.getBoundingClientRect();
  const o = centre(outJack), e = centre(endNode);
  const ox = o.x - box.left, oy = o.y - box.top;
  const rx = e.x - box.left, ey = e.y - box.top;
  const hy = heroGrid.getBoundingClientRect().bottom - box.top + 40; // runs under both hero columns
  const r = 14;
  spinePath.setAttribute('d', `M${ox} ${oy} V${hy - r} Q${ox} ${hy} ${ox - r} ${hy} H${rx + r} Q${rx} ${hy} ${rx} ${hy + r} V${ey}`);
  const dx = box.left + scrollX, dy = box.top + scrollY;
  buildTrace(ox + dx, oy + dy, hy + dy, rx + dx, ey + dy, r);
 };
 if ('ResizeObserver' in window) new ResizeObserver(routeSpine).observe(main);
 addEventListener('resize', routeSpine, { passive: true });
 document.fonts && document.fonts.ready.then(routeSpine);
 routeSpine();
})();
