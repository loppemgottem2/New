// =====================================================================
//  TEXTURES.JS — every texture is painted procedurally on a canvas at
//  startup (no image files). Uses fractal noise for concrete, dirt,
//  wood grain, fabric etc.
// =====================================================================
import * as THREE from '../vendor/three.module.min.js';

// ---------------- noise helpers ----------------
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
// tileable value noise (period p)
function vnoise(x, y, p, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (a) => ((a % p) + p) % p;
  const a = hash(m(xi), m(yi), s), b = hash(m(xi + 1), m(yi), s);
  const c = hash(m(xi), m(yi + 1), s), d = hash(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// fractal noise in [0,1], tileable over [0,1)^2 with base frequency f
export function fbm(x, y, f = 4, oct = 4, s = 0) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    const p = f << o;
    sum += vnoise(x * p, y * p, p, s + o * 17) * amp;
    norm += amp; amp *= 0.5;
  }
  return sum / norm;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// Fill a canvas pixel by pixel: fn(u, v) -> [r,g,b]
function paint(ctx, w, h, fn) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x / w, y / h, x, y);
    const i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

let RENDERER = null;
function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = RENDERER ? Math.min(8, RENDERER.capabilities.getMaxAnisotropy()) : 1;
  return t;
}

const rnd = (() => { let s = 12345; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();

// ======================================================================
//  Surfaces
// ======================================================================

// Painted concrete-block wall (2m x 2m tile)
function wallPainted(S, reps = 1) {
  const [c, ctx] = canvas(S);
  const bw = S / 5 / reps, bh = S / 10 / reps; // 0.4 x 0.2 m blocks (reps = how many 2 m tiles the texture covers)
  paint(ctx, S, S, (u, v, x, y) => {
    const row = Math.floor(y / bh);
    const off = (row % 2) * bw / 2;
    const bx = (x + off) % bw, by = y % bh;
    const n = fbm(u, v, 8, 4, 1);
    const grime = fbm(u, v, 2, 3, 7);
    let base = 206 + (n - 0.5) * 22 - Math.max(0, grime - 0.62) * 70;
    // mortar joints: recessed (dark) with a lit lower lip -> looks 3D
    const edge = Math.min(bx, bw - bx, by, bh - by);
    if (edge < 2.2) base -= 38;
    else if (by > bh - 4.5) base -= 10;     // shadow under top joint
    else if (by < 4.5) base += 7;            // highlight below joint
    // tiny pits
    if (hash(x, y, 3) > 0.996) base -= 40;
    return [base * 1.0, base * 0.985, base * 0.95];
  });
  return c;
}

// Raw poured concrete with form-tie holes and water stains
function wallConcrete(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 6, 5, 11);
    const blot = fbm(u, v, 3, 3, 12);
    const streak = fbm(u * 6, v * 0.6, 4, 3, 13);
    let b = 150 + (n - 0.5) * 60 - Math.max(0, blot - 0.55) * 80 - Math.max(0, streak - 0.6) * 60 * v;
    // panel seams every 1m
    const px = x % (S / 2), py = y % (S / 2);
    if (px < 2 || py < 2) b -= 35;
    // form tie holes
    const hx = (x % (S / 4)) - S / 8, hy = (y % (S / 4)) - S / 8;
    const hr = Math.hypot(hx, hy);
    if (hr < 5) b -= 55 - hr * 6; else if (hr < 7) b += 8;
    return [b, b * 0.99, b * 0.96];
  });
  return c;
}

function floorTile(S) {
  const [c, ctx] = canvas(S);
  const ts = S / 4; // 0.5m tiles
  paint(ctx, S, S, (u, v, x, y) => {
    const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
    const alt = (tx + ty) % 2;
    const n = fbm(u, v, 16, 3, 21);
    const scuff = fbm(u, v, 3, 4, 22);
    let r = alt ? 196 : 168, g = alt ? 192 : 168, b = alt ? 180 : 162;
    const k = (n - 0.5) * 26 - Math.max(0, scuff - 0.6) * 60;
    if (hash(x, y, 23) > 0.985) { r -= 30; g -= 30; b -= 30; } // speckles
    const lx = x % ts, ly = y % ts;
    if (lx < 1.5 || ly < 1.5) return [92, 90, 86];
    if (lx < 3 || ly < 3) { r -= 14; g -= 14; b -= 14; }
    return [r + k, g + k, b + k];
  });
  return c;
}

function floorWood(S) {
  const [c, ctx] = canvas(S);
  const pw = S / 10; // 0.2m planks
  paint(ctx, S, S, (u, v, x, y) => {
    const plank = Math.floor(y / pw);
    const seg = Math.floor((x + hash(plank, 0, 31) * S) / (S / 2)) ;
    const tone = hash(plank, seg, 32);
    const grain = fbm(u * 0.5 + tone, v * 8, 8, 4, 33);
    const ring = Math.sin((grain * 18 + v * 40) ) * 0.5 + 0.5;
    let r = 150 + tone * 40 + ring * 18 - grain * 30, g = 98 + tone * 26 + ring * 10 - grain * 22, b = 56 + tone * 14 - grain * 12;
    const wear = fbm(u, v, 3, 3, 34);
    r -= Math.max(0, wear - 0.6) * 60; g -= Math.max(0, wear - 0.6) * 50; b -= Math.max(0, wear - 0.6) * 30;
    if (y % pw < 1.6) { r *= 0.45; g *= 0.45; b *= 0.45; }
    const sx = (x + hash(plank, 0, 31) * S) % (S / 2);
    if (sx < 1.4) { r *= 0.55; g *= 0.55; b *= 0.55; }
    return [r, g, b];
  });
  return c;
}

function floorCarpet(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 32, 2, 41);
    const pat = (Math.floor(x / (S / 8)) + Math.floor(y / (S / 8))) % 2;
    const dirt = fbm(u, v, 3, 3, 42);
    const k = hash(x, y, 43) * 26 + n * 20 - Math.max(0, dirt - 0.58) * 50;
    return pat ? [70 + k, 78 + k, 104 + k] : [60 + k, 66 + k, 92 + k];
  });
  return c;
}

function floorConcrete(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 6, 5, 51);
    const stain = fbm(u, v, 2, 4, 52);
    let b = 140 + (n - 0.5) * 50 - Math.max(0, stain - 0.56) * 110;
    if (x % (S / 2) < 2 || y % (S / 2) < 2) b -= 40; // expansion joints
    if (hash(x, y, 53) > 0.99) b += 25;
    return [b, b * 0.98, b * 0.94];
  });
  // a few cracks
  ctx.strokeStyle = 'rgba(30,30,30,0.55)'; ctx.lineWidth = 1.3;
  for (let k = 0; k < 4; k++) {
    let x = rnd() * S, y = rnd() * S, a = rnd() * 6.28;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 0; i < 40; i++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 4; y += Math.sin(a) * 4; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  return c;
}

function grass(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 8, 4, 61);
    const patch = fbm(u, v, 2, 3, 62);
    const blade = hash(x, Math.floor(y / 3), 63);
    let r = 62 + n * 30 + blade * 20, g = 104 + n * 50 + blade * 30, b = 40 + n * 14;
    if (patch > 0.64) { const k = (patch - 0.64) * 3; r += (120 - r) * k; g += (98 - g) * k; b += (66 - b) * k; } // dirt patches
    return [r, g, b];
  });
  return c;
}

function asphalt(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 12, 4, 71);
    const oil = fbm(u, v, 2, 3, 72);
    let b = 64 + n * 30 + hash(x, y, 73) * 24 - Math.max(0, oil - 0.6) * 60;
    return [b, b, b * 1.02];
  });
  return c;
}

function ceiling(S) {
  const [c, ctx] = canvas(S);
  const ts = S / 3; // ~0.66m tiles
  paint(ctx, S, S, (u, v, x, y) => {
    let b = 222 - hash(x, y, 81) * 22 - fbm(u, v, 4, 3, 82) * 20;
    const lx = x % ts, ly = y % ts;
    if (lx < 3 || ly < 3) b = 150;
    return [b, b, b * 0.98];
  });
  return c;
}

function shelf(S) {
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#2b2d30'; ctx.fillRect(0, 0, S, S);
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const y0 = (i / levels) * S;
    ctx.fillStyle = '#16171a'; ctx.fillRect(0, y0, S, S / levels);
    // items on the shelf
    let x = 4;
    while (x < S - 10) {
      const w = 10 + rnd() * 40, h = (S / levels) * (0.4 + rnd() * 0.5);
      const hue = Math.floor(rnd() * 360);
      ctx.fillStyle = rnd() < 0.5 ? `hsl(${hue},35%,${35 + rnd() * 25}%)` : `hsl(30,40%,${45 + rnd() * 15}%)`;
      ctx.fillRect(x, y0 + S / levels - h - 6, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w - 3, y0 + S / levels - h - 6, 3, h);
      x += w + 2 + rnd() * 6;
    }
    ctx.fillStyle = '#6d7076'; ctx.fillRect(0, y0 + S / levels - 6, S, 6);
  }
  ctx.fillStyle = '#5a5d63'; ctx.fillRect(0, 0, 6, S); ctx.fillRect(S - 6, 0, 6, S);
  return c;
}

function counter(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u * 0.3, v * 4, 8, 3, 91);
    let r = 120 + n * 50, g = 84 + n * 34, b = 54 + n * 20;
    if (y % (S / 2) < 3) { r *= 0.5; g *= 0.5; b *= 0.5; }
    return [r, g, b];
  });
  return c;
}

function pillar(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 6, 4, 101);
    let b = 168 + (n - 0.5) * 40;
    if (y > S * 0.92) b -= 50; // dark base band
    if (y > S * 0.9 && y < S * 0.92) b += 10;
    return [b, b * 0.98, b * 0.94];
  });
  return c;
}

// Worn, stained floorboards for the trashed room (litter + scorch marks)
function floorDirty(S) {
  const c = floorWood(S); const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x / S, y / S, 4, 4, 401), m = fbm(x / S, y / S, 12, 2, 402);
    const k = 0.55 + n * 0.35 - Math.max(0, m - 0.6) * 0.6;
    const i = (y * S + x) * 4; d[i] *= k; d[i + 1] *= k * 0.97; d[i + 2] *= k * 0.9;
  }
  ctx.putImageData(img, 0, 0);
  // litter: paper scraps, cigarette butts, dark spills
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S;
    if (rnd() < 0.4) { ctx.fillStyle = `rgba(30,22,14,${0.3 + rnd() * 0.3})`; ctx.beginPath(); ctx.ellipse(x, y, 10 + rnd() * 30, 6 + rnd() * 18, rnd() * 3, 0, 7); ctx.fill(); }
    else if (rnd() < 0.7) { ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * 6); ctx.fillStyle = `rgba(${200 + rnd() * 40 | 0},${195 + rnd() * 40 | 0},180,0.85)`; ctx.fillRect(-8, -6, 14 + rnd() * 10, 10 + rnd() * 6); ctx.restore(); }
    else { ctx.fillStyle = '#d8c8a0'; ctx.fillRect(x, y, 6, 2); ctx.fillStyle = '#a05020'; ctx.fillRect(x + 6, y, 2, 2); }
  }
  return c;
}

// Painted block wall covered in spray-paint tags, peeling paint and grime
function wallGraffiti(S) {
  // covers 4 m of wall (2x2 tiles worth of blocks) so the tags repeat less
  const c = wallPainted(S, 2); const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x / S, y / S, 3, 4, 411);
    const k = 0.72 + n * 0.3;
    const i = (y * S + x) * 4; d[i] *= k; d[i + 1] *= k * 0.96; d[i + 2] *= k * 0.88;
  }
  ctx.putImageData(img, 0, 0);
  const cols = ['#e0245e', '#18a0e8', '#f2c200', '#2ecc40', '#ff6a00', '#9d4edd', '#111111', '#f5f5f5'];
  const words = ['KM', 'ZOOT', 'REKT', 'NOPE', 'WAS HERE', 'XO', 'BOOM', 'LOL', 'RUN'];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S * 0.8, y = S * 0.3 + rnd() * S * 0.6;
    ctx.save(); ctx.translate(x, y); ctx.rotate((rnd() - 0.5) * 0.4);
    ctx.font = `bold ${Math.floor(22 + rnd() * 22)}px Impact, Arial Black, sans-serif`;
    const col = cols[Math.floor(rnd() * cols.length)];
    ctx.strokeStyle = cols[Math.floor(rnd() * cols.length)]; ctx.lineWidth = 6; ctx.globalAlpha = 0.8;
    const w = words[Math.floor(rnd() * words.length)];
    ctx.strokeText(w, 0, 0); ctx.fillStyle = col; ctx.fillText(w, 0, 0);
    // paint drips
    ctx.fillStyle = col; for (let k = 0; k < 4; k++) ctx.fillRect(rnd() * 80, 4, 2, 8 + rnd() * 24);
    ctx.restore();
  }
  // squiggles
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = cols[Math.floor(rnd() * cols.length)]; ctx.globalAlpha = 0.7; ctx.lineWidth = 3 + rnd() * 3;
    ctx.beginPath(); let x = rnd() * S, y = S * 0.3 + rnd() * S * 0.5; ctx.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.3) * 50; y += (rnd() - 0.5) * 40; ctx.quadraticCurveTo(x - 20, y - 30, x, y); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}

// One spray-painted tag on a transparent background (used as a wall decal)
function graffitiDecal(seed) {
  const W = 256, H = 192; const [c, ctx] = canvas(W, H);
  const cols = ['#e0245e', '#18a0e8', '#f2c200', '#2ecc40', '#ff6a00', '#9d4edd', '#151515', '#f5f5f5'];
  const words = ['KM', 'ZOOT', 'REKT', 'NOPE', 'XO', 'BOOM', 'LOL', 'RUN', 'HIDE', 'WHO?'];
  const pick = (a, k) => a[Math.floor(hash(seed, k, 451) * a.length)];
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(W / 2, H * 0.55); ctx.rotate((hash(seed, 1, 452) - 0.5) * 0.35);
  const word = pick(words, 2), fill = pick(cols, 3), out = pick(cols, 4);
  ctx.font = `bold ${60 + Math.floor(hash(seed, 5, 453) * 26)}px Impact, Arial Black, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = out; ctx.lineWidth = 9; ctx.globalAlpha = 0.85; ctx.strokeText(word, 0, 0);
  ctx.fillStyle = fill; ctx.fillText(word, 0, 0);
  ctx.fillStyle = fill; for (let k = 0; k < 5; k++) ctx.fillRect(-60 + hash(seed, k + 10, 454) * 120, 22, 3, 10 + hash(seed, k, 455) * 30); // drips
  ctx.restore();
  // a squiggle / arrow
  ctx.strokeStyle = pick(cols, 6); ctx.globalAlpha = 0.75; ctx.lineWidth = 5;
  ctx.beginPath(); let x = 20 + hash(seed, 7, 456) * 40, y = 30 + hash(seed, 8, 457) * 30; ctx.moveTo(x, y);
  for (let k = 0; k < 5; k++) { x += 30 + hash(seed, k, 458) * 20; y += (hash(seed, k, 459) - 0.5) * 40; ctx.quadraticCurveTo(x - 15, y - 25, x, y); }
  ctx.stroke();
  // soft spray overspray around the edges
  const img = ctx.getImageData(0, 0, W, H), d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) d[i] = Math.min(255, d[i] * (0.75 + hash(i, seed, 460) * 0.25));
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Dirt / trash spot for floors (transparent): stains, spills, paper scraps, butts, crumbs
function floorDecal(seed) {
  const S = 256; const [c, ctx] = canvas(S);
  const R = (k) => hash(seed, k, 470);
  // grimy stains (soft blobs that fade out at the edges)
  for (let i = 0; i < 6; i++) {
    const x = S * (0.25 + R(i) * 0.5), y = S * (0.25 + R(i + 20) * 0.5), r = 30 + R(i + 40) * 55;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.45 + R(i + 60) * 0.3, tone = seed % 2 ? '38,26,14' : '52,42,22';
    g.addColorStop(0, `rgba(${tone},${a})`); g.addColorStop(0.7, `rgba(${tone},${a * 0.5})`); g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + R(i + 80) * 0.4), R(i + 90) * 3, 0, 7); ctx.fill();
  }
  if (seed % 3 === 0) { // a dried spill with a darker rim
    ctx.fillStyle = 'rgba(90,60,20,0.35)'; ctx.beginPath(); ctx.ellipse(S * 0.55, S * 0.5, 50, 30, 0.4, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(60,35,10,0.45)'; ctx.lineWidth = 3; ctx.stroke();
  }
  // paper scraps, napkins, wrappers
  for (let i = 0; i < 11; i++) {
    const x = S * (0.2 + R(i + 100) * 0.6), y = S * (0.2 + R(i + 120) * 0.6);
    ctx.save(); ctx.translate(x, y); ctx.rotate(R(i + 140) * 6.28);
    ctx.fillStyle = R(i + 160) < 0.6 ? 'rgba(235,230,215,0.95)' : `hsla(${Math.floor(R(i + 180) * 360)},60%,45%,0.9)`;
    const w = 14 + R(i + 200) * 22, h = 10 + R(i + 220) * 14;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2 + 2); ctx.lineTo(w / 2 - 2, h / 2); ctx.lineTo(-w / 2 + 1, h / 2 - 1); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // cigarette butts, bottle caps, crumbs
  for (let i = 0; i < 14; i++) {
    const x = S * (0.15 + R(i + 300) * 0.7), y = S * (0.15 + R(i + 320) * 0.7);
    ctx.save(); ctx.translate(x, y); ctx.rotate(R(i + 340) * 6.28);
    if (i % 3 === 0) { ctx.fillStyle = '#e8e0cc'; ctx.fillRect(-5, -1.5, 8, 3); ctx.fillStyle = '#c87a2a'; ctx.fillRect(3, -1.5, 3, 3); }
    else if (i % 3 === 1) { ctx.fillStyle = '#b8a040'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = 'rgba(120,80,40,0.8)'; for (let k = 0; k < 6; k++) ctx.fillRect(R(i * 9 + k) * 14 - 7, R(i * 9 + k + 50) * 14 - 7, 2, 2); }
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Library shelves: rows of books
function shelfBooks(S) {
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#3a2618'; ctx.fillRect(0, 0, S, S);
  const levels = 4, bookCols = ['#7a1f1f', '#1f3f7a', '#2f5f2f', '#6b4a1e', '#3a3a3a', '#8a6a2a', '#5a2a5a', '#204a4a', '#9a8a6a', '#6a2a1a'];
  for (let i = 0; i < levels; i++) {
    const y0 = (i / levels) * S, lh = S / levels;
    ctx.fillStyle = '#1e140c'; ctx.fillRect(0, y0, S, lh);
    let x = 4;
    while (x < S - 8) {
      if (rnd() < 0.06) { x += 10 + rnd() * 18; continue; } // a gap
      const w = 5 + rnd() * 9, h = lh * (0.62 + rnd() * 0.3);
      const col = bookCols[Math.floor(rnd() * bookCols.length)];
      ctx.fillStyle = col; ctx.fillRect(x, y0 + lh - h - 6, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y0 + lh - h - 6, 1.5, h);       // spine highlight
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + w - 1.5, y0 + lh - h - 6, 1.5, h);
      ctx.fillStyle = 'rgba(230,200,120,0.55)'; ctx.fillRect(x + 1, y0 + lh - h + 4, w - 2, 2); ctx.fillRect(x + 1, y0 + lh - 18, w - 2, 1.5); // gold bands
      x += w + 0.5;
    }
    ctx.fillStyle = '#5a3b22'; ctx.fillRect(0, y0 + lh - 6, S, 6);
  }
  ctx.fillStyle = '#4a3020'; ctx.fillRect(0, 0, 6, S); ctx.fillRect(S - 6, 0, 6, S);
  return c;
}

function takeoutTex(S) {
  const [c, ctx] = canvas(S);
  ctx.fillStyle = '#f2efe6'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#c0282d'; ctx.font = 'bold 34px serif'; ctx.textAlign = 'center';
  ctx.beginPath(); ctx.arc(S / 2, S * 0.55, 26, 0, 7); ctx.lineWidth = 4; ctx.strokeStyle = '#c0282d'; ctx.stroke();
  ctx.fillText('福', S / 2, S * 0.55 + 12);
  ctx.fillStyle = 'rgba(160,110,40,0.25)'; ctx.beginPath(); ctx.ellipse(S * 0.3, S * 0.85, 20, 10, 0, 0, 7); ctx.fill(); // grease stain
  return c;
}

// Flat concrete roof: tar seams, gravel, water stains
function roof(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 8, 4, 421), st = fbm(u, v, 2, 3, 422);
    let b = 132 + (n - 0.5) * 40 + hash(x, y, 423) * 22 - Math.max(0, st - 0.55) * 70;
    if (x % (S / 2) < 4 || y % (S / 2) < 4) b = 48; // tar-sealed joints
    return [b, b * 0.98, b * 0.95];
  });
  return c;
}

function mattress(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const stripe = (x % 24) < 12 ? 236 : 214;
    const stain = fbm(u, v, 3, 4, 431);
    const k = stain > 0.58 ? 1 - (stain - 0.58) * 1.6 : 1;
    return [stripe * k, stripe * k * 0.96, stripe * k * 0.86];
  });
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2;
  for (let y = 16; y < S; y += 32) for (let x = 16; x < S; x += 32) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.stroke(); }
  return c;
}

// ======================================================================
//  Props
// ======================================================================
function cardboard(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 8, 3, 111);
    const flute = (x % 4 < 1) ? -6 : 0;
    return [176 + n * 30 + flute, 134 + n * 24 + flute, 86 + n * 16];
  });
  ctx.fillStyle = 'rgba(220,200,150,0.75)'; ctx.fillRect(S * 0.42, 0, S * 0.16, S); // tape
  ctx.strokeStyle = 'rgba(70,45,20,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, S - 2, S - 2);
  return c;
}
function crate(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const pl = Math.floor(y / (S / 6));
    const n = fbm(u * 0.4 + pl, v * 6, 8, 3, 121);
    const t = hash(pl, 0, 122);
    let r = 150 + n * 40 + t * 20, g = 108 + n * 28 + t * 12, b = 64 + n * 14;
    if (y % (S / 6) < 2) { r *= 0.5; g *= 0.5; b *= 0.5; }
    return [r, g, b];
  });
  ctx.fillStyle = '#6b4824';
  const f = S * 0.11;
  ctx.fillRect(0, 0, S, f); ctx.fillRect(0, S - f, S, f); ctx.fillRect(0, 0, f, S); ctx.fillRect(S - f, 0, f, S);
  ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(Math.PI / 4); ctx.fillRect(-S * 0.7, -f / 2, S * 1.4, f); ctx.restore();
  ctx.fillStyle = '#333'; for (const [px, py] of [[f / 2, f / 2], [S - f / 2, f / 2], [f / 2, S - f / 2], [S - f / 2, S - f / 2]]) { ctx.beginPath(); ctx.arc(px, py, 3, 0, 7); ctx.fill(); }
  return c;
}
function woodProp(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v) => {
    const n = fbm(u * 0.3, v * 5, 8, 4, 131);
    const ring = Math.sin(n * 25) * 0.5 + 0.5;
    return [160 + ring * 25 - n * 30, 108 + ring * 14 - n * 22, 62 - n * 12];
  });
  return c;
}
function metal(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u * 0.2, v * 3, 8, 3, 141);
    const b = 120 + n * 40 + hash(x, y, 142) * 10;
    return [b, b * 1.02, b * 1.06];
  });
  return c;
}
function barrel(S) {
  const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 6, 4, 151);
    const rust = fbm(u, v, 3, 4, 152);
    let r = 40 + n * 25, g = 82 + n * 30, b = 150 + n * 40;
    if (rust > 0.6) { const k = (rust - 0.6) * 2.5; r += (120 - r) * k; g += (70 - g) * k; b += (40 - b) * k; }
    const ry = v % 0.33;
    if (ry < 0.03) { r *= 0.6; g *= 0.6; b *= 0.6; } else if (ry < 0.05) { r *= 1.25; g *= 1.25; b *= 1.25; }
    return [r, g, b];
  });
  return c;
}

// ======================================================================
//  Clothing (grayscale/white base: the material color tints them)
// ======================================================================
function fabric(ctx, S, s, amt = 14) {
  paint(ctx, S, S, (u, v, x, y) => {
    const n = fbm(u, v, 16, 2, s) * amt + ((x + y) % 3 === 0 ? -4 : 0);
    const b = 236 + n - amt / 2;
    return [b, b, b];
  });
}
// Torso lathe UV: u wraps around (front = 0.5), v bottom(0) -> top(1). Canvas y is flipped (top = v1).
function shirtTex(type) {
  const S = 256; const [c, ctx] = canvas(S);
  fabric(ctx, S, 160 + type.length);
  // soft fold shading
  const g = ctx.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.25, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, S - 10, S, 4); // hem
  const cx = S / 2;
  const dark = 'rgba(0,0,0,0.35)';
  if (type === 'tshirt') {
    ctx.strokeStyle = dark; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(cx, 0, 26, 22, 0, 0, Math.PI); ctx.stroke();
  }
  if (type === 'sweater') {
    // knit texture + ribbed hem and neck
    const img = ctx.getImageData(0, 0, S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = ((x % 8) < 4 ? 1 : -1) * ((Math.floor(y / 6) % 2) ? 6 : -6) + ((x % 8 === 0) ? -14 : 0);
      const i = (y * S + x) * 4; d[i] += k; d[i + 1] += k; d[i + 2] += k;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = 0; x < S; x += 6) { ctx.fillRect(x, S - 26, 3, 26); ctx.fillRect(x, 0, 3, 14); }
    // a simple stripe across the chest
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(0, 70, S, 10); ctx.fillRect(0, 86, S, 4);
  }
  if (type === 'dressshirt') {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.moveTo(cx - 30, 0); ctx.lineTo(cx, 26); ctx.lineTo(cx - 6, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 30, 0); ctx.lineTo(cx, 26); ctx.lineTo(cx + 6, 0); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 30, 0); ctx.lineTo(cx, 26); ctx.lineTo(cx + 30, 0); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx - 5, 20, 10, S);
    ctx.fillStyle = 'rgba(30,30,30,0.6)';
    for (let y = 34; y < S - 20; y += 26) { ctx.beginPath(); ctx.arc(cx, y, 2.6, 0, 7); ctx.fill(); }
    ctx.strokeStyle = dark; ctx.strokeRect(cx + 22, 60, 24, 26);
  }
  if (type === 'hoodie') {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.beginPath(); ctx.moveTo(cx - 44, S - 20); ctx.lineTo(cx - 34, S - 80); ctx.lineTo(cx + 34, S - 80); ctx.lineTo(cx + 44, S - 20); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(250,250,250,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - 10, 10); ctx.lineTo(cx - 12, 60); ctx.moveTo(cx + 10, 10); ctx.lineTo(cx + 12, 60); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, S - 22, S, 12);
  }
  if (type === 'jacket') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(cx - 3, 0, 6, S);
    ctx.fillStyle = 'rgba(200,200,200,0.8)'; for (let y = 4; y < S; y += 6) ctx.fillRect(cx - 1, y, 2, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(cx - 60, S - 90, 30, 4); ctx.fillRect(cx + 30, S - 90, 30, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, S - 16, S, 10);
    ctx.beginPath(); ctx.moveTo(cx - 34, 0); ctx.lineTo(cx - 4, 50); ctx.lineTo(cx - 4, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx + 34, 0); ctx.lineTo(cx + 4, 50); ctx.lineTo(cx + 4, 0); ctx.fill();
  }
  return tex(c, false);
}
function sleeveTex() {
  const S = 64; const [c, ctx] = canvas(S);
  fabric(ctx, S, 170, 10);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, S - 5, S, 4);
  return tex(c, false);
}
function knitSleeveTex() {
  const S = 64; const [c, ctx] = canvas(S);
  paint(ctx, S, S, (u, v, x, y) => { const k = ((x % 8) < 4 ? 1 : -1) * ((Math.floor(y / 6) % 2) ? 7 : -7); const b = 230 + k; return [b, b, b]; });
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let x = 0; x < S; x += 4) ctx.fillRect(x, S - 10, 2, 10);
  return tex(c, false);
}
function pantsTex(type) {
  const S = 128; const [c, ctx] = canvas(S);
  if (type === 'jeans') {
    paint(ctx, S, S, (u, v, x, y) => { const t = ((x + y) % 4 < 2) ? 10 : -6; const n = fbm(u, v, 8, 3, 171) * 30; const b = 215 + t + n - 15; return [b, b, b]; });
    ctx.strokeStyle = 'rgba(255,220,140,0.9)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5;
    for (const x of [S * 0.25, S * 0.75]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, S); ctx.stroke(); }
  } else {
    fabric(ctx, S, 172 + type.length, 10);
  }
  if (type === 'slacks') { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(S / 2 - 1, 0, 2, S); }
  if (type === 'cargo') { ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (const x of [S * 0.25, S * 0.75]) ctx.fillRect(x - 12, S * 0.35, 24, 30); }
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(0, S - 5, S, 4);
  return tex(c, false);
}
// Pelvis (has the belt + pockets)
function hipsTex(type) {
  const S = 128; const [c, ctx] = canvas(S);
  fabric(ctx, S, 180, 12);
  ctx.fillStyle = 'rgba(25,20,15,0.9)'; ctx.fillRect(0, 0, S, 12); // belt (top of lathe = canvas top)
  ctx.fillStyle = '#c9a54a'; ctx.fillRect(S / 2 - 6, 1, 12, 10);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(S * 0.32, 12, 14, 0, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(S * 0.68, 12, 14, 0, Math.PI); ctx.stroke();
  if (type === 'jeans') { ctx.strokeStyle = 'rgba(255,220,140,0.9)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(S / 2, 12); ctx.lineTo(S / 2, S); ctx.stroke(); }
  return tex(c, false);
}

// ======================================================================
export function makeTextures(renderer, quality = 'medium') {
  RENDERER = renderer;
  const S = quality === 'low' ? 256 : 512;
  const T = {};
  T.wallPainted = tex(wallPainted(S));
  T.wallConcrete = tex(wallConcrete(S));
  T.floorTile = tex(floorTile(S));
  T.floorWood = tex(floorWood(S));
  T.floorCarpet = tex(floorCarpet(256));
  T.floorConcrete = tex(floorConcrete(S));
  T.grass = tex(grass(S));
  T.asphalt = tex(asphalt(256));
  T.ceiling = tex(ceiling(256));
  T.shelf = tex(shelf(256));
  T.counter = tex(counter(256));
  T.pillar = tex(pillar(256));
  T.floorDirty = tex(floorDirty(S));
  T.graffiti = [0, 1, 2, 3, 4].map((i) => graffitiDecal(i + 1));
  T.floorDecals = [0, 1, 2, 3].map((i) => floorDecal(i + 1));
  T.shelfBooks = tex(shelfBooks(256));
  T.takeout = tex(takeoutTex(128));
  T.roof = tex(roof(256));
  T.mattress = tex(mattress(128));
  T.cardboard = tex(cardboard(128));
  T.crate = tex(crate(256));
  T.wood = tex(woodProp(128));
  T.metal = tex(metal(128));
  T.barrel = tex(barrel(256));
  T.shirt = {};
  for (const s of ['tshirt', 'dressshirt', 'sweater']) T.shirt[s] = shirtTex(s);
  T.sleeve = sleeveTex();
  T.sleeveKnit = knitSleeveTex();
  T.pants = {}; T.hips = {};
  for (const p of ['jeans', 'slacks', 'cargo', 'shorts', 'sweats']) { T.pants[p] = pantsTex(p); T.hips[p] = hipsTex(p); }

  // Sky
  {
    const [c, ctx] = canvas(1024, 512);
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#2f63ad'); g.addColorStop(0.5, '#86b4e3'); g.addColorStop(1, '#e4ecf2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
    const img = ctx.getImageData(0, 0, 1024, 512);
    const d = img.data;
    for (let y = 0; y < 300; y++) for (let x = 0; x < 1024; x++) {
      const n = fbm(x / 1024, y / 512, 4, 5, 191);
      const top = Math.min(1, Math.max(0, (y - 60) / 90));       // fade clouds out toward the zenith
      const cl = Math.max(0, n - 0.52) * 3 * (1 - y / 300) * top;
      const i = (y * 1024 + x) * 4;
      d[i] += (255 - d[i]) * cl; d[i + 1] += (255 - d[i + 1]) * cl; d[i + 2] += (255 - d[i + 2]) * cl;
    }
    ctx.putImageData(img, 0, 0);
    T.sky = new THREE.CanvasTexture(c); T.sky.colorSpace = THREE.SRGBColorSpace; T.sky.wrapS = THREE.RepeatWrapping;
  }
  // blob shadow
  {
    const [c, ctx] = canvas(64);
    const rg = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(0,0,0,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, 64, 64);
    T.blob = new THREE.CanvasTexture(c);
  }
  // soft glow sprite (light fixtures / muzzle)
  {
    const [c, ctx] = canvas(64);
    const rg = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,250,235,0.9)'); rg.addColorStop(0.4, 'rgba(255,240,200,0.25)'); rg.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, 64, 64);
    T.glow = new THREE.CanvasTexture(c);
  }
  return T;
}
