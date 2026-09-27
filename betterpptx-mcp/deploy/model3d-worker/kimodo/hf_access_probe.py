"""Read-only Modal probe for Kimodo's gated Meta Llama dependency.

This app mounts only the existing Hugging Face secret. It creates no Volume,
downloads no model weights, and exposes no endpoint.
"""

from __future__ import annotations

import json

import modal


APP_NAME = "betterpptx-kimodo-hf-access-probe"
LLAMA_REPOSITORY = "meta-llama/Meta-Llama-3-8B-Instruct"
LLAMA_REVISION = "8afb486c1db24fe5011ec46dfbe5b5dccdb575c2"

app = modal.App(APP_NAME)
probe_image = modal.Image.debian_slim(python_version="3.11").pip_install("huggingface_hub==1.6.0")
huggingface_secret = modal.Secret.from_name("huggingface-token")


@app.function(image=probe_image, secrets=[huggingface_secret], timeout=120)
def _probe() -> dict:
    from huggingface_hub import hf_hub_url, get_hf_file_metadata
    from huggingface_hub.errors import GatedRepoError

    try:
        metadata = get_hf_file_metadata(hf_hub_url(
            repo_id=LLAMA_REPOSITORY,
            filename="config.json",
            revision=LLAMA_REVISION,
        ))
    except GatedRepoError as error:
        return {
            "status": "BLOCKED_GATED_TEXT_ENCODER",
            "repository": LLAMA_REPOSITORY,
            "revision": LLAMA_REVISION,
            "httpStatus": getattr(getattr(error, "response", None), "status_code", 403),
            "weightsDownloaded": False,
        }
    return {
        "status": "AUTHORIZED",
        "repository": LLAMA_REPOSITORY,
        "revision": LLAMA_REVISION,
        "configSize": metadata.size,
        "weightsDownloaded": False,
    }


@app.local_entrypoint()
def probe() -> None:
    print(json.dumps(_probe.remote(), indent=2))
