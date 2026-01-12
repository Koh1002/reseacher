// =============================================
// Report View Component
// =============================================

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { AnalysisReport } from '../types';
import { useCouncilStore } from '../store/councilStore';

type TabType = 'story' | 'minutes' | 'appendix';

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
        active
          ? 'bg-white text-blue-600 border-t border-x border-gray-200'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function StoryTab({ report }: { report: AnalysisReport }) {
  return (
    <div className="prose prose-sm max-w-none">
      <div
        className="whitespace-pre-wrap"
        dangerouslySetInnerHTML={{
          __html: report.analysis_story
            .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3">$1</h1>')
            .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
            .replace(/^### (.+)$/gm, '<h3 class="text-base font-medium mt-4 mb-2">$1</h3>')
            .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
            .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>'),
        }}
      />
    </div>
  );
}

function MinutesTab({ report }: { report: AnalysisReport }) {
  const { minutes } = report;

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <section>
        <h3 className="font-bold text-lg mb-2">📋 概要</h3>
        <p className="text-gray-700">{minutes.summary}</p>
      </section>

      {/* Participants */}
      <section>
        <h3 className="font-bold text-lg mb-2">👥 参加者</h3>
        <div className="flex flex-wrap gap-2">
          {minutes.participants.map((p, i) => (
            <span
              key={i}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
            >
              {p}
            </span>
          ))}
        </div>
      </section>

      {/* Duration */}
      <section>
        <h3 className="font-bold text-lg mb-2">⏱️ 所要時間</h3>
        <p className="text-gray-700">{formatDuration(minutes.duration_seconds)}</p>
      </section>

      {/* Key Findings */}
      <section>
        <h3 className="font-bold text-lg mb-2">🎯 主要な発見</h3>
        <ul className="space-y-2">
          {minutes.key_findings.map((finding, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">{i + 1}.</span>
              <span className="text-gray-700">{finding}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Discussion Points */}
      <section>
        <h3 className="font-bold text-lg mb-3">💬 議論ポイント</h3>
        <div className="space-y-4">
          {minutes.discussion_points.map((point, i) => (
            <div
              key={i}
              className="border border-gray-200 rounded-lg p-4"
            >
              <h4 className="font-semibold mb-2">{point.issue_title}</h4>
              <p className="text-sm text-gray-600 mb-3">
                結論: {point.conclusion}
              </p>
              {point.messages.length > 0 && (
                <div className="bg-gray-50 rounded p-3">
                  <p className="text-xs text-gray-500 mb-2">
                    関連発言: {point.messages.length}件
                  </p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {point.messages.slice(0, 3).map((msg, j) => (
                      <p
                        key={j}
                        className="text-xs text-gray-600 truncate"
                      >
                        • {msg.content.substring(0, 50)}...
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AppendixTab({ report }: { report: AnalysisReport }) {
  const { appendix } = report;

  return (
    <div className="space-y-6">
      {/* Issues */}
      <section>
        <h3 className="font-bold text-lg mb-3">📌 論点一覧</h3>
        <div className="space-y-2">
          {appendix.issues.map((issue, i) => (
            <div
              key={issue.id}
              className="border border-gray-200 rounded p-3"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold">
                  {i + 1}. {issue.title}
                </span>
                <span
                  className={`px-2 py-0.5 text-xs rounded ${
                    issue.status === 'resolved'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {issue.status === 'resolved' ? '解決済' : '進行中'}
                </span>
              </div>
              <p className="text-sm text-gray-600">{issue.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cards */}
      <section>
        <h3 className="font-bold text-lg mb-3">📊 エビデンスカード一覧</h3>
        <div className="space-y-2">
          {appendix.cards.map((card, i) => (
            <div
              key={card.id}
              className="border border-gray-200 rounded p-3"
            >
              <p className="text-sm font-medium mb-1">
                {i + 1}. {card.claim}
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                <span>信頼度: {card.confidence}</span>
                <span>|</span>
                <span>指標数: {card.metrics.length}</span>
                <span>|</span>
                <span>期間: {card.timeframe.from}〜{card.timeframe.to}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ReportView() {
  const session = useCouncilStore((s) => s.session);
  const [activeTab, setActiveTab] = useState<TabType>('story');

  if (!session?.report) {
    return null;
  }

  const { report } = session;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="bg-gray-100 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl">
          <h2 className="text-xl font-bold text-white">📋 分析レポート</h2>
          <p className="text-blue-100 text-sm mt-1">
            生成日時: {new Date(report.generated_at).toLocaleString('ja-JP')}
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-4 bg-gray-100">
          <TabButton
            active={activeTab === 'story'}
            onClick={() => setActiveTab('story')}
          >
            📖 分析ストーリー
          </TabButton>
          <TabButton
            active={activeTab === 'minutes'}
            onClick={() => setActiveTab('minutes')}
          >
            📝 議事録
          </TabButton>
          <TabButton
            active={activeTab === 'appendix'}
            onClick={() => setActiveTab('appendix')}
          >
            📎 付録
          </TabButton>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto bg-white p-6 rounded-b-xl border-x border-b border-gray-200">
          {activeTab === 'story' && <StoryTab report={report} />}
          {activeTab === 'minutes' && <MinutesTab report={report} />}
          {activeTab === 'appendix' && <AppendixTab report={report} />}
        </div>
      </motion.div>
    </motion.div>
  );
}
