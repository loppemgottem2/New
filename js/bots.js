// =====================================================================
//  BOTS.JS — bot brains. Runs only on the host.
//
//  Every bot has:
//   * eyes: field of view + line-of-sight raycasts (can't see through walls)
//   * suspicion (0-100) of every other person
//   * fear: makes them run away from knives, bodies, gunshots
//  Innocents wander, collect gun parts, flee danger, grab dropped guns.
//  Armed bots (sheriff / revolver) hunt whoever they saw doing murder.
//  The murderer bot acts innocent, picks isolated victims, avoids
//  witnesses, stabs or throws its knife, then escapes.
// =====================================================================
import { CONFIG } from './config.js';
import { rand, clamp, angleDiff, turnToward, yawTo, forwardX, forwardZ, DEG } from './util.js';
import { moveCharacter, hasLOS, circleFree } from './physics.js';

const B = CONFIG.BOTS;
const P = CONFIG.PLAYER;
const W = CONFIG.WEAPONS;

const weaponOf = (c) => (!c.equipped ? 0 : c.hasKnife ? 1 : c.hasGun ? 2 : 0);

export function initBrain(c) {
  return {
    state: 'wander',
    path: null, pi: 0, goal: null, repathT: 0,
    thinkT: rand(0, B.THINK_INTERVAL),
    waitT: rand(0, 3),
    susp: new Map(),
    seenAt: new Map(),      // id -> time last seen
    fear: 0, threat: null, threatId: null,
    targetId: null, reactT: 0, lastSeenT: 0, lastSeenPos: null,
    huntT: rand(B.MURDER_FIRST_DELAY[0], B.MURDER_FIRST_DELAY[1]),
    escapeT: 0, holsterT: 0, frustration: 0,
    lastPos: { x: c.x, z: c.z }, stuckT: 0, stuckCount: 0, jump: false,
    seenCorpses: new Set(),
    lookT: rand(1, 3), lookYaw: c.yaw,
    collector: Math.random() < B.COLLECT_PARTS_CHANCE,
    brave: Math.random() < B.BRAVERY,
    run: false,
  };
}

// ---------------------------------------------------------------------
//  Perception helpers
// ---------------------------------------------------------------------
function canSee(game, c, o, maxDist = B.VIEW_DISTANCE) {
  const dx = o.x - c.x, dz = o.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d > maxDist) return false;
  if (d > B.CLOSE_SENSE) {
    const a = Math.abs(angleDiff(c.yaw, yawTo(dx, dz)));
    if (a > (B.FOV_DEG * DEG) / 2) return false;
  }
  return hasLOS(game.map, c.x, c.y + P.EYE, c.z, o.x, (o.y ?? 0) + 1.2, o.z);
}

function witnesses(game, murderer, victim) {
  let n = 0;
  for (const o of game.chars.values()) {
    if (!o.alive || o === murderer || o === victim) continue;
    const d = Math.hypot(o.x - murderer.x, o.z - murderer.z);
    if (d > 24) continue;
    if (hasLOS(game.map, o.x, o.y + P.EYE, o.z, murderer.x, murderer.y + 1.2, murderer.z)) n++;
  }
  return n;
}

function setPath(game, c, b, gx, gz) {
  b.goal = { x: gx, z: gz };
  b.path = game.nav.findPath(c.x, c.z, gx, gz);
  b.pi = 0;
  b.repathT = 0.8;
  if (!b.path) b.goal = null;
}

function addSusp(b, id, v) {
  const cur = b.susp.get(id) || 0;
  b.susp.set(id, clamp(cur + v, 0, 100));
}

// ---------------------------------------------------------------------
//  Events from the game
// ---------------------------------------------------------------------
export function botsOnKill(game, victim, killer, cause) {
  for (const c of game.chars.values()) {
    if (!c.isBot || !c.alive || c === killer || c === victim) continue;
    const b = c.brain;
    if (!b) continue;
    const sawKiller = killer && killer.alive && canSee(game, c, killer, 34);
    const sawVictim = canSee(game, c, victim, 34);
    if (c.role === 'murderer') continue;
    if (sawKiller) {
      // shooting someone we already thought was the murderer is justified
      const justified = cause === 'gun' && (b.susp.get(victim.id) || 0) >= 70;
      if (!justified) {
        b.susp.set(killer.id, 100);
        b.threatId = killer.id; b.threat = { x: killer.x, z: killer.z };
        b.fear = 1;
        b.reactT = rand(B.REACTION_MIN, B.REACTION_MAX);
      }
    }
    if (sawVictim) {
      b.seenCorpses.add(victim.id);
      b.fear = Math.max(b.fear, 0.85);
      if (!b.threat) b.threat = { x: victim.x, z: victim.z };
    }
  }
  // murderer bot that got a kill: hide knife and get away
  if (killer && killer.isBot && killer.role === 'murderer' && killer.brain) {
    const b = killer.brain;
    b.targetId = null;
    b.state = 'escape';
    b.escapeT = rand(4, 7);
    b.holsterT = rand(0.5, 1.2);
    b.huntT = rand(B.MURDER_NEXT_DELAY[0], B.MURDER_NEXT_DELAY[1]);
    b.frustration = 0;
    const p = game.nav.fleePoint(killer.x, killer.z, victim.x, victim.z);
    setPath(game, killer, b, p.x, p.z);
  }
}

export function botsOnShot(game, shooter, hit) {
  for (const c of game.chars.values()) {
    if (!c.isBot || !c.alive || c === shooter || !c.brain) continue;
    const d = Math.hypot(c.x - shooter.x, c.z - shooter.z);
    if (d > 35) continue;
    const b = c.brain;
    if (c.role !== 'murderer') b.fear = Math.max(b.fear, 0.5);
    // turn toward the sound
    b.lookYaw = yawTo(shooter.x - c.x, shooter.z - c.z);
    b.lookT = 1.5;
    if (c.role !== 'murderer' && !b.threat) b.threat = { x: shooter.x, z: shooter.z };
  }
}

// ---------------------------------------------------------------------
//  Main update (every frame on the host)
// ---------------------------------------------------------------------
export function updateBots(game, dt) {
  const active = game.phase === 'play' || game.phase === 'pre';
  for (const c of game.chars.values()) {
    if (!c.isBot || !c.alive || !c.brain) continue;
    const b = c.brain;
    b.thinkT -= dt;
    if (b.thinkT <= 0) {
      b.thinkT = B.THINK_INTERVAL;
      if (active) perceive(game, c, b);
      if (c.role === 'murderer' && game.phase === 'play') thinkMurderer(game, c, b);
      else thinkInnocent(game, c, b, active);
    }
    act(game, c, b, dt);
  }
}

function perceive(game, c, b) {
  const I = B.THINK_INTERVAL;
  const now = game.time;
  for (const o of game.chars.values()) {
    if (o === c || !o.alive) continue;
    if (!canSee(game, c, o)) continue;
    b.seenAt.set(o.id, now);
    if (c.role !== 'murderer' && weaponOf(o) === 1) {
      // someone has a knife out!
      if ((b.susp.get(o.id) || 0) < 100) b.reactT = rand(B.REACTION_MIN, B.REACTION_MAX);
      b.susp.set(o.id, 100);
      b.threatId = o.id;
      b.threat = { x: o.x, z: o.z };
      b.fear = 1;
    }
    if (b.threatId === o.id) b.threat = { x: o.x, z: o.z };
  }
  // dead bodies
  if (c.role !== 'murderer') {
    for (const k of game.corpses) {
      if (b.seenCorpses.has(k.id)) continue;
      if (!canSee(game, c, { x: k.x, y: k.y - 0.9, z: k.z }, 26)) continue;
      b.seenCorpses.add(k.id);
      b.fear = Math.max(b.fear, 0.8);
      if (!b.threat) b.threat = { x: k.x, z: k.z };
      const fresh = game.time - k.t < 20;
      // people standing next to a fresh body look suspicious
      if (fresh) {
        for (const o of game.chars.values()) {
          if (o === c || !o.alive) continue;
          if (Math.hypot(o.x - k.x, o.z - k.z) < 5 && b.seenAt.get(o.id) === now) addSusp(b, o.id, B.CORPSE_SUSPICION);
        }
      }
    }
  }
  // decay
  for (const [id, v] of b.susp) {
    if (v >= 100) continue;
    b.susp.set(id, Math.max(0, v - B.SUSPICION_DECAY * I));
  }
  const t = game.chars.get(b.threatId);
  if (b.threatId != null && (!t || !t.alive)) { b.threatId = null; }
  const recentlySeen = b.threatId != null && now - (b.seenAt.get(b.threatId) || -99) < 5;
  if (!recentlySeen) b.fear = Math.max(0, b.fear - 0.12 * I);
  if (b.fear <= 0.05) b.threat = null;
}

// Most suspicious person this bot can currently see
function bestTarget(game, c, b, minSusp) {
  let best = null, bs = minSusp - 0.001;
  for (const [id, v] of b.susp) {
    if (v < bs) continue;
    const o = game.chars.get(id);
    if (!o || !o.alive || o === c) continue;
    if (game.time - (b.seenAt.get(id) || -99) > 4) continue;
    best = o; bs = v;
  }
  return best;
}

function thinkInnocent(game, c, b, active) {
  const nav = game.nav;
  // ---- armed: fight ----
  if (active && c.hasGun && game.phase === 'play') {
    const t = bestTarget(game, c, b, B.DRAW_SUSPICION);
    if (t) {
      if (b.targetId !== t.id) b.reactT = rand(B.REACTION_MIN, B.REACTION_MAX);
      b.targetId = t.id;
      b.state = 'engage';
      if (!c.equipped) game.hostAction(c, 'equip');
      return;
    }
    if (b.state === 'engage') {
      // lost sight: go to where we last saw them
      const o = game.chars.get(b.targetId);
      if (o && o.alive && (b.susp.get(o.id) || 0) >= B.SHOOT_SUSPICION) {
        b.state = 'hunt';
        setPath(game, c, b, o.x, o.z);
      } else { b.state = 'wander'; b.targetId = null; }
    }
    if (b.state === 'hunt') {
      if (!b.path) { b.state = 'wander'; b.holsterT = 6; }
      return;
    }
    if (c.equipped && b.state !== 'engage') {
      b.holsterT -= B.THINK_INTERVAL;
      if (b.holsterT <= 0) { game.hostAction(c, 'equip'); b.holsterT = rand(3, 6); }
    }
  }

  // ---- scared: run away ----
  if (active && b.fear > 0.3 && b.threat) {
    const farFromThreat = Math.hypot(c.x - b.threat.x, c.z - b.threat.z) > 22;
    if (b.state !== 'flee' || !b.path || (farFromThreat && b.fear < 0.6)) {
      if (!(farFromThreat && b.state === 'flee' && b.path)) {
        const p = nav.fleePoint(c.x, c.z, b.threat.x, b.threat.z);
        setPath(game, c, b, p.x, p.z);
        b.state = 'flee';
      }
    }
    b.run = true;
    return;
  }

  // ---- brave: pick up a dropped gun ----
  if (active && !c.hasGun && !c.gunBanned && c.role !== 'murderer' && b.brave) {
    for (const it of game.items.values()) {
      if (it.type !== 'gun' || it.flying) continue;
      const d = Math.hypot(it.x - c.x, it.z - c.z);
      if (d < 35) {
        if (b.state !== 'getgun' || !b.path) { setPath(game, c, b, it.x, it.z); b.state = 'getgun'; }
        b.run = d > 6;
        return;
      }
    }
  }
  if (b.state === 'getgun') b.state = 'wander';

  // ---- collect gun parts ----
  if (active && b.collector && game.craftedBy == null && !c.hasGun && !c.gunBanned && c.role !== 'murderer') {
    const set = game.partsCollected.get(c.id);
    let best = -1, bd = B.COLLECT_PARTS_RANGE;
    game.partSpots.forEach((s, k) => {
      if (set && set.has(k)) return;
      const d = Math.hypot(s.x - c.x, s.z - c.z);
      if (d < bd) { bd = d; best = k; }
    });
    if (best >= 0) {
      const s = game.partSpots[best];
      if (b.state !== 'collect' || !b.goal || Math.hypot(b.goal.x - s.x, b.goal.z - s.z) > 0.5 || !b.path) {
        setPath(game, c, b, s.x, s.z);
        b.state = 'collect';
      }
      b.run = false;
      return;
    }
  }
  if (b.state === 'collect') b.state = 'wander';

  wanderThink(game, c, b);
}

function wanderThink(game, c, b) {
  b.run = false;
  if (b.state !== 'wander' && b.state !== 'idle') b.state = 'wander';
  if (!b.path) {
    b.waitT -= B.THINK_INTERVAL;
    if (b.waitT <= 0) {
      const p = game.nav.randomPointNear(c.x, c.z, 8, 40);
      setPath(game, c, b, p.x, p.z);
      b.waitT = rand(0.5, 4);
    }
  }
}

function thinkMurderer(game, c, b) {
  const I = B.THINK_INTERVAL;
  b.run = false;
  // knife was thrown: go get it
  if (!c.hasKnife) {
    let knife = null;
    for (const it of game.items.values()) if (it.type === 'knife' && !it.flying) knife = it;
    if (knife) {
      if (b.state !== 'retrieve' || !b.path) { setPath(game, c, b, knife.x, knife.z); b.state = 'retrieve'; }
      b.run = true;
    }
    return;
  }
  // danger: someone is pointing a gun at me
  for (const o of game.chars.values()) {
    if (o === c || !o.alive || weaponOf(o) !== 2) continue;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    if (d > 26) continue;
    const facing = Math.abs(angleDiff(o.yaw, yawTo(c.x - o.x, c.z - o.z))) < 25 * DEG;
    if (facing && hasLOS(game.map, o.x, o.y + P.EYE, o.z, c.x, c.y + 1.2, c.z)) {
      if (c.equipped && d > 4) game.hostAction(c, 'equip'); // hide the knife, act innocent
      if (b.state !== 'evade' || !b.path) {
        const p = game.nav.fleePoint(c.x, c.z, o.x, o.z);
        setPath(game, c, b, p.x, p.z);
        b.state = 'evade';
      }
      b.run = true;
      b.targetId = null;
      return;
    }
  }
  if (b.state === 'evade' && b.path) { b.run = true; return; }

  if (b.state === 'escape') {
    b.escapeT -= I;
    b.holsterT -= I;
    if (b.holsterT <= 0 && c.equipped) game.hostAction(c, 'equip');
    b.run = b.escapeT > 2;
    if (b.escapeT > 0 && b.path) return;
    b.state = 'wander';
  }

  b.huntT -= I;
  let t = game.chars.get(b.targetId);
  if (t && !t.alive) { t = null; b.targetId = null; }
  if (!t && b.huntT <= 0) {
    // choose a victim: close, alone, not armed
    let best = null, bs = Infinity;
    for (const o of game.chars.values()) {
      if (o === c || !o.alive) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      const wit = witnesses(game, c, o);
      const armed = weaponOf(o) === 2 ? 40 : 0;
      const s = d + wit * 18 + armed + rand(0, 10);
      if (s < bs) { bs = s; best = o; }
    }
    if (best) { t = best; b.targetId = best.id; b.state = 'stalk'; b.frustration = 0; }
  }
  if (!t) {
    if (c.equipped) game.hostAction(c, 'equip');
    wanderThink(game, c, b);
    return;
  }

  const d = Math.hypot(t.x - c.x, t.z - c.z);
  const wit = witnesses(game, c, t);
  const lateGame = clamp(1 - game.timeLeft / CONFIG.ROUND.TIME_LIMIT, 0, 1);
  b.frustration += I * 0.02;
  const bold = lateGame * 0.7 + b.frustration > 0.75;
  const seeT = hasLOS(game.map, c.x, c.y + P.EYE, c.z, t.x, t.y + 1.2, t.z);

  if (d < 7.5 && seeT && (wit === 0 || bold)) {
    b.state = 'attack';
    // walk up casually with the knife hidden, pull it out at the last moment
    const close = d < 3.6 || t.running || bold;
    if (close && !c.equipped) game.hostAction(c, 'equip');
    b.run = close;
    // victim is getting away: throw the knife
    if (d > 4.5 && d < 13 && t.running && Math.random() < B.THROW_CHANCE * I) {
      b.wantThrow = true;
    }
  } else if (b.state === 'attack' && d < 14 && seeT) {
    b.run = true; // keep chasing
    if (d > 5 && d < 13 && Math.random() < B.THROW_CHANCE * I) b.wantThrow = true;
  } else {
    b.state = 'stalk';
    if (c.equipped && wit > 0) game.hostAction(c, 'equip');
    b.run = d > 18;
    b.repathT -= I;
    if (!b.path || b.repathT <= 0) setPath(game, c, b, t.x, t.z);
  }
  // give up on a target that's taking too long
  if (b.frustration > 1.2 && wit > 1) { b.targetId = null; b.huntT = rand(2, 6); b.frustration = 0; }
}

// ---------------------------------------------------------------------
//  Acting: steering, aiming, attacking (every frame)
// ---------------------------------------------------------------------
function act(game, c, b, dt) {
  let mx = 0, mz = 0;
  let faceYaw = null, facePitch = 0;
  const target = game.chars.get(b.targetId);

  if (b.state === 'engage' && target && target.alive) {
    // ----- armed bot aiming -----
    const dx = target.x - c.x, dz = target.z - c.z;
    const d = Math.hypot(dx, dz);
    const visible = hasLOS(game.map, c.x, c.y + P.EYE, c.z, target.x, target.y + 1.2, target.z);
    faceYaw = yawTo(dx, dz);
    facePitch = Math.atan2(target.y + 1.15 - (c.y + P.EYE), d);
    c.yaw = turnToward(c.yaw, faceYaw, B.TURN_SPEED * dt);
    c.pitch += clamp(facePitch - c.pitch, -B.TURN_SPEED * dt, B.TURN_SPEED * dt);
    b.reactT -= dt;
    const err = Math.abs(angleDiff(c.yaw, faceYaw));
    const susp = b.susp.get(target.id) || 0;
    if (visible && b.reactT <= 0 && err < 5 * DEG && susp >= B.SHOOT_SUSPICION && c.attackCd <= 0 && d < 45 &&
        weaponOf(c) === 2 && game.phase === 'play') {
      const spread = B.AIM_SPREAD_DEG * DEG * (1 + d / 25) * (c.speed > 1 ? 1.6 : 1);
      game.gunAttack(c, spread);
    }
    // positioning: get closer if far / no sight, back off from a knife
    if (!visible || d > 16) {
      b.repathT -= dt;
      if (!b.path || b.repathT <= 0) setPath(game, c, b, target.x, target.z);
      const v = followPath(game, c, b);
      mx = v.x; mz = v.z;
      b.run = d > 20;
    } else if (d < 5 && weaponOf(target) === 1) {
      mx = -dx / d; mz = -dz / d; b.run = true; // back-pedal
      b.path = null;
    } else {
      b.path = null;
    }
    c.yaw = c.yaw; // keep aim, don't face movement
  } else if (b.state === 'attack' && target && target.alive) {
    // ----- murderer lunging -----
    const dx = target.x - c.x, dz = target.z - c.z;
    const d = Math.hypot(dx, dz);
    faceYaw = yawTo(dx, dz);
    if (game.nav.clearLine(c.x, c.z, target.x, target.z)) { mx = dx / d; mz = dz / d; b.path = null; }
    else {
      b.repathT -= dt;
      if (!b.path || b.repathT <= 0) setPath(game, c, b, target.x, target.z);
      const v = followPath(game, c, b); mx = v.x; mz = v.z;
    }
    c.yaw = turnToward(c.yaw, faceYaw, 9 * dt);
    c.pitch = Math.atan2(target.y + 1.1 - (c.y + P.EYE), d) * 0.6;
    if (b.wantThrow && weaponOf(c) === 1 && c.attackCd <= 0 && Math.abs(angleDiff(c.yaw, faceYaw)) < 4 * DEG) {
      b.wantThrow = false;
      c.pitch = Math.atan2(target.y + 1.1 - (c.y + P.EYE), d) + d * 0.004;
      game.hostAction(c, 'throw');
      b.state = 'retrieve';
    } else if (d < W.KNIFE_RANGE * 0.85 && c.attackCd <= 0 && Math.abs(angleDiff(c.yaw, faceYaw)) < 30 * DEG) {
      game.hostAction(c, 'attack');
    }
  } else {
    const v = followPath(game, c, b);
    mx = v.x; mz = v.z;
    if (!b.path) {
      // idle: look around
      b.lookT -= dt;
      if (b.lookT <= 0) { b.lookYaw = c.yaw + rand(-1.6, 1.6); b.lookT = rand(1, 3); }
      c.yaw = turnToward(c.yaw, b.lookYaw, 2.5 * dt);
      c.pitch *= 0.95;
    }
  }

  // ----- local avoidance: don't bump into people, pass on the right -----
  if (mx || mz) {
    let ax = 0, az = 0;
    for (const o of game.chars.values()) {
      if (o === c || !o.alive || o === target) continue;
      const dx = c.x - o.x, dz = c.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2 || d < 1e-3) continue;
      const k = (2.2 - d) / 2.2;
      ax += (dx / d) * k * 1.4; az += (dz / d) * k * 1.4;
      // someone ahead? sidestep to the right
      const ahead = -(dx * mx + dz * mz) / d;
      if (ahead > 0.6 && d < 1.8) { ax += -mz * 0.6 * k; az += mx * 0.6 * k; }
    }
    mx += ax; mz += az;
    const l = Math.hypot(mx, mz);
    if (l > 1e-3) { mx /= l; mz /= l; }
    // wall feeler: if heading into a wall, rotate the direction until clear
    if (!circleFree(game.map, c.x + mx * 0.55, c.z + mz * 0.55, P.RADIUS)) {
      for (const a of [0.5, -0.5, 1.0, -1.0, 1.5, -1.5]) {
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = mx * ca - mz * sa, nz = mx * sa + mz * ca;
        if (circleFree(game.map, c.x + nx * 0.55, c.z + nz * 0.55, P.RADIUS)) { mx = nx; mz = nz; break; }
      }
    }
    // face where we walk (unless aiming)
    if (b.state !== 'engage' && b.state !== 'attack') {
      c.yaw = turnToward(c.yaw, yawTo(mx, mz), 7 * dt);
      c.pitch *= 0.9;
    }
  }

  moveCharacter(c, { mx, mz, run: b.run, jump: b.jump }, dt, game.map);
  b.jump = false;

  // ----- stuck detection -----
  b.stuckT += dt;
  if (b.stuckT > 1.0) {
    const moved = Math.hypot(c.x - b.lastPos.x, c.z - b.lastPos.z);
    const wanted = Math.hypot(mx, mz) > 0.1;
    if (wanted && moved < 0.35) {
      b.stuckCount++;
      b.jump = true;
      if (b.goal) setPath(game, c, b, b.goal.x, b.goal.z);
      if (b.stuckCount > 2) { b.path = null; b.goal = null; b.stuckCount = 0; b.waitT = 0; }
    } else b.stuckCount = 0;
    b.lastPos.x = c.x; b.lastPos.z = c.z;
    b.stuckT = 0;
  }
}

// Returns a unit-ish direction toward the next waypoint (or 0 when done)
function followPath(game, c, b) {
  if (!b.path) return { x: 0, z: 0 };
  let wp = b.path[b.pi];
  while (wp && Math.hypot(wp.x - c.x, wp.z - c.z) < (b.pi === b.path.length - 1 ? 0.45 : 0.8)) {
    b.pi++;
    wp = b.path[b.pi];
  }
  if (!wp) { b.path = null; return { x: 0, z: 0 }; }
  const dx = wp.x - c.x, dz = wp.z - c.z;
  const d = Math.hypot(dx, dz) || 1;
  // slow down for the final waypoint
  const k = b.pi === b.path.length - 1 ? Math.min(1, d / 0.8 + 0.3) : 1;
  return { x: (dx / d) * k, z: (dz / d) * k };
}

export { forwardX, forwardZ };
