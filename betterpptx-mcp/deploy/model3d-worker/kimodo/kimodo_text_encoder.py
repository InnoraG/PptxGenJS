"""Exact two-adapter LLM2Vec loader for Kimodo's immutable local cache."""

from __future__ import annotations

import os

import numpy as np
import torch
from peft import PeftModel


class KimodoLlamaTextEncoder:
    """Load Meta Llama, the MNTP adapter, then Kimodo's supervised adapter.

    NVIDIA's default convenience path starts from the MNTP adapter directory,
    which makes Transformers resolve the gated Meta Llama base remotely. This
    loader makes every layer explicit and local so immutable source evidence is
    complete before a GPU generation starts.
    """

    def __init__(
        self,
        base_model_path: str,
        mntp_adapter_path: str,
        supervised_adapter_path: str,
        dtype: str,
        llm_dim: int,
        device: str = "auto",
    ) -> None:
        from kimodo.model.llm2vec.llm2vec import LLM2Vec

        torch_dtype = getattr(torch, dtype)
        cache_dir = os.environ.get("HUGGINGFACE_CACHE_DIR")
        self.llm_dim = llm_dim
        self.model = LLM2Vec.from_pretrained(
            base_model_name_or_path=base_model_path,
            peft_model_name_or_path=mntp_adapter_path,
            merge_peft=True,
            torch_dtype=torch_dtype,
            cache_dir=cache_dir,
        )
        self.model.model = PeftModel.from_pretrained(
            self.model.model,
            supervised_adapter_path,
        )
        config_path = os.path.join(supervised_adapter_path, "llm2vec_config.json")
        if os.path.exists(config_path):
            import json

            with open(config_path, "r", encoding="utf-8") as handle:
                config = json.load(handle)
            for key in ("pooling_mode", "max_length", "doc_max_length", "skip_instruction"):
                if key in config:
                    setattr(self.model, key, config[key])

        env_device = os.environ.get("TEXT_ENCODER_DEVICE")
        if env_device:
            device = env_device
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        self._device = device
        self.model = self.model.to(device)
        self.model.eval()
        for parameter in self.model.parameters():
            parameter.requires_grad = False

    def to(self, device=None, dtype=None):
        if device is not None:
            self.model = self.model.to(device=device, dtype=dtype)
            self._device = str(device)
        elif dtype is not None:
            self.model = self.model.to(dtype=dtype)
        return self

    def eval(self):
        self.model.eval()
        return self

    def get_device(self):
        return self.model.model.device

    def __call__(self, text: list[str] | str):
        is_string = isinstance(text, str)
        texts = [text] if is_string else text
        with torch.no_grad():
            encoded = self.model.encode(
                texts,
                batch_size=1,
                show_progress_bar=False,
                device=self._device,
            )
        if self.llm_dim != encoded.shape[-1]:
            raise RuntimeError(
                f"Kimodo text embedding width must be {self.llm_dim}, got {encoded.shape[-1]}"
            )
        encoded = encoded[:, None]
        lengths = np.ones(len(encoded), dtype=int).tolist()
        if is_string:
            encoded = encoded[0]
            lengths = lengths[0]
        return torch.as_tensor(encoded, device=self._device), lengths
