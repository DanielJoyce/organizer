"""Detail renders: twist key, seam joiner, wall plate. Usage: python tools/render_details.py stl/proto-u16 docs/img/u16"""
import sys
import pyvista as pv

src, dst = sys.argv[1], sys.argv[2]
pv.OFF_SCREEN = True
GREY, GREEN, YEL, BLUE = "#8a9099", "#5b8c5a", "#f2b134", "#3f6f8f"
def mesh(path):
    return pv.read(path).clean()
def shade(m):
    return m.compute_normals(feature_angle=30, split_vertices=True)
def add(p, m, c, **kw):
    p.add_mesh(shade(m), color=c, smooth_shading=True, specular=0.15, ambient=0.25, diffuse=0.8, **kw)

d = f"{src}/key_demo"
plate, binm = mesh(f"{d}/plate.stl"), mesh(f"{d}/bin.stl")
k_in, k_lock = mesh(f"{d}/key_inserted.stl"), mesh(f"{d}/key_locked.stl")
key = mesh(f"{src}/twist_key_short.stl")

p = pv.Plotter(off_screen=True, window_size=(2400, 1700), shape=(2, 2)); p.set_background("white")
# 1 key alone
p.subplot(0, 0); add(p, key, YEL); p.add_text("1. Twist key as printed, head down", font_size=14, color="black")
p.camera_position = [(60, -54, 48), (0, 0, 8), (0, 0, 1)]
# 2 from above: bin on plate, one key square (inserted), one turned
p.subplot(0, 1)
add(p, plate, GREY); add(p, binm, GREEN, opacity=1.0); add(p, k_in, YEL); add(p, k_lock, YEL)
p.add_text("2. From above: left key just inserted, right key turned 45 degrees", font_size=14, color="black")
p.camera_position = [(56, -90, 120), (56, 40, 2), (0, 0, 1)]
# 3 from below
p.subplot(1, 0)
add(p, plate, GREY); add(p, binm, GREEN); add(p, k_in, YEL); add(p, k_lock, YEL)
p.add_text("3. From below: turned key with corners under the walls (left), key as inserted (right)", font_size=14, color="black")
p.camera_position = [(56, -70, -120), (56, 40, -3), (0, 0, -1)]
# 4 section through the locked key
p.subplot(1, 1)
cy = k_lock.center[1]
cut = dict(normal=(0, 1, 0), origin=(0, cy, 0))
for m, c in [(plate, GREY), (binm, GREEN), (k_lock, YEL)]:
    add(p, m.clip_closed_surface(**cut), c)
p.add_text("4. Section through the locked key: cap on the bin floor, head under the lattice walls", font_size=14, color="black")
kx = k_lock.center[0]
p.camera_position = [(kx, cy - 90, 14), (kx, cy, 3), (0, 0, 1)]; p.camera.zoom(1.6)
p.screenshot(f"{dst}/twist_key.png")

# seam joiner, seen from below
s = f"{src}/seam_demo"
p = pv.Plotter(off_screen=True, window_size=(1600, 1000)); p.set_background("white")
add(p, mesh(f"{s}/plate_left.stl"), GREY); add(p, mesh(f"{s}/plate_right.stl"), BLUE)
for i in range(2): add(p, mesh(f"{s}/joiner_{i}.stl"), YEL)
p.camera_position = [(150, -110, -150), (64, 32, -4), (0, 0, -1)]
p.screenshot(f"{dst}/seam.png")

# full-bed wall plate, back side up (print orientation)
p = pv.Plotter(off_screen=True, window_size=(1600, 1100)); p.set_background("white")
add(p, mesh(f"{src}/plate_wall_bed250_9screws.stl"), GREY)
p.camera_position = [(420, -260, 330), (120, 120, 0), (0, 0, 1)]
p.screenshot(f"{dst}/wall_plate.png")
