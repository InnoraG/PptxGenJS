"""GPU-free check of every rotated avatar-worker account (owner/maintainer tool).

The production endpoint route is the GPU function itself, so any HTTP probe, even an
unauthenticated 401, cold-starts an A10G. This check spends no GPU time. Per account,
using the local Modal profile named after the bundle account id, it verifies:
  - the deployed app's `lipsync` web URL equals the URL in the Secret Manager bundle;
  - the Modal-side endpoint token matches the bundle token, compared by sha256
    fingerprint inside a 0.125-CPU function (a few seconds, well under a cent).

Usage:
  gcloud secrets versions access latest --secret=betterpptx-avatar-worker-credentials \
    --project=betterpptx-mcp-20260926 --out-file=<tmp>
  py verify_rotation_endpoints.py <tmp>
Then delete <tmp>. Prints only account ids and booleans; exits 1 if any account fails.
"""
import hashlib
import json
import os
import subprocess
import sys

APP_NAME = "betterpptx-avatar-commercial-production"
AUTH_SECRET_NAME = "betterpptx-avatar-commercial-auth"
PREFIX = "BETTERPPTX_COMMERCIAL_AVATAR_WORKER_"


def check_current_profile(expected_url, expected_fingerprint):
    import modal

    app = modal.App("betterpptx-avatar-auth-fingerprint-probe")

    @app.function(secrets=[modal.Secret.from_name(AUTH_SECRET_NAME)], cpu=0.125, memory=128, timeout=60, serialized=True)
    def fingerprint() -> str:
        token = os.environ.get("BETTERPPTX_COMMERCIAL_AVATAR_ENDPOINT_TOKEN", "").strip()
        return hashlib.sha256(token.encode()).hexdigest()[:16] if token else "missing"

    url = modal.Function.from_name(APP_NAME, "lipsync").get_web_url() or ""
    with app.run():
        got = fingerprint.remote()
    return {"deployed": bool(url), "urlMatches": url.rstrip("/") == expected_url.rstrip("/"), "tokenMatches": got == expected_fingerprint}


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--one":
        print(json.dumps(check_current_profile(sys.argv[2], sys.argv[3])))
        return 0
    bundle = json.load(open(sys.argv[1], encoding="utf-8-sig"))
    accounts = bundle["providers"]["avatar-worker-commercial"]["accounts"]
    failed = 0
    for account in accounts:
        if account.get("enabled") is False:
            print(f"{account['id']:<26} disabled (skipped)")
            continue
        env = account["env"]
        token = str(env[f"{PREFIX}TOKEN"]).strip()
        fingerprint = hashlib.sha256(token.encode()).hexdigest()[:16]
        child = subprocess.run([sys.executable, __file__, "--one", env[f"{PREFIX}URL"], fingerprint],
                               capture_output=True, text=True, timeout=300,
                               env=dict(os.environ, MODAL_PROFILE=account["id"], PYTHONWARNINGS="ignore"))
        lines = [line for line in child.stdout.splitlines() if line.startswith("{")]
        result = json.loads(lines[-1]) if lines else {"error": "probe failed"}
        ok = result.get("deployed") and result.get("urlMatches") and result.get("tokenMatches")
        failed += 0 if ok else 1
        print(f"{account['id']:<26} {'OK  ' if ok else 'FAIL'} {json.dumps(result)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
