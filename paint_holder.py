"""
Parametric mini paint bottle holder (build123d).

Each cell is a flat base plate (hex or square outline) with a single
continuous tube on top. Plates are sized to the grid pitch, so cells placed on
the grid touch edge to edge and fuse into one part. Tubes stay separate. Use
grid() / cluster() to build larger units.

Tube wall
---------
The wall is one unbroken shell with no slots. Its cross-section changes
smoothly with height:

    circle  ->  Lame curve (4 or 6 lobes)  ->  circle

The lobed section is a p-norm ball over m/2 directions spaced 180/(m/2)
degrees apart:

    N(theta) = (sum_k |cos(theta - phi_k)|^p)^(1/p),   r(theta) = R N(0) / N(theta)

For m = 4 (directions 0 and 90 degrees) this is exactly the Lame curve
|x|^p + |y|^p = R^p. For m = 6 (0, 60, 120 degrees) it is the six-fold
equivalent, tending to a hexagon as p grows. Because it is a norm ball the
section is always convex, and at p = 2 it is a circle for any m, so the
transition is a continuous change of (R, p). R is the flat (minimum) radius.

At each height R is set so the flats sit `interference` inside the bottle
radius, and p is solved so the section perimeter follows a smooth schedule
from the bore circle down to the bottle circumference plus `perimeter_slack`.
Because the squeeze section is never shorter around than the bottle, the
bottle pushes the flats out and pulls the lobes in by bending the wall, not
by stretching it. That keeps insertion force low with a thin wall.

The height schedule uses a cosine blend, so the inner surface meets the
bottle on a smooth ramp from above or below.

The plate has a hole smaller than the bore. The bottle sits base-down, or
cap-down with the cap through the hole and the shoulder on the plate. Set
ledge_d >= bore_d for a straight-through bore, or 0 for a solid floor.

Usage:
    python paint_holder.py            # writes STLs to ./stl
"""

from dataclasses import dataclass
from math import cos, sin, radians, pi
from pathlib import Path

import numpy as np
from build123d import (
    Align, Cone, Cylinder, Edge, Face, Part, Polygon, Pos, Vector, Wire,
    extrude, export_stl, loft,
)

CENTER_MIN = (Align.CENTER, Align.CENTER, Align.MIN)


@dataclass
class HolderParams:
    shape: str = "hex"              # plate outline: "hex" or "square"

    # Bottle (measure with calipers; defaults are estimates for an
    # Army Painter Warpaints Fanatic 18 ml dropper bottle)
    bottle_d: float = 26.0          # body diameter
    cap_d: float = 20.0             # widest diameter of cap

    # Grid and plate
    pitch: float = 32.0             # center-to-center spacing = plate flat-to-flat
    plate_t: float = 2.0
    ledge_d: float = 23.0           # plate hole; >= bore_d for none, 0 for solid floor
    ledge_chamfer: float = 0.6

    # Tube
    height: float = 20.0            # overall, plate bottom to tube top
    bore_clearance: float = 1.5     # bore diameter minus bottle diameter
    wall_t: float = 1.2
    top_chamfer: float = 1.0        # lead-in at top of bore
    base_fillet: float = 1.0        # 45 degree collar where tube meets plate

    # Squeeze section
    squeeze: bool = True
    lobes: int = 0                  # 4 or 6; 0 = 4 for square, 6 for hex
    lobe_rotation: float = -1       # deg, flat direction; -1 = face the neighbors
    interference: float = 0.5       # flats this far inside the bottle radius
    perimeter_slack: float = 0.3    # squeeze perimeter = 2 pi (r_bottle + slack)
    circle_below: float = 1.5       # plain circle above the plate
    ramp_in: float = 4.0            # circle -> lobed, lower ramp
    hold: float = 2.0               # full lobed section
    ramp_out: float = 4.0           # lobed -> circle, upper ramp
    section_step: float = 0.5       # loft section spacing in Z
    profile_points: int = 48        # points per section spline (multiple of lobes)

    # ---- derived ----
    @property
    def sides(self) -> int:
        return {"hex": 6, "square": 4}[self.shape]

    @property
    def m(self) -> int:
        return self.lobes or self.sides

    @property
    def rot(self) -> float:
        return radians(0.0 if self.lobe_rotation < 0 else self.lobe_rotation)

    @property
    def r_bottle(self) -> float:
        return self.bottle_d / 2

    @property
    def r_bore(self) -> float:
        return (self.bottle_d + self.bore_clearance) / 2

    @property
    def r_out(self) -> float:
        return self.r_bore + self.wall_t

    @property
    def z_a(self) -> float:
        return self.plate_t + self.circle_below

    @property
    def z_b(self) -> float:
        return self.z_a + self.ramp_in + self.hold + self.ramp_out

    def blend(self, z: float) -> float:
        """0 = circle, 1 = full lobed section."""
        z1, z2 = self.z_a + self.ramp_in, self.z_a + self.ramp_in + self.hold
        if z <= self.z_a or z >= self.z_b:
            return 0.0
        if z < z1:
            s = (z - self.z_a) / self.ramp_in
        elif z <= z2:
            return 1.0
        else:
            s = (self.z_b - z) / self.ramp_out
        return 0.5 - 0.5 * cos(pi * s)

    def plate_dirs(self):
        n = self.sides
        return [(cos(radians(i * 360 / n)), sin(radians(i * 360 / n))) for i in range(n)]

    def neighbor_offsets(self):
        s = self.pitch
        if self.shape == "square":
            return [(s * i, s * j) for i in (-1, 0, 1) for j in (-1, 0, 1) if i or j]
        return [(s * dx, s * dy) for dx, dy in self.plate_dirs()]

    def check(self):
        assert self.ledge_d == 0 or self.ledge_d > self.cap_d, "cap will not pass the plate hole"
        assert self.m in (4, 6), "lobes must be 4 or 6"
        assert self.circle_below >= self.base_fillet, "collar runs into the squeeze ramp"
        assert self.z_b <= self.height - self.top_chamfer - 0.5, "tube too short for squeeze section"
        assert self.r_bottle + self.perimeter_slack < self.r_bore
        if not self.squeeze:
            return
        inner = section_xy(self, 1.0)
        outer = offset_xy(inner, self.wall_t)
        # tube stays inside the plate footprint
        half = self.pitch / 2
        for dx, dy in self.plate_dirs():
            reach = (outer @ np.array([dx, dy])).max()
            assert reach <= half - 0.3, f"lobed wall reaches the plate edge ({reach:.2f} mm)"
        # gap to neighbor tubes
        for ox, oy in self.neighbor_offsets():
            d = np.sqrt(((outer[:, None, :] - (outer[None, :, :] + [ox, oy])) ** 2).sum(-1)).min()
            assert d >= 0.8, f"lobed wall within {d:.2f} mm of neighbor"
        # lobes must not touch the bottle when the flats are pushed out
        assert np.hypot(*inner.T).max() > self.r_bottle


# ---------------------------------------------------------------- profiles

def lame_r(theta, R, m, p):
    """Radius of the m-lobed Lame-type curve; flats (radius R) at theta = 0
    and every 360/m degrees."""
    k = m // 2
    phis = np.arange(k) * pi / k

    def norm(t):
        t = np.asarray(t, dtype=float)[..., None]
        return (np.abs(np.cos(t - phis)) ** p).sum(-1) ** (1.0 / p)

    return R * norm(0.0) / norm(theta)


def perimeter(R, m, p, n=720):
    th = np.linspace(0, 2 * pi, n, endpoint=False)
    r = lame_r(th, R, m, p)
    x, y = r * np.cos(th), r * np.sin(th)
    return np.hypot(np.diff(x, append=x[0]), np.diff(y, append=y[0])).sum()


def solve_p(R, m, target, p_max=40.0):
    if perimeter(R, m, 2.0) >= target:
        return 2.0
    lo, hi = 2.0, p_max
    assert perimeter(R, m, hi) >= target, "cannot reach target perimeter; reduce squeeze"
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        if perimeter(R, m, mid) < target:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def section_xy(p: HolderParams, t: float, n: int = 720) -> np.ndarray:
    """Inner profile at blend t, as an (n, 2) CCW point array."""
    R0, R1 = p.r_bore, p.r_bottle - p.interference
    P0, P1 = 2 * pi * p.r_bore, 2 * pi * (p.r_bottle + p.perimeter_slack)
    R = R0 + t * (R1 - R0)
    pp = solve_p(R, p.m, P0 + t * (P1 - P0))
    th = np.linspace(0, 2 * pi, n, endpoint=False) + p.rot
    r = lame_r(th - p.rot, R, p.m, pp)
    return np.column_stack([r * np.cos(th), r * np.sin(th)])


def offset_xy(pts: np.ndarray, d: float) -> np.ndarray:
    """Offset a closed CCW polyline outward along its normals."""
    tan = np.roll(pts, -1, axis=0) - np.roll(pts, 1, axis=0)
    tan /= np.linalg.norm(tan, axis=1)[:, None]
    nrm = np.column_stack([tan[:, 1], -tan[:, 0]])
    return pts + d * nrm


def section_pts(p: HolderParams, t: float, wall: float) -> np.ndarray:
    """Spline points for one section. The profile and its offset are computed
    on a dense polyline (for accurate normals), then subsampled at fixed
    angles so every section has the same point layout."""
    k = 8
    dense = section_xy(p, t, p.profile_points * k)
    if wall:
        dense = offset_xy(dense, wall)
    return dense[::k]


def section_face(pts: np.ndarray, z: float) -> Face:
    # Same parameter values for every section, so all section splines share
    # one knot vector. Letting OCC pick chord-length parameters gives each
    # section different knots, and the loft then has to merge them all into
    # a very dense surface (about 1000 x 40 poles at the old settings).
    params = list(np.linspace(0.0, 1.0, len(pts) + 1))
    edge = Edge.make_spline([Vector(x, y, z) for x, y in pts],
                            periodic=True, parameters=params)
    return Face(Wire([edge]))


def wall_loft(p: HolderParams, wall: float, z0: float, z1: float) -> Part:
    """One smooth loft over the whole tube height. Sections are evenly spaced;
    the cosine blend is C1, so the circular zones stay circular."""
    n = int(np.ceil((z1 - z0) / p.section_step)) + 1
    faces = [section_face(section_pts(p, p.blend(z) if p.squeeze else 0.0, wall), z)
             for z in np.linspace(z0, z1, n)]
    return loft(faces, ruled=False)


# ---------------------------------------------------------------- solids

def prism(pts, z0: float, h: float) -> Part:
    """Extrude a closed XY polygon from z0 to z0 + h regardless of winding."""
    solid = extrude(Polygon(*pts, align=None), amount=h)
    return Pos(0, 0, z0 - solid.bounding_box().min.Z) * solid


def plate(p: HolderParams, z0: float = 0.0, h: float = None) -> Part:
    n = p.sides
    r_v = (p.pitch / 2) / cos(pi / n)
    pts = [(r_v * cos(radians(i * 360 / n + 180 / n)),
            r_v * sin(radians(i * 360 / n + 180 / n))) for i in range(n)]
    return prism(pts, z0, p.plate_t if h is None else h)


def cell(p: HolderParams) -> Part:
    p.check()
    rb, ro = p.r_bore, p.r_out

    body = plate(p)
    body += wall_loft(p, p.wall_t, p.plate_t - 0.01, p.height)
    if p.base_fillet > 0:
        f = p.base_fillet
        collar = Pos(0, 0, p.plate_t - 0.01) * Cone(ro + f, ro - 0.3, f + 0.31, align=CENTER_MIN)
        body += collar & plate(p, p.plate_t - 0.5, f + 1)

    body -= wall_loft(p, 0.0, p.plate_t, p.height + 1)

    if p.ledge_d > 0:
        body -= Pos(0, 0, -1) * Cylinder(p.ledge_d / 2, p.plate_t + 2, align=CENTER_MIN)
    lc = min(p.ledge_chamfer, p.plate_t / 2)
    if lc > 0 and 0 < p.ledge_d < 2 * rb:
        r = p.ledge_d / 2
        body -= Pos(0, 0, -0.01) * Cone(r + lc + 0.01, r, lc + 0.01, align=CENTER_MIN)
        body -= Pos(0, 0, p.plate_t - lc) * Cone(r, r + lc + 0.01, lc + 0.01,
                                                 align=CENTER_MIN)

    if p.top_chamfer > 0:
        c = p.top_chamfer
        body -= Pos(0, 0, p.height - c - 0.3) * Cone(rb - 0.3, rb + c + 0.01, c + 0.31,
                                                     align=CENTER_MIN)
    return body


def fuse_cells(p: HolderParams, centers) -> Part:
    c = cell(p)
    parts = [Pos(x, y, 0) * c for x, y in centers]
    out = parts[0]
    for q in parts[1:]:
        out = out + q
    return out.clean()


def grid_centers(p: HolderParams, cols: int, rows: int):
    s = p.pitch
    if p.shape == "square":
        return [(i * s, j * s) for j in range(rows) for i in range(cols)]
    # hex with flats facing +/-X: rows offset by half a pitch (brick layout)
    dy = s * sin(radians(60))
    return [(i * s + (s / 2 if j % 2 else 0), j * dy)
            for j in range(rows) for i in range(cols)]


def grid(p: HolderParams, cols: int, rows: int) -> Part:
    return fuse_cells(p, grid_centers(p, cols, rows))


def cluster(p: HolderParams) -> Part:
    """Four cells fused: 2x2 for square, a compact rhombus for hex."""
    return grid(p, 2, 2)


def pegged_cell(p: HolderParams, g) -> Part:
    """Square cell with checkerboard pegs for the fine grid baseplate.
    Pegs are placed only under grid cells that are fully clear of the plate hole."""
    from fine_grid import add_pegs
    assert p.shape == "square", "hex footprints do not land on a square grid"
    n = round(p.pitch / g.pitch)
    assert abs(n * g.pitch - p.pitch) < 1e-6, "holder pitch must be a multiple of grid pitch"
    half = p.pitch / 2
    hole_r = p.ledge_d / 2 + 0.5 if p.ledge_d > 0 else 0

    def keep(x0, y0, x1, y1):
        dx = max(x0 - half, 0, half - x1)
        dy = max(y0 - half, 0, half - y1)
        return hole_r == 0 or (dx * dx + dy * dy) ** 0.5 >= hole_r

    return add_pegs(cell(p), g, n, n, origin=(-half, -half), z=0.0, keep=keep)


if __name__ == "__main__":
    out = Path(__file__).resolve().parent / "stl"
    out.mkdir(exist_ok=True)
    stl = dict(tolerance=0.01, angular_tolerance=0.1)
    for shape in ("hex", "square"):
        p = HolderParams(shape=shape)
        single = cell(p)
        four = cluster(p)
        print(shape, "single valid", single.is_valid, "solids", len(single.solids()),
              "| x4 valid", four.is_valid, "solids", len(four.solids()))
        export_stl(single, str(out / f"paint_holder_{shape}_single.stl"), **stl)
        export_stl(four, str(out / f"paint_holder_{shape}_x4.stl"), **stl)

    # fine grid system: pegged square holder (solid floor; a through hole
    # would land on the lattice anyway)
    from fine_grid import GridParams
    held = pegged_cell(HolderParams(shape="square", ledge_d=0), GridParams())
    print("pegged valid", held.is_valid, "solids", len(held.solids()))
    export_stl(held, str(out / "paint_holder_square_pegged.stl"), **stl)
