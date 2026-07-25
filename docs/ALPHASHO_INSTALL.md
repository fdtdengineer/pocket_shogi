# AlphaSho のインストール・学習・ONNX変換

この文書では、AlphaShoをローカルPCへ導入し、PyTorchで学習したモデルをONNXへ変換してPocket Shogiで使用するまでの手順を説明します。

Pocket Shogiでは既存のαβ探索CPUを残したまま、追加エンジンとしてAlphaShoを選択できます。学習はローカル環境で実行し、ブラウザ側ではONNX Runtime Webと軽量PUCT探索を使用します。

## 1. ディレクトリを準備する

Pocket ShogiのAlphaSho対応ブランチを取得します。

```bash
git clone https://github.com/fdtdengineer/pocket_shogi.git
cd pocket_shogi
git switch agent/add-alphasho-browser-engine
cd ..
```

AlphaShoも取得します。

```bash
git clone https://github.com/WD-nanophotonics/alphasho.git
```

以下のように2つのリポジトリを隣接して配置すると、以降のコマンドを実行しやすくなります。

```text
work/
├── alphasho/
└── pocket_shogi/
```

## 2. Conda環境を作成する

Python 3.13のConda環境を作成します。

```bash
conda create -n alphasho python=3.13
conda activate alphasho
```

AlphaShoの学習依存関係をインストールします。

```bash
cd alphasho
python -m pip install --upgrade pip
python -m pip install -e ".[dev,training]"
```

Pocket Shogi側のONNX変換依存関係もインストールします。

```bash
python -m pip install -r ../pocket_shogi/tools/requirements-export.txt
```

PyTorchとCUDAの認識状況を確認します。

```bash
python -c "import torch; print(torch.__version__); print('CUDA:', torch.cuda.is_available())"
```

`CUDA: True` と表示されればNVIDIA GPUを利用できます。`False`でもCPUで実行できますが、自己対局学習にはかなり時間がかかります。

CUDA版PyTorchが必要な場合は、使用しているCUDAおよびGPU環境に対応するPyTorchを先にインストールしてください。

## 3. モバイル用学習設定をコピーする

Pocket Shogiに同梱したiPhone向け小型モデル設定をAlphaShoへコピーします。

### Linux / macOS

```bash
cp ../pocket_shogi/training/alphasho-mobile.toml \
   configs/training/mobile.toml
```

### Windows PowerShell

```powershell
Copy-Item `
  ..\pocket_shogi\training\alphasho-mobile.toml `
  .\configs\training\mobile.toml
```

この設定では、以下の小型ネットワークを使用します。

```text
48 channels
Residual Block 3層
Value hidden 96
学習時MCTS 128 playout
実ルール判定
```

主な設定値は次のとおりです。

```toml
[run]
iterations = 500
artifact_root = "artifacts/mobile"

[model]
channels = 48
residual_blocks = 3
value_hidden = 96

[search]
n_playouts = 128
batch_size = 16

[data]
selfplay_games = 32

[training]
batch_size = 256
train_steps = 256

[evaluation]
games = 100
promotion_score = 0.55
```

## 4. 教師棋譜を設定する

棋譜を利用する場合は、`configs/training/mobile.toml` の `supervised_paths` を編集します。

```toml
[data]
supervised_paths = [
    "data/kifu/",
]
supervised_epochs = 5
```

AlphaShoが対応するKIF、KIFU、CSA形式の棋譜を指定します。

棋譜なしでも自己対局から学習できます。その場合は次のままで構いません。

```toml
supervised_paths = []
```

ただし、完全なランダム初期値から自己対局だけで学習すると収束まで長い時間がかかるため、可能であれば教師ありwarm-upを推奨します。

## 5. 最小構成で動作確認する

本格学習の前に、`configs/training/mobile.toml` を一時的に縮小して一連の処理が完走することを確認します。

```toml
[run]
iterations = 2

[data]
selfplay_games = 2

[training]
train_steps = 10

[evaluation]
games = 2
check_frequency = 1
```

これにより、次の流れを短時間で確認できます。

```text
自己対局
→ 学習
→ 評価
→ チェックポイント保存
→ ONNX変換
→ ブラウザ推論
```

確認後は元の設定値へ戻してください。

## 6. 学習を開始する

### Linux / macOS

```bash
cd /path/to/alphasho
ALPHASHO_TRAINING_PROFILE=mobile python training_pipeline.py
```

### Windows PowerShell

```powershell
cd C:\path\to\alphasho
$env:ALPHASHO_TRAINING_PROFILE = "mobile"
python training_pipeline.py
```

### Windows コマンドプロンプト

```bat
cd C:\path\to\alphasho
set ALPHASHO_TRAINING_PROFILE=mobile
python training_pipeline.py
```

学習中の成果物は次のディレクトリへ保存されます。

```text
artifacts/mobile/
```

採用されたモデルの標準的な出力先は次です。

```text
artifacts/mobile/checkpoints/mobile-best.pt
```

AlphaShoの改訂によってファイル名や保存場所が異なる場合は、学習ログに表示されるpublished modelまたはbest checkpointを使用してください。

## 7. PyTorchモデルをONNXへ変換する

AlphaSho用Conda環境を有効にしたまま、Pocket Shogiに追加したエクスポーターを実行します。

2つのリポジトリを隣接して配置している場合は次のコマンドです。

```bash
cd /path/to/alphasho

python ../pocket_shogi/tools/export_alphasho_onnx.py \
  --checkpoint artifacts/mobile/checkpoints/mobile-best.pt \
  --output ../pocket_shogi/models/alphasho-mobile.onnx \
  --verify
```

絶対パスを使用する場合は次の形です。

```bash
python /path/to/pocket_shogi/tools/export_alphasho_onnx.py \
  --checkpoint /path/to/alphasho/artifacts/mobile/checkpoints/mobile-best.pt \
  --output /path/to/pocket_shogi/models/alphasho-mobile.onnx \
  --verify
```

変換に成功すると、以下が生成されます。

```text
pocket_shogi/models/alphasho-mobile.onnx
pocket_shogi/models/alphasho-mobile.json
```

ONNXモデルのインターフェースは次のとおりです。

```text
features1      float32 [batch, 62, 9, 9]
features2      float32 [batch, 57, 9, 9]
policy_logits  float32 [batch, 2187]
value          float32 [batch]
```

`--verify` は同じ入力に対するPyTorch版とONNX Runtime版の出力を比較します。検証に失敗したモデルはPocket Shogiへ公開しないでください。

## 8. Pocket Shogiでローカル推論を確認する

Pocket ShogiをHTTPサーバー経由で起動します。

```bash
cd /path/to/pocket_shogi
python -m http.server 8000
```

ブラウザで以下を開きます。

```text
http://localhost:8000
```

画面上で次の操作を行います。

1. CPUの強さから **AlphaSho** を選択する
2. 最初は **軽量・16回** を選択する
3. `models/alphasho-mobile.onnx` がある場合は自動読込を待つ
4. または **ONNXを読み込む** からローカルモデルを選択する

手動で選択したモデルはIndexedDBへ保存されるため、ページを再読込しても再利用されます。

**保存モデルを削除** を押すとIndexedDB内のモデルを消去できます。保存モデルがない場合、Pocket Shogiは `models/alphasho-mobile.onnx` を読み込みます。

## 9. iPhoneで確認する

iPhoneからアクセスできるよう、PCとiPhoneを同じネットワークへ接続します。

PCのローカルIPアドレスが `192.168.1.20` の場合、iPhoneのSafariで次を開きます。

```text
http://192.168.1.20:8000
```

PCのファイアウォールでPython HTTP Serverの受信接続を許可する必要があります。

最初は以下の条件で確認してください。

```text
AlphaSho
探索量: 軽量・16回
Safariのタブを1つだけ使用
端末が高温でない状態
```

Pocket ShogiのAlphaSho推論はiPhone向けに次の構成を使用します。

- ONNX Runtime WebのWASM実行
- WASMスレッド数1
- Web Worker内で推論とMCTSを実行
- モデルの遅延ロード
- 16、32、64 playoutの探索設定
- 推論失敗時の既存CPUへの自動フォールバック

## 10. テストを実行する

Pocket Shogi側のテストを実行します。

```bash
cd /path/to/pocket_shogi
npm test
```

テストには以下が含まれます。

- 62平面と57平面のサイズ
- 後手番での盤面回転
- cshogi互換の既知の指し手ラベル
- 合法手ラベルの衝突検査
- 軽量MCTSが合法手を返すこと
- 既存の将棋ルールおよびαβ探索CPU

## 11. よくある問題

### `CUDA: False`になる

使用しているGPU、CUDA、OSに対応したPyTorchが入っていない可能性があります。PyTorchを環境に合わせて再インストールしてください。

### `alphasho`をimportできない

AlphaShoリポジトリで次を再実行します。

```bash
python -m pip install -e ".[dev,training]"
```

また、ONNX変換はAlphaShoのConda環境内から実行してください。

### `mobile-best.pt`が見つからない

`artifacts/mobile/` と学習ログを確認してください。AlphaShoの版によってpublished checkpointのファイル名が異なる場合があります。

### ONNX変換の`--verify`が失敗する

チェックポイントのモデル設定と、`mobile.toml` の `channels`、`residual_blocks`、`value_hidden` が一致していることを確認してください。

### SafariでAlphaShoが動かない

以下を確認してください。

- 通常CPUでは対局できるか
- ONNXモデルの読込が完了しているか
- 最初は軽量・16回を選んでいるか
- モデルサイズが大きすぎないか
- Safariのキャッシュを削除または保存モデルを削除したか

AlphaShoの初期化または推論に失敗した場合、Pocket Shogiは既存の「つよい」CPUへ自動的にフォールバックします。
