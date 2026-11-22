// Fit and geometry checks. npx tsx src/check.ts [pitch=16]
import { Manifold } from "./kernel.js";
import * as P from "./parts.js";
const U = Number(process.argv[2] ?? 16);
const s = P.makeSystem(U);
let fail = 0;
const ok = (name: string, cond: boolean, detail: string) => {
  if (!cond) fail++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}: ${detail}`);
};
const plate = P.plate(s, { cols: 96 / U, rows: 96 / U });

// A boss-only module must drop in with zero overlap; grip pegs must interfere a little.
const loose = P.bin(s, { nx: 32 / U, ny: 48 / U, nz: 1, grip: "none" }).translate([16, 16, 0]);
const snug = P.bin(s, { nx: 32 / U, ny: 48 / U, nz: 1, grip: "corners" }).translate([16, 16, 0]);
const vLoose = plate.intersect(loose).volume();
const vSnug = plate.intersect(snug).volume();
ok("boss clearance", vLoose < 1e-6, `overlap ${vLoose.toFixed(4)} mm3`);
ok("grip peg seats free", vSnug < 1e-6, `overlap ${vSnug.toFixed(4)} mm3 when seated`);
const vLift = plate.intersect(snug.translate([0, 0, 0.6])).volume();
ok("grip peg held by lip", vLift > 0.2, `lifting 0.6 mm gives ${vLift.toFixed(2)} mm3 of overlap with the lip over 4 pegs`);

// Twist key: passes a cell when square to it, does not touch the plate when turned 45 degrees,
// and its head corners sit under the walls after the turn.
const stack = s.floorT + s.plateT;
// Cap underside rests on the module floor top, so the head top sits 0.1 mm under the plate.
const key = P.twistKey(s, stack).translate([0, 0, s.floorT - (1.6 + stack + 0.1)]);
const cell: [number, number, number] = [1.5 * U, 1.5 * U, 0];
ok("key passes cell", plate.intersect(key.translate(cell)).volume() < 1e-6, "no overlap while inserting");
const turned = key.rotate([0, 0, 45]).translate(cell);
ok("key clear when turned", plate.intersect(turned).volume() < 1e-6, "no overlap after turn");
const lifted = plate.intersect(turned.translate([0, 0, 1])).volume();
ok("key retains", lifted > 1, `pulling 1 mm gives ${lifted.toFixed(2)} mm3 of overlap under the walls`);

// Lock test tab on the fit test plate: tab drops in, key passes both parts and holds the tab down.
{
  const fp = P.plate(s, { cols: 64 / U, rows: 64 / U });
  const m = Math.floor((48 / U - 1) / 2);
  const t = P.tab(s, { nx: 48 / U, ny: 48 / U, grip: "none", lock: [[m, m]] });
  const kAt: [number, number, number] = [(m + 0.5) * U, (m + 0.5) * U, 0];
  const kIn = key.translate(kAt);
  const kTurn = key.rotate([0, 0, 45]).translate(kAt);
  ok("lock tab drops in", fp.intersect(t).volume() < 1e-6, "no overlap with plate");
  ok("key passes tab and plate", fp.intersect(kIn).volume() + t.intersect(kIn).volume() < 1e-6, "no overlap while inserting");
  ok("key turns freely", fp.intersect(kTurn).volume() + t.intersect(kTurn).volume() < 1e-6, "no overlap after turn");
  const up = t.translate([0, 0, 1]).intersect(kTurn).volume();
  ok("cap holds tab", up > 1, `lifting the tab 1 mm gives ${up.toFixed(2)} mm3 of overlap with the cap`);
}

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
const [tMin, tMax] = radii(o.heightMm - 3);
ok("grip band flats", Math.abs(gMin - (o.bottleD / 2 - o.interference)) < 0.05, `min bore radius ${gMin.toFixed(3)} mm, corners ${gMax.toFixed(3)} mm`);
ok("round above grip", Math.abs(tMin - 13.75) < 0.05 && Math.abs(tMax - 13.75) < 0.05, `bore radius ${tMin.toFixed(3)} to ${tMax.toFixed(3)} mm`);

// Dowel joins shell to plate: pockets line up with cells.
const shell = P.drawerShell(s, { nx: 96 / U, nz: 48 / U, ny: 128 / U, wall: 1.6, slide: 0.4 });
const dowel = P.dowel(s).rotate([-90, 0, 0]);
const dv = dowel.translate([U / 2, U / 2, 0]);
ok("dowel in shell pocket", shell.intersect(dv).volume() < 1e-6, `overlap ${shell.intersect(dv).volume().toFixed(2)} mm3 when seated`);
ok("all solids valid", [plate, loose, snug, key, cellSolid, shell].every((m) => m.status() === "NoError" && m.volume() > 0), "status NoError");
process.exit(fail ? 1 : 0);
