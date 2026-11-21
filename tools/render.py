"""Preview renders of the prototype STLs. Usage: python tools/render.py stl/proto docs/img"""
import sys, glob, os
import pyvista as pv

src, dst = sys.argv[1], sys.argv[2]
pv.OFF_SCREEN = True
COL = {"plate": "#8a9099", "drawer_shell": "#3f6f8f", "drawer": "#e8e2d0", "paint": "#c8553d",
       "key": "#f2b134", "bin": "#5b8c5a", "sprue": "#7d5ba6", "wall": "#8a9099", "twist": "#f2b134",
       "dowel": "#f2b134", "seam": "#f2b134", "fit": "#8a9099"}
def color(name):
    for k, v in COL.items():
        if name.startswith(k): return v
    return "#999999"
def mesh(path):
    return pv.read(path).clean().compute_normals(feature_angle=30, split_vertices=True)
def plotter(size):
    p = pv.Plotter(off_screen=True, window_size=size)
    p.set_background("white"); p.enable_anti_aliasing("ssaa")
    p.enable_lightkit()
    return p
def add(p, m, c):
    p.add_mesh(m, color=c, smooth_shading=True, specular=0.15, ambient=0.25, diffuse=0.8)

# 1. desk assembly
p = plotter((1600, 1200))
for f in sorted(glob.glob(f"{src}/assembly/*.stl")):
    add(p, mesh(f), color(os.path.basename(f)))
p.camera_position = [(420, -330, 330), (100, 85, 25), (0, 0, 1)]
p.camera.zoom(1.0)
p.screenshot(f"{dst}/assembly.png")

# 2. underside of the interface: bin foot, plate, key
p = plotter((1600, 1000))
b = mesh(f"{src}/bin_32x32x16_lock.stl").rotate_x(180).translate((0, 32, 20))
add(p, b, COL["bin"])
pl = mesh(f"{src}/fit_test_plate_48.stl").translate((40, -8, 0)); add(p, pl, COL["plate"])
k = mesh(f"{src}/twist_key_short.stl").translate((100, 4, 0)); add(p, k, COL["key"])
d = mesh(f"{src}/dowel.stl").translate((128, 0, 0)); add(p, d, COL["key"])
j = mesh(f"{src}/seam_joiner.stl").translate((122, 26, 0)); add(p, j, COL["key"])
p.camera_position = [(190, -170, 150), (70, 14, 6), (0, 0, 1)]
p.camera.zoom(1.25)
p.screenshot(f"{dst}/interface.png")

# 3. contact sheet, parts in print orientation
names = ["plate_wall_96", "paint_rack_3x2_lock", "paint_cell_hex6", "paint_cell_lame4", "bin_32x48x32",
         "drawer_shell_96x48x128", "drawer_96x48x128", "sprue_rack_96x80", "wall_shelf_96x64x48"]
p = pv.Plotter(off_screen=True, window_size=(1800, 1800), shape=(3, 3)); p.set_background("white")
for i, n in enumerate(names):
    p.subplot(i // 3, i % 3)
    add(p, mesh(f"{src}/{n}.stl"), color(n))
    p.add_text(n, font_size=11, color="black")
    p.view_isometric(); p.camera.azimuth = -20; p.camera.zoom(1.1)
p.screenshot(f"{dst}/parts.png")
