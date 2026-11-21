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
const inset = 1;
const edge = P12 - 2;

const parts: Record<string, Solid> = {
  plate_desk_96: P.plate(s, { cols: P12, rows: P12 }),
  plate_wall_96: P.plate(s, { cols: P12, rows: P12, screws: [[inset, inset], [edge, inset], [inset, edge], [edge, edge]] }),
  bin_32x48x32: P.bin(s, { nx: n(32), ny: n(48), nz: 32 / U }),
  bin_32x32x16_lock: P.bin(s, { nx: n(32), ny: n(32), nz: 16 / U, lock: U === 8 ? [[1, 1], [2, 2]] : [[0, 0], [1, 1]], grip: U === 8 ? "corners" : "none" }),
  paint_cell_hex6: P.paintRack(s, P.DROPPER),
  paint_cell_lame4: P.paintRack(s, { ...P.DROPPER, lobes: 4 }),
  paint_rack_3x2_lock: P.paintRack(s, { ...P.DROPPER, cols: 3, rows: 2, lockStrip: true }),
  twist_key_short: P.twistKey(s, s.floorT + s.plateT),
  twist_key_long: P.twistKey(s, 2 * s.plateT),
  dowel: P.dowel(s),
  seam_joiner: P.seamJoiner(s),
  drawer_shell_96x48x128: P.drawerShell(s, drawerOpts),
  drawer_96x48x128: P.drawer(s, drawerOpts),
  sprue_rack_96x80: P.sprueRack(s, sprueOpts),
  wall_shelf_96x64x48: P.wallShelf(s, { nx: n(96), ny: n(64), nz: n(48) }),
  fit_test_plate_48: P.plate(s, { cols: n(48), rows: n(48) }),
  fit_test_tab_32: P.bin(s, { nx: n(32), ny: n(32), nz: 8 / U, grip: U === 8 ? "checker" : "corners" }),
};

// Rotation that puts each part on the bed the way it should be printed.
const printAs: Record<string, [number, number, number]> = {
  plate_desk_96: [180, 0, 0],
  plate_wall_96: [180, 0, 0],
  fit_test_plate_48: [180, 0, 0],
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
  bin_c: at(parts.bin_32x32x16_lock, 144, 80),
  paint_single: at(parts.paint_cell_lame4, 176, 80),
  sprue_rack: at(parts.sprue_rack_96x80, 112, 128),
};
for (const [name, solid] of Object.entries(asm)) writeStl(`${out}/assembly/${name}.stl`, solid);
console.log(`plate 208 mm: ${((big.volume() / 1000) * 1.27).toFixed(1)} g solid PETG, ${n(208) ** 2} cells`);
console.log(`pitch ${U} mm: built ${Object.keys(parts).length} parts in ${((performance.now() - t0) / 1000).toFixed(2)} s, peak RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
