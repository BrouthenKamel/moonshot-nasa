#!/usr/bin/env python3
"""
check_kit.py - verifies the delivered kit (reads the GLB files themselves, not the build script).

    python3 check_kit.py [kit_dir]          exit code 0 = PASS, 1 = FAIL

Checks
  1. budgets: <= 30,000 triangles and <= 600 KB per part, <= 12 MB for all GLBs, no Draco,
     embedded images <= 1024 px, no external URIs.
  2. assembly_6u.json in the STOWED pose (node extras.stowed applied, hidden_nodes skipped):
     a. every vertex inside the 6U envelope  0.2263 x 0.100 x 0.366 m (tolerance 0)
     b. no two instances interpenetrate by more than 1 mm: every closed shell of instance A is
        intersected (exact mesh boolean, manifold3d) with every shell of instance B whose bounding
        boxes overlap by > 1 mm on all axes; FAIL if an intersection's smallest extent > 1 mm.
  3. z-fighting: coplanar same-facing triangles from different shells of one part that overlap.
"""
import io, json, os, struct, sys
import numpy as np
import trimesh
import manifold3d as mf
from PIL import Image

KIT = sys.argv[1] if len(sys.argv) > 1 else "spacecraft_kit"
TOL = 0.001
MAX_TRIS, MAX_BYTES, MAX_TOTAL = 30000, 600 * 1024, 12 * 1024 * 1024
out_lines = []


def say(s=""):
    print(s)
    out_lines.append(s)


# ---------------------------------------------------------------- GLB reader
def read_glb(path):
    b = open(path, "rb").read()
    magic, ver, length = struct.unpack("<III", b[:12])
    assert magic == 0x46546C67 and ver == 2
    jl, jt = struct.unpack("<II", b[12:20])
    gl = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl, bt = struct.unpack("<II", b[off:off + 8])
    blob = b[off + 8:off + 8 + bl]
    return gl, blob


def accessor(gl, blob, i):
    a = gl["accessors"][i]
    bv = gl["bufferViews"][a["bufferView"]]
    comp = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a["componentType"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
    start = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    arr = np.frombuffer(blob, comp, a["count"] * n, start)
    return arr.reshape(a["count"], n) if n > 1 else arr


def node_matrix(nd, stowed):
    M = np.eye(4)
    if "matrix" in nd:
        return np.array(nd["matrix"]).reshape(4, 4).T
    if stowed and nd.get("extras", {}).get("stowed") is not None:
        e = nd["extras"]["stowed"]
        R = trimesh.transformations.euler_matrix(e[0], e[1], e[2], "sxyz")
    elif "rotation" in nd:
        x, y, z, w = nd["rotation"]
        R = trimesh.transformations.quaternion_matrix([w, x, y, z])
    else:
        R = np.eye(4)
    S = np.diag(list(nd.get("scale", [1, 1, 1])) + [1])
    M = R @ S
    M[:3, 3] = nd.get("translation", [0, 0, 0])
    return M


def part_meshes(path, stowed=True, hidden=()):
    """-> list of (node_name, material, world-in-part trimesh)"""
    gl, blob = read_glb(path)
    res = []

    def walk(i, P, skip):
        nd = gl["nodes"][i]
        skip = skip or nd.get("name") in hidden
        M = P @ node_matrix(nd, stowed)
        if "mesh" in nd and not skip:
            for pr in gl["meshes"][nd["mesh"]]["primitives"]:
                V = accessor(gl, blob, pr["attributes"]["POSITION"]).astype(float)
                F = accessor(gl, blob, pr["indices"]).reshape(-1, 3).astype(np.int64)
                m = trimesh.Trimesh(V, F, process=False)
                m.apply_transform(M)
                mat = gl["materials"][pr["material"]]["name"] if "material" in pr else "?"
                res.append((nd.get("name"), mat, m))
        for c in nd.get("children", []):
            walk(c, M, skip)
    for r in gl["scenes"][gl.get("scene", 0)]["nodes"]:
        walk(r, np.eye(4), False)
    return res


def shells(mesh):
    m = mesh.copy()
    m.merge_vertices(merge_tex=True, merge_norm=True)
    return [c for c in m.split(only_watertight=False) if len(c.faces) >= 4]


def to_manifold(m):
    def mk(mm):
        return mf.Manifold(mf.Mesh(vert_properties=np.asarray(mm.vertices, np.float32), tri_verts=np.asarray(mm.faces, np.uint32)))
    if m.is_watertight and m.is_winding_consistent:
        man = mk(m)
        if man.status() == mf.Error.NoError and not man.is_empty():
            return man, False
    h = m.convex_hull
    return mk(h), True


# ---------------------------------------------------------------- 1. budgets
def check_budgets(parts):
    ok = True
    total = 0
    say("== 1. Budgets (per part <= 30,000 tris and <= 600 KB; kit <= 12 MB) ==")
    for p in parts:
        path = os.path.join(KIT, p["file"])
        size = os.path.getsize(path)
        total += size
        gl, blob = read_glb(path)
        tris = sum(gl["accessors"][pr["indices"]]["count"] // 3 for m in gl.get("meshes", []) for pr in m["primitives"])
        bad = []
        if tris > MAX_TRIS:
            bad.append("tris")
        if size > MAX_BYTES:
            bad.append("size")
        if "KHR_draco_mesh_compression" in json.dumps(gl.get("extensionsUsed", [])):
            bad.append("draco")
        for im in gl.get("images", []):
            if "uri" in im:
                bad.append("external-uri")
            else:
                bv = gl["bufferViews"][im["bufferView"]]
                data = blob[bv.get("byteOffset", 0):bv.get("byteOffset", 0) + bv["byteLength"]]
                w, h = Image.open(io.BytesIO(data)).size
                if max(w, h) > 1024:
                    bad.append(f"image {w}x{h}")
        flag = "FAIL " + ",".join(bad) if bad else "ok"
        ok &= not bad
        say(f"  {p['id']:28s} {tris:6d} tris  {size / 1024:6.1f} KB  {flag}")
    flag = "ok" if total <= MAX_TOTAL else "FAIL"
    ok &= total <= MAX_TOTAL
    say(f"  TOTAL {len(parts)} parts  {total / 1024 / 1024:.2f} MB  {flag}")
    return ok


# ---------------------------------------------------------------- 2. assembly
def check_assembly(asm):
    say("\n== 2. Assembly in stowed pose: envelope + interpenetration > 1 mm ==")
    lo, hi = np.array(asm["envelope_min"]), np.array(asm["envelope_max"])
    inst = []
    ok = True
    for it in asm["instances"]:
        M = trimesh.transformations.euler_matrix(*it["rotation_euler_xyz"], "sxyz")
        M[:3, 3] = it["position"]
        sh = []
        for node, mat, m in part_meshes(os.path.join(KIT, it["file"]), True, set(it.get("hidden_nodes", []))):
            m.apply_transform(M)
            for c in shells(m):
                sh.append((node, mat, c))
        V = np.vstack([c.vertices for _, _, c in sh])
        vmin, vmax = V.min(0), V.max(0)
        out = np.maximum(lo - vmin, 0).max() + np.maximum(vmax - hi, 0).max()
        status = "ok" if (vmin >= lo - 1e-7).all() and (vmax <= hi + 1e-7).all() else f"FAIL pokes out by {out * 1000:.2f} mm"
        if status != "ok":
            ok = False
        say(f"  envelope  {it['id']:16s} min {np.round(vmin * 1000, 1)} max {np.round(vmax * 1000, 1)} mm  {status}")
        boxes = np.array([np.concatenate(c.bounds) for _, _, c in sh])
        inst.append((it["id"], sh, boxes, vmin, vmax))
    say("")
    n_pairs = n_bool = 0
    fails = []
    worst = []
    for a in range(len(inst)):
        for b in range(a + 1, len(inst)):
            ida, sha, ba, amin, amax = inst[a]
            idb, shb, bb, bmin, bmax = inst[b]
            if ((np.minimum(amax, bmax) - np.maximum(amin, bmin)) <= TOL).any():
                continue
            n_pairs += 1
            # broad phase: boxes overlapping by > TOL on every axis
            ov = (np.minimum(ba[:, None, 3:], bb[None, :, 3:]) - np.maximum(ba[:, None, :3], bb[None, :, :3]))
            cand = np.argwhere((ov > TOL).all(-1))
            for i, j in cand:
                n_bool += 1
                ma, hull_a = to_manifold(sha[i][2])
                mb, hull_b = to_manifold(shb[j][2])
                x = ma ^ mb
                if x.is_empty():
                    continue
                bbx = x.bounding_box()
                ext = np.array(bbx[3:]) - np.array(bbx[:3])
                depth = float(ext.min())
                vol = x.volume()
                worst.append((depth, ida, sha[i][0], sha[i][1], idb, shb[j][0], shb[j][1]))
                if depth > TOL and vol > 1e-10:
                    fails.append((depth, vol, ida, sha[i][0], sha[i][1], hull_a, idb, shb[j][0], shb[j][1], hull_b, np.round(np.array(bbx[:3]) * 1000, 1)))
    say(f"  instance pairs with overlapping bounds: {n_pairs}; shell pairs tested with exact booleans: {n_bool}")
    worst.sort(reverse=True)
    if worst:
        say(f"  deepest contact found: {worst[0][0] * 1000:.3f} mm ({worst[0][1]}/{worst[0][2]} vs {worst[0][4]}/{worst[0][5]})")
    if fails:
        ok = False
        fails.sort(reverse=True)
        say(f"  FAIL: {len(fails)} shell intersections deeper than 1 mm:")
        for f in fails[:40]:
            say(f"    {f[0] * 1000:5.2f} mm  {f[2]}/{f[3]}[{f[4]}]{' (hull)' if f[5] else ''}  x  {f[6]}/{f[7]}[{f[8]}]{' (hull)' if f[9] else ''}  at {f[10]} mm")
    else:
        say("  ok: no interpenetration deeper than 1 mm")
    return ok


# ---------------------------------------------------------------- 3. coplanar faces
def winding(tris, p):
    """Generalised winding number of point p w.r.t. a closed triangle soup (vectorised)."""
    a, b, c = tris[:, 0] - p, tris[:, 1] - p, tris[:, 2] - p
    la, lb, lc = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1), np.linalg.norm(c, axis=1)
    det = np.einsum("ij,ij->i", a, np.cross(b, c))
    den = la * lb * lc + np.einsum("ij,ij->i", a, b) * lc + np.einsum("ij,ij->i", b, c) * la + np.einsum("ij,ij->i", c, a) * lb
    return np.arctan2(det, den).sum() / (2 * np.pi)


def check_coplanar(parts, min_area=0.5e-6):
    """Visible z-fighting: same-facing coplanar triangles of different shells that overlap by more than
    0.5 mm^2, where the overlap is NOT hidden (a point just in front of it is not inside another solid -
    i.e. it is not resting against a contact face or buried inside a housing)."""
    from shapely.geometry import Polygon
    from shapely.strtree import STRtree
    say("\n== 3. Visible z-fighting: coplanar same-facing faces overlapping > 0.5 mm^2, not occluded ==")
    total = 0
    for p in parts:
        N_, D_, S_, TRI_, SH = [], [], [], [], []
        sid = 0
        for node, mat, m in part_meshes(os.path.join(KIT, p["file"]), False):
            for c in shells(m):
                SH.append((c.bounds, c.triangles, c.is_watertight))
                big = c.area_faces > 0.2e-6
                if big.any():
                    n = c.face_normals[big]
                    N_.append(n); D_.append(np.einsum("ij,ij->i", n, c.triangles_center[big]))
                    S_.append(np.full(int(big.sum()), sid)); TRI_.append(c.triangles[big])
                sid += 1
        if not N_:
            continue
        N, D, S, TRI = np.vstack(N_), np.concatenate(D_), np.concatenate(S_), np.vstack(TRI_)
        key = np.round(np.hstack([N * 100, D[:, None] * 1e4]))       # ~0.6 deg, 0.1 mm planes
        _, inv = np.unique(key, axis=0, return_inverse=True)
        inv = inv.ravel()
        order = np.argsort(inv)
        hits, area = 0, 0.0
        for g in np.split(order, np.flatnonzero(np.diff(inv[order])) + 1):
            if len(g) < 2 or len(np.unique(S[g])) < 2:
                continue
            n0 = N[g[0]]
            ax = np.argmax(np.abs(n0))
            keep = [i for i in range(3) if i != ax]
            polys = [Polygon(TRI[i][:, keep]) for i in g]
            tree = STRtree(polys)
            for ii, pa in enumerate(polys):
                for jj in tree.query(pa):
                    if jj <= ii or S[g[ii]] == S[g[jj]]:
                        continue
                    ov = pa.intersection(polys[jj])
                    if ov.area <= min_area:
                        continue
                    # z-fighting needs BOTH faces visible: a face buried in (or resting against) any other
                    # solid - including its partner - is occluded. Probe 0.05 mm in front of each face.
                    q = ov.representative_point()
                    hidden = False
                    for fi in (g[ii], g[jj]):
                        pt = np.zeros(3); pt[keep] = (q.x, q.y)
                        pt[ax] = (D[fi] - N[fi][keep[0]] * q.x - N[fi][keep[1]] * q.y) / N[fi][ax]
                        probe = pt + N[fi] * 5e-5
                        for k, (bnd, tri, wt) in enumerate(SH):
                            if k == S[fi] or not wt:
                                continue
                            if (probe >= bnd[0] - 1e-6).all() and (probe <= bnd[1] + 1e-6).all() and abs(winding(tri, probe)) > 0.5:
                                hidden = True
                                break
                        if hidden:
                            break
                    if not hidden:
                        hits += 1
                        area += ov.area
        total += hits
        if hits:
            say(f"  {p['id']:28s} {hits:4d} visible coplanar overlaps, {area * 1e6:8.1f} mm^2")
    say(f"  total: {total}" + ("  ok" if total == 0 else ""))
    return total == 0


if __name__ == "__main__":
    parts = json.load(open(os.path.join(KIT, "parts.json")))["parts"]
    asm = json.load(open(os.path.join(KIT, "assembly_6u.json")))
    r1 = check_budgets(parts)
    r2 = check_assembly(asm)
    r3 = check_coplanar(parts) if "--no-coplanar" not in sys.argv else True
    say("\nRESULT: " + ("PASS" if (r1 and r2 and r3) else "FAIL"))
    with open(os.path.join(KIT, "checker_output.txt"), "w") as f:
        f.write("\n".join(out_lines) + "\n")
    sys.exit(0 if (r1 and r2 and r3) else 1)
