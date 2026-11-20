// =====================================================================
//  PROPS.JS — movable physics furniture (boxes, crates, chairs, tables,
//  barrels). The host simulates them; clients just show them.
//  Collision shape = upright cylinder (radius r, height h) so pushing,
//  sliding and standing on them is smooth and cheap.
// =====================================================================
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { resolveWalls, groundHeightCells } from './physics.js';

export const PROP_TYPES = {
  box:    { r: 0.33, h: 0.58, mass: 1.2, sound: 'cardboard' },
  crate:  { r: 0.5,  h: 0.92, mass: 6.0, sound: 'wood' },
  chair:  { r: 0.29, h: 0.47, mass: 1.0, sound: 'wood' },
  table:  { r: 0.62, h: 0.76, mass: 3.5, sound: 'wood' },
  barrel: { r: 0.33, h: 0.94, mass: 4.5, sound: 'metal' },
};
const TYPE_IDS = Object.keys(PROP_TYPES);
const CHAR_MASS = 3;
const FRICTION = 7;     // m/s^2 sliding friction
const r2 = (v) => Math.round(v * 100) / 100;

// ---------- geometry helpers ----------
function mergeParts(parts) {
  // parts: [{geo, mat (index), m: Matrix4}] -> one BufferGeometry with material groups
  const pos = [], nor = [], uv = [], groups = [];
  let start = 0;
  parts.sort((a, b) => a.mat - b.mat);
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g.applyMatrix4(p.m);
    const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array;
    pos.push(...P); nor.push(...N); uv.push(...U);
    const count = P.length / 3;
    const last = groups[groups.length - 1];
    if (last && last.mat === p.mat) last.count += count; else groups.push({ start, count, mat: p.mat });
    start += count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const g of groups) out.addGroup(g.start, g.count, g.mat);
  out.computeBoundingSphere();
  return out;
}
const M = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));

let GEO = null;
function geometries() {
  if (GEO) return GEO;
  GEO = {};
  GEO.box = mergeParts([{ geo: new THREE.BoxGeometry(0.6, 0.56, 0.56), mat: 0, m: M(0, 0.28, 0) }]);
  GEO.crate = mergeParts([{ geo: new THREE.BoxGeometry(0.9, 0.9, 0.9), mat: 0, m: M(0, 0.45, 0) }]);
  {
    const p = [];
    p.push({ geo: new THREE.BoxGeometry(0.44, 0.05, 0.42), mat: 0, m: M(0, 0.45, 0) });          // seat
    p.push({ geo: new THREE.BoxGeometry(0.44, 0.42, 0.04), mat: 0, m: M(0, 0.7, 0.2, -0.08) });   // back (behind = +z)
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) p.push({ geo: new THREE.CylinderGeometry(0.018, 0.016, 0.44, 6), mat: 1, m: M(x, 0.22, z) });
    for (const x of [-0.19, 0.19]) p.push({ geo: new THREE.CylinderGeometry(0.016, 0.016, 0.46, 6), mat: 1, m: M(x, 0.68, 0.205, -0.08) });
    GEO.chair = mergeParts(p);
  }
  {
    const p = [];
    p.push({ geo: new THREE.CylinderGeometry(0.62, 0.62, 0.045, 24), mat: 0, m: M(0, 0.74, 0) });
    p.push({ geo: new THREE.CylinderGeometry(0.045, 0.055, 0.7, 10), mat: 1, m: M(0, 0.37, 0) });
    p.push({ geo: new THREE.CylinderGeometry(0.32, 0.34, 0.04, 16), mat: 1, m: M(0, 0.02, 0) });
    GEO.table = mergeParts(p);
  }
  {
    const p = [];
    p.push({ geo: new THREE.CylinderGeometry(0.31, 0.31, 0.9, 18, 1, true), mat: 0, m: M(0, 0.45, 0) });
    p.push({ geo: new THREE.CircleGeometry(0.31, 18), mat: 1, m: M(0, 0.9, 0, -Math.PI / 2) });
    for (const y of [0.04, 0.3, 0.6, 0.86]) p.push({ geo: new THREE.TorusGeometry(0.315, 0.018, 4, 18), mat: 1, m: M(0, y, 0, Math.PI / 2) });
    GEO.barrel = mergeParts(p);
  }
  return GEO;
}

export class PropSystem {
  constructor(map, root, T, isHost) {
    this.map = map;
    this.root = root;
    this.isHost = isHost;
    this.list = [];
    this.lastSent = new Map();
    this.fullT = 0;
    this.events = []; // impact sounds etc. drained by the game
    const G = geometries();
    const mats = {
      box: [T.cardboard], crate: [T.crate], chair: [T.wood, T.metal], table: [T.wood, T.metal], barrel: [T.barrel, T.metal],
    };
    map.propSpawns.forEach((s, id) => {
      const def = PROP_TYPES[s.type];
      const ms = mats[s.type].map((t) => new THREE.MeshLambertMaterial({ map: t }));
      const mesh = new THREE.Mesh(G[s.type], ms.length > 1 ? ms : ms[0]);
      mesh.matrixAutoUpdate = true;
      root.add(mesh);
      const p = {
        id, type: s.type, def, r: def.r, h: def.h, mass: def.mass,
        x: s.x, y: 0, z: s.z, yaw: s.yaw, vx: 0, vy: 0, vz: 0, spin: 0,
        home: { x: s.x, z: s.z, yaw: s.yaw }, sleep: 99, mesh, mats: ms,
        rx: s.x, ry: 0, rz: s.z, ryaw: s.yaw, lightT: 0, light: [1, 1, 1],
      };
      this.list.push(p);
    });
    map.props = this.list;
    this.tint = new THREE.Color();
  }

  reset() {
    for (const p of this.list) {
      p.x = p.home.x; p.z = p.home.z; p.y = 0; p.yaw = p.home.yaw;
      p.vx = p.vy = p.vz = p.spin = 0; p.sleep = 99;
      p.rx = p.x; p.rz = p.z; p.ry = 0; p.ryaw = p.yaw; p.lightT = 0;
    }
    this.fullT = 0;
  }

  wake(p) { p.sleep = 0; }

  // Push a prop (bullets, knives)
  impulse(p, ix, iy, iz, spin = 0) {
    p.vx += ix / p.mass; p.vy += iy / p.mass; p.vz += iz / p.mass;
    p.spin += spin / p.mass;
    this.wake(p);
  }

  // Ray vs prop cylinders. Returns {prop, t} of the nearest hit or null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null, bt = maxT;
    for (const p of this.list) {
      const px = ox - p.x, pz = oz - p.z;
      const a = dx * dx + dz * dz;
      let t0 = -Infinity, t1 = Infinity;
      const R = p.r * 0.9;
      if (a > 1e-9) {
        const b = 2 * (px * dx + pz * dz), c = px * px + pz * pz - R * R;
        const disc = b * b - 4 * a * c;
        if (disc < 0) continue;
        const s = Math.sqrt(disc);
        t0 = (-b - s) / (2 * a); t1 = (-b + s) / (2 * a);
      } else if (px * px + pz * pz > R * R) continue;
      if (Math.abs(dy) > 1e-9) {
        let ta = (p.y - oy) / dy, tb = (p.y + p.h - oy) / dy;
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      } else if (oy < p.y || oy > p.y + p.h) continue;
      if (t0 > t1 || t1 < 0) continue;
      const t = Math.max(0, t0);
      // chairs / tables are mostly air: only the upper part blocks bullets
      if ((p.type === 'chair' || p.type === 'table') && oy + dy * t < p.y + p.h - 0.12) continue;
      if (t < bt) { bt = t; best = p; }
    }
    return best ? { prop: best, t: bt } : null;
  }

  // ---------------- host simulation ----------------
  step(dt, chars) {
    const list = this.list;
    // characters push props
    for (const c of chars) {
      if (!c.alive) continue;
      for (const p of list) {
        const dx = p.x - c.x, dz = p.z - c.z;
        const R = p.r + CONFIG.PLAYER.RADIUS;
        if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
        if (c.y >= p.y + p.h - 0.25 || c.y + CONFIG.PLAYER.HEIGHT < p.y) continue; // standing on top / above
        const d = Math.hypot(dx, dz);
        if (d >= R || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d, over = R - d;
        if (c.isBot) {
          const k = CHAR_MASS / (CHAR_MASS + p.mass);
          p.x += nx * over * k; p.z += nz * over * k;
          c.x -= nx * over * (1 - k); c.z -= nz * over * (1 - k);
        } else {
          p.x += nx * over; p.z += nz * over; // human positions are client-authoritative
        }
        const vc = c.vx * nx + c.vz * nz, vp = p.vx * nx + p.vz * nz;
        if (vc > vp) {
          const k = (CHAR_MASS / (CHAR_MASS + p.mass)) * 1.5;
          p.vx += nx * (vc - vp) * k; p.vz += nz * (vc - vp) * k;
          // off-center pushes make it turn
          p.spin += ((c.vx * nz - c.vz * nx) * 0.6) / p.mass;
        }
        this.wake(p);
      }
    }
    // props vs props
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (a.sleep > 1 && b.sleep > 1) continue;
        const dx = b.x - a.x, dz = b.z - a.z, R = a.r + b.r;
        if (Math.abs(dx) > R || Math.abs(dz) > R) continue;
        if (a.y >= b.y + b.h - 0.05 || b.y >= a.y + a.h - 0.05) continue;
        const d = Math.hypot(dx, dz);
        if (d >= R || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d, over = R - d, tm = a.mass + b.mass;
        a.x -= nx * over * (b.mass / tm); a.z -= nz * over * (b.mass / tm);
        b.x += nx * over * (a.mass / tm); b.z += nz * over * (a.mass / tm);
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const j2 = (-(1 + 0.25) * rel) / (1 / a.mass + 1 / b.mass);
          a.vx -= (j2 / a.mass) * nx; a.vz -= (j2 / a.mass) * nz;
          b.vx += (j2 / b.mass) * nx; b.vz += (j2 / b.mass) * nz;
          if (-rel > 2) this.events.push({ p: b, s: -rel });
        }
        this.wake(a); this.wake(b);
      }
    }
    // integrate
    for (const p of list) {
      if (p.sleep > 1) continue;
      p.vy -= 18 * dt;
      p.y += p.vy * dt;
      // support: floor / solid furniture / other props below
      let sup = groundHeightCells(this.map, p.x, p.z, p.r * 0.7, p.y + 0.3);
      for (const o of list) {
        if (o === p) continue;
        const top = o.y + o.h;
        if (top > p.y + 0.3 || top <= sup) continue;
        if (Math.hypot(o.x - p.x, o.z - p.z) < (o.r + p.r) * 0.75) sup = top;
      }
      let ground = false;
      if (p.y <= sup) {
        if (p.vy < -3) this.events.push({ p, s: -p.vy });
        p.y = sup; p.vy = 0; ground = true;
      }
      const sp = Math.hypot(p.vx, p.vz);
      if (ground && sp > 0) {
        const ns = Math.max(0, sp - FRICTION * dt);
        p.vx *= ns / sp; p.vz *= ns / sp;
      }
      const bx = p.x, bz = p.z;
      p.x += p.vx * dt; p.z += p.vz * dt;
      const pos = { x: p.x, z: p.z };
      resolveWalls(this.map, pos, p.r, p.y);
      if (Math.abs(pos.x - p.x) > 1e-4) { if (Math.abs(p.vx) > 2.5) this.events.push({ p, s: Math.abs(p.vx) }); p.vx *= -0.3; }
      if (Math.abs(pos.z - p.z) > 1e-4) { if (Math.abs(p.vz) > 2.5) this.events.push({ p, s: Math.abs(p.vz) }); p.vz *= -0.3; }
      p.x = pos.x; p.z = pos.z;
      p.yaw += p.spin * dt;
      p.spin *= Math.exp(-(ground ? 4 : 0.5) * dt);
      const moving = Math.hypot(p.x - bx, p.z - bz) > 1e-4 || Math.abs(p.vy) > 0.01 || Math.abs(p.spin) > 0.01 || !ground;
      p.sleep = moving ? 0 : p.sleep + dt;
    }
  }

  // Snapshot of props that moved (or all of them every 2s)
  snapshot(dt) {
    this.fullT -= dt;
    const full = this.fullT <= 0;
    if (full) this.fullT = 2;
    const out = [];
    for (const p of this.list) {
      const last = this.lastSent.get(p.id);
      if (!full && last && Math.abs(last[0] - p.x) < 0.01 && Math.abs(last[1] - p.y) < 0.01 && Math.abs(last[2] - p.z) < 0.01 && Math.abs(last[3] - p.yaw) < 0.01) continue;
      this.lastSent.set(p.id, [p.x, p.y, p.z, p.yaw]);
      out.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw)]);
    }
    return out;
  }
  fullState() { return this.list.map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw)]); }

  applyState(arr) {
    for (const [id, x, y, z, yaw] of arr) {
      const p = this.list[id];
      if (!p) continue;
      p.x = x; p.y = y; p.z = z; p.yaw = yaw;
    }
  }

  // ---------------- rendering ----------------
  render(dt, lampsDynamic) {
    const k = this.isHost ? 1 : Math.min(1, dt * 14);
    for (const p of this.list) {
      if (Math.hypot(p.x - p.rx, p.z - p.rz) > 3) { p.rx = p.x; p.rz = p.z; p.ry = p.y; p.ryaw = p.yaw; }
      p.rx += (p.x - p.rx) * k; p.ry += (p.y - p.ry) * k; p.rz += (p.z - p.rz) * k;
      p.ryaw += (p.yaw - p.ryaw) * k;
      p.mesh.position.set(p.rx, p.ry, p.rz);
      p.mesh.rotation.y = p.ryaw;
      // light probe tint (cheap: only refreshed now and then)
      p.lightT -= dt;
      if (p.lightT <= 0) {
        p.lightT = 0.4 + Math.random() * 0.3;
        this.map.probe(p.rx, p.rz, !lampsDynamic, p.light);
        for (const m of p.mats) m.color.setRGB(p.light[0], p.light[1], p.light[2]);
      }
    }
  }
}

export { TYPE_IDS };
