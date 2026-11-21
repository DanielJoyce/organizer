"""
Fine-pitch peg grid (build123d).

Baseplate: an open lattice of thin walls on a square grid. Outer walls are
half thickness, so baseplates placed side by side form full-thickness walls
and the grid continues across the joint.

Bins: pegs on the underside in a checkerboard. Each peg is a rounded square
with a barrel bulge that is slightly larger than the cell opening. Because
the pattern is a checkerboard, every wall touching a peg has an empty cell on
its other side and can flex away from the peg, which gives the interference
fit some compliance. Peg corners are rounded so contact is on the wall faces,
not in the stiff wall intersections.

Peg profile, from the bin floor down:
    root  opening - 2*root_clearance
    bulge opening + 2*interference      (at bulge_z below the floor)
    neck  opening - 2*root_clearance
    tip   chamfered for lead-in
"""

from dataclasses import dataclass
from build123d import (
    Align, Box, Compound, Part, Pos, RectangleRounded, Rectangle, loft,
)


@dataclass
class GridParams:
    pitch: float = 8.0              # cell pitch
    wall_t: float = 1.2             # lattice wall thickness
    height: float = 4.0             # lattice height
    floor_t: float = 0.0            # optional solid floor under the lattice
    top_chamfer: float = 0.4        # lead-in on the cell openings

    # pegs
    peg_len: float = 3.4            # below the bin floor; < height so the bin seats on the lattice
    root_clearance: float = 0.1     # per side at root and neck
    interference: float = 0.15      # per side at the bulge
    bulge_z: float = 1.4            # bulge depth below the bin floor
    neck_z: float = 2.6
    tip_chamfer: float = 0.8
    corner_r: float = 1.0

    @property
    def opening(self) -> float:
        return self.pitch - self.wall_t

    def check(self):
        assert self.peg_len < self.height + self.floor_t, "peg would bottom out"
        assert self.bulge_z < self.neck_z <= self.peg_len - self.tip_chamfer + 1e-6
        assert self.corner_r < self.opening / 2 - 0.5


def baseplate(g: GridParams, cols: int, rows: int) -> Part:
    g.check()
    w, d = cols * g.pitch, rows * g.pitch
    h = g.floor_t + g.height
    plate = Box(w, d, h, align=(Align.MIN, Align.MIN, Align.MIN))

    o, c = g.opening, g.top_chamfer
    cutter = Pos(0, 0, g.floor_t) * Box(o, o, g.height + 1,
                                        align=(Align.CENTER, Align.CENTER, Align.MIN))
    if c > 0:
        cutter += loft([Pos(0, 0, h - c) * Rectangle(o, o),
                        Pos(0, 0, h + 0.01) * Rectangle(o + 2 * c + 0.02, o + 2 * c + 0.02)],
                       ruled=True)
    cutters = [Pos((i + 0.5) * g.pitch, (j + 0.5) * g.pitch, 0) * cutter
               for j in range(rows) for i in range(cols)]
    return plate - Compound(cutters)


def peg(g: GridParams) -> Part:
    """Single peg, top face at z=0, extending down to -peg_len."""
    o, r = g.opening, g.corner_r
    small = o - 2 * g.root_clearance
    big = o + 2 * g.interference
    tip = small - 2 * g.tip_chamfer
    sections = [
        (0.2, small),                                  # overlap into the bin floor
        (0.0, small),
        (-g.bulge_z, big),
        (-g.neck_z, small),
        (-(g.peg_len - g.tip_chamfer), small),
        (-g.peg_len, tip),
    ]
    dedup = []
    for z, s in sections:                      # drop zero-height segments
        if not dedup or abs(dedup[-1][0] - z) > 1e-6:
            dedup.append((z, s))
    faces = [Pos(0, 0, z) * RectangleRounded(s, s, min(r, s / 2 - 0.05))
             for z, s in dedup]
    # one ruled frustum per segment; a single multi-section ruled loft is
    # fragile in OCCT with rounded profiles
    out = None
    for a, b in zip(faces, faces[1:]):
        seg = loft([b, a], ruled=True)
        out = seg if out is None else out + seg
    return out.clean()


def peg_centers(g: GridParams, cols: int, rows: int, keep=None, parity: int = 0):
    """Checkerboard cell centers in a cols x rows footprint whose lower-left
    corner is at (0, 0). keep(x0, y0, x1, y1) -> bool filters cells."""
    out = []
    for j in range(rows):
        for i in range(cols):
            if (i + j) % 2 != parity:
                continue
            x0, y0 = i * g.pitch, j * g.pitch
            if keep is None or keep(x0, y0, x0 + g.pitch, y0 + g.pitch):
                out.append((x0 + g.pitch / 2, y0 + g.pitch / 2))
    return out


def add_pegs(part: Part, g: GridParams, cols: int, rows: int,
             origin=(0.0, 0.0), z: float = 0.0, keep=None) -> Part:
    """Fuse checkerboard pegs to the underside of a bin. origin is the
    lower-left corner of the bin footprint, z is the underside height."""
    g.check()
    pg = peg(g)
    ox, oy = origin
    pegs = [Pos(ox + x, oy + y, z) * pg for x, y in peg_centers(g, cols, rows, keep)]
    out = part
    for q in pegs:
        out = out + q
    return out.clean()


if __name__ == "__main__":
    # fit-test coupon: a 2x2-cell tab with 2 pegs and a 4x4 baseplate
    from pathlib import Path
    from build123d import export_stl
    out = Path(__file__).resolve().parent / "stl"
    out.mkdir(exist_ok=True)
    g = GridParams()
    tab = Box(2 * g.pitch, 2 * g.pitch, 2.0, align=(Align.MIN, Align.MIN, Align.MIN))
    tab = add_pegs(tab, g, 2, 2)
    export_stl(tab, str(out / "fit_test_tab_2x2.stl"), tolerance=0.01, angular_tolerance=0.1)
    export_stl(baseplate(g, 4, 4), str(out / "fit_test_baseplate_4x4.stl"),
               tolerance=0.01, angular_tolerance=0.1)
    print("tab valid", tab.is_valid, len(tab.solids()))

    # full baseplates: 8 x 8 cells (64 mm) and 26 x 26 cells (208 mm, the
    # smallest whole-cell plate over 8 in)
    for n in (8, 26):
        bp = baseplate(g, n, n)
        print(f"baseplate {n}x{n} valid", bp.is_valid, len(bp.solids()))
        export_stl(bp, str(out / f"grid_baseplate_{n}x{n}.stl"),
                   tolerance=0.01, angular_tolerance=0.1)
