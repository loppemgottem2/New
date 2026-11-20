// =====================================================================
//  CHARACTER.JS — humanoid character: shaped low-poly body (lathe torso,
//  tapered limbs), big head with a painted face, hairstyles, clothing
//  types, procedural walk/run/jump/weapon animation, first-person arms.
//
//  Facing: the model looks toward -Z when yaw = 0. Right hand is +X.
//  Every body segment has a "vis" group so ragdolls can clone it.
// =====================================================================
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { faceTexture, FACES } from './textures.js';

const L = CONFIG.LOOKS;
const pickR = (a, rng = Math.random) => a[Math.floor(rng() * a.length)];

export const DEFAULT_LOOK = {
  hair: 'short', hairColor: 0x3b2716, face: 'smile', skin: 0xe8c4a0,
  shirt: 'tshirt', shirtColor: 0x2f6fd8, pants: 'jeans', pantsColor: 0x2c3e66,
};
export function randomLook(rng = Math.random) {
  return {
    hair: pickR(L.HAIR, rng), hairColor: pickR(L.HAIR_COLORS.slice(0, 6), rng), face: pickR(FACES, rng), skin: pickR(L.SKINS, rng),
    shirt: pickR(L.SHIRTS, rng), shirtColor: pickR(L.SHIRT_COLORS, rng), pants: pickR(L.PANTS, rng), pantsColor: pickR(L.PANTS_COLORS, rng),
  };
}
// Validate a look received over the network
export function sanitizeLook(l) {
  l = l || {};
  const col = (v, d) => (Number.isInteger(v) && v >= 0 && v <= 0xffffff ? v : d);
  return {
    hair: L.HAIR.includes(l.hair) ? l.hair : DEFAULT_LOOK.hair,
    hairColor: col(l.hairColor, DEFAULT_LOOK.hairColor),
    face: FACES.includes(l.face) ? l.face : DEFAULT_LOOK.face,
    skin: col(l.skin, DEFAULT_LOOK.skin),
    shirt: L.SHIRTS.includes(l.shirt) ? l.shirt : DEFAULT_LOOK.shirt,
    shirtColor: col(l.shirtColor, DEFAULT_LOOK.shirtColor),
    pants: L.PANTS.includes(l.pants) ? l.pants : DEFAULT_LOOK.pants,
    pantsColor: col(l.pantsColor, DEFAULT_LOOK.pantsColor),
  };
}

// ---------------- shared geometries ----------------
let G = null;
const v2 = (pts) => pts.map(([r, y]) => new THREE.Vector2(r, y));
function down(geo, len) { geo.translate(0, -len / 2, 0); return geo; }
function geos() {
  if (G) return G;
  G = {};
  G.torso = new THREE.LatheGeometry(v2([[0.001, -0.03], [0.13, -0.02], [0.148, 0.05], [0.138, 0.17], [0.15, 0.29], [0.172, 0.4], [0.188, 0.47], [0.17, 0.53], [0.12, 0.575], [0.055, 0.6], [0.001, 0.6]]), 16);
  G.torso.scale(1, 1, 0.66);
  G.pelvis = new THREE.LatheGeometry(v2([[0.001, -0.15], [0.1, -0.145], [0.142, -0.07], [0.146, 0.0], [0.138, 0.05], [0.001, 0.05]]), 16);
  G.pelvis.scale(1, 1, 0.72);
  G.neck = new THREE.CylinderGeometry(0.052, 0.058, 0.12, 10); G.neck.translate(0, 0.585, 0);
  G.head = new THREE.SphereGeometry(0.155, 24, 16); G.head.scale(0.94, 1.08, 1.0); G.head.translate(0, 0.15, 0);
  G.nose = new THREE.SphereGeometry(0.024, 8, 6); G.nose.scale(0.8, 1.3, 1.1);
  G.ear = new THREE.SphereGeometry(0.034, 8, 6); G.ear.scale(0.45, 1, 0.75);
  G.shoulder = new THREE.SphereGeometry(0.062, 10, 8);
  G.upperArm = down(new THREE.CylinderGeometry(0.056, 0.049, 0.29, 10), 0.29);
  G.sleeveShort = down(new THREE.CylinderGeometry(0.066, 0.06, 0.16, 10), 0.16);
  G.elbow = new THREE.SphereGeometry(0.049, 8, 6);
  G.foreArm = down(new THREE.CylinderGeometry(0.048, 0.038, 0.25, 10), 0.25);
  G.cuff = down(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10), 0.04); G.cuff.translate(0, -0.22, 0);
  G.hand = new THREE.SphereGeometry(0.05, 10, 8); G.hand.scale(0.82, 1.3, 0.55); G.hand.translate(0, -0.3, 0);
  G.thumb = new THREE.CapsuleGeometry(0.014, 0.04, 2, 6); G.thumb.rotateZ(0.5); G.thumb.translate(-0.035, -0.28, -0.015);
  G.thigh = down(new THREE.CylinderGeometry(0.09, 0.066, 0.44, 12), 0.44);
  G.thighShort = down(new THREE.CylinderGeometry(0.094, 0.082, 0.24, 12), 0.24);
  G.knee = new THREE.SphereGeometry(0.066, 10, 8);
  G.shin = down(new THREE.CylinderGeometry(0.064, 0.046, 0.4, 10), 0.4);
  G.shoe = new THREE.CapsuleGeometry(0.052, 0.15, 4, 10); G.shoe.rotateX(Math.PI / 2); G.shoe.scale(1, 0.72, 1); G.shoe.translate(0, -0.405, -0.045);
  G.hood = new THREE.TorusGeometry(0.105, 0.042, 8, 16); G.hood.rotateX(Math.PI / 2); G.hood.translate(0, 0.565, 0.025);
  G.blob = new THREE.PlaneGeometry(0.9, 0.9);
  // weapons
  G.blade = new THREE.BoxGeometry(0.016, 0.034, 0.24); G.blade.translate(0, 0, -0.17);
  G.handle = new THREE.BoxGeometry(0.028, 0.038, 0.11);
  G.guard = new THREE.BoxGeometry(0.03, 0.07, 0.015); G.guard.translate(0, 0, -0.055);
  G.barrel = new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8);
  G.cyl = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10);
  G.frame = new THREE.BoxGeometry(0.035, 0.05, 0.1);
  G.grip = new THREE.BoxGeometry(0.032, 0.11, 0.045);
  return G;
}
export { geos };

const SHARED = {};
const shared = (k, make) => (SHARED[k] ||= make());

export function makeKnifeMesh() {
  const g = geos();
  const knife = new THREE.Group();
  knife.add(new THREE.Mesh(g.blade, shared('blade', () => new THREE.MeshLambertMaterial({ color: 0xdfe4ea, emissive: 0x2a2e33 }))));
  knife.add(new THREE.Mesh(g.handle, shared('handle', () => new THREE.MeshLambertMaterial({ color: 0x24160c }))));
  knife.add(new THREE.Mesh(g.guard, shared('guard', () => new THREE.MeshLambertMaterial({ color: 0x777777 }))));
  return knife;
}
export function makeGunMesh() {
  const g = geos();
  const gun = new THREE.Group();
  const metal = shared('gunmetal', () => new THREE.MeshLambertMaterial({ color: 0x2b2d31, emissive: 0x0c0c0e }));
  const b = new THREE.Mesh(g.barrel, metal); b.rotation.x = Math.PI / 2; b.position.set(0, 0.03, -0.14);
  const c = new THREE.Mesh(g.cyl, metal); c.rotation.x = Math.PI / 2; c.position.set(0, 0.02, -0.03);
  const f = new THREE.Mesh(g.frame, metal); f.position.set(0, 0.025, 0);
  const gr = new THREE.Mesh(g.grip, shared('grip', () => new THREE.MeshLambertMaterial({ color: 0x5a3518 })));
  gr.position.set(0, -0.03, 0.04); gr.rotation.x = -0.35;
  gun.add(b, c, f, gr);
  return gun;
}

// ---------------- hairstyles ----------------
function hairMeshes(style, hairMat) {
  const out = [];
  const add = (geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, mat = hairMat) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); out.push(m); return m;
  };
  const cap = (r, th, tilt) => add(new THREE.SphereGeometry(r, 18, 10, 0, Math.PI * 2, 0, Math.PI * th), 0, 0.15, 0, tilt, 0, 0, 0.95, 1.1, 1.03);
  switch (style) {
    case 'short': cap(0.166, 0.42, 0.28); break;
    case 'buzz': cap(0.159, 0.45, 0.2); break;
    case 'sidepart':
      cap(0.167, 0.42, 0.28);
      add(new THREE.CapsuleGeometry(0.03, 0.12, 3, 6), 0.035, 0.285, -0.115, 0.3, 0, 1.2, 1, 1, 0.9);
      break;
    case 'long':
      cap(0.168, 0.46, 0.3);
      add(new THREE.CapsuleGeometry(0.12, 0.16, 4, 10), 0, 0.08, 0.075, 0.1, 0, 0, 1.12, 1, 0.55);
      add(new THREE.BoxGeometry(0.035, 0.2, 0.09), -0.135, 0.08, 0.0, 0, 0, 0.08);
      add(new THREE.BoxGeometry(0.035, 0.2, 0.09), 0.135, 0.08, 0.0, 0, 0, -0.08);
      break;
    case 'ponytail':
      cap(0.167, 0.44, 0.32);
      add(new THREE.SphereGeometry(0.035, 8, 6), 0, 0.2, 0.165);
      add(new THREE.CapsuleGeometry(0.04, 0.17, 3, 8), 0, 0.07, 0.2, 0.35);
      break;
    case 'bun':
      cap(0.167, 0.44, 0.3);
      add(new THREE.SphereGeometry(0.068, 12, 8), 0, 0.32, 0.075);
      break;
    case 'mohawk':
      cap(0.158, 0.4, 0.2);
      add(new THREE.BoxGeometry(0.035, 0.09, 0.32), 0, 0.3, 0.01, -0.05);
      break;
    case 'spiky': {
      cap(0.166, 0.42, 0.28);
      const cone = new THREE.ConeGeometry(0.035, 0.1, 5);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2, rr = i === 0 ? 0 : 0.08;
        add(cone, Math.cos(a) * rr, 0.31 - rr * 0.35, Math.sin(a) * rr + 0.01, Math.sin(a) * rr * 4, 0, -Math.cos(a) * rr * 4);
      }
      break;
    }
    case 'afro': add(new THREE.SphereGeometry(0.215, 16, 12), 0, 0.22, 0.03, 0, 0, 0, 1, 0.88, 1); break;
    case 'cap':
      add(new THREE.SphereGeometry(0.168, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 0, 0.165, 0.005, 0.12, 0, 0, 0.96, 1.0, 1.04);
      add(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 18), 0, 0.2, -0.165, -0.1, 0, 0, 1, 1, 0.8);
      add(new THREE.SphereGeometry(0.014, 6, 4), 0, 0.335, 0.005);
      break;
    case 'beanie':
      add(new THREE.SphereGeometry(0.172, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), 0, 0.15, 0.005, 0.12, 0, 0, 0.96, 1.16, 1.05);
      add(new THREE.TorusGeometry(0.162, 0.024, 6, 22), 0, 0.17, 0.0, Math.PI / 2 + 0.12, 0, 0, 0.96, 1.05, 1);
      break;
    default: break; // bald
  }
  return out;
}

const tmpV = new THREE.Vector3();

export class CharacterModel {
  constructor(textures, look = DEFAULT_LOOK) {
    this.T = textures;
    this.root = new THREE.Group();
    this.look = sanitizeLook(look);
    const lk = this.look;
    const T = textures;
    const g = geos();
    const mat = (o) => { const m = new THREE.MeshLambertMaterial(o); m.userData.base = (o.color ?? 0xffffff); return m; };
    this.mats = {
      shirt: mat({ map: T.shirt[lk.shirt], color: lk.shirtColor }),
      sleeve: mat({ map: T.sleeve, color: lk.shirtColor }),
      pants: mat({ map: T.pants[lk.pants], color: lk.pantsColor }),
      hips: mat({ map: T.hips[lk.pants], color: lk.pantsColor }),
      skin: mat({ color: lk.skin }),
      face: mat({ map: faceTexture(lk.face, lk.skin), color: 0xffffff }),
      hair: mat({ color: lk.hairColor }),
      shoes: mat({ color: 0x1e1c1b }),
    };
    this.skinColor = lk.skin;
    const M = this.mats;
    const mk = (parent, geo, m, x = 0, y = 0, z = 0) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); parent.add(mesh); return mesh; };
    const seg = (parent, x, y, z) => { const joint = new THREE.Group(); joint.position.set(x, y, z); parent.add(joint); const vis = new THREE.Group(); joint.add(vis); return { joint, vis }; };

    // hips
    this.pelvis = seg(this.root, 0, 0.92, 0);
    mk(this.pelvis.vis, g.pelvis, M.hips);
    // torso
    this.torso = seg(this.pelvis.joint, 0, 0, 0);
    mk(this.torso.vis, g.torso, M.shirt);
    mk(this.torso.vis, g.neck, M.skin);
    if (lk.shirt === 'hoodie') mk(this.torso.vis, g.hood, M.shirt);
    // head
    this.head = seg(this.torso.joint, 0, 0.6, 0);
    this.headMesh = mk(this.head.vis, g.head, M.face);
    mk(this.head.vis, g.nose, M.skin, 0, 0.135, -0.158);
    mk(this.head.vis, g.ear, M.skin, -0.146, 0.145, 0.01);
    mk(this.head.vis, g.ear, M.skin, 0.146, 0.145, 0.01);
    for (const h of hairMeshes(lk.hair, M.hair)) this.head.vis.add(h);
    // arms
    const longSleeve = ['longsleeve', 'buttonup', 'hoodie', 'jacket'].includes(lk.shirt);
    const noSleeve = lk.shirt === 'tank';
    const makeArm = (side) => {
      const sh = seg(this.torso.joint, 0.205 * side, 0.465, 0);
      mk(sh.vis, g.shoulder, noSleeve ? M.skin : M.shirt);
      mk(sh.vis, g.upperArm, longSleeve ? M.sleeve : M.skin);
      if (!longSleeve && !noSleeve) mk(sh.vis, g.sleeveShort, M.sleeve);
      const el = seg(sh.joint, 0, -0.29, 0);
      mk(el.vis, g.elbow, longSleeve ? M.sleeve : M.skin);
      mk(el.vis, g.foreArm, longSleeve ? M.sleeve : M.skin);
      if (longSleeve) mk(el.vis, g.cuff, M.sleeve);
      mk(el.vis, g.hand, M.skin);
      const th = mk(el.vis, g.thumb, M.skin); th.scale.x = side;
      const hand = new THREE.Group(); hand.position.y = -0.29; el.joint.add(hand);
      return { sh: sh.joint, shVis: sh.vis, el: el.joint, elVis: el.vis, hand };
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);
    // legs
    const shorts = lk.pants === 'shorts';
    const makeLeg = (side) => {
      const hip = seg(this.pelvis.joint, 0.094 * side, -0.05, 0);
      if (shorts) { mk(hip.vis, g.thighShort, M.pants); mk(hip.vis, g.thigh, M.skin).scale.set(0.92, 1, 0.92); }
      else mk(hip.vis, g.thigh, M.pants);
      const kn = seg(hip.joint, 0, -0.44, 0);
      mk(kn.vis, g.knee, shorts ? M.skin : M.pants);
      mk(kn.vis, g.shin, shorts ? M.skin : M.pants);
      mk(kn.vis, g.shoe, M.shoes);
      const foot = new THREE.Group(); foot.position.y = -0.4; kn.joint.add(foot);
      return { hip: hip.joint, hipVis: hip.vis, kn: kn.joint, knVis: kn.vis, foot };
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    // weapons in the right hand
    this.knife = makeKnifeMesh(); this.knife.rotation.x = -Math.PI / 2; this.knife.position.set(0, -0.02, 0);
    this.gun = makeGunMesh(); this.gun.rotation.x = -Math.PI / 2; this.gun.position.set(0, -0.02, 0);
    this.armR.hand.add(this.knife, this.gun);
    this.knife.visible = false; this.gun.visible = false;

    // blob shadow
    this.blob = new THREE.Mesh(g.blob, new THREE.MeshBasicMaterial({ map: T.blob, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;

    this.phase = Math.random() * 10;
    this.swingT = 0; this.recoilT = 0; this.weapon = 0;
    this.light = [1, 1, 1];
    this.lightT = 0;
    this.applyLight();
  }

  addTo(scene) { scene.add(this.root); scene.add(this.blob); }
  removeFrom(scene) { scene.remove(this.root); scene.remove(this.blob); }
  setVisible(v) { this.root.visible = v; this.blob.visible = v; }

  // shirt color = your secret identity color during a round
  setColor(hex) {
    this.mats.shirt.userData.base = hex; this.mats.sleeve.userData.base = hex;
    this.applyLight();
  }
  setLight(r, g, b) { this.light[0] = r; this.light[1] = g; this.light[2] = b; this.applyLight(); }
  applyLight() {
    const [r, g, b] = this.light;
    for (const m of Object.values(this.mats)) { m.color.setHex(m.userData.base); m.color.r *= r; m.color.g *= g; m.color.b *= b; }
  }

  setWeapon(w) { this.weapon = w; this.knife.visible = w === 1; this.gun.visible = w === 2; }
  swing() { this.swingT = 0.35; }
  recoil() { this.recoilT = 0.25; }

  // state: x,y,z,yaw,pitch,speed,onGround,weapon
  update(dt, s, groundY = 0) {
    this.root.position.set(s.x, s.y, s.z);
    this.root.rotation.y = s.yaw;
    this.blob.position.set(s.x, groundY + 0.02, s.z);
    const air = Math.min(1, Math.max(0, (s.y - groundY) / 1.2));
    this.blob.material.opacity = 1 - air * 0.7;
    this.setWeapon(s.weapon);

    const speed = s.speed || 0;
    const moving = Math.min(1, speed / 3.8);
    const runAmt = Math.min(1, Math.max(0, (speed - 4) / 2.6));
    this.phase += dt * (Math.min(speed, 8) * 1.75 + 0.001);
    const ph = this.phase;
    const amp = 0.5 * moving + 0.25 * runAmt;

    let legLx = Math.sin(ph) * amp, legRx = -Math.sin(ph) * amp;
    let kneeL = -Math.max(0, -Math.sin(ph)) * amp * 1.6 - runAmt * 0.3 - 0.05;
    let kneeR = -Math.max(0, Math.sin(ph)) * amp * 1.6 - runAmt * 0.3 - 0.05;
    if (!s.onGround) { legLx = 0.55; legRx = 0.1; kneeL = -1.0; kneeR = -0.5; }
    this.legL.hip.rotation.set(legLx, 0, 0.02); this.legR.hip.rotation.set(legRx, 0, -0.02);
    this.legL.kn.rotation.x = kneeL; this.legR.kn.rotation.x = kneeR;

    const bob = Math.abs(Math.sin(ph)) * 0.035 * moving;
    this.pelvis.joint.position.y = 0.92 + bob - runAmt * 0.04;
    this.pelvis.joint.rotation.y = Math.sin(ph) * 0.12 * moving;
    this.torso.joint.rotation.set(-runAmt * 0.18 + s.pitch * 0.15, -Math.sin(ph) * 0.2 * moving, 0);
    this.head.joint.rotation.set(s.pitch * 0.6, Math.sin(ph) * 0.08 * moving, 0);

    const armSw = Math.sin(ph) * amp * 0.9;
    this.armL.sh.rotation.set(-armSw * 0.9, 0, -0.1);
    this.armL.el.rotation.x = 0.25 + runAmt * 0.9;

    if (this.swingT > 0) this.swingT -= dt;
    if (this.recoilT > 0) this.recoilT -= dt;
    if (s.weapon === 2) {
      const rec = this.recoilT > 0 ? this.recoilT * 2.5 : 0;
      this.armR.sh.rotation.set(Math.PI / 2 + s.pitch * 0.9 + rec, 0, 0.05);
      this.armR.el.rotation.x = 0.05;
      this.armL.sh.rotation.set(Math.PI / 2.2 + s.pitch * 0.9, 0, 0.55);
      this.armL.el.rotation.x = 0.35;
    } else if (s.weapon === 1) {
      const k = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) : 0;
      this.armR.sh.rotation.set(0.9 + k * 1.4 + s.pitch * 0.5, 0, 0.1 - k * 0.3);
      this.armR.el.rotation.x = 0.9 - k * 0.8;
    } else {
      this.armR.sh.rotation.set(armSw * 0.9, 0, 0.1);
      this.armR.el.rotation.x = 0.25 + runAmt * 0.9;
    }
  }

  // World positions of the 15 joints used by the ragdoll
  jointPositions() {
    this.root.updateMatrixWorld(true);
    const v = (obj, x = 0, y = 0, z = 0) => obj.localToWorld(new THREE.Vector3(x, y, z));
    return [
      v(this.head.joint, 0, 0.15, 0),   // 0 head center
      v(this.head.joint),               // 1 neck (base of head)
      v(this.pelvis.joint),             // 2 pelvis
      v(this.armL.sh), v(this.armL.el), v(this.armL.hand),  // 3 4 5
      v(this.armR.sh), v(this.armR.el), v(this.armR.hand),  // 6 7 8
      v(this.legL.hip), v(this.legL.kn), v(this.legL.foot), // 9 10 11
      v(this.legR.hip), v(this.legR.kn), v(this.legR.foot), // 12 13 14
    ];
  }

  dispose() {
    for (const m of Object.values(this.mats)) m.dispose();
    this.blob.material.dispose();
    this.head.vis.traverse((o) => { if (o.isMesh && o.geometry !== geos().head && !Object.values(geos()).includes(o.geometry)) o.geometry.dispose(); });
  }
}

// First-person arm + weapon attached to the camera
export class ViewModel {
  constructor(camera, textures) {
    this.T = textures;
    this.group = new THREE.Group();
    camera.add(this.group);
    this.arm = new THREE.Group();
    this.group.add(this.arm);
    this.sleeve = new THREE.MeshLambertMaterial({ color: 0x888888, map: textures.sleeve });
    this.skin = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
    const g = geos();
    // forearm runs from the hand (arm origin) back toward the camera
    this.fore = new THREE.Mesh(g.foreArm, this.skin); this.fore.rotation.x = Math.PI / 2; this.fore.position.z = 0.375; this.fore.scale.set(1.15, 1.5, 1.15);
    this.hand = new THREE.Mesh(g.hand, this.skin); this.hand.rotation.x = Math.PI / 2; this.hand.position.set(0, -0.01, 0.31); this.hand.scale.set(1.3, 1.05, 1.3);
    this.arm.add(this.fore, this.hand);
    this.knife = makeKnifeMesh(); this.knife.scale.setScalar(1.15); this.knife.position.set(0, 0.03, -0.02);
    this.gun = makeGunMesh(); this.gun.scale.setScalar(1.3); this.gun.position.set(0, 0.04, -0.02);
    this.arm.add(this.knife, this.gun);
    this.swingT = 0; this.recoilT = 0; this.bob = 0; this.throwT = 0;
    this.base = new THREE.Vector3(0.24, -0.24, -0.42);
    this.arm.position.copy(this.base);
    this.lookKey = '';
  }
  setLook(look, shirtColor, light) {
    const long = ['longsleeve', 'buttonup', 'hoodie', 'jacket'].includes(look.shirt);
    this.fore.material = long ? this.sleeve : this.skin;
    this.sleeve.color.setHex(shirtColor).multiplyScalar(light);
    this.skin.color.setHex(look.skin).multiplyScalar(light);
  }
  swing() { this.swingT = 0.35; }
  recoil() { this.recoilT = 0.3; }
  throwAnim() { this.throwT = 0.4; }
  update(dt, weapon, speed, visible) {
    this.group.visible = visible && weapon !== 0;
    this.knife.visible = weapon === 1 && this.throwT <= 0;
    this.gun.visible = weapon === 2;
    this.bob += dt * speed * 1.8;
    const bx = Math.sin(this.bob) * 0.012 * Math.min(1, speed / 4);
    const by = Math.abs(Math.cos(this.bob)) * 0.014 * Math.min(1, speed / 4);
    this.arm.position.set(this.base.x + bx, this.base.y + by, this.base.z);
    this.arm.rotation.set(0, 0, 0);
    if (this.swingT > 0) {
      this.swingT -= dt;
      const k = Math.sin((1 - this.swingT / 0.35) * Math.PI);
      this.arm.position.x -= k * 0.16; this.arm.position.z -= k * 0.18; this.arm.position.y += k * 0.04;
      this.arm.rotation.y = k * 0.9; this.arm.rotation.x = -k * 0.3;
    }
    if (this.recoilT > 0) {
      this.recoilT -= dt;
      const k = this.recoilT / 0.3;
      this.arm.rotation.x = k * 0.5; this.arm.position.z += k * 0.06;
    }
    if (this.throwT > 0) this.throwT -= dt;
  }
}

export { tmpV };
