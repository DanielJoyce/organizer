"""Section through a seated grip peg. Usage: python tools/section.py stl/proto-u16 docs/img/u16/snap_section.png"""
import sys
import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

src, out = sys.argv[1], sys.argv[2]
fig, ax = plt.subplots(figsize=(11, 4.6), dpi=160)
for name, col in [("plate", "#8a9099"), ("tab", "#5b8c5a")]:
    m = trimesh.load(f"{src}/snap_demo/{name}.stl")
    sec = m.section(plane_origin=[0, 8, 0], plane_normal=[0, 1, 0])
    for ent in sec.discrete:
        ax.fill(ent[:, 0], ent[:, 2], color=col, ec="black", lw=0.6, fill=True)
# Hollow regions are drawn by even-odd overlap, so redraw with a path for correct holes.
ax.cla()
from matplotlib.path import Path
from matplotlib.patches import PathPatch
import numpy as np
for name, col in [("plate", "#8a9099"), ("tab", "#5b8c5a")]:
    m = trimesh.load(f"{src}/snap_demo/{name}.stl")
    sec = m.section(plane_origin=[0, 8, 0], plane_normal=[0, 1, 0])
    verts, codes = [], []
    for ent in sec.discrete:
        pts = ent[:, [0, 2]]
        verts += list(pts)
        codes += [Path.MOVETO] + [Path.LINETO] * (len(pts) - 2) + [Path.CLOSEPOLY]
    ax.add_patch(PathPatch(Path(np.array(verts), codes), fc=col, ec="black", lw=0.7))
ax.set_xlim(-2, 20); ax.set_ylim(-6, 4); ax.set_aspect("equal"); ax.axis("off")
ann = dict(fontsize=10, arrowprops=dict(arrowstyle="-", lw=0.8))
ax.annotate("lip: mouth 14.4 mm", xy=(0.9, -0.6), xytext=(-1.8, 2.6), **ann)
ax.annotate("bulge 14.7 mm, sits under the lip", xy=(0.75, -1.6), xytext=(3.2, 3.2), **ann)
ax.annotate("cell 14.8 mm below the lip", xy=(15.3, -3.4), xytext=(11.5, -5.6), **ann)
ax.annotate("1.2 mm flexing wall of the peg", xy=(1.4, -2.6), xytext=(2.6, -5.6), **ann)
fig.savefig(out, bbox_inches="tight", facecolor="white")
