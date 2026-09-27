# Resale-safe STUB — this is NOT NVIDIA's nvdiffrast.
#
# The real nvdiffrast (+ nvdiffrec) is under the NVIDIA Source Code License
# ("1-Way Commercial": only NVIDIA/affiliates may use it commercially), which
# would make every avatar we SELL a commercial use of nvdiffrast output → outside
# the grant. So we do NOT install it. TRELLIS.2's o_voxel does `import
# nvdiffrast.torch` at module load, so this stub exists ONLY to satisfy that import.
#
# Our export path (model3d_app._export_glb_vertexcolor) never calls into here — it
# samples color at mesh vertices via flex_gemm.grid_sample_3d (MIT). If anything DID
# call a rasterizer symbol, it raises loudly instead of silently degrading.
__all__ = ["torch"]
