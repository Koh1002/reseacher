# 📖 使い方ガイド

## クイックスタート

### 1. セットアップ

```bash
# 1. 依存関係をインストール
pip install -r requirements.txt

# 2. API Keyを設定
cp .env.example .env
# .envファイルを編集してANTHROPIC_API_KEYを追加
```

### 2. アプリケーションの起動

```bash
# 方法1: 起動スクリプトを使用（推奨）
./start.sh

# 方法2: 直接Pythonで実行
python app.py
```

### 3. ブラウザでアクセス

```
http://localhost:5000
```

## 主な機能

### 🔍 論文検索

#### キーワード検索
1. 検索ボックスにキーワードを入力
   - 例: "diffusion model"
   - 例: "GPT OR transformer"
   - 例: "image generation"

2. 検索結果の表示件数を選択（5件/10件/20件）

3. 「検索」ボタンをクリック

#### カテゴリ検索
以下のカテゴリボタンをクリックして、分野別に検索:
- **AI**: 人工知能全般
- **機械学習**: 機械学習アルゴリズム
- **コンピュータビジョン**: 画像認識、画像生成など
- **自然言語処理**: テキスト処理、言語モデルなど

#### 最新論文の取得
「最新論文」ボタンをクリックすると、最新の生成AI関連論文を自動取得

### ✨ 論文要約

#### 個別要約
1. 論文カードの「要約する」ボタンをクリック
2. AIが以下の内容を自動生成:
   - 📝 **概要**: 論文の核心を2-3文で要約
   - 🎯 **主な貢献・成果**: 重要なポイントを箇条書き
   - 🔧 **技術的アプローチ**: 使用された手法や技術
   - 💡 **重要性・インパクト**: 研究の意義
   - 📊 **アーキテクチャ図**: Mermaidによる視覚化

#### 一括要約
「全ての論文を要約」ボタンで、検索結果の全論文を一度に要約

### 📊 図解機能

AIが論文の内容を分析し、以下のような図を自動生成:
- システムアーキテクチャ図
- 処理フロー図
- モデル構造図
- データフロー図

### 📄 PDFアクセス

各論文カードの「PDFを開く」ボタンで、元の論文PDFにアクセス可能

## 検索のコツ

### 効果的なキーワード
```
✅ Good:
- "diffusion model"
- "large language model"
- "GPT OR transformer"
- "image generation AND text-to-image"

❌ Less effective:
- "AI" (あまりに広範囲)
- "機械学習" (日本語は検索に不向き)
```

### 検索演算子
- **OR**: いずれかのキーワードを含む
  - 例: "GPT OR BERT"
- **AND**: 両方のキーワードを含む
  - 例: "image AND generation"
- **引用符**: フレーズ検索
  - 例: "attention mechanism"

### カテゴリコード
- `cs.AI`: 人工知能
- `cs.LG`: 機械学習
- `cs.CV`: コンピュータビジョン
- `cs.CL`: 計算言語学・自然言語処理
- `cs.NE`: ニューラル・進化的計算

## API使用例

### Python
```python
import requests

# 論文検索
response = requests.get(
    'http://localhost:5000/api/search',
    params={'query': 'diffusion model', 'max_results': 10}
)
papers = response.json()['papers']

# 論文要約
response = requests.post(
    'http://localhost:5000/api/summarize',
    json={'paper': papers[0]}
)
summary = response.json()['summary']
print(summary['summary'])
```

### JavaScript
```javascript
// 論文検索
const response = await fetch(
  '/api/search?query=GPT&max_results=10'
);
const data = await response.json();
const papers = data.papers;

// 論文要約
const summaryResponse = await fetch('/api/summarize', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({paper: papers[0]})
});
const summary = await summaryResponse.json();
```

### cURL
```bash
# 論文検索
curl "http://localhost:5000/api/search?query=transformer&max_results=5"

# 論文要約
curl -X POST http://localhost:5000/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"paper": {"title": "...", "summary": "..."}}'
```

## トラブルシューティング

### API Keyエラー
```
エラー: ANTHROPIC_API_KEY not found
解決: .envファイルにAPIキーを設定
```

### ポート使用中エラー
```
エラー: Address already in use
解決: .envファイルでPORTを変更（例: PORT=5001）
```

### 依存関係エラー
```
エラー: ModuleNotFoundError
解決: pip install -r requirements.txt を実行
```

### 検索結果が表示されない
```
原因: インターネット接続の問題
解決: ネットワーク接続を確認
```

## パフォーマンスのヒント

### 要約速度
- 1論文の要約: 約10-20秒
- 10論文の一括要約: 約2-3分
- Claude APIのレート制限に注意

### 検索最適化
- 検索結果は5-10件が最適
- 20件以上は要約に時間がかかる

### ブラウザ要件
- Chrome、Firefox、Safari、Edgeの最新版を推奨
- JavaScriptを有効化
- インターネット接続必須

## 高度な使い方

### カスタム検索クエリ
```python
# arxiv_fetcher.pyを編集
def custom_search(self, custom_query):
    search = arxiv.Search(
        query=custom_query,
        max_results=50,
        sort_by=arxiv.SortCriterion.Relevance
    )
    # ...
```

### 要約プロンプトのカスタマイズ
```python
# paper_summarizer.pyのprompt変数を編集
prompt = f"""
あなたの独自の指示をここに記述...
"""
```

### UIテーマの変更
```css
/* static/css/style.css */
:root {
    --primary-color: #your-color;
    --bg-color: #your-bg;
    /* ... */
}
```

## よくある質問

**Q: 日本語の論文は検索できますか？**
A: arXivは主に英語論文のため、英語のキーワードで検索してください。

**Q: 要約は日本語で表示されますか？**
A: はい、Claude AIが日本語で分かりやすく要約します。

**Q: 無料で使えますか？**
A: アプリ自体は無料ですが、Anthropic APIの利用料金が発生します。

**Q: どのくらいの論文が検索できますか？**
A: arXivには数百万の論文があり、常に最新の論文が追加されています。

**Q: 図解は自動生成されますか？**
A: はい、AIが論文の内容を分析してMermaid形式の図を自動生成します。

## サポート

問題や質問がある場合:
1. READMEを確認
2. このガイドを参照
3. GitHubのIssuesで質問

---

Happy researching! 📚🔬
