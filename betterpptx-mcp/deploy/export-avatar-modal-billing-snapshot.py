#!/usr/bin/env python3
"""Export a redacted, repeatable Modal billing snapshot for avatar reconciliation.

This is an owner-run diagnostic.  It reads the authenticated Modal profile already
configured on the machine, emits hourly cost/resource buckets, and never prints or
serializes token material.  Modal billing is app/hour scoped; it intentionally does
not claim per-request attribution without a provider export carrying request IDs.
The optional serving-revision field binds the redacted window to the active Cloud
Run revision without exposing credentials or changing the provider export itself.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path


# The owner-facing account id is intentionally allowed as a stable alias for
# the local Modal profile name.  This contains no credential material and keeps
# billing evidence reproducible when profile naming differs across hosts.
PROFILE_ALIASES = {
    "fluxworkerai": "betterpptx-fluxworkerai",
}


def parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def redact_object_id(value: str) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:16]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--account-id", required=True)
    parser.add_argument("--start", required=True, help="UTC ISO-8601, inclusive")
    parser.add_argument("--end", required=True, help="UTC ISO-8601, exclusive")
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--serving-revision",
        default=os.environ.get("BETTERPPTX_SERVING_REVISION", ""),
        help="Optional active Cloud Run serving revision to bind into the redacted export.",
    )
    args = parser.parse_args()

    # Set profile before importing Modal so its config loader selects the intended
    # owner-authenticated section.  The raw profile name is not written to the
    # report; only whether a documented alias was used is retained.
    effective_profile = PROFILE_ALIASES.get(args.profile, args.profile)
    os.environ["MODAL_PROFILE"] = effective_profile
    import modal  # type: ignore

    start = parse_time(args.start)
    end = parse_time(args.end)
    workspace = modal.Workspace.from_context()
    rows = workspace.billing.report(start=start, end=end, resolution="h", tag_names=["*"])

    buckets = []
    for row in rows:
        buckets.append(
            {
                "intervalStart": row.interval_start.astimezone(timezone.utc).isoformat(),
                "objectIdHash": redact_object_id(row.object_id),
                "description": str(row.description),
                "environment": str(row.environment_name),
                "cost": str(Decimal(row.cost)),
                "costByResource": {str(k): str(Decimal(v)) for k, v in row.cost_by_resource.items()},
                "tags": {str(k): str(v) for k, v in (row.tags or {}).items()},
                "tagsPresent": bool(row.tags),
            }
        )

    resourceNames = sorted({name for bucket in buckets for name in bucket["costByResource"]})
    report = {
        "schemaVersion": "betterpptx.avatar-modal-billing-snapshot.v1",
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "accountId": args.account_id,
        "servingRevision": args.serving_revision or None,
        "profileAliasResolved": effective_profile != args.profile,
        "window": {"start": start.isoformat(), "end": end.isoformat(), "resolution": "h"},
        "workspace": {"namePresent": bool(getattr(workspace, "name", None))},
        "buckets": buckets,
        "resourceNames": resourceNames,
        "checks": {
            "billingExportObserved": True,
            "a10gResourceObserved": "A10G" in resourceNames,
            "perRequestAttribution": False,
        },
        "rawSecretsPrinted": False,
        "customerData": False,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
