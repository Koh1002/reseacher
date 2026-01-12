// =============================================
// Timeline Panel Component
// =============================================

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Message, MessageType } from '../types';
import { useCouncilStore } from '../store/councilStore';

const MESSAGE_TYPE_STYLES: Record<
  MessageType,
  { bg: string; border: string; icon: string }
> = {
  proposal: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: '💡',
  },
  question: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: '❓',
  },
  critique: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: '⚠️',
  },
  support: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: '✅',
  },
  decision: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: '⚖️',
  },
  summary: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    icon: '📋',
  },
  system: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: '🔔',
  },
};

interface MessageCardProps {
  message: Message;
  agentName: string;
}

function MessageCard({ message, agentName }: MessageCardProps) {
  const style = MESSAGE_TYPE_STYLES[message.type];
  const time = new Date(message.ts).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className={`p-3 rounded-lg border ${style.bg} ${style.border} shadow-sm`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">{agentName}</span>
            <span className="text-xs text-gray-400">{time}</span>
          </div>
          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
            {message.content}
          </p>
          {message.ref_cards && message.ref_cards.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {message.ref_cards.map((cardId) => (
                <span
                  key={cardId}
                  className="px-2 py-0.5 bg-white rounded text-xs text-gray-500 border"
                >
                  📊 {cardId.substring(0, 6)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function TimelinePanel() {
  const session = useCouncilStore((s) => s.session);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages.length]);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="text-4xl mb-4">🏛️</p>
          <p>分析テーマを入力して</p>
          <p>議会を開始してください</p>
        </div>
      </div>
    );
  }

  const getAgentName = (speakerId: string): string => {
    if (speakerId === 'system') return 'システム';
    const agent = session.agents.find((a) => a.id === speakerId);
    return agent?.name || speakerId;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span>📜</span>
          <span>議会タイムライン</span>
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          テーマ: {session.topic}
        </p>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50"
      >
        <AnimatePresence mode="popLayout">
          {session.messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              agentName={getAgentName(message.speaker)}
            />
          ))}
        </AnimatePresence>

        {session.messages.length === 0 && (
          <div className="text-center text-gray-400 py-8">
            <p>メッセージはまだありません</p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="p-3 border-t border-gray-200 bg-white">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>状態: {session.state}</span>
          <span>{session.messages.length} メッセージ</span>
        </div>
      </div>
    </div>
  );
}
