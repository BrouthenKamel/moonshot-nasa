"""
Generates swappable low-poly rocket parts as GLB files.

CONVENTIONS (same for every part, so parts can swap without re-positioning):
  - Y is up, units are "body radii": the core rocket body radius is 1.0
  - Stack parts (stage1, stage2, nose) have their origin at the BOTTOM CENTER
    and extend upward. Their height is listed in parts.json.
  - Engines have their origin at their TOP CENTER (the mounting plate)
    and extend downward (negative Y).
  - Fins and boosters share the origin of stage1 (bottom center of stage1),
    so you place them at exactly the same position as stage1.
"""
import json, math, os
import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual import TextureVisuals

OUT = "/home/claude/rocket_parts"
os.makedirs(OUT, exist_ok=True)
SEG = 48  # radial segments

# palette
WHITE = (0.93, 0.93, 0.95, 1)
LIGHT = (0.80, 0.82, 0.86, 1)
GREY = (0.45, 0.47, 0.52, 1)
DARK = (0.16, 0.17, 0.20, 1)
BLACK = (0.08, 0.08, 0.09, 1)
ORANGE = (0.93, 0.46, 0.13, 1)
RED = (0.80, 0.16, 0.14, 1)
BLUE = (0.13, 0.32, 0.75, 1)
GOLD = (0.85, 0.65, 0.25, 1)
COPPER = (0.72, 0.40, 0.22, 1)


def mat(mesh, color, metal=0.1, rough=0.6, name=None):
    m = mesh.copy()
    m.visual = TextureVisuals(material=PBRMaterial(
        name=name or "mat", baseColorFactor=[int(c * 255) for c in color],
        metallicFactor=metal, roughnessFactor=rough))
    return m


def revolve(profile, color, **kw):
    """profile: list of (radius, y) from bottom to top. Revolves around Y."""
    pts = np.array(profile, dtype=float)
    m = trimesh.creation.revolve(pts, sections=SEG)
    # revolve builds around Z axis with (r, z); rotate Z-up -> Y-up
    m.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    m.fix_normals()
    return mat(m, color, **kw)


def cyl(r, y0, y1, color, **kw):
    return revolve([(0, y0), (r, y0), (r, y1), (0, y1)], color, **kw)


def band(r, y0, y1, color, **kw):
    # thin ring slightly proud of the body, for stripes
    return cyl(r + 0.01, y0, y1, color, **kw)


def box(size, center, color, **kw):
    m = trimesh.creation.box(extents=size)
    m.apply_translation(center)
    return mat(m, color, **kw)


def rotY(mesh, ang):
    m = mesh.copy()
    m.apply_transform(trimesh.transformations.rotation_matrix(ang, [0, 1, 0]))
    return m


def fin_mesh(root, tip, span, sweep, thick, color):
    """Flat fin in the XY plane sticking out along +X from x=1 (body surface)."""
    x0 = 0.98
    pts2d = [(x0, 0), (x0, root), (x0 + span, sweep + tip), (x0 + span, sweep)]
    # extrude polygon along Z
    from shapely.geometry import Polygon
    poly = Polygon(pts2d)
    m = trimesh.creation.extrude_polygon(poly, thick)
    m.apply_translation([0, 0, -thick / 2])
    return mat(m, color)


manifest = []


def save(pid, category, label, meshes, height, extra=None):
    scene = trimesh.Scene()
    for i, m in enumerate(meshes):
        scene.add_geometry(m, node_name=f"{pid}_{i}", geom_name=f"{pid}_{i}")
    path = os.path.join(OUT, f"{pid}.glb")
    scene.export(path)
    info = {"id": pid, "category": category, "label": label,
            "file": f"{pid}.glb", "height": round(height, 3)}
    if extra:
        info.update(extra)
    manifest.append(info)


# ---------------- ENGINES (origin at top, extend down) ----------------
def bell(r_throat, r_exit, length, y_top, color=COPPER):
    prof = []
    n = 12
    for i in range(n + 1):
        t = i / n
        r = r_throat + (r_exit - r_throat) * (t ** 0.6)
        prof.append((r, y_top - length * t))
    prof = prof[::-1]  # bottom->top
    # make it a thin shell: outer then inner
    outer = prof
    inner = [(max(r - 0.04, 0.01), y) for r, y in prof[::-1]]
    return revolve(outer + inner, color, metal=0.8, rough=0.35)


def engine_single():
    parts = [cyl(0.9, -0.25, 0, DARK, metal=0.6),            # thrust structure
             cyl(0.35, -0.55, -0.25, GREY, metal=0.7),        # turbopump housing
             bell(0.25, 0.75, 1.4, -0.55)]
    return parts, 1.95


def engine_cluster3():
    parts = [cyl(0.95, -0.25, 0, DARK, metal=0.6)]
    for k in range(3):
        a = k * 2 * math.pi / 3
        off = np.array([0.52 * math.cos(a), 0, 0.52 * math.sin(a)])
        for m in [cyl(0.18, -0.45, -0.25, GREY, metal=0.7), bell(0.14, 0.4, 0.9, -0.45)]:
            m.apply_translation(off)
            parts.append(m)
    return parts, 1.35


def engine_cluster9():
    parts = [cyl(0.97, -0.25, 0, DARK, metal=0.6)]
    offs = [(0, 0)] + [(0.62 * math.cos(k * math.pi / 4), 0.62 * math.sin(k * math.pi / 4)) for k in range(8)]
    for x, z in offs:
        for m in [cyl(0.1, -0.4, -0.25, GREY, metal=0.7), bell(0.08, 0.25, 0.7, -0.4)]:
            m.apply_translation([x, 0, z])
            parts.append(m)
    return parts, 1.1


def engine_vacuum():
    parts = [cyl(0.9, -0.2, 0, DARK, metal=0.6),
             cyl(0.3, -0.5, -0.2, GREY, metal=0.7),
             bell(0.2, 0.95, 2.0, -0.5, color=(0.55, 0.55, 0.6, 1))]
    return parts, 2.5


for pid, label, fn in [("engine_single", "Single Bell Engine", engine_single),
                       ("engine_cluster3", "Triple Engine Cluster", engine_cluster3),
                       ("engine_cluster9", "Nine Engine Cluster", engine_cluster9),
                       ("engine_vacuum", "Large Vacuum Engine", engine_vacuum)]:
    meshes, h = fn()
    save(pid, "engine", label, meshes, h, {"origin": "top", "extends": "down"})


# ---------------- FIRST STAGES (origin bottom, extend up) ----------------
def stage1(h, body, stripe, label, pid):
    meshes = [cyl(1.0, 0, h, body)]
    meshes.append(band(1.0, 0, 0.3, stripe))
    meshes.append(band(1.0, h - 0.3, h, stripe))
    meshes.append(band(1.0, h * 0.45, h * 0.45 + 0.15, stripe))
    # raceway / cable tray detail
    meshes.append(box([0.08, h - 0.8, 0.12], [0, h / 2, 1.02], GREY))
    save(pid, "stage1", label, meshes, h, {"origin": "bottom", "extends": "up"})


stage1(6.0, WHITE, BLACK, "Short Core Stage", "stage1_short")
stage1(9.0, WHITE, BLUE, "Medium Core Stage", "stage1_medium")
stage1(12.0, ORANGE, COPPER, "Long Core Stage (foam tank)", "stage1_long")


# ---------------- UPPER STAGES ----------------
def stage2(h, body, stripe, label, pid):
    meshes = [cyl(1.0, 0, 0.4, DARK),          # interstage ring
              cyl(1.0, 0.4, h, body),
              band(1.0, h - 0.2, h, stripe)]
    save(pid, "stage2", label, meshes, h, {"origin": "bottom", "extends": "up"})


stage2(2.5, LIGHT, RED, "Short Upper Stage", "stage2_short")
stage2(4.0, WHITE, BLUE, "Long Upper Stage", "stage2_long")
# "none" option: handled in code (height 0)


# ---------------- NOSE / PAYLOAD ----------------
def ogive(R, L, n=16):
    rho = (R * R + L * L) / (2 * R)
    prof = []
    for i in range(n + 1):
        y = L * i / n
        r = math.sqrt(max(rho * rho - y * y, 0)) + R - rho
        prof.append((max(r, 0), y))
    return prof


def nose_ogive():
    prof = [(0, 0)] + ogive(1.0, 3.0)
    return [revolve(prof, WHITE), band(1.0, 0, 0.15, RED)], 3.0


def nose_cone():
    return [revolve([(0, 0), (1.0, 0), (0.05, 2.5), (0, 2.52)], RED)], 2.52


def nose_fairing():
    # wide payload fairing with boattail: 1.0 -> 1.35
    prof = [(0, 0), (1.0, 0), (1.35, 0.6), (1.35, 3.0)]
    tip = ogive(1.35, 2.4)
    prof += [(r, 3.0 + y) for r, y in tip[1:]]
    return [revolve(prof, WHITE), band(1.35, 2.7, 2.85, BLUE)], 5.4


def nose_capsule():
    meshes = [revolve([(0, 0), (1.0, 0), (1.0, 0.3), (0, 0.3)], GOLD, metal=0.7),  # service adapter
              revolve([(0, 0.3), (1.05, 0.3), (0.55, 1.6), (0.45, 1.7), (0, 1.7)], LIGHT),  # capsule
              cyl(0.12, 1.7, 3.6, RED),                                                 # escape tower
              revolve([(0, 3.6), (0.2, 3.6), (0.02, 4.1), (0, 4.1)], RED)]
    # tower legs
    for k in range(4):
        leg = box([0.06, 0.6, 0.06], [0, 0, 0], DARK)
        leg.apply_transform(trimesh.transformations.rotation_matrix(math.radians(25), [0, 0, 1]))
        leg.apply_translation([0.25, 1.95, 0])
        meshes.append(rotY(leg, k * math.pi / 2))
    return meshes, 4.1


for pid, label, fn in [("nose_ogive", "Ogive Nose Cone", nose_ogive),
                       ("nose_cone", "Conical Nose Cone", nose_cone),
                       ("nose_fairing", "Wide Payload Fairing", nose_fairing),
                       ("nose_capsule", "Crew Capsule + Escape Tower", nose_capsule)]:
    meshes, h = fn()
    save(pid, "nose", label, meshes, h, {"origin": "bottom", "extends": "up"})


# ---------------- FINS (share stage1 origin) ----------------
def fins(count, root, tip, span, sweep, color, pid, label):
    meshes = []
    for k in range(count):
        meshes.append(rotY(fin_mesh(root, tip, span, sweep, 0.08, color), k * 2 * math.pi / count))
    save(pid, "fins", label, meshes, root, {"origin": "stage1_bottom"})


fins(4, 2.2, 0.8, 1.0, 0.9, DARK, "fins_small", "Small Fins (x4)")
fins(4, 3.5, 1.0, 1.8, 2.0, RED, "fins_large", "Large Swept Fins (x4)")
fins(3, 2.8, 0.6, 1.4, 1.6, BLUE, "fins_tri", "Tri Fins (x3)")


# ---------------- BOOSTERS (share stage1 origin) ----------------
def one_booster(h, rb, color):
    ms = [cyl(rb, 0, h, color),
          revolve([(0, h), (rb, h), (0.03, h + rb * 2.2), (0, h + rb * 2.2 + 0.02)], color),
          band(rb, h * 0.5, h * 0.5 + 0.12, DARK),
          band(rb, 0.0, 0.12, DARK),
          bell(rb * 0.35, rb * 0.8, rb * 1.6, 0, color=DARK)]
    # strut
    ms.append(box([0.6, 0.15, 0.15], [-(rb + 0.15), h * 0.8, 0], GREY))
    ms.append(box([0.6, 0.15, 0.15], [-(rb + 0.15), 0.6, 0], GREY))
    return ms


def boosters(count, h, rb, color, pid, label):
    meshes = []
    dist = 1.0 + rb + 0.05
    for k in range(count):
        a = k * 2 * math.pi / count + (math.pi / 4 if count == 4 else 0)
        for m in one_booster(h, rb, color):
            m = m.copy()
            m.apply_translation([dist, 0, 0])
            meshes.append(rotY(m, a))
    save(pid, "boosters", label, meshes, h, {"origin": "stage1_bottom"})


boosters(2, 5.0, 0.45, WHITE, "boosters_2", "2 Solid Boosters")
boosters(4, 4.0, 0.38, LIGHT, "boosters_4", "4 Small Boosters")
boosters(2, 7.5, 0.6, ORANGE, "boosters_2_heavy", "2 Heavy Boosters")

with open(os.path.join(OUT, "parts.json"), "w") as f:
    json.dump({"conventions": __doc__.strip(), "parts": manifest}, f, indent=2)

print(len(manifest), "parts")
for p in manifest:
    print(p["id"], os.path.getsize(os.path.join(OUT, p["file"])) // 1024, "KB")
