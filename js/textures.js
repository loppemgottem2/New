// Procedural "developer style" textures drawn on canvases at startup.
// No image files needed. Each texture tiles once per `size` meters (see map.js).
import * as THREE from '../vendor/three.module.min.js';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(ctx, size, amount, alpha = 0.08) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalAlpha = 1;
}

function toTex(c, renderer) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 1;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Grid-style measure texture (classic "dev map" look)
function devGrid(base, line, sub, label) {
  const S = 256;
  const [c, ctx] = canvas(S);
  ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
  noise(ctx, S, 14);
  // sub grid (every 1/4)
  ctx.strokeStyle = sub; ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    const p = (i * S) / 4;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }
  // main border
  ctx.strokeStyle = line; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, S - 6, S - 6);
  if (label) {
    ctx.fillStyle = line; ctx.font = 'bold 22px monospace';
    ctx.fillText(label, 12, 32);
  }
  return c;
}

export function makeTextures(renderer) {
  const T = {};

  // Indoor floor: orange dev grid
  T.floor = toTex(devGrid('#c8742e', '#8a4a18', 'rgba(255,220,180,0.35)', '2m'), renderer);

  // Walls: light grey measure grid
  T.wall = toTex(devGrid('#b4b4b0', '#7a7a76', 'rgba(255,255,255,0.35)', ''), renderer);

  // Ceiling: white acoustic panels
  {
    const S = 256; const [c, ctx] = canvas(S);
    ctx.fillStyle = '#d8d8d4'; ctx.fillRect(0, 0, S, S);
    noise(ctx, S, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 400; i++) ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
    ctx.strokeStyle = '#9a9a96'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, S - 4, S - 4);
    ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    T.ceiling = toTex(c, renderer);
  }

  // Outdoor ground: grass
  {
    const S = 256; const [c, ctx] = canvas(S);
    ctx.fillStyle = '#4f7a34'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 5000; i++) {
      const g = 90 + Math.random() * 70;
      ctx.fillStyle = `rgba(${g * 0.55 | 0},${g | 0},${g * 0.35 | 0},0.5)`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 2, 3 + Math.random() * 3);
    }
    T.grass = toTex(c, renderer);
  }

  // Concrete (pillars / trim)
  {
    const S = 256; const [c, ctx] = canvas(S);
    ctx.fillStyle = '#7d7d7d'; ctx.fillRect(0, 0, S, S);
    noise(ctx, S, 30);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2); ctx.stroke();
    T.concrete = toTex(c, renderer);
  }

  // Wooden crate
  {
    const S = 256; const [c, ctx] = canvas(S);
    ctx.fillStyle = '#9c6b37'; ctx.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 32) {
      ctx.fillStyle = y % 64 ? '#a87540' : '#93622f';
      ctx.fillRect(0, y, S, 30);
      ctx.fillStyle = 'rgba(60,30,10,0.5)'; ctx.fillRect(0, y + 30, S, 2);
    }
    noise(ctx, S, 20);
    ctx.strokeStyle = '#5c3a18'; ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, S - 18, S - 18);
    ctx.beginPath(); ctx.moveTo(18, 18); ctx.lineTo(S - 18, S - 18); ctx.stroke();
    T.crate = toTex(c, renderer);
  }

  // Brick (half walls)
  {
    const S = 256; const [c, ctx] = canvas(S);
    ctx.fillStyle = '#c9c4b8'; ctx.fillRect(0, 0, S, S);
    const bh = 32, bw = 64;
    for (let row = 0; row < S / bh; row++) {
      const off = (row % 2) * (bw / 2);
      for (let x = -bw; x < S + bw; x += bw) {
        const r = 150 + Math.random() * 30;
        ctx.fillStyle = `rgb(${r | 0},${(r * 0.45) | 0},${(r * 0.35) | 0})`;
        ctx.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
      }
    }
    noise(ctx, S, 16);
    T.brick = toTex(c, renderer);
  }

  // Sky: vertical gradient with soft clouds
  {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3d76c4'); g.addColorStop(0.55, '#8fbbe8'); g.addColorStop(1, '#dfeaf2');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * W, y = 30 + Math.random() * H * 0.5, r = 12 + Math.random() * 40;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    T.sky = t;
  }

  // Soft round shadow blob used under characters
  {
    const S = 64; const [c, ctx] = canvas(S);
    const rg = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.fillRect(0, 0, S, S);
    T.blob = new THREE.CanvasTexture(c);
  }

  // Face (eyes + mouth) for character heads
  {
    const S = 128; const [c, ctx] = canvas(S);
    ctx.fillStyle = '#e0b48c'; ctx.fillRect(0, 0, S, S);
    // SphereGeometry maps the -Z side (the character's front) to u = 0.75 -> x = 96
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(82, 52, 10, 7); ctx.fillRect(101, 52, 10, 7);
    ctx.fillStyle = '#222';
    ctx.fillRect(86, 53, 5, 6); ctx.fillRect(104, 53, 5, 6);
    ctx.fillStyle = '#5a3020'; ctx.fillRect(80, 46, 14, 3); ctx.fillRect(99, 46, 14, 3);
    ctx.fillStyle = '#9a5a48'; ctx.fillRect(89, 76, 16, 3);
    T.face = new THREE.CanvasTexture(c);
    T.face.colorSpace = THREE.SRGBColorSpace;
  }

  return T;
}
