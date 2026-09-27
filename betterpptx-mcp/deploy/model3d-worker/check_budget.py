"""Pre-flight Modal budget guard. Blocks a `modal run` if the profile's THIS-MONTH spend is at/over the cap.

Owner rule (2026-07-11): never spend more than ~$29.50/month per Modal profile (create fresh profiles as needed).
Modal has no hard per-profile cap in the CLI/SDK, so this queries `modal billing report --for "this month" --json`,
sums the cost, and exits non-zero (abort) when spent >= cap. Fail-CLOSED: if the spend can't be read, it BLOCKS
(safer to stop than to overspend) unless BETTERPPTX_BUDGET_FAILOPEN=1.

Usage:  py check_budget.py <profile> [cap]      (default cap = $29.50; or env BETTERPPTX_MODAL_MONTHLY_CAP)
Exit:   0 = under cap (ok to run) · 1 = at/over cap (abort) · 2 = couldn't determine (abort unless fail-open)
"""
import json
import os
import subprocess
import sys

profile = sys.argv[1]
cap = float(sys.argv[2]) if len(sys.argv) > 2 else float(os.environ.get("BETTERPPTX_MODAL_MONTHLY_CAP", "29.50"))
# reserve a headroom so a single run can't tip OVER the cap mid-job (a GPU run can cost a few $).
reserve = float(os.environ.get("BETTERPPTX_MODAL_RUN_RESERVE", "1.50"))
fail_open = os.environ.get("BETTERPPTX_BUDGET_FAILOPEN", "") == "1"

env = dict(os.environ, MODAL_PROFILE=profile, PYTHONUTF8="1", PYTHONWARNINGS="ignore")
try:
    out = subprocess.run([sys.executable, "-m", "modal", "billing", "report", "--for", "this month", "--json"],
                         capture_output=True, text=True, env=env, timeout=90)
    d = json.loads(out.stdout)
    recs = d if isinstance(d, list) else (d.get("data") or d.get("report") or [])
    spent = sum(float((r.get("cost") if isinstance(r, dict) else 0) or 0) for r in recs)
except Exception as e:  # noqa: BLE001
    print(f"[budget] could NOT read {profile} spend ({type(e).__name__}: {e}).", file=sys.stderr)
    if fail_open:
        print("[budget] BETTERPPTX_BUDGET_FAILOPEN=1 -> proceeding anyway.", file=sys.stderr)
        sys.exit(0)
    print("[budget] failing CLOSED (set BETTERPPTX_BUDGET_FAILOPEN=1 to override).", file=sys.stderr)
    sys.exit(2)

limit = cap - reserve
if spent >= limit:
    print(f"[budget] STOP: profile '{profile}' has spent ${spent:.2f} this month "
          f"(cap ${cap:.2f}, run-reserve ${reserve:.2f} -> limit ${limit:.2f}). "
          f"Switch to a FRESH profile (MODAL_PROFILE / -Profile) before running.", file=sys.stderr)
    sys.exit(1)
print(f"[budget] OK: {profile} ${spent:.2f} / ${cap:.2f} this month "
      f"(${limit - spent:.2f} headroom before the ${reserve:.2f} reserve).")
sys.exit(0)
