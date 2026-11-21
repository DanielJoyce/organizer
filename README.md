# organizer

Parametric holders for miniature paint dropper bottles, plus a fine-pitch peg
grid baseplate. Built with [build123d](https://github.com/gumyr/build123d).

Defaults are estimates for Army Painter Warpaints Fanatic 18 ml bottles
(26 mm body, 20 mm cap). Measure your bottles and set `bottle_d` and `cap_d`
before printing.

## Files

| File | Contents |
|---|---|
| `paint_holder.py` | Holder cells (hex or square), fused grids of cells, pegged cell for the baseplate |
| `fine_grid.py` | Lattice baseplate, peg geometry, fit-test coupon |

## Holder cell

Each cell is a flat base plate with a single round tube on top. Plates are
sized to the grid pitch (32 mm), so cells placed on the grid touch edge to
edge and fuse into one part. Tubes stay separate.

The plate has a 23 mm hole. A bottle sits base-down, or cap-down with the cap
through the hole and the shoulder on the plate. Set `ledge_d >= bore_d` for a
straight-through bore, or `ledge_d=0` for a solid floor.

The tube wall is one continuous loft with no slots. Its cross-section goes
from a circle to a 4- or 6-lobed Lame curve and back to a circle:

    N(theta) = (sum_k |cos(theta - phi_k)|^p)^(1/p)
    r(theta) = R * N(0) / N(theta)

With directions at 0 and 90 degrees this is the Lame curve
|x|^p + |y|^p = R^p. With directions at 0, 60 and 120 degrees it is the
six-fold equivalent. At p = 2 both are circles. At each height, R puts the
flats `interference` inside the bottle radius and p is solved so the section
perimeter stays slightly longer than the bottle circumference. The bottle
then pushes the flats out by bending the wall rather than stretching it.

Default heights (20 mm overall):

| Section | Z (mm) |
|---|---|
| Plate | 0 to 2 |
| Circle | 2 to 3.5 |
| Ramp in | 3.5 to 7.5 |
| Full squeeze | 7.5 to 9.5 |
| Ramp out | 9.5 to 13.5 |
| Circle | 13.5 to 20 |

Parameters to tune after a test print: `interference`, `perimeter_slack`,
`wall_t`.

## Fine grid

The baseplate is an open lattice on an 8 mm pitch with 1.2 mm walls, 4 mm
tall. Outer walls are half thickness, so plates placed side by side form full
walls and the grid continues across the joint.

Bins carry pegs on the underside in a checkerboard. Each peg is a rounded
square with a barrel bulge 0.15 mm per side larger than the cell opening.
Every wall a peg touches has an empty cell behind it and can flex away from
the peg. `add_pegs()` adds the pattern to any part.

The holder pitch must be a whole multiple of the grid pitch (32 = 4 x 8).
Hex cells do not land on a square grid, so only the square holder has a
pegged version. Print `fit_test_tab_2x2.stl` and `fit_test_baseplate_4x4.stl`
first and adjust `interference` or `bulge_z` in `GridParams` to suit your
printer.

## Usage

    pip install -r requirements.txt
    python fine_grid.py       # fit-test coupon, 8x8 and 26x26 baseplates
    python paint_holder.py    # holder cells, 4-up clusters, pegged cell

Both scripts write to `stl/`. In code:

```python
from paint_holder import HolderParams, cell, grid, pegged_cell
from fine_grid import GridParams, baseplate

p = HolderParams(shape="square", bottle_d=25.6)
block = grid(p, 3, 2)                 # 3 x 2 fused cells
plate = baseplate(GridParams(), 12, 12)
```

`HolderParams.check()` asserts minimum walls and clearances whenever a cell
is built.

## Generated files

STL and STEP files are not checked in. The scripts write these to `stl/`:

| File | Description |
|---|---|
| `paint_holder_hex_single.stl` | One hex cell |
| `paint_holder_hex_x4.stl` | Four hex cells fused |
| `paint_holder_square_single.stl` | One square cell |
| `paint_holder_square_x4.stl` | 2 x 2 square cells fused |
| `paint_holder_square_pegged.stl` | Square cell with pegs, solid floor |
| `grid_baseplate_8x8.stl` | 64 x 64 mm baseplate |
| `grid_baseplate_26x26.stl` | 208 x 208 mm baseplate |
| `fit_test_tab_2x2.stl` | Two-peg tab for fit testing |
| `fit_test_baseplate_4x4.stl` | Small baseplate for fit testing |
