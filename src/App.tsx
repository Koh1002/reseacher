// =============================================
// Main App Component
// =============================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCouncilStore } from './store/councilStore';
import { workflowOrchestrator } from './agents/workflow';
import { AgentPanel } from './components/AgentPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { CardPanel } from './components/CardPanel';
import { ReportView } from './components/ReportView';
import { APIKeyInput } from './components/APIKeyInput';
import type { DataSchema } from './types';

// Sample analysis topics for quick start
const SAMPLE_TOPICS = [
  '売上を伸ばすにはどうすればいいか分析してほしい',
  '顧客の購買パターンを分析し、リピート率を改善したい',
  '店舗間の売上差異の要因を明らかにしたい',
  '季節変動を考慮した在庫戦略を提案してほしい',
];

function TopicInput({ onStart }: { onStart: (topic: string, dataSchema?: DataSchema) => void }) {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedSchema, setUploadedSchema] = useState<DataSchema | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const config = useCouncilStore((s) => s.config);
  const dataMode = useCouncilStore((s) => s.dataMode);
  const setDataMode = useCouncilStore((s) => s.setDataMode);
  const setDataSchema = useCouncilStore((s) => s.setDataSchema);

  const handleStart = async () => {
    if (!topic.trim()) return;
    setIsLoading(true);
    await onStart(topic.trim(), uploadedSchema || undefined);
    setIsLoading(false);
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsLoading(true);

    try {
      const text = await file.text();

      // Dynamic import to avoid bundling issues
      const { initDuckDB, loadCSVFromContent, analyzeDataSchema } = await import('./utils/duckdb');

      await initDuckDB();
      await loadCSVFromContent('user_data', text);
      const schema = await analyzeDataSchema('user_data');

      setUploadedSchema(schema);
      setDataSchema(schema);
      setDataMode('BYD');

      console.log('[App] Data schema detected:', schema);
    } catch (error) {
      console.error('[App] Error uploading file:', error);
      setUploadError('ファイルの読み込みに失敗しました。CSVファイルであることを確認してください。');
    } finally {
      setIsLoading(false);
    }
  }, [setDataMode, setDataSchema]);

  const handleClearUpload = () => {
    setUploadedSchema(null);
    setDataSchema(null);
    setDataMode('DEMO');
    setUploadError(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          🏛️ Multi-Agent Analysis Council
        </h1>
        <p className="text-gray-600">
          AIエージェントによるデータ分析議会
        </p>
      </div>

      {/* API Key Input */}
      <div className="mb-6">
        <APIKeyInput />
      </div>

      {/* Data Mode Toggle */}
      <div className="bg-white rounded-xl shadow-lg p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <label className="block text-sm font-medium text-gray-700">
            データソース
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => { setDataMode('DEMO'); handleClearUpload(); }}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                dataMode === 'DEMO'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📊 サンプルデータ
            </button>
            <button
              onClick={() => setDataMode('BYD')}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                dataMode === 'BYD'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              📁 BYD (自分のデータ)
            </button>
          </div>
        </div>

        {/* BYD Mode: File Upload */}
        {dataMode === 'BYD' && (
          <div className="border-2 border-dashed border-purple-300 rounded-lg p-4 bg-purple-50">
            {!uploadedSchema ? (
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-3">
                  購買履歴CSVをアップロードしてください
                </p>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  <span>📤 CSVファイルを選択</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isLoading}
                  />
                </label>
                {uploadError && (
                  <p className="mt-2 text-sm text-red-600">{uploadError}</p>
                )}
                <p className="mt-3 text-xs text-gray-500">
                  スーパーマーケット・ドラッグストアの購買履歴データに対応。<br/>
                  列名は自動検出されます。
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-purple-700">
                    ✅ データ読み込み完了
                  </span>
                  <button
                    onClick={handleClearUpload}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    × クリア
                  </button>
                </div>
                <div className="bg-white rounded-lg p-3 text-xs">
                  <pre className="whitespace-pre-wrap text-gray-700">{uploadedSchema.summary}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DEMO Mode Info */}
        {dataMode === 'DEMO' && (
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
            📊 サンプルデータ（生鮮食品スーパーマーケット購買履歴 100,000件）を使用します
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          分析テーマを入力してください
        </label>
        <textarea
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="例: 売上を伸ばすにはどうすればいいか分析してほしい"
          className="w-full h-24 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          disabled={isLoading}
        />

        <div className="mt-4">
          <button
            onClick={handleStart}
            disabled={!topic.trim() || isLoading || (dataMode === 'BYD' && !uploadedSchema)}
            className={`w-full py-3 rounded-lg font-semibold text-white transition-colors ${
              !topic.trim() || isLoading || (dataMode === 'BYD' && !uploadedSchema)
                ? 'bg-gray-400 cursor-not-allowed'
                : dataMode === 'BYD'
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  ⏳
                </motion.span>
                {dataMode === 'BYD' ? 'データ分析中...' : 'データ読み込み中...'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                🚀 議会を開始
                <span className={`px-2 py-0.5 rounded text-xs ${
                  config.mode === 'DEV'
                    ? 'bg-green-500/20 text-green-100'
                    : 'bg-white/20'
                }`}>
                  {config.mode}モード
                </span>
                {dataMode === 'BYD' && (
                  <span className="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-100">
                    BYD
                  </span>
                )}
              </span>
            )}
          </button>
        </div>

        {/* Sample topics */}
        <div className="mt-6">
          <p className="text-xs text-gray-500 mb-2">クイックスタート:</p>
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TOPICS.map((sample, i) => (
              <button
                key={i}
                onClick={() => setTopic(sample)}
                className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-full text-gray-600 transition-colors"
              >
                {sample.substring(0, 20)}...
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div className={`rounded-lg p-4 shadow ${
          config.mode === 'DEMO' ? 'bg-blue-50 border-2 border-blue-200' : 'bg-white'
        }`}>
          <h3 className="font-semibold text-sm mb-2">📊 DEMOモード</h3>
          <p className="text-xs text-gray-600">
            ルールベースのエージェントが分析します。APIキー不要。
          </p>
        </div>
        <div className={`rounded-lg p-4 shadow ${
          config.mode === 'DEV' ? 'bg-green-50 border-2 border-green-200' : 'bg-white'
        }`}>
          <h3 className="font-semibold text-sm mb-2">🤖 DEVモード</h3>
          <p className="text-xs text-gray-600">
            GPT/Claude/Geminiが実際に分析・議論を行います。
          </p>
        </div>
        <div className={`rounded-lg p-4 shadow ${
          dataMode === 'BYD' ? 'bg-purple-50 border-2 border-purple-200' : 'bg-white'
        }`}>
          <h3 className="font-semibold text-sm mb-2">📁 BYDモード</h3>
          <p className="text-xs text-gray-600">
            自分のCSVデータをアップロードして分析できます。
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function CouncilView() {
  const session = useCouncilStore((s) => s.session);
  const [showReport, setShowReport] = useState(false);

  // Show report when session is done
  useEffect(() => {
    if (session?.state === 'DONE' && session.report) {
      setShowReport(true);
    }
  }, [session?.state, session?.report]);

  const handleReset = () => {
    window.location.reload();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🏛️</span>
          <div>
            <h1 className="font-bold text-gray-800">Analysis Council</h1>
            <p className="text-xs text-gray-500">
              {session?.topic?.substring(0, 40)}
              {(session?.topic?.length || 0) > 40 ? '...' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                session?.state === 'DONE'
                  ? 'bg-green-400'
                  : session?.state === 'ERROR'
                  ? 'bg-red-400'
                  : 'bg-blue-400 animate-pulse'
              }`}
            />
            <span className="text-sm text-gray-600">{session?.state}</span>
          </div>
          {session?.state === 'DONE' && (
            <button
              onClick={() => setShowReport(true)}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              📋 レポート表示
            </button>
          )}
          <button
            onClick={handleReset}
            className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300"
          >
            🔄 リセット
          </button>
        </div>
      </header>

      {/* Main content - 3 pane layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agents */}
        <div className="w-64 border-r border-gray-200 bg-white overflow-hidden">
          <AgentPanel />
        </div>

        {/* Center: Timeline */}
        <div className="flex-1 overflow-hidden">
          <TimelinePanel />
        </div>

        {/* Right: Cards */}
        <div className="w-80 border-l border-gray-200 bg-white overflow-hidden">
          <CardPanel />
        </div>
      </div>

      {/* Report modal */}
      <AnimatePresence>
        {showReport && session?.report && (
          <div onClick={() => setShowReport(false)}>
            <ReportView />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const session = useCouncilStore((s) => s.session);
  const dataMode = useCouncilStore((s) => s.dataMode);
  const [started, setStarted] = useState(false);

  const handleStart = async (topic: string, dataSchema?: DataSchema) => {
    setStarted(true);
    await workflowOrchestrator.start(topic, dataSchema);
  };

  if (!started || !session) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-8 ${
        dataMode === 'BYD'
          ? 'bg-gradient-to-br from-purple-50 to-indigo-100'
          : 'bg-gradient-to-br from-blue-50 to-indigo-100'
      }`}>
        <TopicInput onStart={handleStart} />
      </div>
    );
  }

  return <CouncilView />;
}
