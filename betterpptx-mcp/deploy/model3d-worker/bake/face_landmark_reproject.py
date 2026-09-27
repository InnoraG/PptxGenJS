"""Landmark-based source-face re-projection (the resale-safe "best texture" method).

Runs on the worker (MediaPipe FaceMesh, Apache-2.0 + OpenCV, both commercial-OK). Given a to_glb-textured GLB and
the source portrait, it:
  1. detects 468 FaceMesh landmarks on the SOURCE and on a frontal numpy render of the mesh,
  2. estimates a GLOBAL affine (RANSAC) source->mesh from the landmark correspondence — this places the sharp
     source face at the exact scale/rotation/position WITHOUT distorting it to the mesh's soft features (right
     move for a texture *replacement*, vs a per-triangle warp which would chase wrong mesh features),
  3. colour-corrects the source to the baked tone (kills the lighting seam),
  4. builds a precise face-OVAL mask from the FaceMesh oval landmarks (clean boundary, no hairline band),
  5. blends in coherent frontal-image space, then bakes the result back into the UV atlas per head texel + gutter.

Pure texture edit — our own math + the source image, no GAN, no NVIDIA code -> resale-safe.
`run(glb_bytes, image_bytes, debug_dir=None) -> glb_bytes`
"""
import io
import numpy as np
from PIL import Image, ImageFilter

HEAD_FRAC = 0.17
RES = 720


def _bilinear(img, xy):
    H, W = img.shape[:2]
    x = np.clip(xy[..., 0], 0, W - 1); y = np.clip(xy[..., 1], 0, H - 1)
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    x1 = np.clip(x0 + 1, 0, W - 1); y1 = np.clip(y0 + 1, 0, H - 1)
    fx = (x - x0)[..., None]; fy = (y - y0)[..., None]
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy)
            + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy)


def _skin_face_box(img):
    """Rough face bbox via skin colour (upper image) — used to CROP before FaceMesh so a small face in a big
    full-body frame isn't downscaled below the detector's range. Returns (x0,y0,x1,y1) with margin, or None."""
    r, g, b = img[..., 0].astype(float), img[..., 1].astype(float), img[..., 2].astype(float)
    mx = np.maximum.reduce([r, g, b]); mn = np.minimum.reduce([r, g, b])
    sk = (r > 95) & (g > 40) & (b > 20) & (r > g) & (r > b) & (r - g > 12) & (mx - mn > 14)
    H, W = img.shape[:2]; sk[int(H * 0.45):] = False
    if sk.sum() < 50:
        return None

    def de(d):
        pk = int(np.argmax(d)); t = 0.2 * d[pk]; lo = hi = pk
        while lo > 0 and d[lo - 1] > t: lo -= 1
        while hi < len(d) - 1 and d[hi + 1] > t: hi += 1
        return lo, hi
    x0, x1 = de(sk.sum(0)); y0, y1 = de(sk.sum(1))
    mw = (x1 - x0) * 0.7; mh = (y1 - y0) * 0.7                    # generous margin (forehead/chin/ears)
    return (max(int(x0 - mw), 0), max(int(y0 - mh), 0), min(int(x1 + mw), W), min(int(y1 + mh), H))


def _facemesh(img_uint8, box=None):
    """Return (478,2) landmark px (full-image coords) or None. If box=(x0,y0,x1,y1), detect on that crop and
    offset back — makes a small face detectable."""
    import mediapipe as mp
    ox0 = oy0 = 0; sub = img_uint8
    if box is not None:
        ox0, oy0, x1, y1 = box; sub = img_uint8[oy0:y1, ox0:x1]
    sub = np.ascontiguousarray(sub)
    with mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1,
                                         refine_landmarks=True, min_detection_confidence=0.3) as fm:
        res = fm.process(sub)
    if not res.multi_face_landmarks:
        return None
    H, W = sub.shape[:2]
    return np.array([[p.x * W + ox0, p.y * H + oy0] for p in res.multi_face_landmarks[0].landmark], np.float64)


def _oval_indices():
    import mediapipe as mp
    edges = mp.solutions.face_mesh.FACEMESH_FACE_OVAL
    return sorted({i for e in edges for i in e})


def run(glb_bytes, image_bytes, debug_dir=None, front_sign=1.0):
    import cv2
    import trimesh

    sc = trimesh.load(io.BytesIO(glb_bytes), file_type="glb", process=False)
    mesh = sc if isinstance(sc, trimesh.Trimesh) else list(sc.geometry.values())[0]
    V = np.asarray(mesh.vertices, np.float64); F = np.asarray(mesh.faces, np.int64)
    uv = np.asarray(mesh.visual.uv, np.float64); N = np.asarray(mesh.vertex_normals, np.float64)
    tex = np.asarray(mesh.visual.material.baseColorTexture.convert("RGB"), np.float64)
    TH, TW = tex.shape[:2]

    ymin, ymax = V[:, 1].min(), V[:, 1].max()
    head_y = ymax - HEAD_FRAC * (ymax - ymin)
    head_vert = V[:, 1] >= head_y
    Fh = F[head_vert[F].all(1)]
    hp = V[head_vert]
    rx0, rx1 = hp[:, 0].min(), hp[:, 0].max(); ry0, ry1 = hp[:, 1].min(), hp[:, 1].max()
    scl = (RES * 0.86) / max(rx1 - rx0, ry1 - ry0)
    ox = RES / 2 - (rx0 + rx1) / 2 * scl; oy = RES / 2 + (ry0 + ry1) / 2 * scl

    def to_render(P):
        return np.stack([P[..., 0] * scl + ox, -P[..., 1] * scl + oy], axis=-1)

    def render_mesh(texture):
        img = np.full((RES, RES, 3), 245.0); zb = np.full((RES, RES), -1e9)
        for tri in Fh:
            p3 = V[tri]; t = uv[tri].copy(); t[:, 1] = 1 - t[:, 1]
            s = to_render(p3); sz = front_sign * p3[:, 2]
            x0 = max(int(np.floor(s[:, 0].min())), 0); x1 = min(int(np.ceil(s[:, 0].max())), RES - 1)
            y0 = max(int(np.floor(s[:, 1].min())), 0); y1 = min(int(np.ceil(s[:, 1].max())), RES - 1)
            if x1 < x0 or y1 < y0: continue
            xx, yy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            d = (s[1, 1] - s[2, 1]) * (s[0, 0] - s[2, 0]) + (s[2, 0] - s[1, 0]) * (s[0, 1] - s[2, 1])
            if abs(d) < 1e-9: continue
            a = ((s[1, 1] - s[2, 1]) * (xx - s[2, 0]) + (s[2, 0] - s[1, 0]) * (yy - s[2, 1])) / d
            b = ((s[2, 1] - s[0, 1]) * (xx - s[2, 0]) + (s[0, 0] - s[2, 0]) * (yy - s[2, 1])) / d
            c = 1 - a - b; ins = (a >= 0) & (b >= 0) & (c >= 0)
            if not ins.any(): continue
            ai, bi, ci = a[ins], b[ins], c[ins]
            z = ai * sz[0] + bi * sz[1] + ci * sz[2]
            uu = (ai * t[0, 0] + bi * t[1, 0] + ci * t[2, 0]) * (TW - 1)
            vv = (ai * t[0, 1] + bi * t[1, 1] + ci * t[2, 1]) * (TH - 1)
            col = _bilinear(texture, np.stack([uu, vv], -1))
            yi, xi = yy[ins], xx[ins]; bt = z > zb[yi, xi]
            yi, xi = yi[bt], xi[bt]; zb[yi, xi] = z[bt]; img[yi, xi] = col[bt]
        return img

    baked_render = render_mesh(tex)

    # --- landmarks ---
    src_uint8 = np.asarray(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
    src = src_uint8.astype(np.float64)
    src_lms = _facemesh(src_uint8, box=_skin_face_box(src_uint8))
    if src_lms is None:
        src_lms = _facemesh(src_uint8)
    mesh_lms = _facemesh(baked_render.clip(0, 255).astype(np.uint8))
    if src_lms is None:
        raise RuntimeError("FaceMesh found no face in the SOURCE image (even after face-crop)")
    used = "landmark-affine"
    if mesh_lms is not None:
        M, _ = cv2.estimateAffine2D(src_lms.astype(np.float32), mesh_lms.astype(np.float32),
                                    method=cv2.RANSAC, ransacReprojThreshold=8.0)
    else:
        # fallback: affine from the source face-oval bbox -> mesh front-facing skin verts bbox (render space)
        used = "box-fallback (no mesh landmarks)"
        ov = _oval_indices()
        sb = src_lms[ov]
        hv = head_vert & (front_sign * N[:, 2] > 0.2)
        huv = uv[hv].copy(); huv[:, 1] = 1 - huv[:, 1]
        hcol = _bilinear(tex, np.stack([huv[:, 0] * (TW - 1), huv[:, 1] * (TH - 1)], -1))
        r, g, b = hcol[:, 0], hcol[:, 1], hcol[:, 2]
        mm = np.maximum.reduce([r, g, b]); nn = np.minimum.reduce([r, g, b])
        sk = (r > 95) & (g > 40) & (r > g) & (r > b) & (r - g > 10) & (mm - nn > 12)
        rr = to_render(V[hv][sk] if sk.sum() > 30 else V[hv])
        src_box = np.array([[sb[:, 0].min(), sb[:, 1].min()], [sb[:, 0].max(), sb[:, 1].min()],
                            [sb[:, 0].max(), sb[:, 1].max()]], np.float32)
        dst_box = np.array([[np.percentile(rr[:, 0], 4), np.percentile(rr[:, 1], 4)],
                            [np.percentile(rr[:, 0], 96), np.percentile(rr[:, 1], 4)],
                            [np.percentile(rr[:, 0], 96), np.percentile(rr[:, 1], 96)]], np.float32)
        M = cv2.getAffineTransform(src_box, dst_box)

    # warp source -> render space
    src_warp = cv2.warpAffine(src, M, (RES, RES), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    # face-oval mask (source oval landmarks -> render space -> filled + feathered)
    ov = _oval_indices()
    oval_src = src_lms[ov].astype(np.float32)
    oval_dst = cv2.transform(oval_src[None], M)[0]
    # order oval points by angle for a clean convex-ish polygon
    ctr = oval_dst.mean(0); ang = np.arctan2(oval_dst[:, 1] - ctr[1], oval_dst[:, 0] - ctr[0])
    poly = oval_dst[np.argsort(ang)].astype(np.int32)
    maskimg = np.zeros((RES, RES), np.uint8); cv2.fillPoly(maskimg, [poly], 255)
    mask = np.asarray(Image.fromarray(maskimg).filter(ImageFilter.GaussianBlur(RES * 0.02)), np.float64) / 255.0
    mask = np.clip((mask - 0.15) / 0.6, 0, 1)[..., None]

    # colour-correct source to baked tone in the overlap
    om = (mask[..., 0] > 0.5) & (baked_render.sum(-1) < 720) & (src_warp.sum(-1) > 30)
    if om.sum() > 200:
        for ch in range(3):
            bm, bs = baked_render[om, ch].mean(), baked_render[om, ch].std() + 1e-3
            sm, ss = src_warp[om, ch].mean(), src_warp[om, ch].std() + 1e-3
            src_warp[..., ch] = (src_warp[..., ch] - sm) * (0.6 * bs / ss + 0.4) + (0.7 * bm + 0.3 * sm)
    combined = mask * src_warp + (1 - mask) * baked_render

    # bake combined (render space) back into the UV atlas per head texel
    newtex = tex.copy(); touched = np.zeros((TH, TW), bool)
    for tri in Fh:
        p = V[tri]; t = uv[tri].copy(); t[:, 1] = 1 - t[:, 1]
        px = t[:, 0] * (TW - 1); py = t[:, 1] * (TH - 1)
        x0 = max(int(np.floor(px.min())), 0); x1 = min(int(np.ceil(px.max())), TW - 1)
        y0 = max(int(np.floor(py.min())), 0); y1 = min(int(np.ceil(py.max())), TH - 1)
        if x1 < x0 or y1 < y0: continue
        xx, yy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        d = (py[1] - py[2]) * (px[0] - px[2]) + (px[2] - px[1]) * (py[0] - py[2])
        if abs(d) < 1e-9: continue
        a = ((py[1] - py[2]) * (xx - px[2]) + (px[2] - px[1]) * (yy - py[2])) / d
        b = ((py[2] - py[0]) * (xx - px[2]) + (px[0] - px[2]) * (yy - py[2])) / d
        c = 1 - a - b; ins = (a >= -1e-3) & (b >= -1e-3) & (c >= -1e-3)
        if not ins.any(): continue
        ai, bi, ci = a[ins], b[ins], c[ins]
        P = ai[:, None] * p[0] + bi[:, None] * p[1] + ci[:, None] * p[2]
        nn2 = ai[:, None] * N[tri[0]] + bi[:, None] * N[tri[1]] + ci[:, None] * N[tri[2]]
        rp = to_render(P)
        col = _bilinear(combined, rp)
        m = _bilinear(mask, rp)[:, 0] * np.clip((front_sign * nn2[:, 2] - 0.05) / 0.4, 0, 1)
        yi, xi = yy[ins], xx[ins]
        newtex[yi, xi] = m[:, None] * col + (1 - m[:, None]) * tex[yi, xi]
        touched[yi, xi] |= m > 0.05
    for _ in range(4):
        grow = np.zeros_like(touched)
        for sh, ax in [(1, 0), (-1, 0), (1, 1), (-1, 1)]:
            take = np.roll(touched, sh, ax) & ~touched & ~grow
            newtex[take] = np.roll(newtex, sh, ax)[take]; grow |= take
        touched |= grow

    if debug_dir:
        import os
        os.makedirs(debug_dir, exist_ok=True)
        def sv(a, n): Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(os.path.join(debug_dir, n))
        dbg = baked_render.copy()
        if mesh_lms is not None:
            for x, y in mesh_lms.astype(int): cv2.circle(dbg, (x, y), 1, (255, 0, 0), -1)
        sv(dbg, "mesh_landmarks.png"); sv(src_warp, "src_warp.png")
        sv((mask[..., 0] * 255)[..., None].repeat(3, -1), "mask.png"); sv(combined, "combined.png")

    mesh.visual.material.baseColorTexture = Image.fromarray(newtex.clip(0, 255).astype(np.uint8))
    after_render = render_mesh(newtex)
    buf = io.BytesIO(); mesh.export(buf, file_type="glb")
    return buf.getvalue(), {"align": used, "haveMeshLandmarks": mesh_lms is not None,
                            "touched": int(touched.sum())}, baked_render, after_render, src
