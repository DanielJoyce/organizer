// Part generators. Every part is a function of plain parameter objects and returns one solid.
// Conventions: lattice origin at a part's corner, X and Y in the plate, plate top at z = 0.
// Faces marked M carry bosses and can only be the face printed on the bed.
// Faces marked F carry lattice cells and can be printed in any orientation.
import { Manifold, Solid, box, cyl, loft, sqStack, union } from "./kernel.js";

export interface System {
  u: number; // lattice pitch, also the height unit
  wall: number; // lattice wall thickness
  plateT: number; // lattice depth
  standoff: number; // space behind a wall plate
  bossW: number; // locating boss width (clearance fit)
  bossL: number; // boss and grip peg length
  bossBore: number; // bosses are hollow square tubes; 0 makes them solid
  gripRoot: number; // grip peg width at root and neck
  gripBulge: number; // grip peg width at the bulge (interference)
  bodyGap: number; // gap between neighbouring module bodies
  seamRelief: number; // relief under perimeter walls for the seam joiner
  floorT: number; // module floor
  binWall: number;
}

/** System constants for a given lattice pitch. Fits are the same at every pitch. */
export function makeSystem(u: number, over: Partial<System> = {}): System {
  const wall = 1.2;
  const cell = u - wall;
  const bossW = cell - 0.4;
  return {
    u,
    wall,
    plateT: 4.8,
    standoff: 3.2,
    bossW,
    bossL: 3.2,
    // Ring wall is 0.8 mm on small bosses. On large ones the bore is capped so the floor
    // above it never bridges more than 9.6 mm.
    bossBore: Math.min(bossW - 1.6, 9.6),
    gripRoot: cell - 0.2,
    gripBulge: cell + 0.3,
    bodyGap: 0.4,
    seamRelief: 0.8,
    floorT: 2,
    binWall: 1.2,
    ...over,
  };
}

export const SYS: System = makeSystem(16);

const cellHole = (s: System) => s.u - s.wall;
const cx = (s: System, i: number) => (i + 0.5) * s.u;

// ---------------------------------------------------------------- lattice plate (F face)

export interface PlateOpts {
  cols: number;
  rows: number;
  /** Cells turned into solid screw bosses with a countersunk hole. Adds the standoff. */
  screws?: [number, number][];
  screwD?: number;
}

/** Open lattice. Top face at z = 0. Print top face down. */
export function plate(s: System, o: PlateOpts): Solid {
  const W = o.cols * s.u;
  const D = o.rows * s.u;
  const h = cellHole(s);
  const screws = new Set((o.screws ?? []).map(([i, j]) => `${i},${j}`));
  const holes: Solid[] = [];
  for (let i = 0; i < o.cols; i++)
    for (let j = 0; j < o.rows; j++)
      if (!screws.has(`${i},${j}`))
        holes.push(box(cx(s, i) - h / 2, cx(s, j) - h / 2, -s.plateT - 1, h, h, s.plateT + 2));
  let p = box(0, 0, -s.plateT, W, D, s.plateT).subtract(union(holes));
  // Perimeter half-walls stop short of the bottom so a flat joiner can pass under the seam.
  const r = s.seamRelief;
  const relief: Solid[] = [];
  for (let i = 0; i < o.cols; i++) {
    relief.push(box(cx(s, i) - h / 2, -1, -s.plateT - 1, h, 2, r + 1));
    relief.push(box(cx(s, i) - h / 2, D - 1, -s.plateT - 1, h, 2, r + 1));
  }
  for (let j = 0; j < o.rows; j++) {
    relief.push(box(-1, cx(s, j) - h / 2, -s.plateT - 1, 2, h, r + 1));
    relief.push(box(W - 1, cx(s, j) - h / 2, -s.plateT - 1, 2, h, r + 1));
  }
  p = p.subtract(union(relief));
  if (o.screws?.length) {
    const d = o.screwD ?? 4.4;
    const posts: Solid[] = [];
    const bores: Solid[] = [];
    for (const [i, j] of o.screws) {
      posts.push(box(i * s.u, j * s.u, -s.plateT - s.standoff, s.u, s.u, s.standoff));
      const at = [cx(s, i), cx(s, j)] as const;
      bores.push(cyl(s.plateT + s.standoff + 2, d / 2).translate([at[0], at[1], -s.plateT - s.standoff - 1]));
      bores.push(cyl(d / 2, d / 2, d, 32).translate([at[0], at[1], -d / 2 + 0.01])); // countersink
    }
    p = union([p, ...posts]).subtract(union(bores));
  }
  return p;
}

// ---------------------------------------------------------------- module foot (M face)

export type Grip = "corners" | "checker" | "edges" | "none";

export interface FootOpts {
  nx: number;
  ny: number;
  grip?: Grip;
  /** Cells left open for twist keys. */
  lock?: [number, number][];
  /** "all": a boss in every cell, floor bridges 1.6 mm. "checker": half the bosses, floor bridges 9.6 mm. */
  fill?: "all" | "checker";
}

/** Locating boss. Clearance fit, carries shear. Root at z = 0, tip down. */
export function boss(s: System): Solid {
  const c = 0.6;
  return sqStack([
    [-s.bossL, s.bossW - 2 * c],
    [-s.bossL + c, s.bossW],
    [0.01, s.bossW],
  ]);
}

/** Grip peg. Same envelope as a boss plus a bulge that interferes with the cell. */
export function gripPeg(s: System): Solid {
  const L = s.bossL;
  return sqStack([
    [-L, s.gripRoot - 1.6],
    [-L + 0.8, s.gripRoot],
    [-L + 1.2, s.gripRoot],
    [-L + 1.8, s.gripBulge],
    [-L + 2.4, s.gripRoot],
    [0.01, s.gripRoot],
  ]);
}

function isGrip(g: Grip, i: number, j: number, nx: number, ny: number): boolean {
  const edgeI = i === 0 || i === nx - 1;
  const edgeJ = j === 0 || j === ny - 1;
  if (g === "corners") return edgeI && edgeJ;
  if (g === "edges") return (edgeI || edgeJ) && (i + j) % 2 === 0;
  if (g === "checker") return (i + j) % 2 === 0;
  return false;
}

/** Bosses under a module floor. Every cell gets one, so the floor only bridges 1.6 mm gaps. */
export function foot(s: System, o: FootOpts): Solid {
  const lock = new Set((o.lock ?? []).map(([i, j]) => `${i},${j}`));
  const b = boss(s);
  const g = gripPeg(s);
  const parts: Solid[] = [];
  const bores: Solid[] = [];
  for (let i = 0; i < o.nx; i++)
    for (let j = 0; j < o.ny; j++) {
      if (lock.has(`${i},${j}`)) continue;
      const grip = isGrip(o.grip ?? "corners", i, j, o.nx, o.ny);
      if (!grip && o.fill === "checker" && (i + j) % 2 === 1) continue;
      parts.push((grip ? g : b).translate([cx(s, i), cx(s, j), 0]));
      if (s.bossBore > 0)
        bores.push(box(cx(s, i) - s.bossBore / 2, cx(s, j) - s.bossBore / 2, -s.bossL - 1, s.bossBore, s.bossBore, s.bossL + 1));
    }
  return bores.length ? union(parts).subtract(union(bores)) : union(parts);
}

/** Through holes in a module floor that line up with plate cells and accept a twist key. */
export function lockHoles(s: System, cells: [number, number][], depth: number): Solid {
  const h = cellHole(s);
  return union(cells.map(([i, j]) => box(cx(s, i) - h / 2, cx(s, j) - h / 2, -1, h, h, depth + 2)));
}

// ---------------------------------------------------------------- fasteners

/** Twist key. Square head passes a cell, a 45 degree turn puts its corners under the walls. */
export function twistKey(s: System, stack: number): Solid {
  const head = 1.6;
  const r = s.bossW / 2;
  const neck = stack + 0.1;
  const capR = r + 2.8;
  const parts = [
    box(-r, -r, 0, 2 * r, 2 * r, head),
    cyl(neck, r).translate([0, 0, head]),
    cyl(capR - r, r, capR).translate([0, 0, head + neck]),
    cyl(1, capR).translate([0, 0, head + neck + capR - r]),
    box(-capR, -1.2, head + neck + capR - r + 1, 2 * capR, 2.4, 5),
  ];
  return union(parts);
}

/** Double-ended grip peg that joins two F faces. Print lying on its side. */
export function dowel(s: System): Solid {
  const half = gripPeg(s);
  return union([half, half.mirror([0, 0, 1])]).rotate([90, 0, 0]);
}

/** Flat joiner that sits under a seam and pins the two edge cells of adjacent plates. */
export function seamJoiner(s: System): Solid {
  const t = s.seamRelief;
  const pegH = s.plateT - s.bossL - 0.1;
  const c = s.u - s.wall;
  const peg = sqStack([
    [0, c - 0.2],
    [pegH * 0.5, c + 0.2],
    [pegH, c - 0.6],
  ]);
  return union([
    box(-s.u + 0.3, -s.bossW / 2, -t, 2 * s.u - 0.6, s.bossW, t),
    peg.translate([-s.u / 2, 0, 0]),
    peg.translate([s.u / 2, 0, 0]),
  ]);
}

// ---------------------------------------------------------------- bin

export interface BinOpts {
  nx: number;
  ny: number;
  nz: number;
  grip?: Grip;
  lock?: [number, number][];
}

export function bin(s: System, o: BinOpts): Solid {
  const g = s.bodyGap / 2;
  const W = o.nx * s.u - 2 * g;
  const D = o.ny * s.u - 2 * g;
  const H = o.nz * s.u;
  const w = s.binWall;
  let body = box(g, g, 0, W, D, H).subtract(box(g + w, g + w, s.floorT, W - 2 * w, D - 2 * w, H));
  body = union([body, foot(s, o)]);
  if (o.lock?.length) body = body.subtract(lockHoles(s, o.lock, s.floorT));
  return body;
}

// ---------------------------------------------------------------- paint cell

export interface PaintOpts {
  bottleD: number;
  cellMm: number; // cell pitch in mm, a whole number of lattice units
  cols: number;
  rows: number;
  heightMm: number;
  lobes: 4 | 6;
  boreClearance: number;
  tubeWall: number;
  interference: number;
  perimeterSlack: number;
  ledgeD: number;
  /** Extra row of lattice cells behind the rack that carries twist-key holes. */
  lockStrip: boolean;
  points: number;
  zStep: number;
}

export const DROPPER: PaintOpts = {
  bottleD: 26,
  cellMm: 32,
  cols: 1,
  rows: 1,
  heightMm: 24,
  lobes: 6,
  boreClearance: 1.5,
  tubeWall: 1.2,
  interference: 0.5,
  perimeterSlack: 0.3,
  ledgeD: 23,
  lockStrip: false,
  points: 72,
  zStep: 0.5,
};

/** Convex m-lobed profile. p = 2 is a circle, larger p pulls m flats in towards radius R. */
function lobeRing(R: number, p: number, m: number, n: number): [number, number][] {
  const dirs = Array.from({ length: m / 2 }, (_, k) => (k * 2 * Math.PI) / m);
  const N = (t: number) => Math.pow(dirs.reduce((a, d) => a + Math.pow(Math.abs(Math.cos(t - d)), p), 0), 1 / p);
  const n0 = N(0);
  return Array.from({ length: n }, (_, i) => {
    const t = (i * 2 * Math.PI) / n;
    const r = (R * n0) / N(t);
    return [r * Math.cos(t), r * Math.sin(t)] as [number, number];
  });
}

const ringLength = (r: [number, number][]) =>
  r.reduce((a, q, i) => a + Math.hypot(q[0] - r[(i + 1) % r.length][0], q[1] - r[(i + 1) % r.length][1]), 0);

/** Solve p so the ring has the requested perimeter. The flats stay at radius R. */
function solveP(R: number, perimeter: number, m: number, n: number): number {
  if (ringLength(lobeRing(R, 2, m, n)) >= perimeter) return 2;
  let lo = 2;
  let hi = 40;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ringLength(lobeRing(R, mid, m, n)) < perimeter) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function offsetRing(r: [number, number][], d: number): [number, number][] {
  const n = r.length;
  return r.map((q, i) => {
    const a = r[(i + n - 1) % n];
    const b = r[(i + 1) % n];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty);
    return [q[0] + (d * ty) / l, q[1] - (d * tx) / l] as [number, number];
  });
}

const smooth = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));

/** One squeeze tube: circle at the base, lobed in the grip band, circle again at the top. */
function squeezeTube(s: System, o: PaintOpts): { outer: Solid; bore: Solid } {
  const H = o.heightMm;
  const rBore = (o.bottleD + o.boreClearance) / 2;
  const rFlat = o.bottleD / 2 - o.interference;
  const z0 = s.floorT;
  const [a, b, c, d] = [z0 + 1.5, z0 + 5.5, z0 + 7.5, z0 + 11.5];
  const blend = (z: number) => (z < b ? smooth((z - a) / (b - a)) : 1 - smooth((z - c) / (d - c)));
  const zs: number[] = [];
  for (let z = z0; z < H - 1e-6; z += o.zStep) zs.push(z);
  zs.push(H);
  const pTight = 2 * Math.PI * (o.bottleD / 2 + o.perimeterSlack);
  const bore = zs.map((z) => {
    const t = blend(z);
    const R = rBore + (rFlat - rBore) * t;
    const per = 2 * Math.PI * rBore + (pTight - 2 * Math.PI * rBore) * t;
    return lobeRing(R, t < 1e-6 ? 2 : solveP(R, per, o.lobes, o.points), o.lobes, o.points);
  });
  const lead = 0.8;
  const inner = bore.map((r, i) => offsetRing(r, Math.max(0, zs[i] - (H - lead))));
  const outer = bore.map((r, i) => offsetRing(r, o.tubeWall + Math.max(0, z0 + 2 - zs[i])));
  const zOuter = [0.2, ...zs.slice(1)];
  return {
    outer: loft(outer, zOuter),
    bore: loft([...inner, inner[inner.length - 1]], [...zs, H + 1]),
  };
}

/** Paint rack: cols x rows squeeze tubes on one floor, with an optional lock strip at the back. */
export function paintRack(s: System, o: PaintOpts): Solid {
  const pitch = o.cellMm;
  const cellU = Math.round(pitch / s.u);
  if (Math.abs(cellU * s.u - pitch) > 1e-9) throw new Error(`cell pitch ${pitch} is not a multiple of ${s.u}`);
  const g = s.bodyGap / 2;
  const nx = o.cols * cellU;
  const ny = o.rows * cellU + (o.lockStrip ? 1 : 0);
  const lock: [number, number][] = o.lockStrip
    ? [
        [nx > 2 ? 1 : 0, ny - 1],
        [nx > 2 ? nx - 2 : nx - 1, ny - 1],
      ]
    : [];
  const { outer, bore } = squeezeTube(s, o);
  const outers: Solid[] = [];
  const cuts: Solid[] = [];
  for (let i = 0; i < o.cols; i++)
    for (let j = 0; j < o.rows; j++) {
      const at: [number, number, number] = [(i + 0.5) * pitch, (j + 0.5) * pitch, 0];
      outers.push(outer.translate(at));
      cuts.push(bore.translate(at));
      cuts.push(cyl(s.floorT + s.bossL + 2, o.ledgeD / 2, o.ledgeD / 2, 64).translate([at[0], at[1], -s.bossL - 1]));
    }
  const slab = box(g, g, 0, nx * s.u - 2 * g, ny * s.u - 2 * g, s.floorT);
  const envelope = box(g, g, -10, nx * s.u - 2 * g, ny * s.u - 2 * g, 400);
  let body = union([slab, ...outers, foot(s, { nx, ny, grip: "corners", lock })]).intersect(envelope);
  body = body.subtract(union(cuts));
  if (lock.length) body = body.subtract(lockHoles(s, lock, s.floorT));
  return body;
}

// ---------------------------------------------------------------- drawer unit

export interface DrawerOpts {
  nx: number; // outer width in units
  nz: number; // outer height in units
  ny: number; // depth in units
  wall: number;
  slide: number; // clearance per side between drawer and shell
}

export const DRAWER: DrawerOpts = { nx: 12, nz: 6, ny: 15, wall: 1.6, slide: 0.4 };

/**
 * Drawer shell. Printed standing on its back, so no face bridges more than one cell.
 * Top and bottom carry F rails (rows of lattice pockets) for dowels to plates or other shells.
 */
export function drawerShell(s: System, o: DrawerOpts): Solid {
  const W = o.nx * s.u;
  const H = o.nz * s.u;
  const D = o.ny * s.u;
  const rail = s.plateT; // rail depth below the cavity floor
  const h = cellHole(s);
  const outer = box(0, 0, 0, W, D, H);
  const cavity = box(o.wall, -1, rail, W - 2 * o.wall, D - 1.2 + 1, H - 2 * rail);
  // Recess between the rails, top and bottom, to save material.
  const recess = [
    box(s.u, -1, -1, W - 2 * s.u, D + 2, rail - o.wall + 1),
    box(s.u, -1, H - rail + o.wall, W - 2 * s.u, D + 2, rail),
  ];
  const pockets: Solid[] = [];
  const pd = s.bossL + 0.4;
  for (const i of [0, o.nx - 1])
    for (let j = 0; j < o.ny; j++) {
      pockets.push(box(cx(s, i) - h / 2, cx(s, j) - h / 2, -1, h, h, pd + 1));
      pockets.push(box(cx(s, i) - h / 2, cx(s, j) - h / 2, H - pd, h, h, pd + 1));
    }
  return outer.subtract(union([cavity, ...recess, ...pockets]));
}

export function drawer(s: System, o: DrawerOpts): Solid {
  const rail = s.plateT;
  const W = o.nx * s.u - 2 * o.wall - 2 * o.slide;
  const H = o.nz * s.u - 2 * rail - 2 * o.slide;
  const D = o.ny * s.u - 1.2 - o.slide;
  const w = 1.2;
  const body = box(0, 0, 0, W, D, H).subtract(box(w, w, w, W - 2 * w, D - 2 * w, H));
  const pull = cyl(w + 2, 12, 12, 48).rotate([-90, 0, 0]).translate([W / 2, -1, H]);
  return body.subtract(pull);
}

// ---------------------------------------------------------------- sprue rack

export interface SprueOpts {
  nx: number;
  slots: number;
  slotU: number; // slot pitch in units
  fin: number; // fin thickness
  minH: number;
  maxH: number;
  postW: number;
}

export const SPRUE: SprueOpts = { nx: 12, slots: 5, slotU: 2, fin: 2.4, minH: 24, maxH: 56, postW: 14 };

/** File-sorter style rack. Runners stand on edge between fins that step up towards the back. */
export function sprueRack(s: System, o: SprueOpts): Solid {
  const g = s.bodyGap / 2;
  const ny = o.slots * o.slotU;
  const W = o.nx * s.u - 2 * g;
  const D = ny * s.u - 2 * g;
  const parts: Solid[] = [box(g, g, 0, W, D, s.floorT), foot(s, { nx: o.nx, ny, grip: "corners", fill: "checker" })];
  const xs = [g, o.nx * s.u - g - o.postW];
  for (let k = 0; k <= o.slots; k++) {
    const y = g + (k * (D - o.fin)) / o.slots;
    const hgt = o.minH + ((o.maxH - o.minH) * k) / o.slots;
    for (const x of xs) {
      const fin = box(x, y, s.floorT - 0.01, o.postW, o.fin, hgt - s.floorT);
      parts.push(fin);
    }
    // Low full-width web ties the three posts of a fin together.
    parts.push(box(g, y, s.floorT - 0.01, W, o.fin, 8));
  }
  return union(parts);
}

// ---------------------------------------------------------------- wall shelf

export interface ShelfOpts {
  nx: number; // width in units (print height)
  ny: number; // deck depth in units
  nz: number; // back flange height in units
}

/**
 * Triangular shelf. Constant section along X, so it prints on its end with no supports.
 * Deck (top) and flange (back) are both F faces: modules snap on the deck, the flange is
 * pinned to a wall plate with dowels and long twist keys.
 */
export function wallShelf(s: System, o: ShelfOpts): Solid {
  const W = o.nx * s.u;
  const D = o.ny * s.u;
  const Hf = o.nz * s.u;
  const t = s.plateT;
  const h = cellHole(s);
  const deck = box(0, 0, -t, W, D, t);
  const flange = box(0, 0, -Hf, W, t, Hf);
  const strut = Manifold.hull([box(0, t - 0.1, -Hf, W, 0.1, 1.6), box(0, D - 1.6, -t - 0.1, W, 1.6, 0.1)]);
  const cuts: Solid[] = [];
  for (let i = 0; i < o.nx; i++) {
    for (let j = 1; j < o.ny; j++) cuts.push(box(cx(s, i) - h / 2, cx(s, j) - h / 2, -t - 0.01, h, h, t + 1));
    for (let k = 1; k < o.nz; k++) cuts.push(box(cx(s, i) - h / 2, -1, -cx(s, k) - h / 2, h, t + 1.01, h));
  }
  return union([deck, flange, strut]).subtract(union(cuts));
}
