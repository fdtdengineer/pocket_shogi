# AlphaSho integration

Pocket Shogi keeps its original alpha-beta engine and adds an optional AlphaSho-compatible policy-value engine. Training is performed locally with the separate AlphaSho/PyTorch project. Browser inference uses ONNX Runtime Web and a lightweight JavaScript PUCT search.

## Architecture

```text
AlphaSho + cshogi + PyTorch (local machine)
  -> mobile-best.pt
  -> tools/export_alphasho_onnx.py
  -> alphasho-mobile.onnx
  -> Pocket Shogi Web Worker
  -> ONNX Runtime Web WASM
  -> 16 / 32 / 64 playout PUCT
```

The browser implementation follows AlphaSho's existing process:

- cshogi/dlshogi-compatible 62-plane board/attack input
- 57-plane hand/check input
- 2187 policy labels (`27 x 81`)
- policy/value network
- PUCT selection and alternating value backup

The original `engine/cpu.js` remains available. If the model, Web Worker, CDN runtime, or inference fails, Pocket Shogi automatically uses the existing `hard` CPU.

## 1. Prepare AlphaSho locally

Use the AlphaSho source that this integration was designed against. Create a Python 3.13 environment and install its training dependencies.

```bash
conda create -n alphasho python=3.13
conda activate alphasho

cd /path/to/alphasho
python -m pip install --upgrade pip
python -m pip install -e ".[dev,training]"
```

Install the ONNX export dependencies from Pocket Shogi:

```bash
python -m pip install -r /path/to/pocket_shogi/tools/requirements-export.txt
```

## 2. Add the mobile profile

Copy the supplied profile into the AlphaSho repository.

```bash
cp /path/to/pocket_shogi/training/alphasho-mobile.toml \
  /path/to/alphasho/configs/training/mobile.toml
```

The mobile profile uses a smaller network than AlphaSho baseline:

```text
48 channels
3 residual blocks
96-unit value hidden layer
128 training-time MCTS playouts
real_rules adjudication
```

Add KIF/KIFU/CSA locations to `supervised_paths` for supervised warm-up. Starting entirely from random self-play is supported by AlphaSho but takes much longer.

## 3. Train

AlphaSho can load a fixed TOML profile through `ALPHASHO_TRAINING_PROFILE`.

```bash
cd /path/to/alphasho
ALPHASHO_TRAINING_PROFILE=mobile python training_pipeline.py
```

The published checkpoint is expected at:

```text
artifacts/mobile/checkpoints/mobile-best.pt
```

Exact checkpoint paths can vary with AlphaSho revisions; use the published model produced by its pipeline.

## 4. Export ONNX

Run the exporter from the AlphaSho environment so the `alphasho` Python package is importable.

```bash
cd /path/to/alphasho
python /path/to/pocket_shogi/tools/export_alphasho_onnx.py \
  --checkpoint artifacts/mobile/checkpoints/mobile-best.pt \
  --output /path/to/pocket_shogi/models/alphasho-mobile.onnx \
  --verify
```

This generates:

```text
models/alphasho-mobile.onnx
models/alphasho-mobile.json
```

The ONNX interface is fixed:

```text
features1      float32 [batch, 62, 9, 9]
features2      float32 [batch, 57, 9, 9]
policy_logits  float32 [batch, 2187]
value          float32 [batch]
```

`--verify` compares PyTorch and ONNX Runtime outputs on deterministic test tensors. Do not publish a model if verification fails.

## 5. Test without committing the model

Start Pocket Shogi over HTTP:

```bash
cd /path/to/pocket_shogi
python3 -m http.server 8000
```

Open the page, select **AlphaSho**, then select **ONNXを読み込む**. The model is stored in IndexedDB, so it remains available on the device after a reload. This is useful for testing local checkpoints without committing model binaries.

Use **保存モデルを削除** to remove it. If no stored model exists, Pocket Shogi tries `models/alphasho-mobile.onnx`.

## iPhone design choices

- WASM execution provider only
- one WASM thread, avoiding cross-origin-isolation requirements
- inference and MCTS in a module Web Worker
- small batches of 2 or 4 leaves
- model loading only when AlphaSho is selected
- local model persistence through IndexedDB
- runtime caching through the Service Worker
- automatic fallback to the standard CPU

Search presets:

| Preset | Playouts | Batch | Time cap |
|---|---:|---:|---:|
| Light | 16 | 2 | 2.5 s |
| Standard | 32 | 4 | 4.5 s |
| Strong | 64 | 4 | 8 s |

Actual speed depends strongly on iPhone model, Safari version, network size, and thermal throttling. Start with **Light** when validating a new model.

## Compatibility tests

Run:

```bash
npm test
```

The tests cover:

- 62/57 feature sizes
- side-to-move board rotation
- known cshogi policy labels such as `7g7f -> 59`
- collision-free legal labels
- lightweight MCTS returning a legal move

For release-grade validation, also generate random fixtures from cshogi and compare every feature byte and legal move label against the JavaScript implementation.

## Current rules difference

Pocket Shogi currently treats the fourth occurrence of a position as a draw and does not distinguish perpetual-check loss. Entering-king declaration is also not implemented. AlphaSho training uses cshogi's fuller adjudication. The browser MCTS intentionally follows Pocket Shogi's current game rules so that it never returns a move incompatible with the live application.
