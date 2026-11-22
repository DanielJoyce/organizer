// Builds every prototype part at a given lattice pitch, prints a report, writes STLs.
//   npx tsx src/build.ts [pitch=16] [outDir=../stl/proto-u<pitch>]
import { report, writeStl, Solid } from "./kernel.js";
import * as P from "./parts.js";

const U = Number(process.argv[2] ?? 16);
const out = process.argv[3] ?? `../stl/proto-u${U}`;
const s = P.makeSystem(U);
const t0 = performance.now();
/** Millimetres to lattice units. Sizes below are given in mm so both pitches build the same set. */
const n = (mm: number) => {
  const k = mm / U;
  if (!Number.isInteger(k)) throw new Error(`${mm} mm is not a whole number of ${U} mm units`);
  return k;
};
const drawerOpts: P.DrawerOpts = { nx: n(96), nz: n(48), ny: n(128), wall: 1.6, slide: 0.4 };
const sprueOpts: P.SprueOpts = { ...P.SPRUE, nx: n(96), slotU: n(16) };
const P12 = n(96);
const BED = Number(process.argv[4] ?? 250);
const full = P.maxCells(s, BED);
const inset = 1;
const edge = P12 - 2;

const parts: Record<string, Solid> = {
  plate_desk_96: P.plate(s, { cols: P12, rows: P12 }),
  plate_wall_96: P.plate(s, { cols: P12, rows: P12, screws: [[inset, inset], [edge, inset], [inset, edge], [edge, edge]] }),
  [`plate_desk_bed${BED}`]: P.plate(s, { cols: full, rows: full }),
  [`plate_wall_bed${BED}_9screws`]: P.plate(s, { cols: full, rows: full, screws: P.screwGrid(full, full, 3, 3) }),
  [`plate_wall_bed${BED}_4screws`]: P.plate(s, { cols: full, rows: full, screws: P.screwGrid(full, full, 2, 2) }),
  bin_32x48x32: P.bin(s, { nx: n(32), ny: n(48), nz: 32 / U }),
  bin_48x48x16_lock: P.bin(s, { nx: n(48), ny: n(48), nz: 16 / U, lock: U === 8 ? [[1, 1], [4, 4]] : [[1, 1]] }),
  paint_cell_hex6: P.paintRack(s, P.DROPPER),
  paint_cell_lame4: P.paintRack(s, { ...P.DROPPER, lobes: 4 }),
  paint_rack_3x2_lock: P.paintRack(s, { ...P.DROPPER, cols: 3, rows: 2, lockStrip: true }),
  twist_key_short: P.twistKey(s, s.floorT + s.plateT),
  // Undersize key for bracketing the fit: 0.4 mm smaller head and neck.
  twist_key_short_loose: P.twistKey(s, s.floorT + s.plateT, s.keyHead - 0.4),
  twist_key_long: P.twistKey(s, 2 * s.plateT),
  dowel: P.dowel(s),
  seam_joiner: P.seamJoiner(s),
  drawer_shell_96x48x128: P.drawerShell(s, drawerOpts),
  drawer_96x48x128: P.drawer(s, drawerOpts),
  sprue_rack_96x80: P.sprueRack(s, sprueOpts),
  wall_shelf_96x64x48: P.wallShelf(s, { nx: n(96), ny: n(64), nz: n(48) }),
  // Three screw posts give the standoff a key head needs and leave a 48 mm square of open cells.
  fit_test_plate_64: P.plate(s, { cols: n(64), rows: n(64), screws: [[0, 0], [0, n(64) - 1], [n(64) - 1, n(64) - 1]] }),
  fit_test_lock_tab_48: P.tab(s, { nx: n(48), ny: n(48), grip: "none", lock: [[(n(48) - 1) / 2 | 0, (n(48) - 1) / 2 | 0]] }),
  fit_test_tab_32: P.bin(s, { nx: n(32), ny: n(32), nz: 8 / U, grip: U === 8 ? "checker" : "corners" }),
};

// Rotation that puts each part on the bed the way it should be printed.
const printAs: Record<string, [number, number, number]> = {
  plate_desk_96: [180, 0, 0],
  plate_wall_96: [180, 0, 0],
  fit_test_plate_64: [180, 0, 0],
  [`plate_desk_bed${BED}`]: [180, 0, 0],
  [`plate_wall_bed${BED}_9screws`]: [180, 0, 0],
  [`plate_wall_bed${BED}_4screws`]: [180, 0, 0],
  drawer_shell_96x48x128: [-90, 0, 0],
  wall_shelf_96x64x48: [0, -90, 0],
};
const rows: Record<string, unknown> = {};
for (const [name, solid] of Object.entries(parts)) {
  const oriented = printAs[name] ? solid.rotate(printAs[name]) : solid;
  const bb = oriented.boundingBox();
  const onBed = oriented.translate([-bb.min[0], -bb.min[1], -bb.min[2]]);
  rows[name] = report(onBed);
  writeStl(`${out}/${name}.stl`, onBed);
}
console.table(rows);

// Desk assembly used for the preview render: parts in their installed positions (mm).
const at = (p: Solid, x: number, y: number, z = 0) => p.translate([n(x) * U, n(y) * U, z]);
const d = drawerOpts;
const big = P.plate(s, { cols: n(208), rows: n(208) });
const key = P.twistKey(s, s.floorT + s.plateT).rotate([0, 0, 45]);
const keyZ = s.floorT - (1.6 + s.floorT + s.plateT + 0.1);
const lockY = 64 + U / 2;
const asm: Record<string, Solid> = {
  plate: big,
  drawer_shell: at(parts.drawer_shell_96x48x128, 0, 0),
  drawer: parts.drawer_96x48x128.translate([d.wall + d.slide, -44, s.plateT + d.slide]),
  drawer_shell_2: at(parts.drawer_shell_96x48x128, 0, 0, 48),
  drawer_2: parts.drawer_96x48x128.translate([d.wall + d.slide, 0, 48 + s.plateT + d.slide]),
  paint_rack: at(parts.paint_rack_3x2_lock, 112, 0),
  key_1: key.translate([112 + (U === 8 ? 12 : 24), lockY, keyZ]),
  key_2: key.translate([112 + 96 - (U === 8 ? 12 : 24), lockY, keyZ]),
  bin_a: at(parts.bin_32x48x32, 112, 80),
  bin_c: at(parts.bin_48x48x16_lock, 144, 80),
  sprue_rack: at(parts.sprue_rack_96x80, 112, 128),
};
for (const [name, solid] of Object.entries(asm)) writeStl(`${out}/assembly/${name}.stl`, solid);

// Twist key demo: a bin with two key cells on a small plate, one key inserted, one turned.
const kc = (i: number) => (i + 0.5) * U;
const dn = { nx: n(80), ny: n(48) };
const lockCells: [number, number][] = [[n(16), n(16)], [dn.nx - 1 - n(16), n(16)]];
const rawKey = P.twistKey(s, s.floorT + s.plateT);
const off = n(16) * U;
const demo: Record<string, Solid> = {
  plate: P.plate(s, { cols: dn.nx + 2 * n(16), rows: dn.ny + 2 * n(16) }),
  bin: P.bin(s, { ...dn, nz: 16 / U, lock: lockCells, grip: "none" }).translate([off, off, 0]),
  key_inserted: rawKey.translate([off + kc(lockCells[0][0]), off + kc(lockCells[0][1]), keyZ]),
  key_locked: key.translate([off + kc(lockCells[1][0]), off + kc(lockCells[1][1]), keyZ]),
};
for (const [name, solid] of Object.entries(demo)) writeStl(`${out}/key_demo/${name}.stl`, solid);

// Seam demo: two plates edge to edge with joiners under the seam.
const sj = P.seamJoiner(s).translate([0, 0, -s.plateT]);
const left = P.plate(s, { cols: 4, rows: 4, screws: P.screwGrid(4, 4, 2, 2) });
const right = left.translate([4 * U, 0, 0]);
const joiners = [0, 3].map((j) => sj.translate([4 * U, kc(j), 0]));
const seamOverlap = joiners.reduce((a, q) => a + q.intersect(left).volume() + q.intersect(right).volume(), 0);
writeStl(`${out}/seam_demo/plate_left.stl`, left);
writeStl(`${out}/seam_demo/plate_right.stl`, right);
joiners.forEach((q, i) => writeStl(`${out}/seam_demo/joiner_${i}.stl`, q));
console.log(`largest plate on a ${BED} mm bed: ${full} x ${full} cells = ${full * U} mm; seam joiner overlap ${seamOverlap.toFixed(2)} mm3 for 2 joiners`);
console.log(`plate 208 mm: ${((big.volume() / 1000) * 1.27).toFixed(1)} g solid PETG, ${n(208) ** 2} cells`);
console.log(`pitch ${U} mm: built ${Object.keys(parts).length} parts in ${((performance.now() - t0) / 1000).toFixed(2)} s, peak RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
