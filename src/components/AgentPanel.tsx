// =============================================
// Agent Panel Component
// =============================================

import { motion } from 'framer-motion';
import type { Agent, AgentStatus } from '../types';
import { useCouncilStore } from '../store/councilStore';

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: 'bg-gray-400',
  planning: 'bg-yellow-400',
  analyzing: 'bg-blue-400',
  discussing: 'bg-purple-400',
  waiting: 'bg-orange-400',
  done: 'bg-green-400',
  error: 'bg-red-400',
};

const STATUS_LABELS: Record<AgentStatus, string> = {
  idle: '待機中',
  planning: '計画中',
  analyzing: '分析中',
  discussing: '議論中',
  waiting: '待機',
  done: '完了',
  error: 'エラー',
};

const ROLE_ICONS: Record<string, string> = {
  chair: '👔',
  growth_analyst: '📈',
  segment_analyst: '👥',
  basket_analyst: '🛒',
  seasonality_analyst: '📅',
  price_analyst: '💰',
};

const PROVIDER_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  openai: { bg: 'bg-green-100', text: 'text-green-700', label: 'GPT' },
  anthropic: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Claude' },
  google: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Gemini' },
};

interface AgentCardProps {
  agent: Agent;
  provider?: string;
}

function AgentCard({ agent, provider }: AgentCardProps) {
  const isActive = agent.status !== 'idle' && agent.status !== 'done';
  const providerStyle = provider ? PROVIDER_COLORS[provider] : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`p-3 rounded-lg border ${
        isActive ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'
      } shadow-sm`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{ROLE_ICONS[agent.role] || '🤖'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
            {providerStyle && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${providerStyle.bg} ${providerStyle.text}`}>
                {providerStyle.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status]} ${
                isActive ? 'animate-pulse' : ''
              }`}
            />
            <span className="text-xs text-gray-500">{STATUS_LABELS[agent.status]}</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {isActive && (
        <div className="mt-2">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-blue-500"
              initial={{ width: 0 }}
              animate={{ width: `${agent.progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-2 flex gap-3 text-xs text-gray-500">
        <span>📊 {agent.cards_submitted}</span>
        <span>💬 {agent.messages_sent}</span>
      </div>

      {/* Current task */}
      {agent.current_task && (
        <p className="mt-2 text-xs text-gray-600 italic truncate">{agent.current_task}</p>
      )}
    </motion.div>
  );
}

export function AgentPanel() {
  const session = useCouncilStore((s) => s.session);
  const agentLLMAssignments = useCouncilStore((s) => s.agentLLMAssignments);
  const config = useCouncilStore((s) => s.config);

  if (!session) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>セッション未開始</p>
      </div>
    );
  }

  const chair = session.agents.find((a) => a.role === 'chair');
  const analysts = session.agents.filter((a) => a.role !== 'chair');

  const getProvider = (agentId: string): string | undefined => {
    return agentLLMAssignments.get(agentId);
  };

  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span>🏛️</span>
        <span>議会メンバー</span>
      </h2>

      {/* Mode indicator */}
      <div className={`mb-3 px-3 py-1.5 rounded-lg text-xs font-medium ${
        config.mode === 'DEV' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
      }`}>
        {config.mode === 'DEV' ? '🤖 生成AIモード' : '📊 デモモード'}
      </div>

      {/* Chair */}
      {chair && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">
            議長
          </h3>
          <AgentCard agent={chair} provider={getProvider(chair.id)} />
        </div>
      )}

      {/* Analysts */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase">
          アナリスト
        </h3>
        <div className="space-y-2">
          {analysts.map((agent) => (
            <AgentCard key={agent.id} agent={agent} provider={getProvider(agent.id)} />
          ))}
        </div>
      </div>

      {/* Session info */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 space-y-1">
          <p>ラウンド: {session.round} / {session.max_rounds}</p>
          <p>論点: {session.issues.length}件</p>
          <p>カード: {session.cards.length}件</p>
        </div>
      </div>
    </div>
  );
}
