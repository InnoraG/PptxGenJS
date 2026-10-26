"""Zero-GPU check of every rotated avatar-worker account (owner/maintainer tool).

Per account, using the local Modal profile named after the bundle account id:
  - the deployed `lipsync` web URL equals the URL in the Secret Manager bundle;
  - the deployed `health` web URL equals the derived health URL (lipsync host with
    "-lipsync" replaced by "-health"), or the bundle's explicit HEALTH_URL;
  - GET /health (CPU-only function, never a GPU) answers ok, authConfigured:true, gpu:false,
    and with the bundle bearer token answers authorized:true.
Optional --probe-lipsync-401 also sends one unauthenticated POST to `lipsync` and expects
401. That starts the CPU coordinator container, not a GPU, but costs a cold start.

Usage:
  gcloud secrets versions access latest --secret=betterpptx-avatar-worker-credentials \
    --project=betterpptx-mcp-20260926 --out-file=<tmp>
  py verify_rotation_endpoints.py <tmp> [--probe-lipsync-401] [--only <account-id>]
Then delete <tmp>. Prints only account ids, booleans, statuses and latencies; exits 1 on any failure.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

APP_NAME = "betterpptx-avatar-commercial-production"
PREFIX = "BETTERPPTX_COMMERCIAL_AVATAR_WORKER_"


def derived_health_url(lipsync_url):
    scheme, _, rest = lipsync_url.rstrip("/").partition("://")
    host, _, path = rest.partition("/")
    return f"{scheme}://{host.replace('-lipsync', '-health', 1)}" + (f"/{path}" if path else "")


def http(method, url, token=None, timeout=120):
    request = urllib.request.Request(url, method=method, data=b"" if method == "POST" else None)
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read(), round(time.monotonic() - started, 2)
    except urllib.error.HTTPError as error:
        return error.code, error.read(), round(time.monotonic() - started, 2)


def deployed_urls():
    import modal

    def url(name):
        try:
            return modal.Function.from_name(APP_NAME, name).get_web_url() or ""
        except Exception:  # noqa: BLE001 - an undeployed function is a reported failure
            return ""

    return {"lipsync": url("lipsync"), "health": url("health")}


def check_account(account, probe_lipsync):
    env = account["env"]
    lipsync_url = str(env[f"{PREFIX}URL"]).rstrip("/")
    health_url = str(env.get(f"{PREFIX}HEALTH_URL") or derived_health_url(lipsync_url)).rstrip("/")
    token = str(env[f"{PREFIX}TOKEN"]).strip()
    child = subprocess.run([sys.executable, __file__, "--urls"], capture_output=True, text=True, timeout=180,
                           env=dict(os.environ, MODAL_PROFILE=account["id"], PYTHONWARNINGS="ignore"))
    lines = [line for line in child.stdout.splitlines() if line.startswith("{")]
    deployed = json.loads(lines[-1]) if lines else {}
    result = {
        "lipsyncUrlUnchanged": deployed.get("lipsync", "").rstrip("/") == lipsync_url,
        "healthUrlMatches": deployed.get("health", "").rstrip("/") == health_url,
    }
    status, body, seconds = http("GET", health_url)
    payload = json.loads(body or b"{}") if status == 200 else {}
    result["health"] = {"status": status, "seconds": seconds, "ok": payload.get("ok") is True,
                        "authConfigured": payload.get("authConfigured") is True, "gpu": payload.get("gpu"), "build": payload.get("build")}
    status, body, _ = http("GET", health_url, token=token)
    result["healthAuthorized"] = status == 200 and json.loads(body or b"{}").get("authorized") is True
    if probe_lipsync:
        status, _, seconds = http("POST", lipsync_url + "/", timeout=300)
        result["lipsync401"] = {"status": status, "seconds": seconds}
    ok = (result["lipsyncUrlUnchanged"] and result["healthUrlMatches"] and result["health"]["ok"]
          and result["health"]["authConfigured"] and result["health"]["gpu"] is False and result["healthAuthorized"]
          and (not probe_lipsync or result["lipsync401"]["status"] == 401))
    return ok, result


def main(argv):
    if argv[1:] == ["--urls"]:
        print(json.dumps(deployed_urls()))
        return 0
    bundle = json.load(open(argv[1], encoding="utf-8-sig"))
    probe_lipsync = "--probe-lipsync-401" in argv
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    failed = 0
    for account in bundle["providers"]["avatar-worker-commercial"]["accounts"]:
        if account.get("enabled") is False or (only and account["id"] != only):
            continue
        ok, result = check_account(account, probe_lipsync)
        failed += 0 if ok else 1
        print(f"{account['id']:<26} {'OK  ' if ok else 'FAIL'} {json.dumps(result)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
