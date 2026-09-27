#!/usr/bin/env python3
"""Owner-authorized, rollback-safe avatar overlay for the existing Cloud Run service.

Preserves unrelated production configuration and adds only the reviewed avatar
runtime settings, worker credential volume, artifact bucket, and new MCP image.
No secret values are read or printed.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import yaml


def run(args: list[str], *, capture: bool = False) -> str:
    result = subprocess.run(args, check=True, text=True, capture_output=capture)
    return result.stdout if capture else ""


def env_map(container: dict) -> dict[str, dict]:
    return {str(item.get("name")): item for item in container.setdefault("env", []) if item.get("name")}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", default="betterpptx-mcp-staging")
    parser.add_argument("--region", default="us-central1")
    parser.add_argument("--service", default="betterpptx-mcp-staging")
    parser.add_argument("--image", required=True)
    parser.add_argument("--artifact-bucket", default="betterpptx-mcp-staging-artifacts-860007156914")
    parser.add_argument("--secret", default="betterpptx-avatar-worker-credentials")
    parser.add_argument("--unbounded-metered", action="store_true",
                        help="Owner-approved no-cap mode; every GPU-second is still metered and cost-reconciled.")
    parser.add_argument("--daily-gpu-seconds", type=float, default=None,
                        help="Owner-approved positive daily GPU-second budget; omit to keep production rendering fail-closed.")
    args = parser.parse_args()
    if args.unbounded_metered and args.daily_gpu_seconds is not None:
        raise RuntimeError("choose exactly one of --unbounded-metered or --daily-gpu-seconds")
    if args.daily_gpu_seconds is not None:
        if args.daily_gpu_seconds <= 0:
            raise RuntimeError("--daily-gpu-seconds must be positive")
        if args.daily_gpu_seconds < 120:
            raise RuntimeError("--daily-gpu-seconds must cover the reviewed 120-second per-request estimate")
    gcloud = shutil.which("gcloud.cmd") or shutil.which("gcloud")
    if not gcloud:
        raise RuntimeError("gcloud CLI was not found")

    describe = [
        gcloud, "run", "services", "describe", args.service,
        f"--project={args.project}", f"--region={args.region}", "--format=export",
    ]
    old_yaml = run(describe, capture=True)
    old = yaml.safe_load(old_yaml)
    # The export can contain a failed/retired revision in spec.traffic after a
    # previous cutover attempt. Do not ask replace to route to that revision;
    # traffic is moved explicitly after the new revision is ready.
    old.setdefault("spec", {}).pop("traffic", None)
    template = old.setdefault("spec", {}).setdefault("template", {})
    # Exported services carry the current revision name. Reusing it with a
    # changed template causes ALREADY_EXISTS; let Cloud Run allocate a fresh
    # immutable revision for the overlay.
    template.setdefault("metadata", {}).pop("name", None)
    pod = template.setdefault("spec", {})
    containers = pod.setdefault("containers", [])
    if not containers:
        raise RuntimeError("Cloud Run service has no containers")
    container = containers[0]
    container["image"] = args.image

    avatar_env = {
        "BETTERPPTX_PORT": "8080",
        "BETTERPPTX_FFMPEG_PATH": "/usr/bin/ffmpeg",
        "BETTERPPTX_FFPROBE_PATH": "/usr/bin/ffprobe",
        "BETTERPPTX_ENV": "production",
        "BETTERPPTX_DEPLOYMENT_STAGE": "production",
        "BETTERPPTX_VERIFICATION_POLICY": "production-non-rendering",
        "BETTERPPTX_BILLING_PROVIDER": "crypto_credits",
        "BETTERPPTX_BILLING_MODEL": "pay_per_job",
        "BETTERPPTX_BILLING_ENFORCE": "1",
        "BETTERPPTX_MONETIZED_MCP_ENABLED": "1",
        "BETTERPPTX_REQUIRE_SHARED_STORES": "1",
        "BETTERPPTX_X402_STORE": "firestore",
        "BETTERPPTX_X402_RELAYER_LEASE_STORE": "firestore",
        "BETTERPPTX_X402_SETTLEMENT_MODE": "self_settle",
        "BETTERPPTX_INSTALL_USAGE_STORE": "firestore",
        "BETTERPPTX_ENTITLEMENT_STORE": "firestore",
        "BETTERPPTX_ARTIFACT_STORE": "gcs",
        "BETTERPPTX_AVATAR_PROVIDER": "liveportrait-musetalk-commercial",
        "BETTERPPTX_AVATAR_PRODUCTION_ONLY": "1",
        "BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE": "blink",
        "BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE": "jaw",
        "BETTERPPTX_AVATAR_ROTATION_MODE": "deterministic",
        "BETTERPPTX_CREDENTIAL_STORE": "/var/run/secrets/betterpptx/avatar-worker-credentials.json",
        "BETTERPPTX_AVATAR_JOB_STORE": "firestore",
        "BETTERPPTX_FIRESTORE_AVATAR_JOB_COLLECTION": "betterpptx_avatar_jobs",
        "BETTERPPTX_AVATAR_WORKER_STATE_STORE": "firestore",
        "BETTERPPTX_FIRESTORE_AVATAR_WORKER_STATE_COLLECTION": "betterpptx_avatar_worker_state",
        # Quota is fail-closed. The owner must explicitly choose a finite budget
        # or the unbounded-metered mode before promoting a production revision.
        "BETTERPPTX_AVATAR_QUOTA_STATE_STORE": "firestore",
        "BETTERPPTX_FIRESTORE_AVATAR_WORKER_QUOTA_COLLECTION": "betterpptx_avatar_worker_quota",
        "BETTERPPTX_REQUIRE_AVATAR_QUOTA": "1",
        "BETTERPPTX_AVATAR_WORKER_ESTIMATED_GPU_SECONDS": "120",
        "BETTERPPTX_AVATAR_PROVIDER_METROLOGY_STORE": "firestore",
        "BETTERPPTX_FIRESTORE_AVATAR_PROVIDER_METROLOGY_COLLECTION": "betterpptx_avatar_provider_metrology",
        "BETTERPPTX_REQUIRE_PROVIDER_METROLOGY": "1",
        "BETTERPPTX_GEN_ASSET_STORE": "gcs",
        "BETTERPPTX_GEN_ASSET_BUCKET": args.artifact_bucket,
        "BETTERPPTX_GEN_ASSET_GCS_PREFIX": "betterpptx-avatar-artifacts",
    }
    if args.daily_gpu_seconds is not None:
        avatar_env["BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS"] = str(int(args.daily_gpu_seconds) if args.daily_gpu_seconds.is_integer() else args.daily_gpu_seconds)
    elif args.unbounded_metered:
        avatar_env["BETTERPPTX_AVATAR_WORKER_DAILY_GPU_SECONDS"] = "unlimited"
    by_name = env_map(container)
    for name, value in avatar_env.items():
        by_name[name] = {"name": name, "value": value}
    container["env"] = list(by_name.values())

    mounts = container.setdefault("volumeMounts", [])
    if not any(mount.get("name") == "avatar-worker-credentials" for mount in mounts):
        mounts.append({
            "name": "avatar-worker-credentials",
            "mountPath": "/var/run/secrets/betterpptx",
            "readOnly": True,
        })
    volumes = pod.setdefault("volumes", [])
    volumes[:] = [volume for volume in volumes if volume.get("name") != "avatar-worker-credentials"]
    volumes.append({
        "name": "avatar-worker-credentials",
        "secret": {
            "secretName": args.secret,
            "items": [{"key": "latest", "path": "avatar-worker-credentials.json"}],
        },
    })

    with tempfile.TemporaryDirectory(prefix="betterpptx-avatar-cloud-run-") as tmp:
        old_path = Path(tmp) / "old.yaml"
        new_path = Path(tmp) / "avatar-overlay.yaml"
        old_path.write_text(yaml.safe_dump(old, sort_keys=False), encoding="utf-8")
        new_path.write_text(yaml.safe_dump(old, sort_keys=False), encoding="utf-8")
        try:
            run([gcloud, "run", "services", "replace", str(new_path), f"--project={args.project}", f"--region={args.region}", "--quiet"])
        except Exception:
            subprocess.run([gcloud, "run", "services", "replace", str(old_path), f"--project={args.project}", f"--region={args.region}", "--quiet"], check=False)
            raise

    revision = run([
        gcloud, "run", "services", "describe", args.service,
        f"--project={args.project}", f"--region={args.region}",
        "--format=value(status.latestReadyRevisionName)",
    ], capture=True).strip()
    digest = run([
        gcloud, "run", "revisions", "describe", revision,
        f"--project={args.project}", f"--region={args.region}",
        "--format=value(spec.containers[0].image)",
    ], capture=True).strip()
    print(json.dumps({
        "status": "DEPLOYED_AVATAR_OVERLAY",
        "service": args.service,
        "revision": revision,
        "image": digest,
        "secretName": args.secret,
        "artifactBucket": args.artifact_bucket,
        "avatarProvider": "liveportrait-musetalk-commercial",
        "quotaBudgetConfigured": args.daily_gpu_seconds is not None or args.unbounded_metered,
        "quotaMode": "unbounded-metered" if args.unbounded_metered else ("finite" if args.daily_gpu_seconds is not None else "omitted-fail-closed"),
        "productionFallbackDisabled": True,
        "secretValuesPrinted": False,
    }, indent=2))


if __name__ == "__main__":
    main()
