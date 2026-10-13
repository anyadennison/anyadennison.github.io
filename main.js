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

 /* ---------- Keys (stage 2 adds the black keys and keyboard shortcuts) ---------- */
 const keysEl = document.getElementById('keys');
 const readout = document.getElementById('readout');
 [60, 62, 64, 65, 67, 69, 71, 72].forEach(m => {
  const k = document.createElement('button');
  k.type = 'button'; k.className = 'key'; k.dataset.note = m; k.textContent = label(m);
  k.setAttribute('aria-label', 'Play ' + label(m));
  keysEl.appendChild(k);
 });
 const press = el => {
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 140);
 };
 const playKey = k => {
  const m = Number(k.dataset.note);
  genTone(m);
  readout.textContent = `${label(m)} · ${hz(m).toFixed(1)} Hz`;
  press(k);
 };
 keysEl.addEventListener('pointerdown', e => { const k = e.target.closest('.key'); if (k) playKey(k); });
 keysEl.addEventListener('click', e => { const k = e.target.closest('.key'); if (k && e.detail === 0) playKey(k); });

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

 /* ---------- Rack: patching lights the module (stage 4 sends it down the trace) ---------- */
 const modules = [...document.querySelectorAll('.module')];
 modules.forEach(mod => mod.querySelector('.patch').addEventListener('click', () => {
  modules.forEach(m => {
   const on = m === mod, btn = m.querySelector('.patch');
   m.classList.toggle('patched', on);
   btn.setAttribute('aria-pressed', String(on));
   btn.querySelector('.patch-text').textContent = on ? 'Patched' : 'Patch';
  });
 }));

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
 };
 if ('ResizeObserver' in window) new ResizeObserver(routeSpine).observe(main);
 addEventListener('resize', routeSpine, { passive: true });
 document.fonts && document.fonts.ready.then(routeSpine);
 routeSpine();
})();
