// Fit and geometry checks. npx tsx src/check.ts
import { Manifold } from "./kernel.js";
import * as P from "./parts.js";
const s = P.SYS;
let fail = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  if (!cond) fail++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}: ${detail}`);
};
const plate = P.plate(s, { cols: 12, rows: 12 });

// A boss-only module must drop in with zero overlap; grip pegs must interfere a little.
const loose = P.bin(s, { nx: 4, ny: 6, nz: 2, grip: "none" }).translate([16, 16, 0]);
const snug = P.bin(s, { nx: 4, ny: 6, nz: 2, grip: "corners" }).translate([16, 16, 0]);
const vLoose = plate.intersect(loose).volume();
const vSnug = plate.intersect(snug).volume();
ok("boss clearance", vLoose < 1e-6, `overlap ${vLoose.toFixed(4)} mm3`);
ok("grip interference", vSnug > 0.5 && vSnug < 20, `overlap ${vSnug.toFixed(2)} mm3 over 4 pegs`);

// Twist key: passes a cell when square to it, does not touch the plate when turned 45 degrees,
// and its head corners sit under the walls after the turn.
const stack = s.floorT + s.plateT;
// Cap underside rests on the module floor top, so the head top sits 0.1 mm under the plate.
const key = P.twistKey(s, stack).translate([0, 0, s.floorT - (1.6 + stack + 0.1)]);
const cell: [number, number, number] = [20, 20, 0];
ok("key passes cell", plate.intersect(key.translate(cell)).volume() < 1e-6, "no overlap while inserting");
const turned = key.rotate([0, 0, 45]).translate(cell);
ok("key clear when turned", plate.intersect(turned).volume() < 1e-6, "no overlap after turn");
const lifted = plate.intersect(turned.translate([0, 0, 1])).volume();
ok("key retains", lifted > 1, `pulling 1 mm gives ${lifted.toFixed(2)} mm3 of overlap under the walls`);

// Squeeze tube: flats at bottle radius minus interference, circle at both ends.
const o = P.DROPPER;
const cellSolid = P.paintRack(s, o);
const slice = (z: number) => cellSolid.slice(z).toPolygons();
const radii = (z: number) => {
  // inner contour = the one with the smallest extent
  const polys = slice(z).map((poly) => poly.map(([x, y]) => Math.hypot(x - 16, y - 16)));
  const inner = polys.reduce((a, b) => (Math.max(...a) < Math.max(...b) ? a : b));
  return [Math.min(...inner), Math.max(...inner)];
};
const [gMin, gMax] = radii(s.floorT + 6.5);
const [tMin, tMax] = radii(o.heightU * s.u - 3);
ok("grip band flats", Math.abs(gMin - (o.bottleD / 2 - o.interference)) < 0.05, `min bore radius ${gMin.toFixed(3)} mm, corners ${gMax.toFixed(3)} mm`);
ok("round above grip", Math.abs(tMin - 13.75) < 0.05 && Math.abs(tMax - 13.75) < 0.05, `bore radius ${tMin.toFixed(3)} to ${tMax.toFixed(3)} mm`);

// Dowel joins shell to plate: pockets line up with cells.
const shell = P.drawerShell(s, P.DRAWER);
const dowel = P.dowel(s).rotate([-90, 0, 0]);
const dv = dowel.translate([4, 4, 0]);
ok("dowel in shell pocket", shell.intersect(dv).volume() < 12, `overlap ${shell.intersect(dv).volume().toFixed(2)} mm3 (bulge only)`);
ok("all solids valid", [plate, loose, snug, key, cellSolid, shell].every((m) => m.status() === "NoError" && m.volume() > 0), "status NoError");
process.exit(fail ? 1 : 0);
