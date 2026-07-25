# ポケット将棋 (Pocket Shogi)

スマートフォンとPCの両方で遊べる、GitHub Pages向けの静的将棋アプリです。サーバーを用いず、CPU思考・画面表示・ルール判定をすべてブラウザ内で実行します。

## 実装済み機能

- CPU対戦（先手・後手を選択可能）
- 二人対戦（同じ端末を交互に使用）
- CPU同士の自動対戦（一時停止・再開、双方の強さと速度を設定可能）
- PeerJSを使った6文字の合言葉によるオンライン対戦
- 「待った」、新しい対局、スマートフォン向けレスポンシブ表示
- 駒の移動、取り、持ち駒、駒打ち、成り
- 二歩、行き所のない駒、王手放置、打ち歩詰めの禁止
- 王手・詰み判定、簡易的な千日手（同一局面4回）の引き分け判定
- PWAマニフェストとService Worker

## CPU

`engine/cpu.js` に軽量なブラウザ内CPUを実装しています。

- `easy`: 合法手からランダム
- `normal`: 1手評価＋上位候補から選択
- `hard`: 時間制限付き反復深化・αβ探索

## DQN追加用インターフェース

`engine/dqn-client.js` は将来のDQN推論用の空アダプターです。アプリ側は以下のインターフェースだけを想定しています。

```js
const client = new DqnClient();
await client.ensureReady();
const move = await client.chooseMove(position, legalMoves);
```

ONNX Runtime Web、TensorFlow.js、または小型の独自推論器を実装しても、`app.js` のゲーム管理を大きく変更せず追加できます。学習済みモデルは将来的に `models/` 以下へ配置する想定です。

## ローカル起動

ES ModulesとService Workerを使用するため、ファイルを直接開かずHTTPサーバー経由で起動してください。

```bash
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。

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
├── app.js                    # UI・対局モード・状態管理
├── online.js                 # PeerJSオンライン通信
├── engine/
│   ├── shogi.js              # 将棋ルールと合法手生成
│   ├── cpu.js                # 軽量CPU
│   └── dqn-client.js         # 将来のDQN用空アダプター
├── tests/engine.test.mjs     # ルール・CPUテスト
├── index.html
├── style.css
└── service-worker.js
```

## 現時点の制限

- 持将棋（入玉宣言法）の自動判定は未実装です。
- 千日手は同一局面4回を引き分けとして扱い、連続王手の千日手による反則負けは区別していません。
- オンライン対戦はPeerJSの公開シグナリングサービスに依存します。
- DQNモデル本体は未実装です。
