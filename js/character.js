// Humanoid character model (built from simple shapes, citizen-like proportions)
// plus procedural walk / run / jump / weapon animations.
//
// Facing: the model looks toward -Z when yaw = 0. Right hand is +X.
import * as THREE from '../vendor/three.module.min.js';
import { pick } from './util.js';

const SKINS = [0xe8c4a0, 0xd9a77e, 0xc08a5e, 0x8d5a3b, 0xf1d2b6, 0x6b4128];
const PANTS = [0x2a3550, 0x3a3a3a, 0x4a4033, 0x283a2a, 0x22242a];

// Shared geometries (created once)
let G = null;
function geos() {
  if (G) return G;
  G = {
    torso: new THREE.BoxGeometry(0.42, 0.56, 0.24),
    pelvis: new THREE.BoxGeometry(0.38, 0.2, 0.23),
    head: new THREE.SphereGeometry(0.13, 16, 12),
    neck: new THREE.CylinderGeometry(0.055, 0.06, 0.1, 8),
    upperArm: new THREE.CapsuleGeometry(0.058, 0.2, 3, 8),
    foreArm: new THREE.CapsuleGeometry(0.05, 0.19, 3, 8),
    hand: new THREE.SphereGeometry(0.055, 8, 6),
    thigh: new THREE.CapsuleGeometry(0.085, 0.3, 3, 8),
    shin: new THREE.CapsuleGeometry(0.068, 0.31, 3, 8),
    foot: new THREE.BoxGeometry(0.11, 0.08, 0.25),
    hair: new THREE.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    blob: new THREE.PlaneGeometry(0.9, 0.9),
    // knife
    blade: new THREE.BoxGeometry(0.018, 0.035, 0.24),
    handle: new THREE.BoxGeometry(0.03, 0.04, 0.11),
    // revolver
    barrel: new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8),
    cylinder: new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10),
    frame: new THREE.BoxGeometry(0.035, 0.05, 0.1),
    grip: new THREE.BoxGeometry(0.032, 0.11, 0.045),
  };
  return G;
}

const MAT = {};
function sharedMat(name, color, opts = {}) {
  const key = name + color;
  return (MAT[key] ||= new THREE.MeshLambertMaterial({ color, ...opts }));
}

export function makeKnifeMesh() {
  const g = geos();
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(g.blade, sharedMat('blade', 0xd8dde2, { emissive: 0x202428 }));
  blade.position.z = -0.17;
  const handle = new THREE.Mesh(g.handle, sharedMat('handle', 0x2a1a10));
  handle.position.z = 0.0;
  knife.add(blade, handle);
  return knife;
}

export function makeGunMesh() {
  const g = geos();
  const gun = new THREE.Group();
  const metal = sharedMat('metal', 0x2b2d31, { emissive: 0x0a0a0a });
  const barrel = new THREE.Mesh(g.barrel, metal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.14);
  const cyl = new THREE.Mesh(g.cylinder, metal);
  cyl.rotation.x = Math.PI / 2; cyl.position.set(0, 0.02, -0.03);
  const frame = new THREE.Mesh(g.frame, metal); frame.position.set(0, 0.025, 0.0);
  const grip = new THREE.Mesh(g.grip, sharedMat('grip', 0x5a3518));
  grip.position.set(0, -0.03, 0.04); grip.rotation.x = -0.35;
  gun.add(barrel, cyl, frame, grip);
  return gun;
}

export class CharacterModel {
  constructor(textures) {
    const g = geos();
    this.root = new THREE.Group();
    this.skinColor = pick(SKINS);
    this.mats = {
      shirt: new THREE.MeshLambertMaterial({ color: 0x888888 }),
      pants: new THREE.MeshLambertMaterial({ color: pick(PANTS) }),
      skin: new THREE.MeshLambertMaterial({ color: this.skinColor }),
      face: new THREE.MeshLambertMaterial({ map: textures.face, color: this.skinColor }),
      shoes: sharedMat('shoes', 0x1c1c1c),
      hair: new THREE.MeshLambertMaterial({ color: pick([0x1a1410, 0x3b2716, 0x6b4a2b, 0xa0763c, 0x222222]) }),
    };
    const M = this.mats;
    const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); return m; };

    // pelvis at hip height
    this.pelvis = new THREE.Group(); this.pelvis.position.y = 0.95; this.root.add(this.pelvis);
    const pelvisMesh = mesh(g.pelvis, M.pants); pelvisMesh.position.y = 0.0; this.pelvis.add(pelvisMesh);

    this.torso = new THREE.Group(); this.pelvis.add(this.torso);
    const torsoMesh = mesh(g.torso, M.shirt); torsoMesh.position.y = 0.3; this.torso.add(torsoMesh);

    this.neck = new THREE.Group(); this.neck.position.y = 0.6; this.torso.add(this.neck);
    const neckMesh = mesh(g.neck, M.skin); neckMesh.position.y = 0.0; this.neck.add(neckMesh);
    this.head = new THREE.Group(); this.head.position.y = 0.04; this.neck.add(this.head);
    const headMesh = mesh(g.head, M.face); headMesh.position.y = 0.13; headMesh.scale.set(1, 1.12, 1.05); this.head.add(headMesh);
    const hair = mesh(g.hair, M.hair); hair.position.y = 0.15; hair.scale.set(1.02, 1.0, 1.06); this.head.add(hair);
    this.headMesh = headMesh;

    const makeArm = (side) => {
      const sh = new THREE.Group(); sh.position.set(0.27 * side, 0.52, 0); this.torso.add(sh);
      const up = mesh(g.upperArm, M.shirt); up.position.y = -0.15; sh.add(up);
      const el = new THREE.Group(); el.position.y = -0.3; sh.add(el);
      const fo = mesh(g.foreArm, M.skin); fo.position.y = -0.14; el.add(fo);
      const hand = new THREE.Group(); hand.position.y = -0.29; el.add(hand);
      hand.add(mesh(g.hand, M.skin));
      return { sh, el, hand };
    };
    this.armL = makeArm(-1);
    this.armR = makeArm(1);

    const makeLeg = (side) => {
      const hip = new THREE.Group(); hip.position.set(0.1 * side, -0.03, 0); this.pelvis.add(hip);
      const th = mesh(g.thigh, M.pants); th.position.y = -0.22; hip.add(th);
      const kn = new THREE.Group(); kn.position.y = -0.45; hip.add(kn);
      const sh = mesh(g.shin, M.pants); sh.position.y = -0.22; kn.add(sh);
      const foot = new THREE.Group(); foot.position.y = -0.45; kn.add(foot);
      const fm = mesh(g.foot, M.shoes); fm.position.set(0, 0.0, -0.05); foot.add(fm);
      return { hip, kn, foot };
    };
    this.legL = makeLeg(-1);
    this.legR = makeLeg(1);

    // weapons (held in right hand)
    this.knife = makeKnifeMesh();
    this.knife.rotation.x = -Math.PI / 2; // point forward when arm is down -> rotate with hand
    this.knife.position.set(0, -0.02, 0);
    this.armR.hand.add(this.knife);
    this.gun = makeGunMesh();
    this.gun.rotation.x = -Math.PI / 2;
    this.gun.position.set(0, -0.02, 0);
    this.armR.hand.add(this.gun);
    this.knife.visible = false; this.gun.visible = false;

    // blob shadow
    this.blob = new THREE.Mesh(g.blob, new THREE.MeshBasicMaterial({ map: textures.blob, transparent: true, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.renderOrder = 1;

    this.phase = Math.random() * 10;
    this.swingT = 0;
    this.recoilT = 0;
    this.weapon = 0;
  }

  addTo(scene) { scene.add(this.root); scene.add(this.blob); }
  removeFrom(scene) { scene.remove(this.root); scene.remove(this.blob); }
  setVisible(v) { this.root.visible = v; this.blob.visible = v; }

  setColor(hex) { this.mats.shirt.color.setHex(hex); }

  setWeapon(w) {
    this.weapon = w;
    this.knife.visible = w === 1;
    this.gun.visible = w === 2;
  }

  swing() { this.swingT = 0.35; }
  recoil() { this.recoilT = 0.25; }

  // state: x,y,z,yaw,pitch,speed,onGround,vy,weapon
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
    this.phase += dt * (speed * 1.9 + 0.001);
    const ph = this.phase;
    const amp = 0.55 * moving + 0.25 * runAmt;

    let legLx = Math.sin(ph) * amp, legRx = -Math.sin(ph) * amp;
    let kneeL = -Math.max(0, -Math.sin(ph)) * amp * 1.5 - (runAmt * 0.3);
    let kneeR = -Math.max(0, Math.sin(ph)) * amp * 1.5 - (runAmt * 0.3);
    if (!s.onGround) { // jumping / falling pose
      legLx = 0.5; legRx = 0.1; kneeL = -0.9; kneeR = -0.5;
    }
    this.legL.hip.rotation.x = legLx; this.legR.hip.rotation.x = legRx;
    this.legL.kn.rotation.x = kneeL; this.legR.kn.rotation.x = kneeR;
    this.legL.foot.rotation.x = -kneeL * 0.3 - legLx * 0.3;
    this.legR.foot.rotation.x = -kneeR * 0.3 - legRx * 0.3;

    // bob + lean
    const bob = Math.abs(Math.sin(ph)) * 0.04 * moving;
    this.pelvis.position.y = 0.95 + bob - runAmt * 0.04;
    this.torso.rotation.x = -runAmt * 0.18 + s.pitch * 0.15;
    this.head.rotation.x = s.pitch * 0.6;

    // Arms
    const armSw = Math.sin(ph) * amp * 0.9;
    this.armL.sh.rotation.set(-armSw * 0.9, 0, -0.08);
    this.armL.el.rotation.x = 0.25 + runAmt * 0.9;

    if (this.swingT > 0) this.swingT -= dt;
    if (this.recoilT > 0) this.recoilT -= dt;
    if (s.weapon === 2) {
      // aim the revolver forward following pitch
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
      this.armR.sh.rotation.set(armSw * 0.9, 0, 0.08);
      this.armR.el.rotation.x = 0.25 + runAmt * 0.9;
    }
    // hand rotation so held weapons point along the forearm's forward direction
    this.armR.hand.rotation.x = 0;
  }

  // World positions of the 15 joints used by the ragdoll
  jointPositions() {
    this.root.updateMatrixWorld(true);
    const v = (obj, x = 0, y = 0, z = 0) => obj.localToWorld(new THREE.Vector3(x, y, z));
    return [
      v(this.head, 0, 0.14, 0),        // 0 head
      v(this.neck, 0, -0.02, 0),       // 1 neck / chest top
      v(this.pelvis),                  // 2 pelvis
      v(this.armL.sh), v(this.armL.el), v(this.armL.hand),   // 3 4 5
      v(this.armR.sh), v(this.armR.el), v(this.armR.hand),   // 6 7 8
      v(this.legL.hip), v(this.legL.kn), v(this.legL.foot),  // 9 10 11
      v(this.legR.hip), v(this.legR.kn), v(this.legR.foot),  // 12 13 14
    ];
  }

  dispose() {
    for (const k of ['shirt', 'pants', 'skin', 'face', 'hair']) this.mats[k].dispose();
    this.blob.material.dispose();
  }
}

// First-person weapon view model (hands + knife/gun attached to the camera)
export class ViewModel {
  constructor(camera) {
    this.group = new THREE.Group();
    camera.add(this.group);
    const g = geos();
    this.sleeve = new THREE.MeshLambertMaterial({ color: 0x888888 });
    this.skin = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
    this.arm = new THREE.Group();
    const fore = new THREE.Mesh(g.foreArm, this.skin);
    fore.rotation.x = Math.PI / 2; fore.position.z = 0.16; fore.scale.set(1.1, 1.3, 1.1);
    const sleeve = new THREE.Mesh(g.upperArm, this.sleeve);
    sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.42; sleeve.scale.set(1.2, 1.2, 1.2);
    const hand = new THREE.Mesh(g.hand, this.skin); hand.scale.set(1.3, 1.1, 1.4);
    this.arm.add(fore, sleeve, hand);
    this.group.add(this.arm);
    this.knife = makeKnifeMesh(); this.knife.scale.setScalar(1.15);
    this.gun = makeGunMesh(); this.gun.scale.setScalar(1.3);
    this.arm.add(this.knife, this.gun);
    this.knife.position.set(0, 0.03, -0.02);
    this.gun.position.set(0, 0.04, -0.02);
    this.weapon = 0;
    this.swingT = 0; this.recoilT = 0; this.bob = 0; this.throwT = 0;
    this.base = new THREE.Vector3(0.24, -0.24, -0.42);
    this.arm.position.copy(this.base);
  }
  setColor(hex, skin) { this.sleeve.color.setHex(hex); if (skin != null) this.skin.color.setHex(skin); }
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
