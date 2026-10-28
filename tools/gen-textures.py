#!/usr/bin/env python3
"""Generates the seamless map and UI textures in src/assets/textures/.

Original procedural artwork (no third-party images), so the game stays MIT-clean.
Each texture is SIZE x SIZE and tiles seamlessly: every noise octave wraps around.
Re-run after tweaking a palette:  python3 tools/gen-textures.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

SIZE = 256
OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "textures"
rng = np.random.default_rng(20261029)


def periodic_noise(cells, size=SIZE):
    """Smooth value noise on a torus: wraps at the edges, so it tiles seamlessly."""
    grid = rng.random((cells, cells))
    coords = np.arange(size) * cells / size
    i0 = np.floor(coords).astype(int)
    f = coords - i0
    f = f * f * (3 - 2 * f)                      # smoothstep
    i1 = (i0 + 1) % cells
    i0 %= cells
    row0 = grid[i0][:, :]
    row1 = grid[i1][:, :]
    top = row0[:, i0] * (1 - f)[None, :] + row0[:, i1] * f[None, :]
    bot = row1[:, i0] * (1 - f)[None, :] + row1[:, i1] * f[None, :]
    return top * (1 - f)[:, None] + bot * f[:, None]


def fbm(base_cells, octaves=4, persistence=0.5):
    total = np.zeros((SIZE, SIZE))
    amp, norm = 1.0, 0.0
    cells = base_cells
    for _ in range(octaves):
        total += amp * periodic_noise(cells)
        norm += amp
        amp *= persistence
        cells *= 2
    return total / norm


def speckle(density, strength):
    """Sparse random dots (pebbles, leaf flecks), also seamless."""
    m = rng.random((SIZE, SIZE))
    return np.where(m < density, strength * rng.random((SIZE, SIZE)), 0.0)


def hex2rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float)


def colorize(n, lo, hi):
    """Map a 0..1 field onto a colour ramp from lo to hi (hex strings)."""
    n = np.clip((n - n.min()) / (n.max() - n.min() + 1e-9), 0, 1)[..., None]
    return hex2rgb(lo) * (1 - n) + hex2rgb(hi) * n


def save(name, rgb):
    img = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(img, 'RGB').save(OUT / f"{name}.png", optimize=True)
    print(f"  {name}.png")


def grass():
    n = fbm(8, 4)
    blades = fbm(64, 2)                          # fine blade-scale variation
    base = colorize(n, '#4f8a3a', '#8cc463')
    base = base * (0.9 + 0.2 * blades[..., None])
    base[..., 1] += 10 * speckle(0.06, 1.0)     # sun-bleached flecks
    base[..., 0] += 20 * speckle(0.03, 1.0)
    save('grass', base)


def soil():
    n = fbm(6, 4)
    furrow = np.sin((np.arange(SIZE)[:, None] + 18 * n) * (2 * np.pi * 8 / SIZE))
    rgb = colorize(n, '#6b4a2b', '#a77a4d') * (0.96 + 0.04 * furrow[..., None])
    rgb += 14 * speckle(0.05, 1.0)[..., None] * np.array([1, 0.9, 0.7])
    save('soil', rgb)


def paving():
    # 4x4 flagstones with mortar joints, each stone gets its own tint
    cell = SIZE // 4
    img = np.zeros((SIZE, SIZE, 3))
    n = fbm(12, 3)
    tint_by_cell = {}
    for gy in range(4):
        for gx in range(4):
            tint_by_cell[(gx, gy)] = rng.uniform(-10, 10)
    for y in range(SIZE):
        for x in range(0, SIZE):
            gx, gy = x // cell, y // cell
            t = tint_by_cell[(gx, gy)]
            col = hex2rgb('#e4d8bd') + t
            img[y, x] = col
    img *= (0.94 + 0.08 * n)[..., None]
    lx, ly = np.arange(SIZE) % cell, np.arange(SIZE) % cell
    joint = (lx[None, :] < 3) | (ly[:, None] < 3)
    img[joint] = hex2rgb('#a99c80')
    img *= (0.97 + 0.03 * speckle(0.4, 1.0))[..., None]
    save('paving', img)


def concrete():
    n = fbm(10, 4)
    rgb = colorize(n, '#a3a7ab', '#c9cccf')
    rgb -= 18 * speckle(0.035, 1.0)[..., None]
    rgb += 10 * speckle(0.02, 1.0)[..., None]
    save('concrete', rgb)


def asphalt():
    n = fbm(20, 3)
    rgb = colorize(n, '#2e3742', '#48535f')
    rgb += 16 * speckle(0.05, 1.0)[..., None]
    save('asphalt', rgb)


def earth():
    # cliff strata, used for island side walls
    n = fbm(4, 3)
    strata = np.sin((np.arange(SIZE)[:, None] + 22 * n) * (2 * np.pi * 6 / SIZE))
    rgb = colorize(n, '#c9a878', '#e3c79c') * (0.9 + 0.1 * strata[..., None])
    rgb -= 12 * speckle(0.04, 1.0)[..., None]
    save('earth', rgb)


def water():
    n = fbm(6, 3)
    ripple = np.sin((np.arange(SIZE)[None, :] * 2 * np.pi * 4 / SIZE) + 12 * n) * 0.5 + 0.5
    rgb = colorize(n, '#1d6f86', '#3aa3b5') * (0.95 + 0.05 * ripple[..., None])
    rgb += 60 * speckle(0.012, 1.0)[..., None] * np.array([1, 1, 1])   # sun glints
    save('water', rgb)


def paper():
    # UI paper grain, subtle, drawn at low opacity over the page
    n = fbm(32, 2)
    rgb = np.repeat(((n - 0.5) * 14 + 128)[..., None], 3, axis=2)
    rgb += (speckle(0.02, 40) - 20)[..., None]
    save('paper-grain', rgb)


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for fn in (grass, soil, paving, concrete, asphalt, earth, water, paper):
        fn()
    print('done ->', OUT)
