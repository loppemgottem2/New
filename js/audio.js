// Synthesized 3D sound effects using the Web Audio API (no sound files needed).
let ctx = null, master = null, noiseBuf = null;
let volume = 0.8;

export const Audio = {
  // Must be called from a user gesture (tap/click) on mobile
  unlock() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
        const len = ctx.sampleRate * 1.0;
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch { /* audio unsupported */ }
  },
  setVolume(v) { volume = v; if (master) master.gain.value = v; },

  setListener(x, y, z, fx, fy, fz) {
    if (!ctx) return;
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = fx; L.forwardY.value = fy; L.forwardZ.value = fz;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, 0, 1, 0);
    }
  },

  // Returns a destination node: 3D panner if pos given, otherwise master
  _out(pos, ref = 3) {
    if (!pos) return master;
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = 1.2; p.maxDistance = 200;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(master);
    return p;
  },

  _noise(dest, dur, freq, q, type, gainStart, t0 = 0, sweepTo = null) {
    const now = ctx.currentTime + t0;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainStart, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(now, Math.random() * 0.5); src.stop(now + dur + 0.05);
  },

  _tone(dest, freq, dur, gain, type = 'sine', t0 = 0, toFreq = null) {
    const now = ctx.currentTime + t0;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, now);
    if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, now + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(dest); o.start(now); o.stop(now + dur + 0.05);
  },

  gunshot(pos) {
    if (!ctx) return;
    const d = this._out(pos, 8);
    this._noise(d, 0.45, 1800, 0.7, 'lowpass', 1.6);
    this._noise(d, 0.12, 4000, 0.5, 'highpass', 0.8);
    this._tone(d, 120, 0.25, 0.9, 'sine', 0, 40);
    // echo
    this._noise(d, 0.6, 900, 0.5, 'lowpass', 0.25, 0.12);
  },
  swing(pos) {
    if (!ctx) return;
    this._noise(this._out(pos, 2), 0.22, 600, 2, 'bandpass', 0.5, 0, 3000);
  },
  stab(pos) {
    if (!ctx) return;
    const d = this._out(pos, 3);
    this._noise(d, 0.18, 500, 1, 'lowpass', 1.0);
    this._tone(d, 90, 0.2, 0.6, 'triangle', 0, 50);
  },
  thud(pos) {
    if (!ctx) return;
    const d = this._out(pos, 3);
    this._tone(d, 70, 0.3, 0.7, 'sine', 0, 35);
    this._noise(d, 0.2, 300, 1, 'lowpass', 0.5);
  },
  step(pos, loud = 0.25) {
    if (!ctx) return;
    this._noise(this._out(pos, 2), 0.07, 700 + Math.random() * 500, 1.5, 'bandpass', loud);
  },
  land(pos) {
    if (!ctx) return;
    this._noise(this._out(pos, 2), 0.15, 400, 1, 'lowpass', 0.6);
  },
  clink(pos) {
    if (!ctx) return;
    const d = this._out(pos, 3);
    this._tone(d, 2400, 0.15, 0.25, 'triangle'); this._tone(d, 3600, 0.1, 0.15, 'triangle', 0.03);
  },
  pickup() {
    if (!ctx) return;
    this._tone(master, 880, 0.1, 0.3, 'square'); this._tone(master, 1320, 0.15, 0.25, 'square', 0.08);
  },
  gunReady() {
    if (!ctx) return;
    this._tone(master, 660, 0.12, 0.3, 'square'); this._tone(master, 990, 0.12, 0.3, 'square', 0.1); this._tone(master, 1320, 0.25, 0.3, 'square', 0.2);
  },
  roundStart(murderer) {
    if (!ctx) return;
    if (murderer) { this._tone(master, 110, 1.2, 0.5, 'sawtooth', 0, 55); this._tone(master, 116, 1.2, 0.3, 'sawtooth'); }
    else { this._tone(master, 330, 0.5, 0.3, 'triangle'); this._tone(master, 440, 0.6, 0.3, 'triangle', 0.15); }
  },
  roundEnd(good) {
    if (!ctx) return;
    const notes = good ? [523, 659, 784] : [392, 330, 262];
    notes.forEach((n, i) => this._tone(master, n, 0.5, 0.3, 'triangle', i * 0.18));
  },
  scream(pos) {
    if (!ctx) return;
    const d = this._out(pos, 4);
    const base = 500 + Math.random() * 300;
    this._tone(d, base, 0.6, 0.35, 'sawtooth', 0, base * 0.6);
    this._noise(d, 0.5, base * 2, 3, 'bandpass', 0.2);
  },
  click() {
    if (!ctx) return;
    this._tone(master, 1200, 0.04, 0.15, 'square');
  },
};
