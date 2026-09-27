"""Dev-mode image-to-3D profile ROTATOR (owner rule 2026-07-11).

During research (`modal run`), keep each dedicated image-to-3D Modal profile under a soft DEV threshold ($15) and
rotate to the next fresh profile when one crosses it — this spreads research spend and leaves the $15..$30 band as
headroom. Absolute stop is the $29.50 monthly cap. (The FINAL production deploy goes to ALL profiles; that's separate.)

Prints the CHOSEN profile to stdout (for `MODAL_PROFILE=$(py pick_profile.py)` / the make-presenter wrappers); logs
the reasoning to stderr. Exit 1 (with no stdout) if every profile is exhausted -> create another profile.

Env overrides: BETTERPPTX_IMG3D_POOL (comma list, ordered), BETTERPPTX_DEV_ROTATE_AT ($15),
BETTERPPTX_MODAL_MONTHLY_CAP ($29.50), BETTERPPTX_MODAL_RUN_RESERVE ($1.50).
"""
import json
import os
import subprocess
import sys

POOL = [p.strip() for p in os.environ.get(
    "BETTERPPTX_IMG3D_POOL", "betterxavatar,betterxavatar1,betterxavatar2").split(",") if p.strip()]
DEV_AT = float(os.environ.get("BETTERPPTX_DEV_ROTATE_AT", "15.0"))
CAP = float(os.environ.get("BETTERPPTX_MODAL_MONTHLY_CAP", "29.50"))
RESERVE = float(os.environ.get("BETTERPPTX_MODAL_RUN_RESERVE", "1.50"))


def spend(profile):
    env = dict(os.environ, MODAL_PROFILE=profile, PYTHONUTF8="1", PYTHONWARNINGS="ignore")
    out = subprocess.run([sys.executable, "-m", "modal", "billing", "report", "--for", "this month", "--json"],
                         capture_output=True, text=True, env=env, timeout=90)
    d = json.loads(out.stdout)
    recs = d if isinstance(d, list) else (d.get("data") or d.get("report") or [])
    return sum(float((r.get("cost") if isinstance(r, dict) else 0) or 0) for r in recs)


seen = {}
# Pass 1 (early-stop): first profile under the soft $15 dev threshold.
for p in POOL:
    try:
        s = seen[p] = spend(p)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"[rotate] {p}: spend unreadable ({type(e).__name__}); skipping.\n")
        seen[p] = None
        continue
    if s < DEV_AT:
        sys.stderr.write(f"[rotate] -> {p}  (${s:.2f} < ${DEV_AT:.0f} dev threshold)\n")
        print(p)
        sys.exit(0)
    sys.stderr.write(f"[rotate] {p} ${s:.2f} >= ${DEV_AT:.0f} -> rotate to next\n")

# Pass 2: all over $15 -> use the first still under the HARD cap (dip into the headroom band).
for p in POOL:
    s = seen.get(p)
    if s is not None and s < CAP - RESERVE:
        sys.stderr.write(f"[rotate] all >= ${DEV_AT:.0f}; -> {p}  (${s:.2f} < hard cap ${CAP:.2f})\n")
        print(p)
        sys.exit(0)

sys.stderr.write(f"[rotate] EXHAUSTED: every image-to-3D profile is over the ${CAP:.2f} cap "
                 f"(spends: { {k: (round(v, 2) if v is not None else v) for k, v in seen.items()} }). "
                 f"Create a fresh profile (modal token new) and add it to BETTERPPTX_IMG3D_POOL.\n")
sys.exit(1)
