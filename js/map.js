// =====================================================================
//  MAP.JS — the level. Edit the ASCII LAYOUT below to change the map!
//
//  Each character = one CELL (2 x 2 meters).
//    #  wall (full height)          .  indoor floor (has ceiling)
//    o  outdoor floor (open sky)    P  pillar (full height)
//    C  crate (indoor, jumpable)    c  crate (outdoor)
//    H  half wall (indoor, jump)    h  half wall (outdoor)
//    S  spawn point (indoor)        s  spawn point (outdoor)
//    G  gun part spot (indoor)      g  gun part spot (outdoor)
//  Keep the outer border made of '#'. All rows must be the same length.
// =====================================================================
import * as THREE from '../vendor/three.module.min.js';

export const CELL = 2;          // meters per character
export const WALL_H = 6;        // wall height
export const CEIL_H = 6;        // ceiling height indoors
export const CRATE_H = 0.9;     // jumpable
export const HALF_H = 1.0;      // jumpable half wall

export const LAYOUT = [
  '############################################',
  '############################################',
  '##...........G################............##',
  '##............################.CC..G...CC.##',
  '##..S......S..################.C.S......C.##',
  '##...............P...P...P................##',
  '##....................................S...##',
  '##.G...PP.......S....G.....S.............G##',
  '##.....PP...........................CC....##',
  '##..........G....P...P...P..........C.....##',
  '##............#####......#####.........S..##',
  '##..S......S..#####......#####....S.......##',
  '##............#####...G..#####..CC......C.##',
  '##............#####......#####G...........##',
  '#####.....#########......#########.....#####',
  '#####.....#########......#########.....#####',
  '#####..S..######ooooooooooog######..S..#####',
  '#####P...P######oooosooooooo######P...P#####',
  '#####.....######oohhooooocoo######.....#####',
  '#####...........oooooooooooo...........#####',
  '#####...........osoogoooooso...........#####',
  '#####P.G.P..G...ooooohoooooo......P.G.P#####',
  '#####...........oooooohooooo...G.......#####',
  '#####...........ooooooogooso...........#####',
  '#####...........oocooooooooo...........#####',
  '#####P...P######oocooooohhoo######P...P#####',
  '#####.....######ooooooosoooo######.....#####',
  '#####..S..######gooooooooooo######..S..#####',
  '#####.....#########......#########.....#####',
  '#####.....#########......#########.....#####',
  '##............#####......#####............##',
  '##............#####..G...#####............##',
  '##..S.....SC..#####......#####..S......S..##',
  '##............#####......#####...P....P...##',
  '##..HHHH.........P...P...P................##',
  '##.G...............................C......##',
  '##..............S....G.....S........C....G##',
  '##......HHHH..............................##',
  '##...............P...P...P.......P....P...##',
  '##..S.......S.################..S......S..##',
  '##.CC.........################............##',
  '##..........G.################.G..........##',
  '############################################',
  '############################################',
];

// Cell kinds
const K = { FLOOR: 0, WALL: 1, PILLAR: 2, CRATE: 3, HALF: 4 };

export class GameMap {
  constructor(layout = LAYOUT) {
    this.layout = layout;
    this.h = layout.length;
    this.w = layout[0].length;
    this.worldW = this.w * CELL;
    this.worldD = this.h * CELL;
    const n = this.w * this.h;
    this.heights = new Float32Array(n);  // solid height of each cell (0 = walkable floor)
    this.kinds = new Uint8Array(n);
    this.outdoor = new Uint8Array(n);
    this.spawns = [];
    this.partSpots = [];
    for (let z = 0; z < this.h; z++) {
      const row = layout[z];
      for (let x = 0; x < this.w; x++) {
        const ch = row[x] || '#';
        const i = z * this.w + x;
        const isOut = ch === ch.toLowerCase() && ch !== '#' && ch !== '.';
        this.outdoor[i] = isOut ? 1 : 0;
        const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
        switch (ch) {
          case '#': this.kinds[i] = K.WALL; this.heights[i] = WALL_H; break;
          case 'P': this.kinds[i] = K.PILLAR; this.heights[i] = WALL_H; break;
          case 'C': case 'c': this.kinds[i] = K.CRATE; this.heights[i] = CRATE_H; break;
          case 'H': case 'h': this.kinds[i] = K.HALF; this.heights[i] = HALF_H; break;
          case 'S': case 's': this.spawns.push({ x: cx, z: cz }); break;
          case 'G': case 'g': this.partSpots.push({ x: cx, z: cz }); break;
          default: break;
        }
      }
    }
  }

  inBounds(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h; }
  // Solid height of the cell at grid coords (out of bounds = wall)
  cellHeight(cx, cz) { return this.inBounds(cx, cz) ? this.heights[cz * this.w + cx] : WALL_H; }
  heightAt(x, z) { return this.cellHeight(Math.floor(x / CELL), Math.floor(z / CELL)); }
  isOutdoorCell(cx, cz) { return this.inBounds(cx, cz) && this.outdoor[cz * this.w + cx] === 1; }
  isOutdoor(x, z) { return this.isOutdoorCell(Math.floor(x / CELL), Math.floor(z / CELL)); }
  center() { return { x: this.worldW / 2, z: this.worldD / 2 }; }

  // ---------------------------------------------------------------
  //  Build the 3D meshes for the level
  // ---------------------------------------------------------------
  build(T) {
    const group = new THREE.Group();
    const mats = {
      wall: new THREE.MeshLambertMaterial({ map: T.wall }),
      pillar: new THREE.MeshLambertMaterial({ map: T.concrete }),
      crate: new THREE.MeshLambertMaterial({ map: T.crate }),
      half: new THREE.MeshLambertMaterial({ map: T.brick }),
      floor: new THREE.MeshLambertMaterial({ map: T.floor }),
      grass: new THREE.MeshLambertMaterial({ map: T.grass }),
      ceiling: new THREE.MeshLambertMaterial({ map: T.ceiling, side: THREE.DoubleSide }),
      light: new THREE.MeshBasicMaterial({ color: 0xfffbe8 }),
    };

    // Greedy-merge cells of the same kind into big boxes (fewer triangles + draw calls)
    const boxesOf = (pred) => {
      const used = new Uint8Array(this.w * this.h);
      const out = [];
      for (let z = 0; z < this.h; z++) {
        for (let x = 0; x < this.w; x++) {
          const i = z * this.w + x;
          if (used[i] || !pred(x, z)) continue;
          let x1 = x;
          while (x1 + 1 < this.w && !used[z * this.w + x1 + 1] && pred(x1 + 1, z)) x1++;
          let z1 = z;
          outer: while (z1 + 1 < this.h) {
            for (let xx = x; xx <= x1; xx++) if (used[(z1 + 1) * this.w + xx] || !pred(xx, z1 + 1)) break outer;
            z1++;
          }
          for (let zz = z; zz <= z1; zz++) for (let xx = x; xx <= x1; xx++) used[zz * this.w + xx] = 1;
          out.push([x, z, x1, z1]);
        }
      }
      return out;
    };

    const kindPred = (k) => (x, z) => this.kinds[z * this.w + x] === k;

    const addBoxes = (rects, h, mat, texSize, inset = 0) => {
      const b = new BoxBuilder(texSize);
      for (const [x0, z0, x1, z1] of rects) {
        b.box(x0 * CELL + inset, 0, z0 * CELL + inset, (x1 + 1) * CELL - inset, h, (z1 + 1) * CELL - inset);
      }
      const mesh = new THREE.Mesh(b.geometry(), mat);
      group.add(mesh);
      return mesh;
    };

    addBoxes(boxesOf(kindPred(K.WALL)), WALL_H, mats.wall, 4);
    addBoxes(boxesOf(kindPred(K.PILLAR)), WALL_H, mats.pillar, 2);
    // crates are drawn as individual boxes (no merging) so each looks like a crate
    {
      const b = new BoxBuilder(CELL);
      for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
        if (this.kinds[z * this.w + x] === K.CRATE) b.box(x * CELL, 0, z * CELL, (x + 1) * CELL, CRATE_H, (z + 1) * CELL, true);
      }
      group.add(new THREE.Mesh(b.geometry(), mats.crate));
    }
    addBoxes(boxesOf(kindPred(K.HALF)), HALF_H, mats.half, 2);

    // Floors
    const notWall = (x, z) => this.kinds[z * this.w + x] !== K.WALL;
    const isIn = (x, z) => notWall(x, z) && !this.outdoor[z * this.w + x];
    const isOut = (x, z) => notWall(x, z) && this.outdoor[z * this.w + x];
    const plane = (rects, y, mat, texSize, down) => {
      const b = new BoxBuilder(texSize);
      for (const [x0, z0, x1, z1] of rects) b.quadY(x0 * CELL, z0 * CELL, (x1 + 1) * CELL, (z1 + 1) * CELL, y, down);
      const m = new THREE.Mesh(b.geometry(), mat);
      group.add(m);
      return m;
    };
    plane(boxesOf(isIn), 0, mats.floor, 2, false);
    plane(boxesOf(isOut), 0, mats.grass, 4, false);
    plane(boxesOf(isIn), CEIL_H, mats.ceiling, 4, true);

    // Ceiling light panels (cheap: no real lights, just glowing quads)
    {
      const b = new BoxBuilder(1);
      for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
        if (x % 3 === 1 && z % 3 === 1 && isIn(x, z)) {
          const cx = (x + 0.5) * CELL, cz = (z + 0.5) * CELL;
          b.quadY(cx - 0.7, cz - 0.35, cx + 0.7, cz + 0.35, CEIL_H - 0.02, true);
        }
      }
      group.add(new THREE.Mesh(b.geometry(), mats.light));
    }

    // Wall tops visible from the courtyard look nicer with a concrete trim
    return group;
  }
}

// Builds box / quad geometry with world-space UVs so textures tile evenly.
class BoxBuilder {
  constructor(texSize) {
    this.s = texSize; this.pos = []; this.nor = []; this.uv = []; this.idx = [];
  }
  _quad(p, n, uv) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uv[i][0], uv[i][1]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // perFace: UVs 0..1 per face (for crates), else world-space
  box(x0, y0, z0, x1, y1, z1, perFace = false) {
    const s = this.s;
    const U = (a, b) => (perFace ? [a, b] : [a / s, b / s]);
    const fx = (u0, u1, v0, v1) => perFace ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [U(u0, v0), U(u1, v0), U(u1, v1), U(u0, v1)];
    // +X
    this._quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], fx(z1, z0, y0, y1).map(([a, b]) => perFace ? [a, b] : [-a, b]));
    // -X
    this._quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], fx(z0, z1, y0, y1));
    // +Z
    this._quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], fx(x0, x1, y0, y1));
    // -Z
    this._quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], fx(x1, x0, y0, y1).map(([a, b]) => perFace ? [a, b] : [-a, b]));
    // +Y (top)
    this._quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], fx(x0, x1, z1, z0).map(([a, b]) => perFace ? [a, b] : [a, -b]));
  }
  quadY(x0, z0, x1, z1, y, down) {
    const s = this.s;
    if (!down) {
      this._quad([[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0],
        [[x0 / s, -z1 / s], [x1 / s, -z1 / s], [x1 / s, -z0 / s], [x0 / s, -z0 / s]]);
    } else {
      this._quad([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [0, -1, 0],
        [[x0 / s, z0 / s], [x1 / s, z0 / s], [x1 / s, z1 / s], [x0 / s, z1 / s]]);
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
