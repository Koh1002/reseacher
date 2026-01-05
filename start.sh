#!/bin/bash

# AI Paper Summarizer Agent - Startup Script

echo "🤖 AI論文要約エージェント起動スクリプト"
echo "=========================================="
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .envファイルが見つかりません"
    echo "📝 .env.exampleからコピーしてAPIキーを設定してください"
    echo ""
    echo "実行コマンド:"
    echo "  cp .env.example .env"
    echo "  # .envを編集してANTHROPIC_API_KEYを設定"
    echo ""
    exit 1
fi

# Check if requirements are installed
echo "📦 依存関係をチェック中..."
if ! python3 -c "import flask, anthropic, arxiv" 2>/dev/null; then
    echo "⚠️  必要なパッケージがインストールされていません"
    echo "📦 インストールを実行します..."
    pip install -r requirements.txt
fi

echo ""
echo "✅ 準備完了！"
echo ""
echo "🚀 アプリケーションを起動します..."
echo "   URL: http://localhost:5000"
echo ""
echo "   停止するには Ctrl+C を押してください"
echo ""

# Start the application
python3 app.py
