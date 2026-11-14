#!/usr/bin/env python3
"""
build_spacecraft_kit.py  --  regenerates the whole Lunar Mapper 6U CubeSat kit.

    pip install trimesh numpy scipy shapely mapbox-earcut manifold3d pillow
    python3 build_spacecraft_kit.py [out_dir]          (default: ./spacecraft_kit)

CONVENTIONS
  * 1 unit = 1 metre. Y up. +Z = instrument/front end, -Z = engine end.
  * 6U envelope (deployer volume) centred on the origin:
        X 0.2263  x  Y 0.100  x  Z 0.366     ->  |x|<=0.11315 |y|<=0.05 |z|<=0.183
  * Each part's origin is its natural mounting point (listed as "origin" in parts.json).
  * Empty nodes named mount_* mark attachment points.
  * Deployables are exported DEPLOYED. A hinge node carries extras {"stowed":[x,y,z]}:
    the node's LOCAL Euler rotation (XYZ order, radians) in the stowed pose. The
    exported rotation of that node is the deployed rotation.
  * Animation hooks: spin_* pivots spin about their local +Y; material names
    led_glow, ion_glow, laser_emitter, iodine are reserved for the game to animate.
  * No cyan/teal anywhere (reserved for ice in the game UI).

The script is organised as:
  1. palette + procedural textures
  2. geometry primitives (rounded boxes, lathes, tubes, fasteners, connectors, PCBs)
  3. node hierarchy + minimal glTF 2.0 GLB writer (no external files, no Draco)
  4. part builders (tier 1 spacecraft, tier 2 launch, tier 3 clean room)
  5. assembly_6u.json + parts.json
"""
import io, json, math, os, struct, sys
import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFilter
from shapely.geometry import Polygon, Point, box as sbox
from shapely import affinity
from shapely.ops import unary_union

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "spacecraft_kit")
MM = 0.001
TAU = 2 * math.pi
ENVELOPE = (0.2263, 0.100, 0.366)

# =====================================================================================
# 1. PALETTE + TEXTURES
# =====================================================================================
# Subsystem accents (small anodised rings, wire sleeves, caps). Deliberately no cyan/teal.
ACCENT = {
    "structure": (0.55, 0.56, 0.60),
    "avionics": (0.30, 0.65, 0.25),   # green
    "power": (0.85, 0.20, 0.15),      # red
    "attitude": (0.95, 0.55, 0.10),   # orange
    "propulsion": (0.95, 0.80, 0.15), # yellow
    "payload": (0.55, 0.30, 0.85),    # violet
    "comms": (0.20, 0.35, 0.85),      # blue
    "thermal": (0.90, 0.65, 0.20),    # gold
}

def M(color, metal=0.0, rough=0.5, **kw):
    d = dict(color=color, metal=metal, rough=rough)
    d.update(kw)
    return d

MATS = {
    # metals
    "al_brushed":     M((0.91, 0.91, 0.92), 1.0, 0.32, mr_tex="brushed", uv=0.06),
    "al_bead":        M((0.80, 0.80, 0.81), 1.0, 0.55),
    "al_alodine":     M((0.86, 0.79, 0.55), 1.0, 0.42, mr_tex="brushed", uv=0.08),
    "al_hard_anod":   M((0.30, 0.31, 0.33), 0.6, 0.45),
    "al_black_anod":  M((0.035, 0.035, 0.04), 0.5, 0.42),
    "al_blue_anod":   M((0.10, 0.18, 0.55), 0.7, 0.35),
    "al_red_anod":    M((0.60, 0.06, 0.05), 0.7, 0.35),
    "al_violet_anod": M((0.35, 0.15, 0.55), 0.7, 0.35),
    "al_orange_anod": M((0.85, 0.35, 0.05), 0.7, 0.35),
    "al_gold_anod":   M((0.85, 0.62, 0.22), 0.8, 0.35),
    "stainless":      M((0.78, 0.78, 0.79), 1.0, 0.22),
    "fastener":       M((0.74, 0.74, 0.75), 1.0, 0.28),                     # screws/washers: no texture, no UVs
    "steel_black":    M((0.06, 0.06, 0.065), 0.9, 0.38),     # black-oxide cap screws
    "titanium":       M((0.62, 0.60, 0.57), 1.0, 0.38),
    "gold":           M((1.00, 0.77, 0.33), 1.0, 0.18),
    "copper":         M((0.95, 0.60, 0.45), 1.0, 0.30),
    "copper_braid":   M((0.85, 0.52, 0.35), 1.0, 0.55),
    "nickel":         M((0.75, 0.73, 0.68), 1.0, 0.30),
    "brass":          M((0.88, 0.72, 0.40), 1.0, 0.30),
    "moly_nozzle":    M((0.45, 0.44, 0.45), 1.0, 0.45),
    "inconel_heat":   M((0.42, 0.33, 0.30), 1.0, 0.50),     # heat-tinted thruster
    "chrome":         M((0.95, 0.95, 0.96), 1.0, 0.08),
    # electronics
    "pcb":            M((1, 1, 1), 0.0, 1.0, tex="pcb", mr_tex="pcb_mr", uv=0.10),
    "pcb_edge":       M((0.75, 0.70, 0.45), 0.0, 0.6),      # FR4 core seen on board edges
    "ic_black":       M((0.03, 0.03, 0.035), 0.0, 0.45),
    "ceramic":        M((0.80, 0.76, 0.66), 0.0, 0.50),
    "ceramic_white":  M((0.93, 0.92, 0.90), 0.0, 0.40),
    "smd_tan":        M((0.55, 0.42, 0.25), 0.0, 0.55),
    "plastic_black":  M((0.025, 0.025, 0.028), 0.0, 0.55),
    "plastic_white":  M((0.86, 0.86, 0.84), 0.0, 0.50),
    "plastic_gray":   M((0.28, 0.29, 0.31), 0.0, 0.60),
    "rubber":         M((0.05, 0.05, 0.05), 0.0, 0.90),
    "cell_wrap_blue": M((0.10, 0.20, 0.60), 0.0, 0.30),     # battery cell shrink wrap
    "wire_white":     M((0.88, 0.87, 0.84), 0.0, 0.55),     # PTFE wire
    "wire_red":       M((0.75, 0.08, 0.06), 0.0, 0.45),
    "wire_black":     M((0.04, 0.04, 0.04), 0.0, 0.45),
    "wire_yellow":    M((0.90, 0.75, 0.10), 0.0, 0.45),
    "sleeve_white":   M((0.90, 0.90, 0.88), 0.0, 0.75),     # braided harness sleeve
    "coax_blue":      M((0.12, 0.20, 0.55), 0.0, 0.40),
    "kapton":         M((0.80, 0.40, 0.05), 0.0, 0.25),     # Kapton tape/film
    "heater":         M((1, 1, 1), 0.0, 0.35, tex="heater", uv=0.06),
    "ferrite":        M((0.18, 0.18, 0.19), 0.2, 0.75),
    # optics
    "glass":          M((0.10, 0.08, 0.14), 0.0, 0.04),     # AR-coated glass (purple sheen)
    "glass_dark":     M((0.02, 0.02, 0.03), 0.0, 0.03),
    "detector":       M((0.20, 0.12, 0.25), 0.4, 0.15),
    "baffle_black":   M((0.012, 0.012, 0.014), 0.0, 0.95),  # Aeroglaze-style flat black
    # thermal / power
    "mli_gold":       M((0.98, 0.70, 0.28), 1.0, 0.22, normal_tex="foil", uv=0.08),
    "mli_silver":     M((0.86, 0.86, 0.88), 1.0, 0.20, normal_tex="foil", uv=0.08),
    "white_paint":    M((0.90, 0.90, 0.88), 0.0, 0.55),
    "black_paint":    M((0.03, 0.03, 0.035), 0.0, 0.80),
    "solar":          M((1, 1, 1), 0.25, 0.12, tex="solar", uv=0.08),
    "substrate_black": M((0.04, 0.04, 0.045), 0.0, 0.60),   # CFRP/kapton panel back
    "cfrp":           M((0.06, 0.06, 0.065), 0.3, 0.40, normal_tex="weave", uv=0.03),
    "velcro_black":   M((0.03, 0.03, 0.03), 0.0, 0.95),
    # propulsion
    "tank_ti":        M((0.66, 0.64, 0.61), 1.0, 0.30, mr_tex="brushed", uv=0.05),
    "copv_wrap":      M((0.12, 0.12, 0.13), 0.3, 0.45, normal_tex="weave", uv=0.02),
    "iodine":         M((0.16, 0.08, 0.20), 0.7, 0.28),
    # glow hooks (names are contracts with the game)
    "led_glow":       M((0.10, 0.90, 0.20), 0.0, 0.40, emissive=(0.20, 1.00, 0.30)),
    "led_red":        M((0.90, 0.10, 0.05), 0.0, 0.40, emissive=(1.0, 0.15, 0.05)),
    "ion_glow":       M((0.60, 0.45, 1.00), 0.0, 0.30, emissive=(0.65, 0.45, 1.00)),
    "laser_emitter":  M((0.90, 0.10, 0.10), 0.0, 0.10, emissive=(1.0, 0.12, 0.08)),
    "screen":         M((1, 1, 1), 0.0, 0.15, tex="screen", emissive_tex=True, uv=1.0),
    # clean room
    "esd_mat":        M((0.16, 0.22, 0.42), 0.0, 0.85),
    "esd_gray":       M((0.42, 0.44, 0.47), 0.0, 0.85),
    "steel_paint_gray": M((0.55, 0.57, 0.60), 0.2, 0.55),
    "steel_paint_white": M((0.88, 0.88, 0.86), 0.2, 0.45),
    "safety_yellow":  M((0.95, 0.75, 0.05), 0.2, 0.45),
    "case_black":     M((0.05, 0.05, 0.055), 0.0, 0.70),
    "case_gray":      M((0.30, 0.32, 0.33), 0.0, 0.70),
    "foam_gray":      M((0.22, 0.22, 0.23), 0.0, 0.98),
    "fabric_red":     M((0.78, 0.04, 0.04), 0.0, 0.92),
    "sling_orange":   M((0.95, 0.45, 0.05), 0.0, 0.90),
    "sling_purple":   M((0.40, 0.15, 0.55), 0.0, 0.90),
    "acoustic_foam":  M((0.85, 0.85, 0.83), 0.0, 0.95),
    "fairing_white":  M((0.93, 0.93, 0.92), 0.1, 0.45),
    "cover_red":      M((0.80, 0.06, 0.05), 0.0, 0.45),     # flight protective cover (non-flight)
    "plastic_clear":  M((0.80, 0.82, 0.85), 0.0, 0.05, alpha=0.35),
    "accent_avionics":   M(ACCENT["avionics"], 0.6, 0.35),
    "accent_power":      M(ACCENT["power"], 0.6, 0.35),
    "accent_attitude":   M(ACCENT["attitude"], 0.6, 0.35),
    "accent_propulsion": M(ACCENT["propulsion"], 0.6, 0.35),
    "accent_payload":    M(ACCENT["payload"], 0.6, 0.35),
    "accent_comms":      M(ACCENT["comms"], 0.6, 0.35),
    "accent_thermal":    M(ACCENT["thermal"], 0.8, 0.30),
}

_TEX_CACHE = {}

def _noise(n, scale, seed):
    rng = np.random.default_rng(seed)
    a = rng.random((n // scale + 2, n // scale + 2))
    img = Image.fromarray((a * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)
    return np.asarray(img).astype(np.float32) / 255.0

def tex_pcb():
    """Green FR4 solder mask, copper traces under mask, gold ENIG pads, vias, silkscreen boxes (no text).
    Returns (basecolor, metallicRoughness) images drawn from the same layout."""
    n = 512
    rng = np.random.default_rng(7)
    base = Image.new("RGB", (n, n), (22, 86, 44))
    mr = Image.new("RGB", (n, n), (0, int(0.38 * 255), 0))
    db, dm = ImageDraw.Draw(base), ImageDraw.Draw(mr)
    # ground pour hatch slightly lighter
    for i in range(0, n, 6):
        db.line([(i, 0), (i, n)], fill=(24, 90, 46))
    # traces (copper under solder mask reads as a lighter green)
    for _ in range(140):
        x, y = rng.integers(0, n, 2)
        pts = [(int(x), int(y))]
        for _ in range(rng.integers(2, 6)):
            L = int(rng.integers(15, 90))
            d = rng.integers(0, 8)
            dx, dy = [(1, 0), (0, 1), (-1, 0), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)][d]
            x, y = x + dx * L, y + dy * L
            pts.append((int(x), int(y)))
        w = int(rng.choice([1, 2, 2, 3, 5]))
        db.line(pts, fill=(44, 128, 62), width=w)
    # component footprints: pad rows (gold) + silkscreen outline (white)
    for _ in range(36):
        cx, cy = rng.integers(20, n - 20, 2)
        w, h = rng.integers(10, 46, 2)
        db.rectangle([cx - w // 2 - 3, cy - h // 2 - 3, cx + w // 2 + 3, cy + h // 2 + 3], outline=(225, 228, 220), width=1)
        k = int(rng.integers(2, 9))
        for i in range(k):
            px = cx - w // 2 + int(i * w / max(k - 1, 1))
            for py in (cy - h // 2 - 2, cy + h // 2 + 2):
                db.rectangle([px - 1, py - 2, px + 1, py + 2], fill=(214, 172, 82))
                dm.rectangle([px - 1, py - 2, px + 1, py + 2], fill=(0, 70, 255))
    # vias
    for _ in range(260):
        x, y = rng.integers(2, n - 2, 2)
        db.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(200, 160, 80))
        db.point((int(x), int(y)), fill=(10, 20, 10))
        dm.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(0, 80, 255))
    # fiducials
    for (x, y) in [(14, 14), (n - 14, n - 14), (n - 14, 14)]:
        db.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(215, 175, 90))
        dm.ellipse([x - 5, y - 5, x + 5, y + 5], fill=(0, 50, 255))
    return base, mr

def tex_solar():
    """Space-grade triple-junction cells: dark blue/violet, silver fingers + busbar,
    clipped corners showing the black substrate. One tile = 2x2 cells."""
    n = 512
    img = Image.new("RGB", (n, n), (12, 12, 14))
    d = ImageDraw.Draw(img)
    g = 8
    cw = n // 2
    rng = np.random.default_rng(3)
    for i in range(2):
        for j in range(2):
            x0, y0 = i * cw + g // 2, j * cw + g // 2
            x1, y1 = x0 + cw - g, y0 + cw - g
            c = 26
            poly = [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]
            tone = rng.integers(-4, 5)
            d.polygon(poly, fill=(34 + tone, 32 + tone, 78 + tone))
            for y in range(y0 + 6, y1 - 4, 7):
                d.line([(x0 + 3, y), (x1 - 3, y)], fill=(70, 70, 105), width=1)
            d.rectangle([x0 + 2, y0 + 6, x0 + 9, y1 - 6], fill=(200, 200, 205))  # busbar
            d.rectangle([x1 - 30, y1 - 22, x1 - 8, y1 - 10], fill=(185, 185, 190))  # bypass diode tab
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    return img

def tex_brushed_mr():
    """metallicRoughness map for brushed metal: fine streaks along U (G = roughness, B = metal)."""
    n = 128
    rng = np.random.default_rng(11)
    streak = np.repeat(rng.random((n, 1)), n, axis=1)
    fine = rng.random((n, n)) * 0.5 + np.repeat(rng.random((n, 1)), n, axis=1) * 0.5
    r = 0.26 + 0.10 * streak + 0.04 * fine
    rgb = np.zeros((n, n, 3), np.uint8)
    rgb[..., 1] = np.clip(r * 255, 0, 255)
    rgb[..., 2] = 255
    return Image.fromarray(rgb)


def _normal_from_height(h, strength):
    gy, gx = np.gradient(h)
    nx, ny, nz = -gx * strength, -gy * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([(nx / l + 1) / 2, (ny / l + 1) / 2, (nz / l + 1) / 2], -1)
    return Image.fromarray((rgb * 255).astype(np.uint8))

def tex_foil():
    n = 256
    h = 0.6 * _noise(n, 32, 1) + 0.3 * _noise(n, 12, 2) + 0.15 * _noise(n, 5, 3)
    h = np.abs(h - 0.5)  # creases
    return _normal_from_height(h, 18.0)

def tex_weave():
    n = 256
    x = np.arange(n)
    X, Y = np.meshgrid(x, x)
    t = 32
    u = (X % t) / t
    v = (Y % t) / t
    a = ((X // t + Y // t) % 2) == 0
    h = np.where(a, np.sin(u * np.pi), np.sin(v * np.pi)) * 0.5
    return _normal_from_height(h.astype(np.float32), 6.0)

def tex_heater():
    n = 256
    img = Image.new("RGB", (n, n), (176, 88, 18))
    d = ImageDraw.Draw(img)
    for i, x in enumerate(range(16, n - 16, 14)):
        d.line([(x, 16), (x, n - 16)], fill=(205, 125, 70), width=5)
        y = n - 16 if i % 2 == 0 else 16
        d.line([(x, y), (x + 14, y)], fill=(205, 125, 70), width=5)
    return img.filter(ImageFilter.GaussianBlur(0.8))

def tex_screen():
    """Generic test-software screen: panels, plots, bars. No text."""
    w, h = 512, 320
    img = Image.new("RGB", (w, h), (18, 20, 26))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 14], fill=(40, 44, 56))
    rng = np.random.default_rng(5)
    panels = [(8, 22, 300, 170), (308, 22, 504, 170), (8, 178, 250, 312), (258, 178, 504, 312)]
    cols = [(255, 140, 40), (120, 220, 90), (240, 240, 240), (200, 120, 255)]
    for k, (x0, y0, x1, y1) in enumerate(panels):
        d.rectangle([x0, y0, x1, y1], fill=(26, 29, 38), outline=(55, 60, 75))
        for gx in range(x0, x1, 24):
            d.line([(gx, y0), (gx, y1)], fill=(34, 38, 48))
        if k in (0, 3):
            for c in cols[:3]:
                ys = np.cumsum(rng.normal(0, 3, x1 - x0)) + (y0 + y1) / 2
                ys = np.clip(ys, y0 + 4, y1 - 4)
                d.line([(x0 + i, int(ys[i])) for i in range(0, x1 - x0, 2)], fill=c, width=2)
        elif k == 1:
            for i in range(10):
                bh = rng.integers(10, y1 - y0 - 10)
                d.rectangle([x0 + 10 + i * 19, y1 - bh, x0 + 24 + i * 19, y1 - 4], fill=cols[i % 4])
        else:
            for i in range(8):
                y = y0 + 10 + i * 15
                d.rectangle([x0 + 8, y, x0 + 18, y + 8], fill=(80, 220, 90) if i != 5 else (240, 70, 50))
                d.rectangle([x0 + 26, y + 2, x0 + 26 + rng.integers(40, 200), y + 6], fill=(70, 75, 90))
    return img

def texture_bytes(name):
    if name in _TEX_CACHE:
        return _TEX_CACHE[name]
    if name in ("pcb", "pcb_mr"):
        b, m = tex_pcb()
        _TEX_CACHE["pcb"] = _enc(b, "jpeg", 74)
        _TEX_CACHE["pcb_mr"] = _enc(m, "png")
    elif name == "solar":
        _TEX_CACHE[name] = _enc(tex_solar(), "jpeg")
    elif name == "brushed":
        _TEX_CACHE[name] = _enc(tex_brushed_mr(), "jpeg")
    elif name == "foil":
        _TEX_CACHE[name] = _enc(tex_foil(), "jpeg")
    elif name == "weave":
        _TEX_CACHE[name] = _enc(tex_weave(), "png")
    elif name == "heater":
        _TEX_CACHE[name] = _enc(tex_heater(), "jpeg")
    elif name == "screen":
        _TEX_CACHE[name] = _enc(tex_screen(), "jpeg")
    return _TEX_CACHE[name]

def _enc(img, fmt, q=80):
    bio = io.BytesIO()
    if fmt == "jpeg":
        img.save(bio, "JPEG", quality=q, optimize=True)
        return ("image/jpeg", bio.getvalue())
    img.save(bio, "PNG", optimize=True)
    return ("image/png", bio.getvalue())

# =====================================================================================
# 2. GEOMETRY PRIMITIVES  (all return closed trimesh shells, built Y-up)
# =====================================================================================
def tm(v, f):
    return trimesh.Trimesh(np.asarray(v, float), np.asarray(f, np.int64), process=False)

def mat4_t(t):
    m = np.eye(4); m[:3, 3] = t; return m

def mat4_euler(e):
    return trimesh.transformations.euler_matrix(e[0], e[1], e[2], "sxyz")

def mv(mesh, t=(0, 0, 0), e=(0, 0, 0), s=None):
    """Copy, optionally scale, rotate (Euler XYZ, radians), then translate."""
    m = mesh.copy()
    if s is not None:
        m.apply_scale(s)
    if any(e):
        m.apply_transform(mat4_euler(e))
    if any(t):
        m.apply_translation(t)
    return m

def rot_y_to(v):
    """4x4 rotation taking +Y onto vector v."""
    v = np.asarray(v, float); v = v / np.linalg.norm(v)
    y = np.array([0, 1.0, 0])
    c = np.dot(y, v)
    if c > 0.999999:
        return np.eye(4)
    if c < -0.999999:
        return trimesh.transformations.rotation_matrix(math.pi, [1, 0, 0])
    ax = np.cross(y, v)
    return trimesh.transformations.rotation_matrix(math.acos(c), ax)

def orient(mesh, axis, pos=(0, 0, 0)):
    m = mesh.copy()
    m.apply_transform(rot_y_to(axis))
    m.apply_translation(pos)
    return m

def box(sx, sy, sz, c=(0, 0, 0)):
    m = trimesh.creation.box((sx, sy, sz))
    m.apply_translation(c)
    return m

def _corner_pts(sx, sy, sz, r, seg):
    """points of 8 corner spheres (radius r) inside a box -> hull = filleted box"""
    r = min(r, sx / 2 * 0.999, sy / 2 * 0.999, sz / 2 * 0.999)
    pts = []
    for i in range(seg + 1):
        th = math.pi / 2 * i / seg
        for j in range(seg + 1):
            ph = math.pi / 2 * j / seg
            pts.append((math.cos(th) * math.cos(ph), math.sin(th), math.cos(th) * math.sin(ph)))
    pts = np.array(pts) * r
    out = []
    for sxg in (-1, 1):
        for syg in (-1, 1):
            for szg in (-1, 1):
                q = pts * [sxg, syg, szg] + [sxg * (sx / 2 - r), syg * (sy / 2 - r), szg * (sz / 2 - r)]
                out.append(q)
    return np.vstack(out)

def rbox(sx, sy, sz, r=1.0 * MM, c=(0, 0, 0), seg=2):
    """Box with filleted edges (r) - every machined part uses this instead of a raw box."""
    if r <= 1e-6:
        return box(sx, sy, sz, c)
    if min(sx, sy, sz) < 6 * MM or r < 0.9 * MM:
        seg = 1          # tiny parts: a single chamfer reads the same as a fillet and costs a fraction
    m = trimesh.convex.convex_hull(_corner_pts(sx, sy, sz, r, seg))
    m.apply_translation(c)
    return m

def cbox(sx, sy, sz, ch=0.5 * MM, c=(0, 0, 0)):
    """Chamfered box."""
    return rbox(sx, sy, sz, ch, c, seg=1)

def lathe(profile, seg=32, axis=(0, 1, 0), pos=(0, 0, 0), cap=True):
    """Revolve a (radius, y) profile (bottom->top) around Y. Profile should start/end on the axis
    (r=0) to make a closed solid."""
    pts = np.array(profile, float)
    if cap:
        if pts[0, 0] > 1e-9:
            pts = np.vstack([[0, pts[0, 1]], pts])
        if pts[-1, 0] > 1e-9:
            pts = np.vstack([pts, [0, pts[-1, 1]]])
    m = trimesh.creation.revolve(pts, sections=seg)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    m.fix_normals()
    return orient(m, axis, pos)

def cyl(r, h, axis=(0, 1, 0), pos=(0, 0, 0), seg=24, ch=0.0, y0=None):
    """Cylinder centred on pos along axis (or starting at y0 along axis if given)."""
    a = -h / 2 if y0 is None else y0
    b = a + h
    if ch > 0:
        prof = [(0, a), (r - ch, a), (r, a + ch), (r, b - ch), (r - ch, b), (0, b)]
    else:
        prof = [(0, a), (r, a), (r, b), (0, b)]
    return lathe(prof, seg, axis, pos)

def ring(r_in, r_out, h, axis=(0, 1, 0), pos=(0, 0, 0), seg=32, ch=0.0):
    a, b = -h / 2, h / 2
    prof = [(r_in, a), (r_out - ch, a), (r_out, a + ch), (r_out, b - ch), (r_out - ch, b), (r_in, b), (r_in, a)]
    if ch == 0:
        prof = [(r_in, a), (r_out, a), (r_out, b), (r_in, b), (r_in, a)]
    pts = np.array(prof)
    m = trimesh.creation.revolve(pts, sections=seg)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    m.fix_normals()
    return orient(m, axis, pos)

def sphere(r, pos=(0, 0, 0), seg=24):
    prof = [(r * math.sin(t), -r * math.cos(t)) for t in np.linspace(0, math.pi, seg // 2 + 1)]
    return lathe(prof, seg, (0, 1, 0), pos)

def torus(R, r, axis=(0, 1, 0), pos=(0, 0, 0), seg=32, tseg=10):
    m = trimesh.creation.torus(R, r, major_sections=seg, minor_sections=tseg)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    return orient(m, axis, pos)

def tube(path, r, seg=8, cap=True):
    """Sweep a circle of radius r along a 3D polyline (parallel-transport frames)."""
    P = np.asarray(path, float)
    n = len(P)
    T = np.zeros_like(P)
    T[1:-1] = P[2:] - P[:-2]
    T[0] = P[1] - P[0]
    T[-1] = P[-1] - P[-2]
    T /= np.linalg.norm(T, axis=1)[:, None]
    ref = np.array([0, 1.0, 0]) if abs(T[0][1]) < 0.9 else np.array([1.0, 0, 0])
    N = np.cross(T[0], ref); N /= np.linalg.norm(N)
    verts = []
    for i in range(n):
        if i > 0:
            v = np.cross(T[i - 1], T[i])
            s = np.linalg.norm(v)
            if s > 1e-9:
                ang = math.atan2(s, np.dot(T[i - 1], T[i]))
                N = trimesh.transformations.rotation_matrix(ang, v / s)[:3, :3] @ N
        B = np.cross(T[i], N)
        for k in range(seg):
            a = TAU * k / seg
            verts.append(P[i] + r * (math.cos(a) * N + math.sin(a) * B))
    faces = []
    for i in range(n - 1):
        for k in range(seg):
            a, b = i * seg + k, i * seg + (k + 1) % seg
            c, d = a + seg, b + seg
            faces += [[a, c, b], [b, c, d]]
    verts = list(verts)
    if cap:
        c0 = len(verts); verts.append(P[0])
        c1 = len(verts); verts.append(P[-1])
        for k in range(seg):
            faces.append([c0, (k + 1) % seg, k])
            faces.append([c1, (n - 1) * seg + k, (n - 1) * seg + (k + 1) % seg])
    m = tm(verts, faces)
    m.fix_normals()
    return m

def bezier(p0, p1, p2, p3, n=12):
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = map(np.asarray, (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3

def route(points, bend=6 * MM, n=5):
    """Polyline with rounded corners - for harnesses and plumbing."""
    P = [np.asarray(p, float) for p in points]
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        d1 = (b - a); l1 = np.linalg.norm(d1); d1 /= l1
        d2 = (c - b); l2 = np.linalg.norm(d2); d2 /= l2
        rr = min(bend, l1 * 0.45, l2 * 0.45)
        s, e = b - d1 * rr, b + d2 * rr
        for t in np.linspace(0, 1, n):
            out.append((1 - t) ** 2 * s + 2 * (1 - t) * t * b + t ** 2 * e)
    out.append(P[-1])
    # drop near-duplicates
    res = [out[0]]
    for p in out[1:]:
        if np.linalg.norm(p - res[-1]) > 1e-5:
            res.append(p)
    return np.array(res)

def extrude(poly, h, axis=(0, 1, 0), pos=(0, 0, 0), y0=0.0):
    """Extrude a shapely polygon (in XZ plane: polygon x->X, polygon y->Z) by h along +Y, then orient."""
    if poly.geom_type == "MultiPolygon":
        return trimesh.util.concatenate([extrude(g, h, axis, pos, y0) for g in poly.geoms if g.area > 1e-9])
    m = trimesh.creation.extrude_polygon(poly, h)
    # extrude_polygon makes polygon in XY, extruded along +Z. Map (x,y,z)->(x,z,y)
    T = np.array([[1, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 0, 0, 1.0]])
    m.apply_transform(T)
    m.invert() if m.volume < 0 else None
    m.apply_translation((0, y0, 0))
    m.fix_normals()
    return orient(m, axis, pos)

def rrect(w, d, r, cx=0, cz=0):
    """rounded rectangle polygon in XZ"""
    b = sbox(cx - w / 2 + r, cz - d / 2 + r, cx + w / 2 - r, cz + d / 2 - r)
    return b.buffer(r, resolution=4) if r > 0 else sbox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2)

def plate(w, d, t, r=1 * MM, holes=(), cutouts=(), axis=(0, 1, 0), pos=(0, 0, 0), y0=0.0):
    """Machined plate with rounded corners, round holes [(x,z,dia)] and polygon cutouts."""
    p = rrect(w, d, r)
    for (x, z, dia) in holes:
        p = p.difference(Point(x, z).buffer(dia / 2, resolution=4))
    for c in cutouts:
        p = p.difference(c)
    return extrude(p, t, axis, pos, y0)

def hexprism(af, h, axis=(0, 1, 0), pos=(0, 0, 0), y0=None):
    """Hexagon across-flats af."""
    r = af / 2 / math.cos(math.pi / 6)
    prof = [(0, 0), (r, 0), (r, h), (0, h)]
    m = trimesh.creation.revolve(np.array(prof), sections=6)
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    m.apply_translation((0, (-h / 2 if y0 is None else y0), 0))
    m.fix_normals()
    return orient(m, axis, pos)

# ---------- fasteners ----------
_SCREW_CACHE = {}

def cap_screw(d=2.5 * MM, washer=True):
    """Socket head cap screw head (+ washer) sitting on y=0 facing +Y. Shank goes down into the part
    (hidden). Returns {mat: mesh}."""
    key = (round(d, 6), washer)
    if key in _SCREW_CACHE:
        return _SCREW_CACHE[key]
    hd, hh = 1.6 * d, 1.0 * d * 0.9
    out = {}
    y = 0.0
    if washer:
        out["fastener"] = ring(d * 0.55, d * 1.05, 0.2 * d, pos=(0, 0.1 * d, 0), seg=8)
        y = 0.2 * d
    prof = [(0, y - 0.6 * d), (hd / 2, y), (hd / 2, y + hh - 0.1 * d),
            (hd / 2 - 0.1 * d, y + hh), (0.44 * d, y + hh), (0.44 * d, y + hh - 0.5 * d), (0, y + hh - 0.5 * d)]
    out["steel_black"] = lathe(prof, 8)
    _SCREW_CACHE[key] = out
    return out

def pan_screw(d=2 * MM):
    prof = [(0, -0.4 * d), (0.95 * d, 0), (0.95 * d, 0.3 * d), (0.6 * d, 0.6 * d), (0, 0.62 * d)]
    return {"fastener": lathe(prof, 8)}

def hexnut(d=3 * MM):
    return {"fastener": hexprism(d * 1.8, d * 0.8, y0=0)}

def standoff(h, af=4.5 * MM):
    return {"brass": hexprism(af, h, y0=0)}

def threaded_rod(L, d=3 * MM, axis=(0, 0, 1), pos=(0, 0, 0)):
    """Threads suggested by a rippled lathe profile."""
    prof = [(0, -L / 2)]
    pitch = 0.5 * MM * (d / (3 * MM))
    n = int(L / pitch)
    n = min(n, 70)
    for i in range(n + 1):
        y = -L / 2 + L * i / n
        prof.append((d / 2 * (0.88 if i % 2 else 1.0), y))
    prof.append((0, L / 2))
    return lathe(prof, 6, axis, pos)

# ---------- connectors ----------
def micro_d(npins=15, axis=(0, 0, 1)):
    """Micro-D connector, mating face along +Y before orienting. Origin = mounting flange centre."""
    w = (npins // 2 + 3) * 1.27 * MM + 4 * MM
    out = {"nickel": [], "plastic_black": [], "gold": [], "steel_black": []}
    out["nickel"].append(rbox(w + 6 * MM, 0.8 * MM, 6.5 * MM, 0.6 * MM, (0, 0.4 * MM, 0)))   # flange
    shell = Polygon([(-w / 2, -2.4 * MM), (w / 2, -2.4 * MM), (w / 2 - 0.8 * MM, 2.4 * MM), (-w / 2 + 0.8 * MM, 2.4 * MM)])
    out["nickel"].append(extrude(shell.buffer(0.3 * MM), 4.5 * MM, y0=0.8 * MM))
    ins = shell.buffer(-0.5 * MM)
    out["plastic_black"].append(extrude(ins, 0.3 * MM, y0=5.3 * MM))
    for i in range(npins):
        row = i % 2
        x = -w / 2 + 2.6 * MM + (i // 2 + 0.5 * row) * 1.27 * MM
        out["gold"].append(cyl(0.25 * MM, 1.0 * MM, pos=(x, 5.9 * MM, (0.6 - 1.2 * row) * MM), seg=4))
    for s in (-1, 1):
        out["steel_black"].append(cyl(0.9 * MM, 1.2 * MM, pos=(s * (w / 2 + 1.8 * MM), 1.4 * MM, 0), seg=8))
    R = rot_y_to(axis)
    for k in out:
        out[k] = [m.copy() for m in out[k]]
        for m in out[k]:
            m.apply_transform(R)
    return out

def sma(axis=(0, 1, 0), bulkhead=True):
    """SMA jack: hex flange + threaded barrel + PTFE + centre pin. Base at origin facing +Y."""
    out = {"gold": [], "plastic_white": []}
    if bulkhead:
        out["gold"].append(rbox(6.4 * MM, 1.2 * MM, 6.4 * MM, 0.4 * MM, (0, 0.6 * MM, 0)))
    out["gold"].append(hexprism(7.9 * MM, 1.6 * MM, y0=1.2 * MM))
    out["gold"].append(threaded_rod(5.5 * MM, 6.3 * MM, axis=(0, 1, 0), pos=(0, 5.55 * MM, 0)))
    out["plastic_white"].append(cyl(2.0 * MM, 0.3 * MM, pos=(0, 8.45 * MM, 0), seg=12))
    out["gold"].append(cyl(0.45 * MM, 1.2 * MM, pos=(0, 8.6 * MM, 0), seg=6))
    R = rot_y_to(axis)
    for k in out:
        for m in out[k]:
            m.apply_transform(R)
    return out

def pc104_header(pins_per_row=52, rows=2):
    """Stacking header: black body + gold pins above. Origin at bottom centre."""
    L = pins_per_row * 2.54 * MM
    out = {"plastic_black": [rbox(L + 2 * MM, 8.5 * MM, rows * 2.54 * MM + 1.4 * MM, 0.4 * MM, (0, 4.25 * MM, 0))], "gold": []}
    # pins: represent each row as a comb of thin bars (one bar per 4 pins keeps tri count low)
    for r in range(rows):
        z = (r - (rows - 1) / 2) * 2.54 * MM
        for i in range(0, pins_per_row, 2):
            x = -L / 2 + (i + 1) * 2.54 * MM
            out["gold"].append(box(0.64 * MM, 1.8 * MM, 0.64 * MM, (x, 9.4 * MM, z)))
    return out

# ---------- PCB with components ----------
def pcb_board(w, d, t=1.6 * MM, holes=(), cutouts=(), r=1.5 * MM):
    """Board top surface at y = t. FR4 core edge material + textured top/bottom skins."""
    out = {"pcb": [], "pcb_edge": []}
    core = plate(w - 0.1 * MM, d - 0.1 * MM, t - 0.2 * MM, r, holes, cutouts, y0=0.1 * MM)
    out["pcb_edge"].append(core)
    out["pcb"].append(plate(w, d, 0.1 * MM, r, holes, cutouts, y0=t - 0.1 * MM))
    out["pcb"].append(plate(w, d, 0.1 * MM, r, holes, cutouts, y0=0.0))
    return out

def merge_into(dst, src, T=None):
    """Merge a {mat: mesh | [meshes]} dict into dst, applying 4x4 T."""
    for k, v in src.items():
        lst = v if isinstance(v, list) else [v]
        for m in lst:
            mm = m.copy()
            if T is not None:
                mm.apply_transform(T)
            dst.setdefault(k, []).append(mm)
    return dst

def cat(*ds):
    """Combine several {mat: mesh|[meshes]} dicts."""
    out = {}
    for d in ds:
        merge_into(out, d)
    return out


def exy(poly, h, z0=0.0):
    """Extrude a shapely polygon given in world XY along +Z (from z0), with outward normals."""
    if poly.geom_type == "MultiPolygon":
        return trimesh.util.concatenate([exy(g, h, z0) for g in poly.geoms if g.area > 1e-9])
    m = trimesh.creation.extrude_polygon(poly, h)
    if m.volume < 0:
        m.invert()
    m.apply_translation((0, 0, z0))
    return m


def T(t=(0, 0, 0), e=(0, 0, 0), axis=None):
    m = mat4_euler(e) if any(e) else np.eye(4)
    if axis is not None:
        m = rot_y_to(axis) @ m
    m[:3, 3] = t
    return m

def ic_qfp(size, h=1.4 * MM, leads=True):
    """Quad flat pack: black body + gold lead combs."""
    out = {"ic_black": [cbox(size, h, size, 0.2 * MM, (0, h / 2 + 0.1 * MM, 0))], "nickel": []}
    if leads:
        for a in range(4):
            comb = box(size * 0.8, 0.25 * MM, 1.2 * MM, (0, 0.13 * MM, size / 2 + 0.5 * MM))
            comb.apply_transform(trimesh.transformations.rotation_matrix(a * math.pi / 2, [0, 1, 0]))
            out["nickel"].append(comb)
    return out

def bga(size, h=1.2 * MM):
    return {"ic_black": [cbox(size, h, size, 0.15 * MM, (0, h / 2 + 0.35 * MM, 0))],
            "pcb_edge": [box(size * 1.04, 0.35 * MM, size * 1.04, (0, 0.175 * MM, 0))]}

def populate(rng, w, d, keepout=(), n_passive=60, n_ic=6, y=1.6 * MM, margin=4 * MM):
    n_passive = int(n_passive * 0.55)
    """Random but plausible SMD population: ICs, passives, crystals, inductors. keepout: shapely polys."""
    out = {}
    occupied = list(keepout)
    def free(poly):
        return all(not poly.intersects(o) for o in occupied)
    def place(builder, size_xz, tries=40):
        if size_xz[0] + 2 * margin >= w or size_xz[1] + 2 * margin >= d:
            return False
        for _ in range(tries):
            x = rng.uniform(-w / 2 + margin + size_xz[0] / 2, w / 2 - margin - size_xz[0] / 2)
            z = rng.uniform(-d / 2 + margin + size_xz[1] / 2, d / 2 - margin - size_xz[1] / 2)
            poly = sbox(x - size_xz[0] / 2 - 0.6 * MM, z - size_xz[1] / 2 - 0.6 * MM, x + size_xz[0] / 2 + 0.6 * MM, z + size_xz[1] / 2 + 0.6 * MM)
            if free(poly):
                occupied.append(poly)
                merge_into(out, builder(), T((x, y, z)))
                return True
        return False
    for _ in range(n_ic):
        s = rng.choice([7, 10, 12, 14]) * MM
        place(lambda s=s: ic_qfp(s) if rng.random() < 0.5 else bga(s), (s + 2.5 * MM, s + 2.5 * MM))
    for _ in range(n_ic):
        a, b = rng.choice([3, 4, 5]) * MM, rng.choice([5, 6, 9]) * MM
        place(lambda a=a, b=b: {"ic_black": [cbox(a, 1.2 * MM, b, 0.15 * MM, (0, 0.7 * MM, 0))],
                                "nickel": [box(a + 1.6 * MM, 0.2 * MM, b * 0.8, (0, 0.15 * MM, 0))]}, (a + 2 * MM, b))
    for _ in range(n_passive):
        a, b = rng.choice([(1.0, 0.5), (1.6, 0.8), (2.0, 1.25), (3.2, 1.6)])
        a, b = a * MM, b * MM
        kind = rng.random()
        def mk(a=a, b=b, kind=kind):
            body = "smd_tan" if kind < 0.45 else ("ic_black" if kind < 0.75 else "ceramic")
            o = {body: [box(a * 0.7, b * 0.8, b, (0, b * 0.4 + 0.05 * MM, 0))],
                 "nickel": [box(a * 0.16, b * 0.82, b * 1.02, (s * a * 0.42, b * 0.41 + 0.05 * MM, 0)) for s in (-1, 1)]}
            return o
        if rng.random() < 0.5:
            place(mk, (a, b))
        else:
            place(lambda mk=mk: {k: [mv(m, e=(0, math.pi / 2, 0)) for m in v] for k, v in mk().items()}, (b, a))
    return out, occupied

def shield_can(w, d, h):
    o = {"nickel": [rbox(w, h, d, 0.4 * MM, (0, h / 2, 0))]}
    # vent holes suggested by a darker inset grid
    return o

# =====================================================================================
# 3. NODES + GLB WRITER
# =====================================================================================
class Node:
    def __init__(self, name, t=(0, 0, 0), e=(0, 0, 0), extras=None):
        self.name = name
        self.t = tuple(float(x) for x in t)
        self.e = tuple(float(x) for x in e)
        self.extras = extras
        self.children = []
        self.geo = {}

    def add(self, mats_or_mat, mesh=None, Tm=None):
        """add('mat', mesh) or add({'mat': [meshes]})"""
        if isinstance(mats_or_mat, str):
            merge_into(self.geo, {mats_or_mat: mesh}, Tm)
        else:
            merge_into(self.geo, mats_or_mat, Tm)
        return self

    def child(self, name, t=(0, 0, 0), e=(0, 0, 0), extras=None):
        n = Node(name, t, e, extras)
        self.children.append(n)
        return n

    def mount(self, name, t=(0, 0, 0), e=(0, 0, 0)):
        assert name.startswith("mount_")
        return self.child(name, t, e)

    def screw(self, pos, normal=(0, 1, 0), d=2.5 * MM, kind="cap", washer=True):
        parts = cap_screw(d, washer) if kind == "cap" else pan_screw(d)
        self.add(parts, Tm=T(pos, axis=normal))

    def walk(self, parent=np.eye(4), path=()):
        M_ = parent @ (mat4_t(self.t) @ mat4_euler(self.e))
        yield self, M_, path + (self.name,)
        for c in self.children:
            yield from c.walk(M_, path + (self.name,))


def _quat_from_euler(e):
    q = trimesh.transformations.quaternion_from_euler(e[0], e[1], e[2], "sxyz")  # w,x,y,z
    return [float(q[1]), float(q[2]), float(q[3]), float(q[0])]


def _shade(meshes, angle=32):
    m = trimesh.util.concatenate(meshes)
    m.merge_vertices(merge_tex=True, merge_norm=True)
    m.remove_unreferenced_vertices()
    if len(m.faces) == 0:
        return None
    s = trimesh.graph.smooth_shade(m, angle=np.radians(angle), facet_minarea=None)
    return s


def _uv_box(V, N, scale):
    """Per-vertex box projection by dominant normal axis; 1 texture repeat per `scale` metres."""
    ax = np.argmax(np.abs(N), axis=1)
    uv = np.zeros((len(V), 2), np.float32)
    for a, (i, j) in enumerate([(2, 1), (0, 2), (0, 1)]):
        sel = ax == a
        uv[sel, 0] = V[sel, i] / scale
        uv[sel, 1] = V[sel, j] / scale
    return uv


def write_glb(path, root, scene_extras=None):
    """Minimal glTF 2.0 binary writer: node hierarchy, extras, PBR materials, embedded textures."""
    gl = {"asset": {"version": "2.0", "generator": "build_spacecraft_kit.py"},
          "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [], "meshes": [], "accessors": [],
          "bufferViews": [], "buffers": [], "materials": [], "textures": [], "images": [], "samplers": [
              {"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}]}
    if scene_extras:
        gl["scenes"][0]["extras"] = scene_extras
    blob = bytearray()
    mat_index, img_index = {}, {}
    tris = 0

    def view(data, target=None):
        while len(blob) % 4:
            blob.append(0)
        off = len(blob)
        blob.extend(data)
        bv = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            bv["target"] = target
        gl["bufferViews"].append(bv)
        return len(gl["bufferViews"]) - 1

    def accessor(arr, ctype, typ, target, minmax=False):
        idx = view(arr.tobytes(), target)
        a = {"bufferView": idx, "componentType": ctype, "count": int(arr.shape[0]), "type": typ}
        if minmax:
            a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
        gl["accessors"].append(a)
        return len(gl["accessors"]) - 1

    def image(name):
        if name not in img_index:
            mime, data = texture_bytes(name)
            gl["images"].append({"bufferView": view(data), "mimeType": mime, "name": name})
            gl["textures"].append({"source": len(gl["images"]) - 1, "sampler": 0})
            img_index[name] = len(gl["textures"]) - 1
        return img_index[name]

    def material(name):
        if name in mat_index:
            return mat_index[name]
        d = MATS[name]
        pbr = {"baseColorFactor": list(d["color"]) + [d.get("alpha", 1.0)],
               "metallicFactor": d["metal"], "roughnessFactor": d["rough"]}
        m = {"name": name, "pbrMetallicRoughness": pbr}
        if d.get("tex"):
            pbr["baseColorTexture"] = {"index": image(d["tex"])}
            if d.get("emissive_tex"):
                m["emissiveTexture"] = {"index": image(d["tex"])}
                m["emissiveFactor"] = [0.9, 0.9, 0.9]
        if d.get("mr_tex"):
            pbr["metallicRoughnessTexture"] = {"index": image(d["mr_tex"])}
            pbr["roughnessFactor"] = 1.0 if d["mr_tex"] == "pcb_mr" else d["rough"] / 0.36
            pbr["metallicFactor"] = d["metal"] if d["mr_tex"] != "pcb_mr" else 1.0
        if d.get("normal_tex"):
            m["normalTexture"] = {"index": image(d["normal_tex"]), "scale": 1.0}
        if d.get("emissive"):
            m["emissiveFactor"] = list(d["emissive"])
        if d.get("alpha", 1.0) < 1.0:
            m["alphaMode"] = "BLEND"
            m["doubleSided"] = True
        gl["materials"].append(m)
        mat_index[name] = len(gl["materials"]) - 1
        return mat_index[name]

    def emit(node):
        nonlocal tris
        nd = {"name": node.name}
        if any(node.t):
            nd["translation"] = list(node.t)
        if any(node.e):
            nd["rotation"] = _quat_from_euler(node.e)
        if node.extras:
            nd["extras"] = node.extras
        idx = len(gl["nodes"])
        gl["nodes"].append(nd)
        if node.geo:
            prims = []
            for mname in sorted(node.geo):
                s = _shade(node.geo[mname])
                if s is None:
                    continue
                V = np.asarray(s.vertices, np.float32)
                N = np.asarray(s.vertex_normals, np.float32)
                F = np.asarray(s.faces)
                tris += len(F)
                attrs = {"POSITION": accessor(V, 5126, "VEC3", 34962, True),
                         "NORMAL": accessor(N, 5126, "VEC3", 34962)}
                d = MATS[mname]
                if d.get("tex") or d.get("mr_tex") or d.get("normal_tex"):
                    attrs["TEXCOORD_0"] = accessor(_uv_box(V, N, d.get("uv", 0.1)), 5126, "VEC2", 34962)
                if len(V) < 65535:
                    ind = accessor(F.astype(np.uint16).reshape(-1, 1), 5123, "SCALAR", 34963)
                else:
                    ind = accessor(F.astype(np.uint32).reshape(-1, 1), 5125, "SCALAR", 34963)
                prims.append({"attributes": attrs, "indices": ind, "material": material(mname)})
            if prims:
                gl["meshes"].append({"name": node.name, "primitives": prims})
                nd["mesh"] = len(gl["meshes"]) - 1
        kids = [emit(c) for c in node.children]
        if kids:
            nd["children"] = kids
        return idx

    emit(root)
    for k in ("textures", "images", "materials", "meshes"):
        if not gl[k]:
            del gl[k]
    if "images" not in gl:
        del gl["samplers"]
    while len(blob) % 4:
        blob.append(0)
    gl["buffers"].append({"byteLength": len(blob)})
    js = json.dumps(gl, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob))
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(blob), 0x004E4942) + bytes(blob)
    with open(path, "wb") as f:
        f.write(out)
    return tris, len(out)

# =====================================================================================
# 4. PART REGISTRY
# =====================================================================================
PARTS = {}

def part(pid, label, tier, subsystem, origin):
    """Decorator registering a builder. Builder receives the root Node and fills it."""
    def deco(fn):
        PARTS[pid] = dict(fn=fn, label=label, tier=tier, subsystem=subsystem, origin=origin)
        return fn
    return deco

# === PARTS BEGIN ===
# ---------------------------------------------------------------------------------------
# Shared 6U geometry (metres). Rails sit in the four X/Y corners and run along Z.
# ---------------------------------------------------------------------------------------
EX, EY, EZ = ENVELOPE[0] / 2, ENVELOPE[1] / 2, ENVELOPE[2] / 2   # 0.11315, 0.05, 0.183
RAIL = 8.5 * MM
RX, RY = EX - RAIL, EY - RAIL          # rail inner faces 0.10465 / 0.0415
PT = 1.5 * MM                          # face panel thickness
PY_OUT, PY_IN = 0.0420, 0.0420 - PT    # +-Y panels inset 8 mm below rail faces (room for stowed wings)
PX_OUT, PX_IN = RX + PT, RX            # +-X panels against the rails' inner faces
PZ_OUT, PZ_IN = 0.1755, 0.1740         # +-Z panels
EF_IN = 0.1705                         # end-frame inner face (end frame spans EF_IN..PZ_IN)
TIP = 10 * MM                          # rail tip (rail end) length
TIE_X, TIE_Y = 0.1000, 0.0340          # tie-rod positions
# payload apertures / feature positions shared by panels and the assembly (x, y on the Z faces)
CAM_XY = (-0.0515, 0.0)
IR_XY = (0.0440, 0.0)
ION_XY = (0.0560, -0.004)
ACCESS_XY = (-0.060, -0.016)           # RBF / umbilical access port on -Z face
ST_ZY = (-0.0220, 0.0155)              # star-tracker aperture on +X face (z, y)
SUN_PX_ZY = (-0.120, 0.020)           # sun sensor on +X face
PATCH_PX_ZY = (0.105, 0.0)             # S-band patch on +X face


@part("frame_6u", "6U frame: hard-anodised rails, rail ends, end frames, panel flanges, tie-rods",
      1, "structure", "geometric centre of the 6U envelope")
def b_frame(root):
    rails = root.child("rails")
    for sx in (-1, 1):
        for sy in (-1, 1):
            # rail profile: 8.5 mm square, chamfered outer corner, 2 mm lip inward on the panel side
            poly = Polygon([(RX - 2 * MM, RY), (EX - 0.6 * MM, RY), (EX, RY + 0.6 * MM), (EX, EY - 0.6 * MM),
                            (EX - 0.6 * MM, EY), (RX - 1.2 * MM, EY), (RX - 2 * MM, EY - 0.8 * MM)])
            poly = affinity.scale(poly, sx, sy, origin=(0, 0))
            rails.add("al_hard_anod", exy(poly, 2 * (EZ - TIP) - 0.2 * MM, -(EZ - TIP) + 0.1 * MM))
            # rail tips (rail ends): bead-blasted, 5.2 mm bore for switch / separation spring
            sq = affinity.scale(sbox(RX, RY, EX, EY), sx, sy, origin=(0, 0))
            cxy = (sx * (EX - RAIL / 2), sy * (EY - RAIL / 2))
            bore = Point(*cxy).buffer(2.6 * MM, resolution=6)
            for sz in (-1, 1):
                z0 = (EZ - TIP + 0.1 * MM) if sz > 0 else -(EZ - 0.5 * MM)
                rails.add("al_bead", exy(sq.difference(bore), TIP - 0.6 * MM, z0))
                rails.add("al_bead", exy(sq.buffer(-0.5 * MM, join_style=2).difference(bore), 0.5 * MM,
                                         (EZ - 0.5 * MM) if sz > 0 else -EZ))
                root.mount(f"mount_rail_end_{'p' if sx > 0 else 'n'}x{'p' if sy > 0 else 'n'}y{'p' if sz > 0 else 'n'}z",
                           (cxy[0], cxy[1], sz * EZ), (0, 0 if sz > 0 else math.pi, 0))
            # panel flanges (alodine) between the end frames
            fl = unary_union([sbox(RX - 12 * MM, PY_IN - 2 * MM, RX - 2 * MM, PY_IN), sbox(RX - 2 * MM, RY - 12 * MM, RX, RY)])
            root.add("al_alodine", exy(affinity.scale(fl, sx, sy, origin=(0, 0)), 2 * EF_IN - 0.4 * MM, -EF_IN + 0.2 * MM))
    # end frames with lightening pockets and stiffening lips
    for sz in (-1, 1):
        ef = root.child("end_frame_" + ("pz" if sz > 0 else "nz"), t=(0, 0, sz * (EF_IN + PZ_IN) / 2))
        poly = rrect(2 * RX - 0.2 * MM, 2 * PY_IN - 0.2 * MM, 1.5 * MM)
        pockets = [rrect(0.088, 0.060, 6 * MM, -0.050, 0), rrect(0.088, 0.060, 6 * MM, 0.050, 0)]
        for h in pockets + [Point(a * TIE_X, b * TIE_Y).buffer(1.7 * MM, resolution=4) for a in (-1, 1) for b in (-1, 1)]:
            poly = poly.difference(h)
        th = PZ_IN - EF_IN
        ef.add("al_alodine", exy(poly, th, -th / 2))
        for h in pockets:
            ef.add("al_alodine", exy(h.buffer(2 * MM, resolution=4).difference(h), 3 * MM, -th / 2 - 3 * MM if sz > 0 else th / 2))
        root.mount("mount_end_frame_" + ("pz" if sz > 0 else "nz"), t=(0, 0, sz * EF_IN), e=(0, 0 if sz > 0 else math.pi, 0))
    # tie-rods with nuts and washers
    for sx in (-1, 1):
        for sy in (-1, 1):
            root.add("stainless", threaded_rod(2 * EF_IN - 0.4 * MM, 3 * MM, axis=(0, 0, 1), pos=(sx * TIE_X, sy * TIE_Y, 0)))
            for sz in (-1, 1):
                root.add("stainless", hexprism(5.5 * MM, 2.4 * MM, axis=(0, 0, sz), pos=(sx * TIE_X, sy * TIE_Y, sz * (EF_IN - 1.6 * MM))))
                root.add("stainless", ring(1.6 * MM, 3.4 * MM, 0.35 * MM, axis=(0, 0, 1), pos=(sx * TIE_X, sy * TIE_Y, sz * (EF_IN - 0.2 * MM)), seg=12))
    # flange-to-rail screws, heads inward
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in np.linspace(-0.14, 0.14, 5):
                root.screw((sx * (RX - 2 * MM), sy * (RY - 7 * MM), z), (-sx, 0, 0), d=2 * MM, washer=False)
    return {"notes": "rail tips have 5.2 mm bores for deploy_switch / separation_spring"}


def _panel_holes_screws(node, w, d, pitch=0.040, inset=4.5 * MM, normal=(0, 1, 0), y=0.0):
    """Pan-head screws along the perimeter of a w x d panel lying in its local XZ plane."""
    pts = []
    nx, nz = max(2, int(w / pitch) + 1), max(2, int(d / pitch) + 1)
    for x in np.linspace(-w / 2 + inset, w / 2 - inset, nx):
        pts += [(x, -d / 2 + inset), (x, d / 2 - inset)]
    for z in np.linspace(-d / 2 + inset, d / 2 - inset, nz)[1:-1]:
        pts += [(-w / 2 + inset, z), (w / 2 - inset, z)]
    for x, z in pts:
        node.screw((x, y, z), normal, d=2 * MM, kind="pan")
    return [(x, z, 2.4 * MM) for x, z in pts]


@part("face_panels", "Removable face panels (+-X, +-Y, +-Z) with apertures and fasteners",
      1, "structure", "geometric centre of the 6U envelope; one child node per panel (local +Y = outward)")
def b_panels(root):
    for sy in (-1, 1):
        n = root.child("panel_py" if sy > 0 else "panel_ny", t=(0, sy * PY_IN, 0), e=(0 if sy > 0 else math.pi, 0, 0))
        w, d = 0.205, 0.351
        holes = _panel_holes_screws(n, w, d, y=PT)
        n.add("al_bead", plate(w, d, PT, 2 * MM, holes=[(x, z, 1.0 * MM) for x, z, _ in holes]))
    for sx in (-1, 1):
        n = root.child("panel_px" if sx > 0 else "panel_nx", t=(sx * PX_IN, 0, 0), e=(0, 0, -math.pi / 2 if sx > 0 else math.pi / 2))
        # panel local: Y = outward normal, local X = world -Y*(sx), local Z = world Z
        w, d = 0.083, 0.351
        holes = _panel_holes_screws(n, w, d, pitch=0.05, y=PT)
        cut = []
        if sx > 0:
            # star tracker aperture: local x = -world y for +X panel (rotation -90 about Z maps local x -> world -y?)
            cut.append(Point(-ST_ZY[1], ST_ZY[0]).buffer(15.5 * MM, resolution=8))
            cut.append(Point(-PATCH_PX_ZY[1] + 0.005, PATCH_PX_ZY[0]).buffer(4.5 * MM, resolution=6))   # patch SMA feed
            cut.append(Point(-SUN_PX_ZY[1], SUN_PX_ZY[0] - 0.012).buffer(3.0 * MM, resolution=6))       # sun-sensor pigtail
        p = plate(w, d, PT, 2 * MM, holes=[(x, z, 1.0 * MM) for x, z, _ in holes], cutouts=cut)
        n.add("al_bead", p)
    # +-Z panels with apertures
    for sz in (-1, 1):
        n = root.child("panel_pz" if sz > 0 else "panel_nz", t=(0, 0, sz * PZ_IN), e=(math.pi / 2 if sz > 0 else -math.pi / 2, 0, 0))
        # local Y -> world +-Z ; local X = world X ; local Z = world -+Y
        w, d = 2 * RX - 0.4 * MM, 2 * PY_IN - 0.4 * MM
        holes = _panel_holes_screws(n, w, d, pitch=0.045, y=PT)
        if sz > 0:
            cut = [Point(CAM_XY[0], -CAM_XY[1]).buffer(25 * MM, resolution=10),
                   rrect(0.042, 0.042, 4 * MM, IR_XY[0], -IR_XY[1])]
        else:
            cut = [Point(ION_XY[0], ION_XY[1]).buffer(23 * MM, resolution=10).union(Point(ION_XY[0] + 0.028, ION_XY[1]).buffer(7 * MM, resolution=6)),
                   rrect(0.026, 0.026, 2 * MM, ACCESS_XY[0], ACCESS_XY[1])]
        p = plate(w, d, PT, 1.5 * MM, holes=[(x, z, 1.0 * MM) for x, z, _ in holes], cutouts=cut)
        n.add("al_bead", p)
        # subsystem accent ring around the instrument apertures
        if sz > 0:
            n.add("accent_payload", ring(25.2 * MM, 27.5 * MM, 0.6 * MM, pos=(CAM_XY[0], PT + 0.3 * MM, -CAM_XY[1]), seg=40))
        else:
            n.add("accent_propulsion", ring(23.2 * MM, 25.5 * MM, 0.6 * MM, pos=(ION_XY[0], PT + 0.3 * MM, ION_XY[1]), seg=40))


@part("deploy_switch", "Rail-end deployment (separation) switch, plunger shown depressed",
      1, "structure", "centre of the rail-end face, plunger axis = +Z (outward)")
def b_switch(root):
    # everything lives inside the 5.2 mm rail-tip bore (9.4 mm deep); leads exit into the rail's wiring groove
    root.add("stainless", ring(1.75 * MM, 2.45 * MM, 8.8 * MM, axis=(0, 0, 1), pos=(0, 0, -5.0 * MM), seg=16, ch=0.2 * MM))
    root.add("plastic_black", cyl(1.7 * MM, 3.0 * MM, axis=(0, 0, 1), pos=(0, 0, -7.8 * MM), seg=16))
    root.add("accent_power", ring(1.76 * MM, 2.3 * MM, 0.6 * MM, axis=(0, 0, 1), pos=(0, 0, -0.8 * MM), seg=16))
    pl = root.child("plunger", extras={"released_offset_m": [0, 0, 0.004]})
    pl.add("chrome", lathe([(0, -6 * MM), (1.5 * MM, -6 * MM), (1.5 * MM, -0.6 * MM), (1.2 * MM, -0.3 * MM), (0, -0.3 * MM)], 16, axis=(0, 0, 1)))
    root.add("gold", cyl(0.35 * MM, 1.0 * MM, axis=(0, 0, 1), pos=(-0.7 * MM, 0, -9.0 * MM), seg=6))
    root.add("gold", cyl(0.35 * MM, 1.0 * MM, axis=(0, 0, 1), pos=(0.7 * MM, 0, -9.0 * MM), seg=6))
    return {"note": "plunger node extras.released_offset_m gives the released position (translation)."}


@part("separation_spring", "Rail-end separation spring plunger", 1, "structure",
      "centre of the rail-end face, push axis = +Z (outward)")
def b_sep_spring(root):
    root.add("stainless", ring(2.0 * MM, 2.45 * MM, 8.8 * MM, axis=(0, 0, 1), pos=(0, 0, -5.0 * MM), seg=16, ch=0.2 * MM))
    root.add("stainless", cyl(2.0 * MM, 0.6 * MM, axis=(0, 0, 1), pos=(0, 0, -9.1 * MM), seg=16))
    P = [(1.55 * MM * math.cos(t), 1.55 * MM * math.sin(t), -8.6 * MM + 6.6 * MM * t / (6 * TAU)) for t in np.linspace(0, 6 * TAU, 96)]
    root.add("stainless", tube(P, 0.28 * MM, 6))
    pl = root.child("plunger", extras={"released_offset_m": [0, 0, 0.006]})
    pl.add("titanium", lathe([(0, -1.6 * MM), (1.85 * MM, -1.6 * MM), (1.85 * MM, -0.6 * MM), (1.4 * MM, -0.2 * MM), (0, -0.2 * MM)], 16, axis=(0, 0, 1)))
    root.add("al_hard_anod", ring(2.0 * MM, 2.4 * MM, 0.8 * MM, axis=(0, 0, 1), pos=(0, 0, -0.6 * MM), seg=16))


@part("fasteners_kit", "Standoffs and fasteners kit in a sorting tray", 1, "structure", "tray bottom centre")
def b_fasteners(root):
    w, d = 0.14, 0.09
    tray_out = rrect(w, d, 4 * MM)
    root.add("plastic_white", extrude(tray_out, 2 * MM))
    # compartment walls
    cells = []
    for i in range(4):
        for j in range(3):
            cx = -w / 2 + 6 * MM + (w - 12 * MM) * (i + 0.5) / 4
            cz = -d / 2 + 6 * MM + (d - 12 * MM) * (j + 0.5) / 3
            cells.append((cx, cz))
    inner = None
    for cx, cz in cells:
        c = rrect((w - 12 * MM) / 4 - 2 * MM, (d - 12 * MM) / 3 - 2 * MM, 2 * MM, cx, cz)
        inner = c if inner is None else inner.union(c)
    root.add("plastic_white", extrude(tray_out.difference(inner), 12 * MM, y0=2 * MM))
    rng = np.random.default_rng(4)
    makers = [
        lambda: standoff(10 * MM),
        lambda: standoff(15 * MM, 5 * MM),
        lambda: cat(cap_screw(3 * MM, False), {"stainless": [cyl(1.5 * MM, 10 * MM, pos=(0, -5 * MM, 0), seg=8)]}),
        lambda: hexnut(3 * MM),
        lambda: {"stainless": [ring(1.6 * MM, 3.3 * MM, 0.5 * MM, seg=14)]},
        lambda: cat(cap_screw(2.5 * MM, False), {"stainless": [threaded_rod(8 * MM, 2.5 * MM, axis=(0, 1, 0), pos=(0, -4 * MM, 0))]}),
        lambda: {"plastic_white": [hexprism(5 * MM, 8 * MM, y0=0)]},
        lambda: {"brass": [hexprism(4.5 * MM, 6 * MM, y0=0)]},
        lambda: hexnut(2.5 * MM),
        lambda: cat(pan_screw(2 * MM), {"stainless": [cyl(1 * MM, 6 * MM, pos=(0, -3 * MM, 0), seg=8)]}),
        lambda: {"titanium": [ring(1.3 * MM, 2.8 * MM, 0.4 * MM, seg=14)]},
        lambda: standoff(6 * MM),
    ]
    for (cx, cz), mk in zip(cells, makers):
        for k in range(5):
            x = cx + rng.uniform(-8, 8) * MM
            z = cz + rng.uniform(-6, 6) * MM
            lie = rng.random() < 0.6
            e = (math.pi / 2, rng.uniform(0, TAU), 0) if lie else (0, rng.uniform(0, TAU), 0)
            item = mk()
            tmp = merge_into({}, item, T(e=e))
            lo = min(m.bounds[0][1] for v in tmp.values() for m in v)
            root.add(tmp, Tm=T((x, 2 * MM - lo + k * 0.0001, z)))
    root.mount("mount_bench", (0, 0, 0))

# ---------------------------------------------------------------------------------------
# AVIONICS  (PC/104-format boards lie in the XZ plane, stack along +Y at 15.24 mm pitch)
# ---------------------------------------------------------------------------------------
PCW, PCD, PCT = 0.09017, 0.09589, 1.6 * MM      # PC/104 board: X x Z
STACK = 15.24 * MM
BP_J = (-0.070, -0.034, 0.048)                   # backplane harness connectors J1..J3 (board z)
PC_HOLES = [(sx * (PCW / 2 - 5.08 * MM), sz * (PCD / 2 - 5.08 * MM)) for sx in (-1, 1) for sz in (-1, 1)]
HDR_X = -PCW / 2 + 9 * MM                        # stack header runs along Z near the -X edge


def pc104(root, seed, accent, standoffs_below=True, top_screws=False):
    """Common PC/104 board: FR4 with texture, corner holes, stacking header, standoffs.
    Origin = board bottom face centre. Returns (rng, keepout list) for the caller to populate."""
    rng = np.random.default_rng(seed)
    root.add(pcb_board(PCW, PCD, PCT, holes=[(x, z, 3.2 * MM) for x, z in PC_HOLES], r=1.0 * MM))
    hdr = cat(pc104_header(26, 2))
    for dx in (-1.6 * MM, 5.0 * MM):   # H1 + H2 side by side (four rows)
        root.add(hdr, Tm=T((HDR_X + dx, PCT, 0), e=(0, math.pi / 2, 0)))
    # header pins continue below the board into the lower board's header
    for dx in (-1.6 * MM, 5.0 * MM):
        for r in (-1.27 * MM, 1.27 * MM):
            root.add("gold", box(0.64 * MM, STACK - PCT - 8.5 * MM - 0.2 * MM, 26 * 2.54 * MM - 1 * MM,
                                 (HDR_X + dx + r, -(STACK - PCT - 8.5 * MM) / 2 - 0.1 * MM, 0)))
    for x, z in PC_HOLES:
        if standoffs_below:
            root.add(standoff(STACK - PCT - 0.1 * MM), Tm=T((x, -(STACK - PCT), z)))
        if top_screws:
            root.screw((x, PCT, z), d=3 * MM, kind="pan")
    root.add("accent_" + accent, box(6 * MM, 0.4 * MM, 3 * MM, (PCW / 2 - 6 * MM, PCT + 0.2 * MM, PCD / 2 - 3 * MM)))
    keep = [sbox(HDR_X - 6 * MM, -PCD / 2, HDR_X + 9 * MM, PCD / 2)]
    keep += [Point(x, z).buffer(4.5 * MM) for x, z in PC_HOLES]
    for x, z in PC_HOLES:
        root.mount(f"mount_hole_{'p' if x > 0 else 'n'}x{'p' if z > 0 else 'n'}z", (x, 0, z))
    root.mount("mount_stack_next", (0, STACK, 0))
    return rng, keep


def toroid_inductor(R=5 * MM, r=2.2 * MM):
    o = {"ferrite": [torus(R, r * 0.8, axis=(0, 0, 1), pos=(0, R + r, 0), seg=20, tseg=8)], "copper": []}
    for k in range(12):
        a = TAU * k / 12
        c = np.array([R * math.cos(a), R + r + R * math.sin(a), 0])
        o["copper"].append(torus(r * 0.95, 0.3 * MM, axis=(-math.sin(a), math.cos(a), 0), pos=c, seg=8, tseg=4))
    return o


def leds(node, pts, mat="led_glow"):
    for x, z in pts:
        node.add(mat, rbox(1.6 * MM, 0.7 * MM, 0.8 * MM, 0.2 * MM, (x, PCT + 0.35 * MM, z)))


@part("obc_board", "On-board computer (PC/104): rad-tolerant SoC, memories, oscillator, debug connector",
      1, "avionics", "board bottom face centre; stack pitch 15.24 mm along +Y")
def b_obc(root):
    rng, keep = pc104(root, 21, "avionics")
    soc = bga(19 * MM, 2.2 * MM)
    root.add(soc, Tm=T((8 * MM, PCT, 4 * MM)))
    root.add("nickel", rbox(17 * MM, 1.0 * MM, 17 * MM, 1.0 * MM, (8 * MM, PCT + 2.9 * MM, 4 * MM)))   # heat spreader lid
    keep.append(sbox(-3 * MM, -8 * MM, 19 * MM, 16 * MM))
    for i, z in enumerate((-19 * MM, -36 * MM)):
        root.add(ic_qfp(12 * MM), Tm=T((10 * MM, PCT, z)))
        keep.append(sbox(2 * MM, z - 8 * MM, 18 * MM, z + 8 * MM))
    root.add("nickel", rbox(5 * MM, 1.6 * MM, 3.2 * MM, 0.5 * MM, (-8 * MM, PCT + 0.8 * MM, 30 * MM)))   # oscillator can
    keep.append(sbox(-12 * MM, 27 * MM, -4 * MM, 33 * MM))
    # debug connector (2x5 1.27 mm) and SD-style socket
    root.add("plastic_black", rbox(8 * MM, 3 * MM, 4 * MM, 0.3 * MM, (30 * MM, PCT + 1.5 * MM, 36 * MM)))
    root.add("gold", box(6 * MM, 0.6 * MM, 2 * MM, (30 * MM, PCT + 3.2 * MM, 36 * MM)))
    root.add("nickel", rbox(14 * MM, 1.8 * MM, 15 * MM, 0.5 * MM, (30 * MM, PCT + 0.9 * MM, -36 * MM + 7 * MM)))
    keep += [sbox(25 * MM, 33 * MM, 35 * MM, 39 * MM), sbox(22 * MM, -37 * MM, 38 * MM, -20 * MM)]
    leds(root, [(36 * MM, 10 * MM), (36 * MM, 14 * MM), (36 * MM, 18 * MM)])
    keep.append(sbox(34 * MM, 8 * MM, 38 * MM, 20 * MM))
    comp, _ = populate(rng, PCW, PCD, keep, n_passive=90, n_ic=4)
    root.add(comp)


@part("eps_board", "Electrical power system board (PC/104): MPPT converters, toroids, MOSFETs, array terminals",
      1, "power", "board bottom face centre; stack pitch 15.24 mm along +Y")
def b_eps(root):
    rng, keep = pc104(root, 22, "power")
    for i, (x, z) in enumerate([(4 * MM, 30 * MM), (22 * MM, 30 * MM), (4 * MM, 12 * MM), (22 * MM, 12 * MM)]):
        root.add(toroid_inductor(), Tm=T((x, PCT, z), e=(0, 0.3 * i, 0)))
        keep.append(Point(x, z).buffer(9 * MM))
    for i, x in enumerate(np.linspace(-2 * MM, 30 * MM, 5)):   # D2PAK MOSFETs
        root.add("ic_black", cbox(6.5 * MM, 2.3 * MM, 6 * MM, 0.3 * MM, (x, PCT + 1.15 * MM, -8 * MM)))
        root.add("nickel", box(6.8 * MM, 0.3 * MM, 3 * MM, (x, PCT + 0.15 * MM, -12 * MM)))
    keep.append(sbox(-6 * MM, -15 * MM, 34 * MM, -4 * MM))
    for x in np.linspace(-2 * MM, 26 * MM, 4):                  # tantalum caps
        root.add("safety_yellow", cbox(7.3 * MM, 2.8 * MM, 4.3 * MM, 0.3 * MM, (x, PCT + 1.4 * MM, -22 * MM)))
    keep.append(sbox(-6 * MM, -25 * MM, 30 * MM, -19 * MM))
    # solar-array input terminals along +X edge
    for z in np.linspace(-30 * MM, 30 * MM, 4):
        root.add("plastic_white", rbox(7 * MM, 5.5 * MM, 9 * MM, 0.5 * MM, (PCW / 2 - 5 * MM, PCT + 2.75 * MM, z)))
        root.add("gold", box(1.4 * MM, 1.5 * MM, 5 * MM, (PCW / 2 - 5 * MM, PCT + 5.9 * MM, z)))
    keep.append(sbox(PCW / 2 - 10 * MM, -36 * MM, PCW / 2, 36 * MM))
    root.add("ceramic_white", rbox(12 * MM, 3 * MM, 6 * MM, 0.5 * MM, (-6 * MM, PCT + 1.5 * MM, -36 * MM)))   # shunt resistor
    keep.append(sbox(-13 * MM, -40 * MM, 1 * MM, -32 * MM))
    leds(root, [(-12 * MM, 40 * MM)], "led_glow")
    leds(root, [(-8 * MM, 40 * MM)], "led_red")
    comp, _ = populate(rng, PCW, PCD, keep + [sbox(-14 * MM, 38 * MM, -6 * MM, 42 * MM)], n_passive=70, n_ic=4)
    root.add(comp)


@part("battery_pack", "Battery pack: 4 x 18650 Li-ion cells in a machined holder, protection board, heater",
      1, "power", "carrier board bottom face centre; plugs into the stack like a PC/104 board")
def b_battery(root):
    rng, keep = pc104(root, 23, "power", top_screws=True)
    R, L = 9.25 * MM, 65 * MM
    y0 = PCT + 2.5 * MM
    xs = [(-1.5 + i) * 19.4 * MM + 5 * MM for i in range(4)]
    # machined cradle (alodine) with saddles
    cradle = rrect(80 * MM, 70 * MM, 2 * MM, 5 * MM, 0)
    root.add("al_alodine", extrude(cradle, 2.5 * MM, y0=PCT))
    for z in (-26 * MM, 0, 26 * MM):
        sad = Polygon([(-36 * MM, 0), (46 * MM, 0), (46 * MM, 11 * MM), (-36 * MM, 11 * MM)])
        for x in xs:
            sad = sad.difference(Point(x, R).buffer(R + 0.2 * MM, resolution=8))
        root.add("al_alodine", exy(sad, 5 * MM, -2.5 * MM), Tm=T((0, y0, z)))
    cells = root.child("cells")
    for x in xs:
        cells.add("cell_wrap_blue", cyl(R, L - 1.5 * MM, axis=(0, 0, 1), pos=(x, y0 + R, 0), seg=28, ch=0.8 * MM))
        cells.add("nickel", cyl(R - 1.2 * MM, 0.8 * MM, axis=(0, 0, 1), pos=(x, y0 + R, L / 2 - 0.4 * MM), seg=20))
        cells.add("nickel", lathe([(0, 0), (3 * MM, 0), (3 * MM, 0.9 * MM), (0, 0.9 * MM)], 16, axis=(0, 0, 1), pos=(x, y0 + R, L / 2)))
        cells.add("nickel", cyl(R - 1.2 * MM, 0.8 * MM, axis=(0, 0, 1), pos=(x, y0 + R, -L / 2 + 0.4 * MM), seg=20))
        cells.add("accent_power", ring(R - 0.02 * MM, R + 0.25 * MM, 3 * MM, axis=(0, 0, 1), pos=(x, y0 + R, -L / 2 + 6 * MM), seg=28))
    # nickel interconnect strips (spot-welded dimples suggested by small bumps)
    for zs in (1, -1):
        z = zs * (L / 2 + 1.1 * MM)
        root.add("nickel", box(xs[-1] - xs[0] + 10 * MM, 7 * MM, 0.3 * MM, ((xs[0] + xs[-1]) / 2, y0 + R, z)))
        for x in xs:
            for dx in (-2 * MM, 2 * MM):
                root.add("nickel", sphere(0.6 * MM, (x + dx, y0 + R + 1.5 * MM, z + zs * 0.15 * MM), seg=6))
    # Kapton heater wrapped over the top of the cells + thermistor
    top = y0 + 2 * R
    root.add("heater", box(xs[-1] - xs[0], 0.25 * MM, 40 * MM, ((xs[0] + xs[-1]) / 2, top + 0.15 * MM, 0)))
    root.add("ic_black", sphere(1.2 * MM, (xs[1], top + 1.4 * MM, 8 * MM), seg=8))
    root.add("wire_white", tube(route([(xs[1], top + 1.4 * MM, 9 * MM), (xs[1], top + 1.4 * MM, 30 * MM), (-35 * MM, top - 2 * MM, 40 * MM), (-35 * MM, PCT + 6 * MM, 42 * MM)], 4 * MM), 0.35 * MM, 6))
    root.add("wire_red", tube(route([(xs[0] + 6 * MM, top - 3 * MM, L / 2 + 1.5 * MM), (-34 * MM, top - 3 * MM, L / 2 + 3 * MM), (-36 * MM, PCT + 4 * MM, L / 2 + 6 * MM)], 4 * MM), 0.6 * MM, 6))
    root.add("wire_black", tube(route([(xs[0] + 6 * MM, top - 7 * MM, -L / 2 - 1.5 * MM), (-34 * MM, top - 7 * MM, -L / 2 - 3 * MM), (-36 * MM, PCT + 4 * MM, -L / 2 - 6 * MM)], 4 * MM), 0.6 * MM, 6))
    # clamp straps over the cells
    for z in (-18 * MM, 18 * MM):
        prof = Polygon([(-34 * MM, 0), (44 * MM, 0), (44 * MM, top - y0 + 2.0 * MM), (-34 * MM, top - y0 + 2.0 * MM)])
        prof = prof.difference(Polygon([(-33 * MM, -1), (43 * MM, -1), (43 * MM, top - y0 + 0.5 * MM), (-33 * MM, top - y0 + 0.5 * MM)]))
        root.add("al_black_anod", exy(prof, 4 * MM, -2 * MM), Tm=T((0, y0, z)))
        for x in (-34.5 * MM, 44.5 * MM):
            root.screw((x, y0 + 1 * MM, z), d=2 * MM, washer=True)
    # protection board standing on the -X side of the cradle area
    pb = root.child("protection_board", t=(-38 * MM, PCT + 3 * MM, 0), e=(0, 0, math.pi / 2))
    pb.add(pcb_board(16 * MM, 60 * MM, 1.2 * MM))
    r2 = np.random.default_rng(5)
    c, _ = populate(r2, 16 * MM, 60 * MM, (), n_passive=18, n_ic=2, y=1.2 * MM, margin=1.5 * MM)
    pb.add(c)
    return {"note": "cells along Z; heater uses Kapton texture; thermistor wire white"}


def rf_shield(node, w, d, h, x, z):
    node.add("nickel", rbox(w, h, d, 0.5 * MM, (x, PCT + h / 2, z)))
    for i in range(int(w / (4.5 * MM))):
        for j in range(int(d / (4.5 * MM))):
            node.add("ic_black", cyl(0.7 * MM, 0.1 * MM, pos=(x - w / 2 + 3 * MM + i * 4.5 * MM, PCT + h + 0.02 * MM, z - d / 2 + 3 * MM + j * 4.5 * MM), seg=6))


@part("transceiver_board", "UHF/S-band transceiver board (PC/104): RF shield cans, SMA jacks, coax pigtails",
      1, "comms", "board bottom face centre; stack pitch 15.24 mm along +Y")
def b_trx(root):
    rng, keep = pc104(root, 24, "comms", top_screws=True)
    rf_shield(root, 34 * MM, 30 * MM, 4.5 * MM, 14 * MM, 22 * MM)
    rf_shield(root, 30 * MM, 24 * MM, 4.5 * MM, 16 * MM, -14 * MM)
    keep += [sbox(-4 * MM, 6 * MM, 32 * MM, 38 * MM), sbox(0, -27 * MM, 32 * MM, -1 * MM)]
    # vertical SMA jacks
    for z in (-36 * MM, 40 * MM):
        root.add(sma((0, 1, 0)), Tm=T((36 * MM, PCT, z)))
        root.add("accent_comms", ring(3.3 * MM, 4.2 * MM, 0.6 * MM, pos=(36 * MM, PCT + 3.5 * MM, z), seg=14))
        keep.append(Point(36 * MM, z).buffer(5 * MM))
    # coax pigtail from shield can to SMA, with u.FL plug
    root.add("coax_blue", tube(route([(20 * MM, PCT + 6 * MM, 22 * MM), (20 * MM, PCT + 9 * MM, 30 * MM), (36 * MM, PCT + 10 * MM, 34 * MM), (36 * MM, PCT + 11 * MM, 40 * MM)], 4 * MM), 0.6 * MM, 8))
    root.add("gold", cyl(1.0 * MM, 1.4 * MM, pos=(20 * MM, PCT + 5.2 * MM, 22 * MM), seg=10))
    # crystal + PA with heatsink fins
    root.add("nickel", rbox(5 * MM, 1.2 * MM, 3.2 * MM, 0.4 * MM, (-10 * MM, PCT + 0.6 * MM, 30 * MM)))
    for i in range(6):
        root.add("al_black_anod", box(0.8 * MM, 6 * MM, 11.4 * MM, (-14 * MM + i * 2 * MM, PCT + 3.5 * MM, -30 * MM)))
    root.add("al_black_anod", box(12 * MM, 1 * MM, 12 * MM, (-9 * MM, PCT + 0.5 * MM, -30 * MM)))
    keep += [sbox(-16 * MM, -37 * MM, -2 * MM, -23 * MM), sbox(-13 * MM, 28 * MM, -7 * MM, 32 * MM)]
    leds(root, [(-20 * MM, 40 * MM), (-16 * MM, 40 * MM)])
    comp, _ = populate(rng, PCW, PCD, keep + [sbox(-22 * MM, 38 * MM, -14 * MM, 42 * MM)], n_passive=60, n_ic=3)
    root.add(comp)


@part("backplane", "Avionics backplane / motherboard: two stack sockets, harness micro-D connectors",
      1, "avionics", "board bottom face centre; stack A centre at z=+0.012, stack B at z=-0.088 (board frame)")
def b_backplane(root):
    w, d = 0.092, 0.200
    rng = np.random.default_rng(31)
    holes = [(sx * (w / 2 - 8 * MM), z, 3.2 * MM) for sx in (-1, 1) for z in (-d / 2 + 4 * MM, 0.0, d / 2 - 4 * MM)]
    root.add(pcb_board(w, d, PCT, holes=holes, r=1.5 * MM))
    keep = [Point(x, z).buffer(4.5 * MM) for x, z, _ in holes]
    for zc in (0.050, -0.050):
        # stacking sockets aligned with the PC/104 header (board-local x of header = HDR_X)
        for dx in (-1.6 * MM, 5.0 * MM):
            root.add("plastic_black", rbox(5.4 * MM, 8.5 * MM, 26 * 2.54 * MM + 2 * MM, 0.4 * MM, (HDR_X + dx, PCT + 4.25 * MM, zc)))
            root.add("ic_black", box(3.5 * MM, 0.1 * MM, 26 * 2.54 * MM, (HDR_X + dx, PCT + 8.55 * MM, zc)))
        keep.append(sbox(HDR_X - 6 * MM, zc - 36 * MM, HDR_X + 9 * MM, zc + 36 * MM))
        for x, z in PC_HOLES:
            root.add("gold", ring(1.6 * MM, 3.0 * MM, 0.12 * MM, pos=(x, PCT + 0.06 * MM, z + zc), seg=12))   # plated pad
            keep.append(Point(x, z + zc).buffer(4 * MM))
        root.mount("mount_stack_a" if zc > 0 else "mount_stack_b", (0, STACK, zc))
    # harness connectors on the +X edge, mating face +X
    for z in BP_J:
        root.add(micro_d(21, axis=(1, 0, 0)), Tm=T((w / 2 - 6.5 * MM, PCT + 3.3 * MM, z), e=(math.pi / 2, 0, 0)))
        root.add("accent_avionics", box(1.0 * MM, 0.4 * MM, 6 * MM, (w / 2 - 12 * MM, PCT + 0.2 * MM, z)))
        keep.append(sbox(w / 2 - 14 * MM, z - 15 * MM, w / 2, z + 15 * MM))
        root.mount(f"mount_harness_j{int(round(z * 1000))}", (w / 2, PCT + 3.3 * MM, z), (0, 0, -math.pi / 2))
    comp, _ = populate(rng, w, d, keep, n_passive=70, n_ic=4)
    root.add(comp)
    for x, z, _ in holes:
        root.add(standoff(3.4 * MM), Tm=T((x, -3.4 * MM, z)))


@part("transponder", "Iris-style deep-space X-band transponder: stacked slices, SMA ports, micro-D, thermal fins",
      1, "comms", "base flange centre (bottom face)")
def b_transponder(root):
    w, d = 0.080, 0.088           # X, Z
    slices = [(0.0, 7 * MM, "al_alodine"), (7 * MM, 9 * MM, "al_black_anod"), (16 * MM, 9 * MM, "al_alodine"), (25 * MM, 9 * MM, "al_black_anod"), (34 * MM, 4 * MM, "al_alodine")]
    for y0, h, m in slices:
        root.add(m, rbox(w, h - 0.4 * MM, d, 1.2 * MM, (0, y0 + h / 2, 0)))
        root.add("al_hard_anod", rbox(w - 2 * MM, 0.4 * MM, d - 2 * MM, 0.2 * MM, (0, y0 + h - 0.2 * MM, 0)))  # seam/gasket
    H = 38 * MM
    # mounting flange tabs
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.add("al_alodine", rbox(12 * MM, 2.5 * MM, 10 * MM, 1.5 * MM, (sx * (w / 2 - 10 * MM), 1.25 * MM, sz * (d / 2 + 3 * MM))))
            root.screw((sx * (w / 2 - 10 * MM), 2.5 * MM, sz * (d / 2 + 4 * MM)), d=2.5 * MM)
    # through-bolts at corners on top
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * (w / 2 - 4.5 * MM), H, sz * (d / 2 - 4.5 * MM)), d=2.5 * MM, washer=False)
    # thermal fins on top lid
    for i in range(8):
        root.add("al_black_anod", rbox(1.6 * MM, 2.4 * MM, d - 20 * MM, 0.5 * MM, (-24.5 * MM + i * 7 * MM, H + 1.2 * MM, 0)))
    # +Z face: four SMA ports (X-band Tx, Rx, test, UHF) and micro-D
    for i, x in enumerate((-31 * MM, -19 * MM, 19 * MM, 31 * MM)):
        root.add(sma((0, 0, 1)), Tm=T((x, 21 * MM, d / 2)))
        root.add("accent_comms", ring(3.3 * MM, 4.2 * MM, 0.6 * MM, axis=(0, 0, 1), pos=(x, 21 * MM, d / 2 + 3.4 * MM), seg=14))
        root.mount(f"mount_rf_{i}", (x, 21 * MM, d / 2 + 9 * MM))
    root.add(micro_d(15, axis=(0, 0, 1)), Tm=T((0, 21 * MM, d / 2)))
    root.mount("mount_harness", (0, 21 * MM, d / 2 + 6 * MM))
    # side: test port cover + grounding stud
    root.add("al_bead", rbox(0.6 * MM, 14 * MM, 22 * MM, 0.3 * MM, (w / 2 + 0.3 * MM, 22 * MM, -10 * MM)))
    for z in (-19 * MM, -1 * MM):
        root.screw((w / 2 + 0.6 * MM, 22 * MM, z), (1, 0, 0), d=1.6 * MM, kind="pan")
    root.add("stainless", cyl(1.5 * MM, 6 * MM, axis=(1, 0, 0), pos=(w / 2 + 3 * MM, 6 * MM, 30 * MM), seg=10))
    root.add("stainless", hexprism(5 * MM, 1.6 * MM, axis=(1, 0, 0), pos=(w / 2 + 1.5 * MM, 6 * MM, 30 * MM)))

# ---------------------------------------------------------------------------------------
# ATTITUDE
# ---------------------------------------------------------------------------------------
def wheel_unit(node, name, R=17 * MM, H=16 * MM, flange=True, accent="accent_attitude", seg=40, conn_angle=0.0):
    """Reaction wheel: base flange + housing (on node), rotor on spin_<name> pivot, lid on cover_<name>.
    Built along +Y (spin axis) starting at y=0."""
    if flange:
        node.add("al_black_anod", plate(2 * R + 8 * MM, 2 * R + 8 * MM, 2.5 * MM, 3 * MM,
                                        holes=[(sx * (R + 1 * MM), sz * (R + 1 * MM), 2.6 * MM) for sx in (-1, 1) for sz in (-1, 1)]))
        for sx in (-1, 1):
            for sz in (-1, 1):
                node.screw((sx * (R + 1 * MM), 2.5 * MM, sz * (R + 1 * MM)), d=2 * MM)
    y0 = 2.5 * MM if flange else 0.0
    # housing wall (open top, so the rotor can be seen when the cover is hidden)
    node.add("al_black_anod", ring(R - 1.2 * MM, R + 0.6 * MM, H, pos=(0, y0 + H / 2, 0), seg=seg, ch=0.4 * MM))
    node.add("al_black_anod", cyl(R - 1.0 * MM, 1.5 * MM, pos=(0, y0 + 0.75 * MM, 0), seg=seg))   # floor
    node.add("al_hard_anod", cyl(4.5 * MM, 4 * MM, pos=(0, y0 + 3.5 * MM, 0), seg=20, ch=0.4 * MM))   # motor stator boss
    node.add(accent, ring(R + 0.62 * MM, R + 0.9 * MM, 1.2 * MM, pos=(0, y0 + 3 * MM, 0), seg=seg))
    # connector pigtail
    Rc = T(e=(0, conn_angle, 0))
    node.add("wire_white", tube(route([(R + 0.5 * MM, y0 + 4 * MM, 0), (R + 5 * MM, y0 + 4 * MM, 0), (R + 7 * MM, y0 + 3 * MM, 4 * MM)], 2.5 * MM), 1.0 * MM, 8), Tm=Rc)
    node.add(micro_d(9, axis=(0, 0, 1)), Tm=Rc @ T((R + 7 * MM, y0 + 3 * MM, 4 * MM), e=(0, 0, math.pi / 2)))
    spin = node.child("spin_" + name, t=(0, y0 + 5 * MM, 0))
    # rotor: rim + web with lightening holes + hub ; orange index mark so spinning reads
    spin.add("stainless", ring(R - 5.5 * MM, R - 2.0 * MM, 8 * MM, pos=(0, 4 * MM, 0), seg=seg, ch=0.5 * MM))
    web = Point(0, 0).buffer(R - 4.5 * MM, resolution=12).difference(Point(0, 0).buffer(3.5 * MM, resolution=6))
    for k in range(6):
        a = TAU * k / 6
        web = web.difference(Point((R - 10 * MM) * math.cos(a), (R - 10 * MM) * math.sin(a)).buffer(2.4 * MM, resolution=5))
    spin.add("stainless", extrude(web, 1.6 * MM, y0=3.2 * MM))
    spin.add("titanium", cyl(4.0 * MM, 7 * MM, pos=(0, 3.5 * MM, 0), seg=20, ch=0.5 * MM))
    spin.add("accent_attitude", box(3 * MM, 0.4 * MM, 2 * MM, (0, 8.2 * MM, R - 3.8 * MM)))
    cov = node.child("cover_" + name, t=(0, y0 + H, 0))
    cov.add("al_black_anod", lathe([(0, 0), (R + 0.6 * MM, 0), (R + 0.6 * MM, 1.2 * MM), (R - 2 * MM, 2.6 * MM), (0, 3.0 * MM)], seg))
    for k in range(6):
        a = TAU * k / 6 + 0.3
        cov.screw(((R - 1 * MM) * math.cos(a), 1.0 * MM, (R - 1 * MM) * math.sin(a)), d=1.6 * MM, kind="pan")
    return y0 + H + 3 * MM


@part("reaction_wheel", "Single reaction wheel in housing (rotor on spin pivot, removable cover)",
      1, "attitude", "base flange bottom centre; spin axis +Y")
def b_rw(root):
    wheel_unit(root, "wheel", R=21 * MM, H=18 * MM)


@part("rw_cluster", "3-axis reaction-wheel cluster on a machined bracket with drive electronics",
      1, "attitude", "bracket base bottom centre; wheels spin about part X, Y, Z")
def b_rwc(root):
    R, H = 12 * MM, 11 * MM
    W = 0.060
    root.add("al_alodine", plate(W, W, 2.5 * MM, 2 * MM, holes=[(sx * 26 * MM, sz * 26 * MM, 2.6 * MM) for sx in (-1, 1) for sz in (-1, 1)]))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 26 * MM, 2.5 * MM, sz * 26 * MM), d=2 * MM)
    # two vertical walls (X-facing and Z-facing) with gussets
    root.add("al_alodine", rbox(3 * MM, 30 * MM, W - 4 * MM, 1 * MM, (-W / 2 + 4 * MM, 2.5 * MM + 15 * MM, 0)))
    root.add("al_alodine", rbox(W - 4.6 * MM, 29.4 * MM, 3 * MM, 1 * MM, (0.3 * MM, 2.5 * MM + 14.7 * MM, -W / 2 + 4 * MM)))
    for g in (Polygon([(0, 0), (12 * MM, 0), (0, 12 * MM)]),):
        root.add("al_alodine", exy(g, 2 * MM, -1 * MM), Tm=T((-W / 2 + 5.5 * MM, 2.5 * MM, W / 2 - 6 * MM), e=(0, 0, 0)))
        root.add("al_alodine", exy(g, 2 * MM, -1 * MM), Tm=T((W / 2 - 7 * MM, 2.5 * MM, -W / 2 + 5.5 * MM), e=(0, -math.pi / 2, 0)))
    # wheel Y on the base (offset), wheel X on the X wall, wheel Z on the Z wall
    wy = root.child("wheel_y", t=(11 * MM, 2.5 * MM, 11 * MM))
    wheel_unit(wy, "y", R, H, flange=False, seg=28, conn_angle=-math.pi / 4)
    wx = root.child("wheel_x", t=(-W / 2 + 5.5 * MM, 2.5 * MM + 15 * MM, 11 * MM), e=(0, 0, -math.pi / 2))
    wheel_unit(wx, "x", R, H, flange=False, seg=28, conn_angle=-math.pi / 2)
    wz = root.child("wheel_z", t=(11 * MM, 2.5 * MM + 15 * MM, -W / 2 + 5.5 * MM), e=(math.pi / 2, 0, 0))
    wheel_unit(wz, "z", R, H, flange=False, seg=28, conn_angle=0.0)
    # drive electronics board on standoffs in the free corner
    eb = root.child("drive_board", t=(-14 * MM, 9 * MM, -14 * MM))
    eb.add(pcb_board(24 * MM, 24 * MM, 1.2 * MM))
    c, _ = populate(np.random.default_rng(41), 24 * MM, 24 * MM, (), n_passive=16, n_ic=2, y=1.2 * MM, margin=2 * MM)
    eb.add(c)
    leds(eb, [(8 * MM, 8 * MM)])
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.add(standoff(6.4 * MM, 3.5 * MM), Tm=T((-14 * MM + sx * 9.5 * MM, 2.5 * MM, -14 * MM + sz * 9.5 * MM)))


@part("star_tracker", "Star tracker: electronics housing, lens, conical baffle with internal vanes",
      1, "attitude", "mounting face centre; boresight +Y")
def b_st(root):
    bw, bd, bh = 34 * MM, 28 * MM, 30 * MM
    root.add("al_black_anod", rbox(bw, bh, bd, 2.5 * MM, (0, bh / 2, 0)))
    for y in (8 * MM, 16 * MM, 24 * MM):    # cooling grooves
        root.add("al_hard_anod", rbox(bw + 0.4 * MM, 1.2 * MM, bd + 0.4 * MM, 0.5 * MM, (0, y, 0)))
    for sx in (-1, 1):                       # mounting feet
        root.add("al_black_anod", rbox(6 * MM, 3 * MM, bd, 1 * MM, (sx * (bw / 2 + 2 * MM), 1.5 * MM, 0)))
        for sz in (-1, 1):
            root.screw((sx * (bw / 2 + 2.5 * MM), 3 * MM, sz * (bd / 2 - 4 * MM)), d=2 * MM)
    root.add(micro_d(15, axis=(-1, 0, 0)), Tm=T((-bw / 2, 12 * MM, 0), e=(math.pi / 2, 0, 0)))
    root.add("accent_attitude", ring(13.5 * MM, 14.5 * MM, 1.2 * MM, pos=(0, bh + 0.6 * MM, 0), seg=36))
    # lens barrel
    root.add("al_black_anod", lathe([(0, bh), (13 * MM, bh), (13 * MM, bh + 3 * MM), (10.5 * MM, bh + 4 * MM), (10.5 * MM, bh + 10 * MM), (0, bh + 10 * MM)], 36))
    root.add("glass", lathe([(0, bh + 9.6 * MM), (8.5 * MM, bh + 9.6 * MM), (8.5 * MM, bh + 10.1 * MM), (6 * MM, bh + 10.7 * MM), (0, bh + 11.0 * MM)], 32))
    # baffle: thin conical shell + vanes inside + stiffening rings outside
    y0, y1, r0, r1 = bh + 4 * MM, bh + 44 * MM, 10.5 * MM, 15.0 * MM
    prof = [(r0, y0), (r1, y1), (r1 - 0.8 * MM, y1), (r0 - 0.8 * MM, y0)]
    root.add("baffle_black", lathe(prof + [prof[0]], 40, cap=False))
    for i in range(1, 6):
        t = i / 6
        y = y0 + (y1 - y0) * t
        r = r0 + (r1 - r0) * t
        root.add("baffle_black", lathe([(r - 0.8 * MM, y), (r - 3.0 * MM, y + 0.4 * MM), (r - 3.0 * MM, y + 0.8 * MM), (r - 0.8 * MM, y + 0.8 * MM), (r - 0.8 * MM, y)], 32, cap=False))
    root.add("al_black_anod", ring(r1 - 0.7 * MM, r1 + 0.6 * MM, 1.5 * MM, pos=(0, y1 - 1.0 * MM, 0), seg=40, ch=0.3 * MM))
    root.mount("mount_boresight", (0, y1, 0))


@part("sun_sensor", "Fine sun sensor: quadrant photodiode under a pinhole mask, gold housing",
      1, "attitude", "mounting face centre; boresight +Y")
def b_sun(root):
    root.add("al_gold_anod", rbox(22 * MM, 4.2 * MM, 22 * MM, 1.5 * MM, (0, 2.1 * MM, 0)))
    root.add("glass_dark", rbox(12 * MM, 0.6 * MM, 12 * MM, 0.8 * MM, (0, 4.45 * MM, 0)))
    root.add("chrome", box(11 * MM, 0.1 * MM, 0.5 * MM, (0, 4.8 * MM, 0)))
    root.add("chrome", box(0.5 * MM, 0.1 * MM, 11 * MM, (0, 4.8 * MM, 0)))
    root.add("detector", cyl(1.0 * MM, 0.12 * MM, pos=(0, 4.82 * MM, 0), seg=12))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 8.5 * MM, 4.2 * MM, sz * 8.5 * MM), d=1.6 * MM, kind="pan")
    root.add("wire_white", tube(route([(0, 0.5 * MM, -11 * MM), (0, -3 * MM, -14 * MM), (0, -12 * MM, -16 * MM)], 3 * MM), 1.2 * MM, 8))
    root.add("accent_attitude", box(4 * MM, 0.3 * MM, 1.5 * MM, (7 * MM, 4.3 * MM, -10 * MM)))


def mtq_rod(L=70 * MM, r=4.5 * MM):
    o = {"ferrite": [cyl(r * 0.6, L, axis=(1, 0, 0), seg=16)], "copper": [], "plastic_black": [], "wire_red": []}
    n = 60
    prof = [(0, -L / 2 + 6 * MM)]
    for i in range(n + 1):
        y = -L / 2 + 6 * MM + (L - 12 * MM) * i / n
        prof.append((r * (0.97 if i % 2 else 1.0), y))
    prof.append((0, L / 2 - 6 * MM))
    o["copper"].append(lathe(prof, 20, axis=(1, 0, 0)))
    for s in (-1, 1):
        o["plastic_black"].append(cyl(r + 0.6 * MM, 4 * MM, axis=(1, 0, 0), pos=(s * (L / 2 - 4 * MM), 0, 0), seg=20, ch=0.5 * MM))
    return o


@part("magnetorquer_set", "Magnetorquer set: two ferrite-core torque rods + air-core coil on a bracket",
      1, "attitude", "bracket base bottom centre")
def b_mtq(root):
    W = 0.080
    root.add("al_alodine", plate(W, W, 2 * MM, 3 * MM, cutouts=[rrect(0.040, 0.040, 4 * MM)],
                                 holes=[(sx * 36 * MM, sz * 36 * MM, 2.6 * MM) for sx in (-1, 1) for sz in (-1, 1)]))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 36 * MM, 2 * MM, sz * 36 * MM), d=2 * MM)
    r = 4.5 * MM
    for i, (pos, e) in enumerate([((0, 2 * MM + r + 1.5 * MM, 30 * MM), (0, 0, 0)), ((30 * MM, 2 * MM + r + 1.5 * MM, 0), (0, math.pi / 2, 0))]):
        rod = root.child(f"rod_{'x' if i == 0 else 'z'}", t=pos, e=e)
        rod.add(mtq_rod(70 * MM, r))
        for s in (-1, 1):   # P-clamps
            rod.add("al_black_anod", ring(r + 0.1 * MM, r + 1.0 * MM, 4 * MM, axis=(1, 0, 0), pos=(s * 20 * MM, 0, 0), seg=20))
            rod.add("al_black_anod", rbox(3.6 * MM, 1.5 * MM, 12 * MM, 0.4 * MM, (s * 20 * MM, -r - 0.75 * MM, 0)))
    # air-core coil (Z torque): square bundle of wire wrapped in Kapton tape
    pts = [(-24 * MM, -24 * MM), (24 * MM, -24 * MM), (24 * MM, 24 * MM), (-24 * MM, 24 * MM), (-24 * MM, -24 * MM)]
    path = route([(x - 6 * MM, 2 * MM + 2.2 * MM, z - 6 * MM) for x, z in pts], 6 * MM)
    root.add("kapton", tube(path, 2.0 * MM, 10, cap=True))
    root.add("wire_red", tube(route([(-30 * MM, 2 * MM + 2 * MM, -24 * MM), (-36 * MM, 2 * MM + 3 * MM, -30 * MM), (-38 * MM, 2 * MM + 6 * MM, -38 * MM)], 3 * MM), 0.5 * MM, 6))
    root.add("accent_attitude", rbox(5 * MM, 1 * MM, 3 * MM, 0.3 * MM, (35 * MM, 2.5 * MM, -10 * MM)))


@part("imu_box", "Inertial measurement unit: machined black housing, flanges, micro-D",
      1, "attitude", "base flange bottom centre")
def b_imu(root):
    w, h, d = 30 * MM, 18 * MM, 26 * MM
    root.add("al_black_anod", rbox(w, h - 0.3 * MM, d, 2 * MM, (0, h / 2 + 0.15 * MM, 0)))
    root.add("al_black_anod", rbox(w + 12 * MM, 2 * MM, d - 6 * MM, 1 * MM, (0, 1 * MM, 0)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * (w / 2 + 3 * MM), 2 * MM, sz * 6 * MM), d=2 * MM)
    root.add("al_bead", rbox(16 * MM, 0.3 * MM, 10 * MM, 0.5 * MM, (0, h + 0.15 * MM, 0)))   # blank nameplate
    root.add(micro_d(9, axis=(0, 0, 1)), Tm=T((0, h / 2, d / 2)))
    root.add("accent_attitude", rbox(w + 0.4 * MM, 1 * MM, d + 0.4 * MM, 0.5 * MM, (0, h - 3 * MM, 0)))
    for x in (-10 * MM, 10 * MM):   # alignment pins
        root.add("stainless", cyl(1.0 * MM, 1.5 * MM, pos=(x, h + 0.75 * MM, -10 * MM), seg=10))

# ---------------------------------------------------------------------------------------
# PAYLOAD  (instruments are built with boresight +Z, origin on the optical axis at the
# rear mounting face, so they drop into the assembly without rotation)
# ---------------------------------------------------------------------------------------
@part("narrow_angle_camera", "Narrow-angle camera: detector housing with fins, 5-element lens stack, focus ring, sunshade",
      1, "payload", "optical axis at rear face of detector housing; boresight +Z")
def b_cam(root):
    hw = 46 * MM
    root.add("al_black_anod", rbox(hw, hw, 30 * MM, 2.5 * MM, (0, 0, 15 * MM)))
    for i in range(7):   # rear cooling fins
        root.add("al_black_anod", rbox(1.5 * MM, hw - 6 * MM, 6 * MM, 0.5 * MM, (-18 * MM + i * 6 * MM, 0, -2.5 * MM)))
    root.add("al_black_anod", rbox(hw - 2 * MM, hw - 2 * MM, 1.0 * MM, 0.5 * MM, (0, 0, 0.0)))
    root.add(micro_d(15, axis=(1, 0, 0)), Tm=T((hw / 2, 6 * MM, 15 * MM)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            root.screw((sx * 19 * MM, sy * 19 * MM, 30 * MM), (0, 0, 1), d=2 * MM)
    # mounting foot under the housing (sits on the -Y panel)
    root.add("al_alodine", rbox(hw + 10 * MM, 3 * MM, 28 * MM, 1 * MM, (0, -hw / 2 - 1.5 * MM, 15 * MM)))
    root.add("al_alodine", rbox(hw - 6 * MM, 11.4 * MM, 3 * MM, 1 * MM, (0, -hw / 2 - 6.3 * MM, 1.8 * MM)))
    for sx in (-1, 1):
        root.screw((sx * (hw / 2 + 2.5 * MM), -hw / 2, 9 * MM), (0, 1, 0), d=2 * MM)
        root.screw((sx * (hw / 2 + 2.5 * MM), -hw / 2, 21 * MM), (0, 1, 0), d=2 * MM)
    # lens barrel: stepped profile with knurled focus ring
    z0 = 30 * MM
    prof = [(0, z0), (20 * MM, z0), (20 * MM, z0 + 6 * MM), (21.5 * MM, z0 + 6.5 * MM), (21.5 * MM, z0 + 8 * MM)]
    for i in range(30):   # knurled focus ring
        prof.append(((21.5 if i % 2 else 22.2) * MM, z0 + 8 * MM + i * 0.6 * MM))
    prof += [(21.5 * MM, z0 + 26 * MM), (20 * MM, z0 + 27 * MM), (20 * MM, z0 + 70 * MM), (21 * MM, z0 + 71 * MM), (21 * MM, z0 + 74 * MM), (0, z0 + 74 * MM)]
    root.add("al_black_anod", lathe(prof, 48, axis=(0, 0, 1)))
    root.add("accent_payload", ring(20.02 * MM, 20.6 * MM, 2 * MM, axis=(0, 0, 1), pos=(0, 0, z0 + 40 * MM), seg=48))
    root.add("al_bead", ring(20.02 * MM, 20.4 * MM, 1 * MM, axis=(0, 0, 1), pos=(0, 0, z0 + 3 * MM), seg=48))
    # front: recessed front element, retaining ring, internal baffle rings, deeper elements visible
    zf = z0 + 74 * MM
    root.add("baffle_black", lathe([(17 * MM, zf - 30 * MM), (19.4 * MM, zf - 30 * MM), (19.4 * MM, zf - 0.3 * MM), (17 * MM, zf - 0.3 * MM)], 48, axis=(0, 0, 1), cap=False))
    for k, (zz, rr, sag) in enumerate([(zf - 4 * MM, 16.5 * MM, 2.2 * MM), (zf - 14 * MM, 14 * MM, 1.6 * MM), (zf - 24 * MM, 12 * MM, -1.2 * MM)]):
        root.add("glass", lathe([(0, zz - 1.5 * MM), (rr, zz - 1.5 * MM), (rr, zz), (0, zz + sag)], 40, axis=(0, 0, 1)))
        root.add("al_black_anod", ring(rr - 0.8 * MM, 17.2 * MM, 1.2 * MM, axis=(0, 0, 1), pos=(0, 0, zz - 2.2 * MM), seg=40))
    # sunshade hood (fits the 50 mm panel aperture)
    zh = zf
    root.add("al_black_anod", lathe([(18.5 * MM, zh), (21 * MM, zh), (21.8 * MM, zh + 11 * MM), (20.8 * MM, zh + 11 * MM), (18.5 * MM, zh + 1 * MM)], 48, axis=(0, 0, 1), cap=False))
    root.add("baffle_black", lathe([(18.5 * MM, zh + 1 * MM), (20.8 * MM, zh + 11 * MM), (20.5 * MM, zh + 11 * MM), (18.2 * MM, zh + 1 * MM)], 48, axis=(0, 0, 1), cap=False))
    root.mount("mount_aperture", (0, 0, zh + 11 * MM))


@part("ir_spectrometer", "IR point spectrometer: gold optical bench, square telescope baffle, Stirling cryocooler",
      1, "payload", "optical axis at rear face of the bench; boresight +Z")
def b_irs(root):
    # bench box: x -34..+18 mm around the optical axis, 52 x 54 x 62
    bx0, bx1, bh, bl = -34 * MM, 18 * MM, 54 * MM, 62 * MM
    cx = (bx0 + bx1) / 2
    root.add("al_alodine", rbox(bx1 - bx0, bh, bl, 2 * MM, (cx, 0, bl / 2)))
    root.add("al_alodine", rbox(bx1 - bx0 - 6 * MM, 1.2 * MM, bl - 6 * MM, 1 * MM, (cx, bh / 2 + 0.6 * MM, bl / 2)))   # cover
    for x in (bx0 + 4 * MM, bx1 - 4 * MM):
        for z in (4 * MM, bl / 2, bl - 4 * MM):
            root.screw((x, bh / 2 + 1.2 * MM, z), d=1.6 * MM, kind="pan")
    # gold MLI patch on the -X side of the bench
    root.add("mli_gold", rbox(1.2 * MM, bh - 8 * MM, 44 * MM, 0.5 * MM, (bx0 - 0.6 * MM, 0, 27 * MM)))
    # electronics board on top (on standoffs)
    eb = root.child("electronics", t=(cx, bh / 2 + 5 * MM, bl / 2))
    eb.add(pcb_board(46 * MM, 52 * MM, 1.2 * MM))
    c, _ = populate(np.random.default_rng(51), 46 * MM, 52 * MM, (), n_passive=30, n_ic=3, y=1.2 * MM, margin=2 * MM)
    eb.add(c)
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.add(standoff(3.8 * MM, 3.5 * MM), Tm=T((cx + sx * 19 * MM, bh / 2 + 1.2 * MM, bl / 2 + sz * 22 * MM)))
    # telescope: square baffle tube 38x38 forward of the bench, vanes, front window
    tz0, tz1, s = bl, bl + 46 * MM, 38 * MM
    tube_p = rrect(s, s, 3 * MM).difference(rrect(s - 2.4 * MM, s - 2.4 * MM, 2 * MM))
    root.add("al_black_anod", exy(tube_p, tz1 - tz0, tz0))
    for i in range(5):
        z = tz0 + 6 * MM + i * 8 * MM
        root.add("baffle_black", exy(rrect(s - 2.5 * MM, s - 2.5 * MM, 2 * MM).difference(rrect(s - 10 * MM - i * 1.2 * MM, s - 10 * MM - i * 1.2 * MM, 1 * MM)), 0.6 * MM, z))
    root.add("glass", exy(rrect(s - 10 * MM, s - 10 * MM, 1 * MM), 1.5 * MM, tz0 + 2 * MM))
    root.add("accent_payload", exy(rrect(s + 1 * MM, s + 1 * MM, 3.5 * MM).difference(rrect(s - 0.2 * MM, s - 0.2 * MM, 3 * MM)), 2 * MM, tz0 + 4 * MM))
    root.add("al_black_anod", exy(rrect(s + 6 * MM, s + 6 * MM, 3 * MM).difference(rrect(s - 0.2 * MM, s - 0.2 * MM, 3 * MM)), 2.7 * MM, tz0 + 0.3 * MM))  # flange
    # Stirling cryocooler alongside (+X), axis along Z, finned compressor + cold finger into bench
    cxr = bx1 + 17 * MM
    prof = [(0, 4 * MM), (11 * MM, 4 * MM)]
    for i in range(14):
        z = 10 * MM + i * 3 * MM
        prof += [(11 * MM, z), (14.5 * MM, z + 0.5 * MM), (14.5 * MM, z + 1.5 * MM), (11 * MM, z + 2 * MM)]
    prof += [(11 * MM, 56 * MM), (9 * MM, 60 * MM), (0, 60 * MM)]
    root.add("al_bead", lathe(prof, 36, axis=(0, 0, 1), pos=(cxr, 0, 0)))
    root.add("titanium", cyl(4 * MM, 14 * MM, axis=(1, 0, 0), pos=(bx1 + 4 * MM, 0, 30 * MM), seg=16))
    root.add("copper_braid", tube(route([(cxr, 12 * MM, 52 * MM), (cxr, 20 * MM, 58 * MM), (bx1 - 2 * MM, 26 * MM, 58 * MM)], 4 * MM), 1.6 * MM, 8))
    root.add("wire_white", tube(route([(cxr - 6 * MM, -9 * MM, 6 * MM), (cxr - 6 * MM, -20 * MM, 2 * MM), (cxr - 20 * MM, -24 * MM, -2 * MM)], 4 * MM), 1.0 * MM, 8))
    for z in (8 * MM, 48 * MM):   # cooler saddles
        root.add("al_alodine", rbox(32 * MM, 3 * MM, 6 * MM, 1 * MM, (cxr - 4 * MM, -16 * MM, z)))
    root.add("accent_payload", ring(11.05 * MM, 11.6 * MM, 3 * MM, axis=(0, 0, 1), pos=(cxr, 0, 6 * MM), seg=36))
    root.add(micro_d(15, axis=(-1, 0, 0)), Tm=T((bx0, -14 * MM, 56 * MM)))
    root.mount("mount_harness", (bx0 - 6 * MM, -14 * MM, 56 * MM))
    root.mount("mount_aperture", (0, 0, tz1))


@part("laser_reflectometer", "Laser reflectometer: central receiver telescope with spider, ring of four emitters",
      1, "payload", "rear mounting plate centre; boresight +Z")
def b_laser(root):
    root.add("al_alodine", plate(0.090, 0.090, 3 * MM, 4 * MM, axis=(0, 0, 1), holes=[(sx * 40 * MM, sz * 40 * MM, 2.6 * MM) for sx in (-1, 1) for sz in (-1, 1)]))
    # receiver: Cassegrain tube
    root.add("al_black_anod", lathe([(0, 3 * MM), (21 * MM, 3 * MM), (21 * MM, 6 * MM), (19 * MM, 7 * MM), (19 * MM, 62 * MM), (20.5 * MM, 63 * MM), (20.5 * MM, 66 * MM), (0, 66 * MM)], 48, axis=(0, 0, 1)))
    root.add("chrome", lathe([(0, 50 * MM), (17.5 * MM, 50 * MM), (17.5 * MM, 51 * MM), (0, 53 * MM)], 40, axis=(0, 0, 1)))  # primary (visible)
    root.add("baffle_black", ring(17.5 * MM, 19.1 * MM, 14.4 * MM, axis=(0, 0, 1), pos=(0, 0, 58.4 * MM), seg=40))
    for k in range(3):   # spider vanes
        a = TAU * k / 3
        v = box(0.6 * MM, 18 * MM, 2 * MM, (0, 9 * MM, 0))
        root.add("al_black_anod", mv(v, (0, 0, 64 * MM), (0, 0, a)))
    root.add("al_black_anod", cyl(5 * MM, 5 * MM, axis=(0, 0, 1), pos=(0, 0, 64 * MM), seg=24))
    root.add("chrome", cyl(4.2 * MM, 0.3 * MM, axis=(0, 0, 1), pos=(0, 0, 61.4 * MM), seg=24))
    # four emitters around the receiver
    for k in range(4):
        a = TAU * k / 4 + math.pi / 4
        x, y = 32 * MM * math.cos(a), 32 * MM * math.sin(a)
        root.add("al_black_anod", rbox(11 * MM, 11 * MM, 34 * MM, 1.5 * MM, (x, y, 20 * MM)))
        root.add("al_black_anod", lathe([(0, 37 * MM), (5 * MM, 37 * MM), (5 * MM, 50 * MM), (4.2 * MM, 51 * MM), (0, 51 * MM)], 24, axis=(0, 0, 1), pos=(x, y, 0)))
        root.add("laser_emitter", lathe([(0, 50.2 * MM), (3.6 * MM, 50.2 * MM), (3.6 * MM, 50.8 * MM), (0, 51.6 * MM)], 20, axis=(0, 0, 1), pos=(x, y, 0)))
        root.add("accent_payload", ring(5.02 * MM, 5.5 * MM, 1.5 * MM, axis=(0, 0, 1), pos=(x, y, 47 * MM), seg=24))
        root.add("coax_blue", tube(route([(x * 1.1, y * 1.1, 10 * MM), (x * 1.35, y * 1.35, 6 * MM), (x * 1.35, y * 1.35, -2 * MM)], 3 * MM), 0.9 * MM, 8))
        for s in (-1, 1):
            root.screw((x + s * 4 * MM, y, 3 * MM), (0, 0, 1), d=1.6 * MM)
    root.mount("mount_aperture", (0, 0, 66 * MM))


@part("neutron_spectrometer", "Neutron spectrometer: 2x4 bank of scintillator tubes with PMT bases + electronics box",
      1, "payload", "electronics box bottom centre")
def b_neutron(root):
    ew, ed, eh = 84 * MM, 96 * MM, 16 * MM
    root.add("al_alodine", rbox(ew, eh, ed, 2 * MM, (0, eh / 2, 0)))
    for x in (-ew / 2 + 4 * MM, ew / 2 - 4 * MM):
        for z in np.linspace(-ed / 2 + 4 * MM, ed / 2 - 4 * MM, 4):
            root.screw((x, eh, z), d=2 * MM, washer=False)
    root.add(micro_d(25, axis=(0, 0, -1)), Tm=T((0, eh / 2, -ed / 2)))
    # tube bank: 8 tubes along Z, in two rows
    R, L = 9 * MM, 80 * MM
    for i in range(4):
        for j in range(2):
            x = (-1.5 + i) * 20 * MM
            y = eh + 3 * MM + R + j * (2 * R + 2 * MM)
            root.add("al_bead", cyl(R, L, axis=(0, 0, 1), pos=(x, y, 0), seg=28, ch=0.8 * MM))
            root.add("plastic_black", cyl(R * 0.9, 10 * MM, axis=(0, 0, 1), pos=(x, y, -L / 2 - 5 * MM), seg=24, ch=0.6 * MM))  # PMT base
            root.add("accent_payload", ring(R + 0.01 * MM, R + 0.35 * MM, 4 * MM, axis=(0, 0, 1), pos=(x, y, L / 2 - 8 * MM), seg=28))
            root.add("wire_white", tube(route([(x, y, -L / 2 - 10 * MM), (x, y, -L / 2 - 15 * MM), (x * 0.5, eh + 2 * MM, -L / 2 - 17 * MM)], 4 * MM), 0.6 * MM, 6))
    # clamp frame around the bank
    for z in (-28 * MM, 28 * MM):
        fr = rrect(4 * 20 * MM + 4 * MM, 4 * R + 8 * MM, 2 * MM).difference(rrect(4 * 20 * MM - 1 * MM, 4 * R + 3 * MM, 1 * MM))
        root.add("al_black_anod", exy(fr, 4 * MM, z - 2 * MM), Tm=T((0, eh + 3 * MM + 2 * R + 1 * MM, 0)))
    # Cd/Gd foil wrap on half the tubes (thin gray sheet)
    root.add("nickel", box(4 * 20 * MM - 2 * MM, 0.3 * MM, L - 20 * MM, (0, eh + 3 * MM + 4 * R + 2.3 * MM, 0)))

# ---------------------------------------------------------------------------------------
# PROPULSION
# ---------------------------------------------------------------------------------------
def tank_sphere(r, pos=(0, 0, 0), mat="tank_ti", axis=(0, 1, 0)):
    """Spherical tank: two hemispheres with an equatorial weld band and polar bosses."""
    sp = lathe([(r * math.sin(t), -r * math.cos(t)) for t in np.linspace(0, math.pi, 17)], 32, axis, pos)
    o = {mat: [sp], "stainless": []}
    o[mat].append(ring(r - 0.5 * MM, r + 0.6 * MM, 3 * MM, axis=axis, pos=pos, seg=32))          # girth weld land
    o["stainless"].append(torus(r + 0.45 * MM, 0.35 * MM, axis=axis, pos=pos, seg=40, tseg=6))  # weld bead
    ax = np.asarray(axis, float)
    for s in (-1, 1):
        o[mat].append(cyl(4 * MM, 5 * MM, axis=axis, pos=tuple(np.asarray(pos) + s * ax * (r + 1.5 * MM)), seg=16, ch=0.5 * MM))
    return o


def solenoid_valve(axis=(0, 1, 0)):
    o = {"stainless": [lathe([(0, 0), (4 * MM, 0), (4 * MM, 3 * MM), (3 * MM, 4 * MM), (3 * MM, 14 * MM), (2 * MM, 15 * MM), (0, 15 * MM)], 20)],
         "plastic_black": [cyl(5.5 * MM, 7 * MM, pos=(0, 9 * MM, 0), seg=20, ch=0.6 * MM)],
         "wire_red": [tube(route([(4 * MM, 11 * MM, 0), (9 * MM, 12 * MM, 0), (12 * MM, 16 * MM, 3 * MM)], 3 * MM), 0.4 * MM, 6)],
         "wire_black": [tube(route([(4 * MM, 8 * MM, 1 * MM), (9 * MM, 8 * MM, 2 * MM), (12 * MM, 13 * MM, 5 * MM)], 3 * MM), 0.4 * MM, 6)],
         "accent_propulsion": [ring(5.52 * MM, 5.9 * MM, 1.5 * MM, pos=(0, 11 * MM, 0), seg=20)]}
    R = rot_y_to(axis)
    for k in o:
        for m in o[k]:
            m.apply_transform(R)
    return o


def nozzle(throat=0.6 * MM, exit_r=2.6 * MM, L=8 * MM, mat="moly_nozzle"):
    prof = [(0, 0), (3 * MM, 0), (3 * MM, 3 * MM), (throat + 0.8 * MM, 4 * MM)]
    for i in range(8):
        t = i / 7
        prof.append((throat + 0.6 * MM + (exit_r + 0.4 * MM - throat - 0.6 * MM) * t ** 0.7, 4 * MM + L * t))
    inner = [(exit_r - (exit_r - throat) * (i / 7) ** 1.3, 4 * MM + L * (1 - i / 7)) for i in range(8)]
    prof += inner + [(0, 4 * MM)]
    return {mat: [lathe(prof, 24, cap=False)]}


def fill_port(cap_mat="cover_red"):
    return {"stainless": [hexprism(8 * MM, 3 * MM, y0=0), threaded_rod(6 * MM, 5 * MM, axis=(0, 1, 0), pos=(0, 6 * MM, 0))],
            cap_mat: [cyl(4.2 * MM, 6 * MM, pos=(0, 9.5 * MM, 0), seg=16, ch=0.8 * MM)]}


@part("cold_gas_module", "Cold-gas propulsion module: two spherical Ti tanks, manifold, 4 valves, 4 canted nozzles",
      1, "propulsion", "base plate bottom centre; nozzles fire toward -Z")
def b_coldgas(root):
    W, D = 0.090, 0.095
    root.add("al_alodine", plate(W, D, 2.5 * MM, 3 * MM, cutouts=[rrect(0.030, 0.030, 4 * MM, 0, 0.02)],
                                 holes=[(sx * 41 * MM, sz * 43 * MM, 2.6 * MM) for sx in (-1, 1) for sz in (-1, 1)]))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 41 * MM, 2.5 * MM, sz * 43 * MM), d=2 * MM)
    r = 20 * MM
    for x in (-24 * MM, 24 * MM):
        root.add(tank_sphere(r, (x, 2.5 * MM + 4 * MM + r, 18 * MM), axis=(1, 0, 0)))
        # cradle saddles
        root.add("al_alodine", exy(Polygon([(-12 * MM, 0), (12 * MM, 0), (12 * MM, 9 * MM), (-12 * MM, 9 * MM)]).difference(Point(0, 4 * MM + r).buffer(r + 0.3 * MM, resolution=12)), 4 * MM, -2 * MM),
                 Tm=T((x, 2.5 * MM, 18 * MM)))
        root.add("accent_propulsion", ring(r + 0.5 * MM, r + 1.0 * MM, 1.2 * MM, axis=(1, 0, 0), pos=(x, 2.5 * MM + 4 * MM + r, 18 * MM), seg=40))
    # rear plate with 4 canted nozzles (fire -Z)
    zb = -D / 2 + 3 * MM
    root.add("al_alodine", rbox(W - 6 * MM, 50 * MM, 3 * MM, 1 * MM, (0, 2.5 * MM + 25 * MM, zb)))
    yc = 2.5 * MM + 25 * MM
    manifold = []
    for i, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
        p = np.array([sx * 30 * MM, yc + sy * 15 * MM, zb])
        cant = np.array([sx * 0.26, sy * 0.26, -1.0])
        root.add(nozzle(), Tm=T(tuple(p - np.array([0, 0, 1.5 * MM])), axis=tuple(cant)))
        root.add(solenoid_valve((0, 0, 1)), Tm=T(tuple(p + np.array([0, 0, 1.5 * MM]))))
        manifold.append(p + np.array([0, 0, 17 * MM]))
    # manifold tubing: tank outlets -> pressure regulator block -> four valves
    blk = np.array([0, yc, zb + 26 * MM])
    root.add("stainless", rbox(14 * MM, 12 * MM, 10 * MM, 1 * MM, tuple(blk)))
    root.add("stainless", cyl(3 * MM, 8 * MM, axis=(0, 1, 0), pos=tuple(blk + [0, 10 * MM, 0]), seg=16))   # pressure transducer
    root.add("plastic_black", cyl(3.6 * MM, 4 * MM, axis=(0, 1, 0), pos=tuple(blk + [0, 16 * MM, 0]), seg=16))
    for m in manifold:
        root.add("stainless", tube(route([tuple(m), tuple(m + [0, 0, 4 * MM]), tuple(blk + [np.sign(m[0]) * 7 * MM, np.sign(m[1] - yc) * 3 * MM, 0])], 4 * MM), 1.0 * MM, 8))
    for x in (-24 * MM, 24 * MM):
        top = np.array([x, 2.5 * MM + 4 * MM + 2 * r + 4 * MM, 18 * MM])
        root.add("stainless", tube(route([(x - np.sign(x) * (r + 4 * MM), top[1] - r - 4 * MM, 18 * MM), (x - np.sign(x) * (r + 8 * MM), top[1] - r - 4 * MM, 18 * MM), (np.sign(x) * 4 * MM, blk[1] + 5 * MM, 8 * MM), tuple(blk + [np.sign(x) * 4 * MM, 5 * MM, 4 * MM])], 5 * MM), 1.0 * MM, 8))
    root.add(fill_port(), Tm=T((0, 2.5 * MM, 40 * MM)))
    root.add(micro_d(15, axis=(0, 1, 0)), Tm=T((35 * MM, 2.5 * MM, 38 * MM)))
    root.mount("mount_thrust_axis", (0, yc, zb - 12 * MM), (math.pi, 0, 0))


@part("green_monoprop_module", "Green-monopropellant module: propellant tank, He pressurant COPV, latch valve, fill ports, 1 N thruster",
      1, "propulsion", "base plate bottom centre; thruster fires toward -Z")
def b_monoprop(root):
    W, D = 0.090, 0.140
    root.add("al_alodine", plate(W, D, 2.5 * MM, 3 * MM, holes=[(sx * 41 * MM, sz * 66 * MM, 2.6 * MM) for sx in (-1, 1) for sz in (-1, 1)]))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 41 * MM, 2.5 * MM, sz * 66 * MM), d=2 * MM)
    # propellant tank: cylinder + hemispherical domes along Z, with weld rings
    R, L = 26 * MM, 52 * MM
    yc = 2.5 * MM + 5 * MM + R
    prof = [(0, -L / 2 - R)]
    for t in np.linspace(-math.pi / 2, 0, 9)[1:]:
        prof.append((R * math.cos(t), -L / 2 + R * math.sin(t)))
    for t in np.linspace(0, math.pi / 2, 9)[1:]:
        prof.append((R * math.cos(t), L / 2 + R * math.sin(t)))
    root.add("tank_ti", lathe(prof, 40, axis=(0, 0, 1), pos=(-12 * MM, yc, 20 * MM)))
    for z in (-L / 2, L / 2, 0):
        root.add("stainless", torus(R + 0.3 * MM, 0.35 * MM, axis=(0, 0, 1), pos=(-12 * MM, yc, 20 * MM + z), seg=40, tseg=6))
    root.add("accent_propulsion", ring(R + 0.01 * MM, R + 0.6 * MM, 4 * MM, axis=(0, 0, 1), pos=(-12 * MM, yc, 20 * MM + 12 * MM), seg=40))
    for z in (-12 * MM, 52 * MM):   # tank straps
        root.add("al_black_anod", exy(Polygon([(-R - 4 * MM, -R - 5 * MM), (R + 4 * MM, -R - 5 * MM), (R + 4 * MM, 0), (-R - 4 * MM, 0)]).difference(Point(0, 0).buffer(R + 0.2 * MM, resolution=16)), 5 * MM, -2.5 * MM),
                 Tm=T((-12 * MM, yc, z)))
    # helium COPV: carbon-wrapped capsule with metallic bosses
    hr, hl = 11 * MM, 34 * MM
    hp = [(0, -hl / 2 - hr)] + [(hr * math.cos(t), -hl / 2 + hr * math.sin(t)) for t in np.linspace(-math.pi / 2, 0, 7)[1:]] + \
         [(hr * math.cos(t), hl / 2 + hr * math.sin(t)) for t in np.linspace(0, math.pi / 2, 7)[1:]]
    hx, hy = 30 * MM, 2.5 * MM + 4 * MM + hr
    root.add("copv_wrap", lathe(hp, 28, axis=(0, 0, 1), pos=(hx, hy, 26 * MM)))
    for s in (-1, 1):
        root.add("titanium", cyl(4 * MM, 4 * MM, axis=(0, 0, 1), pos=(hx, hy, 26 * MM + s * (hl / 2 + hr + 1.5 * MM)), seg=16, ch=0.5 * MM))
    root.add("al_black_anod", rbox(26 * MM, 4 * MM, 8 * MM, 1 * MM, (hx, 4.5 * MM, 26 * MM)))
    # latch valve, filter, pressure transducer on a manifold block at the rear
    zb = -D / 2 + 22 * MM
    blk = np.array([0, 2.5 * MM + 10 * MM, zb])
    root.add("stainless", rbox(30 * MM, 14 * MM, 14 * MM, 1.5 * MM, tuple(blk)))
    root.add(solenoid_valve((0, 1, 0)), Tm=T(tuple(blk + [-8 * MM, 7 * MM, 0])))
    root.add("stainless", cyl(3.5 * MM, 14 * MM, axis=(1, 0, 0), pos=tuple(blk + [22 * MM, 0, 0]), seg=16, ch=0.6 * MM))  # filter
    root.add("stainless", cyl(3 * MM, 9 * MM, axis=(0, 1, 0), pos=tuple(blk + [8 * MM, 11 * MM, 0]), seg=16))
    root.add("plastic_black", cyl(3.6 * MM, 4 * MM, axis=(0, 1, 0), pos=tuple(blk + [8 * MM, 17 * MM, 0]), seg=16))
    root.add("stainless", tube(route([(-12 * MM, yc - R + 2 * MM, 20 * MM - L / 2 - R + 6 * MM), (-12 * MM, blk[1] + 2 * MM, blk[2] + 14 * MM), tuple(blk + [-6 * MM, 0, 7 * MM])], 5 * MM), 1.2 * MM, 8))
    root.add("stainless", tube(route([(hx, hy, 26 * MM - hl / 2 - hr - 3 * MM), (hx, hy, blk[2] + 12 * MM), tuple(blk + [12 * MM, 0, 7 * MM])], 5 * MM), 1.0 * MM, 8))
    # fill / drain ports with red non-flight caps (prop = red, pressurant = yellow cap)
    root.add(fill_port("cover_red"), Tm=T((-30 * MM, 2.5 * MM, -D / 2 + 8 * MM)))
    root.add(fill_port("safety_yellow"), Tm=T((-16 * MM, 2.5 * MM, -D / 2 + 8 * MM)))
    # 1 N thruster: valve -> thermal standoff -> catalyst bed chamber with heater coil -> nozzle, through a heat shield
    tz = -D / 2 + 2 * MM
    root.add("al_alodine", rbox(30 * MM, 30 * MM, 2 * MM, 1 * MM, (18 * MM, 2.5 * MM + 15 * MM, tz + 1 * MM)))
    root.add("gold", cyl(13 * MM, 0.3 * MM, axis=(0, 0, 1), pos=(18 * MM, 2.5 * MM + 15 * MM, tz - 0.4 * MM), seg=32))   # gold heat shield
    th = np.array([18 * MM, 2.5 * MM + 15 * MM, tz])
    root.add(solenoid_valve((0, 0, 1)), Tm=T(tuple(th + [0, 0, 2 * MM])))
    root.add("titanium", tube([tuple(th + [0, 0, 1 * MM]), tuple(th + [0, 0, -6 * MM])], 1.2 * MM, 10))   # standoff tube
    root.add("inconel_heat", cyl(4.5 * MM, 12 * MM, axis=(0, 0, 1), pos=tuple(th + [0, 0, -12 * MM]), seg=24, ch=0.6 * MM))
    coil = [tuple(th + [4.9 * MM * math.cos(t), 4.9 * MM * math.sin(t), -7 * MM - 10 * MM * t / (8 * TAU)]) for t in np.linspace(0, 8 * TAU, 160)]
    root.add("nickel", tube(coil, 0.3 * MM, 5))
    root.add(nozzle(0.5 * MM, 3.5 * MM, 9 * MM, "inconel_heat"), Tm=T(tuple(th + [0, 0, -18 * MM]), axis=(0, 0, -1)))
    root.mount("mount_thrust_axis", tuple(th + [0, 0, -31 * MM]), (math.pi, 0, 0))


@part("ion_engine", "Iodine ion engine module (BIT-3 style): iodine tank with sight window, finned PPU, RF thruster head with grid, neutralizer",
      1, "propulsion", "thruster axis at the -Z end-frame inner face; module extends +Z, thrust exhaust -Z")
def b_ion(root):
    # base plate (bolts to end frame inner face), hole for the head
    bp = rrect(0.088, 0.074, 3 * MM, -3 * MM, 3 * MM).difference(Point(0, 0).buffer(19.5 * MM, resolution=12)).difference(Point(28 * MM, 0).buffer(5 * MM, resolution=8))
    root.add("al_alodine", exy(bp, 3 * MM, 0.2 * MM))
    for x, y in [(-44 * MM, -31 * MM), (-44 * MM, 37 * MM), (36 * MM, -31 * MM), (36 * MM, 37 * MM), (-25 * MM, 37 * MM), (15 * MM, -31 * MM)]:
        root.screw((x, y, 3.2 * MM), (0, 0, 1), d=2 * MM)
    # thruster head
    head = root.child("thruster_head")
    hp = [(0, -6.2 * MM), (14.5 * MM, -6.2 * MM), (14.5 * MM, -7.6 * MM), (17.8 * MM, -7.6 * MM), (18.6 * MM, -6.8 * MM), (18.6 * MM, 3 * MM),
          (24 * MM, 3.2 * MM), (24 * MM, 6.0 * MM), (18.6 * MM, 6.2 * MM), (18.6 * MM, 20 * MM), (16 * MM, 22 * MM), (0, 22 * MM)]
    head.add("al_black_anod", lathe(hp, 36, axis=(0, 0, 1)))
    head.add("gold", ring(18.62 * MM, 19.2 * MM, 8 * MM, axis=(0, 0, 1), pos=(0, 0, 12 * MM), seg=36))       # RF coil band
    for k in range(6):
        a = TAU * k / 6
        head.screw((21.5 * MM * math.cos(a), 21.5 * MM * math.sin(a), 6.0 * MM), (0, 0, 1), d=1.6 * MM)
    # ion optics: molybdenum screen grid with hex-packed apertures, glowing plasma behind
    gp = Point(0, 0).buffer(14.4 * MM, resolution=16)
    hexes = []
    for i in range(-6, 7):
        for j in range(-6, 7):
            x = (j + (0.5 if i % 2 else 0)) * 2.15 * MM
            y = i * 1.86 * MM
            if x * x + y * y < (12.4 * MM) ** 2:
                hexes.append(Polygon([(x + 0.72 * MM * math.cos(a), y + 0.72 * MM * math.sin(a)) for a in np.arange(6) * TAU / 6 + TAU / 12]))
    gp = gp.difference(unary_union(hexes))
    head.add("moly_nozzle", exy(gp, 0.5 * MM, -7.4 * MM))
    head.add("ion_glow", cyl(14.4 * MM, 0.4 * MM, axis=(0, 0, 1), pos=(0, 0, -6.45 * MM), seg=32))
    head.add("ceramic_white", ring(14.45 * MM, 15.2 * MM, 1.2 * MM, axis=(0, 0, 1), pos=(0, 0, -6.8 * MM), seg=32))
    # neutralizer (RF cathode) beside the head, canted toward the beam
    neu = root.child("neutralizer", t=(28 * MM, 0, 2 * MM), e=(0, -0.35, 0))
    neu.add("al_bead", lathe([(0, 0), (4 * MM, 0), (4 * MM, 8 * MM), (0, 8 * MM)], 20, axis=(0, 0, -1)))
    neu.add("ceramic_white", cyl(2.4 * MM, 1.5 * MM, axis=(0, 0, 1), pos=(0, 0, -8.7 * MM), seg=16))
    neu.add("ion_glow", cyl(1.0 * MM, 0.3 * MM, axis=(0, 0, 1), pos=(0, 0, -9.5 * MM), seg=12))
    neu.add("al_alodine", rbox(6 * MM, 10 * MM, 4 * MM, 1 * MM, (0, 0, 3 * MM)))
    # PPU: finned box in the lower half
    ppu = root.child("ppu", t=(-3 * MM, -17 * MM, 72 * MM))
    ppu.add("al_black_anod", rbox(84 * MM, 34 * MM, 90 * MM, 2 * MM))
    for i in range(10):   # heat-spreader fins on the +X side
        ppu.add("al_black_anod", rbox(3 * MM, 28 * MM, 1.6 * MM, 0.4 * MM, (43.0 * MM, 0, -40 * MM + i * 8.8 * MM)))
    ppu.add("accent_propulsion", rbox(84.4 * MM, 1.2 * MM, 90.4 * MM, 0.5 * MM, (0, 12 * MM, 0)))
    for x in (-38 * MM, 38 * MM):
        for z in (-41 * MM, 0, 41 * MM):
            ppu.screw((x, 17 * MM, z), d=2 * MM, washer=False)
    ppu.add(micro_d(15, axis=(-1, 0, 0)), Tm=T((-42 * MM, 2 * MM, 20 * MM), e=(math.pi / 2, 0, 0)))
    # iodine tank on top: rounded box, weld seams, Kapton heaters, sight window with iodine crystals
    tk = root.child("iodine_tank", t=(-3 * MM, 21 * MM, 76 * MM))
    tw, th_, tl = 80 * MM, 34 * MM, 82 * MM
    tk.add("tank_ti", rbox(tw, th_, tl, 5 * MM, seg=3))
    tk.add("stainless", rbox(tw + 0.6 * MM, 1.2 * MM, tl + 0.6 * MM, 5 * MM, seg=2))   # weld seam (equator)
    tk.add("heater", box(tw - 20 * MM, 0.2 * MM, 30 * MM, (0, -th_ / 2 - 0.1 * MM, 0)))
    tk.add("heater", box(0.2 * MM, th_ - 12 * MM, 40 * MM, (-tw / 2 - 0.1 * MM, -2 * MM, -8 * MM)))
    # sight window frame + glass + iodine crystals visible beneath
    wpos = (10 * MM, th_ / 2, 10 * MM)
    tk.add("titanium", exy(rrect(34 * MM, 26 * MM, 4 * MM).difference(rrect(24 * MM, 16 * MM, 2 * MM)), 1.6 * MM, -0.8 * MM),
           Tm=T((wpos[0], wpos[1] + 0.8 * MM, wpos[2]), e=(math.pi / 2, 0, 0)))
    tk.add("glass", rbox(25 * MM, 0.8 * MM, 17 * MM, 0.4 * MM, (wpos[0], wpos[1] + 0.2 * MM, wpos[2])))
    rng = np.random.default_rng(9)
    for _ in range(26):
        x = wpos[0] + rng.uniform(-10, 10) * MM
        z = wpos[2] + rng.uniform(-6, 6) * MM
        c = trimesh.creation.icosphere(0, rng.uniform(1.2, 2.4) * MM)
        c.vertices *= rng.uniform(0.6, 1.3, 3)
        c.apply_translation((x, wpos[1] - 2.4 * MM, z))
        tk.add("iodine", c)
    tk.add("iodine", box(23 * MM, 1.4 * MM, 15 * MM, (wpos[0], wpos[1] - 3.2 * MM, wpos[2])))
    for x in (-30 * MM, 30 * MM):
        for z in (-30 * MM, 30 * MM):
            tk.screw((x, th_ / 2, z), d=2 * MM)
    tk.add(fill_port("cover_red"), Tm=T((-tw / 2, 4 * MM, 28 * MM), axis=(-1, 0, 0)))
    # feed line tank -> flow-control valve -> head, with heater tape
    fl = route([(-20 * MM, 4 * MM, 35 * MM), (-20 * MM, 4 * MM, 26 * MM), (-8 * MM, 4 * MM, 23 * MM), (-4 * MM, 3 * MM, 18 * MM)], 4 * MM)
    root.add("stainless", tube(fl, 1.2 * MM, 8))
    root.add(solenoid_valve((0, 1, 0)), Tm=T((-28 * MM, 5.5 * MM, 30 * MM), axis=(0, 1, 0)))
    root.add("kapton", tube(fl[1: len(fl) // 2 + 1], 1.5 * MM, 8))
    # RF power coax PPU -> head
    root.add("coax_blue", tube(route([(10 * MM, 0, 26 * MM), (12 * MM, 1 * MM, 22 * MM), (16 * MM, 8 * MM, 14 * MM), (18.6 * MM, 10 * MM, 12 * MM)], 4 * MM), 1.3 * MM, 8))
    # side brackets tying base plate to PPU/tank
    for x in (-44 * MM, 37 * MM):
        root.add("al_alodine", rbox(3 * MM, 12 * MM, 112 * MM, 1 * MM, (x, 1 * MM, 59 * MM)))
    root.mount("mount_thrust_axis", (0, 0, -7.6 * MM), (math.pi, 0, 0))
    root.mount("mount_end_frame", (0, 0, 0))

# ---------------------------------------------------------------------------------------
# POWER, COMMS, THERMAL
# ---------------------------------------------------------------------------------------
WING_W, WING_L, WING_T, WING_GAP = 0.194, 0.330, 1.6 * MM, 0.5 * MM
WING_P = WING_T + WING_GAP
WING_HOLD_Z = (-0.12, 0.12)


def wing_panel(node, x0, yoff, holes_x, seed):
    """One solar panel in a hinge node's frame: spans x0..x0+W (minus hinge gaps), y centred at yoff."""
    g = 1.5 * MM
    w = WING_W - 2 * g
    cx = x0 + g + w / 2
    hole = [(hx, hz, 4.4 * MM) for hx in holes_x for hz in WING_HOLD_Z]
    sub = plate(w, WING_L, 1.15 * MM, 2 * MM, holes=[(hx - cx, hz, d) for hx, hz, d in hole])
    node.add("cfrp", mv(sub, (cx, yoff - WING_T / 2, 0)))
    # cell strings (two strings per panel), cover glass with textured cells, interconnect bars
    cells = rrect(w - 6 * MM, WING_L - 12 * MM, 1 * MM)
    for hx, hz, d in hole:
        cells = cells.difference(Point(hx - cx, hz).buffer(6 * MM, resolution=6))
    node.add("solar", extrude(cells, 0.35 * MM, pos=(cx, yoff - WING_T / 2 + 1.2 * MM, 0)))
    for z in (-WING_L / 2 + 4 * MM, WING_L / 2 - 4 * MM):
        node.add("nickel", box(w - 10 * MM, 0.15 * MM, 2.5 * MM, (cx, yoff - WING_T / 2 + 1.22 * MM, z)))
    # back side: gold Kapton harness strips + bypass diode boards
    for z in (-0.06, 0.06):
        node.add("kapton", box(w - 30 * MM, 0.1 * MM, 2.5 * MM, (cx, yoff - WING_T / 2 - 0.05 * MM, z)))
    # hold-down grommets
    for hx, hz, d in hole:
        node.add("stainless", ring(2.2 * MM, 3.4 * MM, WING_T + 0.1 * MM, pos=(hx, yoff, hz), seg=14))


def hinge_knuckles(node, x, y, zs, r=1.5 * MM, L=10 * MM, mat="titanium"):
    for z in zs:
        node.add(mat, cyl(r, L, axis=(0, 0, 1), pos=(x, y, z), seg=14, ch=0.3 * MM))


def build_wing(root, sg):
    """sg=+1: stack builds toward +Y (wing lies on a +Y-facing body surface).
    sg=-1: stack builds toward -Y (mirror-stacked variant); cells still face +Y when deployed."""
    W, p = WING_W, WING_P
    for z in (-0.107, 0.107):
        root.add("al_hard_anod", rbox(8 * MM, 2.2 * MM, 22 * MM, 1 * MM, (0.5 * MM, sg * (-2.3 * MM + 1.1 * MM), z)))
        hinge_knuckles(root, 0, 0, (z - 7 * MM, z + 7 * MM), L=6 * MM)
        root.screw((3 * MM, sg * 0.7 * MM, z - 7 * MM), (0, sg, 0), d=1.6 * MM, kind="pan")
    for z in WING_HOLD_Z:
        hx = -W + 8 * MM
        root.add("al_black_anod", cyl(4.5 * MM, 1.2 * MM, pos=(hx, sg * (-2.3 * MM + 0.6 * MM), z), seg=20, ch=0.3 * MM))   # cup
        top = 2 * p + WING_T / 2 + 0.6 * MM
        root.add("plastic_white", cyl(1.0 * MM, top + 2.3 * MM - 1.2 * MM, pos=(hx, sg * (-1.1 * MM + top) / 2, z), seg=10))  # Dyneema tie-down
        root.add("stainless", cyl(3.0 * MM, 0.5 * MM, pos=(hx, sg * (2 * p + WING_T / 2 + 0.3 * MM), z), seg=16))   # cap washer
        root.add("ceramic", rbox(5 * MM, 1.0 * MM, 3 * MM, 0.3 * MM, (hx - 7 * MM, sg * (-2.3 * MM + 0.5 * MM), z)))  # burn resistor
    root.add("kapton", rbox(6 * MM, 0.3 * MM, 14 * MM, 0.1 * MM, (-1 * MM, sg * -2.1 * MM, 0.0)))   # flex harness tab
    h1 = root.child("hinge_1", extras={"stowed": [0, 0, math.pi]})
    wing_panel(h1, 0.0, 0.0, [W - 8 * MM], 1)
    h2 = h1.child("hinge_2", t=(W, -sg * p / 2, 0), extras={"stowed": [0, 0, -math.pi]})
    wing_panel(h2, 0.0, sg * p / 2, [8 * MM], 2)
    h3 = h2.child("hinge_3", t=(W, sg * p, 0), extras={"stowed": [0, 0, math.pi]})
    wing_panel(h3, 0.0, -sg * p / 2, [W - 8 * MM], 3)
    for node, zs, yo in ((h1, (-0.107, 0.107), 0.0), (h2, (-0.10, 0.10), sg * p / 2), (h3, (-0.10, 0.10), -sg * p / 2)):
        for z in zs:
            hinge_knuckles(node, 0, 0, (z,), L=7 * MM)
            node.add("titanium", rbox(5 * MM, 0.6 * MM, 7 * MM, 0.2 * MM, (3 * MM, yo + 0.9 * MM, z)))
    for node, zs, y, ky in ((h1, (-0.10, 0.10), 0.0, -sg * p / 2), (h2, (-0.10, 0.10), sg * p / 2, sg * p)):
        for z in zs:   # far-edge knuckles that mate with the next hinge
            hinge_knuckles(node, W, ky, (z - 8 * MM, z + 8 * MM), L=6 * MM)
            node.add("titanium", rbox(5 * MM, 0.6 * MM, 22 * MM, 0.2 * MM, (W - 3 * MM, y - 0.9 * MM, z)))
    for n, zz in ((h1, -0.107), (h2, -0.10), (h3, -0.10)):   # torsion springs on each hinge line
        P = [(1.9 * MM * math.cos(t), 1.9 * MM * math.sin(t), zz + 4.2 * MM + 2.4 * MM * t / (4 * TAU)) for t in np.linspace(0, 4 * TAU, 64)]
        n.add("stainless", tube(P, 0.25 * MM, 5))
    root.mount("mount_body", (1 * MM, sg * -2.3 * MM, 0))
    return {"stowed_stack_height_m": round(2 * p + WING_T + 0.0009, 4), "stack_direction": "+Y" if sg > 0 else "-Y"}


@part("solar_wing", "Deployable solar wing: 3 hinged panels of triple-junction cells, spring hinges, burn-wire hold-downs",
      1, "power", "root hinge axis (Z) at panel mid-thickness; deployed panels extend +X, cells face +Y; stows toward +Y")
def b_wing(root):
    return build_wing(root, +1)


@part("solar_wing_mirror", "Deployable solar wing, mirror-stacked variant (stows toward -Y, cells still face +Y deployed)",
      1, "power", "root hinge axis (Z) at panel mid-thickness; deployed panels extend +X, cells face +Y; stows toward -Y")
def b_wing_m(root):
    return build_wing(root, -1)


@part("patch_antenna", "S-band patch antenna: ceramic patch on ground plane, SMA feed", 1, "comms",
      "ground-plane back face centre; boresight +Y")
def b_patch(root):
    root.add("al_alodine", plate(0.050, 0.050, 1.5 * MM, 3 * MM, holes=[(sx * 21 * MM, sz * 21 * MM, 2.2 * MM) for sx in (-1, 1) for sz in (-1, 1)]))
    root.add("ceramic_white", rbox(36 * MM, 3 * MM, 36 * MM, 0.8 * MM, (0, 1.5 * MM + 1.5 * MM, 0)))
    root.add("gold", box(26 * MM, 0.1 * MM, 26 * MM, (0, 4.55 * MM, 0)))
    root.add("gold", cyl(0.7 * MM, 0.2 * MM, pos=(5 * MM, 4.65 * MM, 0), seg=10))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 21 * MM, 1.5 * MM, sz * 21 * MM), d=2 * MM, kind="pan")
    root.add(sma((0, -1, 0)), Tm=T((5 * MM, 0, 0)))
    root.add("accent_comms", ring(3.3 * MM, 4.4 * MM, 0.6 * MM, axis=(0, 1, 0), pos=(5 * MM, -3.8 * MM, 0), seg=14))


@part("dish_antenna", "Deployable X-band dish (150 mm): ribbed reflector, gold feed horn on struts, hinge arm",
      1, "comms", "hinge base mounting face centre; dish deployed facing +Y")
def b_dish(root):
    root.add("al_black_anod", rbox(24 * MM, 4 * MM, 30 * MM, 1.5 * MM, (0, 2 * MM, 0)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 8 * MM, 4 * MM, sz * 11 * MM), d=2 * MM)
    for z in (-9 * MM, 9 * MM):
        root.add("al_black_anod", rbox(6 * MM, 10 * MM, 4 * MM, 1 * MM, (0, 8 * MM, z)))
    root.add("titanium", cyl(2.5 * MM, 26 * MM, axis=(0, 0, 1), pos=(0, 11 * MM, 0), seg=16))
    arm = root.child("arm_hinge", t=(0, 11 * MM, 0), extras={"stowed": [0, 0, -math.pi / 2]})
    arm.add("al_black_anod", cyl(4 * MM, 10 * MM, axis=(0, 0, 1), seg=20))
    arm.add("cfrp", tube([(0, 0, 0), (0, 60 * MM, 0)], 3.5 * MM, 12))
    R, F = 75 * MM, 55 * MM
    dish = arm.child("dish", t=(0, 64 * MM, 0))
    prof_out = []
    for i in range(14):
        r = R * i / 13
        prof_out.append((r, r * r / (4 * F)))
    shell = [(r, y - 0.8 * MM) for r, y in prof_out] + [(r, y) for r, y in prof_out[::-1]]
    dish.add("white_paint", lathe([(0, -0.8 * MM)] + shell[1:-1] + [(0, 0)], 56, cap=False))
    dish.add("al_bead", torus(R, 1.0 * MM, pos=(0, R * R / (4 * F) - 0.4 * MM, 0), seg=56, tseg=6))
    for k in range(8):    # back ribs
        a = TAU * k / 8
        pts = [(r * math.cos(a), r * r / (4 * F) - 1.6 * MM, r * math.sin(a)) for r in np.linspace(8 * MM, R - 2 * MM, 10)]
        dish.add("cfrp", tube(pts, 1.0 * MM, 6))
    dish.add("al_black_anod", cyl(9 * MM, 6 * MM, pos=(0, -2.5 * MM, 0), seg=24, ch=0.8 * MM))
    # feed horn at focus on 3 struts
    for k in range(3):
        a = TAU * k / 3
        dish.add("cfrp", tube([(0.9 * R * math.cos(a), (0.9 * R) ** 2 / (4 * F), 0.9 * R * math.sin(a)), (4 * MM * math.cos(a), F - 8 * MM, 4 * MM * math.sin(a))], 0.9 * MM, 6))
    dish.add("gold", lathe([(0, F - 12 * MM), (5 * MM, F - 12 * MM), (5 * MM, F - 6 * MM), (9 * MM, F), (8.4 * MM, F), (4.4 * MM, F - 6 * MM), (0, F - 6 * MM)], 24))
    dish.add("coax_blue", tube([(0, -5 * MM, 0), (0, -12 * MM, 6 * MM), (0, -20 * MM, 6 * MM)], 1.2 * MM, 8))
    dish.add("accent_comms", ring(9.02 * MM, 9.6 * MM, 2 * MM, pos=(0, -2.5 * MM, 0), seg=24))


@part("uhf_antenna", "Deployable UHF dipole: tape-spring elements with burn-wire release, stowed flat along the panel",
      1, "comms", "mounting face centre; local +Y outward, elements deploy along +-X")
def b_uhf(root):
    root.add("al_black_anod", rbox(48 * MM, 3.2 * MM, 18 * MM, 1.2 * MM, (0, 1.6 * MM, 0)))
    for sx in (-1, 1):
        root.screw((sx * 21 * MM, 3.2 * MM, -5 * MM), d=1.6 * MM, kind="pan")
        root.add("ceramic", rbox(4 * MM, 0.8 * MM, 2 * MM, 0.3 * MM, (sx * 10 * MM, 3.6 * MM, 4 * MM)))   # burn resistors
    root.add("plastic_white", tube([(-12 * MM, 3.8 * MM, 4 * MM), (12 * MM, 3.8 * MM, 4 * MM)], 0.3 * MM, 6))
    root.add(sma((0, -1, 0)), Tm=T((0, 0, 4 * MM), e=(0, 0, 0)))
    root.add("accent_comms", rbox(6 * MM, 0.4 * MM, 3 * MM, 0.2 * MM, (0, 3.3 * MM, -6 * MM)))
    L = 0.170
    for sx, name in ((1, "element_a"), (-1, "element_b")):
        el = root.child(name, t=(sx * 18 * MM, 4.2 * MM, -8 * MM), extras={"stowed": [0, sx * math.pi / 2, 0]})
        arc = Polygon([(math.sin(t) * 6 * MM, (1 - math.cos(t)) * 6 * MM) for t in np.linspace(-0.6, 0.6, 9)] +
                      [(math.sin(t) * 5.85 * MM, (1 - math.cos(t)) * 5.85 * MM + 0.15 * MM) for t in np.linspace(0.6, -0.6, 9)])
        tape = exy(arc, L, 0)
        tape.apply_transform(trimesh.transformations.rotation_matrix(sx * math.pi / 2, [0, 1, 0]))
        el.add("stainless", tape)
        el.add("al_black_anod", rbox(5 * MM, 2 * MM, 9 * MM, 0.5 * MM, (0, 0, 0)))
        el.add("plastic_white", cyl(1.8 * MM, 1.5 * MM, axis=(1, 0, 0), pos=(sx * (L - 0.8 * MM), 0.5 * MM, 0), seg=10))  # tip cap


def crinkle_plate(w, d, t, amp, n, seed, mat):
    """Closed slab w x d with a crinkled (noisy) top surface - used for MLI."""
    rng = np.random.default_rng(seed)
    nx, nz = n, max(3, int(n * d / w))
    xs, zs = np.linspace(-w / 2, w / 2, nx), np.linspace(-d / 2, d / 2, nz)
    X, Z = np.meshgrid(xs, zs, indexing="ij")
    H = np.zeros_like(X)
    for k in range(5):
        fx, fz = rng.uniform(15, 70, 2)
        H += rng.uniform(0.3, 1.0) * np.sin(X * fx + rng.uniform(0, TAU)) * np.sin(Z * fz + rng.uniform(0, TAU))
    H += 0.6 * np.abs(np.sin(X * 90 + Z * 40 + rng.uniform(0, 6)))
    H = H / np.abs(H).max() * amp
    edge = np.minimum.outer(np.minimum(np.arange(nx), np.arange(nx)[::-1]), np.minimum(np.arange(nz), np.arange(nz)[::-1]))
    H *= np.clip(edge / 3.0, 0, 1)
    top = np.stack([X, t + H, Z], -1).reshape(-1, 3)
    bot = np.stack([X, np.zeros_like(X), Z], -1).reshape(-1, 3)
    V = np.vstack([top, bot])
    F = []
    idx = lambda i, j, b=0: b * nx * nz + i * nz + j
    for i in range(nx - 1):
        for j in range(nz - 1):
            a, b_, c, e = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            F += [[a, e, c], [a, c, b_]]
            a, b_, c, e = idx(i, j, 1), idx(i + 1, j, 1), idx(i + 1, j + 1, 1), idx(i, j + 1, 1)
            F += [[a, c, e], [a, b_, c]]
    border = [(i, 0) for i in range(nx)] + [(nx - 1, j) for j in range(1, nz)] + [(i, nz - 1) for i in range(nx - 2, -1, -1)] + [(0, j) for j in range(nz - 2, 0, -1)]
    for k in range(len(border)):
        (i0, j0), (i1, j1) = border[k], border[(k + 1) % len(border)]
        a, b_ = idx(i0, j0), idx(i1, j1)
        c, e = idx(i1, j1, 1), idx(i0, j0, 1)
        F += [[a, b_, c], [a, c, e]]
    m = tm(V, F)
    m.fix_normals()
    return {mat: [m]}


@part("mli_blanket", "MLI blanket: crinkled aluminised-Kapton outer layer, sewn binding, Velcro tabs, grounding strap",
      1, "thermal", "inside bottom-front corner of the blanket (wraps a 95 x 80 x 130 mm box)")
def b_mli(root):
    W, H, D = 0.095, 0.080, 0.130
    t = 2.5 * MM
    root.add(crinkle_plate(W, D, t, 1.4 * MM, 26, 1, "mli_gold"), Tm=T((W / 2, H, D / 2)))
    root.add(crinkle_plate(H, D, t, 1.2 * MM, 22, 2, "mli_gold"), Tm=T((W, H / 2, D / 2), e=(0, 0, -math.pi / 2)))
    root.add(crinkle_plate(H, D, t, 1.2 * MM, 22, 3, "mli_gold"), Tm=T((0, H / 2, D / 2), e=(0, 0, math.pi / 2)))
    root.add(crinkle_plate(W, H, t, 1.0 * MM, 24, 4, "mli_gold"), Tm=T((W / 2, H / 2, D), e=(math.pi / 2, 0, 0)))
    # binding tape along the folded edges (silver Kapton tape)
    e = 0.6 * MM   # keep tape ends off the blanket's cut edges
    for path in ([(0, H, e), (0, H, D - e)], [(W, H, e), (W, H, D - e)], [(e, H, D), (W - e, H, D)], [(0, e, D), (0, H - e, D)], [(W, e, D), (W, H - e, D)]):
        root.add("mli_silver", tube(path, 2.2 * MM, 8))
    # sewn hems on the open edges: flat silver binding strips
    for c, size in (((-0.8 * MM, 1.8 * MM, D / 2 + 1.2 * MM), (3.6 * MM, 3 * MM, D - 3.4 * MM)), ((W + 0.8 * MM, 1.8 * MM, D / 2 + 1.2 * MM), (3.6 * MM, 3 * MM, D - 3.4 * MM)),
                    ((W / 2, 1.8 * MM, D + 0.8 * MM), (W - 4.0 * MM, 2.6 * MM, 3.6 * MM)), ((-0.8 * MM, H / 2 + 1.4 * MM, 1.8 * MM), (3.0 * MM, H - 3.6 * MM, 3 * MM)),
                    ((W + 0.8 * MM, H / 2 + 1.4 * MM, 1.8 * MM), (3.0 * MM, H - 3.6 * MM, 3 * MM)), ((W / 2, H + 0.8 * MM, 1.8 * MM), (W - 4.0 * MM, 3.6 * MM, 2.6 * MM))):
        root.add("mli_silver", rbox(size[0], size[1], size[2], 0.6 * MM, c))
    # Velcro tabs at the bottom edges and a grounding strap with ring lug
    for z in (0.025, 0.105):
        for x in (-1.9 * MM, W + 1.9 * MM):
            root.add("velcro_black", rbox(3 * MM, 14 * MM, 18 * MM, 1 * MM, (x, 7.3 * MM, z)))
    root.add("copper_braid", tube(route([(W + 2 * MM, 20 * MM, 0.06), (W + 5 * MM, 8 * MM, 0.07), (W + 6 * MM, -4 * MM, 0.08)], 4 * MM), 1.2 * MM, 8))
    root.add("nickel", ring(1.6 * MM, 3.2 * MM, 0.6 * MM, axis=(1, 0, 0), pos=(W + 6 * MM, -7 * MM, 0.08), seg=12))
    root.add("accent_thermal", rbox(10 * MM, 0.6 * MM, 6 * MM, 0.3 * MM, (W / 2, H + t + 1.8 * MM, 0.02)))


@part("radiator_panel", "Radiator panel (-X face): white-painted area, UHF mount, inner copper heat straps and heaters",
      1, "thermal", "panel inner-face centre (same frame as face_panels/panel_nx); local +Y outward")
def b_radiator(root):
    w, d = 0.083, 0.351
    holes = _panel_holes_screws(root, w, d, pitch=0.05, y=PT + 0.15 * MM)
    p = plate(w, d, PT, 2 * MM, holes=[(x, z, 1.0 * MM) for x, z, _ in holes] + [(0, 0.128, 11 * MM)])
    root.add("al_alodine", p)
    paint = rrect(w - 14 * MM, 0.23, 3 * MM, 0, -0.055)
    root.add("white_paint", extrude(paint, 0.15 * MM, y0=PT))
    root.add("accent_thermal", extrude(rrect(w - 14 * MM, 0.004, 0.5 * MM, 0, 0.0625), 0.2 * MM, y0=PT))
    # inner side: bonded copper doublers, braided heat straps, Kapton heaters
    for z in (-0.12, -0.06, 0.0):
        root.add("copper", rbox(30 * MM, 1.2 * MM, 18 * MM, 0.5 * MM, (0, -0.6 * MM, z)))
        root.screw((-10 * MM, -1.2 * MM, z), (0, -1, 0), d=2 * MM, washer=True)
        path = route([(4 * MM, -1.6 * MM, z), (4 * MM, -3.5 * MM, z + 0.012), (4 * MM, -5.2 * MM, z + 0.030)], 6 * MM)
        for dx in (-3 * MM, 0, 3 * MM):
            root.add("copper_braid", tube(path + np.array([dx, 0, 0]), 0.9 * MM, 6))
        root.add("copper", rbox(14 * MM, 1.6 * MM, 8 * MM, 0.5 * MM, (4 * MM, -6.0 * MM, z + 0.032)))   # end lug
    for z in (-0.15, -0.09, -0.03):
        root.add("heater", box(24 * MM, 0.2 * MM, 22 * MM, (-22 * MM if z != -0.09 else 22 * MM, -0.1 * MM, z)))
    root.mount("mount_uhf", (0, PT + 0.15 * MM, 0.124))
    root.mount("mount_heat_straps", (4 * MM, -6.8 * MM, -0.03))


@part("heater_pads", "Kapton film heaters (set of 3) with lead wires and connectors, on a release liner",
      1, "thermal", "release-liner bottom centre")
def b_heaters(root):
    root.add("plastic_white", rbox(0.110, 0.4 * MM, 0.080, 1 * MM, (0, 0.2 * MM, 0)))
    for i, (w, d, x, z) in enumerate([(40 * MM, 30 * MM, -28 * MM, -16 * MM), (30 * MM, 20 * MM, 18 * MM, -20 * MM), (60 * MM, 20 * MM, -10 * MM, 18 * MM)]):
        root.add("heater", rbox(w, 0.25 * MM, d, 0.12 * MM, (x, 0.53 * MM, z)))
        root.add("copper", box(4 * MM, 0.12 * MM, 3 * MM, (x + w / 2 - 3 * MM, 0.71 * MM, z - d / 2 + 2.5 * MM)))
        a = np.array([x + w / 2 - 3 * MM, 0.9 * MM, z - d / 2 + 2.5 * MM])
        for k, m in enumerate(("wire_red", "wire_white")):
            path = route([tuple(a + [k * 1.6 * MM, 0, 0]), tuple(a + [8 * MM + k * 1.6 * MM, 0.4 * MM, -4 * MM]), tuple(a + [14 * MM + k * 1.6 * MM, 1.0 * MM, -12 * MM])], 3 * MM)
            root.add(m, tube(path, 0.4 * MM, 6))
        root.add("plastic_white", rbox(5 * MM, 2.6 * MM, 4 * MM, 0.4 * MM, tuple(a + [15 * MM, 1.4 * MM, -15 * MM])))
        root.add("accent_thermal", box(2 * MM, 0.12 * MM, 2 * MM, (x - w / 2 + 3 * MM, 0.71 * MM, z + d / 2 - 3 * MM)))

# ---------------------------------------------------------------------------------------
# ADDED SPACECRAFT PART: RBF / umbilical access port (-Z face)
# ---------------------------------------------------------------------------------------
@part("access_port_rbf", "Access port: remove-before-flight inhibit pin socket + umbilical charge/test connector",
      1, "power", "outer face of the -Z panel at the port cutout centre; local +Y = outward")
def b_access(root):
    root.add("al_black_anod", plate(0.032, 0.032, 1.2 * MM, 2.5 * MM, cutouts=[rrect(0.020, 0.022, 1.5 * MM)]))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.screw((sx * 13 * MM, 1.2 * MM, sz * 13 * MM), d=1.6 * MM, kind="pan")
    # recessed body behind the panel (fits inside the end-frame pocket)
    root.add("al_black_anod", rbox(20 * MM, 14 * MM, 18 * MM, 1.5 * MM, (0, -7.4 * MM, 0)))
    root.add("al_bead", rbox(18 * MM, 0.6 * MM, 20 * MM, 1 * MM, (0, -0.2 * MM, 0)))
    # RBF socket (left) with the inhibit pin inserted, umbilical micro-D (right)
    root.add("stainless", ring(2.2 * MM, 3.6 * MM, 2.0 * MM, pos=(-4.5 * MM, 0.6 * MM, 0), seg=20, ch=0.3 * MM))
    pin = root.child("rbf_pin", t=(-4.5 * MM, 0, 0), extras={"removed_offset_m": [0, 0.05, 0]})
    pin.add("stainless", cyl(1.6 * MM, 14 * MM, pos=(0, -5 * MM, 0), seg=14))
    pin.add("cover_red", lathe([(0, 1.6 * MM), (3.4 * MM, 1.6 * MM), (3.4 * MM, 3.4 * MM), (2.6 * MM, 4.4 * MM), (0, 4.4 * MM)], 20))
    pin.add("stainless", torus(2.6 * MM, 0.45 * MM, axis=(0, 1, 0), pos=(0, 4.9 * MM, 0), seg=16, tseg=6))   # pull ring, folded flat
    root.add(micro_d(9, axis=(0, 1, 0)), Tm=T((4.5 * MM, -5.6 * MM, 0), e=(0, math.pi / 2, 0)))
    root.add("accent_power", rbox(4 * MM, 0.3 * MM, 2 * MM, 0.2 * MM, (-4.5 * MM, 1.3 * MM, 8 * MM)))

# ---------------------------------------------------------------------------------------
# TIER 2: LAUNCH INTEGRATION
# ---------------------------------------------------------------------------------------
DEP_IN = (0.1165, 0.0525)     # deployer inner half-widths (X, Y) - rails contact the CubeSat rails
DEP_Z0, DEP_Z1 = -0.200, 0.196


def ribbed_wall(node, w, h, t, axis_n, pos, rib=5 * MM, pitch=0.08, mat="al_alodine", e=(0, 0, 0)):
    """Machined wall plate (w x h, thickness t, normal along local +Y) with an external rib grid."""
    sub = node.child("wall", t=pos, e=e)
    sub.add(mat, rbox(w, t, h, 0.8 * MM, (0, t / 2, 0)))
    nx, nz = max(1, int(w / pitch)), max(1, int(h / pitch))
    for i in range(nx + 1):
        x = -w / 2 + 3 * MM + (w - 6 * MM) * i / nx
        sub.add(mat, rbox(3 * MM, rib, h - 2 * MM, 0.8 * MM, (x, t + rib / 2, 0)))
    for j in range(nz + 1):
        z = -h / 2 + 3 * MM + (h - 6 * MM) * j / nz
        sub.add(mat, rbox(w - 2 * MM, rib * 0.8, 3 * MM, 0.8 * MM, (0, t + rib * 0.4, z)))
    return sub


def build_deployer(root, is_open):
    ix, iy = DEP_IN
    t = 2.5 * MM
    L = DEP_Z1 - DEP_Z0
    zc = (DEP_Z0 + DEP_Z1) / 2
    Lw = L - 0.8 * MM
    ribbed_wall(root, 2 * ix + 2 * t, Lw, t, None, (0, iy, zc))                                  # top (+Y)
    ribbed_wall(root, 2 * ix + 2 * t, Lw, t, None, (0, -iy, zc), e=(math.pi, 0, 0))              # bottom
    ribbed_wall(root, 2 * iy - 0.4 * MM, Lw, t, None, (ix, 0, zc), e=(0, 0, -math.pi / 2))        # +X
    ribbed_wall(root, 2 * iy - 0.4 * MM, Lw, t, None, (-ix, 0, zc), e=(0, 0, math.pi / 2))        # -X
    # internal guide rails (hard anodised L-angles in the four corners)
    for sx in (-1, 1):
        for sy in (-1, 1):
            L_ang = unary_union([sbox(ix - 10 * MM, iy - 1.6 * MM, ix, iy), sbox(ix - 1.6 * MM, iy - 10 * MM, ix, iy)])
            root.add("al_hard_anod", exy(affinity.scale(L_ang, sx, sy, origin=(0, 0)), L - 8 * MM, DEP_Z0 + 4 * MM))
    # back plate + spring housing
    root.add("al_alodine", rbox(2 * ix + 12 * MM, 2 * iy + 12 * MM, 5 * MM, 2 * MM, (0, 0, DEP_Z0 - 2.5 * MM)))
    root.add("al_black_anod", cyl(32 * MM, 14 * MM, axis=(0, 0, 1), pos=(0, 0, DEP_Z0 - 12 * MM), seg=40, ch=1.5 * MM))
    for sx in (-1, 1):
        for sy in (-1, 1):
            root.screw((sx * (ix - 10 * MM), sy * (iy - 8 * MM), DEP_Z0 - 5 * MM), (0, 0, -1), d=3 * MM)
    # pusher plate + main spring (compressed when closed, extended when open)
    pz = -0.1845 if not is_open else 0.150
    pu = root.child("pusher_plate", t=(0, 0, pz), extras={"stowed_z_m": -0.1845, "deployed_z_m": 0.150})
    pu.add("al_hard_anod", rbox(2 * ix - 22 * MM, 2 * iy - 22 * MM, 4 * MM, 2 * MM, (0, 0, -2 * MM)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            pu.add("plastic_white", rbox(12 * MM, 12 * MM, 5.6 * MM, 1 * MM, (sx * (ix - 12 * MM), sy * (iy - 12 * MM), -3.2 * MM)))   # rail shoes
    pu.add("al_bead", cyl(24 * MM, 3 * MM, axis=(0, 0, 1), pos=(0, 0, -5.5 * MM), seg=32))
    turns = 8
    zs, ze = DEP_Z0 - 1 * MM, pz - 7 * MM
    P = [(26 * MM * math.cos(a), 26 * MM * math.sin(a), zs + (ze - zs) * a / (turns * TAU)) for a in np.linspace(0, turns * TAU, turns * 24)]
    root.add("fastener", tube(P, 2.0 * MM, 6))
    # front frame and door
    fr = rrect(2 * ix + 16 * MM, 2 * iy + 16 * MM, 3 * MM).difference(rrect(2 * ix - 2 * MM, 2 * iy - 2 * MM, 2 * MM))
    root.add("al_alodine", exy(fr, 6 * MM, DEP_Z1 - 6 * MM))
    hx = -ix - 8 * MM
    for y in (-30 * MM, 0, 30 * MM):
        root.add("stainless", cyl(3 * MM, 8 * MM, axis=(0, 1, 0), pos=(hx, y + 8 * MM, DEP_Z1 + 3 * MM), seg=14))
    door_e = (0, -1.92, 0) if is_open else (0, 0, 0)
    dr = root.child("door", t=(hx, 0, DEP_Z1 + 3 * MM), e=door_e,
                    extras={"stowed": [0, 0, 0]} if is_open else {"stowed": [0, 0, 0], "deployed": [0, -1.92, 0]})
    dw, dh = 2 * ix + 20 * MM, 2 * iy + 18 * MM
    dr.add("al_alodine", rbox(dw, dh, 3 * MM, 1.5 * MM, (dw / 2 + 4 * MM, 0, 1.5 * MM)))
    for x in np.linspace(0.03, dw - 0.02, 5):
        dr.add("al_alodine", rbox(3 * MM, dh - 8 * MM, 6 * MM, 0.8 * MM, (x + 4 * MM, 0, 5 * MM)))
    dr.add("al_alodine", rbox(dw - 10 * MM, 3 * MM, 5.4 * MM, 0.8 * MM, (dw / 2 + 4 * MM, 0, 4.9 * MM)))
    for y in (-30 * MM, 30 * MM):
        dr.add("stainless", cyl(3 * MM, 8 * MM, axis=(0, 1, 0), pos=(0, y, 0), seg=14))
        dr.add("al_alodine", rbox(10 * MM, 7.4 * MM, 1.8 * MM, 0.5 * MM, (5 * MM, y, 1.2 * MM)))
        Pspr = [(4 * MM * math.cos(a), y + 4 * MM + 6 * MM * a / (5 * TAU), 4 * MM * math.sin(a)) for a in np.linspace(0, 5 * TAU, 80)]
        dr.add("stainless", tube(Pspr, 0.5 * MM, 5))   # door torsion spring
    dr.add("al_black_anod", rbox(10 * MM, 22 * MM, 7.6 * MM, 1 * MM, (dw - 2 * MM, 0, 4.2 * MM)))    # latch keeper
    # door release actuator (pin puller) + latch on the +X frame side
    root.add("al_black_anod", rbox(14 * MM, 30 * MM, 30 * MM, 2 * MM, (ix + 14 * MM, 0, DEP_Z1 - 18 * MM)))
    root.add("stainless", cyl(4 * MM, 20 * MM, axis=(0, 0, 1), pos=(ix + 14 * MM, 0, DEP_Z1 + 2 * MM), seg=16))
    root.add("accent_power", ring(4.02 * MM, 4.6 * MM, 3 * MM, axis=(0, 0, 1), pos=(ix + 14 * MM, 0, DEP_Z1 - 2 * MM), seg=16))
    root.add(micro_d(15, axis=(1, 0, 0)), Tm=T((ix + 21 * MM, 0, DEP_Z1 - 36 * MM), e=(math.pi / 2, 0, 0)))
    # mounting feet along the bottom
    for sx in (-1, 1):
        for z in np.linspace(DEP_Z0 + 0.03, DEP_Z1 - 0.03, 4):
            root.add("al_alodine", rbox(22 * MM, 8 * MM, 26 * MM, 2 * MM, (sx * (ix + 2.5 * MM), -iy - 2.5 * MM - 8 * MM, z)))
            root.screw((sx * (ix + 2.5 * MM), -iy - 2.5 * MM - 4 * MM, z), (0, 1, 0), d=4 * MM)
    root.mount("mount_lv", (0, -iy - 2.5 * MM - 12 * MM, (DEP_Z0 + DEP_Z1) / 2))
    root.mount("mount_payload", (0, 0, 0))
    return {"payload_volume": "6U envelope centred on the origin, +Z toward the door"}


@part("deployer_6u_closed", "6U CubeSat deployer, door closed, pusher spring compressed",
      2, "launch", "centre of the 6U payload volume (drop the CubeSat at the origin)")
def b_dep_c(root):
    return build_deployer(root, False)


@part("deployer_6u_open", "6U CubeSat deployer, door open (deployed pose), pusher plate ejected",
      2, "launch", "centre of the 6U payload volume (drop the CubeSat at the origin)")
def b_dep_o(root):
    return build_deployer(root, True)


@part("separation_ring", "Motorised separation ring (15-inch class): upper/lower rings, latch housings, springs, connectors",
      2, "launch", "separation plane centre; ring axis +Y")
def b_sepring(root):
    R0, R1 = 0.165, 0.190
    for y0, h, name in ((-0.034, 0.033, "lower"), (0.001, 0.033, "upper")):
        n = root.child(name + "_ring")
        prof = [(R0, y0), (R1, y0), (R1, y0 + 4 * MM), (R1 - 8 * MM, y0 + 6 * MM), (R1 - 8 * MM, y0 + h - 6 * MM), (R1, y0 + h - 4 * MM), (R1, y0 + h), (R0, y0 + h), (R0, y0)]
        n.add("al_alodine", lathe(prof, 72, cap=False))
        for k in range(24):
            a = TAU * (k + 0.5) / 24
            yy = y0 + h if name == "upper" else y0
            n.screw(((R0 + 12 * MM) * math.cos(a), yy, (R0 + 12 * MM) * math.sin(a)), (0, 1 if name == "upper" else -1, 0), d=4 * MM, washer=False)
    for k in range(8):     # motorised latch housings
        a = TAU * k / 8
        c = (R1 - 2 * MM) * np.array([math.cos(a), 0, math.sin(a)])
        Rm = T(tuple(c), e=(0, -a, 0))
        root.add("al_black_anod", rbox(14 * MM, 40 * MM, 30 * MM, 2 * MM, (6 * MM, 0, 0)), Tm=Rm)
        root.add("stainless", cyl(4 * MM, 16 * MM, axis=(1, 0, 0), pos=(12 * MM, 12 * MM, 0), seg=14), Tm=Rm)
        root.add("al_hard_anod", rbox(4 * MM, 6 * MM, 22 * MM, 1 * MM, (14 * MM, -12 * MM, 0)), Tm=Rm)
    for k in range(4):     # separation springs
        a = TAU * (k + 0.25) / 4 + 0.2
        root.add("stainless", cyl(5 * MM, 26 * MM, pos=((R0 + 8 * MM) * math.cos(a), 0, (R0 + 8 * MM) * math.sin(a)), seg=16, ch=1 * MM))
    for a in (0.7, 0.7 + math.pi):  # separation connectors
        c = (R0 - 10 * MM) * np.array([math.cos(a), 0, math.sin(a)])
        root.add("al_black_anod", rbox(26 * MM, 30 * MM, 18 * MM, 2 * MM), Tm=T(tuple(c), e=(0, -a, 0)))
        root.add("wire_white", tube(route([tuple(c + [0, -15 * MM, 0]), tuple(c * 0.85 + [0, -30 * MM, 0]), tuple(c * 0.7 + [0, -32 * MM, 0])], 8 * MM), 2.5 * MM, 8))
    root.add("safety_yellow", ring(R1 - 7.9 * MM, R1 - 7.4 * MM, 4 * MM, pos=(0, 0.0005, 0), seg=72))
    root.mount("mount_upper", (0, 0.034, 0))
    root.mount("mount_lower", (0, -0.034, 0), (math.pi, 0, 0))


def isogrid_plate(w, d, t_skin, h, side, rib=3 * MM, mat="al_alodine"):
    """Plate with isogrid triangular pockets (pockets on the underside)."""
    tri = []
    hgt = side * math.sqrt(3) / 2
    for j in range(-int(d / hgt) - 2, int(d / hgt) + 2):
        for i in range(-int(w / side) - 2, int(w / side) + 2):
            x0 = i * side + (j % 2) * side / 2
            y0 = j * hgt
            for up in (True, False):
                if up:
                    pts = [(x0, y0), (x0 + side, y0), (x0 + side / 2, y0 + hgt)]
                else:
                    pts = [(x0 + side / 2, y0 + hgt), (x0 + side * 1.5, y0 + hgt), (x0 + side, y0)]
                p = Polygon(pts).buffer(-rib / 2, join_style=2)
                if not p.is_empty:
                    tri.append(p.buffer(1.5 * MM, resolution=2).buffer(-1.5 * MM, resolution=2) if p.area > 0 else p)
    pockets = unary_union(tri).intersection(rrect(w - 2 * 14 * MM, d - 2 * 14 * MM, 4 * MM))
    ribs = rrect(w, d, 6 * MM).difference(pockets)
    return {mat: [extrude(rrect(w, d, 6 * MM), t_skin, y0=0), extrude(ribs, h - t_skin, y0=t_skin)]}


@part("payload_adapter_plate", "Payload adapter plate: isogrid-machined aluminium, two deployer footprints, LV bolt pattern",
      2, "launch", "top surface centre; deployer footprints at mount_deployer_a/b")
def b_pap(root):
    w, d, h = 0.56, 0.42, 0.025
    root.add(isogrid_plate(w, d, 3 * MM, h, 0.07))
    for x in (-0.135, 0.135):
        for sx in (-1, 1):   # deployer interface strips under the mounting feet
            root.add("al_hard_anod", rbox(0.026, 1.0 * MM, 0.36, 2 * MM, (x + sx * 0.117, h + 0.5 * MM, 0)))
        for sx in (-1, 1):
            for z in np.linspace(-0.17, 0.17, 4):
                root.screw((x + sx * 0.117, h + 1 * MM, z), d=4 * MM)
        root.mount("mount_deployer_" + ("a" if x < 0 else "b"), (x, h + 1 * MM, 0))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.add("stainless", ring(3 * MM, 6 * MM, 1 * MM, pos=(sx * (w / 2 - 8 * MM), h + 0.5 * MM, sz * (d / 2 - 8 * MM)), seg=16))
    for z in np.linspace(-0.18, 0.18, 7):
        for sx in (-1, 1):
            root.screw((sx * (w / 2 - 8 * MM), h, z), d=5 * MM)
    root.add("al_black_anod", rbox(0.016, 0.012, 0.012, 2 * MM, (0, h + 6 * MM, -d / 2 + 11 * MM)))  # harness bracket
    root.add("wire_white", tube(route([(-0.10, h + 4 * MM, -d / 2 + 11 * MM), (0, h + 8 * MM, -d / 2 + 11 * MM), (0.10, h + 4 * MM, -d / 2 + 11 * MM)], 20 * MM), 3 * MM, 8))
    root.mount("mount_lv", (0, 0, 0), (math.pi, 0, 0))


def lathe_partial(profile, a0, a1, seg):
    """Revolve a CLOSED (r, y) polygon from angle a0 to a1 about Y, with end caps (watertight)."""
    P = np.asarray(profile, float)
    if np.allclose(P[0], P[-1]):
        P = P[:-1]
    n = len(P)
    angs = np.linspace(a0, a1, seg + 1)
    V = []
    for a in angs:
        for r, y in P:
            V.append((r * math.cos(a), y, -r * math.sin(a)))
    F = []
    for i in range(seg):
        for k in range(n):
            a, b = i * n + k, i * n + (k + 1) % n
            c, d = a + n, b + n
            F += [[a, b, c], [b, d, c]]
    tri = trimesh.creation.triangulate_polygon(Polygon(P))[1]
    for t in tri:
        F.append([t[0], t[2], t[1]])
        F.append([seg * n + t[0], seg * n + t[1], seg * n + t[2]])
    m = tm(V, F)
    m.fix_normals()
    return m


@part("fairing_half", "Payload fairing half (1.2 m class), cutaway: composite shell, acoustic blankets, frangible rails",
      2, "launch", "base of the fairing on the split plane, axis +Y; half occupies z >= 0")
def b_fairing(root):
    R, Hc, Ho, th = 0.60, 1.10, 1.00, 22 * MM
    prof_out = [(R, 0.0), (R, Hc)]
    for t in np.linspace(0, 1, 13)[1:]:
        y = Hc + Ho * t
        r = R * math.sqrt(max(1 - t ** 1.6, 0)) if t < 1 else 0.0
        prof_out.append((max(r, 0.07 * (1 - t) + 0.04), y))
    prof_out[-1] = (0.04, Hc + Ho)
    prof_in = [(max(r - th, 0.02), y) for r, y in prof_out][::-1]
    root.add("fairing_white", lathe_partial(prof_out + [(0.02, Hc + Ho + 0.002)] + prof_in, 0.004, math.pi - 0.004, 48))
    # acoustic blanket inside (quilted bands)
    for y0 in np.arange(0.06, Hc + 0.5, 0.22):
        rr = R - th - 2 * MM if y0 < Hc else R * math.sqrt(max(1 - ((y0 - Hc) / Ho) ** 1.6, 0)) - th - 2 * MM
        if rr < 0.1:
            continue
        prof = [(rr, y0), (rr, y0 + 0.2), (rr - 45 * MM, y0 + 0.19), (rr - 50 * MM, y0 + 0.1), (rr - 45 * MM, y0 + 0.01)]
        root.add("acoustic_foam", lathe_partial(prof, 0.03, math.pi - 0.03, 24))
    # frangible separation rails on both split edges + ring frame at the base
    for a in (0.0, math.pi):
        root.add("al_bead", lathe_partial([(R - 30 * MM, 0.002), (R + 6 * MM, 0.002), (R + 6 * MM, Hc - 0.002), (R - 30 * MM, Hc - 0.002)], (a - 0.024) if a else 0.0, (a - 0.002) if a else 0.022, 2))
        for y in np.linspace(0.05, Hc - 0.05, 12):
            root.screw(((R + 6 * MM) * math.cos(a), y, -(R + 6 * MM) * math.sin(a) + (8 * MM if a == 0 else -8 * MM) * 0), (math.cos(a), 0, -math.sin(a)), d=6 * MM)
    root.add("al_bead", lathe_partial([(R - 60 * MM, -0.003), (R + 4 * MM, -0.003), (R + 4 * MM, 0.04), (R - 60 * MM, 0.04)], 0.006, math.pi - 0.006, 48))
    # access door outline + vents on the outside
    a = math.pi / 2
    door = lathe_partial([(R + 0.5 * MM, 0.45), (R + 3 * MM, 0.45), (R + 3 * MM, 0.75), (R + 0.5 * MM, 0.75)], a - 0.22, a + 0.22, 12)
    root.add("fairing_white", door)
    for k in range(10):
        b = a - 0.2 + 0.4 * k / 9
        root.add("steel_black", cyl(3 * MM, 3 * MM, axis=(math.cos(b), 0, -math.sin(b)), pos=((R + 3 * MM) * math.cos(b), 0.46, -(R + 3 * MM) * math.sin(b)), seg=10))
        root.add("steel_black", cyl(3 * MM, 3 * MM, axis=(math.cos(b), 0, -math.sin(b)), pos=((R + 3 * MM) * math.cos(b), 0.74, -(R + 3 * MM) * math.sin(b)), seg=10))
    for k in range(6):
        b = 0.5 + k * 0.35
        root.add("black_paint", lathe_partial([(R + 0.3 * MM, 0.98), (R + 1.0 * MM, 0.98), (R + 1.0 * MM, 1.0), (R + 0.3 * MM, 1.0)], b, b + 0.03, 2))
    root.mount("mount_base", (0, 0, 0))


@part("lv_mount_plate", "Launch-vehicle mounting plate: round machined plate with radial ribs, bolt circle and harness brackets",
      2, "launch", "top surface centre; LV interface on the underside")
def b_lvplate(root):
    R, t, rib = 0.45, 10 * MM, 45 * MM
    root.add("al_alodine", lathe([(0, -t), (R, -t), (R, 0), (0, 0)], 64))
    root.add("al_alodine", ring(R - 30 * MM, R, rib, pos=(0, -t - rib / 2, 0), seg=64, ch=2 * MM))      # outer flange
    root.add("al_alodine", ring(0.08, 0.10, rib, pos=(0, -t - rib / 2, 0), seg=48, ch=1 * MM))          # hub
    for k in range(12):     # radial ribs
        a = TAU * k / 12
        r_ = (0.10 + R - 30 * MM) / 2
        root.add("al_alodine", rbox(R - 0.13, rib - 6 * MM, 8 * MM, 2 * MM, (0, 0, 0)), Tm=T((r_ * math.cos(a), -t - rib / 2 + 3 * MM, r_ * math.sin(a)), e=(0, -a, 0)))
    for k in range(24):     # bolt circle
        a = TAU * k / 24
        root.screw(((R - 15 * MM) * math.cos(a), 0, (R - 15 * MM) * math.sin(a)), d=6 * MM)
    for k in range(6):      # lightening holes ring (dark recesses)
        a = TAU * k / 6 + 0.26
        root.add("al_hard_anod", cyl(0.045, 0.6 * MM, pos=(0.26 * math.cos(a), 0.3 * MM, 0.26 * math.sin(a)), seg=40))
    root.add("al_hard_anod", rbox(0.5, 1 * MM, 0.42, 3 * MM, (0, 0.5 * MM, 0)))    # payload adapter interface pad
    for x in (-0.24, 0.24):  # harness brackets with connector panels
        root.add("al_black_anod", rbox(0.03, 0.05, 0.08, 2 * MM, (x * 1.45, 25 * MM, 0)))
        root.add(micro_d(25, axis=(1 if x > 0 else -1, 0, 0)), Tm=T((x * 1.45 + (15 * MM if x > 0 else -15 * MM), 30 * MM, 0), e=(math.pi / 2, 0, 0)))
        root.add("wire_white", tube(route([(x * 1.45, 5 * MM, 0.04), (x * 1.1, 4 * MM, 0.12), (x * 0.6, 4 * MM, 0.22)], 0.04), 4 * MM, 8))
    root.mount("mount_adapter", (0, 1 * MM, 0))

# ---------------------------------------------------------------------------------------
# TIER 3: CLEAN-ROOM PROPS
# ---------------------------------------------------------------------------------------
def sq_tube(p0, p1, s=30 * MM, mat="steel_paint_gray"):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    L = np.linalg.norm(p1 - p0)
    m = rbox(s, L, s, 2.5 * MM, (0, L / 2, 0))
    m.apply_transform(rot_y_to(p1 - p0))
    m.apply_translation(p0)
    return {mat: [m]}


def level_foot(pos, h=40 * MM):
    return {"stainless": [threaded_rod(h - 6 * MM, 12 * MM, axis=(0, 1, 0), pos=(pos[0], pos[1] + h / 2 + 3 * MM, pos[2]))],
            "rubber": [cyl(30 * MM, 12 * MM, pos=(pos[0], pos[1] + 6 * MM, pos[2]), seg=24, ch=2 * MM)],
            "nickel": [hexprism(19 * MM, 8 * MM, pos=(pos[0], pos[1] + h - 2 * MM, pos[2]))]}


@part("assembly_stand", "Rotation assembly stand: levelling base, uprights, rotating cradle clamping the 6U rails, handwheel, lock pin",
      3, "cleanroom", "floor centre; spacecraft centre at mount_spacecraft (0, 0.55, 0), CubeSat Z along stand Z")
def b_stand(root):
    H = 0.55
    zw = EZ + 0.06
    for sx in (-1, 1):
        root.add(sq_tube((sx * 0.30, 0.055, -0.33), (sx * 0.30, 0.055, 0.33), 50 * MM))
    for sz in (-1, 1):
        root.add(sq_tube((-0.33, 0.0556, sz * 0.30), (0.33, 0.0556, sz * 0.30), 50 * MM))
        root.add(sq_tube((0, 0.086, sz * zw), (0, H - 0.04, sz * zw), 60 * MM, "steel_paint_white"))   # uprights
        root.add(sq_tube((-0.28, 0.086, sz * zw + 0.003), (0, H - 0.25, sz * zw + 0.003), 30 * MM, "steel_paint_white"))
        root.add(sq_tube((0.28, 0.086, sz * zw - 0.003), (0, H - 0.25, sz * zw - 0.003), 30 * MM, "steel_paint_white"))
        root.add("steel_paint_gray", rbox(0.60, 0.012, 0.10, 4 * MM, (0, 0.086, sz * zw)))
        root.add("stainless", cyl(45 * MM, 50 * MM, axis=(0, 0, 1), pos=(0, H, sz * (zw - 5 * MM)), seg=40, ch=3 * MM))   # bearing block
        root.add("al_black_anod", rbox(0.10, 0.10, 0.04, 6 * MM, (0, H, sz * (zw + 5 * MM))))
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.add(level_foot((sx * 0.30, 0.0, sz * 0.30)))
    # rotating cradle (node so the game can roll the spacecraft)
    cr = root.child("cradle", t=(0, H, 0), extras={"rotate_axis": [0, 0, 1]})
    for sz in (-1, 1):
        fr = rrect(0.30, 0.17, 12 * MM).difference(rrect(2 * EX + 2 * MM, 2 * EY + 2 * MM, 3 * MM))
        cr.add("al_hard_anod", exy(fr, 16 * MM, sz * (EZ + 0.012) - 8 * MM))
        cr.add("stainless", cyl(20 * MM, 40 * MM, axis=(0, 0, 1), pos=(0, 0, sz * (zw - 0.03)), seg=24))
        for sx in (-1, 1):
            for sy in (-1, 1):    # rail clamps (PTFE-faced, black knobs)
                c = (sx * (EX + 6 * MM), sy * (EY + 6 * MM), sz * (EZ + 0.012))
                cr.add("plastic_white", rbox(12 * MM, 12 * MM, 20 * MM, 2 * MM, c))
                cr.add("plastic_black", cyl(9 * MM, 14 * MM, axis=(sx, 0, 0), pos=(c[0] + sx * 16 * MM, c[1], c[2]), seg=8, ch=2 * MM))
    for sx in (-1, 1):
        for sy in (-1, 1):
            cr.add(sq_tube((sx * 0.135, sy * 0.07, -(EZ + 0.004)), (sx * 0.135, sy * 0.07, EZ + 0.004), 20 * MM, "al_hard_anod"))
    # handwheel and lock pin on +Z side
    hw = root.child("handwheel", t=(0, H, zw + 0.06))
    hw.add("stainless", torus(0.10, 7 * MM, axis=(0, 0, 1), seg=48, tseg=10))
    for k in range(4):
        a = TAU * k / 4
        hw.add("stainless", tube([(0, 0, 0), (0.1 * math.cos(a), 0.1 * math.sin(a), 0)], 5 * MM, 8))
    hw.add("stainless", cyl(18 * MM, 30 * MM, axis=(0, 0, 1), seg=24, ch=2 * MM))
    hw.add("plastic_black", cyl(9 * MM, 50 * MM, axis=(0, 0, 1), pos=(0.1, 0, 0.03), seg=16, ch=3 * MM))
    root.add("stainless", cyl(6 * MM, 70 * MM, axis=(1, 0, 0), pos=(0.09, H + 0.06, zw), seg=12))
    root.add("cover_red", sphere(13 * MM, (0.13, H + 0.06, zw), seg=16))
    # ESD ground stud with green/yellow lead
    root.add("wire_yellow", tube(route([(-0.33, 0.08, 0.30), (-0.38, 0.05, 0.34), (-0.42, 0.01, 0.40), (-0.5, 0.005, 0.45)], 0.04), 3 * MM, 8))
    root.mount("mount_spacecraft", (0, H, 0))


@part("crane_hook", "Overhead crane hook block with swivel hook, safety latch, 4-leg round-sling set and shackles",
      3, "cleanroom", "hook load point (bowl of the hook); sling ends at mount_load_*")
def b_crane(root):
    # hook block with sheaves
    root.add("safety_yellow", rbox(0.16, 0.22, 0.10, 12 * MM, (0, 0.34, 0)))
    for z in (-0.051, 0.051):
        root.add("steel_black", cyl(0.07, 4 * MM, axis=(0, 0, 1), pos=(0, 0.36, z), seg=40))
    root.add("steel_black", tube([(0.02, 0.45, 0), (0.02, 1.2, 0)], 6 * MM, 8))
    root.add("steel_black", tube([(-0.02, 0.45, 0), (-0.02, 1.2, 0)], 6 * MM, 8))
    root.add("stainless", cyl(22 * MM, 40 * MM, pos=(0, 0.21, 0), seg=24, ch=3 * MM))     # swivel
    root.add("stainless", cyl(18 * MM, 30 * MM, pos=(0, 0.17, 0), seg=24))
    # hook body (forged): straight shank into a bowl that curls back up to the tip
    root.add("safety_yellow", tube([(0, 0.155, 0), (0, 0.09, 0)], 19 * MM, 16))
    bowl = [(0.0, 0.09, 0)] + [(-0.045 * math.sin(a), 0.045 + 0.045 * math.cos(a), 0) for a in np.linspace(0, math.pi * 1.3, 26)][1:]
    root.add("safety_yellow", tube(bowl, 14 * MM, 14))
    root.add("safety_yellow", sphere(15 * MM, bowl[-1], seg=16))
    root.add("stainless", tube([(0.0, 0.085, 0), (-0.05, 0.03, 0)], 2.5 * MM, 8))   # safety latch
    # master link + 4-leg slings to shackles
    root.add("stainless", torus(0.035, 7 * MM, axis=(0, 0, 1), pos=(0, 0.0 - 0.02, 0), seg=32, tseg=10))
    ends = [(sx * 0.28, -0.55, sz * 0.20) for sx in (-1, 1) for sz in (-1, 1)]
    for i, e in enumerate(ends):
        p0 = np.array([0, -0.05, 0.0])
        mid = (p0 + np.array(e)) / 2 + np.array([0, -0.01, 0])
        root.add("sling_purple" if i % 2 == 0 else "sling_orange", tube(bezier(p0, mid, mid, e, 14), 13 * MM, 10))
        root.add("stainless", torus(16 * MM, 4 * MM, axis=(1, 0, 0), pos=(e[0], e[1] - 0.012, e[2]), seg=20, tseg=8))
        root.add("stainless", cyl(4 * MM, 40 * MM, axis=(1, 0, 0), pos=(e[0], e[1] - 0.03, e[2]), seg=10))
        root.mount(f"mount_load_{i}", (e[0], e[1] - 0.03, e[2]))


@part("esd_workbench", "ESD workbench: steel frame, laminate top, blue ESD mat with ground snap and wrist strap, shelf, light bar",
      3, "cleanroom", "floor centre; work surface at y = 0.90")
def b_bench(root):
    W, D, H = 1.50, 0.75, 0.90
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.add(sq_tube((sx * (W / 2 - 0.04), 0.03, sz * (D / 2 - 0.04)), (sx * (W / 2 - 0.04), H - 0.03, sz * (D / 2 - 0.04)), 40 * MM, "steel_paint_white"))
            root.add(level_foot((sx * (W / 2 - 0.04), 0.0, sz * (D / 2 - 0.04)), 30 * MM))
        root.add(sq_tube((sx * (W / 2 - 0.04), 0.15, -(D / 2 - 0.04)), (sx * (W / 2 - 0.04), 0.15, D / 2 - 0.04), 30 * MM, "steel_paint_white"))
        root.add(sq_tube((sx * (W / 2 - 0.06), H, -(D / 2 - 0.06)), (sx * (W / 2 - 0.06), 1.62, -(D / 2 - 0.06)), 35 * MM, "steel_paint_white"))
    root.add(sq_tube((-(W / 2 - 0.04), 0.162, 0), (W / 2 - 0.04, 0.162, 0), 30 * MM, "steel_paint_white"))
    root.add("esd_gray", rbox(W, 0.03, D, 4 * MM, (0, H - 0.015, 0)))
    root.add("esd_mat", rbox(1.30, 2.2 * MM, 0.62, 3 * MM, (0, H + 1.1 * MM, 0.02)))
    root.add("stainless", cyl(6 * MM, 3 * MM, pos=(0.60, H + 2.2 * MM + 1.5 * MM, -0.26), seg=16, ch=0.8 * MM))     # ground snap
    aa = np.linspace(0, 10 * TAU, 200)
    coil = [(0.60 + 7 * MM * math.cos(a), H + 5 * MM + 6 * MM * math.sin(a), -0.27 - 0.25 * a / (10 * TAU)) for a in aa]
    root.add("wire_black", tube(coil, 1.5 * MM, 5))
    root.add("esd_mat", rbox(60 * MM, 4 * MM, 30 * MM, 6 * MM, (0.40, H + 0.004, 0.25)))       # wrist strap band
    root.add("stainless", cyl(5 * MM, 3 * MM, pos=(0.40, H + 0.0075, 0.25), seg=14))
    # shelf, light bar, power strip
    root.add("steel_paint_white", rbox(W - 0.06, 0.02, 0.28, 4 * MM, (0, 1.62, -(D / 2 - 0.18))))
    root.add("plastic_white", rbox(1.2, 0.03, 0.06, 6 * MM, (0, 1.595, -0.10)))
    root.add("plastic_white", rbox(1.16, 0.004, 0.04, 2 * MM, (0, 1.578, -0.10)))
    root.add("steel_paint_gray", rbox(0.60, 0.05, 0.05, 6 * MM, (0, H + 0.20, -(D / 2 - 0.08))))
    for k in range(6):
        root.add("plastic_black", rbox(0.02, 0.025, 0.006, 2 * MM, (-0.25 + k * 0.1, H + 0.20, -(D / 2 - 0.08) + 0.026)))
    root.add("led_red", rbox(8 * MM, 8 * MM, 4 * MM, 1 * MM, (0.28, H + 0.20, -(D / 2 - 0.08) + 0.026)))
    # drawer unit
    root.add("steel_paint_gray", rbox(0.45, 0.45, 0.60, 6 * MM, (-0.45, H - 0.255, 0.0)))
    for k in range(3):
        y = H - 0.11 - k * 0.14
        root.add("steel_paint_white", rbox(0.42, 0.13, 0.01, 3 * MM, (-0.45, y, 0.30)))
        root.add("stainless", tube([(-0.52, y + 0.04, 0.31), (-0.52, y + 0.04, 0.33), (-0.38, y + 0.04, 0.33), (-0.38, y + 0.04, 0.31)], 5 * MM, 8))
    root.mount("mount_worksurface", (0, H + 2.2 * MM, 0.02))


@part("torque_wrench", "1/4-inch click torque wrench: ratchet head, knurled grip, scale window (no markings), lock knob",
      3, "cleanroom", "square-drive centre; handle along +X")
def b_torque(root):
    root.add("chrome", lathe([(0, -6 * MM), (14 * MM, -6 * MM), (15 * MM, -3 * MM), (15 * MM, 6 * MM), (12 * MM, 9 * MM), (0, 9 * MM)], 32))
    root.add("chrome", box(6.35 * MM, 8 * MM, 6.35 * MM, (0, -10 * MM, 0)))
    root.add("plastic_black", rbox(8 * MM, 4 * MM, 14 * MM, 1.5 * MM, (0, 10 * MM, 0)))                  # reverse lever
    root.add("chrome", tube([(12 * MM, 0, 0), (0.17, 0, 0)], 9 * MM, 24))
    root.add("glass_dark", rbox(40 * MM, 3 * MM, 8 * MM, 1 * MM, (0.10, 8.5 * MM, 0)))
    root.add("al_bead", rbox(36 * MM, 0.2 * MM, 1.2 * MM, 0.1 * MM, (0.10, 10.1 * MM, 0)))
    prof = [(0, 0.17)]
    for i in range(40):
        prof.append(((11.5 if i % 2 else 12.5) * MM, 0.17 + i * 2.5 * MM))
    prof += [(11 * MM, 0.27), (9 * MM, 0.275), (0, 0.275)]
    root.add("rubber", lathe(prof, 28, axis=(1, 0, 0)))
    root.add("al_red_anod", lathe([(0, 0.275), (12 * MM, 0.275), (12 * MM, 0.29), (9 * MM, 0.295), (0, 0.295)], 24, axis=(1, 0, 0)))
    root.add("stainless", ring(9.02 * MM, 10 * MM, 4 * MM, axis=(1, 0, 0), pos=(0.165, 0, 0), seg=24))


@part("screwdriver", "Precision ESD hex driver: dissipative handle with swivel cap, chrome shaft, hex tip",
      3, "cleanroom", "tip point; handle along +Y")
def b_driver(root):
    root.add("chrome", hexprism(2.0 * MM, 6 * MM, y0=0))
    root.add("chrome", cyl(1.5 * MM, 70 * MM, pos=(0, 41 * MM, 0), seg=14))
    prof = [(0, 76 * MM), (6 * MM, 76 * MM), (8 * MM, 82 * MM)]
    for i in range(16):
        prof.append(((8.6 if i % 2 else 9.4) * MM, 84 * MM + i * 4 * MM))
    prof += [(8.5 * MM, 150 * MM), (0, 150 * MM)]
    root.add("plastic_black", lathe(prof, 24))
    root.add("al_blue_anod", lathe([(0, 150.5 * MM), (8 * MM, 150.5 * MM), (8 * MM, 156 * MM), (6 * MM, 158 * MM), (0, 158 * MM)], 24))
    root.add("accent_comms", ring(9.0 * MM, 9.6 * MM, 2 * MM, pos=(0, 100 * MM, 0), seg=24))


@part("shipping_container", "Rugged shipping container: shell, hinged lid (opens), latches, wheels, purge valve, foam with 6U cut-out",
      3, "cleanroom", "floor centre under the case; lid hinge along X at the back top edge")
def b_case(root):
    W, D, H, Hl = 0.74, 0.46, 0.30, 0.14
    root.add("case_black", rbox(W, H, D, 25 * MM, (0, H / 2 + 0.02, 0), seg=3))
    for z in (-D / 2, D / 2):      # moulded ribs
        for x in (-0.25, 0.0, 0.25):
            root.add("case_black", rbox(0.03, H - 0.05, 8 * MM, 3 * MM, (x, H / 2 + 0.02, z + (4 * MM if z > 0 else -4 * MM))))
    root.add("foam_gray", extrude(rrect(W - 0.04, D - 0.04, 10 * MM).difference(rrect(0.40, 0.25, 6 * MM, 0.0, 0.0)), 0.05, y0=H - 0.045))
    root.add("foam_gray", rbox(0.40, 0.01, 0.25, 4 * MM, (0, H - 0.10, 0)))
    for x in (-0.25, 0.25):        # front latches
        root.add("plastic_black", rbox(0.06, 0.06, 0.02, 5 * MM, (x, H - 0.01, D / 2 + 0.012)))
        root.add("stainless", rbox(0.03, 0.02, 0.005, 1 * MM, (x, H - 0.02, D / 2 + 0.024)))
    for sx in (-1, 1):             # side handles
        root.add("plastic_black", tube(route([(sx * W / 2, H - 0.06, -0.08), (sx * (W / 2 + 0.035), H - 0.06, -0.06), (sx * (W / 2 + 0.035), H - 0.06, 0.06), (sx * W / 2, H - 0.06, 0.08)], 0.02), 9 * MM, 10))
        root.add("rubber", cyl(0.045, 0.03, axis=(1, 0, 0), pos=(sx * (W / 2 - 0.04), 0.045, -D / 2 + 0.01), seg=24, ch=4 * MM))   # wheels
    root.add("stainless", cyl(14 * MM, 10 * MM, axis=(0, 0, 1), pos=(0.30, 0.20, D / 2 + 0.003), seg=20))   # purge valve
    root.add("glass", cyl(10 * MM, 3 * MM, axis=(0, 0, 1), pos=(-0.30, 0.20, D / 2 + 0.002), seg=20))      # humidity indicator
    lid = root.child("lid", t=(0, H + 0.02, -D / 2 + 0.01), e=(-1.75, 0, 0), extras={"stowed": [0, 0, 0]})
    lid.add("case_black", rbox(W, Hl, D, 25 * MM, (0, Hl / 2, D / 2 - 0.01), seg=3))
    lid.add("foam_gray", rbox(W - 0.04, 0.04, D - 0.04, 10 * MM, (0, 0.02 + 0.001, D / 2 - 0.01)))
    lid.add("plastic_black", tube(route([(-0.10, Hl, D / 2 - 0.01), (-0.08, Hl + 0.035, D / 2 - 0.01), (0.08, Hl + 0.035, D / 2 - 0.01), (0.10, Hl, D / 2 - 0.01)], 0.02), 9 * MM, 10))
    for x in (-0.30, 0.30):
        root.add("stainless", cyl(8 * MM, 0.06, axis=(1, 0, 0), pos=(x, H + 0.02, -D / 2 + 0.01), seg=14))   # hinges
    root.mount("mount_payload", (0, H - 0.045, 0))


@part("flight_covers", "Non-flight protective covers (red): camera cap, IR aperture cover, thruster cap, star-tracker cap",
      3, "cleanroom", "spacecraft centre (same frame as assembly_6u); each cover is a node at its instrument")
def b_covers(root):
    def streamer_ring(node, p):
        node.add("stainless", torus(3.5 * MM, 0.7 * MM, axis=(1, 0, 0), pos=p, seg=16, tseg=6))
    c = root.child("cover_camera", t=(CAM_POS[0], CAM_POS[1], CAM_POS[2] + 0.115))
    c.add("cover_red", lathe([(22.2 * MM, -9 * MM), (24 * MM, -9 * MM), (24 * MM, 3 * MM), (22 * MM, 4.5 * MM), (0, 4.5 * MM), (0, 2.5 * MM), (22.2 * MM, 2.5 * MM)], 48, axis=(0, 0, 1), cap=False))
    streamer_ring(c, (0, 24 * MM + 3 * MM, -3 * MM))
    c.add("cover_red", rbox(6 * MM, 6 * MM, 4 * MM, 1 * MM, (0, 25 * MM, -3 * MM)))
    ir = root.child("cover_ir", t=(IR_POS[0], IR_POS[1], IR_POS[2] + 0.108))
    ir.add("cover_red", exy(rrect(44 * MM, 44 * MM, 4 * MM).difference(rrect(38.6 * MM, 38.6 * MM, 3 * MM)), 7 * MM, -5 * MM))
    ir.add("cover_red", exy(rrect(44 * MM, 44 * MM, 4 * MM), 2 * MM, 2 * MM))
    streamer_ring(ir, (0, 22 * MM + 3 * MM, 0))
    ion = root.child("cover_thruster", t=(ION_POS[0], ION_POS[1], ION_POS[2] - 7.6 * MM))
    ion.add("cover_red", lathe([(19.0 * MM, 3 * MM), (21.5 * MM, 3 * MM), (21.5 * MM, -5 * MM), (19 * MM, -7 * MM), (0, -7 * MM), (0, -5 * MM), (19.0 * MM, -5 * MM)], 48, axis=(0, 0, 1), cap=False))
    streamer_ring(ion, (0, -21.5 * MM - 3 * MM, -3 * MM))
    st = root.child("cover_star_tracker", t=(0.0387 + 0.0735, ST_ZY[1], ST_ZY[0]))
    st.add("cover_red", lathe([(15.9 * MM, -4 * MM), (17.6 * MM, -4 * MM), (17.6 * MM, 3 * MM), (0, 3 * MM), (0, 1.2 * MM), (15.9 * MM, 1.2 * MM)], 40, axis=(1, 0, 0), cap=False))
    streamer_ring(st, (2 * MM, 17.6 * MM + 3 * MM, 0))
    for n in ("cover_camera", "cover_ir", "cover_thruster", "cover_star_tracker"):
        root.mount("mount_streamer_" + n.split("_", 1)[1], (0, 0, 0))


def wavy_strip(L, w, t, amp, waves, seed=0):
    nx, nz = 40, 4
    xs, zs = np.linspace(0, L, nx), np.linspace(-w / 2, w / 2, nz)
    X, Z = np.meshgrid(xs, zs, indexing="ij")
    Hh = amp * np.sin(X / L * waves * TAU) * (X / L) + 0.3 * amp * np.sin(Z / w * 3) * (X / L)
    top = np.stack([X, Hh + t, Z], -1).reshape(-1, 3)
    bot = np.stack([X, Hh, Z], -1).reshape(-1, 3)
    V = np.vstack([top, bot])
    idx = lambda i, j, b=0: b * nx * nz + i * nz + j
    F = []
    for i in range(nx - 1):
        for j in range(nz - 1):
            a, b_, c, e = idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)
            F += [[a, e, c], [a, c, b_]]
            a, b_, c, e = idx(i, j, 1), idx(i + 1, j, 1), idx(i + 1, j + 1, 1), idx(i, j + 1, 1)
            F += [[a, c, e], [a, b_, c]]
    border = [(i, 0) for i in range(nx)] + [(nx - 1, j) for j in range(1, nz)] + [(i, nz - 1) for i in range(nx - 2, -1, -1)] + [(0, j) for j in range(nz - 2, 0, -1)]
    for k in range(len(border)):
        (i0, j0), (i1, j1) = border[k], border[(k + 1) % len(border)]
        F += [[idx(i0, j0), idx(i1, j1), idx(i1, j1, 1)], [idx(i0, j0), idx(i1, j1, 1), idx(i0, j0, 1)]]
    m = tm(V, F)
    m.fix_normals()
    return m


@part("rbf_tag", "Remove-before-flight streamer (red, no text) with grommet, split ring, lanyard and T-handle pin",
      3, "cleanroom", "split-ring centre (attach point); streamer hangs toward -Y")
def b_rbf(root):
    s = wavy_strip(0.30, 0.05, 0.6 * MM, 8 * MM, 1.5)
    s.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [0, 0, 1]))
    s.apply_translation((0, -0.012, 0))
    root.add("fabric_red", s)
    root.add("fabric_red", rbox(1.6 * MM, 0.016, 0.052, 0.5 * MM, (0.0004, -0.018, 0)))   # hem
    root.add("nickel", ring(3 * MM, 5.5 * MM, 1.6 * MM, axis=(1, 0, 0), pos=(0.0, -0.016, 0), seg=20))                  # grommet
    root.add("stainless", torus(9 * MM, 0.9 * MM, axis=(0, 0, 1), pos=(0, -0.005, 0), seg=24, tseg=6))                  # split ring
    root.add("stainless", tube(route([(0, 0.004, 0), (0.0, 0.05, 0.01), (0.03, 0.09, 0.02), (0.05, 0.11, 0.02)], 0.02), 0.8 * MM, 6))  # lanyard cable
    root.add("cover_red", rbox(28 * MM, 8 * MM, 8 * MM, 2 * MM, (0.05, 0.115, 0.02)))
    root.add("stainless", cyl(1.6 * MM, 22 * MM, axis=(1, 0, 0), pos=(0.075, 0.115, 0.02), seg=12))
    root.mount("mount_attach", (0, 0, 0))


@part("laptop_cart", "Test laptop on a two-shelf cart with GSE power supply and cables",
      3, "cleanroom", "floor centre under the cart")
def b_cart(root):
    W, D = 0.62, 0.46
    for sx in (-1, 1):
        for sz in (-1, 1):
            root.add("stainless", tube([(sx * (W / 2 - 0.02), 0.07, sz * (D / 2 - 0.02)), (sx * (W / 2 - 0.02), 0.95, sz * (D / 2 - 0.02))], 12 * MM, 12))
            root.add("rubber", cyl(0.035, 0.025, axis=(1, 0, 0), pos=(sx * (W / 2 - 0.02), 0.035, sz * (D / 2 - 0.02)), seg=20, ch=3 * MM))
            root.add("plastic_gray", rbox(0.03, 0.03, 0.04, 4 * MM, (sx * (W / 2 - 0.02), 0.075, sz * (D / 2 - 0.02))))
    for y in (0.25, 0.80):
        root.add("steel_paint_gray", rbox(W, 0.02, D, 8 * MM, (0, y, 0)))
        root.add("steel_paint_gray", rbox(W, 0.03, 0.01, 3 * MM, (0, y + 0.02, D / 2 - 0.005)))
    root.add("stainless", tube(route([(-0.25, 0.95, -D / 2 + 0.02), (-0.25, 1.02, -D / 2 - 0.04), (0.25, 1.02, -D / 2 - 0.04), (0.25, 0.95, -D / 2 + 0.02)], 0.04), 11 * MM, 12))
    # rugged laptop: base with keys + open lid with emissive screen
    lt = root.child("laptop", t=(0, 0.81, 0.02))
    lt.add("case_black", rbox(0.36, 0.035, 0.26, 10 * MM, (0, 0.0175, 0)))
    for sx in (-1, 1):
        for sz in (-1, 1):
            lt.add("rubber", rbox(0.04, 0.045, 0.04, 8 * MM, (sx * 0.17, 0.0215, sz * 0.12)))
    for r in range(5):
        for c in range(14):
            lt.add("plastic_gray", cbox(16 * MM, 2.5 * MM, 15 * MM, 0.8 * MM, (-0.125 + c * 0.0192, 0.036, -0.075 + r * 0.019)))
    lt.add("plastic_gray", rbox(0.09, 1.5 * MM, 0.05, 4 * MM, (0, 0.036, 0.085)))
    lid = lt.child("lid", t=(0, 0.035, -0.12), e=(-1.85, 0, 0), extras={"stowed": [0, 0, 0]})
    lid.add("case_black", rbox(0.36, 0.022, 0.25, 10 * MM, (0, 0.011, 0.125)))
    lid.add("screen", rbox(0.31, 1 * MM, 0.195, 2 * MM, (0, -0.0005, 0.125)))
    for sx in (-1, 1):
        for sz in (0.0, 0.25):
            lid.add("rubber", rbox(0.038, 0.03, 0.04, 8 * MM, (sx * 0.172, 0.011, sz)))
    # GSE power supply on the lower shelf
    ps = root.child("gse_supply", t=(-0.05, 0.26, 0.0))
    ps.add("steel_paint_white", rbox(0.30, 0.14, 0.30, 6 * MM, (0, 0.07, 0)))
    ps.add("glass_dark", rbox(0.10, 0.05, 2 * MM, 2 * MM, (-0.07, 0.10, 0.151)))
    for i in range(3):
        ps.add("plastic_black", cyl(9 * MM, 12 * MM, axis=(0, 0, 1), pos=(0.03 + i * 0.04, 0.10, 0.156), seg=20, ch=2 * MM))
    for i, m in enumerate(("wire_red", "wire_black", "wire_red", "wire_black")):
        ps.add(m, cyl(4 * MM, 8 * MM, axis=(0, 0, 1), pos=(0.03 + i * 0.03, 0.04, 0.154), seg=12))
    ps.add("led_glow", rbox(6 * MM, 4 * MM, 2 * MM, 1 * MM, (-0.12, 0.04, 0.151)))
    ps.add("led_red", rbox(6 * MM, 4 * MM, 2 * MM, 1 * MM, (-0.10, 0.04, 0.151)))
    root.add("wire_black", tube(route([(0.17, 0.83, 0.0), (0.25, 0.80, 0.05), (0.30, 0.6, 0.18), (0.30, 0.35, 0.2), (0.12, 0.31, 0.16)], 0.05), 3 * MM, 8))
    root.add("wire_white", tube(route([(0.17, 0.83, -0.05), (0.32, 0.78, -0.12), (0.34, 0.5, -0.2), (0.34, 0.1, -0.3)], 0.05), 3 * MM, 8))


# ---------------------------------------------------------------------------------------
# ADDED CLEAN-ROOM PROPS
# ---------------------------------------------------------------------------------------
@part("witness_plate", "Particle fall-out witness plate: polished wafer on a stand with a hinged clear cover",
      3, "cleanroom", "stand base centre")
def b_witness(root):
    root.add("al_black_anod", cyl(0.06, 8 * MM, pos=(0, 4 * MM, 0), seg=40, ch=1.5 * MM))
    root.add("stainless", cyl(8 * MM, 0.12, pos=(0, 0.068, 0), seg=16))
    root.add("al_black_anod", cyl(0.058, 6 * MM, pos=(0, 0.131, 0), seg=48, ch=1 * MM))
    root.add("chrome", cyl(0.050, 0.8 * MM, pos=(0, 0.1344, 0), seg=48))
    cov = root.child("cover", t=(0, 0.134, -0.058), e=(-1.2, 0, 0), extras={"stowed": [0, 0, 0]})
    cov.add("plastic_clear", lathe([(0, 0), (0.057, 0), (0.057, 0.012), (0.055, 0.014), (0, 0.016)], 40, pos=(0, 0, 0.058)))
    root.add("al_bead", rbox(30 * MM, 2 * MM, 12 * MM, 1 * MM, (0, 0.009, 0.045)))


@part("gse_umbilical_cable", "GSE umbilical test cable: coiled lead with micro-D plug for the access port and a bench connector",
      3, "cleanroom", "centre of the coil lying on the bench")
def b_umb(root):
    pts = []
    for a in np.linspace(0, 3.2 * TAU, 160):
        r = 0.09 + 0.004 * math.sin(a * 3)
        pts.append((r * math.cos(a), 4 * MM + 3 * MM * (a / TAU), r * math.sin(a)))
    tail = route([pts[-1], (0.16, 0.012, 0.03), (0.26, 0.006, 0.06), (0.34, 0.006, 0.05)], 0.04)
    root.add("wire_black", tube(np.vstack([pts, tail[1:]]), 3.2 * MM, 10))
    head = route([pts[0], (0.12, 0.004, -0.02), (0.20, 0.004, -0.05)], 0.03)
    root.add("wire_black", tube(head, 3.2 * MM, 10))
    root.add("plastic_black", rbox(0.045, 14 * MM, 22 * MM, 4 * MM, (0.225, 7 * MM, -0.05)))
    root.add("nickel", rbox(10 * MM, 8 * MM, 16 * MM, 1 * MM, (0.252, 7 * MM, -0.05)))
    root.add("cover_red", rbox(8 * MM, 9 * MM, 18 * MM, 2 * MM, (0.262, 7 * MM, -0.05)))     # dust cap
    root.add("plastic_gray", rbox(0.06, 16 * MM, 40 * MM, 4 * MM, (0.37, 8 * MM, 0.05)))
    root.add("nickel", rbox(12 * MM, 10 * MM, 34 * MM, 1 * MM, (0.40, 8 * MM, 0.05)))
    root.add("accent_power", ring(3.25 * MM, 3.9 * MM, 6 * MM, axis=(1, 0, 0), pos=(0.19, 4 * MM, -0.05), seg=14))


# ---------------------------------------------------------------------------------------
# ASSEMBLED LUNAR-MAPPER LAYOUT (all positions in the spacecraft frame, metres)
#   left bay  (x<0): camera (front), avionics stack A, battery stack B, magnetorquers, IMU
#   right bay (x>0): IR spectrometer (front), wheel cluster over transponder, star tracker
#                    (looks out +X), ion engine (rear)
#   harness channel: x = -6 .. +8 mm between the bays
# ---------------------------------------------------------------------------------------
BP = (-0.0515, -0.0370, -0.038)                    # backplane origin
STACK_A_Z, STACK_B_Z = BP[2] + 0.050, BP[2] - 0.050
Y_EPS = BP[1] + STACK                              # first board above the backplane
CAM_POS = (CAM_XY[0], CAM_XY[1], 0.0655)
IR_POS = (IR_XY[0], IR_XY[1], 0.0720)
TRX_POS = (0.052, -0.0404, 0.006)
ION_POS = (ION_XY[0], ION_XY[1], -EF_IN + 3.2 * MM)   # base plate rests on the end-frame pocket lip
UHF_POS = (-(PX_IN + PT + 0.15 * MM), 0.0, 0.124)
WING_Y = PY_OUT + 2.3 * MM

ASSEMBLY = [
    # id, part, position, euler xyz, explode dir, explode dist, extra
    ("frame", "frame_6u", (0, 0, 0), (0, 0, 0), (0, 0, 0), 0.0, {}),
    ("panels", "face_panels", (0, 0, 0), (0, 0, 0), (0, 0, 0), 0.0,
     {"hidden_nodes": ["panel_nx"], "node_explode": {"panel_py": [[0, 1, 0], 0.10], "panel_ny": [[0, -1, 0], 0.10],
                                                       "panel_px": [[1, 0, 0], 0.09], "panel_pz": [[0, 0, 1], 0.12], "panel_nz": [[0, 0, -1], 0.12]}}),
    ("radiator", "radiator_panel", (-PX_IN, 0, 0), (0, 0, math.pi / 2), (-1, 0, 0), 0.09, {}),
    ("uhf", "uhf_antenna", UHF_POS, (0, 0, math.pi / 2), (-1, 0, 0), 0.14, {}),
    ("patch", "patch_antenna", (PX_OUT, -PATCH_PX_ZY[1], PATCH_PX_ZY[0]), (0, 0, -math.pi / 2), (1, 0, 0), 0.13, {}),
    ("sun_sensor", "sun_sensor", (PX_OUT, SUN_PX_ZY[1], SUN_PX_ZY[0]), (0, 0, -math.pi / 2), (1, 0, 0), 0.13, {}),
    ("wing_py", "solar_wing", (0.0960, WING_Y, 0), (0, 0, 0), (0, 1, 0), 0.14, {}),
    ("wing_ny", "solar_wing_mirror", (-0.0960, -WING_Y, 0), (0, math.pi, 0), (0, -1, 0), 0.14, {}),
    ("backplane", "backplane", BP, (0, 0, 0), (-0.3, -1, 0), 0.07, {}),
    ("eps", "eps_board", (BP[0], Y_EPS, STACK_A_Z), (0, 0, 0), (-1, 0.25, 0), 0.10, {}),
    ("obc", "obc_board", (BP[0], Y_EPS + STACK, STACK_A_Z), (0, 0, 0), (-1, 0.6, 0), 0.13, {}),
    ("transceiver", "transceiver_board", (BP[0], Y_EPS + 2 * STACK, STACK_A_Z), (0, 0, 0), (-0.8, 1, 0), 0.16, {}),
    ("battery", "battery_pack", (BP[0], Y_EPS, STACK_B_Z), (0, 0, 0), (-1, 0.2, -0.3), 0.11, {}),
    ("magnetorquers", "magnetorquer_set", (BP[0], 0.0080, STACK_B_Z), (0, 0, 0), (-0.4, 1, -0.2), 0.15, {}),
    ("imu", "imu_box", (-0.0350, 0.0205, STACK_A_Z), (0, 0, 0), (0, 1, 0.2), 0.20, {}),
    ("camera", "narrow_angle_camera", CAM_POS, (0, 0, 0), (0, 0.15, 1), 0.16, {}),
    ("ir_spectrometer", "ir_spectrometer", IR_POS, (0, 0, 0), (0, 0.15, 1), 0.16, {}),
    ("transponder", "transponder", TRX_POS, (0, 0, 0), (1, -0.6, 0.2), 0.12, {}),
    ("rw_cluster", "rw_cluster", (0.0550, 0.0040, 0.0335), (0, 0, 0), (0.5, 1, 0.3), 0.16, {}),
    ("star_tracker", "star_tracker", (0.0387, ST_ZY[1], ST_ZY[0]), (0, math.pi / 2, -math.pi / 2), (1, 0.3, 0), 0.18, {}),
    ("ion_engine", "ion_engine", ION_POS, (0, 0, 0), (0, 0, -1), 0.16, {}),
    ("harness", "harness", (0, 0, 0), (0, 0, 0), (0, -1, 0), 0.04, {}),
    ("access_port", "access_port_rbf", (ACCESS_XY[0], ACCESS_XY[1], -PZ_OUT), (-math.pi / 2, 0, 0), (0, 0, -1), 0.10, {}),
    ("switch_a", "deploy_switch", (EX - RAIL / 2, EY - RAIL / 2, -EZ), (0, math.pi, 0), (0, 0, -1), 0.05, {}),
    ("switch_b", "deploy_switch", (-(EX - RAIL / 2), -(EY - RAIL / 2), -EZ), (0, math.pi, 0), (0, 0, -1), 0.05, {}),
    ("spring_a", "separation_spring", (-(EX - RAIL / 2), EY - RAIL / 2, EZ), (0, 0, 0), (0, 0, 1), 0.05, {}),
    ("spring_b", "separation_spring", (EX - RAIL / 2, -(EY - RAIL / 2), EZ), (0, 0, 0), (0, 0, 1), 0.05, {}),
]


def mdplug(node, pos, mate_axis, long_axis, npins=21, mat="plastic_black"):
    """Harness-side micro-D plug + backshell. mate_axis points from the plug INTO the board connector."""
    m = np.asarray(mate_axis, float); l = np.asarray(long_axis, float); s = np.cross(m, l)
    w = (npins // 2 + 3) * 1.27 * MM + 4 * MM
    R = np.eye(4); R[:3, 0], R[:3, 1], R[:3, 2] = s, -m, l     # local +Y = away from the connector
    shell = rbox(6.0 * MM, 6.5 * MM, w + 5 * MM, 1.0 * MM, (0, 3.25 * MM, 0))
    back = rbox(5.0 * MM, 4.0 * MM, w - 2 * MM, 1.5 * MM, (0, 8.0 * MM, 0))
    for mesh, mt in ((shell, "nickel"), (back, mat)):
        mesh.apply_transform(R); mesh.apply_translation(pos); node.add(mt, mesh)
    for k in (-1, 1):
        sc = cyl(0.9 * MM, 4 * MM, pos=(0, 3 * MM, k * (w / 2 + 1.6 * MM)), seg=8)
        sc.apply_transform(R); sc.apply_translation(pos); node.add("steel_black", sc)
    return np.asarray(pos) + R[:3, :3] @ np.array([0, 10 * MM, 0])


def cable_run(node, pts, r=1.6 * MM, mat="sleeve_white", ties=0.025, bend=5 * MM):
    path = route(pts, bend, 6)
    node.add(mat, tube(path, r, 10))
    # cable ties at regular arc length
    seg = np.linalg.norm(np.diff(path, axis=0), axis=1)
    acc = np.concatenate([[0], np.cumsum(seg)])
    for s in np.arange(ties * 0.6, acc[-1] - 0.004, ties):
        i = np.searchsorted(acc, s) - 1
        i = max(0, min(i, len(path) - 2))
        d = path[i + 1] - path[i]; d /= np.linalg.norm(d)
        p = path[i] + d * (s - acc[i])
        node.add("plastic_black", ring(r + 0.02 * MM, r + 0.5 * MM, 1.6 * MM, axis=tuple(d), pos=tuple(p), seg=12))
    return path


@part("harness", "Spacecraft harness: braided bundles with micro-D plugs, backshells, lacing ties (built for assembly_6u)",
      1, "avionics", "spacecraft centre (same frame as frame_6u); routes match assembly_6u.json")
def b_harness(root):
    # backplane connectors J1..J3 (see backplane mounts)
    jx = BP[0] + 0.046 - 6.5 * MM + 5.9 * MM + 0.2 * MM      # mating face of the board connectors
    jy = BP[1] + PCT + 3.3 * MM
    J = [BP[2] + z for z in BP_J]
    ends = [mdplug(root, (jx, jy, z), (-1, 0, 0), (0, 0, 1)) for z in J]
    # equipment-side plugs
    ion_c = (ION_POS[0] - 0.045 - 5.9 * MM - 0.2 * MM, ION_POS[1] - 0.015, ION_POS[2] + 0.092)
    p_ion = mdplug(root, ion_c, (1, 0, 0), (0, 0, 1), 15)
    trx_c = (TRX_POS[0], TRX_POS[1] + 0.021, TRX_POS[2] + 0.044 + 5.9 * MM + 0.2 * MM)
    p_trx = mdplug(root, trx_c, (0, 0, -1), (1, 0, 0), 15)
    ir_c = (IR_POS[0] - 0.034 - 5.9 * MM - 0.2 * MM, IR_POS[1] - 0.014, IR_POS[2] + 0.056)
    p_ir = mdplug(root, ir_c, (1, 0, 0), (0, 1, 0), 15)
    cam_c = (CAM_POS[0] + 0.023 + 5.9 * MM + 0.2 * MM, CAM_POS[1] + 0.006, CAM_POS[2] + 0.015)
    p_cam = mdplug(root, cam_c, (-1, 0, 0), (0, 0, 1), 15)
    xc = 0.0016        # channel centreline
    # J1 -> ion engine PPU
    cable_run(root, [ends[0], (xc, jy + 2 * MM, J[0] - 0.006), (xc, -0.0215, -0.090), (xc, -0.019, ion_c[2] + 0.004), tuple(p_ion)], 1.5 * MM)
    # J2 -> transponder + IR spectrometer (Y split)
    split = (xc, -0.0265, 0.0665)
    cable_run(root, [ends[1], (xc, jy + 2 * MM, J[1] + 0.008), (xc, -0.0265, 0.020), split], 1.8 * MM)
    cable_run(root, [split, (p_trx[0], -0.0265, 0.0665), tuple(p_trx)], 1.3 * MM, ties=0.02)
    cable_run(root, [split, (xc, -0.0240, 0.095), (xc - 0.003, -0.016, ir_c[2] - 0.010), (p_ir[0] - 0.003, p_ir[1], ir_c[2] - 0.002), tuple(p_ir)], 1.3 * MM, ties=0.02)
    # J3 -> camera
    cable_run(root, [ends[2], (xc, jy + 2.5 * MM, J[2] + 0.008), (xc, -0.0205, 0.050), (xc, -0.010, 0.068), (xc - 0.004, 0.003, p_cam[2]), tuple(p_cam)], 1.5 * MM)
    root.add("accent_avionics", ring(1.82 * MM, 2.3 * MM, 3 * MM, axis=(0, 0, 1), pos=(xc, -0.0265, 0.030), seg=12))
    root.mount("mount_backplane_j1", (jx, jy, J[0]))


def write_assembly():
    inst = []
    for iid, pid, pos, eul, d, dist, extra in ASSEMBLY:
        dv = np.asarray(d, float)
        n = np.linalg.norm(dv)
        rec = {"id": iid, "part": pid, "file": pid + ".glb", "position": [round(float(v), 5) for v in pos],
               "rotation_euler_xyz": [round(float(v), 6) for v in eul],
               "explode": {"direction": [round(float(v), 4) for v in (dv / n if n > 0 else dv)], "distance": dist}}
        rec.update(extra)
        inst.append(rec)
    with open(os.path.join(OUT, "assembly_6u.json"), "w") as f:
        json.dump({"name": "Lunar mapper 6U - reference build", "units": "metres", "frame": "Y up, +Z instrument end",
                   "envelope_m": ENVELOPE, "envelope_min": [-EX, -EY, -EZ], "envelope_max": [EX, EY, EZ],
                   "pose_for_checks": "stowed (deployable nodes use extras.stowed)",
                   "notes": "panel_nx is replaced by radiator_panel; explode = position + direction * distance * t",
                   "instances": inst}, f, indent=1)

# === PARTS END ===

# =====================================================================================
# 5. EXPORT: GLBs + parts.json + assembly_6u.json
# =====================================================================================
HOOK_MATS = ("led_glow", "ion_glow", "laser_emitter", "iodine")


def _part_stats(root):
    lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
    mounts, spins, deploy, hooks = [], [], [], set()
    for node, M_, path in root.walk():
        for mname, lst in node.geo.items():
            if mname in HOOK_MATS:
                hooks.add(mname)
            for m in lst:
                v = trimesh.transform_points(m.vertices, M_)
                lo = np.minimum(lo, v.min(0)); hi = np.maximum(hi, v.max(0))
        rec = {"node": node.name, "position": [round(float(x), 5) for x in M_[:3, 3]]}
        if node.name.startswith("mount_"):
            rec["rotation_euler_xyz"] = [round(float(x), 5) for x in trimesh.transformations.euler_from_matrix(M_, "sxyz")]
            mounts.append(rec)
        if node.name.startswith("spin_"):
            ax = M_[:3, :3] @ np.array([0, 1.0, 0])
            spins.append({"node": node.name, "axis_in_part": [round(float(x), 4) for x in ax], "position": rec["position"]})
        if node.extras and "stowed" in node.extras:
            deploy.append({"node": node.name, "stowed": node.extras["stowed"], "deployed": [round(x, 5) for x in node.e]})
    return lo, hi, mounts, spins, deploy, sorted(hooks)


def build_all(only=None):
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    old = {}
    pj = os.path.join(OUT, "parts.json")
    if only and os.path.exists(pj):
        old = {p["id"]: p for p in json.load(open(pj))["parts"]}
    for pid, d in PARTS.items():
        if only and pid not in only:
            if pid in old:
                manifest.append(old[pid])
            continue
        root = Node(pid)
        extra = d["fn"](root) or {}
        tris, size = write_glb(os.path.join(OUT, pid + ".glb"), root)
        lo, hi, mounts, spins, deploy, hooks = _part_stats(root)
        rec = {"id": pid, "file": pid + ".glb", "label": d["label"], "tier": d["tier"], "subsystem": d["subsystem"],
               "origin": d["origin"], "size_m": [round(float(x), 4) for x in (hi - lo)],
               "bounds_min": [round(float(x), 4) for x in lo], "bounds_max": [round(float(x), 4) for x in hi],
               "triangles": int(tris), "bytes": int(size), "mounts": mounts,
               "animation": {"spin": spins, "deployables": deploy, "material_hooks": hooks}}
        rec.update(extra)
        manifest.append(rec)
        print(f"{pid:28s} {tris:6d} tris {size / 1024:7.1f} KB  size {np.round((hi - lo) * 1000).astype(int)} mm")
    with open(pj, "w") as f:
        json.dump({"units": "metres", "up": "+Y", "front": "+Z (instrument end)", "envelope_6u_m": ENVELOPE,
                   "stowed_convention": "node extras.stowed = local Euler XYZ (radians) in stowed pose; exported pose is deployed",
                   "parts": manifest}, f, indent=1)
    if "ASSEMBLY" in globals():
        write_assembly()


if __name__ == "__main__":
    only = [a for a in sys.argv[2:]] if len(sys.argv) > 2 else None
    build_all(only)
