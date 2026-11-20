// Character movement, collisions against the grid map, and raycasts.
import { CONFIG } from './config.js';
import { CELL, CEIL_H, WALL_H } from './map.js';

const P = CONFIG.PLAYER;

// ---------------------------------------------------------------------
//  Walls: push a circle (x,z,r) out of every cell that is taller than
//  the character can step onto.
// ---------------------------------------------------------------------
export function resolveWalls(map, pos, r, feetY) {
  const maxH = feetY + P.STEP_HEIGHT;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    const cx0 = Math.floor((pos.x - r) / CELL), cx1 = Math.floor((pos.x + r) / CELL);
    const cz0 = Math.floor((pos.z - r) / CELL), cz1 = Math.floor((pos.z + r) / CELL);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (map.cellHeight(cx, cz) <= maxH) continue;
        const minX = cx * CELL, maxX = minX + CELL, minZ = cz * CELL, maxZ = minZ + CELL;
        const nx = Math.max(minX, Math.min(pos.x, maxX));
        const nz = Math.max(minZ, Math.min(pos.z, maxZ));
        let dx = pos.x - nx, dz = pos.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else {
          // center inside the cell: push out along the smallest axis
          const l = pos.x - minX, rr = maxX - pos.x, t = pos.z - minZ, b = maxZ - pos.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) pos.x = minX - r; else if (m === rr) pos.x = maxX + r;
          else if (m === t) pos.z = minZ - r; else pos.z = maxZ + r;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

// Highest surface under a circle that is at most `maxY` high.
export function groundHeight(map, x, z, r, maxY) {
  let g = 0;
  const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
  const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    const h = map.cellHeight(cx, cz);
    if (h > g && h <= maxY) {
      // make sure the circle really overlaps this cell
      const nx = Math.max(cx * CELL, Math.min(x, cx * CELL + CELL));
      const nz = Math.max(cz * CELL, Math.min(z, cz * CELL + CELL));
      if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) g = h;
    }
  }
  return g;
}

// True if a circle at (x,z) does not overlap any blocking cell (used by bot path smoothing)
export function circleFree(map, x, z, r) {
  const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
  const cz0 = Math.floor((z - r) / CELL), cz1 = Math.floor((z + r) / CELL);
  for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
    if (map.cellHeight(cx, cz) <= P.STEP_HEIGHT) continue;
    const nx = Math.max(cx * CELL, Math.min(x, cx * CELL + CELL));
    const nz = Math.max(cz * CELL, Math.min(z, cz * CELL + CELL));
    if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return false;
  }
  return true;
}

// ---------------------------------------------------------------------
//  Full movement step for a character (players AND bots use this).
//  input: { mx, mz } world-space wish direction (length 0..1), run, jump
// ---------------------------------------------------------------------
export function moveCharacter(ch, input, dt, map) {
  const moving = Math.abs(input.mx) + Math.abs(input.mz) > 0.01;

  // Stamina
  let run = !!input.run && moving && !ch.exhausted;
  if (run) ch.stamina = Math.max(0, ch.stamina - P.STAMINA_DRAIN * dt);
  else ch.stamina = Math.min(P.STAMINA_MAX, ch.stamina + P.STAMINA_REGEN * dt);
  if (ch.stamina <= 0) ch.exhausted = true;
  if (ch.exhausted && ch.stamina >= P.STAMINA_RECOVER_AT) ch.exhausted = false;
  if (ch.exhausted) run = false;
  ch.running = run;

  const speed = run ? P.RUN_SPEED : P.WALK_SPEED;
  const wx = input.mx * speed, wz = input.mz * speed;
  const accel = ch.onGround ? P.GROUND_ACCEL : P.AIR_ACCEL;
  let dvx = wx - ch.vx, dvz = wz - ch.vz;
  if (!ch.onGround && !moving) { dvx = 0; dvz = 0; } // keep momentum in the air
  const dl = Math.hypot(dvx, dvz), maxd = accel * dt;
  if (dl > maxd) { dvx *= maxd / dl; dvz *= maxd / dl; }
  ch.vx += dvx; ch.vz += dvz;

  ch.landed = 0;
  if (input.jump && ch.onGround) {
    ch.vy = P.JUMP_SPEED; ch.onGround = false; ch.jumped = true;
  }
  ch.vy -= P.GRAVITY * dt;
  if (ch.vy < -40) ch.vy = -40;

  // Horizontal, in small sub-steps so we never tunnel through walls
  const r = P.RADIUS;
  const travel = Math.hypot(ch.vx, ch.vz) * dt;
  const n = Math.max(1, Math.ceil(travel / 0.2));
  const pos = { x: ch.x, z: ch.z };
  for (let i = 0; i < n; i++) {
    pos.x += (ch.vx * dt) / n; pos.z += (ch.vz * dt) / n;
    resolveWalls(map, pos, r, ch.y);
  }
  // Kill the part of the velocity that went into a wall (so you slide instead of sticking)
  if (dt > 0) {
    const realVx = (pos.x - ch.x) / dt, realVz = (pos.z - ch.z) / dt;
    if (Math.abs(realVx) < Math.abs(ch.vx) - 0.3) ch.vx = realVx;
    if (Math.abs(realVz) < Math.abs(ch.vz) - 0.3) ch.vz = realVz;
  }
  ch.x = pos.x; ch.z = pos.z;

  // Vertical
  const prevY = ch.y;
  ch.y += ch.vy * dt;
  const g = groundHeight(map, ch.x, ch.z, r * 0.85, Math.max(prevY, ch.y) + P.STEP_HEIGHT);
  if (ch.y <= g) {
    if (!ch.onGround && ch.vy < -6) ch.landed = -ch.vy;
    ch.y = g; ch.vy = 0; ch.onGround = true;
  } else if (ch.onGround && ch.vy <= 0 && ch.y - g < P.STEP_HEIGHT) {
    ch.y = g; ch.vy = 0; // walk down small steps smoothly
  } else {
    ch.onGround = false;
  }
  // Ceiling
  if (!map.isOutdoor(ch.x, ch.z) && ch.y + P.HEIGHT > CEIL_H) { ch.y = CEIL_H - P.HEIGHT; if (ch.vy > 0) ch.vy = 0; }
  if (ch.y < -5) { ch.y = 0; } // safety
  ch.speed = Math.hypot(ch.vx, ch.vz);
}

// Push overlapping characters apart (soft). `movable(c)` says who may be moved.
export function separateCharacters(list, map, movable) {
  const r2 = P.RADIUS * 2;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive) continue;
      if (Math.abs(a.y - b.y) > P.HEIGHT * 0.9) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= r2) continue;
      if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz); }
      const push = (r2 - d) * 0.5;
      const ma = movable(a), mb = movable(b);
      const fa = ma && mb ? 1 : ma ? 2 : 0, fb = ma && mb ? 1 : mb ? 2 : 0;
      a.x -= (dx / d) * push * fa; a.z -= (dz / d) * push * fa;
      b.x += (dx / d) * push * fb; b.z += (dz / d) * push * fb;
    }
  }
  for (const c of list) if (c.alive && movable(c)) {
    const p = { x: c.x, z: c.z }; resolveWalls(map, p, P.RADIUS, c.y); c.x = p.x; c.z = p.z;
  }
}

// ---------------------------------------------------------------------
//  Raycast through the grid (3D ray, 2D grid DDA with heights).
//  Returns distance to the first solid hit, or maxDist.
// ---------------------------------------------------------------------
export function raycastMap(map, ox, oy, oz, dx, dy, dz, maxDist) {
  let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const adx = Math.abs(dx), adz = Math.abs(dz);
  const tDX = adx > 1e-9 ? CELL / adx : Infinity;
  const tDZ = adz > 1e-9 ? CELL / adz : Infinity;
  let tMX = adx > 1e-9 ? (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / adx : Infinity;
  let tMZ = adz > 1e-9 ? (dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / adz : Infinity;
  const tFloor = dy < -1e-9 ? -oy / dy : Infinity;
  let t = 0;
  for (let guard = 0; guard < 512 && t < maxDist; guard++) {
    if (!map.inBounds(cx, cz)) return t;
    const tNext = Math.min(tMX, tMZ);
    const tEnd = Math.min(tNext, maxDist);
    const h = map.cellHeight(cx, cz);
    if (h > 0) {
      const y0 = oy + dy * t, y1 = oy + dy * tEnd;
      if (y0 < h) return t;
      if (y1 < h) return (h - oy) / dy;
    }
    if (dy > 0 && !map.isOutdoorCell(cx, cz)) {
      const y1 = oy + dy * tEnd;
      if (y1 > CEIL_H) return Math.max(t, (CEIL_H - oy) / dy);
    }
    if (tFloor <= tEnd) return tFloor;
    t = tNext;
    if (tMX < tMZ) { tMX += tDX; cx += stepX; } else { tMZ += tDZ; cz += stepZ; }
  }
  return Math.min(t, maxDist);
}

// Line of sight between two points
export function hasLOS(map, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-3) return true;
  return raycastMap(map, ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.05;
}

// Ray vs character cylinder. Returns distance or -1.
export function rayVsCharacter(ox, oy, oz, dx, dy, dz, ch, radius = 0.36) {
  const px = ox - ch.x, pz = oz - ch.z;
  const a = dx * dx + dz * dz;
  let t0 = -Infinity, t1 = Infinity;
  if (a > 1e-9) {
    const b = 2 * (px * dx + pz * dz);
    const c = px * px + pz * pz - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const s = Math.sqrt(disc);
    t0 = (-b - s) / (2 * a); t1 = (-b + s) / (2 * a);
  } else if (px * px + pz * pz > radius * radius) return -1;
  const y0 = ch.y, y1 = ch.y + P.HEIGHT;
  if (Math.abs(dy) > 1e-9) {
    let ta = (y0 - oy) / dy, tb = (y1 - oy) / dy;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
  } else if (oy < y0 || oy > y1) return -1;
  if (t0 > t1 || t1 < 0) return -1;
  return Math.max(0, t0);
}

export { WALL_H };
