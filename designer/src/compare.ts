// Plain desk plates at 8 mm and 16 mm pitch, same outer size, for slicer time comparisons.
//   npx tsx src/compare.ts [outDir=../stl/compare] [sizes=64,240]
import { report, writeStl } from "./kernel.js";
import * as P from "./parts.js";
const out = process.argv[2] ?? "../stl/compare";
const sizes = (process.argv[3] ?? "64,240").split(",").map(Number);
const rows: Record<string, unknown> = {};
for (const mm of sizes)
  for (const u of [8, 16]) {
    const s = P.makeSystem(u);
    const p = P.plate(s, { cols: mm / u, rows: mm / u }).rotate([180, 0, 0]).translate([0, mm, 0]);
    const name = `plate_${mm}mm_pitch${u}`;
    rows[name] = { cells: (mm / u) ** 2, ...report(p) };
    writeStl(`${out}/${name}.stl`, p);
  }
console.table(rows);
