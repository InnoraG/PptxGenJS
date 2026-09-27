# Resale-safe STUB for `nvdiffrast.torch` — see nvdiffrast/__init__.py for why.
#
# TRELLIS.2's o_voxel.postprocess does `import nvdiffrast.torch as dr` at load time,
# so these names must EXIST for the import to succeed. They must never RUN in our
# pipeline (our GLB export samples vertex colors via flex_gemm.grid_sample_3d, MIT).
# Calling any of them is a bug → raise loudly so it can never silently ship
# NVIDIA-licensed rasterization into a sold avatar.

_MSG = (
    "nvdiffrast is intentionally NOT installed in this image (NVIDIA Source Code "
    "License = non-commercial). The resale-safe export path must be used instead "
    "(model3d_app._export_glb_vertexcolor, which samples color at mesh vertices via "
    "flex_gemm.grid_sample_3d). A call reaching this stub means the nvdiffrast texture "
    "bake was re-enabled — do not ship that."
)


class RasterizeCudaContext:
    def __init__(self, *args, **kwargs):
        raise RuntimeError(_MSG)


class RasterizeGLContext:
    def __init__(self, *args, **kwargs):
        raise RuntimeError(_MSG)


def rasterize(*args, **kwargs):
    raise RuntimeError(_MSG)


def rasterize_next_level(*args, **kwargs):
    raise RuntimeError(_MSG)


def interpolate(*args, **kwargs):
    raise RuntimeError(_MSG)


def texture(*args, **kwargs):
    raise RuntimeError(_MSG)


def antialias(*args, **kwargs):
    raise RuntimeError(_MSG)


# Anything else o_voxel might reference (dr.<x>) → a raising callable, never a
# silent no-op. Keeps the import total without pretending to be a real rasterizer.
def __getattr__(name):
    def _blocked(*args, **kwargs):
        raise RuntimeError(f"nvdiffrast.torch.{name} — {_MSG}")

    return _blocked
