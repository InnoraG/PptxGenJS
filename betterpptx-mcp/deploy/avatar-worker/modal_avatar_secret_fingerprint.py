"""Owner-only diagnostic for comparing paired avatar token fingerprints."""

import hashlib
import os

import modal


app = modal.App("betterpptx-avatar-secret-fingerprint")
auth = modal.Secret.from_name("betterpptx-avatar-auth")
config = modal.Secret.from_name("avatar-config")


@app.function(secrets=[auth, config])
def fingerprint() -> str:
    token = os.environ.get("AVATAR_WORKER_TOKEN", "")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:16] if token else "missing"


@app.local_entrypoint()
def main():
    print(fingerprint.remote())
