// Builds every prototype part, prints a report, writes STLs.
//   npx tsx src/build.ts [outDir]
import { report, writeStl, Solid } from "./kernel.js";
import * as P from "./parts.js";

const out = process.argv[2] ?? "stl";
const s = P.SYS;
const U = s.u;
const t0 = performance.now();

const parts: Record<string, Solid> = {
  "plate_desk_12x12": P.plate(s, { cols: 12, rows: 12 }),
  "plate_wall_12x12": P.plate(s, { cols: 12, rows: 12, screws: [[1, 1], [10, 1], [1, 10], [10, 10]] }),
  "bin_4x6x4": P.bin(s, { nx: 4, ny: 6, nz: 4 }),
  "bin_4x4x2_lock": P.bin(s, { nx: 4, ny: 4, nz: 2, lock: [[1, 1], [2, 2]] }),
  "paint_cell_hex6": P.paintRack(s, P.DROPPER),
  "paint_cell_lame4": P.paintRack(s, { ...P.DROPPER, lobes: 4 }),
  "paint_rack_3x2_lock": P.paintRack(s, { ...P.DROPPER, cols: 3, rows: 2, lockStrip: true }),
  "twist_key_short": P.twistKey(s, s.floorT + s.plateT),
  "twist_key_long": P.twistKey(s, 2 * s.plateT),
  "dowel": P.dowel(s),
  "seam_joiner": P.seamJoiner(s),
  "drawer_shell_12x6x15": P.drawerShell(s, P.DRAWER),
  "drawer_12x6x15": P.drawer(s, P.DRAWER),
  "sprue_rack_12x10": P.sprueRack(s, P.SPRUE),
  "wall_shelf_12x8x6": P.wallShelf(s, { nx: 12, ny: 8, nz: 6 }),
  "fit_test_plate_4x4": P.plate(s, { cols: 4, rows: 4 }),
  "fit_test_tab_2x2": P.bin(s, { nx: 2, ny: 2, nz: 1, grip: "checker" }),
};

// Rotation that puts each part on the bed the way it should be printed.
const printAs: Record<string, [number, number, number]> = {
  plate_desk_12x12: [180, 0, 0],
  plate_wall_12x12: [180, 0, 0],
  fit_test_plate_4x4: [180, 0, 0],
  drawer_shell_12x6x15: [-90, 0, 0],
  wall_shelf_12x8x6: [0, -90, 0],
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

// Desk assembly used for the preview render: parts in their installed positions.
const at = (p: Solid, i: number, j: number, z = 0) => p.translate([i * U, j * U, z]);
const d = P.DRAWER;
const asm: Record<string, Solid> = {
  plate: P.plate(s, { cols: 26, rows: 26 }),
  drawer_shell: at(parts["drawer_shell_12x6x15"], 0, 0),
  drawer: parts["drawer_12x6x15"].translate([d.wall + d.slide, -44, s.plateT + d.slide]),
  drawer_shell_2: at(parts["drawer_shell_12x6x15"], 0, 0, d.nz * U),
  drawer_2: parts["drawer_12x6x15"].translate([d.wall + d.slide, 0, d.nz * U + s.plateT + d.slide]),
  paint_rack: at(parts["paint_rack_3x2_lock"], 13, 0),
  key_1: P.twistKey(s, s.floorT + s.plateT).rotate([0, 0, 45]).translate([13 * U + 12, 8.5 * U, -s.plateT - 1.6]),
  key_2: P.twistKey(s, s.floorT + s.plateT).rotate([0, 0, 45]).translate([13 * U + 84, 8.5 * U, -s.plateT - 1.6]),
  bin_a: at(parts["bin_4x6x4"], 13, 10),
  bin_c: at(parts["bin_4x4x2_lock"], 17, 10),
  paint_single: at(parts["paint_cell_lame4"], 21, 10),
  sprue_rack: at(parts["sprue_rack_12x10"], 13, 16),
};
for (const [name, solid] of Object.entries(asm)) writeStl(`${out}/assembly/${name}.stl`, solid);
console.log(`built ${Object.keys(parts).length} parts in ${((performance.now() - t0) / 1000).toFixed(2)} s, peak RSS ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB`);
