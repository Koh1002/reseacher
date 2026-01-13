// =============================================
// API Key Input Component
// =============================================

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCouncilStore } from '../store/councilStore';

interface APIKeyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  color: string;
}

function APIKeyField({ label, value, onChange, placeholder, color }: APIKeyFieldProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        {label}
        {value && (
          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
            設定済み
          </span>
        )}
      </label>
      <div className="relative">
        <input
          type={showKey ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-3 py-2 pr-20 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <button
          type="button"
          onClick={() => setShowKey(!showKey)}
          className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {showKey ? '隠す' : '表示'}
        </button>
      </div>
    </div>
  );
}

export function APIKeyInput() {
  const { apiKeys, setAPIKeys, clearAPIKeys, config } = useCouncilStore();
  const [isExpanded, setIsExpanded] = useState(!apiKeys.openai && !apiKeys.anthropic && !apiKeys.google);

  const hasAnyKey = apiKeys.openai || apiKeys.anthropic || apiKeys.google;
  const keyCount = [apiKeys.openai, apiKeys.anthropic, apiKeys.google].filter(Boolean).length;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white hover:from-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🔑</span>
          <div className="text-left">
            <h3 className="font-semibold text-gray-800">API キー設定</h3>
            <p className="text-xs text-gray-500">
              {hasAnyKey
                ? `${keyCount}個のAPIキーが設定されています (${config.mode}モード)`
                : 'APIキーを入力すると生成AIを使用します'}
            </p>
          </div>
        </div>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          className="text-gray-400"
        >
          ▼
        </motion.span>
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4 border-t border-gray-100">
              {/* Info box */}
              <div className="bg-blue-50 text-blue-700 text-xs p-3 rounded-lg">
                <p className="font-medium mb-1">使用方法:</p>
                <ul className="space-y-1 ml-4 list-disc">
                  <li>1つ以上のAPIキーを入力すると、生成AIが分析と議論を行います</li>
                  <li>複数のAPIキーを入力すると、各アナリストにランダムに割り当てられます</li>
                  <li>APIキーはローカルに保存され、サーバーには送信されません</li>
                </ul>
              </div>

              {/* API Key inputs */}
              <div className="space-y-3">
                <APIKeyField
                  label="OpenAI (GPT-4)"
                  value={apiKeys.openai}
                  onChange={(value) => setAPIKeys({ openai: value })}
                  placeholder="sk-..."
                  color="#10a37f"
                />

                <APIKeyField
                  label="Anthropic (Claude)"
                  value={apiKeys.anthropic}
                  onChange={(value) => setAPIKeys({ anthropic: value })}
                  placeholder="sk-ant-..."
                  color="#d97706"
                />

                <APIKeyField
                  label="Google (Gemini)"
                  value={apiKeys.google}
                  onChange={(value) => setAPIKeys({ google: value })}
                  placeholder="AIza..."
                  color="#4285f4"
                />
              </div>

              {/* Actions */}
              {hasAnyKey && (
                <div className="flex justify-end">
                  <button
                    onClick={clearAPIKeys}
                    className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    全てクリア
                  </button>
                </div>
              )}

              {/* Provider indicator */}
              {hasAnyKey && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">使用するプロバイダー:</p>
                  <div className="flex gap-2">
                    {apiKeys.openai && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        OpenAI
                      </span>
                    )}
                    {apiKeys.anthropic && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-500" />
                        Anthropic
                      </span>
                    )}
                    {apiKeys.google && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Google
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
