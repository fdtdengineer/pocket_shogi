# ポケット将棋 (Pocket Shogi)

スマートフォンとPCの両方で遊べる、GitHub Pages向けの静的将棋アプリです。サーバーを用いず、CPU思考・画面表示・ルール判定をブラウザ内で実行します。

## 実装済み機能

- CPU対戦（先手・後手を選択可能）
- AlphaSho由来の反復深化Negamax＋αβ探索CPU
- ローカル学習したAlphaSho互換ONNXモデルによるPolicy-Value推論＋PUCT MCTS
- 二人対戦（同じ端末を交互に使用）
- CPU同士の自動対戦（一時停止・再開、双方のCPUを設定可能）
- PeerJSを使った6文字の合言葉によるオンライン対戦
- 「待った」、新しい対局、スマートフォン向けレスポンシブ表示
- 駒の移動、取り、持ち駒、駒打ち、成り
- 二歩、行き所のない駒、王手放置、打ち歩詰めの禁止
- 王手・詰み判定、簡易的な千日手判定
- PWAマニフェストとService Worker

## 標準CPU

`engine/cpu.js` は、AlphaShoの `src/alphasho/heuristicplayer/` をブラウザ向けJavaScriptへ移植した単一の探索エンジンです。従来の標準CPU実装は削除し、全難易度を同じ反復深化Negamax、Alpha-Beta枝刈り、置換表、駒得・持ち駒評価の基盤へ統一しています。

- `easy`: AlphaSho基本版。素材・持ち駒・王手評価、取り駒・成り優先、最大10,000ノード、標準1.2秒
- `normal`: 基本版＋静止探索、駒の前進・中央化、玉の安全度、履歴ヒューリスティック、簡易定跡。最大40,000ノード、標準2秒
- `hard`: `normal`＋飛角香の可動性、敵玉への圧力、PVS、aspiration window、killer move、王手優先。最大120,000ノード、標準3.5秒

`normal` と `hard` の序盤は `engine/opening-book.js` の簡易定跡を利用します。

- 矢倉
- 四間飛車・美濃囲い
- 棒銀

## AlphaSho CPU

AlphaSho側でPyTorch学習したモデルをONNXへ変換し、ブラウザのWeb Worker内で推論します。

- cshogi/dlshogi互換の119特徴平面
- 2187次元policy出力
- value出力
- JavaScript製PUCT MCTS
- ONNX Runtime WebのWASM backend
- iPhone向け16/32/64 playout設定
- ONNXファイルの端末内IndexedDB保存
- 読み込み・推論失敗時の`hard` CPUフォールバック

モデル本体はリポジトリへ含めていません。画面の **ONNXを読み込む** から手元のモデルを選択するか、`models/alphasho-mobile.onnx` に配置してください。

学習、ONNX変換、iPhone向け設定は [docs/ALPHASHO.md](docs/ALPHASHO.md) を参照してください。

## ローカル起動

ES Modules、Web Worker、Service Workerを使用するため、HTTPサーバー経由で起動してください。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

AlphaShoのONNX Runtimeは初回利用時にCDNから読み込まれ、その後Service Workerへキャッシュされます。

## テスト

Node.js 20以降を推奨します。

```bash
npm test
```

## GitHub Pages

リポジトリの **Settings → Pages** で、`main` ブランチのルートを公開元に指定してください。

## ディレクトリ構成

```text
.
├── app.js
├── online.js
├── engine/
│   ├── shogi.js
│   ├── cpu.js
│   ├── opening-book.js
│   ├── ai-controller.js
│   ├── dqn-client.js
│   └── alphasho/
│       ├── client.js
│       ├── worker.js
│       ├── encoder.js
│       ├── policy-label.js
│       ├── mcts.js
│       └── constants.js
├── training/alphasho-mobile.toml
├── tools/export_alphasho_onnx.py
├── models/README.md
├── docs/ALPHASHO.md
├── tests/
├── index.html
├── style.css
└── service-worker.js
```

## 現時点の制限

- 学習済みAlphaShoモデルは別途作成または読み込みが必要です。
- 持将棋（入玉宣言法）の自動判定は未実装です。
- 千日手は同一局面4回を引き分けとして扱い、連続王手による反則負けを区別していません。
- オンライン対戦はPeerJSの公開シグナリングサービスに依存します。
- 初回のAlphaSho利用にはONNX Runtime Webの取得が必要です。
