#!/usr/bin/env python3
"""Export an AlphaSho inference checkpoint to Pocket Shogi ONNX format."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import torch

from alphasho.ai.model import ModelConfig, ShogiPolicyValueNet

FEATURES1_NUM = 62
FEATURES2_NUM = 57
POLICY_SIZE = 2187


def load_model(checkpoint_path: Path) -> tuple[ShogiPolicyValueNet, dict[str, Any]]:
    checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=True)
    config = ModelConfig.from_dict(checkpoint.get("model_config"))
    model = ShogiPolicyValueNet(config)
    model.load_state_dict(checkpoint["model_state"])
    model.eval()
    metadata = {
        "search_config": dict(checkpoint.get("search_config", {})),
        "training_metadata": dict(checkpoint.get("metadata", {})),
    }
    return model, metadata


def export_model(model: ShogiPolicyValueNet, output_path: Path, opset: int) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    features1 = torch.zeros((1, FEATURES1_NUM, 9, 9), dtype=torch.float32)
    features2 = torch.zeros((1, FEATURES2_NUM, 9, 9), dtype=torch.float32)
    torch.onnx.export(
        model,
        (features1, features2),
        output_path,
        input_names=["features1", "features2"],
        output_names=["policy_logits", "value"],
        dynamic_axes={
            "features1": {0: "batch"},
            "features2": {0: "batch"},
            "policy_logits": {0: "batch"},
            "value": {0: "batch"},
        },
        opset_version=opset,
        do_constant_folding=True,
    )


def verify_model(model: ShogiPolicyValueNet, output_path: Path) -> dict[str, float]:
    try:
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError(
            "onnxruntime is required for --verify; install tools/requirements-export.txt"
        ) from exc

    rng = np.random.default_rng(20260725)
    features1 = rng.integers(0, 2, size=(3, FEATURES1_NUM, 9, 9), dtype=np.uint8).astype(np.float32)
    features2 = rng.integers(0, 2, size=(3, FEATURES2_NUM, 9, 9), dtype=np.uint8).astype(np.float32)
    with torch.inference_mode():
        torch_policy, torch_value = model(
            torch.from_numpy(features1),
            torch.from_numpy(features2),
        )
    session = ort.InferenceSession(str(output_path), providers=["CPUExecutionProvider"])
    onnx_policy, onnx_value = session.run(
        ["policy_logits", "value"],
        {"features1": features1, "features2": features2},
    )
    policy_error = float(np.max(np.abs(torch_policy.numpy() - onnx_policy)))
    value_error = float(np.max(np.abs(torch_value.numpy() - onnx_value)))
    if policy_error > 1e-4 or value_error > 1e-4:
        raise RuntimeError(
            f"ONNX verification failed: policy={policy_error:.3e}, value={value_error:.3e}"
        )
    return {"policy_max_abs_error": policy_error, "value_max_abs_error": value_error}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata", type=Path)
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    model, checkpoint_metadata = load_model(args.checkpoint)
    export_model(model, args.output, args.opset)
    verification = verify_model(model, args.output) if args.verify else None
    metadata_path = args.metadata or args.output.with_suffix(".json")
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        "schemaVersion": 1,
        "engine": "alphasho",
        "encoding": "cshogi-dlshogi-1.0.4",
        "features1": FEATURES1_NUM,
        "features2": FEATURES2_NUM,
        "policySize": POLICY_SIZE,
        "inputNames": ["features1", "features2"],
        "outputNames": ["policy_logits", "value"],
        "modelConfig": model.config.to_dict(),
        "browserSearch": {
            "light": {"playouts": 16, "batchSize": 2, "timeLimitMs": 2500},
            "standard": {"playouts": 32, "batchSize": 4, "timeLimitMs": 4500},
            "strong": {"playouts": 64, "batchSize": 4, "timeLimitMs": 8000},
        },
        "checkpoint": checkpoint_metadata,
        "onnxSha256": sha256(args.output),
        "onnxBytes": args.output.stat().st_size,
        "verification": verification,
    }
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n")
    print(f"ONNX: {args.output}")
    print(f"Metadata: {metadata_path}")
    print(f"SHA-256: {metadata['onnxSha256']}")


if __name__ == "__main__":
    main()
