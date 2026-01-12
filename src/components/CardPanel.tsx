// =============================================
// Evidence Card Panel Component
// =============================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { EvidenceCard, Confidence } from '../types';
import { useCouncilStore } from '../store/councilStore';
import { ChartDisplay } from './ChartDisplay';

const CONFIDENCE_STYLES: Record<Confidence, { bg: string; text: string; label: string }> = {
  low: { bg: 'bg-red-100', text: 'text-red-700', label: '低' },
  mid: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '中' },
  high: { bg: 'bg-green-100', text: 'text-green-700', label: '高' },
};

interface CardDetailModalProps {
  card: EvidenceCard;
  agentName: string;
  onClose: () => void;
}

function CardDetailModal({ card, agentName, onClose }: CardDetailModalProps) {
  const confidenceStyle = CONFIDENCE_STYLES[card.confidence];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold text-lg">{card.claim}</h3>
              <p className="text-sm text-gray-500 mt-1">by {agentName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Chart */}
          {card.chart_spec && (
            <div className="bg-gray-50 rounded-lg p-4">
              <ChartDisplay spec={card.chart_spec} height={250} />
            </div>
          )}

          {/* Metrics */}
          {card.metrics.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm mb-2">指標</h4>
              <div className="grid grid-cols-2 gap-2">
                {card.metrics.map((metric, i) => (
                  <div
                    key={i}
                    className="bg-gray-50 rounded p-2"
                  >
                    <p className="text-xs text-gray-500">{metric.name}</p>
                    <p className="font-semibold">
                      {typeof metric.value === 'number'
                        ? metric.value.toLocaleString()
                        : metric.value}
                      {metric.unit && (
                        <span className="text-xs text-gray-500 ml-1">
                          {metric.unit}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Method */}
          <div>
            <h4 className="font-semibold text-sm mb-1">分析手法</h4>
            <p className="text-sm text-gray-600">{card.method}</p>
          </div>

          {/* Segment */}
          <div>
            <h4 className="font-semibold text-sm mb-1">対象セグメント</h4>
            <p className="text-sm text-gray-600">{card.segment_def}</p>
          </div>

          {/* Timeframe */}
          <div>
            <h4 className="font-semibold text-sm mb-1">分析期間</h4>
            <p className="text-sm text-gray-600">
              {card.timeframe.from} 〜 {card.timeframe.to}
            </p>
          </div>

          {/* Query fingerprint */}
          <div>
            <h4 className="font-semibold text-sm mb-1">クエリ参照</h4>
            <code className="text-xs bg-gray-100 px-2 py-1 rounded block overflow-x-auto">
              {card.query_fingerprint}
            </code>
          </div>

          {/* Confidence & Caveats */}
          <div className="flex items-start gap-4">
            <div>
              <h4 className="font-semibold text-sm mb-1">信頼度</h4>
              <span
                className={`px-2 py-1 rounded text-xs font-semibold ${confidenceStyle.bg} ${confidenceStyle.text}`}
              >
                {confidenceStyle.label}
              </span>
            </div>
            {card.caveats.length > 0 && (
              <div className="flex-1">
                <h4 className="font-semibold text-sm mb-1">注意事項</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                  {card.caveats.map((caveat, i) => (
                    <li key={i}>• {caveat}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface CardThumbnailProps {
  card: EvidenceCard;
  agentName: string;
  onClick: () => void;
}

function CardThumbnail({ card, agentName, onClick }: CardThumbnailProps) {
  const confidenceStyle = CONFIDENCE_STYLES[card.confidence];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-3 cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      {/* Mini chart preview */}
      {card.chart_spec && (
        <div className="h-24 mb-2 bg-gray-50 rounded overflow-hidden">
          <ChartDisplay spec={card.chart_spec} height={96} />
        </div>
      )}

      {/* Claim */}
      <p className="text-sm font-medium line-clamp-2 mb-2">{card.claim}</p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 truncate max-w-[60%]">
          {agentName}
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-xs ${confidenceStyle.bg} ${confidenceStyle.text}`}
        >
          {confidenceStyle.label}
        </span>
      </div>
    </motion.div>
  );
}

export function CardPanel() {
  const session = useCouncilStore((s) => s.session);
  const [selectedCard, setSelectedCard] = useState<EvidenceCard | null>(null);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>エビデンスカードなし</p>
      </div>
    );
  }

  const getAgentName = (agentId: string): string => {
    const agent = session.agents.find((a) => a.id === agentId);
    return agent?.name || agentId;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span>📊</span>
          <span>エビデンスカード</span>
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          クリックで詳細表示
        </p>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {session.cards.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <p className="text-3xl mb-2">📭</p>
            <p>カードはまだありません</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <AnimatePresence>
              {session.cards.map((card) => (
                <CardThumbnail
                  key={card.id}
                  card={card}
                  agentName={getAgentName(card.author_agent)}
                  onClick={() => setSelectedCard(card)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedCard && (
          <CardDetailModal
            card={selectedCard}
            agentName={getAgentName(selectedCard.author_agent)}
            onClose={() => setSelectedCard(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
