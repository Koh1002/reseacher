# 🏛️ Multi-Agent Analysis Council

マルチエージェントによるデータ分析議会のデモWebアプリケーション

## 概要

このアプリケーションは、複数のAIエージェントが協調して購買データを分析し、議論を通じて洞察を導き出すプロセスを可視化するデモです。

### 特徴

- **マルチエージェントシステム**: 議長(Chair)と複数の専門アナリストが協調して分析
- **データ保護設計**: エージェント間では生データを共有せず、抽象化された「エビデンスカード」のみを共有
- **ブラウザ内分析**: DuckDB-Wasmを使用してブラウザ内でSQLクエリを実行
- **リアルタイム可視化**: 議会の進行状況をリアルタイムで表示
- **GitHub Pages対応**: 静的サイトとしてデプロイ可能

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                        User Interface                        │
├──────────────┬────────────────────────┬────────────────────┤
│ Agent Panel  │    Timeline Panel      │    Card Panel      │
│ (左)         │    (中央)              │    (右)            │
├──────────────┴────────────────────────┴────────────────────┤
│                     State Management (Zustand)              │
├─────────────────────────────────────────────────────────────┤
│                   Workflow Orchestrator                     │
├──────────────┬────────────────────────┬────────────────────┤
│    Chair     │      Analysts          │   DuckDB-Wasm      │
│   Agent      │  (Growth, Segment,     │   (Data Engine)    │
│              │   Basket, Seasonality) │                    │
└──────────────┴────────────────────────┴────────────────────┘
```

## エージェント構成

| エージェント | 役割 |
|------------|------|
| 👔 Chair | 議会の進行、計画立案、最終レポート生成 |
| 📈 Growth Analyst | 売上トレンド、成長指標の分析 |
| 👥 Segment Analyst | 顧客セグメントの分析 |
| 🛒 Basket Analyst | バスケット構成、併買パターンの分析 |
| 📅 Seasonality Analyst | 季節性、曜日パターンの分析 |

## ワークフロー状態機械

```
IDLE → PLANNING → ISSUE_DECOMPOSE → ANALYZING → COUNCIL → ITERATE → FINALIZE → DONE
                                                    ↑         │
                                                    └─────────┘ (次ラウンドへ)
```

## コア概念

### EvidenceCard（エビデンスカード）

エージェント間で共有される分析結果の抽象化された形式：

```typescript
interface EvidenceCard {
  id: string;
  author_agent: string;
  claim: string;              // 主張/観察
  method: string;             // 検証方法
  query_fingerprint: string;  // クエリのハッシュ（SQL全文ではない）
  metrics: Metric[];          // 集計指標
  segment_def: string;        // セグメント定義
  timeframe: Timeframe;       // 分析期間
  chart_spec?: ChartSpec;     // 可視化仕様
  confidence: 'low' | 'mid' | 'high';
  caveats: string[];          // 注意事項
}
```

### 生データ保護

エージェント間で以下は**共有禁止**：
- 生の行データ
- 個別のmember_id一覧
- transaction_id一覧
- その他、再識別につながる情報

## セットアップ

### 必要環境

- Node.js 18以上
- npm または yarn

### インストール

```bash
# 依存パッケージのインストール
npm install

# 開発サーバーの起動
npm run dev
```

### ビルド

```bash
# 本番ビルド
npm run build

# ビルド結果のプレビュー
npm run preview
```

## モード

### DEMOモード（デフォルト）

- ルールベースのエージェント応答
- ローカルのサンプルデータを使用
- LLM APIキー不要
- GitHub Pagesで動作

### DEVモード（将来実装予定）

- 実際のLLM APIを使用
- ローカル開発環境でのみ動作
- `.env`ファイルでAPIキーを設定

## データ

### サンプルデータ形式

`public/data/purchase_history.csv`:

| カラム | 型 | 説明 |
|-------|-----|------|
| purchase_date | DATE | 購入日 (YYYY-MM-DD) |
| member_id | STRING | 匿名化された会員ID |
| store | STRING | 店舗名 (summit/tomods) |
| category | STRING | 商品カテゴリ |
| product | STRING | 商品名 |
| qty | NUMBER | 数量 |
| amount | NUMBER | 金額 |
| transaction_id | STRING | 取引ID |

### データの差し替え

1. `public/data/purchase_history.csv`を新しいCSVで置き換え
2. 上記のカラム形式に従う
3. 開発サーバーを再起動

## GitHub Pagesへのデプロイ

### 自動デプロイ

1. GitHubリポジトリの Settings > Pages を開く
2. Source を "GitHub Actions" に設定
3. mainブランチにプッシュすると自動的にデプロイ

### 手動デプロイ

```bash
# ビルド
npm run build

# distフォルダをgh-pagesブランチにデプロイ
# (例: gh-pages npmパッケージを使用)
npx gh-pages -d dist
```

## 技術スタック

- **フレームワーク**: React 19 + TypeScript
- **ビルドツール**: Vite
- **状態管理**: Zustand
- **データ分析**: DuckDB-Wasm
- **チャート**: Chart.js + react-chartjs-2
- **アニメーション**: Framer Motion
- **スタイリング**: Tailwind CSS

## ディレクトリ構成

```
src/
├── agents/           # エージェント実装
│   ├── protocol.ts   # エージェントプロトコル定義
│   ├── demoAgents.ts # DEMOモードの実装
│   └── workflow.ts   # ワークフロー状態機械
├── components/       # UIコンポーネント
│   ├── AgentPanel.tsx
│   ├── TimelinePanel.tsx
│   ├── CardPanel.tsx
│   ├── ChartDisplay.tsx
│   └── ReportView.tsx
├── store/            # 状態管理
│   └── councilStore.ts
├── types/            # TypeScript型定義
│   └── index.ts
├── utils/            # ユーティリティ
│   └── duckdb.ts     # DuckDB-Wasm統合
├── App.tsx           # メインコンポーネント
├── main.tsx          # エントリーポイント
└── index.css         # グローバルスタイル
```

## 拡張ポイント

### 実LLMの統合

1. `src/agents/llmClient.ts`を作成
2. DEVモード用のプロンプトテンプレートを定義
3. `demoAgents.ts`と同じインターフェースで実装
4. `workflow.ts`でモードに応じて切り替え

### 新しいアナリストの追加

1. `src/store/councilStore.ts`の`DEFAULT_AGENTS`に追加
2. `src/agents/demoAgents.ts`の`ANALYSIS_TEMPLATES`に追加
3. `src/utils/duckdb.ts`の`ANALYSIS_QUERIES`に必要なクエリを追加

### より高度なアニメーション

1. `src/components/TimelinePanel.tsx`でFramer Motionの設定を調整
2. メッセージの出現アニメーションをカスタマイズ
3. スクロールアニメーションの追加

## ライセンス

MIT License

## 貢献

Issues と Pull Requests は歓迎です。
