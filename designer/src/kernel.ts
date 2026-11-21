// Thin layer over manifold-3d: init, a few primitives, direct mesh lofting, STL export.
import Module from "manifold-3d";
import type { Manifold as ManifoldT } from "manifold-3d";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const wasm = await Module();
wasm.setup();
export const { Manifold, CrossSection, Mesh } = wasm;
export type Solid = ManifoldT;

export const union = (parts: Solid[]): Solid =>
  parts.length === 0 ? Manifold.cube(0) : parts.length === 1 ? parts[0] : Manifold.union(parts);

/** Axis-aligned box from min corner and size. */
export const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number): Solid =>
  Manifold.cube([sx, sy, sz]).translate([x, y, z]);

/** Square frustum centred on the Z axis, width w0 at z0 and w1 at z1. */
export function sqFrustum(w0: number, w1: number, z0: number, z1: number): Solid {
  const s = w1 / w0;
  return CrossSection.square([w0, w0], true).extrude(z1 - z0, 0, 0, [s, s]).translate([0, 0, z0]);
}

/** Stack of square frustums from a list of [z, width] stations. */
export function sqStack(stations: [number, number][]): Solid {
  const parts: Solid[] = [];
  for (let i = 0; i + 1 < stations.length; i++) {
    const [z0, w0] = stations[i];
    const [z1, w1] = stations[i + 1];
    if (z1 - z0 > 1e-9) parts.push(sqFrustum(w0, w1, z0, z1));
  }
  return union(parts);
}

export const cyl = (h: number, r0: number, r1 = r0, seg = 48): Solid => Manifold.cylinder(h, r0, r1, seg);

/**
 * Closed solid through a stack of rings. Every ring has the same point count, runs
 * counter-clockwise seen from +Z, and is star-shaped about the origin. The surface is
 * written straight to triangles, so there is no spline fitting and no kernel loft.
 */
export function loft(rings: [number, number][][], zs: number[]): Solid {
  const n = rings[0].length;
  const k = rings.length;
  const verts = new Float32Array((n * k + 2) * 3);
  rings.forEach((ring, j) =>
    ring.forEach(([x, y], i) => verts.set([x, y, zs[j]], (j * n + i) * 3)),
  );
  const bot = n * k;
  const top = n * k + 1;
  verts.set([0, 0, zs[0]], bot * 3);
  verts.set([0, 0, zs[k - 1]], top * 3);
  const tris: number[] = [];
  for (let j = 0; j + 1 < k; j++)
    for (let i = 0; i < n; i++) {
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      const c = a + n;
      const d = b + n;
      tris.push(a, b, d, a, d, c);
    }
  for (let i = 0; i < n; i++) {
    const i1 = (i + 1) % n;
    tris.push(bot, i1, i);
    tris.push(top, (k - 1) * n + i, (k - 1) * n + i1);
  }
  const mesh = new Mesh({ numProp: 3, vertProperties: verts, triVerts: new Uint32Array(tris) });
  mesh.merge();
  return Manifold.ofMesh(mesh);
}

export function writeStl(path: string, solid: Solid): void {
  const m = solid.getMesh();
  const nt = m.triVerts.length / 3;
  const buf = Buffer.alloc(84 + nt * 50);
  buf.writeUInt32LE(nt, 80);
  const v = (i: number) => {
    const o = m.triVerts[i] * m.numProp;
    return [m.vertProperties[o], m.vertProperties[o + 1], m.vertProperties[o + 2]];
  };
  for (let t = 0; t < nt; t++) {
    const [a, b, c] = [v(3 * t), v(3 * t + 1), v(3 * t + 2)];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * w[2] - u[2] * w[1];
    const ny = u[2] * w[0] - u[0] * w[2];
    const nz = u[0] * w[1] - u[1] * w[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    let o = 84 + t * 50;
    for (const f of [nx / l, ny / l, nz / l, ...a, ...b, ...c]) {
      buf.writeFloatLE(f, o);
      o += 4;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buf);
}

/** Facts used by the build report and the print checks. */
export function report(solid: Solid) {
  const bb = solid.boundingBox();
  const m = solid.getMesh();
  const nt = m.triVerts.length / 3;
  // Area of faces that point more than 45 degrees downward and are not on the bed.
  let overhang = 0;
  const zMin = bb.min[2];
  for (let t = 0; t < nt; t++) {
    const p = [0, 1, 2].map((q) => {
      const o = m.triVerts[3 * t + q] * m.numProp;
      return [m.vertProperties[o], m.vertProperties[o + 1], m.vertProperties[o + 2]];
    });
    const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const a2 = Math.hypot(n[0], n[1], n[2]);
    if (a2 === 0) continue;
    const onBed = Math.max(p[0][2], p[1][2], p[2][2]) - zMin < 1e-4;
    if (!onBed && n[2] / a2 < -0.7072) overhang += a2 / 2;
  }
  return {
    size: [0, 1, 2].map((i) => +(bb.max[i] - bb.min[i]).toFixed(2)),
    volume_cm3: +(solid.volume() / 1000).toFixed(2),
    petg_g: +((solid.volume() / 1000) * 1.27).toFixed(1),
    tris: nt,
    genus: solid.genus(),
    overhang_mm2: +overhang.toFixed(1),
  };
}
